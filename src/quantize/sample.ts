import { detectPixelGrid, sampleDetectedGrid } from './pixelGrid'

export type BoardShape = 'ratio' | 'square'

interface ImageDrawRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

export function fitGridToImage(image: HTMLImageElement, width: number, shape: BoardShape) {
  if (shape === 'square') return { cols: width, rows: width }
  return { cols: width, rows: Math.max(1, Math.round((width * image.height) / Math.max(image.width, 1))) }
}

function computeImageDrawRect(image: HTMLImageElement, shape: BoardShape): ImageDrawRect {
  if (shape === 'square') {
    const size = Math.min(image.width, image.height)
    return { sx: 0, sy: 0, sw: size, sh: size }
  }
  return { sx: 0, sy: 0, sw: image.width, sh: image.height }
}

function samplingScale(cols: number, rows: number) {
  return Math.max(cols, rows) > 96 ? 2 : 3
}

function colorKey(r: number, g: number, b: number) {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
}

function drawSource(image: HTMLImageElement, rect: ImageDrawRect, width: number, height: number, smooth: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('浏览器不支持 Canvas')
  ctx.imageSmoothingEnabled = smooth
  ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function tryAlignedSample(image: HTMLImageElement, rect: ImageDrawRect, cols: number, rows: number) {
  const maxSide = 720
  const scale = Math.min(1, maxSide / Math.max(rect.sw, rect.sh))
  const width = Math.max(2, Math.round(rect.sw * scale))
  const height = Math.max(2, Math.round(rect.sh * scale))
  const source = drawSource(image, rect, width, height, false)
  const detection = detectPixelGrid(source.data, width, height)
  if (!detection) return null
  return sampleDetectedGrid(source.data, width, height, detection, cols, rows)
}

export function drawImageToSampledGrid(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  shape: BoardShape,
  edgePriority: boolean,
) {
  const rect = computeImageDrawRect(image, shape)
  const aligned = tryAlignedSample(image, rect, cols, rows)
  if (aligned) return aligned

  const sampleScale = samplingScale(cols, rows)
  const sampled = drawSource(image, rect, cols * sampleScale, rows * sampleScale, !edgePriority)
  const source = sampled.data
  const averaged = new ImageData(cols, rows)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let visibleCount = 0
      let spread = 0
      const bins = new Map<number, { r: number; g: number; b: number; n: number }>()

      for (let sampleY = 0; sampleY < sampleScale; sampleY += 1) {
        for (let sampleX = 0; sampleX < sampleScale; sampleX += 1) {
          const sourceOffset = ((y * sampleScale + sampleY) * sampled.width + (x * sampleScale + sampleX)) * 4
          const sampleAlpha = source[sourceOffset + 3]
          alpha += sampleAlpha
          if (sampleAlpha < 80) continue
          const r = source[sourceOffset]
          const g = source[sourceOffset + 1]
          const b = source[sourceOffset + 2]
          red += r
          green += g
          blue += b
          visibleCount += 1
          const key = colorKey(r, g, b)
          const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
          bin.r += r
          bin.g += g
          bin.b += b
          bin.n += 1
          bins.set(key, bin)
        }
      }

      const targetOffset = (y * cols + x) * 4
      if (visibleCount === 0) {
        averaged.data[targetOffset + 3] = 0
        continue
      }

      const meanR = red / visibleCount
      const meanG = green / visibleCount
      const meanB = blue / visibleCount
      for (let sampleY = 0; sampleY < sampleScale; sampleY += 1) {
        for (let sampleX = 0; sampleX < sampleScale; sampleX += 1) {
          const sourceOffset = ((y * sampleScale + sampleY) * sampled.width + (x * sampleScale + sampleX)) * 4
          if (source[sourceOffset + 3] < 80) continue
          spread += (source[sourceOffset] - meanR) ** 2
            + (source[sourceOffset + 1] - meanG) ** 2
            + (source[sourceOffset + 2] - meanB) ** 2
        }
      }
      const dispersion = spread / visibleCount
      const edgeThreshold = edgePriority ? 400 : 900
      let outR = Math.round(meanR)
      let outG = Math.round(meanG)
      let outB = Math.round(meanB)
      if (dispersion >= edgeThreshold && visibleCount >= 3) {
        let winner: { r: number; g: number; b: number; n: number } | null = null
        for (const bin of bins.values()) {
          if (!winner || bin.n > winner.n) winner = bin
        }
        if (winner) {
          outR = Math.round(winner.r / winner.n)
          outG = Math.round(winner.g / winner.n)
          outB = Math.round(winner.b / winner.n)
        }
      }
      averaged.data[targetOffset] = outR
      averaged.data[targetOffset + 1] = outG
      averaged.data[targetOffset + 2] = outB
      averaged.data[targetOffset + 3] = Math.round(alpha / (sampleScale * sampleScale))
    }
  }

  return averaged
}
