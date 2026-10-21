/**
 * Measure the light path with pixels instead of inference.
 *
 * Sample along the horizontal axis at the prism's mid-height and report
 * where the bright (lit) pixels are. A continuous optical path shows as a
 * run of bright samples from the beam source through the prism and out
 * along the fan.
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

const OUT = '/Users/openclaw/.hermes/cache/scratch/disp_path'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
const enter = await page.$('[data-enter]')
if (enter) { await enter.click(); await page.waitForTimeout(1200) }

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
// act 2 — the refraction
await page.evaluate(scrollTo, Math.round(total * 0.3))
await page.waitForTimeout(1600)

// hide the DOM chrome so the measurement is of the 3D scene only
await page.addStyleTag({
  content: '.overlay,.chrome,.journey{opacity:0 !important;visibility:hidden !important}',
})
await page.waitForTimeout(400)

const canvas = await page.$('#stage')
await canvas.screenshot({ path: `${OUT}/act2.png` })
console.log('ACTIVE_SCENE', await page.evaluate(() => {
  const s = Array.from(document.querySelectorAll('.copy-slot'))
  const live = s.findIndex((x) => parseFloat(getComputedStyle(x).opacity) > 0.5)
  return s[live]?.querySelector('.scene__eyebrow')?.textContent?.trim() ?? 'none'
}))

// Read the canvas pixels directly from the GL context is unreliable after
// the frame is presented, so analyse the SCREENSHOT instead.
const buf = fs.readFileSync(`${OUT}/act2.png`)
// use ffmpeg to dump raw RGB, then analyse in node
fs.writeFileSync(`${OUT}/act2.rgb`, '')
const { execSync } = await import('node:child_process')
execSync(
  `ffmpeg -y -i ${OUT}/act2.png -pix_fmt rgb24 -f rawvideo ${OUT}/act2.rgb 2>/dev/null`,
)
const W = 1600
const H = 900
console.log('RAW_SIZE', (await import('node:fs')).statSync(`${OUT}/act2.rgb`).size)
const raw = fs.readFileSync(`${OUT}/act2.rgb`)

// The prism in act 2 sits around x=-1.05 world; on screen it is roughly
// centred-left. Find the brightest horizontal band in the middle third.
function luma(x, y) {
  const i = (y * W + x) * 3
  return 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2]
}

// Measure along a horizontal scanline band that contains the light path
// (the prism's height) and report the profile. The background haze is
// dim on this band; the beam and the fan are not.
const bandTop = Math.floor(H * 0.34)
const bandBot = Math.floor(H * 0.52)
const rows = []
for (let y = bandTop; y < bandBot; y++) rows.push(y)

const colMax = []
for (let x = 0; x < W; x += 4) {
  let m = 0
  for (const y of rows) {
    const l = luma(x, y)
    if (l > m) m = l
  }
  colMax.push({ x, m })
}

// Threshold: a lit pixel path
// report the distribution so the threshold is chosen from evidence
const vals = colMax.map((c) => c.m).sort((a, b) => a - b)
const pct = (p) => vals[Math.floor((vals.length - 1) * (p / 100))]
console.log(
  'LUMA_DISTRIBUTION',
  JSON.stringify({
    p10: pct(10).toFixed(1),
    p50: pct(50).toFixed(1),
    p75: pct(75).toFixed(1),
    p90: pct(90).toFixed(1),
    p97: pct(97).toFixed(1),
    max: vals[vals.length - 1].toFixed(1),
  }),
)

// threshold: the background on this band is dim, so a fixed cut works
const THRESH = 120
const lit = colMax.filter((c) => c.m > THRESH).map((c) => c.x)

// Find the longest run of contiguous lit columns (allowing small gaps)
let best = { len: 0, from: 0, to: 0 }
let runStart = -1
let last = -99
for (const x of lit) {
  if (x - last > 24) {
    if (runStart >= 0 && last - runStart > best.len) best = { len: last - runStart, from: runStart, to: last }
    runStart = x
  }
  last = x
}
if (runStart >= 0 && last - runStart > best.len) best = { len: last - runStart, from: runStart, to: last }

console.log('LIT_COLUMNS', lit.length, 'of', colMax.length)
console.log('LONGEST_LIT_RUN', JSON.stringify(best))
console.log('SPAN_PCT', best.len ? (((best.to - best.from) / W) * 100).toFixed(1) : '0')

// coverage profile, bucketed
const BUCKETS = 16
const bucket = new Array(BUCKETS).fill(0)
const counts = new Array(BUCKETS).fill(0)
for (const c of colMax) {
  const b = Math.min(BUCKETS - 1, Math.floor((c.x / W) * BUCKETS))
  counts[b]++
  if (c.m > THRESH) bucket[b]++
}
console.log('PROFILE', bucket.map((v, i) => `${String(Math.round((v / counts[i]) * 100)).padStart(3)}%`).join(' '))
console.log('  (16 buckets, left to right — % of sampled columns lit)')

// peak luma per bucket shows where the energy actually is
const peak = new Array(BUCKETS).fill(0)
for (const c of colMax) {
  const b = Math.min(BUCKETS - 1, Math.floor((c.x / W) * BUCKETS))
  if (c.m > peak[b]) peak[b] = c.m
}
console.log('PEAKS', peak.map((v) => v.toFixed(0).padStart(4)).join(' '))
console.log('  (peak luma per bucket, left to right)')

// the full scanline profile — the shape of the path, read directly
console.log('SCANLINE (64 buckets, left to right, peak luma 0-255):')
const SB = 64
const sb = new Array(SB).fill(0)
for (const c of colMax) {
  const b = Math.min(SB - 1, Math.floor((c.x / W) * SB))
  if (c.m > sb[b]) sb[b] = c.m
}
console.log(sb.map((v) => v.toFixed(0).padStart(4)).join(''))

await browser.close()
