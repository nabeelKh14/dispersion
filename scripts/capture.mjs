/**
 * Capture the live experience to video.
 *
 * Rather than rendering a separate animation, we record the actual site as
 * it runs — so the reel is guaranteed to match what a visitor sees.
 * Frames are grabbed from the real WebGL canvas, then encoded with ffmpeg.
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

const OUT = '/Users/openclaw/dispersion/blender/frames'
const URL = process.argv[2] || 'http://localhost:4173/'
const FRAMES = Number(process.argv[3] || 180)
const W = 1600
const H = 900

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

const enter = await page.$('[data-enter]')
if (enter) {
  await enter.click()
  await page.waitForTimeout(1500)
}

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

// Hold the scroll still at the very top for the opening title card.
await page.waitForTimeout(600)

for (let i = 0; i < FRAMES; i++) {
  const t = i / (FRAMES - 1)
  // ease the scroll so the motion accelerates and decelerates like a film
  const eased = t * t * (3 - 2 * t)
  await page.evaluate(scrollTo, Math.round(total * eased))
  await page.waitForTimeout(33)
  await page.screenshot({
    path: path.join(OUT, `f${String(i).padStart(4, '0')}.png`),
    clip: { x: 0, y: 0, width: W, height: H },
  })
  if (i % 20 === 0) console.log('frame', i, '/', FRAMES)
}

await browser.close()
console.log('CAPTURE_DONE', OUT)
