import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const REF_IMAGE = process.env.REF_IMAGE
  ?? '/tmp/hapi-blobs/9359effe-75e5-4e62-b44b-e0a20dd41f26-9RAl92/1782223150042-IMG_4985.jpeg'
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('verify-chibi-output')

fs.mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(APP_URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'AI 生成' }).click()
await page.locator('input[type=file]').setInputFiles(REF_IMAGE)
await page.locator('.style-card.active, .style-card').first().waitFor()
await page.locator('.style-card').filter({ hasText: '可爱 Q 版' }).click()
await page.getByRole('button', { name: 'AI 生成拼豆图' }).click()
await page.waitForSelector('.legend-item', { timeout: 360_000 })

const stats = await page.locator('.section-title span').innerText()
const cells = await page.locator('.pattern-grid span:not(.blank)').count()
const legend = await page.locator('.legend-item').count()

await page.locator('.pattern-paper').screenshot({ path: path.join(OUT_DIR, 'pattern-preview.png') })
await page.screenshot({ path: path.join(OUT_DIR, 'pattern-page.png'), fullPage: true })

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30_000 }),
  page.getByRole('button', { name: '导出 PNG' }).click(),
])
const exportPath = path.join(OUT_DIR, 'pattern-export.png')
await download.saveAs(exportPath)

await browser.close()

console.log(JSON.stringify({
  stats,
  cells,
  legend,
  errors,
  preview: path.join(OUT_DIR, 'pattern-preview.png'),
  export: exportPath,
  page: path.join(OUT_DIR, 'pattern-page.png'),
}, null, 2))
