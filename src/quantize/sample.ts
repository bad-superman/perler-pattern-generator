import { rgbToLab } from './color'
import { detectPixelGrid, sampleDetectedGrid } from './pixelGrid'

export const SMALL_GRID_MAX_SIDE = 56

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

interface SampleCluster {
  r: number
  g: number
  b: number
  n: number
}

function isOutlineTone(r: number, g: number, b: number) {
  return rgbToLab(r, g, b).l <= 36
}

function outlineStrokeCrosses(mask: Uint8Array, scale: number) {
  const seen = new Uint8Array(mask.length)
  const maxPixels = scale * 2
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    let count = 0
    let minX = scale
    let maxX = 0
    let minY = scale
    let maxY = 0
    let inner = false
    while (stack.length) {
      const index = stack.pop() as number
      const x = index % scale
      const y = Math.floor(index / scale)
      count += 1
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      if (x > 0 && x < scale - 1 && y > 0 && y < scale - 1) inner = true
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < scale - 1 ? index + 1 : -1,
        y > 0 ? index - scale : -1,
        y < scale - 1 ? index + scale : -1,
        x > 0 && y > 0 ? index - scale - 1 : -1,
        x < scale - 1 && y > 0 ? index - scale + 1 : -1,
        x > 0 && y < scale - 1 ? index + scale - 1 : -1,
        x < scale - 1 && y < scale - 1 ? index + scale + 1 : -1,
      ]
      for (const next of neighbors) {
        if (next < 0 || !mask[next] || seen[next]) continue
        seen[next] = 1
        stack.push(next)
      }
    }
    const spanX = maxX - minX + 1
    const spanY = maxY - minY + 1
    const thin = Math.min(spanX, spanY) <= 2
    const long = Math.max(spanX, spanY) >= 3
    if (inner && thin && long && count >= 3 && count <= maxPixels) return true
  }
  return false
}

function writeCluster(data: Uint8ClampedArray, offset: number, cluster: SampleCluster) {
  data[offset] = Math.round(cluster.r / cluster.n)
  data[offset + 1] = Math.round(cluster.g / cluster.n)
  data[offset + 2] = Math.round(cluster.b / cluster.n)
  data[offset + 3] = 255
}

export function drawImageSmallGrid(image: HTMLImageElement, cols: number, rows: number, shape: BoardShape) {
  const rect = computeImageDrawRect(image, shape)
  const aligned = tryAlignedSample(image, rect, cols, rows)
  if (aligned) return aligned

  const scale = 5
  const sampled = drawSource(image, rect, cols * scale, rows * scale, false)
  const source = sampled.data
  const averaged = new ImageData(cols, rows)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const targetOffset = (y * cols + x) * 4
      const clusters = new Map<number, SampleCluster>()
      const outlineBins = new Map<number, SampleCluster>()
      const outlineMask = new Uint8Array(scale * scale)
      let outlineCount = 0
      let visibleCount = 0
      let alpha = 0
      let largest: SampleCluster | null = null

      for (let sampleY = 0; sampleY < scale; sampleY += 1) {
        for (let sampleX = 0; sampleX < scale; sampleX += 1) {
          const sourceOffset = ((y * scale + sampleY) * sampled.width + (x * scale + sampleX)) * 4
          alpha += source[sourceOffset + 3]
          if (source[sourceOffset + 3] < 80) continue
          const r = source[sourceOffset]
          const g = source[sourceOffset + 1]
          const b = source[sourceOffset + 2]
          visibleCount += 1
          const key = colorKey(r, g, b)
          const cluster = clusters.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
          cluster.r += r
          cluster.g += g
          cluster.b += b
          cluster.n += 1
          clusters.set(key, cluster)
          if (!largest || cluster.n > largest.n) largest = cluster
          if (!isOutlineTone(r, g, b)) continue
          outlineMask[sampleY * scale + sampleX] = 1
          outlineCount += 1
          const outlineBin = outlineBins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
          outlineBin.r += r
          outlineBin.g += g
          outlineBin.b += b
          outlineBin.n += 1
          outlineBins.set(key, outlineBin)
        }
      }

      let outlineCluster: SampleCluster | null = null
      let outlineLightness = Number.POSITIVE_INFINITY
      for (const bin of outlineBins.values()) {
        const lab = rgbToLab(bin.r / bin.n, bin.g / bin.n, bin.b / bin.n)
        if (lab.l < outlineLightness) {
          outlineLightness = lab.l
          outlineCluster = bin
        }
      }
      if (visibleCount === 0 || Math.round(alpha / (scale * scale)) < 80) continue
      if (outlineCluster && outlineCount >= 3 && outlineStrokeCrosses(outlineMask, scale)) {
        writeCluster(averaged.data, targetOffset, outlineCluster)
        continue
      }
      if (largest && largest.n >= visibleCount * 0.6) {
        writeCluster(averaged.data, targetOffset, largest)
        continue
      }

      const centerX = Math.min(sampled.width - 1, x * scale + Math.floor(scale / 2))
      const centerY = Math.min(sampled.height - 1, y * scale + Math.floor(scale / 2))
      const centerOffset = (centerY * sampled.width + centerX) * 4
      const centerCluster = source[centerOffset + 3] >= 80
        ? clusters.get(colorKey(source[centerOffset], source[centerOffset + 1], source[centerOffset + 2]))
        : undefined
      let chosen = centerCluster && centerCluster.n >= 2 ? centerCluster : undefined
      if (!chosen) {
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const cluster of clusters.values()) {
          if (cluster.n < 2) continue
          const distanceR = cluster.r / cluster.n - source[centerOffset]
          const distanceG = cluster.g / cluster.n - source[centerOffset + 1]
          const distanceB = cluster.b / cluster.n - source[centerOffset + 2]
          const distance = distanceR * distanceR + distanceG * distanceG + distanceB * distanceB
          if (distance < nearestDistance) {
            nearestDistance = distance
            chosen = cluster
          }
        }
      }
      writeCluster(averaged.data, targetOffset, chosen ?? largest ?? { r: source[centerOffset], g: source[centerOffset + 1], b: source[centerOffset + 2], n: 1 })
    }
  }

  return averaged
}
