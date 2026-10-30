import { saveAs } from 'file-saver'
import { isDarkHex } from './color'
import type { BeadCell, PaletteColor } from './types'

const GUIDE_BLOCK_SIZE = 5
const EXPORT_MARGIN = 32
const EXPORT_GRID_PAD = 12
const EXPORT_CELL_GAP = 1
const EXPORT_CELL_MIN = 14
const EXPORT_CELL_MAX = 36

function getExportCellSize(gridCols: number, gridRows: number, maxSide: number) {
  const longSide = Math.max(1, gridCols, gridRows)
  const available = maxSide - EXPORT_MARGIN * 2 - EXPORT_GRID_PAD * 2
  const fit = Math.floor(available / longSide) - EXPORT_CELL_GAP
  return Math.max(EXPORT_CELL_MIN, Math.min(EXPORT_CELL_MAX, fit))
}

function fitExportLabelFont(ctx: CanvasRenderingContext2D, labels: readonly string[], cellSize: number) {
  const maxWidth = cellSize - 3
  let size = Math.max(6, Math.floor(cellSize * 0.5))
  for (; size > 6; size -= 1) {
    ctx.font = `800 ${size}px "Noto Sans SC", sans-serif`
    let fits = true
    for (const label of labels) {
      if (ctx.measureText(label).width > maxWidth) {
        fits = false
        break
      }
    }
    if (fits) break
  }
  return size
}

export function sanitizeExportFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim()
  return base.slice(0, 80) || 'pattern'
}

export function formatExportError(cause: unknown) {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return '浏览器资源限制或内存不足'
}

export function limitExportCanvas(source: HTMLCanvasElement, maxSide: number) {
  const longSide = Math.max(source.width, source.height)
  if (longSide <= maxSide) return source
  const scale = maxSide / longSide
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成 PNG'))
    }, type)
  })
}

function drawExportGuideLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cellSize: number,
  gap: number,
  cols: number,
  rows: number,
) {
  if (cols <= GUIDE_BLOCK_SIZE && rows <= GUIDE_BLOCK_SIZE) return

  const lines: Array<[number, number, number, number]> = []
  for (let col = GUIDE_BLOCK_SIZE; col < cols; col += GUIDE_BLOCK_SIZE) {
    const guideX = x + col * cellSize + (col - 0.5) * gap
    lines.push([guideX, y, guideX, y + height])
  }
  for (let row = GUIDE_BLOCK_SIZE; row < rows; row += GUIDE_BLOCK_SIZE) {
    const guideY = y + row * cellSize + (row - 0.5) * gap
    lines.push([x, guideY, x + width, guideY])
  }
  if (!lines.length) return

  const strokeLines = (lineWidth: number, strokeStyle: string) => {
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = strokeStyle
    ctx.lineCap = 'butt'
    lines.forEach(([x1, y1, x2, y2]) => {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    })
    ctx.stroke()
  }

  ctx.save()
  strokeLines(3, 'rgba(255, 255, 255, 0.78)')
  strokeLines(1, 'rgba(29, 26, 35, 0.78)')
  ctx.restore()
}

export function formatLegendLabel(color: Pick<PaletteColor, 'code' | 'name'>) {
  return color.name ? `${color.code} ${color.name}` : color.code
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

export function buildPatternExportCanvas(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  gridCols: number,
  gridRows: number,
  activeCells: number,
  maxSide: number,
  mirrored = false,
) {
  const exportCell = getExportCellSize(gridCols, gridRows, maxSide)
  const gap = EXPORT_CELL_GAP
  const gridPad = EXPORT_GRID_PAD
  const gridInnerW = gridCols * exportCell + Math.max(0, gridCols - 1) * gap
  const gridInnerH = gridRows * exportCell + Math.max(0, gridRows - 1) * gap
  const gridW = gridInnerW + gridPad * 2
  const gridH = gridInnerH + gridPad * 2

  const legendCols = Math.min(4, Math.max(1, palette.length))
  const legendRows = Math.ceil(palette.length / legendCols)
  const legendItemW = 240
  const legendItemH = 28
  const legendPad = 24
  const legendW = legendCols * legendItemW + legendPad * 2
  const legendH = legendRows * legendItemH + legendPad * 2 + 28

  const margin = EXPORT_MARGIN
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
  const subtitle = `${gridCols}×${gridRows} · ${activeCells.toLocaleString()} 颗豆 · ${palette.length} 色${mirrored ? ' · 镜像' : ''}`
  ctx.fillText(subtitle, margin, margin + 48)

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
    }
  }
  drawExportGuideLines(
    ctx,
    gridX + gridPad,
    gridY + gridPad,
    gridInnerW,
    gridInnerH,
    exportCell,
    gap,
    gridCols,
    gridRows,
  )
  const labelFont = fitExportLabelFont(ctx, palette.map((color) => color.symbol), exportCell)
  ctx.font = `800 ${labelFont}px "Noto Sans SC", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const cell = pattern[y][x]
      if (cell.colorIndex < 0 || !cell.symbol) continue
      const px = gridX + gridPad + x * (exportCell + gap)
      const py = gridY + gridPad + y * (exportCell + gap)
      ctx.fillStyle = isDarkHex(cell.hex) ? '#fff' : '#1d1a23'
      ctx.fillText(cell.symbol, px + exportCell / 2, py + exportCell / 2 + 0.5)
    }
  }

  const legendX = margin + (contentW - legendW) / 2
  const legendY = gridY + gridH + 24
  ctx.fillStyle = '#1d1a23'
  ctx.font = '700 16px "Noto Sans SC", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('色号清单（用量倒序）', legendX + legendPad, legendY + 20)

  palette.forEach((color, index) => {
    const col = index % legendCols
    const row = Math.floor(index / legendCols)
    const x = legendX + legendPad + col * legendItemW
    const y = legendY + 36 + row * legendItemH
    ctx.fillStyle = color.hex
    ctx.fillRect(x, y + 4, 32, 20)
    ctx.strokeStyle = 'rgba(43, 35, 58, 0.18)'
    ctx.strokeRect(x + 0.5, y + 4.5, 31, 19)
    ctx.fillStyle = isDarkHex(color.hex) ? '#fff' : '#1d1a23'
    ctx.font = '700 10px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(color.code, x + 16, y + 14)
    ctx.fillStyle = '#1d1a23'
    ctx.font = '400 13px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(formatLegendLabel(color), x + 40, y + 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#6f647d'
    ctx.fillText(String(color.count), x + legendItemW - 12, y + 14)
  })

  return canvas
}

export type PatternExportOutcome = 'downloaded' | 'share' | 'share_aborted' | 'share_sheet'

export async function deliverPatternPng({
  blob,
  filename,
  mobile,
  existingSheetUrl = '',
}: {
  blob: Blob
  filename: string
  mobile: boolean
  existingSheetUrl?: string
}): Promise<{ outcome: PatternExportOutcome; sheetUrl?: string; notice: string }> {
  if (mobile) {
    const file = new File([blob], filename, { type: 'image/png' })
    const shareData = { files: [file], title: filename }
    if (typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData)
        return { outcome: 'share', notice: '请在分享面板中选择“存储图像”保存到相册' }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return { outcome: 'share_aborted', notice: '' }
        }
      }
    }
    if (existingSheetUrl) URL.revokeObjectURL(existingSheetUrl)
    return { outcome: 'share_sheet', sheetUrl: URL.createObjectURL(blob), notice: '' }
  }
  saveAs(blob, filename)
  return { outcome: 'downloaded', notice: 'PNG 已开始下载' }
}
