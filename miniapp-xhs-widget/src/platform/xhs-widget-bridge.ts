import { getPaletteColors } from '../../../src/palettes'
import { quantizeRgbaGrid, quantizedPatternToSnapshot } from '../../../src/miniapp/core'
import type { PatternSnapshot } from '../../../src/pattern/types'

interface CanvasContext {
  clearRect(x: number, y: number, width: number, height: number): void
  drawImage(path: string, x: number, y: number, width: number, height: number): void
  draw(reserve?: boolean, callback?: () => void): void
  setFillStyle(value: string): void
  fillRect(x: number, y: number, width: number, height: number): void
  setStrokeStyle(value: string): void
  strokeRect(x: number, y: number, width: number, height: number): void
  setFontSize(value: number): void
  fillText(value: string, x: number, y: number): void
}

type XhsApi = Record<string, unknown>

function api(): XhsApi {
  const value = (globalThis as { xhs?: XhsApi }).xhs
  if (!value) throw new Error('当前运行环境未提供 xhs API')
  return value
}

function drawAndWait(canvasId: string, draw: (context: CanvasContext) => void) {
  return new Promise<void>((resolve, reject) => {
    try {
      const createCanvasContext = api().createCanvasContext as (id: string) => CanvasContext
      const context = createCanvasContext(canvasId)
      draw(context)
      context.draw(false, resolve)
    } catch (error) {
      reject(error)
    }
  })
}

export interface WidgetImageSource {
  path: string
  width: number
  height: number
  name: string
}

export async function chooseWidgetImage(): Promise<WidgetImageSource | null> {
  const result = await api().chooseImage({ count: 1, sourceType: ['album', 'camera'] })
  const path = result?.tempFilePaths?.[0] || result?.tempFiles?.[0]?.path
  if (!path) return null
  const info = await api().getImageInfo({ src: path }).catch(() => ({ width: 1, height: 1 }))
  return {
    path,
    width: Number(info.width) || 1,
    height: Number(info.height) || 1,
    name: path.split('/').pop() || 'source-image',
  }
}

export async function decodeWidgetImage(source: WidgetImageSource, cols: number, rows: number) {
  await drawAndWait('decode-canvas', (context) => {
    context.clearRect(0, 0, cols, rows)
    context.drawImage(source.path, 0, 0, cols, rows)
  })
  const result = await api().canvasGetImageData({ canvasId: 'decode-canvas', x: 0, y: 0, width: cols, height: rows })
  return { data: result.data, cols: result.width || cols, rows: result.height || rows }
}

export async function quantizeWidgetImage(source: WidgetImageSource, cols: number, rows: number, maxColors: number) {
  const grid = await decodeWidgetImage(source, cols, rows)
  const quantized = quantizeRgbaGrid(grid, {
    shape: rows === cols ? 'square' : 'ratio',
    gridSize: cols,
    maxColors,
    palette: getPaletteColors('mard'),
    edgePriority: true,
    removeBackground: true,
    dither: 'light',
    cleanupIsolated: true,
  })
  return quantizedPatternToSnapshot(quantized)
}

export async function saveWidgetSnapshot(snapshot: PatternSnapshot, mirrored: boolean) {
  const cols = snapshot.pattern[0]?.length || 1
  const rows = snapshot.pattern.length || 1
  const padding = 28
  const cell = Math.max(10, Math.min(26, Math.floor(900 / Math.max(cols, rows))))
  const gridWidth = cols * cell
  const gridHeight = rows * cell
  const width = gridWidth + padding * 2
  const height = gridHeight + 120

  await drawAndWait('export-canvas', (context) => {
    context.setFillStyle('#fffaf1')
    context.fillRect(0, 0, width, height)
    context.setFillStyle('#17131f')
    context.setFontSize(24)
    context.fillText('拼豆图纸 · 本地生成', padding, 34)
    context.setFillStyle('#756b82')
    context.setFontSize(15)
    context.fillText(`${cols} × ${rows} · ${snapshot.palette.length} 色`, padding, 60)
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const sourceX = mirrored ? cols - 1 - x : x
        const cellData = snapshot.pattern[y]?.[sourceX]
        context.setFillStyle(cellData?.hex || '#fffaf1')
        context.fillRect(padding + x * cell, 84 + y * cell, cell, cell)
        context.setStrokeStyle('rgba(35, 25, 45, 0.18)')
        context.strokeRect(padding + x * cell, 84 + y * cell, cell, cell)
      }
    }
  })

  const output = await api().canvasToTempFilePath({ canvasId: 'export-canvas', x: 0, y: 0, width, height, destWidth: width * 2, destHeight: height * 2, fileType: 'png' })
  await api().saveImageToPhotosAlbum({ filePath: output.tempFilePath })
}
