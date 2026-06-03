import { chromium } from 'playwright'
import path from 'node:path'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = '/home/roy/.hermes/image_cache/img_c8949731d72d.jpg'
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
const stats = await page.locator('.section-title span').innerText()
const cells = await page.locator('.pattern-grid span:not(.blank)').count()
const legend = await page.locator('.legend-item').count()
await page.screenshot({ path: '/home/roy/perler-pattern-generator/verification.png', fullPage: true })
await browser.close()
console.log(JSON.stringify({ appUrl, image: path.basename(imagePath), stats, cells, legend, errors, screenshot: '/home/roy/perler-pattern-generator/verification.png' }, null, 2))
