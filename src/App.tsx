import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Grid3X3, ImageUp, Info, LoaderCircle, Printer, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import { saveAs } from 'file-saver'
import { generateAgnesImage, pickAgnesSize } from './agnes/client'
import { cropSubjectFromImage } from './agnes/cropSubject'
import { cropToReferenceFraming } from './agnes/referenceFraming'
import { AGNES_STYLE_PRESETS } from './agnes/styles'
import {
  DEFAULT_PALETTE_BRAND,
  getPalette,
  getPaletteColors,
  getPaletteSize,
  type BeadPaletteEntry,
  type PaletteBrand,
} from './palettes'
import './App.css'

interface PaletteColor {
  code: string
  name: string
  hex: string
  count: number
  symbol: string
}

interface BeadCell {
  colorIndex: number
  hex: string
  symbol: string
}

type BoardShape = 'ratio' | 'square'
type RenderMode = 'symbols' | 'solid'
type SourceMode = 'local' | 'ai'
type SamplingMode = 'average' | 'dominant' | 'feature'
type QuantizeMode = 'default' | 'craft'

const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789◆●■▲★✦✚✕⬟⬢'
const DEFAULT_GRID_SIZE = 48
const EMPTY_CELL_HEX = '#fffaf1'
const AI_DEFAULT_GRID_SIZE = 36
const AI_GRID_RECOMMEND_MAX = 56
const PROMO_AD_URL = 'https://p.pinduoduo.com/b5eq4V9Z?sc=EFAC'
const PROMO_AD_IMAGE = '/promo/pinduoduo-beads.jpeg'
const HERO_CAROUSEL_INTERVAL_MS = 5000
const HERO_CAROUSEL_SLIDE_COUNT = 2
const QUICK_GRID_SIZES = [32, 36, 48, 64, 96] as const
const CRAFT_DARK_LUMA_THRESHOLD = 82
const CRAFT_FEATURE_LUMA_THRESHOLD = 96
const CRAFT_36_FEATURE_LUMA_THRESHOLD = 118
const CRAFT_BACKGROUND_DISTANCE_THRESHOLD = 34
const CRAFT_BACKGROUND_SOFT_DISTANCE_THRESHOLD = 52
const CRAFT_DETAIL_MIN_COVERAGE = 0.08
const CRAFT_FEATURE_MIN_COVERAGE = 0.12
const CRAFT_36_DETAIL_MIN_COVERAGE = 0.04
const CRAFT_36_FEATURE_MIN_COVERAGE = 0.055
const DEFAULT_AI_STYLE_ID = 'cute-chibi'
const DEFAULT_AI_EXTRA_PROMPT = [
  '目标：36×36 也清晰完整的艳丽可爱 Q 版拼豆图纸。',
  '请主动把原图改造成糖果色 Q 版，不要照搬原图的灰暗颜色或写实光影。',
  '五官和边缘要为小尺寸拼豆重画：3×3 左右的大眼睛、3-5 格的完整短嘴巴、连续粗轮廓、少色大色块。',
].join(' ')

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampByte(value: number) {
  return Math.round(clamp(value, 0, 255))
}

function nearestPaletteColor(r: number, g: number, b: number, palette: readonly BeadPaletteEntry[]) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  palette.forEach(([, , hex], index) => {
    const color = hexToRgb(hex)
    const distance = (r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

function getColorLuma(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return r * 0.299 + g * 0.587 + b * 0.114
}

function getRgbLuma(color: RgbColor) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114
}

interface HslColor {
  h: number
  s: number
  l: number
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const normalizedR = r / 255
  const normalizedG = g / 255
  const normalizedB = b / 255
  const max = Math.max(normalizedR, normalizedG, normalizedB)
  const min = Math.min(normalizedR, normalizedG, normalizedB)
  const lightness = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: lightness }

  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue: number
  if (max === normalizedR) {
    hue = (normalizedG - normalizedB) / delta + (normalizedG < normalizedB ? 6 : 0)
  } else if (max === normalizedG) {
    hue = (normalizedB - normalizedR) / delta + 2
  } else {
    hue = (normalizedR - normalizedG) / delta + 4
  }

  return { h: hue / 6, s: saturation, l: lightness }
}

function hueToRgb(p: number, q: number, t: number) {
  let nextT = t
  if (nextT < 0) nextT += 1
  if (nextT > 1) nextT -= 1
  if (nextT < 1 / 6) return p + (q - p) * 6 * nextT
  if (nextT < 1 / 2) return q
  if (nextT < 2 / 3) return p + (q - p) * (2 / 3 - nextT) * 6
  return p
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
  if (s === 0) {
    const value = clampByte(l * 255)
    return { r: value, g: value, b: value }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: clampByte(hueToRgb(p, q, h + 1 / 3) * 255),
    g: clampByte(hueToRgb(p, q, h) * 255),
    b: clampByte(hueToRgb(p, q, h - 1 / 3) * 255),
  }
}

function isDarkPaletteColor(entry: BeadPaletteEntry) {
  return getColorLuma(entry[2]) <= CRAFT_DARK_LUMA_THRESHOLD
}

function getCraftMaxColors(longSide: number, userMaxColors: number) {
  if (longSide <= 32) return Math.min(userMaxColors, 6)
  if (longSide <= 40) return Math.min(userMaxColors, 7)
  if (longSide <= 48) return Math.min(userMaxColors, 8)
  if (longSide <= 56) return Math.min(userMaxColors, 10)
  return Math.min(userMaxColors, 12)
}

function quantizeRgbBucket(r: number, g: number, b: number) {
  return `${Math.round(r / 16)}-${Math.round(g / 16)}-${Math.round(b / 16)}`
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = reject
    image.src = url
  })
}

function fitGridToImage(image: HTMLImageElement, longSide: number, shape: BoardShape) {
  if (shape === 'square') return { cols: longSide, rows: longSide }
  if (image.width >= image.height) {
    return { cols: longSide, rows: Math.max(1, Math.round((longSide * image.height) / image.width)) }
  }
  return { cols: Math.max(1, Math.round((longSide * image.width) / image.height)), rows: longSide }
}

