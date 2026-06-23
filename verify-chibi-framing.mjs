import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { buildAgnesPrompt } from './src/agnes/styles.ts'

const REF_IMAGE = process.env.REF_IMAGE
  ?? '/tmp/hapi-blobs/9359effe-75e5-4e62-b44b-e0a20dd41f26-9RAl92/1782223150042-IMG_4985.jpeg'
const API_URL = process.env.AGNES_API_URL ?? 'http://127.0.0.1:8787/api/agnes/generate'
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('verify-chibi-output')
const TOLERANCE = Number(process.env.FRAMING_TOLERANCE ?? '0.06')

async function toDataUrl(filePath) {
  const buffer = fs.readFileSync(filePath)
  const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

async function dataUrlToBuffer(dataUrl) {
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function generateAgnesImage(prompt, refPath, size = '1024x1024') {
  const buffer = fs.readFileSync(refPath)
  const blob = new Blob([buffer], { type: 'image/jpeg' })
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('styleId', 'cute-chibi')
  form.append('size', size)
  form.append('image', blob, path.basename(refPath))

  const response = await fetch(API_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(360_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error ?? `AI 生成失败（${response.status}）`)
  }
  if (!payload?.imageBase64) throw new Error('AI 未返回 base64 图片')
  return `data:image/png;base64,${payload.imageBase64}`
}

async function analyzeWithAppModules(page, dataUrl) {
  return page.evaluate(async (inputDataUrl) => {
    const { findContentBounds, hasBackgroundBelow, hasBackgroundStripBelowSubject, detectGownHemToBottom, findLegExtensionCropY } = await import('/src/agnes/imageAnalysis.ts')

    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('无法加载图片'))
      element.src = inputDataUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(image, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const bounds = findContentBounds(canvas.width, canvas.height, imageData.data)
    if (!bounds) return null

    const bottomRatio = (bounds.maxY + 1) / canvas.height
    const topRatio = bounds.minY / canvas.height
    const subjectHeightRatio = (bounds.maxY - bounds.minY + 1) / canvas.height
    const backgroundBelow = hasBackgroundBelow(bounds, canvas.width, canvas.height, imageData.data)
    const backgroundStripBelow = hasBackgroundStripBelowSubject(bounds, canvas.width, canvas.height, imageData.data)

    const gownHemToBottom = detectGownHemToBottom(canvas.width, canvas.height, imageData.data)

    let shotLabel = '全身'
    if (topRatio < 0.2 && bottomRatio < 0.72) shotLabel = '头像'
    else if (gownHemToBottom || backgroundBelow || backgroundStripBelow || bottomRatio < 0.9 || subjectHeightRatio < 0.82) {
      shotLabel = '半身'
    }

    return {
      width: canvas.width,
      height: canvas.height,
      bottomRatio,
      topRatio,
      subjectHeightRatio,
      shotLabel,
      backgroundBelow,
      backgroundStripBelow,
      gownHemToBottom,
      shouldCrop: shotLabel !== '全身' && (
        gownHemToBottom
        || backgroundBelow
        || backgroundStripBelow
        || bottomRatio < 0.95
      ),
    }
  }, dataUrl)
}

async function cropWithAppModules(page, aiDataUrl, refDataUrl) {
  return page.evaluate(async ({ aiUrl, refUrl }) => {
    const { cropToReferenceFraming } = await import('/src/agnes/referenceFraming.ts')

    async function dataUrlToFile(dataUrl, fileName) {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      return new File([blob], fileName, { type: blob.type || 'image/png' })
    }

    const aiFile = await dataUrlToFile(aiUrl, 'ai.png')
    const refFile = await dataUrlToFile(refUrl, 'ref.jpg')
    const cropped = await cropToReferenceFraming(aiFile, refFile)
    const buffer = await cropped.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index])
    }
    return `data:${cropped.type || 'image/png'};base64,${btoa(binary)}`
  }, { aiUrl: aiDataUrl, refUrl: refDataUrl })
}

