import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const outDir = process.env.EVAL_OUT || '/tmp/perler-eval/run'
const gridSize = Number(process.env.EVAL_GRID || 48)
const maxColors = Number(process.env.EVAL_COLORS || 12)
const samplesDir = path.resolve('doc/samples')
const fixtures = ['logo.png', 'portrait.png', 'gradient.png', 'pixel.png', 'dark-subject.png']

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (error) => errors.push(error.message))
await page.goto(appUrl, { waitUntil: 'networkidle' })

async function setRange(nth, value) {
  const locator = page.locator('aside input[type=range]').nth(nth)
  await locator.evaluate((el, next) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    descriptor.set.call(el, String(next))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

await setRange(0, gridSize)
await setRange(1, maxColors)

const results = []
for (const name of fixtures) {
  const imagePath = path.join(samplesDir, name)
  await page.locator('input[type=file]').first().setInputFiles(imagePath)
  await page.waitForSelector('.legend-item', { timeout: 20000 })
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('重新生成'))
    return button && !button.disabled
  }, { timeout: 20000 })
  await page.waitForTimeout(250)

  const data = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.pattern-grid.actual-grid span')]
    const title = document.querySelector('.section-title span')?.textContent ?? ''
    const match = title.match(/(\d+)×(\d+)/)
    const cols = match ? Number(match[1]) : 0
    const rows = match ? Number(match[2]) : 0
    const cells = spans.map((span) => {
      const text = span.textContent?.trim() ?? ''
      const hex = span.style.backgroundColor
      return { text, hex, blank: text === '' }
    })
    return { title, cols, rows, cells }
  })

  let isolated = 0
  let blanks = 0
  const { cols, rows, cells } = data
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = cells[y * cols + x]
      if (!cell || cell.blank) {
        blanks += 1
        continue
      }
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]
        .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows)
        .map(([nx, ny]) => cells[ny * cols + nx])
        .filter((item) => item && !item.blank)
      if (neighbors.length >= 3 && neighbors.every((item) => item.hex !== cell.hex && item.text !== cell.text)) {
        isolated += 1
      }
    }
  }

  const shot = path.join(outDir, `${name.replace('.png', '')}.png`)
  await page.locator('.pattern-grid.actual-grid').screenshot({ path: shot })
  const summary = {
    name,
    title: data.title,
    cols,
    rows,
    cells: cells.length,
    blanks,
    colors: new Set(cells.filter((cell) => !cell.blank).map((cell) => cell.text)).size,
    isolated,
    screenshot: shot,
  }
  results.push(summary)
  await writeFile(path.join(outDir, `${name.replace('.png', '')}.json`), JSON.stringify({ ...summary, cells }, null, 2))
  console.log(JSON.stringify(summary))
}

await writeFile(path.join(outDir, 'summary.json'), JSON.stringify({ appUrl, gridSize, maxColors, errors, results }, null, 2))
await browser.close()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