interface ImageDrawRect {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

function computeImageDrawRect(image: HTMLImageElement, cols: number, rows: number, shape: BoardShape): ImageDrawRect {
  if (shape === 'square') {
    const size = Math.min(image.width, image.height)
    return {
      sx: Math.max(0, Math.round((image.width - size) / 2)),
      sy: Math.max(0, Math.round((image.height - size) / 2)),
      sw: size,
      sh: size,
      dx: 0,
      dy: 0,
      dw: cols,
      dh: rows,
    }
  }
  return { sx: 0, sy: 0, sw: image.width, sh: image.height, dx: 0, dy: 0, dw: cols, dh: rows }
}

function getGridSizeHint(size: number) {
  if (size <= 32) return '适合简单图标/头像，建议 8–12 色'
  if (size <= 56) return '推荐范围，清晰度和豆数较平衡'
  return '更清晰但豆数多，导出图纸也更大'
}

function getExportCellSize(gridCols: number, gridRows: number) {
  const longSide = Math.max(gridCols, gridRows)
  if (longSide >= 96) return 8
  if (longSide > 64) return 12
  return 16
}

function getSamplingScale(cols: number, rows: number) {
  if (Math.max(cols, rows) <= 40) return 8
  return Math.max(cols, rows) <= 64 ? 4 : 1
}

function getCraftFeatureLumaThreshold(longSide: number) {
  return longSide <= 40 ? CRAFT_36_FEATURE_LUMA_THRESHOLD : CRAFT_FEATURE_LUMA_THRESHOLD
}

function getCraftFeatureMinCoverage(longSide: number) {
  return longSide <= 40 ? CRAFT_36_FEATURE_MIN_COVERAGE : CRAFT_FEATURE_MIN_COVERAGE
}

function getCraftDetailMinCoverage(longSide: number) {
  return longSide <= 40 ? CRAFT_36_DETAIL_MIN_COVERAGE : CRAFT_DETAIL_MIN_COVERAGE
}

function drawImageToSampledGrid(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  shape: BoardShape,
  sharpQuantize: boolean,
  samplingMode: SamplingMode = 'average',
) {
  const sampleScale = getSamplingScale(cols, rows)
  const longSide = Math.max(cols, rows)
  const featureLumaThreshold = getCraftFeatureLumaThreshold(longSide)
  const featureMinCoverage = getCraftFeatureMinCoverage(longSide)
  const detailMinCoverage = getCraftDetailMinCoverage(longSide)
  const canvas = document.createElement('canvas')
  canvas.width = cols * sampleScale
  canvas.height = rows * sampleScale
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('浏览器不支持 Canvas')

  ctx.imageSmoothingEnabled = sampleScale > 1 || !sharpQuantize
  const drawRect = computeImageDrawRect(image, cols, rows, shape)
  ctx.drawImage(
    image,
    drawRect.sx,
    drawRect.sy,
    drawRect.sw,
    drawRect.sh,
    drawRect.dx * sampleScale,
    drawRect.dy * sampleScale,
    drawRect.dw * sampleScale,
    drawRect.dh * sampleScale,
  )

  if (sampleScale === 1) return ctx.getImageData(0, 0, cols, rows)

  const source = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const averaged = new ImageData(cols, rows)
  const totalSamples = sampleScale * sampleScale

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let visibleCount = 0
      let darkR = 0
      let darkG = 0
      let darkB = 0
      let darkA = 0
      let darkCount = 0
      const buckets = new Map<string, { count: number; r: number; g: number; b: number; a: number }>()

      for (let sampleY = 0; sampleY < sampleScale; sampleY += 1) {
        for (let sampleX = 0; sampleX < sampleScale; sampleX += 1) {
          const sourceX = x * sampleScale + sampleX
          const sourceY = y * sampleScale + sampleY
          const sourceOffset = (sourceY * canvas.width + sourceX) * 4
          const alpha = source[sourceOffset + 3]
          if (alpha < 80) continue
          const sourceR = source[sourceOffset]
          const sourceG = source[sourceOffset + 1]
          const sourceB = source[sourceOffset + 2]
          r += sourceR
          g += sourceG
          b += sourceB
          a += alpha
          visibleCount += 1
          const luma = sourceR * 0.299 + sourceG * 0.587 + sourceB * 0.114
          if (samplingMode === 'feature' && luma <= featureLumaThreshold) {
            darkR += sourceR
            darkG += sourceG
            darkB += sourceB
            darkA += alpha
            darkCount += 1
          }

          if (samplingMode === 'dominant' || samplingMode === 'feature') {
            const bucketKey = quantizeRgbBucket(sourceR, sourceG, sourceB)
            const bucket = buckets.get(bucketKey) ?? { count: 0, r: 0, g: 0, b: 0, a: 0 }
            bucket.count += 1
            bucket.r += sourceR
            bucket.g += sourceG
            bucket.b += sourceB
            bucket.a += alpha
            buckets.set(bucketKey, bucket)
          }
        }
      }

      const targetOffset = (y * cols + x) * 4
      if (visibleCount === 0) {
        averaged.data[targetOffset + 3] = 0
      } else if (
        samplingMode === 'feature'
        && darkCount / totalSamples >= featureMinCoverage
      ) {
        averaged.data[targetOffset] = Math.round(darkR / darkCount)
        averaged.data[targetOffset + 1] = Math.round(darkG / darkCount)
        averaged.data[targetOffset + 2] = Math.round(darkB / darkCount)
        averaged.data[targetOffset + 3] = Math.max(180, Math.round(darkA / darkCount))
      } else if (samplingMode === 'dominant' && buckets.size) {
        const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0]
        averaged.data[targetOffset] = Math.round(dominant.r / dominant.count)
        averaged.data[targetOffset + 1] = Math.round(dominant.g / dominant.count)
        averaged.data[targetOffset + 2] = Math.round(dominant.b / dominant.count)
        averaged.data[targetOffset + 3] = Math.round(dominant.a / totalSamples)
      } else if (samplingMode === 'feature' && buckets.size) {
        const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0]
        averaged.data[targetOffset] = Math.round(dominant.r / dominant.count)
        averaged.data[targetOffset + 1] = Math.round(dominant.g / dominant.count)
        averaged.data[targetOffset + 2] = Math.round(dominant.b / dominant.count)
        averaged.data[targetOffset + 3] = visibleCount / totalSamples >= detailMinCoverage
          ? 255
          : Math.round(dominant.a / totalSamples)
      } else {
        averaged.data[targetOffset] = Math.round(r / visibleCount)
        averaged.data[targetOffset + 1] = Math.round(g / visibleCount)
        averaged.data[targetOffset + 2] = Math.round(b / visibleCount)
        averaged.data[targetOffset + 3] = Math.round(a / totalSamples)
      }
    }
  }

  return averaged
}

function getImageDataOffset(x: number, y: number, width: number) {
  return (y * width + x) * 4
}

interface RgbColor {
  r: number
  g: number
  b: number
}

function colorDistanceSquared(a: RgbColor, b: RgbColor) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
}

function getImageDataColor(data: Uint8ClampedArray, offset: number): RgbColor {
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
}

function estimateEdgeBackgroundColor(imageData: ImageData): RgbColor {
  const { width, height, data } = imageData
  const samples: RgbColor[] = []
  const samplePoint = (x: number, y: number) => {
    const offset = getImageDataOffset(
      Math.min(width - 1, Math.max(0, x)),
      Math.min(height - 1, Math.max(0, y)),
      width,
    )
    if (data[offset + 3] >= 80) samples.push(getImageDataColor(data, offset))
  }

  for (let x = 0; x < width; x += 1) {
    samplePoint(x, 0)
    samplePoint(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    samplePoint(0, y)
    samplePoint(width - 1, y)
  }

  if (!samples.length) return { r: 255, g: 255, b: 255 }
  const sortedR = samples.map((color) => color.r).sort((a, b) => a - b)
  const sortedG = samples.map((color) => color.g).sort((a, b) => a - b)
  const sortedB = samples.map((color) => color.b).sort((a, b) => a - b)
  const middle = Math.floor(samples.length / 2)
  return { r: sortedR[middle], g: sortedG[middle], b: sortedB[middle] }
}

function isCraftBackgroundCandidate(color: RgbColor, alpha: number, background: RgbColor) {
  if (alpha < 80) return true
  const min = Math.min(color.r, color.g, color.b)
  const max = Math.max(color.r, color.g, color.b)
  const chroma = max - min
  const distance = colorDistanceSquared(color, background)
  if (distance <= CRAFT_BACKGROUND_DISTANCE_THRESHOLD ** 2) return true
  return min >= 228 && chroma <= 32 && distance <= CRAFT_BACKGROUND_SOFT_DISTANCE_THRESHOLD ** 2
}

function removeCraftEdgeBackground(imageData: ImageData) {
  const { width, height, data } = imageData
  if (!width || !height) return imageData

  const background = estimateEdgeBackgroundColor(imageData)
  const visited = new Uint8Array(width * height)
  const queue: Array<[number, number]> = []
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (visited[index]) return
    const offset = getImageDataOffset(x, y, width)
    if (!isCraftBackgroundCandidate(getImageDataColor(data, offset), data[offset + 3], background)) return
    visited[index] = 1
    queue.push([x, y])
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head]
    enqueue(x + 1, y)
    enqueue(x - 1, y)
    enqueue(x, y + 1)
    enqueue(x, y - 1)
  }

  const cleaned = new ImageData(new Uint8ClampedArray(data), width, height)
  for (let index = 0; index < visited.length; index += 1) {
    if (!visited[index]) continue
    cleaned.data[index * 4 + 3] = 0
  }

  return cleaned
}

