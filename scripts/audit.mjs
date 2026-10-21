/**
 * Precise per-scene visibility audit.
 *
 * For each scene: is its copy ever at full opacity while the scene is
 * pinned? Is there a gap BETWEEN consecutive scenes where no copy shows?
 * The film/CTA sections are not scenes and are excluded from the gap test.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function findChromium() {
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  const dirs = fs
    .readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of dirs) {
    const p = path.join(
      root,
      d,
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    )
    if (fs.existsSync(p)) return p
  }
  return undefined
}

const scrollTo = (y) =>
  window.__dispersion?.lenis
    ? window.__dispersion.lenis.scrollTo(y, { immediate: true })
    : window.scrollTo({ top: y, behavior: 'instant' })

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const enter = await page.$('[data-enter]')
if (enter) { await enter.click(); await page.waitForTimeout(1000) }

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

// scene boundaries
const bounds = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.scene')).map((s) => ({
    id: s.dataset.id,
    top: s.offsetTop,
    bottom: s.offsetTop + s.offsetHeight,
  })),
)
console.log('SCENES', JSON.stringify(bounds.map((b) => b.id)))

const STEPS = 320
const maxPerScene = new Array(bounds.length).fill(0)
const gapRanges = []
let inGap = false
let gapStart = 0
let worstOverlap = 0
let worstOverlapAt = 0
let cropped = 0

for (let i = 0; i <= STEPS; i++) {
  const y = Math.round((total * i) / STEPS)
  await page.evaluate(scrollTo, y)
  await page.waitForTimeout(35)

  const r = await page.evaluate(() => {
    const vh = window.innerHeight
    // the copy lives in the fixed overlay; each slot is one scene
    const slots = Array.from(document.querySelectorAll('.copy-slot'))
    const info = slots.map((s) => {
      const copy = s.querySelector('.scene__copy')
      const spec = s.querySelector('.spectrum')
      const target = spec ?? copy
      if (!target) return { o: 0, inView: false, cropped: false, rect: null }
      const rect = target.getBoundingClientRect()
      const o = parseFloat(getComputedStyle(s).opacity)
      const inView = rect.bottom > 0 && rect.top < vh
      // cropped: visible but cut by the frame
      const cut = inView && (rect.top < -4 || rect.bottom > vh + 4)
      return { o: inView ? o : 0, inView, cropped: cut, rect: { t: rect.top, b: rect.bottom } }
    })
    return {
      info,
      sum: info.reduce((a, b) => a + b.o, 0),
      // is this scroll position inside a scene section at all?
      inSceneSection: Array.from(document.querySelectorAll('.scene')).some((s) => {
        const t = s.offsetTop
        return window.scrollY + vh * 0.5 >= t && window.scrollY + vh * 0.5 < t + s.offsetHeight
      }),
    }
  })

  if (r.sum > worstOverlap) { worstOverlap = r.sum; worstOverlapAt = y }
  if (r.info.some((x) => x.cropped)) cropped++

  r.info.forEach((x, k) => {
    if (x.o > maxPerScene[k]) maxPerScene[k] = x.o
  })

  const anyVisible = r.info.some((x) => x.o > 0.25)
  // the reel + CTA sections legitimately have no overlay copy
  if (r.inSceneSection && !anyVisible) {
    if (!inGap) { inGap = true; gapStart = y }
  } else if (inGap) {
    inGap = false
    gapRanges.push([gapStart, y])
  }
}
if (inGap) gapRanges.push([gapStart, total])

console.log('MAX_OPACITY_PER_SCENE', JSON.stringify(maxPerScene))
console.log('GAPS_INSIDE_SCENES', gapRanges.length, JSON.stringify(gapRanges.slice(0, 6)))
console.log('WORST_OVERLAP_SUM', worstOverlap.toFixed(3), 'at y', worstOverlapAt)
console.log('CROPPED_FRAMES', cropped, '/', STEPS + 1)

await browser.close()
