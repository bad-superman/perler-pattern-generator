import Taro from '@tarojs/taro'
import type {
  MiniappAlbumAdapter,
  MiniappCanvasAdapter,
  MiniappImagePicker,
  MiniappImageSource,
  MiniappExportedImage,
  RenderExportSheetInput,
} from '../../../src/miniapp/platform/types'
import { isDarkHex } from '../../../src/pattern/color'
import { colorRuns } from '../pattern-view/runs'

export const taroImagePicker: MiniappImagePicker = {
  async chooseImage(): Promise<MiniappImageSource | null> {
    const result = await Taro.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
    })
    const path = result.tempFilePaths[0]
    if (!path) return null
    const file = result.tempFiles?.[0]
    const info = await Taro.getImageInfo({ src: path })
    return {
      name: file?.path?.split('/').pop() || 'source-image',
      width: info.width,
      height: info.height,
      sizeBytes: file?.size,
      tempPath: path,
    }
  },
}

/**
 * Legacy (`canvasId`) canvases take their drawing surface from CSS only and
 * default to 300×150; Taro drops `width`/`height` props. Every canvas must be
 * given an explicit `style` size at least as large as what is drawn or read.
 */
export const DECODE_CANVAS_SIZE = 520

/** Longest allowed backing-store side (CSS px × pixelRatio) of the export canvas. */
const MAX_EXPORT_BACKING_SIDE = 3600

/** Window size in CSS px plus an rpx converter, for layouts computed in script. */
export function getViewportMetrics() {
  const info = Taro.getSystemInfoSync()
  const windowWidth = Number(info.windowWidth) || 375
  const windowHeight = Number(info.windowHeight) || 667
  const screenHeight = Number(info.screenHeight) || windowHeight
  const safeBottom = info.safeArea ? Math.max(0, screenHeight - Number(info.safeArea.bottom)) : 0
  return {
    windowWidth,
    windowHeight,
    /** Height of the home-indicator area at the bottom of the screen. */
    safeBottom,
    pixelRatio: Math.max(1, Number(info.pixelRatio) || 2),
    /** Stylesheet px are compiled to rpx (750 per screen width); this gives the real px. */
    rpx: (value: number) => (value * windowWidth) / 750,
  }
}

let cachedPixelRatio = 0
function devicePixelRatio() {
  if (!cachedPixelRatio) cachedPixelRatio = getViewportMetrics().pixelRatio
  return cachedPixelRatio
}

/** Guide lines mark blocks of this many cells, counted from the top-left corner. */
const EXPORT_GUIDE_BLOCK = 10

/** Geometry shared by the export canvas element and the export renderer. */
export function exportSheetLayout(cols: number, rows: number, legendCount: number) {
  const padding = 48
  const headerHeight = 132
  const cell = Math.max(12, Math.min(34, Math.floor(1200 / Math.max(cols, rows, 1))))
  // Band around the grid that carries the row / column index numbers.
  const ruler = Math.max(cell, 22)
  const gridWidth = cols * cell
  const gridHeight = rows * cell
  const frameWidth = gridWidth + ruler * 2
  const frameHeight = gridHeight + ruler * 2
  const legendRows = Math.ceil(legendCount / 4)
  const width = frameWidth + padding * 2
  const height = headerHeight + frameHeight + 36 + legendRows * 46 + padding
  const pixelRatio = devicePixelRatio()
  // Large sheets are drawn scaled down so the canvas stays within device limits.
  const scale = Math.min(1, MAX_EXPORT_BACKING_SIDE / (Math.max(width, height) * pixelRatio))
  return {
    padding,
    cell,
    ruler,
    gridWidth,
    gridHeight,
    frameLeft: padding,
    frameTop: headerHeight,
    frameWidth,
    frameHeight,
    gridLeft: padding + ruler,
    gridTop: headerHeight + ruler,
    legendTop: headerHeight + frameHeight + 36,
    width,
    height,
    scale,
    pixelRatio,
    canvasWidth: Math.floor(width * scale),
    canvasHeight: Math.floor(height * scale),
  }
}

function drawAndWait(canvasId: string, draw: (context: Taro.CanvasContext) => void) {
  return new Promise<void>((resolve) => {
    const context = Taro.createCanvasContext(canvasId)
    draw(context)
    context.draw(false, () => resolve())
  })
}

function colorKey(r: number, g: number, b: number) {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
}