function boostCraftSourceColors(imageData: ImageData) {
  const enhanced = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
  const { data } = enhanced

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 80) continue
    const color = { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
    const luma = getRgbLuma(color)
    const hsl = rgbToHsl(color)
    const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)

    if (luma <= CRAFT_DARK_LUMA_THRESHOLD) {
      const darkened = hslToRgb({
        h: hsl.h,
        s: clamp(hsl.s * 1.08 + 0.04, 0, 0.92),
        l: clamp(hsl.l * 0.82, 0.02, 0.24),
      })
      data[offset] = darkened.r
      data[offset + 1] = darkened.g
      data[offset + 2] = darkened.b
      data[offset + 3] = Math.max(data[offset + 3], 230)
      continue
    }

    const boosted = hslToRgb({
      h: hsl.h,
      s: chroma < 16 ? clamp(hsl.s * 1.08, 0, 0.38) : clamp(hsl.s * 1.38 + 0.08, 0.32, 0.95),
      l: clamp(hsl.l * 1.05 + 0.025, 0.25, 0.88),
    })
    data[offset] = boosted.r
    data[offset + 1] = boosted.g
    data[offset + 2] = boosted.b
    data[offset + 3] = Math.max(data[offset + 3], 220)
  }

  return enhanced
}

function getPaletteEdgeScores(imageData: ImageData, paletteIndexes: number[], palette: readonly BeadPaletteEntry[]) {
  const { width, height, data } = imageData
  const edgeScores = new Map<number, number>()
  const directions = [[1, 0], [0, 1]] as const

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = getImageDataOffset(x, y, width)
      if (data[offset + 3] < 80) continue
      const paletteIndex = paletteIndexes[y * width + x]
      if (paletteIndex < 0) continue
      const current = hexToRgb(palette[paletteIndex][2])

      directions.forEach(([dx, dy]) => {
        const nx = x + dx
        const ny = y + dy
        if (nx >= width || ny >= height) return
        const neighborOffset = getImageDataOffset(nx, ny, width)
        if (data[neighborOffset + 3] < 80) return
        const neighborPaletteIndex = paletteIndexes[ny * width + nx]
        if (neighborPaletteIndex < 0 || neighborPaletteIndex === paletteIndex) return
        const neighbor = hexToRgb(palette[neighborPaletteIndex][2])
        const contrast = Math.abs(current.r - neighbor.r) + Math.abs(current.g - neighbor.g) + Math.abs(current.b - neighbor.b)
        if (contrast < 90) return
        const bonus = isDarkPaletteColor(palette[paletteIndex]) ? 2 : 1
        edgeScores.set(paletteIndex, (edgeScores.get(paletteIndex) ?? 0) + bonus)
        edgeScores.set(neighborPaletteIndex, (edgeScores.get(neighborPaletteIndex) ?? 0) + (isDarkPaletteColor(palette[neighborPaletteIndex]) ? 2 : 1))
      })
    }
  }

  return edgeScores
}

function selectPaletteIndexes(
  imageData: ImageData,
  beadPalette: readonly BeadPaletteEntry[],
  maxColorsForMode: number,
  quantizeMode: QuantizeMode,
) {
  const paletteIndexes: number[] = []
  const frequency = new Map<number, number>()
  const { width, height, data } = imageData

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = getImageDataOffset(x, y, width)
      if (data[offset + 3] < 80) {
        paletteIndexes.push(-1)
        continue
      }
      const index = nearestPaletteColor(data[offset], data[offset + 1], data[offset + 2], beadPalette)
      paletteIndexes.push(index)
      frequency.set(index, (frequency.get(index) ?? 0) + 1)
    }
  }

  if (quantizeMode === 'default') {
    return [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColorsForMode)
      .map(([index]) => index)
  }

  const edgeScores = getPaletteEdgeScores(imageData, paletteIndexes, beadPalette)
  const selected = [...frequency.entries()]
    .sort((a, b) => {
      const scoreA = a[1] + (edgeScores.get(a[0]) ?? 0) * 1.8 + (isDarkPaletteColor(beadPalette[a[0]]) ? Math.min(a[1], 24) : 0)
      const scoreB = b[1] + (edgeScores.get(b[0]) ?? 0) * 1.8 + (isDarkPaletteColor(beadPalette[b[0]]) ? Math.min(b[1], 24) : 0)
      return scoreB - scoreA
    })
    .slice(0, maxColorsForMode)
    .map(([index]) => index)

  if (!selected.some((index) => isDarkPaletteColor(beadPalette[index]))) {
    const darkestFrequent = [...frequency.keys()]
      .filter((index) => isDarkPaletteColor(beadPalette[index]))
      .sort((a, b) => (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0))[0]
    if (darkestFrequent !== undefined) selected[selected.length - 1] = darkestFrequent
  }

  return [...new Set(selected)]
}

function buildGridFromImageData(
  imageData: ImageData,
  selectedPalette: PaletteColor[],
  selectedColors: BeadPaletteEntry[],
) {
  const grid: BeadCell[][] = []
  for (let y = 0; y < imageData.height; y += 1) {
    const row: BeadCell[] = []
    for (let x = 0; x < imageData.width; x += 1) {
      const offset = getImageDataOffset(x, y, imageData.width)
      if (imageData.data[offset + 3] < 80) {
        row.push({ colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' })
        continue
      }
      const originalNearest = nearestPaletteColor(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], selectedColors)
      selectedPalette[originalNearest].count += 1
      row.push({
        colorIndex: originalNearest,
        hex: selectedPalette[originalNearest].hex,
        symbol: selectedPalette[originalNearest].symbol,
      })
    }
    grid.push(row)
  }
  return grid
}

const CARDINAL_DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const
const ALL_DIRECTIONS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const

function cloneGrid(grid: BeadCell[][]) {
  return grid.map((row) => row.map((cell) => ({ ...cell })))
}

function recountPalette(grid: BeadCell[][], selectedPalette: PaletteColor[]) {
  selectedPalette.forEach((color) => { color.count = 0 })
  grid.forEach((row) => row.forEach((cell) => {
    if (cell.colorIndex >= 0) selectedPalette[cell.colorIndex].count += 1
  }))
}

function makePaletteCell(index: number, selectedPalette: PaletteColor[]): BeadCell {
  return {
    colorIndex: index,
    hex: selectedPalette[index].hex,
    symbol: selectedPalette[index].symbol,
  }
}

function getDominantIndex(indexes: number[]) {
  const counts = new Map<number, number>()
  indexes.forEach((index) => {
    if (index >= 0) counts.set(index, (counts.get(index) ?? 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1
}

function getCraftDarkIndex(indexes: number[], selectedPalette: PaletteColor[]) {
  const darkIndexes = indexes.filter((index) => (
    index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD
  ))
  return getDominantIndex(darkIndexes)
}

function cleanupCraftGrid(grid: BeadCell[][], selectedPalette: PaletteColor[]) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (!rows || !cols) return grid

  const isDarkIndex = (index: number) => index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD
  const next = grid.map((row) => row.map((cell) => ({ ...cell })))

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = grid[y][x]
      if (cell.colorIndex < 0 || isDarkIndex(cell.colorIndex)) continue
      const neighborCounts = new Map<number, number>()
      CARDINAL_DIRECTIONS.forEach(([dx, dy]) => {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
        const neighborIndex = grid[ny][nx].colorIndex
        if (neighborIndex >= 0) neighborCounts.set(neighborIndex, (neighborCounts.get(neighborIndex) ?? 0) + 1)
      })
      const [dominantIndex, dominantCount] = [...neighborCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0]
      if (dominantIndex >= 0 && dominantIndex !== cell.colorIndex && dominantCount >= 3) {
        next[y][x] = {
          colorIndex: dominantIndex,
          hex: selectedPalette[dominantIndex].hex,
          symbol: selectedPalette[dominantIndex].symbol,
        }
      }
    }
  }

  recountPalette(next, selectedPalette)
  return next
}

function closeCraftSubjectGaps(grid: BeadCell[][], selectedPalette: PaletteColor[]) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (!rows || !cols) return grid

  const next = cloneGrid(grid)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[y][x].colorIndex >= 0) continue
      const cardinalIndexes = CARDINAL_DIRECTIONS
        .map(([dx, dy]) => grid[y + dy]?.[x + dx]?.colorIndex ?? -1)
        .filter((index) => index >= 0)
      const allIndexes = ALL_DIRECTIONS
        .map(([dx, dy]) => grid[y + dy]?.[x + dx]?.colorIndex ?? -1)
        .filter((index) => index >= 0)
      if (cardinalIndexes.length >= 3 || allIndexes.length >= 6) {
        const fillIndex = getDominantIndex(cardinalIndexes.length >= 3 ? cardinalIndexes : allIndexes)
        if (fillIndex >= 0) next[y][x] = makePaletteCell(fillIndex, selectedPalette)
      }
    }
  }

  return next
}

