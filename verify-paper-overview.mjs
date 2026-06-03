import { chromium } from 'playwright'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 15000 })

const metrics = await page.evaluate(() => {
  const overview = document.querySelector('.paper-overview')
  const wrap = document.querySelector('.print-pattern-wrap')
  const grid = document.querySelector('.pattern-paper .pattern-grid')
  if (!overview || !wrap || !grid) throw new Error('missing paper overview elements')

  const overviewRect = overview.getBoundingClientRect()
  const wrapRect = wrap.getBoundingClientRect()
  const gridRect = grid.getBoundingClientRect()
  const overviewCenterX = overviewRect.left + overviewRect.width / 2
  const gridCenterX = gridRect.left + gridRect.width / 2

  return {
    overview: { clientWidth: overview.clientWidth, scrollWidth: overview.scrollWidth, width: overviewRect.width },
    wrap: { width: wrapRect.width, transform: getComputedStyle(wrap).transform },
    grid: { width: gridRect.width, left: gridRect.left, right: gridRect.right },
    centerDeltaX: Math.abs(overviewCenterX - gridCenterX),
    fullyVisibleHorizontally: gridRect.left >= overviewRect.left && gridRect.right <= overviewRect.right,
    noHorizontalOverflow: overview.scrollWidth <= overview.clientWidth + 1,
  }
})

await browser.close()
console.log(JSON.stringify(metrics, null, 2))

if (!metrics.fullyVisibleHorizontally || !metrics.noHorizontalOverflow || metrics.centerDeltaX > 2) {
  process.exit(1)
}