function sampleRgbaGrid(data: Uint8ClampedArray, width: number, height: number, cols: number, rows: number) {
  const output = new Uint8ClampedArray(cols * rows * 4)
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const startX = Math.floor((x * width) / cols)
      const endX = Math.max(startX + 1, Math.floor(((x + 1) * width) / cols))
      const startY = Math.floor((y * height) / rows)
      const endY = Math.max(startY + 1, Math.floor(((y + 1) * height) / rows))
      const bins = new Map<number, { r: number; g: number; b: number; alpha: number; count: number }>()
      let visible = 0
      let alphaTotal = 0
      for (let sourceY = startY; sourceY < Math.min(endY, height); sourceY += 1) {
        for (let sourceX = startX; sourceX < Math.min(endX, width); sourceX += 1) {
          const offset = (sourceY * width + sourceX) * 4
          const alpha = data[offset + 3]
          alphaTotal += alpha
          if (alpha < 80) continue
          visible += 1
          const key = colorKey(data[offset], data[offset + 1], data[offset + 2])
          const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, alpha: 0, count: 0 }
          bin.r += data[offset]
          bin.g += data[offset + 1]
          bin.b += data[offset + 2]
          bin.alpha += alpha
          bin.count += 1
          bins.set(key, bin)
        }
      }
      const targetOffset = (y * cols + x) * 4
      if (!visible) continue

      let winner: { r: number; g: number; b: number; alpha: number; count: number } | undefined
      bins.forEach((bin) => {
        if (!winner || bin.count > winner.count) winner = bin
      })
      if (!winner) continue
      output[targetOffset] = Math.round(winner.r / winner.count)
      output[targetOffset + 1] = Math.round(winner.g / winner.count)
      output[targetOffset + 2] = Math.round(winner.b / winner.count)
      output[targetOffset + 3] = Math.round(alphaTotal / Math.max(1, (endX - startX) * (endY - startY)))
    }
  }
  return { data: output, cols, rows }
}

