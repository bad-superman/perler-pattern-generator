import { chromium } from 'playwright'
import path from 'node:path'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 15000 })

const result = await page.evaluate(() => {
  const overview = document.querySelector('.paper-overview')
  const grid = document.querySelector('.pattern-paper .pattern-grid')
  if (!overview || !grid) throw new Error('missing paper overview elements')

  const overviewRect = overview.getBoundingClientRect()
  const gridRect = grid.getBoundingClientRect()
  const overviewCenterX = overviewRect.left + overviewRect.width / 2
  const gridCenterX = gridRect.left + gridRect.width / 2

  return {
    title: document.querySelector('.section-title div')?.textContent?.trim(),
    stats: document.querySelector('.section-title span')?.textContent?.trim(),
    compareStageCount: document.querySelectorAll('.compare-stage').length,
    patternFitButtonCount: document.querySelectorAll('.pattern-fit-button').length,
    modalBackdropCount: document.querySelectorAll('.modal-backdrop').length,
    cells: document.querySelectorAll('.pattern-paper .pattern-grid span').length,
    legend: document.querySelectorAll('.legend-item').length,
    summaryCards: document.querySelectorAll('.result-summary > div').length,
    summaryText: document.querySelector('.result-summary')?.textContent ?? '',
    paper: {
      fullyVisibleHorizontally: gridRect.left >= overviewRect.left && gridRect.right <= overviewRect.right,
      noHorizontalOverflow: overview.scrollWidth <= overview.clientWidth + 1,
      centerDeltaX: Math.abs(overviewCenterX - gridCenterX),
    },
  }
})

await page.screenshot({ path: '/home/roy/perler-pattern-generator/verification-layout.png', fullPage: true })
await browser.close()

console.log(JSON.stringify({
  appUrl,
  image: path.basename(imagePath),
  ...result,
  errors,
  screenshot: '/home/roy/perler-pattern-generator/verification-layout.png',
}, null, 2))

if (
  result.compareStageCount !== 0 ||
  result.patternFitButtonCount !== 0 ||
  result.modalBackdropCount !== 0 ||
  result.summaryCards !== 4 ||
  !result.summaryText.includes('豆数') ||
  !result.paper.fullyVisibleHorizontally ||
  !result.paper.noHorizontalOverflow ||
  result.paper.centerDeltaX > 2 ||
  errors.length > 0
) {
  process.exit(1)
}
