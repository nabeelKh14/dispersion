/** Dump the real geometry of every scene copy at a series of scroll positions. */
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
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const enter = await page.$('[data-enter]')
if (enter) { await enter.click(); await page.waitForTimeout(1000) }

const geo = await page.evaluate(() => {
  const vh = window.innerHeight
  return {
    vh,
    scenes: Array.from(document.querySelectorAll('.scene')).map((s) => {
      const copy = s.querySelector('.scene__copy')
      const sticky = s.querySelector('.scene__sticky')
      const cr = copy.getBoundingClientRect()
      const sr = sticky.getBoundingClientRect()
      return {
        id: s.dataset.id,
        sceneTop: s.offsetTop,
        sceneH: s.offsetHeight,
        stickyPos: getComputedStyle(sticky).position,
        stickyTop: Math.round(sr.top),
        copyH: Math.round(cr.height),
      }
    }),
  }
})
console.log('GEOMETRY', JSON.stringify(geo, null, 1))

// walk the first two scene boundaries and print exactly what is on screen
for (const y of [0, 700, 1200, 1700, 2000, 2400, 3000]) {
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y)
  await page.waitForTimeout(120)
  const state = await page.evaluate(() => {
    const vh = window.innerHeight
    return Array.from(document.querySelectorAll('.scene')).map((s) => {
      const copy = s.querySelector('.scene__copy')
      const r = copy.getBoundingClientRect()
      const o = parseFloat(getComputedStyle(copy).opacity)
      return {
        id: s.dataset.id,
        op: o.toFixed(2),
        top: Math.round(r.top),
        bot: Math.round(r.bottom),
        inView: r.bottom > 0 && r.top < vh,
      }
    }).filter((x) => x.inView || x.op > 0.01)
  })
  console.log('y=' + y, JSON.stringify(state))
}

await browser.close()
