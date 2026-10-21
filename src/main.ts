import '@fontsource-variable/archivo'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import './styles/main.css'
import './styles/film.css'

import Lenis from 'lenis'
import { World } from './scene/world'
import { UI } from './ui/ui'
import { Ambience } from './audio/ambience'

/* ═══════════════ boot ═══════════════ */

const canvas = document.getElementById('stage') as HTMLCanvasElement
const preloader = document.getElementById('preloader')!
const pctEl = document.querySelector('[data-preloader-pct]') as HTMLElement
const labelEl = document.querySelector('[data-preloader-label]') as HTMLElement
const enterBtn = document.querySelector('[data-enter]') as HTMLButtonElement
const soundBtn = document.querySelector('[data-sound]') as HTMLButtonElement
const soundLabel = document.querySelector('[data-sound-label]') as HTMLElement
const fallback = document.querySelector('[data-fallback]') as HTMLElement

const STEPS = [
  'CALIBRATING REFRACTIVE INDEX',
  'BUILDING ENVIRONMENT PROBE',
  'SEEDING PHOTON FIELD',
  'COMPILING SHADERS',
  'READY',
]

let world: World | null = null
let ui: UI | null = null
const ambience = new Ambience()

function setProgress(p: number, step: number) {
  pctEl.textContent = String(Math.round(p * 100)).padStart(2, '0')
  labelEl.textContent = STEPS[Math.min(step, STEPS.length - 1)]
}

async function boot() {
  setProgress(0.05, 0)
  await frame()

  try {
    world = new World(canvas)
    setProgress(0.55, 1)
    await frame()

    ui = new UI()
    setProgress(0.8, 2)
    await frame()

    // warm the shader cache so the first scroll is smooth
    world.resize()
    world.update()
    setProgress(0.95, 3)
    await frame()

    setProgress(1, 4)
    enterBtn.hidden = false
  } catch (err) {
    console.error('[dispersion] boot failed', err)
    fallback.hidden = false
    setProgress(100, 4)
    enterBtn.hidden = false
  }
}

function frame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()))
}

/* ═══════════════ scroll ═══════════════ */

const lenis = new Lenis({
  duration: 1.35,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  wheelMultiplier: 1,
  touchMultiplier: 1.6,
})

let lastScroll = 0
let scrollVelocity = 0

/** Drive the whole experience from the render loop, reading real scroll
 *  position. This stays correct for native scrolls, anchor jumps, keyboard
 *  paging and programmatic scrolling alike — not just Lenis' own events. */
function syncScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const scroll = window.scrollY
  const progress = max > 0 ? Math.min(1, Math.max(0, scroll / max)) : 0
  scrollVelocity = Math.min(1, Math.abs(scroll - lastScroll) / 40)
  lastScroll = scroll
  world?.setProgress(progress)
  ui?.update(progress)
}

/* ═══════════════ loop ═══════════════ */

function tick(time: number) {
  lenis.raf(time)
  syncScroll()
  world?.update()
  if (world) {
    const e = currentEnergy()
    ambience.update(scrollVelocity, e)
    scrollVelocity *= 0.9
  }
  requestAnimationFrame(tick)
}

function currentEnergy() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const p = max > 0 ? window.scrollY / max : 0
  // energy peaks in the middle acts
  return Math.sin(Math.min(1, p) * Math.PI) * 0.85 + 0.15
}

/* ═══════════════ chrome ═══════════════ */

soundBtn.addEventListener('click', async () => {
  if (!ambience.isMuted) {
    ambience.toggle()
    soundBtn.setAttribute('aria-pressed', 'false')
    soundLabel.textContent = 'SOUND OFF'
    return
  }
  await ambience.start()
  ambience.toggle()
  soundBtn.setAttribute('aria-pressed', 'true')
  soundLabel.textContent = 'SOUND ON'
})

enterBtn.addEventListener('click', () => {
  preloader.classList.add('is-gone')
  lenis.scrollTo(0, { immediate: true })
  requestAnimationFrame(() => {
    lenis.scrollTo(window.innerHeight * 0.02, { duration: 2.4 })
  })
})

window.addEventListener('resize', () => {
  world?.resize()
})

/* ═══════════════ go ═══════════════ */

requestAnimationFrame(tick)
boot()

// expose for debugging
;(window as any).__dispersion = { get world() { return world }, get ui() { return ui } }
