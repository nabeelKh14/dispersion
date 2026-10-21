import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Use whichever Chromium build is already cached on this machine. */
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

const OUT = '/Users/openclaw/.hermes/cache/scratch/disp_shots'
fs.mkdirSync(OUT, { recursive: true })

const scrollTo = (y) =>
  window.__dispersion?.lenis
    ? window.__dispersion.lenis.scrollTo(y, { immediate: true })
    : window.scrollTo({ top: y, behavior: 'instant' })

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// enter
const enter = await page.$('[data-enter]')
if (enter) {
  await enter.click()
  await page.waitForTimeout(1200)
}

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
console.log('SCROLL_HEIGHT', total)

const stops = [0, 0.08, 0.18, 0.30, 0.42, 0.52, 0.62, 0.74, 0.84, 0.94]
for (let i = 0; i < stops.length; i++) {
  await page.evaluate(scrollTo, Math.round(total * stops[i]))
  await page.waitForTimeout(1400)
  const name = `${OUT}/f${String(i).padStart(2, '0')}_p${stops[i]}.png`
  await page.screenshot({ path: name })
  console.log('SHOT', name)
}

// diagnostics
const diag = await page.evaluate(() => {
  const c = document.getElementById('stage')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  return {
    canvasW: c.width,
    canvasH: c.height,
    glLost: gl ? gl.isContextLost() : 'no-gl',
    renderer: gl ? gl.getParameter(gl.VERSION) : null,
    sceneCount: document.querySelectorAll('.scene').length,
    liveScene: document.querySelector('.scene.is-live')?.dataset.id,
    liveCopyOpacity: getComputedStyle(document.querySelector('.scene.is-live .scene__copy') || document.body).opacity,
  }
})
console.log('DIAG', JSON.stringify(diag, null, 1))
console.log('ERRORS', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')

await browser.close()