export const taroCanvasAdapter: MiniappCanvasAdapter = {
  async decodeToGrid(source: MiniappImageSource, cols: number, rows: number, shape = 'square') {
    if (!source.tempPath) throw new Error('图片临时路径不存在')
    const sampleScale = Math.max(cols, rows) <= 56 ? 5 : 3
    const sampleWidth = cols * sampleScale
    const sampleHeight = rows * sampleScale
    if (Math.max(sampleWidth, sampleHeight) > DECODE_CANVAS_SIZE) throw new Error('采样尺寸超出解码画布')
    const cropImage = shape === 'square' && Math.abs(source.width - source.height) >= 1
    const cropSize = Math.min(source.width, source.height)
    // Crop from the center. Using the old top-left crop could remove the
    // subject from portrait/landscape photos before quantization.
    const cropX = Math.max(0, Math.floor((source.width - cropSize) / 2))
    const cropY = Math.max(0, Math.floor((source.height - cropSize) / 2))
    await drawAndWait('decode-canvas', (context) => {
      context.clearRect(0, 0, sampleWidth, sampleHeight)
      const drawContext = context as Taro.CanvasContext & {
        drawImage: (...args: unknown[]) => void
      }
      context.setGlobalAlpha(1)
      if (cropImage) {
        drawContext.drawImage(source.tempPath as string, cropX, cropY, cropSize, cropSize, 0, 0, sampleWidth, sampleHeight)
      } else {
        drawContext.drawImage(source.tempPath as string, 0, 0, sampleWidth, sampleHeight)
      }
    })
    const result = await Taro.canvasGetImageData({
      canvasId: 'decode-canvas',
      x: 0,
      y: 0,
      width: sampleWidth,
      height: sampleHeight,
    })
    return sampleRgbaGrid(result.data, result.width || sampleWidth, result.height || sampleHeight, cols, rows)
  },

  async renderExportSheet(input: RenderExportSheetInput): Promise<MiniappExportedImage> {
    // Only colours that are actually on the pattern belong in the legend.
    const legend = input.palette.filter((color) => color.count > 0)
    const layout = exportSheetLayout(input.cols, input.rows, legend.length)
    const { padding, cell, ruler, gridWidth, gridHeight, frameLeft, frameTop, frameWidth, frameHeight, gridLeft, gridTop, width, height, scale, pixelRatio, canvasWidth, canvasHeight } = layout
    const cellAt = (x: number, y: number) => input.pattern[y]?.[input.mirrored ? input.cols - 1 - x : x]
    const hexAt = (x: number, y: number) => {
      const cellData = cellAt(x, y)
      const paletteHex = cellData && cellData.colorIndex >= 0 ? input.palette[cellData.colorIndex]?.hex : undefined
      return paletteHex || cellData?.hex || '#f3eee5'
    }

    await drawAndWait('export-canvas', (context) => {
      context.save()
      context.scale(scale, scale)
      context.clearRect(0, 0, width, height)
      context.setFillStyle('#fffaf1')
      context.fillRect(0, 0, width, height)
      context.setFillStyle('#17131f')
      context.setFontSize(34)
      context.fillText('拼豆图纸 · 本地生成', padding, 54)
      context.setFillStyle('#756b82')
      context.setFontSize(22)
      context.fillText(`${input.cols} × ${input.rows} · ${legend.length} 色 · ${input.activeCells} 颗${input.mirrored ? ' · 镜像' : ''}`, padding, 92)

      // Ruler band; the grid cells are painted over its middle.
      context.setFillStyle('#e4e1e8')
      context.fillRect(frameLeft, frameTop, frameWidth, frameHeight)
      colorRuns({ x0: 0, x1: input.cols - 1, y0: 0, y1: input.rows - 1 }, hexAt).forEach((list, hex) => {
        context.setFillStyle(hex)
        for (let index = 0; index < list.length; index += 3) {
          context.fillRect(gridLeft + list[index] * cell, gridTop + list[index + 1] * cell, list[index + 2] * cell, cell)
        }
      })

      // Cell borders, continued through the ruler so every index sits in its own box.
      context.beginPath()
      for (let x = 0; x <= input.cols; x += 1) {
        context.moveTo(gridLeft + x * cell, frameTop)
        context.lineTo(gridLeft + x * cell, frameTop + frameHeight)
      }
      for (let y = 0; y <= input.rows; y += 1) {
        context.moveTo(frameLeft, gridTop + y * cell)
        context.lineTo(frameLeft + frameWidth, gridTop + y * cell)
      }
      context.rect(frameLeft, frameTop, frameWidth, frameHeight)
      context.setStrokeStyle('rgba(35, 25, 45, 0.22)')
      context.setLineWidth(1)
      context.stroke()

      context.setTextAlign('center')
      context.setTextBaseline('middle')

      // Bead codes, white on dark cells so they stay readable.
      if (cell >= 18) {
        context.setFontSize(Math.max(10, Math.floor(cell * 0.36)))
        for (const dark of [false, true]) {
          context.setFillStyle(dark ? '#ffffff' : '#17131f')
          for (let y = 0; y < input.rows; y += 1) {
            for (let x = 0; x < input.cols; x += 1) {
              const cellData = cellAt(x, y)
              if (!cellData?.symbol || cellData.colorIndex < 0 || isDarkHex(hexAt(x, y)) !== dark) continue
              context.fillText(cellData.symbol.slice(0, 4), gridLeft + x * cell + cell / 2, gridTop + y * cell + cell / 2)
            }
          }
        }
      }

      // Row / column indexes, counted from 0 at the top-left corner, on all four sides.
      const indexDigits = String(Math.max(input.cols, input.rows, 1) - 1).length
      context.setFontSize(Math.max(5, Math.min(13, Math.floor((cell - 2) / (0.62 * indexDigits)))))
      context.setFillStyle('#4c4254')
      for (let x = 0; x < input.cols; x += 1) {
        const centerX = gridLeft + x * cell + cell / 2
        context.fillText(String(x), centerX, frameTop + ruler / 2)
        context.fillText(String(x), centerX, gridTop + gridHeight + ruler / 2)
      }
      for (let y = 0; y < input.rows; y += 1) {
        const centerY = gridTop + y * cell + cell / 2
        context.fillText(String(y), frameLeft + ruler / 2, centerY)
        context.fillText(String(y), gridLeft + gridWidth + ruler / 2, centerY)
      }

      // Red guide lines every 10 cells, starting at the top-left corner of the grid.
      context.beginPath()
      for (let x = 0; x <= input.cols; x += EXPORT_GUIDE_BLOCK) {
        context.moveTo(gridLeft + x * cell, frameTop)
        context.lineTo(gridLeft + x * cell, frameTop + frameHeight)
      }
      for (let y = 0; y <= input.rows; y += EXPORT_GUIDE_BLOCK) {
        context.moveTo(frameLeft, gridTop + y * cell)
        context.lineTo(frameLeft + frameWidth, gridTop + y * cell)
      }
      context.setStrokeStyle('#e5484d')
      context.setLineWidth(Math.max(2, Math.round(cell / 10)))
      context.stroke()

      context.setTextAlign('left')
      context.setTextBaseline('normal')
      context.setFontSize(20)
      legend.forEach((color, index) => {
        const column = index % 4
        const row = Math.floor(index / 4)
        const x = padding + column * Math.floor(frameWidth / 4)
        const y = layout.legendTop + row * 46
        context.setFillStyle(color.hex)
        context.fillRect(x, y - 18, 24, 24)
        context.setStrokeStyle('rgba(35, 25, 45, 0.22)')
        context.setLineWidth(1)
        context.strokeRect(x, y - 18, 24, 24)
        context.setFillStyle('#403749')
        context.fillText(`${color.code} ×${color.count}`, x + 34, y)
      })
      context.restore()
    })

    const destWidth = Math.round(canvasWidth * pixelRatio)
    const destHeight = Math.round(canvasHeight * pixelRatio)
    const result = await Taro.canvasToTempFilePath({
      canvasId: 'export-canvas',
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      destWidth,
      destHeight,
      fileType: 'png',
      quality: 1,
    })
    return { tempPath: result.tempFilePath, width: destWidth, height: destHeight }
  },
}

export const taroAlbumAdapter: MiniappAlbumAdapter = {
  async requestPermission() {
    try {
      await Taro.authorize({ scope: 'scope.writePhotosAlbum' })
      return true
    } catch {
      return false
    }
  },
  async saveImage(path: string) {
    await Taro.saveImageToPhotosAlbum({ filePath: path })
  },
}

export async function showSavePermissionHint() {
  await Taro.showModal({
    title: '需要保存权限',
    content: '保存图纸需要访问相册，请在系统设置中允许后重试。',
    confirmText: '知道了',
    showCancel: false,
  })
}
