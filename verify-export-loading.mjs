import { chromium } from 'playwright'

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

const exportButton = page.getByRole('button', { name: /导出 PNG/ })
await exportButton.click()
await page.waitForSelector('.export-loading-overlay', { timeout: 1000 })

const loadingState = await page.evaluate(() => {
  const overlay = document.querySelector('.export-loading-overlay')
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('导出中'))
  return {
    hasOverlay: Boolean(overlay),
    text: overlay?.textContent ?? '',
    ariaBusy: overlay?.getAttribute('aria-busy'),
    buttonDisabled: button?.hasAttribute('disabled') ?? false,
    buttonText: button?.textContent ?? '',
  }
})

await page.waitForFunction(() => !document.querySelector('.export-loading-overlay'), null, { timeout: 20000 })
const finalState = await page.evaluate(() => ({
  overlayCount: document.querySelectorAll('.export-loading-overlay').length,
  exportButtonText: [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('导出 PNG'))?.textContent ?? '',
}))

await browser.close()
console.log(JSON.stringify({ loadingState, finalState, errors }, null, 2))

if (
  !loadingState.hasOverlay ||
  !loadingState.text.includes('正在导出 PNG') ||
  loadingState.ariaBusy !== 'true' ||
  !loadingState.buttonDisabled ||
  !loadingState.buttonText.includes('导出中') ||
  finalState.overlayCount !== 0 ||
  !finalState.exportButtonText.includes('导出 PNG') ||
  errors.length > 0
) {
  process.exit(1)
}