function connectCraftDarkDetails(grid: BeadCell[][], selectedPalette: PaletteColor[]) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (!rows || !cols) return grid

  const isDarkIndex = (index: number) => index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD
  const next = cloneGrid(grid)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const currentIndex = grid[y][x].colorIndex
      if (isDarkIndex(currentIndex)) continue

      const left = grid[y]?.[x - 1]?.colorIndex ?? -1
      const right = grid[y]?.[x + 1]?.colorIndex ?? -1
      const up = grid[y - 1]?.[x]?.colorIndex ?? -1
      const down = grid[y + 1]?.[x]?.colorIndex ?? -1
      const allIndexes = ALL_DIRECTIONS.map(([dx, dy]) => grid[y + dy]?.[x + dx]?.colorIndex ?? -1)
      const darkNeighborCount = allIndexes.filter(isDarkIndex).length

      let fillIndex = -1
      if (isDarkIndex(left) && isDarkIndex(right)) fillIndex = getCraftDarkIndex([left, right], selectedPalette)
      if (fillIndex < 0 && isDarkIndex(up) && isDarkIndex(down)) fillIndex = getCraftDarkIndex([up, down], selectedPalette)
      if (fillIndex < 0 && darkNeighborCount >= 3) fillIndex = getCraftDarkIndex(allIndexes, selectedPalette)

      if (fillIndex >= 0) next[y][x] = makePaletteCell(fillIndex, selectedPalette)
    }
  }

  return next
}

function reinforceTinyDarkFeatures(grid: BeadCell[][], selectedPalette: PaletteColor[], longSide: number) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (!rows || !cols || longSide > 64) return grid

  const isDarkIndex = (index: number) => index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD
  const visited = new Uint8Array(rows * cols)
  const next = cloneGrid(grid)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const startIndex = grid[y][x].colorIndex
      const startKey = y * cols + x
      if (visited[startKey] || !isDarkIndex(startIndex)) continue

      const component: Array<[number, number]> = []
      const queue: Array<[number, number]> = [[x, y]]
      visited[startKey] = 1

      for (let head = 0; head < queue.length; head += 1) {
        const [cx, cy] = queue[head]
        component.push([cx, cy])
        ALL_DIRECTIONS.forEach(([dx, dy]) => {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
          const key = ny * cols + nx
          if (visited[key] || grid[ny][nx].colorIndex !== startIndex) return
          visited[key] = 1
          queue.push([nx, ny])
        })
      }

      if (component.length < 1 || component.length > 2) continue
      const averageY = component.reduce((total, [, cy]) => total + cy, 0) / component.length
      if (averageY > rows * 0.78) continue

      const candidates = new Map<string, { x: number; y: number; solid: number; empty: number }>()
      component.forEach(([cx, cy]) => {
        CARDINAL_DIRECTIONS.forEach(([dx, dy]) => {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
          if (grid[ny][nx].colorIndex < 0 || isDarkIndex(grid[ny][nx].colorIndex)) return
          const key = `${nx},${ny}`
          if (candidates.has(key)) return

          let solid = 0
          let empty = 0
          ALL_DIRECTIONS.forEach(([aroundDx, aroundDy]) => {
            const aroundIndex = grid[ny + aroundDy]?.[nx + aroundDx]?.colorIndex ?? -1
            if (aroundIndex >= 0) solid += 1
            else empty += 1
          })
          candidates.set(key, { x: nx, y: ny, solid, empty })
        })
      })

      const candidate = [...candidates.values()]
        .filter((item) => item.solid >= item.empty)
        .sort((a, b) => b.solid - a.solid || Math.abs(a.y - averageY) - Math.abs(b.y - averageY))[0]
      if (candidate) next[candidate.y][candidate.x] = makePaletteCell(startIndex, selectedPalette)
    }
  }

  return next
}

function removeTinyDetachedCraftIslands(grid: BeadCell[][]) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (!rows || !cols) return grid

  const visited = new Uint8Array(rows * cols)
  const components: Array<Array<[number, number]>> = []

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const startKey = y * cols + x
      if (visited[startKey] || grid[y][x].colorIndex < 0) continue

      const component: Array<[number, number]> = []
      const queue: Array<[number, number]> = [[x, y]]
      visited[startKey] = 1
      for (let head = 0; head < queue.length; head += 1) {
        const [cx, cy] = queue[head]
        component.push([cx, cy])
        CARDINAL_DIRECTIONS.forEach(([dx, dy]) => {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
          const key = ny * cols + nx
          if (visited[key] || grid[ny][nx].colorIndex < 0) return
          visited[key] = 1
          queue.push([nx, ny])
        })
      }
      components.push(component)
    }
  }

  if (components.length <= 1) return grid
  const largest = Math.max(...components.map((component) => component.length))
  const minKeepSize = Math.max(3, Math.round(largest * 0.012))
  const next = cloneGrid(grid)
  components.forEach((component) => {
    if (component.length >= minKeepSize) return
    component.forEach(([x, y]) => {
      next[y][x] = { colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' }
    })
  })
  return next
}

function findSubjectBounds(grid: BeadCell[][]) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  let minX = cols
  let minY = rows
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[y][x].colorIndex < 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

