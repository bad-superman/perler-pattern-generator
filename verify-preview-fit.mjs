import { chromium } from 'playwright'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = process.env.IMAGE_PATH || '/home/roy/.hermes/image_cache/img_b80fdcad0cba.jpg'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(imagePath)
await page.waitForSelector('.legend-item', { timeout: 15000 })

const metrics = await page.evaluate(() => {
  const frame = document.querySelector('.paper-overview')
  const grid = document.querySelector('.paper-overview .pattern-grid')
  if (!frame || !grid) throw new Error('missing paper overview or grid')
  const frameRect = frame.getBoundingClientRect()
  const gridRect = grid.getBoundingClientRect()
  const frameCenterX = frameRect.left + frameRect.width / 2
  const frameCenterY = frameRect.top + frameRect.height / 2
  const gridCenterX = gridRect.left + gridRect.width / 2
  const gridCenterY = gridRect.top + gridRect.height / 2
  return {
    frame: { width: frameRect.width, height: frameRect.height, left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom },
    grid: { width: gridRect.width, height: gridRect.height, left: gridRect.left, top: gridRect.top, right: gridRect.right, bottom: gridRect.bottom },
    centerDelta: { x: Math.abs(frameCenterX - gridCenterX), y: Math.abs(frameCenterY - gridCenterY) },
    fullyVisible: gridRect.left >= frameRect.left && gridRect.right <= frameRect.right && gridRect.top >= frameRect.top && gridRect.bottom <= frameRect.bottom,
  }
})

await browser.close()
console.log(JSON.stringify(metrics, null, 2))

if (!metrics.fullyVisible || metrics.centerDelta.x > 2 || metrics.centerDelta.y > 2) {
  process.exit(1)
}
