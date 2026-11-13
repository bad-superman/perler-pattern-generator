import path from 'node:path'
import { chromium } from 'playwright'

const appUrl = 'http://127.0.0.1:5173'
const imagePath = path.resolve('new-image-page.png')
const androidWechatUserAgent = 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A.241105.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.56.2800(0x2800383B) WeChat/arm64'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  userAgent: androidWechatUserAgent,
})
const errors = []

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(appUrl, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').first().setInputFiles(imagePath)
await page.waitForSelector('.m-paper .actual-grid span', { timeout: 20_000 })

const exportButton = page.getByRole('button', { name: '保存到相册', exact: true }).last()
await exportButton.click()
await page.waitForSelector('.m-sheet img', { timeout: 20_000 })

const result = await page.evaluate(() => {
  const sheet = document.querySelector('.m-sheet')
  const image = sheet?.querySelector('img')
  return {
    imageSource: image?.getAttribute('src') ?? '',
    instruction: sheet?.querySelector('p')?.textContent ?? '',
    buttons: [...(sheet?.querySelectorAll('button') ?? [])].map((button) => button.textContent?.trim() ?? ''),
  }
})

await browser.close()
console.log(JSON.stringify({
  result: {
    imageSourcePrefix: result.imageSource.slice(0, 30),
    imageSourceLength: result.imageSource.length,
    instruction: result.instruction,
    buttons: result.buttons,
  },
  errors,
}, null, 2))

if (
  !result.imageSource.startsWith('data:image/png;base64,')
  || !result.instruction.includes('微信菜单')
  || result.buttons.includes('下载文件')
  || !result.buttons.includes('关闭')
  || errors.length > 0
) {
  process.exit(1)
}
