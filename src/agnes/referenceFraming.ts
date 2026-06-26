import {
  detectGownHemToBottom,
  findContentBounds,
  findLegExtensionCropY,
  hasBackgroundBelow,
  hasBackgroundStripBelowSubject,
} from './imageAnalysis'

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法解析图片'))
    }
    image.src = url
  })
}

interface ImageFrame {
  width: number
  height: number
  data: Uint8ClampedArray
}

async function readImageFrame(file: File): Promise<ImageFrame | null> {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
  }
}

interface ReferenceFraming {
  bottomRatio: number
  shotLabel: '头像' | '半身' | '全身'
  shouldCrop: boolean
  gownHemToBottom: boolean
}

async function analyzeReferenceFraming(file: File): Promise<ReferenceFraming | null> {
  const frame = await readImageFrame(file)
  if (!frame) return null

  const bounds = findContentBounds(frame.width, frame.height, frame.data)
  if (!bounds) return null

  const bottomRatio = (bounds.maxY + 1) / frame.height
  const topRatio = bounds.minY / frame.height
  const subjectHeightRatio = (bounds.maxY - bounds.minY + 1) / frame.height
  const backgroundBelow = hasBackgroundBelow(bounds, frame.width, frame.height, frame.data)
  const backgroundStripBelow = hasBackgroundStripBelowSubject(
    bounds,
    frame.width,
    frame.height,
    frame.data,
  )
  const gownHemToBottom = detectGownHemToBottom(frame.width, frame.height, frame.data)

  let shotLabel: ReferenceFraming['shotLabel'] = '全身'
  if (topRatio < 0.2 && bottomRatio < 0.72) {
    shotLabel = '头像'
  } else if (gownHemToBottom || backgroundBelow || backgroundStripBelow || bottomRatio < 0.9 || subjectHeightRatio < 0.82) {
    shotLabel = '半身'
  }

  const shouldCrop = shotLabel !== '全身' && (
    gownHemToBottom
    || backgroundBelow
    || backgroundStripBelow
    || bottomRatio < 0.95
  )

  return { bottomRatio, shotLabel, shouldCrop, gownHemToBottom }
}

export async function buildReferenceCompositionHint(file: File): Promise<string> {
  const framing = await analyzeReferenceFraming(file)
  if (!framing || framing.shotLabel === '全身') return ''

  const bottomPercent = Math.round(framing.bottomRatio * 100)
  if (framing.gownHemToBottom) {
    return `构图严格锁定：参考图为半身照，画面底边已经是服装下摆位置（约 ${bottomPercent}% 高度），参考图中没有腿部。输出必须保持相同取景，服装下摆贴在画面底边，禁止在下摆之外补画双腿、鞋子、裤腿或拉长身体。`
  }

  if (framing.shotLabel === '头像') {
    return `构图严格锁定：参考图为${framing.shotLabel}照，人物可见范围截止于画面高度约 ${bottomPercent}% 处。输出必须与参考图相同的取景和底边位置，禁止向下延伸画面，禁止补画肩膀以下、手臂以下、身体、腿部或鞋子。`
  }

  return `构图严格锁定：参考图为${framing.shotLabel}照，人物可见范围截止于画面高度约 ${bottomPercent}% 处。输出必须与参考图相同的取景和底边位置，禁止向下延伸画面，禁止补画参考图中未出现的下半身、腿部、裤腿或鞋子。`
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string, mimeType = 'image/png') {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法裁切 AI 图片'))
        return
      }
      resolve(new File([blob], fileName, { type: blob.type || mimeType }))
    }, mimeType)
  })
}

export async function cropToReferenceFraming(aiFile: File, refFile: File): Promise<File> {
  const framing = await analyzeReferenceFraming(refFile)
  if (!framing?.shouldCrop) return aiFile

  const refFrame = await readImageFrame(refFile)
  const aiFrame = await readImageFrame(aiFile)
  if (!refFrame || !aiFrame) return aiFile

  let cropHeight = aiFrame.height

  const refBounds = findContentBounds(refFrame.width, refFrame.height, refFrame.data)
  if (refBounds && !framing.gownHemToBottom) {
    const subjectHeight = refBounds.maxY - refBounds.minY + 1
    const padding = Math.max(1, Math.round(subjectHeight * 0.02))
    const refCropBottom = Math.min(refFrame.height, refBounds.maxY + 1 + padding)
    cropHeight = Math.min(cropHeight, Math.max(1, Math.round(aiFrame.height * (refCropBottom / refFrame.height))))
  }

  const legCropHeight = findLegExtensionCropY(
    refFrame.width,
    refFrame.height,
    refFrame.data,
    aiFrame.width,
    aiFrame.height,
    aiFrame.data,
  )
  if (legCropHeight) {
    cropHeight = Math.min(cropHeight, legCropHeight)
  }

  if (cropHeight >= aiFrame.height - 2) return aiFile

  const aiImage = await loadImage(aiFile)
  const cropped = document.createElement('canvas')
  cropped.width = aiImage.width
  cropped.height = cropHeight
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return aiFile

  croppedCtx.drawImage(aiImage, 0, 0, aiImage.width, cropHeight, 0, 0, aiImage.width, cropHeight)
  return canvasToFile(cropped, aiFile.name, aiFile.type || 'image/png')
}
