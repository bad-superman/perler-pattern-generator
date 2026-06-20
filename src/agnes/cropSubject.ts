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

export async function cropSubjectFromImage(file: File): Promise<File> {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return file

  ctx.drawImage(image, 0, 0)
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

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

  if (!found) return file

  const contentW = maxX - minX + 1
  const contentH = maxY - minY + 1
  if (contentW * contentH > width * height * 0.95) return file

  const padX = Math.max(2, Math.round(contentW * 0.02))
  const padY = Math.max(2, Math.round(contentH * 0.02))
  const cropX = Math.max(0, minX - padX)
  const cropY = Math.max(0, minY - padY)
  const cropW = Math.min(width - cropX, contentW + padX * 2)
  const cropH = Math.min(height - cropY, contentH + padY * 2)

  const cropped = document.createElement('canvas')
  cropped.width = cropW
  cropped.height = cropH
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return file

  croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return canvasToFile(cropped, file.name, file.type || 'image/png')
}
