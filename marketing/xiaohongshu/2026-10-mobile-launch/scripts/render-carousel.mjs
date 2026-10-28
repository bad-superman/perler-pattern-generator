import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const campaignDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const carouselDir = path.join(campaignDir, 'carousel')
const slidesUrl = pathToFileURL(path.join(carouselDir, 'slides.html')).href
const names = [
  '01-cover',
  '02-pain-point',
  '03-upload',
  '04-result',
  '05-edit',
  '06-save',
  '07-cta',
]

const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    viewport: { width: 1242, height: 1660 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto(slidesUrl, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)

  for (const name of names) {
    const slide = page.locator(`[data-slide="${name}"]`)
    if ((await slide.count()) !== 1) throw new Error(`Missing slide: ${name}`)

    const overflow = await slide.evaluate((element) => ({
      x: element.scrollWidth > element.clientWidth,
      y: element.scrollHeight > element.clientHeight,
    }))
    if (overflow.x || overflow.y) throw new Error(`Slide overflow: ${name}`)

    await slide.screenshot({
      path: path.join(carouselDir, `${name}.png`),
      animations: 'disabled',
    })
    console.log(`Rendered carousel/${name}.png`)
  }

  await context.close()
} finally {
  await browser.close()
}
