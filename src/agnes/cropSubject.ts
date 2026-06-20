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
      reject(new Error('无法解析 AI 图片'))
    }
    image.src = url
  })
}

function isBackgroundPixel(r: number, g: number, b: number, a: number) {
  if (a < 80) return true
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  if (min > 238 && max - min < 18) return true
  if (min > 228 && max - min < 30) return true
  return false
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string, mimeType = 'image/png') {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法裁切 AI 图片'))
        return
      }
      resolve(new File([blob], fileName, { type: mimeType }))
    }, mimeType)
  })
}

interface ContentBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function findContentBounds(width: number, height: number, data: Uint8ClampedArray): ContentBounds | null {
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let found = false

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      if (isBackgroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) continue
      found = true
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (!found) return null
  return { minX, minY, maxX, maxY }
}

function cropCanvasToBounds(
  source: HTMLCanvasElement,
  bounds: ContentBounds,
  paddingRatio = 0.005,
): HTMLCanvasElement | null {
  const { width, height } = source
  const contentW = bounds.maxX - bounds.minX + 1
  const contentH = bounds.maxY - bounds.minY + 1
  if (contentW * contentH > width * height * 0.95) return null

  const padX = Math.max(1, Math.round(contentW * paddingRatio))
  const padY = Math.max(1, Math.round(contentH * paddingRatio))
  const cropX = Math.max(0, bounds.minX - padX)
  const cropY = Math.max(0, bounds.minY - padY)
  const cropW = Math.min(width - cropX, contentW + padX * 2)
  const cropH = Math.min(height - cropY, contentH + padY * 2)

  const cropped = document.createElement('canvas')
  cropped.width = cropW
  cropped.height = cropH
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return null

  croppedCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return cropped
}

export async function cropSubjectFromImage(file: File): Promise<File> {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return file

  ctx.drawImage(image, 0, 0)
  const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const initialBounds = findContentBounds(canvas.width, canvas.height, initialData.data)
  if (!initialBounds) return file

  let cropped = cropCanvasToBounds(canvas, initialBounds)
  if (!cropped) return file

  const contentW = initialBounds.maxX - initialBounds.minX + 1
  const contentH = initialBounds.maxY - initialBounds.minY + 1
  const initialFillRatio = (contentW * contentH) / (canvas.width * canvas.height)
  if (initialFillRatio < 0.6) {
    const croppedCtx = cropped.getContext('2d', { willReadFrequently: true })
    if (croppedCtx) {
      const innerData = croppedCtx.getImageData(0, 0, cropped.width, cropped.height)
      const innerBounds = findContentBounds(cropped.width, cropped.height, innerData.data)
      if (innerBounds) {
        const innerW = innerBounds.maxX - innerBounds.minX + 1
        const innerH = innerBounds.maxY - innerBounds.minY + 1
        const innerFillRatio = (innerW * innerH) / (cropped.width * cropped.height)
        if (innerFillRatio < 0.6) {
          const tighter = cropCanvasToBounds(cropped, innerBounds)
          if (tighter) cropped = tighter
        }
      }
    }
  }

  return canvasToFile(cropped, file.name, file.type || 'image/png')
}
