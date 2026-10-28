import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'

const campaignRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(campaignRoot, 'source/pet-reference.png')
const screenshotsDir = path.join(campaignRoot, 'screenshots')
const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const errors = []
const screenshotNames = [
  'source-card.png',
  'result-symbols.png',
  'result-solid.png',
  'editor.png',
  'export-sheet.png',
]

await mkdir(screenshotsDir, { recursive: true })
await Promise.all(
  screenshotNames.map((name) => rm(path.join(screenshotsDir, name), { force: true })),
)

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await context.newPage()

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  async function capture(locator, filename, options) {
    const outputPath = path.join(screenshotsDir, filename)
    const screenshot = await locator.screenshot({ ...options, path: outputPath })
    const info = await stat(outputPath)
    if (!screenshot.length || !info.size) throw new Error(`Empty screenshot: ${filename}`)
    console.log(outputPath)
  }

  await page.goto(appUrl, { waitUntil: 'networkidle' })
  const shareSupport = await page.evaluate(() => ({
    canShare: typeof navigator.canShare === 'function',
    share: typeof navigator.share === 'function',
  }))
  await page.locator('input[type=file]').first().setInputFiles(sourcePath)
  await page.locator('.m-result .pattern-grid span').first().waitFor()
  await page.locator('.m-legend .m-chip').first().waitFor()

  await capture(page.locator('.m-source'), 'source-card.png', { animations: 'disabled' })
  const symbolsButton = page.locator('.m-result').getByRole('button', { name: '色号', exact: true })
  await symbolsButton.click()
  if (!(await symbolsButton.evaluate((button) => button.classList.contains('active')))) {
    throw new Error('Expected symbol mode before result-symbols.png')
  }
  await capture(page.locator('.m-result'), 'result-symbols.png', { animations: 'disabled' })

  await page.locator('.m-result').getByRole('button', { name: '纯色', exact: true }).click()
  await capture(page.locator('.m-result'), 'result-solid.png', { animations: 'disabled' })

  await page.locator('.m-actionbar').getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.m-editor [data-testid="editor-toolbar"]').waitFor()
  await capture(page, 'editor.png', { fullPage: false })

  await page.locator('.m-editor [data-testid="editor-toolbar"]').getByRole('button', { name: '完成', exact: true }).click()
  await page.locator('.m-actionbar').getByRole('button', { name: '保存到相册', exact: true }).click()
  await page.locator('.m-sheet img').waitFor()
  await capture(page, 'export-sheet.png', { fullPage: false })

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
  console.log(JSON.stringify({ errors, shareSupport }))
  await context.close()
} finally {
  await browser.close()
}
