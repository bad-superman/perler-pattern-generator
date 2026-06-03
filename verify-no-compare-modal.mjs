import { chromium } from 'playwright'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 15000 })

const result = await page.evaluate(() => ({
  compareStageCount: document.querySelectorAll('.compare-stage').length,
  compareCardCount: document.querySelectorAll('.compare-card').length,
  imageFrameCount: document.querySelectorAll('.image-frame').length,
  patternFitButtonCount: document.querySelectorAll('.pattern-fit-button').length,
  modalBackdropCount: document.querySelectorAll('.modal-backdrop').length,
  textContainsComparePreview: document.body.innerText.includes('对比预览'),
  textContainsOneToOnePreview: document.body.innerText.includes('1:1'),
  paperOverviewCount: document.querySelectorAll('.paper-overview').length,
  exportButtonExists: [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('导出 PNG')),
}))

await browser.close()
console.log(JSON.stringify(result, null, 2))

if (
  result.compareStageCount !== 0 ||
  result.compareCardCount !== 0 ||
  result.imageFrameCount !== 0 ||
  result.patternFitButtonCount !== 0 ||
  result.modalBackdropCount !== 0 ||
  result.textContainsComparePreview ||
  result.textContainsOneToOnePreview ||
  result.paperOverviewCount !== 1 ||
  !result.exportButtonExists
) {
  process.exit(1)
}
