/** Verify the nav anchors land on the right act, through Lenis. */
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

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
const enter = await page.$('[data-enter]')
if (enter) { await enter.click(); await page.waitForTimeout(1500) }

const read = () =>
  page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll('.copy-slot'))
    const live = slots.findIndex((s) => parseFloat(getComputedStyle(s).opacity) > 0.5)
    return {
      eyebrow: slots[live]?.querySelector('.scene__eyebrow')?.textContent?.trim() ?? 'none',
      rail: document.querySelector('[data-rail-count]')?.textContent,
      scrollY: Math.round(window.scrollY),
    }
  })

for (const [label, sel] of [
  ['The engine', 'a[href="#refract"]'],
  ['The record', 'a[href="#proof"]'],
  ['Contact', 'a[href="#contact"]'],
]) {
  const link = await page.$(sel)
  if (!link) { console.log(label, '-> LINK MISSING', sel); continue }
  await link.click()
  await page.waitForTimeout(2600)
  const s = await read()
  console.log(label.padEnd(12), '->', JSON.stringify(s))
}

// the BEGIN control should scroll into the journey
await page.evaluate(() => window.__dispersion?.lenis?.scrollTo(0, { immediate: true }))
await page.waitForTimeout(800)
const begin = await page.$('[data-begin]')
if (begin) {
  await begin.click()
  await page.waitForTimeout(3000)
  const s = await read()
  console.log('BEGIN        ->', JSON.stringify(s))
  const gone = await page.evaluate(() => document.querySelector('[data-begin]')?.classList.contains('is-gone'))
  console.log('BEGIN hidden after click:', gone)
} else {
  console.log('BEGIN -> MISSING')
}

console.log('ERRORS', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none')
await browser.close()
