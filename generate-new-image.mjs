import { chromium } from 'playwright'

const imagePath = '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (error) => errors.push(error.message))
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 20000 })
const stats = await page.locator('.section-title span').innerText()
const cells = await page.locator('.pattern-grid span:not(.blank)').count()
const legend = await page.locator('.legend-item').count()
await page.locator('.pattern-paper').screenshot({ path: '/home/roy/perler-pattern-generator/new-image-pattern.png' })
await page.screenshot({ path: '/home/roy/perler-pattern-generator/new-image-page.png', fullPage: true })
await browser.close()
console.log(JSON.stringify({ stats, cells, legend, errors, pattern: '/home/roy/perler-pattern-generator/new-image-pattern.png', page: '/home/roy/perler-pattern-generator/new-image-page.png' }, null, 2))
