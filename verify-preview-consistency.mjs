import { chromium } from 'playwright'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 15000 })

const result = await page.evaluate(() => {
  const paper = document.querySelector('.pattern-paper .pattern-grid')
  if (!paper) throw new Error('missing paper grid')

  const paperStyle = getComputedStyle(paper)
  const paperCell = paper.querySelector('span')
  if (!paperCell) throw new Error('missing cells')

  const paperCellStyle = getComputedStyle(paperCell)

  return {
    paperClass: paper.className,
    paperColumns: paperStyle.gridTemplateColumns,
    paperGap: paperStyle.gap,
    paperPadding: paperStyle.padding,
    paperCellBorderRadius: paperCellStyle.borderRadius,
    paperCellText: paperCell.textContent,
    comparePreviewRemoved: document.querySelectorAll('.pattern-fit-button .pattern-grid').length === 0,
  }
})

await browser.close()

const mismatches = []
if (!result.paperClass.includes('actual-grid')) {
  mismatches.push(['actualGridClass', result.paperClass])
}
if (!result.comparePreviewRemoved) {
  mismatches.push(['comparePreviewRemoved', result.comparePreviewRemoved])
}

console.log(JSON.stringify({ ...result, mismatches }, null, 2))

if (mismatches.length > 0) {
  process.exit(1)
}
