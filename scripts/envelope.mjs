/**
 * Verify the scroll envelope: at any scroll position, AT MOST ONE scene
 * copy may be meaningfully visible. More than one means panels collide.
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

let worstOverlap = 0
let worstAt = 0
let blankFrames = 0
const samples = 60

for (let i = 0; i <= samples; i++) {
  const y = Math.round((total * i) / samples)
  await page.evaluate(scrollTo, y)
  await page.waitForTimeout(120)

  const r = await page.evaluate(() => {
    const inScene = Array.from(document.querySelectorAll('.scene')).some((s) => {
      const t = s.offsetTop
      return window.scrollY + window.innerHeight * 0.5 >= t &&
        window.scrollY + window.innerHeight * 0.5 < t + s.offsetHeight
    })
    const slots = Array.from(document.querySelectorAll('.copy-slot'))
    const ops = slots.map((s) => {
      const copy = s.querySelector('.scene__copy') ?? s
      const o = parseFloat(getComputedStyle(s).opacity)
      const rect = copy.getBoundingClientRect()
      // only count copy that is actually inside the viewport
      const visible = rect.bottom > 0 && rect.top < window.innerHeight
      return visible ? o : 0
    })
    // sum of all opacities: >1.05 means two panels are meaningfully visible
    const sum = ops.reduce((a, b) => a + b, 0)
    const max = Math.max(...ops)
    return { sum, max, ops, inScene, id: slots.findIndex((_, k) => ops[k] === max) }
  })

  if (r.sum > worstOverlap) { worstOverlap = r.sum; worstAt = i }
  // a frame with no copy at all in the middle of the journey is a gap.
  // The reel + CTA sections legitimately have no overlay copy, so only
  // count frames that fall inside a scene spacer.
  if (r.inScene && r.max < 0.12) blankFrames++
}

console.log('WORST_OVERLAP_SUM', worstOverlap.toFixed(3), 'at sample', worstAt)
console.log('BLANK_FRAMES', blankFrames, '/', samples)

// the final CTA must exist and be reachable
await page.evaluate(() => window.__dispersion?.lenis?.scrollTo(document.body.scrollHeight, { immediate: true }))
await page.waitForTimeout(600)
const cta = await page.evaluate(() => {
  const el = document.getElementById('contact')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { exists: true, top: Math.round(r.top), h: Math.round(r.height), text: el.innerText.slice(0, 60) }
})
console.log('CTA', JSON.stringify(cta))

// mobile check
await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => window.__dispersion?.lenis?.scrollTo(0, { immediate: true }))
await page.waitForTimeout(900)
await page.screenshot({ path: '/Users/openclaw/.hermes/cache/scratch/disp_mobile.png' })
const mob = await page.evaluate(() => {
  const c = document.getElementById('stage')
  return { canvas: [c.width, c.height], overflowX: document.documentElement.scrollWidth > window.innerWidth }
})
console.log('MOBILE', JSON.stringify(mob))

await browser.close()
