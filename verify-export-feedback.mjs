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
await page.getByRole('button', { name: /导出 PNG/ }).click()
await page.waitForSelector('.export-loading-overlay', { timeout: 1000 })
await page.waitForFunction(() => !document.querySelector('.export-loading-overlay'), null, { timeout: 20000 })
await page.waitForSelector('.export-toast', { timeout: 1000 })

const result = await page.evaluate(() => {
  const toast = document.querySelector('.export-toast')
  return {
    toastText: toast?.textContent ?? '',
    toastRole: toast?.getAttribute('role'),
    toastLive: toast?.getAttribute('aria-live'),
    overlayCount: document.querySelectorAll('.export-loading-overlay').length,
    buttonText: [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('导出 PNG'))?.textContent ?? '',
  }
})

await browser.close()
console.log(JSON.stringify({ result, errors }, null, 2))

if (
  !result.toastText.includes('PNG 已开始下载') ||
  result.toastRole !== 'status' ||
  result.toastLive !== 'polite' ||
  result.overlayCount !== 0 ||
  !result.buttonText.includes('导出 PNG') ||
  errors.length > 0
) {
  process.exit(1)
}
