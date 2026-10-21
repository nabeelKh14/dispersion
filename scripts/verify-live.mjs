/**
 * Verify the LIVE deployment — not the local build.
 * HTTP 200 is not render evidence: assert on the mounted DOM at the alias.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const URL = process.argv[2] || 'https://dispersion-two.vercel.app'
const OUT = '/Users/openclaw/.hermes/cache/scratch/disp_live'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

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

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText))

const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
console.log('STATUS', resp?.status())
console.log('CACHE_HDR', resp?.headers()['x-vercel-cache'] ?? 'n/a')

await page.waitForTimeout(3000)

// ── the asset hash the LIVE html references, vs our local build ──
const liveAssets = await page.evaluate(() =>
  Array.from(document.querySelectorAll('script[src],link[rel=stylesheet]'))
    .map((e) => e.getAttribute('src') || e.getAttribute('href'))
    .filter(Boolean),
)
console.log('LIVE_ASSETS', JSON.stringify(liveAssets, null, 1))

// ── mounted DOM assertions ──
const dom = await page.evaluate(() => {
  const c = document.getElementById('stage')
  const gl = c ? c.getContext('webgl2') || c.getContext('webgl') : null
  const overlay = document.querySelector('.overlay')
  return {
    title: document.title,
    canvasExists: !!c,
    canvasSize: c ? [c.width, c.height] : null,
    glContext: !!gl,
    glLost: gl ? gl.isContextLost() : null,
    overlaySlots: document.querySelectorAll('.copy-slot').length,
    slotVisible: Array.from(document.querySelectorAll('.copy-slot')).map(
      (s) => parseFloat(getComputedStyle(s).opacity).toFixed(2),
    ),
    overlayExists: !!overlay,
    headline: document.querySelector('.scene__headline')?.textContent?.trim().slice(0, 40),
    eyebrow: document.querySelector('.scene__eyebrow')?.textContent?.trim().slice(0, 40),
    proofRows: document.querySelectorAll('.proof__row').length,
    spectrumCells: document.querySelectorAll('.spectrum__cell').length,
    film: !!document.getElementById('film'),
    cta: !!document.getElementById('contact'),
    footer: document.querySelector('.footer')?.textContent?.trim().slice(0, 90),
    docHeight: document.documentElement.scrollHeight,
  }
})
console.log('DOM', JSON.stringify(dom, null, 1))

// enter + walk the live journey
const enter = await page.$('[data-enter]')
if (enter) { await enter.click(); await page.waitForTimeout(1500) }

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
for (const [i, p] of [0, 0.2, 0.42, 0.62, 0.8, 0.95].entries()) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(total * p))
  await page.waitForTimeout(1100)
  await page.screenshot({ path: `${OUT}/live${i}.png` })
}

// video on the LIVE url
const vid = await page.evaluate(() => {
  const v = document.querySelector('[data-film]')
  return v ? { rs: v.readyState, dur: v.duration, paused: v.paused, w: v.videoWidth, h: v.videoHeight, src: v.currentSrc } : null
})
console.log('VIDEO', JSON.stringify(vid))

// pixel evidence: is the canvas actually drawing?
const px = await page.evaluate(() => {
  const c = document.getElementById('stage')
  const gl = c.getContext('webgl2')
  if (!gl) return null
  const buf = new Uint8Array(4 * 64 * 64)
  gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, buf)
  let sum = 0
  let max = 0
  for (let i = 0; i < buf.length; i += 4) {
    const l = buf[i] + buf[i + 1] + buf[i + 2]
    sum += l
    if (l > max) max = l
  }
  return { avgLuma: (sum / (64 * 64 * 3)).toFixed(2), maxLuma: max }
})
console.log('PIXELS', JSON.stringify(px))

console.log('ERRORS', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
await browser.close()