async function buildHintWithAppModules(page, refDataUrl) {
  return page.evaluate(async (dataUrl) => {
    const { buildReferenceCompositionHint } = await import('/src/agnes/referenceFraming.ts')

    async function dataUrlToFile(inputDataUrl, fileName) {
      const response = await fetch(inputDataUrl)
      const blob = await response.blob()
      return new File([blob], fileName, { type: blob.type || 'image/jpeg' })
    }

    return buildReferenceCompositionHint(await dataUrlToFile(dataUrl, 'ref.jpg'))
  }, refDataUrl)
}

async function main() {
  if (!fs.existsSync(REF_IMAGE)) {
    console.error(`参考图不存在: ${REF_IMAGE}`)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(APP_URL, { waitUntil: 'networkidle' })

  const refDataUrl = await toDataUrl(REF_IMAGE)
  const refFraming = await analyzeWithAppModules(page, refDataUrl)
  const compositionHint = await buildHintWithAppModules(page, refDataUrl)
  const prompt = buildAgnesPrompt('cute-chibi', '', 48, compositionHint)

  console.log('参考图:', REF_IMAGE)
  console.log('检测构图:', refFraming)
  console.log('构图提示:', compositionHint || '(无)')
  console.log('开始 AI 生成...')

  const rawDataUrl = await generateAgnesImage(prompt, REF_IMAGE)
  const framedDataUrl = await cropWithAppModules(page, rawDataUrl, refDataUrl)

  const rawPath = path.join(OUT_DIR, 'ai-raw.png')
  const framedPath = path.join(OUT_DIR, 'ai-framed.png')
  fs.writeFileSync(rawPath, await dataUrlToBuffer(rawDataUrl))
  fs.writeFileSync(framedPath, await dataUrlToBuffer(framedDataUrl))

  const rawStats = await analyzeWithAppModules(page, rawDataUrl)
  const framedStats = await analyzeWithAppModules(page, framedDataUrl)
  const legCropOnRaw = await page.evaluate(async ({ aiUrl, refUrl }) => {
    const { findLegExtensionCropY } = await import('/src/agnes/imageAnalysis.ts')

    async function readFrame(dataUrl) {
      const image = await new Promise((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error('无法加载图片'))
        element.src = dataUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      return { width: canvas.width, height: canvas.height, data: imageData.data }
    }

    const ref = await readFrame(refUrl)
    const ai = await readFrame(aiUrl)
    return findLegExtensionCropY(ref.width, ref.height, ref.data, ai.width, ai.height, ai.data)
  }, { aiUrl: rawDataUrl, refUrl: refDataUrl })
  await browser.close()

  const rawOverflow = rawStats.bottomRatio - refFraming.bottomRatio
  const framedOverflow = framedStats.bottomRatio - refFraming.bottomRatio
  const rawHeightGrowth = rawStats.height / refFraming.height
  const framedHeightGrowth = framedStats.height / refFraming.height

  const report = {
    ref: {
      size: `${refFraming.width}x${refFraming.height}`,
      shotLabel: refFraming.shotLabel,
      shouldCrop: refFraming.shouldCrop,
      bottomRatio: Number(refFraming.bottomRatio.toFixed(3)),
    },
    raw: {
      path: rawPath,
      size: `${rawStats.width}x${rawStats.height}`,
      bottomRatio: Number(rawStats.bottomRatio.toFixed(3)),
      overflowVsRef: Number(rawOverflow.toFixed(3)),
      heightGrowthVsRef: Number(rawHeightGrowth.toFixed(3)),
    },
    framed: {
      path: framedPath,
      size: `${framedStats.width}x${framedStats.height}`,
      bottomRatio: Number(framedStats.bottomRatio.toFixed(3)),
      overflowVsRef: Number(framedOverflow.toFixed(3)),
      heightGrowthVsRef: Number(framedHeightGrowth.toFixed(3)),
    },
    legCropOnRaw,
    pass:
      refFraming.gownHemToBottom
      && refFraming.shotLabel === '半身'
      && Boolean(compositionHint)
      && (legCropOnRaw ? framedStats.height < rawStats.height : framedOverflow <= TOLERANCE),
    tolerance: TOLERANCE,
  }

  console.log(JSON.stringify(report, null, 2))

  if (!report.pass) {
    console.error('验证失败：参考图未识别为半身，或生成图仍包含腿部扩展。')
    process.exit(1)
  }

  console.log('验证通过：参考图识别为半身照，生成结果构图符合预期。')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
