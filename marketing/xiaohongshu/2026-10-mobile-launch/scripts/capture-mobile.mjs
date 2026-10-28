import { mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
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

const stagingDir = await mkdtemp(path.join(campaignRoot, '.screenshots-staging-'))
const backupDir = path.join(campaignRoot, `.screenshots-backup-${process.pid}-${Date.now()}`)

async function installScreenshots() {
  let hasBackup = false
  try {
    await rename(screenshotsDir, backupDir)
    hasBackup = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await rename(stagingDir, screenshotsDir)
  } catch (error) {
    if (hasBackup) await rename(backupDir, screenshotsDir)
    throw error
  }
  if (hasBackup) await rm(backupDir, { recursive: true, force: true })
}

let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await context.newPage()

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  async function capture(locator, filename, options) {
    const outputPath = path.join(stagingDir, filename)
    const screenshot = await locator.screenshot({ ...options, path: outputPath })
    const info = await stat(outputPath)
    if (!screenshot.length || !info.size) throw new Error(`Empty screenshot: ${filename}`)
    const contents = await readFile(outputPath)
    if (!contents.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      throw new Error(`Not PNG: ${filename}`)
    }
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
  const staged = (await readdir(stagingDir)).sort()
  const expected = [...screenshotNames].sort()
  if (JSON.stringify(staged) !== JSON.stringify(expected)) {
    throw new Error(`Wrong staged screenshot manifest: ${staged.join(', ')}`)
  }
  console.log(JSON.stringify({ errors, shareSupport }))
  await context.close()
  await installScreenshots()
} finally {
  if (browser) await browser.close()
  await rm(stagingDir, { recursive: true, force: true })
}
