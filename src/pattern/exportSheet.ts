import { saveAs } from 'file-saver'
import { isDarkHex } from './color'
import type { BeadCell, PaletteColor } from './types'

const EXPORT_GUIDE_BLOCK = 10
const EXPORT_MARGIN = 32
const EXPORT_HEADER_H = 72
const EXPORT_CELL_MIN = 14
const EXPORT_CELL_MAX = 36
const BROWSER_CANVAS_MAX = 16384

function getExportCellSize(gridCols: number, gridRows: number) {
  const longSide = Math.max(1, gridCols, gridRows)
  // Legend height is added under the grid and must not shrink these cells.
  const gridBudget = BROWSER_CANVAS_MAX - 480
  const fit = Math.floor(gridBudget / longSide)
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

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成 PNG'))
    }, type)
  })
}

export function formatLegendLabel(color: Pick<PaletteColor, 'code' | 'name'>) {
  return color.name ? `${color.code} ${color.name}` : color.code
}

export function buildPatternExportCanvas(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  gridCols: number,
  gridRows: number,
  activeCells: number,
  mirrored = false,
) {
  const cell = getExportCellSize(gridCols, gridRows)
  const ruler = Math.max(cell, 22)
  const gridWidth = gridCols * cell
  const gridHeight = gridRows * cell
  const frameWidth = gridWidth + ruler * 2
  const frameHeight = gridHeight + ruler * 2

  const legendCols = Math.min(4, Math.max(1, palette.length))
  const legendRows = Math.ceil(palette.length / legendCols)
  const legendItemH = 28
  const legendPad = 24
  const legendH = legendRows * legendItemH + legendPad * 2 + 28
  const contentW = Math.max(frameWidth, 640)
  const legendItemW = (contentW - legendPad * 2) / legendCols
  const width = contentW + EXPORT_MARGIN * 2
  const height = EXPORT_HEADER_H + frameHeight + 24 + legendH + EXPORT_MARGIN
  const scale = Math.min(1, BROWSER_CANVAS_MAX / Math.max(width, height, 1))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')

  ctx.scale(scale, scale)
  ctx.fillStyle = '#fffaf1'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#1d1a23'
  ctx.font = '700 24px "Noto Sans SC", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('拼豆图纸', EXPORT_MARGIN, EXPORT_MARGIN + 24)
  ctx.font = '400 14px "Noto Sans SC", sans-serif'
  ctx.fillStyle = '#6f647d'
  const subtitle = `${gridCols}×${gridRows} · ${activeCells.toLocaleString()} 颗豆 · ${palette.length} 色${mirrored ? ' · 镜像' : ''}`
  ctx.fillText(subtitle, EXPORT_MARGIN, EXPORT_MARGIN + 48)

  const frameLeft = EXPORT_MARGIN + (contentW - frameWidth) / 2
  const frameTop = EXPORT_HEADER_H
  const gridLeft = frameLeft + ruler
  const gridTop = frameTop + ruler

  ctx.fillStyle = '#e4e1e8'
  ctx.fillRect(frameLeft, frameTop, frameWidth, frameHeight)
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const bead = pattern[y]?.[x]
      ctx.fillStyle = bead?.hex || '#f3eee5'
      ctx.fillRect(gridLeft + x * cell, gridTop + y * cell, cell, cell)
    }
  }

  ctx.beginPath()
  for (let x = 0; x <= gridCols; x += 1) {
    const lineX = gridLeft + x * cell
    ctx.moveTo(lineX, frameTop)
    ctx.lineTo(lineX, frameTop + frameHeight)
  }
  for (let y = 0; y <= gridRows; y += 1) {
    const lineY = gridTop + y * cell
    ctx.moveTo(frameLeft, lineY)
    ctx.lineTo(frameLeft + frameWidth, lineY)
  }
  ctx.strokeStyle = 'rgba(35, 25, 45, 0.22)'
  ctx.lineWidth = 1
  ctx.stroke()

  const labelFont = fitExportLabelFont(ctx, palette.map((color) => color.symbol), cell)
  ctx.font = `800 ${labelFont}px "Noto Sans SC", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const bead = pattern[y]?.[x]
      if (!bead || bead.colorIndex < 0 || !bead.symbol) continue
      ctx.fillStyle = isDarkHex(bead.hex) ? '#fff' : '#1d1a23'
      ctx.fillText(bead.symbol, gridLeft + x * cell + cell / 2, gridTop + y * cell + cell / 2)
    }
  }

  const indexDigits = String(Math.max(gridCols, gridRows, 1) - 1).length
  const indexFont = Math.max(8, Math.min(13, Math.floor((cell - 2) / (0.62 * indexDigits))))
  ctx.font = `600 ${indexFont}px "Noto Sans SC", sans-serif`
  ctx.fillStyle = '#4c4254'
  for (let x = 0; x < gridCols; x += 1) {
    const centerX = gridLeft + x * cell + cell / 2
    ctx.fillText(String(x), centerX, frameTop + ruler / 2)
    ctx.fillText(String(x), centerX, gridTop + gridHeight + ruler / 2)
  }
  for (let y = 0; y < gridRows; y += 1) {
    const centerY = gridTop + y * cell + cell / 2
    ctx.fillText(String(y), frameLeft + ruler / 2, centerY)
    ctx.fillText(String(y), gridLeft + gridWidth + ruler / 2, centerY)
  }

  ctx.beginPath()
  for (let x = 0; x <= gridCols; x += EXPORT_GUIDE_BLOCK) {
    const guideX = gridLeft + x * cell
    ctx.moveTo(guideX, frameTop)
    ctx.lineTo(guideX, frameTop + frameHeight)
  }
  for (let y = 0; y <= gridRows; y += EXPORT_GUIDE_BLOCK) {
    const guideY = gridTop + y * cell
    ctx.moveTo(frameLeft, guideY)
    ctx.lineTo(frameLeft + frameWidth, guideY)
  }
  ctx.strokeStyle = '#e5484d'
  ctx.lineWidth = Math.max(2, Math.round(cell / 10))
  ctx.stroke()

  const legendX = EXPORT_MARGIN
  const legendY = frameTop + frameHeight + 24
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
    ctx.lineWidth = 1
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

export function isAndroidRuntime() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

export function isWechatRuntime() {
  return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)
}

export function isAndroidWechatRuntime() {
  return isAndroidRuntime() && isWechatRuntime()
}

export function releaseExportSheetUrl(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法生成可保存的图片'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取导出图片'))
    reader.readAsDataURL(blob)
  })
}

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
  // Android WeChat blocks download links created from Blob URLs and asks the
  // user to open the page in another browser. A data URL rendered as a normal
  // <img> stays entirely client-side and can be saved with WeChat's native
  // long-press image menu.
  if (isAndroidWechatRuntime()) {
    if (existingSheetUrl) releaseExportSheetUrl(existingSheetUrl)
    return { outcome: 'share_sheet', sheetUrl: await blobToDataUrl(blob), notice: '' }
  }

  // Android share sheets do not consistently expose a "save image" action.
  // Download the PNG directly instead; Android browsers normally place it in
  // the Downloads folder, where gallery apps can index it.
  if (isAndroidRuntime()) {
    saveAs(blob, filename)
    return { outcome: 'downloaded', notice: '图片已开始下载，请在相册或“下载”目录中查看' }
  }

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
    if (existingSheetUrl) releaseExportSheetUrl(existingSheetUrl)
    return { outcome: 'share_sheet', sheetUrl: URL.createObjectURL(blob), notice: '' }
  }
  saveAs(blob, filename)
  return { outcome: 'downloaded', notice: 'PNG 已开始下载' }
}
