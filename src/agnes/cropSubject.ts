import {
  estimateBackgroundColor,
  findContentBounds,
  isBackgroundPixel,
  type ContentBounds,
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
      reject(new Error('无法解析 AI 图片'))
    }
    image.src = url
  })
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

function cropCanvasToBounds(
  source: HTMLCanvasElement,
  bounds: ContentBounds,
  paddingRatio = 0.005,
  square = false,
): HTMLCanvasElement | null {
  const { width, height } = source
  const contentW = bounds.maxX - bounds.minX + 1
  const contentH = bounds.maxY - bounds.minY + 1

  const padX = Math.max(1, Math.round(contentW * paddingRatio))
  const padY = Math.max(1, Math.round(contentH * paddingRatio))
  let cropX = bounds.minX - padX
  let cropY = bounds.minY - padY
  let cropW = contentW + padX * 2
  let cropH = contentH + padY * 2

  if (square) {
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const cropSize = Math.max(cropW, cropH)
    cropW = cropSize
    cropH = cropSize
    cropX = Math.round(centerX - cropW / 2)
    cropY = Math.round(centerY - cropH / 2)
  }

  const cropped = document.createElement('canvas')
  cropped.width = Math.max(1, Math.round(cropW))
  cropped.height = Math.max(1, Math.round(cropH))
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return null

  croppedCtx.fillStyle = '#fffaf1'
  croppedCtx.fillRect(0, 0, cropped.width, cropped.height)

  const sourceX = Math.max(0, cropX)
  const sourceY = Math.max(0, cropY)
  const sourceRight = Math.min(width, cropX + cropW)
  const sourceBottom = Math.min(height, cropY + cropH)
  const sourceW = Math.max(0, sourceRight - sourceX)
  const sourceH = Math.max(0, sourceBottom - sourceY)
  if (!sourceW || !sourceH) return null

  croppedCtx.drawImage(
    source,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    sourceX - cropX,
    sourceY - cropY,
    sourceW,
    sourceH,
  )
  return cropped
}

interface ContentComponent extends ContentBounds {
  area: number
  centerX: number
  centerY: number
}

function findContentComponents(width: number, height: number, data: Uint8ClampedArray) {
  const background = estimateBackgroundColor(width, height, data)
  const visited = new Uint8Array(width * height)
  const components: ContentComponent[] = []
  const directions = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ] as const

  const isContent = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    return !isBackgroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startKey = y * width + x
      if (visited[startKey] || !isContent(x, y)) continue

      const queue: Array<[number, number]> = [[x, y]]
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y
      let totalX = 0
      let totalY = 0
      let area = 0
      visited[startKey] = 1

      for (let head = 0; head < queue.length; head += 1) {
        const [cx, cy] = queue[head]
        area += 1
        totalX += cx
        totalY += cy
        minX = Math.min(minX, cx)
        minY = Math.min(minY, cy)
        maxX = Math.max(maxX, cx)
        maxY = Math.max(maxY, cy)

        directions.forEach(([dx, dy]) => {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
          const key = ny * width + nx
          if (visited[key] || !isContent(nx, ny)) return
          visited[key] = 1
          queue.push([nx, ny])
        })
      }

      components.push({
        minX,
        minY,
        maxX,
        maxY,
        area,
        centerX: totalX / area,
        centerY: totalY / area,
      })
    }
  }

  return components
}

function mergeBounds(bounds: ContentBounds, component: ContentBounds): ContentBounds {
  return {
    minX: Math.min(bounds.minX, component.minX),
    minY: Math.min(bounds.minY, component.minY),
    maxX: Math.max(bounds.maxX, component.maxX),
    maxY: Math.max(bounds.maxY, component.maxY),
  }
}

function componentGap(a: ContentBounds, b: ContentBounds) {
  const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX) - 1)
  const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY) - 1)
  return Math.hypot(dx, dy)
}

function pickPrimarySubjectBounds(width: number, height: number, data: Uint8ClampedArray) {
  const components = findContentComponents(width, height, data)
    .filter((component) => component.area >= Math.max(8, width * height * 0.00005))
  if (!components.length) return null

  const canvasCenterX = width / 2
  const canvasCenterY = height / 2
  const diagonal = Math.hypot(width, height)
  const primary = components
    .sort((a, b) => {
      const score = (component: ContentComponent) => (
        component.area * (1 - Math.min(0.45, Math.hypot(component.centerX - canvasCenterX, component.centerY - canvasCenterY) / diagonal))
      )
      return score(b) - score(a)
    })[0]

  const primaryW = primary.maxX - primary.minX + 1
  const primaryH = primary.maxY - primary.minY + 1
  const primaryLongSide = Math.max(primaryW, primaryH)
  let bounds: ContentBounds = {
    minX: primary.minX,
    minY: primary.minY,
    maxX: primary.maxX,
    maxY: primary.maxY,
  }

  components.forEach((component) => {
    if (component === primary) return
    const componentW = component.maxX - component.minX + 1
    const componentH = component.maxY - component.minY + 1
    const componentLongSide = Math.max(componentW, componentH)
    const expandedPrimary = {
      minX: primary.minX - primaryLongSide * 0.22,
      minY: primary.minY - primaryLongSide * 0.22,
      maxX: primary.maxX + primaryLongSide * 0.22,
      maxY: primary.maxY + primaryLongSide * 0.22,
    }
    const centerNearPrimary = component.centerX >= expandedPrimary.minX
      && component.centerX <= expandedPrimary.maxX
      && component.centerY >= expandedPrimary.minY
      && component.centerY <= expandedPrimary.maxY
    const largeRelatedPart = component.area >= primary.area * 0.08
    const closeSmallPart = component.area >= primary.area * 0.01
      && componentLongSide <= primaryLongSide * 0.45
      && componentGap(primary, component) <= primaryLongSide * 0.12

    if (centerNearPrimary || largeRelatedPart || closeSmallPart) {
      bounds = mergeBounds(bounds, component)
    }
  })

  return bounds
}

export async function cropSubjectFromImage(file: File, options: { square?: boolean } = {}): Promise<File> {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return file

  ctx.drawImage(image, 0, 0)
  const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const primaryBounds = pickPrimarySubjectBounds(canvas.width, canvas.height, initialData.data)
  const initialBounds = primaryBounds ?? findContentBounds(canvas.width, canvas.height, initialData.data)
  if (!initialBounds) return file

  const paddingRatio = options.square ? 0.1 : 0.005
  let cropped = cropCanvasToBounds(canvas, initialBounds, paddingRatio, options.square ?? false)
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
          const tighter = cropCanvasToBounds(cropped, innerBounds, paddingRatio, options.square ?? false)
          if (tighter) cropped = tighter
        }
      }
    }
  }

  return canvasToFile(cropped, file.name, file.type || 'image/png')
}