function findBestDarkPaletteIndex(selectedPalette: PaletteColor[]) {
  let bestIndex = -1
  let bestScore = Number.POSITIVE_INFINITY
  selectedPalette.forEach((color, index) => {
    const luma = getColorLuma(color.hex)
    if (luma > CRAFT_DARK_LUMA_THRESHOLD) return
    const score = luma - Math.min(color.count, 30) * 0.4
    if (score < bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

function findLocalFillIndex(
  grid: BeadCell[][],
  selectedPalette: PaletteColor[],
  x: number,
  y: number,
  fallbackIndex: number,
) {
  const neighborIndexes = ALL_DIRECTIONS
    .map(([dx, dy]) => grid[y + dy]?.[x + dx]?.colorIndex ?? -1)
    .filter((index) => index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') > CRAFT_DARK_LUMA_THRESHOLD)
  return getDominantIndex(neighborIndexes) >= 0 ? getDominantIndex(neighborIndexes) : fallbackIndex
}

function placeCellIfUseful(
  grid: BeadCell[][],
  selectedPalette: PaletteColor[],
  x: number,
  y: number,
  index: number,
) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (x < 0 || y < 0 || x >= cols || y >= rows || index < 0) return
  const currentIndex = grid[y][x].colorIndex
  if (currentIndex === index) return
  grid[y][x] = makePaletteCell(index, selectedPalette)
}

function normalizeTinyDarkFeature(
  grid: BeadCell[][],
  selectedPalette: PaletteColor[],
  component: Array<[number, number]>,
  darkIndex: number,
  fillIndex: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const minX = Math.min(...component.map(([x]) => x))
  const maxX = Math.max(...component.map(([x]) => x))
  const minY = Math.min(...component.map(([, y]) => y))
  const maxY = Math.max(...component.map(([, y]) => y))
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const centerX = Math.round(component.reduce((total, [x]) => total + x, 0) / component.length)
  const centerY = Math.round(component.reduce((total, [, y]) => total + y, 0) / component.length)

  if (centerY < bounds.minY + 3 || centerY > bounds.minY + Math.max(4, Math.round((bounds.maxY - bounds.minY + 1) * 0.7))) {
    return
  }

  if (width <= 1 && height <= 2 && component.length <= 2) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const isCorner = Math.abs(dx) === 1 && Math.abs(dy) === 1
        const index = isCorner && fillIndex >= 0 ? fillIndex : darkIndex
        placeCellIfUseful(grid, selectedPalette, centerX + dx, centerY + dy, index)
      }
    }
    return
  }

  if (width < 3 && height <= 3) {
    for (let dx = -1; dx <= 1; dx += 1) {
      placeCellIfUseful(grid, selectedPalette, centerX + dx, centerY, darkIndex)
    }
  }

  if (height < 3 && width <= 3) {
    for (let dy = -1; dy <= 1; dy += 1) {
      placeCellIfUseful(grid, selectedPalette, centerX, centerY + dy, darkIndex)
    }
  }

  if (centerX <= 1 || centerY <= 1 || centerX >= cols - 2 || centerY >= rows - 2) return
  placeCellIfUseful(grid, selectedPalette, centerX, centerY, darkIndex)
}

function strengthen36FacialFeatures(grid: BeadCell[][], selectedPalette: PaletteColor[], longSide: number) {
  if (longSide > 40) return grid
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const bounds = findSubjectBounds(grid)
  if (!rows || !cols || !bounds) return grid

  const darkIndex = findBestDarkPaletteIndex(selectedPalette)
  if (darkIndex < 0) return grid

  const isDarkIndex = (index: number) => index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD
  const next = cloneGrid(grid)
  const visited = new Uint8Array(rows * cols)
  const faceTop = bounds.minY + Math.round((bounds.maxY - bounds.minY + 1) * 0.12)
  const faceBottom = bounds.minY + Math.round((bounds.maxY - bounds.minY + 1) * 0.62)

  for (let y = Math.max(0, faceTop); y <= Math.min(rows - 1, faceBottom); y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const startKey = y * cols + x
      const startIndex = grid[y][x].colorIndex
      if (visited[startKey] || !isDarkIndex(startIndex)) continue

      const component: Array<[number, number]> = []
      const queue: Array<[number, number]> = [[x, y]]
      visited[startKey] = 1

      for (let head = 0; head < queue.length; head += 1) {
        const [cx, cy] = queue[head]
        component.push([cx, cy])
        ALL_DIRECTIONS.forEach(([dx, dy]) => {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < bounds.minX || nx > bounds.maxX || ny < faceTop || ny > faceBottom) return
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
          const key = ny * cols + nx
          if (visited[key] || grid[ny][nx].colorIndex !== startIndex) return
          visited[key] = 1
          queue.push([nx, ny])
        })
      }

      if (component.length > 0 && component.length <= 5) {
        const centerX = Math.round(component.reduce((total, [cx]) => total + cx, 0) / component.length)
        const centerY = Math.round(component.reduce((total, [, cy]) => total + cy, 0) / component.length)
        const fillIndex = findLocalFillIndex(grid, selectedPalette, centerX, centerY, -1)
        normalizeTinyDarkFeature(next, selectedPalette, component, startIndex, fillIndex, bounds)
      }
    }
  }

  return next
}

function ensure36MouthStroke(grid: BeadCell[][], selectedPalette: PaletteColor[], longSide: number) {
  if (longSide > 40) return grid
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const bounds = findSubjectBounds(grid)
  if (!rows || !cols || !bounds) return grid

  const darkIndex = findBestDarkPaletteIndex(selectedPalette)
  if (darkIndex < 0) return grid

  const subjectW = bounds.maxX - bounds.minX + 1
  const subjectH = bounds.maxY - bounds.minY + 1
  const centerX = Math.round((bounds.minX + bounds.maxX) / 2)
  const mouthYStart = bounds.minY + Math.round(subjectH * 0.38)
  const mouthYEnd = bounds.minY + Math.round(subjectH * 0.68)
  const mouthXStart = Math.max(bounds.minX + 2, centerX - Math.max(3, Math.round(subjectW * 0.16)))
  const mouthXEnd = Math.min(bounds.maxX - 2, centerX + Math.max(3, Math.round(subjectW * 0.16)))
  const isDarkIndex = (index: number) => index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD

  let bestY = -1
  let bestDarkCount = 0
  for (let y = mouthYStart; y <= Math.min(rows - 1, mouthYEnd); y += 1) {
    let darkCount = 0
    for (let x = mouthXStart; x <= mouthXEnd; x += 1) {
      if (isDarkIndex(grid[y]?.[x]?.colorIndex ?? -1)) darkCount += 1
    }
    if (darkCount > bestDarkCount) {
      bestDarkCount = darkCount
      bestY = y
    }
  }

  if (bestDarkCount >= 3) return grid

  const next = cloneGrid(grid)
  const mouthY = bestY >= 0 ? bestY : bounds.minY + Math.round(subjectH * 0.52)
  const strokeHalf = subjectW <= 20 ? 1 : 2
  for (let dx = -strokeHalf; dx <= strokeHalf; dx += 1) {
    const x = centerX + dx
    const current = grid[mouthY]?.[x]?.colorIndex ?? -1
    if (current < 0) continue
    placeCellIfUseful(next, selectedPalette, x, mouthY, darkIndex)
  }
  return next
}

function thicken36OuterSilhouette(grid: BeadCell[][], selectedPalette: PaletteColor[], longSide: number) {
  if (longSide > 40) return grid
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (!rows || !cols) return grid

  const darkIndex = findBestDarkPaletteIndex(selectedPalette)
  if (darkIndex < 0) return grid
  const next = cloneGrid(grid)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[y][x].colorIndex < 0) continue
      const touchesEmpty = CARDINAL_DIRECTIONS.some(([dx, dy]) => (
        (grid[y + dy]?.[x + dx]?.colorIndex ?? -1) < 0
      ))
      if (!touchesEmpty) continue

      const darkNeighborCount = ALL_DIRECTIONS.filter(([dx, dy]) => {
        const index = grid[y + dy]?.[x + dx]?.colorIndex ?? -1
        return index >= 0 && getColorLuma(selectedPalette[index]?.hex ?? '#ffffff') <= CRAFT_DARK_LUMA_THRESHOLD
      }).length
      if (darkNeighborCount >= 1) {
        placeCellIfUseful(next, selectedPalette, x, y, darkIndex)
      }
    }
  }

  return next
}

function polishCraftGrid(grid: BeadCell[][], selectedPalette: PaletteColor[], longSide: number) {
  let next = cleanupCraftGrid(grid, selectedPalette)
  next = closeCraftSubjectGaps(next, selectedPalette)
  next = connectCraftDarkDetails(next, selectedPalette)
  next = reinforceTinyDarkFeatures(next, selectedPalette, longSide)
  next = strengthen36FacialFeatures(next, selectedPalette, longSide)
  next = ensure36MouthStroke(next, selectedPalette, longSide)
  next = thicken36OuterSilhouette(next, selectedPalette, longSide)
  next = cleanupCraftGrid(next, selectedPalette)
  next = removeTinyDetachedCraftIslands(next)
  recountPalette(next, selectedPalette)
  return next
}

