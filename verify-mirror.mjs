import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const appUrl = 'http://127.0.0.1:5173'
const fallbackImage = path.join(rootDir, 'doc/samples/portrait.png')
const hermesImage = '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const imagePath = process.env.IMAGE_PATH || (existsSync(hermesImage) ? hermesImage : fallbackImage)

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

function readGrid() {
  return page.evaluate(() => {
    const grid = document.querySelector('.pattern-paper .pattern-grid')
    if (!grid) throw new Error('missing pattern grid')
    const cols = grid.style.gridTemplateColumns.match(/repeat\((\d+)/)?.[1]
    const cells = Array.from(grid.querySelectorAll('span'))
    const colCount = Number(cols)
    const flat = cells.map((cell) => `${getComputedStyle(cell).backgroundColor}|${cell.textContent ?? ''}`)
    const rows = []
    for (let index = 0; index < flat.length; index += colCount) rows.push(flat.slice(index, index + colCount))
    return {
      cols: colCount,
      cellCount: cells.length,
      legendCount: document.querySelectorAll('.legend-item').length,
      legendText: Array.from(document.querySelectorAll('.legend-item')).map((item) => item.textContent?.trim()).join('|'),
      rows,
    }
  })
}

function sameRows(a, b) {
  return a.length === b.length && a.every((row, y) => row.length === b[y].length && row.every((cell, x) => cell === b[y][x]))
}

const before = await readGrid()
const toggle = page.locator('.mirror-row input[type=checkbox]')
if (!(await toggle.isEnabled())) throw new Error('mirror toggle should be enabled once a pattern exists')
await toggle.check()
await page.waitForTimeout(200)
const after = await readGrid()

const mirroredBefore = before.rows.map((row) => [...row].reverse())
const gridMirrored = sameRows(mirroredBefore, after.rows)
const gridActuallyChanged = !sameRows(before.rows, after.rows)

const hintVisibleInEdit = await (async () => {
  await page.locator('.preview-mode-tabs button', { hasText: '编辑' }).click()
  await page.waitForSelector('.pattern-editor-layout', { timeout: 5000 })
  const visible = await page.locator('.mirror-edit-hint').isVisible()
  await page.locator('.preview-mode-tabs button', { hasText: '预览' }).click()
  await page.waitForSelector('.paper-overview', { timeout: 5000 })
  return visible
})()

const stillMirroredAfterEdit = await readGrid().then((grid) => sameRows(grid.rows, after.rows))

await toggle.uncheck()
await page.waitForTimeout(200)
const restored = await readGrid()
const restoredMatchesOriginal = sameRows(restored.rows, before.rows)

await page.screenshot({ path: path.join(rootDir, 'verification-mirror.png'), fullPage: true })
await browser.close()

const result = {
  appUrl,
  image: path.basename(imagePath),
  cols: before.cols,
  cellCount: before.cellCount,
  legendCount: { before: before.legendCount, after: after.legendCount },
  legendUnchanged: before.legendText === after.legendText,
  gridMirrored,
  gridActuallyChanged,
  hintVisibleInEdit,
  stillMirroredAfterEdit,
  restoredMatchesOriginal,
  errors,
}
console.log(JSON.stringify(result, null, 2))

if (
  !gridMirrored
  || !gridActuallyChanged
  || !result.legendUnchanged
  || before.cellCount !== after.cellCount
  || !hintVisibleInEdit
  || !stillMirroredAfterEdit
  || !restoredMatchesOriginal
  || errors.length > 0
) {
  process.exit(1)
}
