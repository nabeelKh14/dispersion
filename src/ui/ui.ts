import { SCENES, WAVELENGTHS, type Scene } from '../data/scenes'

/* ═══════════════ content ═══════════════ */

const PROOF_ROWS: [string, string, 'up' | 'down'][] = [
  ['2023', '+31.4%', 'up'],
  ['2024', '+18.9%', 'up'],
  ['2025', '+22.6%', 'up'],
  ['2026 YTD', '+9.2%', 'up'],
  ['WORST MONTH', '−4.1%', 'down'],
  ['WORST DAY', '−1.8%', 'down'],
  ['MAX DRAWDOWN', '−7.3%', 'down'],
  ['SHARPE', '2.31', 'up'],
  ['PROFIT FACTOR', '1.87', 'up'],
  ['AVG HOLD', '11.4 HRS', 'up'],
  ['CAPTURATION', '62%', 'up'],
  ['VENUES', '11', 'up'],
]

function copyMarkup(s: Scene) {
  const isSpectrum = s.id === 'spectrum'

  const spectrum = isSpectrum
    ? `<div class="spectrum" data-spectrum>
        ${WAVELENGTHS.map(
          (w, k) => `
          <div class="spectrum__cell" style="--w:${w.hex}">
            <span class="spectrum__name">${w.name}</span>
            <span class="spectrum__bar"><i data-bar="${k}"></i></span>
            <span class="spectrum__val" data-val="${k}">${w.price}</span>
          </div>`,
        ).join('')}
       </div>`
    : ''

  const proof =
    s.id === 'proof'
      ? `<div class="proof">
          ${PROOF_ROWS.map(
            ([k, v, dir]) => `<div class="proof__row is-${dir}"><span>${k}</span><b>${v}</b></div>`,
          ).join('')}
         </div>
         <p class="proof__note">
           Illustrative figures shown to demonstrate the interface. Dispersion
           is a fictional product and these are not real results.
         </p>`
      : ''

  return `
  <div class="scene__copy">
    <span class="scene__eyebrow">${s.eyebrow}</span>
    <h2 class="scene__headline">${s.headline}</h2>
    ${s.sub ? `<p class="scene__sub">${s.sub}</p>` : ''}
    ${s.body ? `<p class="scene__body">${s.body}</p>` : ''}
    ${
      s.stat
        ? `<div class="scene__stat">
             <span class="scene__stat-value">${s.stat.value}</span>
             <span class="scene__stat-label">${s.stat.label}</span>
           </div>`
        : ''
    }
    ${proof}
  </div>
  ${spectrum}`
}

function filmMarkup() {
  return `
  <section class="film" id="film">
    <div class="film__sticky">
      <div class="film__frame">
        <video
          class="film__video"
          data-film
          poster="/video/film-poster.jpg"
          src="/video/dispersion-reel.mp4"
          playsinline
          muted
          loop
          preload="auto"
        ></video>
        <div class="film__veil" data-film-veil></div>
        <button class="film__play" data-film-play aria-label="Play the dispersion reel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
          <span>PLAY THE REEL</span>
        </button>
        <div class="film__meta">
          <span>REEL 001 — DISPERSION</span>
          <span class="film__bar"><i data-film-bar></i></span>
          <span data-film-time>00:00</span>
        </div>
      </div>
      <div class="film__copy">
        <span class="scene__eyebrow">ACT VII — THE REEL</span>
        <h2 class="film__title">THE WHOLE JOURNEY<br>IN ONE PASS</h2>
        <p class="scene__body">
          One input, seven outputs, and the moment the fan folds back into a
          single order. The same scene you have been scrolling through, cut
          as a continuous take.
        </p>
      </div>
    </div>
  </section>`
}

function ctaMarkup() {
  return `
  <section class="cta" id="contact">
    <span class="scene__eyebrow">PRISMA AI — DISPERSION</span>
    <h2 class="cta__title">SEE THE WHOLE<br>SPECTRUM</h2>
    <p class="cta__sub">
      A concept experience built by PrismAI. Dispersion is not yet a live
      product — this is what the interface will feel like when it is.
    </p>
    <div class="cta__actions">
      <a class="btn btn--solid" href="mailto:dispersion@prismai.ai">GET IN TOUCH</a>
      <a class="btn" href="#proof">READ THE RECORD</a>
    </div>
  </section>
  <footer class="footer">
    <span>© 2026 PRISMA AI — DISPERSION</span>
    <span>FICTIONAL PRODUCT · FIGURES ARE ILLUSTRATIVE · NOT INVESTMENT ADVICE</span>
    <a href="mailto:dispersion@prismai.ai">DISPERSION@PRISMAI.AI</a>
  </footer>`
}

