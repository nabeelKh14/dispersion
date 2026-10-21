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

const OUT = '/Users/openclaw/.hermes/cache/scratch/disp_shots2'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const enter = await page.$('[data-enter]')
if (enter) { await enter.click(); await page.waitForTimeout(1400) }

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
console.log('SCROLL_HEIGHT', total)

// walk the whole page in fine steps and capture each scene
const stops = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.95, 1.0]
for (let i = 0; i < stops.length; i++) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(total * stops[i]))
  await page.waitForTimeout(1300)
  await page.screenshot({ path: `${OUT}/s${String(i).padStart(2, '0')}.png` })
}

// the film section specifically
const filmTop = await page.evaluate(() => document.getElementById('film')?.offsetTop ?? -1)
if (filmTop > 0) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), filmTop + 200)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/film.png` })
  const v = await page.evaluate(() => {
    const el = document.querySelector('[data-film]')
    return el ? { src: el.currentSrc?.split('/').pop(), readyState: el.readyState, dur: el.duration, paused: el.paused, w: el.videoWidth, h: el.videoHeight } : null
  })
  console.log('VIDEO', JSON.stringify(v))
}

const diag = await page.evaluate(() => {
  const c = document.getElementById('stage')
  const gl = c.getContext('webgl2')
  return {
    scenes: document.querySelectorAll('.scene').length,
    film: !!document.getElementById('film'),
    cta: !!document.getElementById('contact'),
    glLost: gl ? gl.isContextLost() : 'n/a',
    docHeight: document.documentElement.scrollHeight,
  }
})
console.log('DIAG', JSON.stringify(diag))
console.log('ERRORS', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : 'none')
await browser.close()
