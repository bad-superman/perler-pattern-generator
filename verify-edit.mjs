import { chromium } from 'playwright'
import path from 'node:path'

const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const screenshotPath = '/home/roy/perler-pattern-generator/verification-edit.png'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').first().setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 15000 })

const beforePaint = await page.evaluate(() => {
  const legend = [...document.querySelectorAll('.legend-item')].map((item) => ({
    label: item.querySelector('span')?.textContent?.trim() ?? '',
    count: Number(item.querySelector('b')?.textContent ?? '0'),
  }))
  const cell = document.querySelector('.paper-overview .pattern-grid span')
  return {
    legend,
    viewCellCount: document.querySelectorAll('.paper-overview .pattern-grid span').length,
    firstCellHex: cell ? window.getComputedStyle(cell).backgroundColor : '',
  }
})

await page.locator('.preview-mode-tabs button', { hasText: '编辑' }).click()
await page.waitForSelector('[data-testid="editor-toolbar"]', { timeout: 5000 })

const secondColor = page.locator('[data-testid="color-picker-strip"] .color-swatch').nth(1)
if (await secondColor.count()) {
  await secondColor.click()
}

const paintCell = page.locator('[data-testid="pattern-cell"]').first()
await paintCell.scrollIntoViewIfNeeded()
await paintCell.click()
await page.waitForFunction(() => {
  const undoBtn = document.querySelector('[data-testid="editor-toolbar"] button[aria-label="撤销"]')
  return undoBtn && !undoBtn.disabled
}, undefined, { timeout: 3000 })

const afterPaint = await page.evaluate(() => {
  const legend = [...document.querySelectorAll('.legend-item')].map((item) => ({
    label: item.querySelector('span')?.textContent?.trim() ?? '',
    count: Number(item.querySelector('b')?.textContent ?? '0'),
  }))
  const cell = document.querySelector('[data-testid="pattern-cell"]')
  return {
    legend,
    editCellCount: document.querySelectorAll('[data-testid="pattern-cell"]').length,
    firstCellHex: cell ? (cell.style.background || window.getComputedStyle(cell).backgroundColor) : '',
    canUndo: !document.querySelector('[data-testid="editor-toolbar"] button[aria-label="撤销"]')?.disabled,
  }
})

const undoButton = page.locator('[data-testid="editor-toolbar"] button[aria-label="撤销"]')
await undoButton.click()
await page.waitForFunction(() => {
  const undoBtn = document.querySelector('[data-testid="editor-toolbar"] button[aria-label="撤销"]')
  return undoBtn?.disabled
}, undefined, { timeout: 3000 })

const afterUndo = await page.evaluate(() => {
  const legend = [...document.querySelectorAll('.legend-item')].map((item) => ({
    label: item.querySelector('span')?.textContent?.trim() ?? '',
    count: Number(item.querySelector('b')?.textContent ?? '0'),
  }))
  const cell = document.querySelector('[data-testid="pattern-cell"]')
  return {
    legend,
    firstCellHex: cell ? (cell.style.background || window.getComputedStyle(cell).backgroundColor) : '',
    canUndo: !document.querySelector('[data-testid="editor-toolbar"] button[aria-label="撤销"]')?.disabled,
  }
})

await page.locator('[data-testid="editor-toolbar"] button', { hasText: '换色' }).click()
await page.waitForSelector('[data-testid="color-replace-panel"]')

const replaceMeta = await page.evaluate(() => {
  const options = [...document.querySelectorAll('[data-testid="color-replace-panel"] select').item(0).options]
    .map((option) => ({ value: option.value, text: option.textContent?.trim() ?? '' }))
    .filter((option) => option.value)
  const targetOptions = [...document.querySelectorAll('[data-testid="color-replace-panel"] select').item(1).options]
    .map((option) => ({ value: option.value, text: option.textContent?.trim() ?? '' }))
    .filter((option) => option.value)
  return { from: options[0], to: targetOptions.find((option) => option.value !== options[0]?.value) }
})

if (replaceMeta.from && replaceMeta.to) {
  await page.locator('[data-testid="color-replace-panel"] select').nth(0).selectOption(replaceMeta.from.value)
  await page.locator('[data-testid="color-replace-panel"] select').nth(1).selectOption(replaceMeta.to.value)
  await page.locator('[data-testid="color-replace-panel"] button', { hasText: '应用换色' }).click()
  await page.waitForTimeout(120)
}

const afterReplace = await page.evaluate(() => ({
  replacePanelVisible: !!document.querySelector('[data-testid="color-replace-panel"]'),
  colorStripVisible: !!document.querySelector('[data-testid="color-picker-strip"]'),
  legend: [...document.querySelectorAll('.legend-item')].map((item) => ({
    label: item.querySelector('span')?.textContent?.trim() ?? '',
    count: Number(item.querySelector('b')?.textContent ?? '0'),
  })),
}))

await page.screenshot({ path: screenshotPath, fullPage: true })
await browser.close()

const legendChangedOnPaint = JSON.stringify(beforePaint.legend) !== JSON.stringify(afterPaint.legend)
const legendRestoredOnUndo = JSON.stringify(beforePaint.legend) === JSON.stringify(afterUndo.legend)
const cellChangedOnPaint = beforePaint.firstCellHex !== afterPaint.firstCellHex
const cellRestoredOnUndo = beforePaint.firstCellHex === afterUndo.firstCellHex

const result = {
  appUrl,
  image: path.basename(imagePath),
  viewCellCount: beforePaint.viewCellCount,
  editCellCount: afterPaint.editCellCount,
  paintWorked: afterPaint.canUndo && (legendChangedOnPaint || cellChangedOnPaint),
  undoWorked: !afterUndo.canUndo && legendRestoredOnUndo && cellRestoredOnUndo,
  replaceApplied: !!replaceMeta.from && !!replaceMeta.to,
  backToPaintUi: afterReplace.colorStripVisible && !afterReplace.replacePanelVisible,
  errors,
  screenshot: screenshotPath,
}

console.log(JSON.stringify(result, null, 2))

if (
  !result.paintWorked ||
  !result.undoWorked ||
  !result.replaceApplied ||
  !result.backToPaintUi ||
  result.editCellCount !== result.viewCellCount ||
  errors.length > 0
) {
  process.exit(1)
}