function HeroCarousel({ paletteColors }: { paletteColors: readonly BeadPaletteEntry[] }) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return undefined
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % HERO_CAROUSEL_SLIDE_COUNT)
    }, HERO_CAROUSEL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [paused])

  function goToSlide(index: number) {
    setActiveSlide((index + HERO_CAROUSEL_SLIDE_COUNT) % HERO_CAROUSEL_SLIDE_COUNT)
  }

  return (
    <div
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="拼豆介绍与推广"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="carousel-viewport">
        <div
          className="carousel-track"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          <div className="carousel-slide carousel-slide-intro" aria-hidden={activeSlide !== 0}>
            <div className="mini-board">
              {Array.from({ length: 100 }).map((_, index) => (
                <span key={index} style={{ background: paletteColors[(index * 7) % paletteColors.length][2] }} />
              ))}
            </div>
            <p><strong>拼豆是什么？</strong>把小塑料管按图纸摆到底盘上，再隔着助烫纸熨烫定型，像年轻人的像素版十字绣。</p>
          </div>
          <a
            className="carousel-slide carousel-slide-ad"
            href={PROMO_AD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-hidden={activeSlide !== 1}
            aria-label="查看融豆拼拼 2.6mm 融合豆全色套装推广"
          >
            <img src={PROMO_AD_IMAGE} alt="融豆拼拼 2.6mm 融合豆全色套装" />
            <span className="ad-badge">推广</span>
          </a>
        </div>
      </div>
      <div className="carousel-controls">
        <button type="button" className="carousel-nav-btn" onClick={() => goToSlide(activeSlide - 1)} aria-label="上一张">
          <ChevronLeft size={18} />
        </button>
        <div className="carousel-dots" role="tablist" aria-label="幻灯片切换">
          {Array.from({ length: HERO_CAROUSEL_SLIDE_COUNT }).map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              className={activeSlide === index ? 'active' : ''}
              aria-selected={activeSlide === index}
              aria-label={`第 ${index + 1} 张`}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>
        <button type="button" className="carousel-nav-btn" onClick={() => goToSlide(activeSlide + 1)} aria-label="下一张">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

function isDarkHex(hex: string) {
  return Number.parseInt(hex.slice(1), 16) < 0x777777
}

function formatLegendLabel(color: Pick<PaletteColor, 'code' | 'name'>) {
  return color.name ? `${color.code} ${color.name}` : color.code
}

function sanitizeExportFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim()
  return base.slice(0, 80) || 'pattern'
}

function formatExportError(cause: unknown) {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return '浏览器资源限制或内存不足'
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成 PNG'))
    }, type)
  })
}