/* ═══════════════ helpers ═══════════════ */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** Smooth 0→1 ramp with soft ends. */
function smooth01(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/* ═══════════════ UI controller ═══════════════ */

export class UI {
  /** scroll spacers — they define the rhythm, they hold no visible content */
  private spacers: HTMLElement[] = []
  /** the fixed copy overlay — one slot per scene */
  private slots: HTMLElement[] = []
  private railFill!: HTMLElement
  private railCount!: HTMLElement
  private scrollCue!: HTMLElement
  private activeIndex = -1
  private bars: HTMLElement[] = []
  private vals: HTMLElement[] = []
  private tickerTimer?: number
  private film?: HTMLVideoElement
  private filmBar?: HTMLElement
  private filmTime?: HTMLElement
  private filmVeil?: HTMLElement
  private filmPlay?: HTMLElement

  constructor() {
    const journey = document.getElementById('journey')!

    // spacers + film + CTA live in the normal flow
    journey.innerHTML =
      SCENES.map(
        (s, i) =>
          `<section class="scene scene--${s.id}" id="${s.id}" data-scene="${i}" data-id="${s.id}"></section>`,
      ).join('') +
      filmMarkup() +
      ctaMarkup()

    // The copy lives in a FIXED overlay. A copy pinned inside a scrolling
    // sticky block physically leaves the viewport before the next copy
    // arrives, which leaves a dead frame in the journey. Fixed slots that
    // cross-dissolve in place cannot have that problem.
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.setAttribute('aria-live', 'polite')
    overlay.innerHTML = SCENES.map(
      (s, i) =>
        `<div class="copy-slot copy-slot--${s.align}" data-slot="${i}">${copyMarkup(s)}</div>`,
    ).join('')
    document.body.appendChild(overlay)

    this.spacers = Array.from(journey.querySelectorAll<HTMLElement>('.scene'))
    this.slots = Array.from(overlay.querySelectorAll<HTMLElement>('.copy-slot'))
    this.railFill = document.querySelector('[data-rail-fill]')!
    this.railCount = document.querySelector('[data-rail-count]')!
    this.scrollCue = document.querySelector('.chrome__scroll')!
    this.bars = Array.from(document.querySelectorAll<HTMLElement>('[data-bar]'))
    this.vals = Array.from(document.querySelectorAll<HTMLElement>('[data-val]'))

    this.film = document.querySelector<HTMLVideoElement>('[data-film]') ?? undefined
    this.filmBar = document.querySelector('[data-film-bar]') ?? undefined
    this.filmTime = document.querySelector('[data-film-time]') ?? undefined
    this.filmVeil = document.querySelector('[data-film-veil]') ?? undefined
    this.filmPlay = document.querySelector('[data-film-play]') ?? undefined

    this.bindFilm()
  }

  /* ── the reel ── */
  private bindFilm() {
    if (!this.film) return
    const v = this.film

    v.addEventListener('timeupdate', () => {
      if (!this.filmBar || !this.filmTime) return
      const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0
      this.filmBar.style.width = `${pct.toFixed(1)}%`
      const s = Math.floor(v.currentTime)
      this.filmTime.textContent = `00:${String(s % 60).padStart(2, '0')}`
    })
    v.addEventListener('play', () => {
      this.filmPlay?.classList.add('is-hidden')
      this.filmVeil?.classList.add('is-hidden')
    })
    v.addEventListener('ended', () => {
      this.filmPlay?.classList.remove('is-hidden')
      this.filmVeil?.classList.remove('is-hidden')
    })

    this.filmPlay?.addEventListener('click', () => {
      v.currentTime = 0
      void v.play()
    })

    // If the stream is interrupted the poster stays on screen, so the
    // frame never renders empty.
    v.addEventListener('error', () => {
      v.classList.add('is-failed')
    })
    v.addEventListener('stalled', () => {
      /* the browser is re-requesting a range; the frame keeps the poster */
    })

    const attempt = () => {
      const p = v.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          /* autoplay blocked — the button stands in */
        })
      }
    }
    if (v.readyState >= 2) attempt()
    else v.addEventListener('canplay', attempt, { once: true })
  }

  /** @param progress 0..1 across the journey */
  update(progress: number) {
    this.railFill.style.height = `${(progress * 100).toFixed(2)}%`

    const vh = window.innerHeight
    const scrollY = window.scrollY
    const n = this.spacers.length

    // ── geometry ──
    // A spacer's copy is "held" while its sticky window is open, then hands
    // over to the next spacer. The outgoing and incoming curves are
    // complementary, so the sum of visible copy is always 1: no dead
    // frames, and never two panels competing.
    const pinEnd: number[] = []
    const fade: number[] = []
    for (let i = 0; i < n; i++) {
      const el = this.spacers[i]
      pinEnd.push(el.offsetTop + el.offsetHeight - vh)
      // the crossfade window between this scene and the next
      const next = i + 1 < n ? this.spacers[i + 1] : null
      fade.push(next ? (next.offsetTop + next.offsetHeight - vh - pinEnd[i]) * 0.62 : 0)
    }

    const filmTop = document.getElementById('film')?.offsetTop ?? Infinity

    let active = 0
    for (let i = 0; i < n; i++) {
      const slot = this.slots[i]
      if (!slot) continue

      const holdEnd = pinEnd[i]
      const prevPin = i === 0 ? null : pinEnd[i - 1]
      const prevFade = i === 0 ? 0 : fade[i - 1]

      let opacity: number
      if (prevPin !== null && scrollY >= prevPin && scrollY < prevPin + prevFade) {
        // FADE IN — the complementary half of the previous scene's exit
        opacity = smooth01((scrollY - prevPin) / Math.max(1, prevFade))
      } else if (
        (prevPin === null || scrollY >= prevPin + prevFade) &&
        scrollY <= holdEnd
      ) {
        // HOLD
        opacity = 1
      } else if (i < n - 1 && scrollY > holdEnd && scrollY < holdEnd + fade[i]) {
        // FADE OUT
        opacity = 1 - smooth01((scrollY - holdEnd) / Math.max(1, fade[i]))
      } else if (i === n - 1 && scrollY > holdEnd) {
        // the last scene holds until the reel takes the frame
        opacity = 1
      } else {
        opacity = 0
      }

      // the reel takes over the frame once it arrives
      if (scrollY > filmTop - vh * 0.3) opacity = 0

      slot.style.opacity = opacity.toFixed(3)
      slot.style.transform = `translate3d(0, ${((1 - opacity) * 24).toFixed(2)}px, 0)`
      slot.style.visibility = opacity < 0.004 ? 'hidden' : 'visible'
      if (opacity > 0.5) active = i
    }

    if (active !== this.activeIndex) {
      this.activeIndex = active
      // past the last act (reel / CTA) the rail holds the final act
      const past = scrollY > filmTop - vh * 0.3
      const shown = past ? n - 1 : active
      this.railCount.textContent = String(shown + 1).padStart(2, '0')
      this.scrollCue.classList.toggle('is-hidden', active > 0 || past)
      if (!past) this.applySceneAccent(active)
      this.onSceneChangeCb?.(active)
    }

    // the spectrum ticker runs while that scene holds the frame
    const spectrumLive = this.slots.some(
      (s, i) => i === 3 && parseFloat(s.style.opacity || '0') > 0.5,
    )
    if (spectrumLive) this.startTicker()
    else this.stopTicker()
  }

  private applySceneAccent(idx: number) {
    const scene = SCENES[idx]
    if (scene) {
      document.documentElement.style.setProperty('--accent', scene.accent)
      document.documentElement.style.setProperty('--key', scene.key)
    }
  }

  onSceneChangeCb?: (idx: number) => void

  private startTicker() {
    if (this.tickerTimer) return
    const tick = () => {
      this.bars.forEach((bar, i) => {
        const w = WAVELENGTHS[i]
        bar.style.width = `${(34 + Math.random() * 52).toFixed(0)}%`
        const val = this.vals[i]
        if (val) {
          val.textContent = (Number(w.price) * (0.985 + Math.random() * 0.03)).toFixed(2)
        }
      })
    }
    tick()
    this.tickerTimer = window.setInterval(tick, 900)
  }

  private stopTicker() {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer)
      this.tickerTimer = undefined
    }
  }
}
