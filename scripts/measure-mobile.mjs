import { chromium, devices } from 'playwright'

const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || new URL('../doc/samples/portrait.png', import.meta.url).pathname
const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.goto(appUrl, { waitUntil: 'networkidle' })

const measure = () => page.evaluate(() => {
  const top = (selector) => {
    const element = document.querySelector(selector)
    return element ? Math.round(element.getBoundingClientRect().top + window.scrollY) : null
  }
  const upload = document.querySelector('.upload-zone')
  return {
    pageH: document.documentElement.scrollHeight,
    controls: top('.source-mode-tabs'),
    uploadBottom: upload ? Math.round(upload.getBoundingClientRect().bottom + window.scrollY) : null,
    preview: top('.preview-panel'),
  }
})

const empty = await measure()
await page.locator('input[type=file]').first().setInputFiles(imagePath)
await page.waitForSelector('.legend-item')
await page.waitForTimeout(500)
const loaded = await measure()
await browser.close()

const report = { empty, loaded, errors }
console.log(JSON.stringify(report, null, 2))
if (errors.length || empty.controls > 360 || loaded.uploadBottom === null || loaded.preview - loaded.uploadBottom > 80) {
  process.exit(1)
}