function buildPatternExportCanvas(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  gridCols: number,
  gridRows: number,
  renderMode: RenderMode,
  activeCells: number,
) {
  const exportCell = getExportCellSize(gridCols, gridRows)
  const gap = 1
  const gridPad = 12
  const gridInnerW = gridCols * exportCell + Math.max(0, gridCols - 1) * gap
  const gridInnerH = gridRows * exportCell + Math.max(0, gridRows - 1) * gap
  const gridW = gridInnerW + gridPad * 2
  const gridH = gridInnerH + gridPad * 2

  const legendCols = Math.min(4, Math.max(1, palette.length))
  const legendRows = Math.ceil(palette.length / legendCols)
  const legendItemW = 220
  const legendItemH = 28
  const legendPad = 24
  const legendW = legendCols * legendItemW + legendPad * 2
  const legendH = legendRows * legendItemH + legendPad * 2 + 28

  const margin = 32
  const headerH = 72
  const contentW = Math.max(gridW, legendW, 640)
  const canvas = document.createElement('canvas')
  canvas.width = contentW + margin * 2
  canvas.height = headerH + gridH + 24 + legendH + margin

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')

  ctx.fillStyle = '#fffaf1'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#1d1a23'
  ctx.font = '700 24px "Noto Sans SC", sans-serif'
  ctx.fillText('拼豆图纸', margin, margin + 24)
  ctx.font = '400 14px "Noto Sans SC", sans-serif'
  ctx.fillStyle = '#6f647d'
  ctx.fillText(`${gridCols}×${gridRows} · ${activeCells.toLocaleString()} 颗豆 · ${palette.length} 色`, margin, margin + 48)

  const gridX = margin + (contentW - gridW) / 2
  const gridY = headerH
  ctx.fillStyle = '#2a2633'
  roundRect(ctx, gridX, gridY, gridW, gridH, 18)
  ctx.fill()

  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const cell = pattern[y][x]
      const px = gridX + gridPad + x * (exportCell + gap)
      const py = gridY + gridPad + y * (exportCell + gap)
      ctx.fillStyle = cell.hex
      ctx.fillRect(px, py, exportCell, exportCell)
      if (renderMode === 'symbols' && cell.colorIndex >= 0) {
        ctx.fillStyle = isDarkHex(cell.hex) ? '#fff' : '#1d1a23'
        ctx.font = `700 ${Math.max(8, Math.floor(exportCell * 0.55))}px "Noto Sans SC", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(cell.symbol, px + exportCell / 2, py + exportCell / 2 + 0.5)
      }
    }
  }

  const legendX = margin + (contentW - legendW) / 2
  const legendY = gridY + gridH + 24
  ctx.fillStyle = '#1d1a23'
  ctx.font = '700 16px "Noto Sans SC", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('色号清单', legendX + legendPad, legendY + 20)

  palette.forEach((color, index) => {
    const col = index % legendCols
    const row = Math.floor(index / legendCols)
    const x = legendX + legendPad + col * legendItemW
    const y = legendY + 36 + row * legendItemH
    ctx.fillStyle = color.hex
    ctx.fillRect(x, y + 4, 20, 20)
    ctx.strokeStyle = 'rgba(43, 35, 58, 0.18)'
    ctx.strokeRect(x + 0.5, y + 4.5, 19, 19)
    ctx.fillStyle = isDarkHex(color.hex) ? '#fff' : '#1d1a23'
    ctx.font = '700 11px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(color.symbol, x + 10, y + 14)
    ctx.fillStyle = '#1d1a23'
    ctx.font = '400 13px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(formatLegendLabel(color), x + 28, y + 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#6f647d'
    ctx.fillText(String(color.count), x + legendItemW - 12, y + 14)
  })

  return canvas
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function App() {
  const [sourceName, setSourceName] = useState('')
  const [sourcePreview, setSourcePreview] = useState('')
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_SIZE)
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_SIZE)
  const [maxColors, setMaxColors] = useState(24)
  const [shape, setShape] = useState<BoardShape>('ratio')
  const [renderMode, setRenderMode] = useState<RenderMode>('symbols')
  const [pattern, setPattern] = useState<BeadCell[][]>([])
  const [palette, setPalette] = useState<PaletteColor[]>([])
  const [paletteBrand, setPaletteBrand] = useState<PaletteBrand>(DEFAULT_PALETTE_BRAND)
  const [sourceMode, setSourceMode] = useState<SourceMode>('local')
  const [aiStyleId, setAiStyleId] = useState(DEFAULT_AI_STYLE_ID)
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_EXTRA_PROMPT)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [error, setError] = useState('')
  const patternRef = useRef<HTMLDivElement>(null)
  const paperViewportRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const lastSourceFileRef = useRef<File | null>(null)
  const exportNoticeTimerRef = useRef<number | null>(null)
  const [paperScale, setPaperScale] = useState(1)

  const activeCells = useMemo(() => pattern.flat().filter((cell) => cell.colorIndex >= 0).length, [pattern])
  const cellSize = renderMode === 'symbols' ? 20 : 14
  const modeLabel = renderMode === 'symbols' ? '符号图纸' : '纯色预览'
  const activePalette = useMemo(() => getPalette(paletteBrand), [paletteBrand])
  const activePaletteColors = useMemo(() => getPaletteColors(paletteBrand), [paletteBrand])
  const activePaletteSize = useMemo(() => getPaletteSize(paletteBrand), [paletteBrand])
  const gridSizeHint = useMemo(() => getGridSizeHint(gridSize), [gridSize])

  useEffect(() => {
    if (!pattern.length) return undefined

    const actualWidth = gridCols * cellSize + Math.max(0, gridCols - 1) + 24
    const actualHeight = gridRows * cellSize + Math.max(0, gridRows - 1) + 24

    const updateScales = () => {
      const paperViewport = paperViewportRef.current
      if (paperViewport) {
        const viewportWidth = paperViewport.clientWidth - 48
        const viewportHeight = Math.min(760, Math.max(420, window.innerHeight * 0.72))
        const nextPaperScale = Math.min(1, viewportWidth / actualWidth, viewportHeight / actualHeight)
        setPaperScale(Number.isFinite(nextPaperScale) ? nextPaperScale : 1)
      }
    }

    updateScales()
    const observer = new ResizeObserver(updateScales)
    if (paperViewportRef.current) observer.observe(paperViewportRef.current)
    window.addEventListener('resize', updateScales)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScales)
    }
  }, [pattern, gridCols, gridRows, cellSize])

  useEffect(() => () => {
    if (exportNoticeTimerRef.current) window.clearTimeout(exportNoticeTimerRef.current)
  }, [])


  async function generatePattern(
    file: File,
    nextGridSize = gridSize,
    nextMaxColors = maxColors,
    nextShape = shape,
    nextPaletteBrand = paletteBrand,
    options?: { updatePreview?: boolean; sharpQuantize?: boolean; quantizeMode?: QuantizeMode },
  ) {
    const updatePreview = options?.updatePreview ?? true
    const sharpQuantize = options?.sharpQuantize ?? false
    const quantizeMode = options?.quantizeMode ?? 'default'
    const samplingMode: SamplingMode = quantizeMode === 'craft' ? 'feature' : 'average'
    const beadPalette = getPaletteColors(nextPaletteBrand)
    setError('')
    setIsProcessing(true)
    lastSourceFileRef.current = file
    try {
      const image = await loadImage(file)
      const { cols, rows } = fitGridToImage(image, nextGridSize, nextShape)
      setGridCols(cols)
      setGridRows(rows)
      if (updatePreview) {
        setSourceName(file.name)
        setSourcePreview(URL.createObjectURL(file))
      }

      const imageData = drawImageToSampledGrid(image, cols, rows, nextShape, sharpQuantize, samplingMode)
      const quantizeImageData = quantizeMode === 'craft'
        ? boostCraftSourceColors(removeCraftEdgeBackground(imageData))
        : imageData
      const maxColorsForMode = quantizeMode === 'craft' ? getCraftMaxColors(Math.max(cols, rows), nextMaxColors) : nextMaxColors
      const selected = selectPaletteIndexes(quantizeImageData, beadPalette, maxColorsForMode, quantizeMode)
      if (!selected.length) throw new Error('图片内容太少，无法生成图纸')

      const selectedPalette = selected.map((paletteIndex, index) => ({
        code: beadPalette[paletteIndex][0],
        name: beadPalette[paletteIndex][1],
        hex: beadPalette[paletteIndex][2],
        count: 0,
        symbol: SYMBOLS[index] ?? String(index + 1),
      }))

      const selectedColors = selected.map((index) => beadPalette[index])
      const grid = buildGridFromImageData(quantizeImageData, selectedPalette, selectedColors)
      const finalGrid = quantizeMode === 'craft' ? polishCraftGrid(grid, selectedPalette, Math.max(cols, rows)) : grid

      setPalette(selectedPalette.filter((color) => color.count > 0))
      setPattern(finalGrid)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败，请换一张图片试试')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleFile(file?: File) {
    if (!file) return
    if (sourceMode === 'ai') {
      setSourceName(file.name)
      setSourcePreview(URL.createObjectURL(file))
      setError('')
      return
    }
    await generatePattern(file)
  }

  async function generateWithAi() {
    const refFile = uploadRef.current?.files?.[0]
    if (!refFile) {
      setError('请先上传一张参考图')
      return
    }

    setError('')
    setIsAiGenerating(true)
    try {
      const patternShape = gridSize <= 40 && aiStyleId === DEFAULT_AI_STYLE_ID ? 'square' : shape
      if (patternShape !== shape) setShape(patternShape)
      const size = await pickAgnesSize(refFile, patternShape)
      const aiFile = await generateAgnesImage({
        file: refFile,
        styleId: aiStyleId,
        extraPrompt: aiPrompt,
        gridSize,
        size,
      })
      const framedFile = await cropToReferenceFraming(aiFile, refFile)
      const croppedFile = await cropSubjectFromImage(framedFile)
      await generatePattern(croppedFile, gridSize, maxColors, patternShape, paletteBrand, {
        updatePreview: false,
        sharpQuantize: true,
        quantizeMode: 'craft',
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 生成失败，请稍后重试')
    } finally {
      setIsAiGenerating(false)
    }
  }

  async function regenerate(
    nextGridSize = gridSize,
    nextMaxColors = maxColors,
    nextShape = shape,
    nextPaletteBrand = paletteBrand,
  ) {
    const file = lastSourceFileRef.current ?? uploadRef.current?.files?.[0]
    if (file) {
      await generatePattern(file, nextGridSize, nextMaxColors, nextShape, nextPaletteBrand, {
        updatePreview: sourceMode !== 'ai',
        sharpQuantize: sourceMode === 'ai',
        quantizeMode: sourceMode === 'ai' ? 'craft' : 'default',
      })
    }
  }

  function switchPaletteBrand(brand: PaletteBrand) {
    if (brand === paletteBrand) return
    const nextMaxColors = Math.min(maxColors, getPaletteSize(brand))
    setPaletteBrand(brand)
    setMaxColors(nextMaxColors)
    void regenerate(gridSize, nextMaxColors, shape, brand)
  }

  async function exportPng() {
    if (!pattern.length || isExporting) return
    setIsExporting(true)
    setExportNotice('')
    const startedAt = Date.now()
    try {
      await document.fonts.ready
      const canvas = buildPatternExportCanvas(pattern, palette, gridCols, gridRows, renderMode, activeCells)
      const blob = await canvasToBlob(canvas)
      saveAs(blob, `拼豆图纸-${sanitizeExportFilename(sourceName)}.png`)
      setExportNotice('PNG 已开始下载')
      if (exportNoticeTimerRef.current) window.clearTimeout(exportNoticeTimerRef.current)
      exportNoticeTimerRef.current = window.setTimeout(() => setExportNotice(''), 2800)
    } catch (cause) {
      setError(`导出失败：${formatExportError(cause)}`)
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < 600) await new Promise((resolve) => window.setTimeout(resolve, 600 - elapsed))
      setIsExporting(false)
    }
  }

  function switchSourceMode(mode: SourceMode) {
    setSourceMode(mode)
    if (mode === 'ai') {
      setGridSize((current) => (!pattern.length && !sourcePreview ? AI_DEFAULT_GRID_SIZE : (current > AI_GRID_RECOMMEND_MAX ? AI_DEFAULT_GRID_SIZE : current)))
      if (!pattern.length && !sourcePreview) setShape('square')
    }
  }

  function renderGrid() {
    return (
      <div
        className={`pattern-grid ${renderMode} actual-grid`}
        style={{
          gridTemplateColumns: `repeat(${gridCols}, ${cellSize}px)`,
          ['--grid-ratio' as string]: `${gridCols} / ${gridRows}`,
          ['--cell-font' as string]: '9px',
        }}
      >
        {pattern.flat().map((cell, index) => (
          <span
            key={`${index}-${cell.symbol}`}
            style={{ background: cell.hex, color: cell.colorIndex >= 0 && isDarkHex(cell.hex) ? '#fff' : '#1d1a23' }}
          >
            {renderMode === 'symbols' && cell.colorIndex >= 0 ? cell.symbol : ''}
          </span>
        ))}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={16} /> Perler Beads Pattern Maker</div>
          <h1>上传图片，一键生成可打印拼豆图纸</h1>
          <p>支持本地转换与 AI 创作两种方式：上传图片后可直接量化，或由 AI 生成更适合拼豆的中间图。</p>
          <div className="hero-actions">
            <button className="primary-btn" type="button" onClick={() => uploadRef.current?.click()}>
              <ImageUp size={18} /> 上传图片
            </button>
            <button className="ghost-btn" type="button" onClick={() => window.print()} disabled={!pattern.length}>
              <Printer size={18} /> 打印图纸
            </button>
          </div>
        </div>
        <div className="hero-side-panel" aria-label="拼豆介绍与推广">
          <HeroCarousel paletteColors={activePaletteColors} />
          <a className="ad-bar" href={PROMO_AD_URL} target="_blank" rel="noopener noreferrer">
            推荐：融豆拼拼 2.6mm 融合豆全色套装 →
          </a>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="segmented mode-tabs">
            <button className={sourceMode === 'local' ? 'active' : ''} onClick={() => switchSourceMode('local')} type="button">本地转换</button>
            <button className={sourceMode === 'ai' ? 'active' : ''} onClick={() => switchSourceMode('ai')} type="button">AI 生成</button>
          </div>

          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
          <button className="upload-zone" type="button" onClick={() => uploadRef.current?.click()}>
            {sourcePreview ? <img src={sourcePreview} alt="上传预览" /> : <ImageUp size={34} />}
            <span>{sourcePreview ? sourceName : '选择一张图片'}</span>
            <small>{sourceMode === 'ai' ? '上传参考图，AI 将聚焦主体并简化背景' : '按原图比例完整预览，不裁切'}</small>
          </button>

          {sourceMode === 'ai' && (
            <div className="ai-panel">
              <div className="ai-panel-head">
                <span>AI 风格</span>
                <small>AI 模式会自动减少碎色、强化轮廓，并优先生成易拼图纸</small>
              </div>
              <div className="style-grid">
                {AGNES_STYLE_PRESETS.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className={`style-card ${aiStyleId === style.id ? 'active' : ''}`}
                    onClick={() => setAiStyleId(style.id)}
                  >
                    <strong>{style.label}</strong>
                    <span>{style.description}</span>
                  </button>
                ))}
              </div>
              <label className="ai-prompt-field">
                <span>补充描述（选填）</span>
                <textarea
                  className="ai-prompt-input"
                  rows={3}
                  placeholder="例如：放大主体、减少留白；只要人物、不要背景文字"
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                />
              </label>
              <button
                className="primary-btn ai-generate-btn"
                type="button"
                onClick={() => void generateWithAi()}
                disabled={!sourcePreview || isAiGenerating || isProcessing}
              >
                {isAiGenerating ? <LoaderCircle className="spin-icon" size={18} /> : <WandSparkles size={18} />}
                {isAiGenerating ? 'AI 生成中…' : 'AI 生成拼豆图'}
              </button>
            </div>
          )}

          <label>
            <span>
              图纸尺寸 <b>最长边 {gridSize} 格</b>
              <small className="control-hint"> {gridSizeHint}{sourceMode === 'ai' ? '；AI 推荐 36–56 格，会自动收紧实际颜色数' : ''}</small>
            </span>
            <input type="range" min="24" max="128" step="4" value={gridSize} onChange={(event) => {
              const value = Number(event.target.value)
              setGridSize(value)
              void regenerate(value, maxColors, shape)
            }} />
            <div className="quick-size-grid" aria-label="常用图纸尺寸">
              {QUICK_GRID_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={gridSize === size ? 'active' : ''}
                  onClick={() => {
                    setGridSize(size)
                    void regenerate(size, maxColors, shape)
                  }}
                >
                  {size} 格
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>色卡 <b>{activePalette.label}</b></span>
            <div className="segmented">
              <button className={paletteBrand === 'mard' ? 'active' : ''} onClick={() => switchPaletteBrand('mard')} type="button">MARD（国产）</button>
              <button className={paletteBrand === 'hama' ? 'active' : ''} onClick={() => switchPaletteBrand('hama')} type="button">Hama</button>
            </div>
          </label>

          <label>
            <span>最大颜色数 <b>{maxColors}</b></span>
            <input type="range" min="4" max={activePaletteSize} step="1" value={maxColors} onChange={(event) => {
              const value = Number(event.target.value)
              setMaxColors(value)
              void regenerate(gridSize, value, shape)
            }} />
          </label>

          <div className="segmented">
            <button className={shape === 'ratio' ? 'active' : ''} onClick={() => { setShape('ratio'); void regenerate(gridSize, maxColors, 'ratio') }} type="button">按原图比例</button>
            <button className={shape === 'square' ? 'active' : ''} onClick={() => { setShape('square'); void regenerate(gridSize, maxColors, 'square') }} type="button">方形 · 居中裁剪</button>
          </div>

          <div className="segmented">
            <button className={renderMode === 'symbols' ? 'active' : ''} onClick={() => setRenderMode('symbols')} type="button">符号图纸</button>
            <button className={renderMode === 'solid' ? 'active' : ''} onClick={() => setRenderMode('solid')} type="button">纯色预览</button>
          </div>

          <div className="action-grid">
            <button type="button" onClick={() => void regenerate()} disabled={!sourcePreview || isProcessing || isAiGenerating}><RotateCcw size={17} /> 重新生成</button>
            <button type="button" onClick={() => void exportPng()} disabled={!pattern.length || isExporting}>
              {isExporting ? <LoaderCircle className="spin-icon" size={17} /> : <Download size={17} />}
              {isExporting ? '导出中...' : '导出 PNG'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </aside>

        <section className="panel preview-panel">
          <div className="section-title">
            <div><Grid3X3 size={18} /> 图纸预览</div>
            <span>{activeCells ? `${gridCols}×${gridRows} · ${activeCells} 颗豆 · ${palette.length} 色` : '等待上传'}</span>
          </div>

          {pattern.length > 0 && (
            <div className="result-summary" aria-label="图纸摘要">
              <div>
                <small>尺寸</small>
                <strong>{gridCols} × {gridRows}</strong>
                <span>按当前图纸尺寸生成</span>
              </div>
              <div>
                <small>豆数</small>
                <strong>{activeCells.toLocaleString()}</strong>
                <span>预计用豆总量</span>
              </div>
              <div>
                <small>颜色</small>
                <strong>{palette.length}</strong>
                <span>已匹配 {activePalette.label} 色号</span>
              </div>
              <div>
                <small>模式</small>
                <strong>{modeLabel}</strong>
                <span>{Math.round(paperScale * 100)}% 适配显示</span>
              </div>
            </div>
          )}

          <div className="pattern-paper" ref={patternRef}>
            {pattern.length ? (
              <>
                <div className="paper-header">
                  <div>
                    <strong>整体图纸</strong>
                    <span>已缩放到当前区域，完整查看构图</span>
                  </div>
                  <b>{Math.round(paperScale * 100)}%</b>
                </div>
                <div className="paper-overview" ref={paperViewportRef}>
                  <div
                    className="print-pattern-wrap"
                    style={{ ['--paper-scale' as string]: paperScale }}
                  >
                    {renderGrid()}
                  </div>
                </div>
                <div className="legend">
                  {palette.map((color) => (
                    <div className="legend-item" key={color.symbol}>
                      <i style={{ background: color.hex }}>{color.symbol}</i>
                      <span>{formatLegendLabel(color)}</span>
                      <b>{color.count}</b>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Info size={38} />
                <h2>从一张图开始</h2>
                <p>这里会生成类似拼豆图纸的编号网格：每个格子代表一颗豆，底部清单统计每种颜色需要的数量。</p>
              </div>
            )}
          </div>
        </section>
      </section>

      {isAiGenerating && (
        <div className="export-loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="export-loading-card">
            <div className="export-spinner" aria-hidden="true">
              <LoaderCircle size={30} />
            </div>
            <strong>AI 正在生成图片</strong>
            <span>AI 创作中，完成后将自动量化成拼豆图纸…</span>
          </div>
        </div>
      )}

      {isExporting && (
        <div className="export-loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="export-loading-card">
            <div className="export-spinner" aria-hidden="true">
              <LoaderCircle size={30} />
            </div>
            <strong>正在导出 PNG</strong>
            <span>高清图纸生成中，请稍等一下…</span>
          </div>
        </div>
      )}

      {exportNotice && (
        <div className="export-toast" role="status" aria-live="polite">
          {exportNotice}
        </div>
      )}

      <footer className="site-footer">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          京ICP备2024067456号-3
        </a>
      </footer>
    </main>
  )
}

export default App
