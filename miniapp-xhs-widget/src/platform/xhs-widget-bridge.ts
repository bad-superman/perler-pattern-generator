import { Zlib } from 'fflate'
import { colorRuns } from '../../../miniapp/src/pattern-view/runs'
import { getPaletteColors } from '../../../src/palettes'
import { quantizeRgbaGrid, quantizedPatternToSnapshot } from '../../../src/miniapp/core'
import { isDarkHex } from '../../../src/pattern/color'
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
  save(): void
  restore(): void
  scale(x: number, y: number): void
  translate(x: number, y: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  rect(x: number, y: number, width: number, height: number): void
  stroke(): void
  setLineWidth(value: number): void
  setTextAlign(value: string): void
  setTextBaseline(value: string): void
}

type XhsApi = Record<string, (...args: never[]) => unknown>

/** Must match the decode canvas style. The export canvas is mounted at the sheet size. */
const DECODE_CANVAS_SIZE = 104
/**
 * Device export crops a single canvas past about 1024 physical pixels, so the
 * sheet is drawn in tiles and written as one PNG. Cap the long side to keep
 * the bitmap near 14MB on a 104-wide pattern.
 */
const MAX_EXPORT_OUTPUT_SIDE = 2048
/** Literal canvas size in the template. The host ignores later style changes. */
const EXPORT_CANVAS_SIDE = 500
/** Largest physical square canvasGetImageData returns promptly. */
const EXPORT_TILE_PHYSICAL = 480
const EXPORT_GUIDE_BLOCK = 10

function api(): XhsApi {
  const value = (globalThis as { xhs?: XhsApi }).xhs
  if (!value) throw new Error('当前运行环境未提供 xhs API')
  return value
}

function callXhs<T>(method: string, options: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (value: T) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      const message = error && typeof error === 'object' && 'errMsg' in error ? String((error as { errMsg?: string }).errMsg) : ''
      reject(new Error(message || `${method} 失败`))
    }
    const fn = api()[method]
    if (typeof fn !== 'function') {
      reject(new Error(`当前环境没有 ${method}`))
      return
    }
    let returned: unknown
    try {
      returned = fn({ ...options, success: finish, fail })
    } catch (error) {
      fail(error)
      return
    }
    if (returned && typeof (returned as Promise<T>).then === 'function') {
      ;(returned as Promise<T>).then((value) => {
        // getImageInfo resolves this promise with null and delivers the image
        // size only through success. Accepting that null reads .width and crashes.
        if (value == null) return
        finish(value)
      }, fail)
    }
  })
}

function drawAndWait(canvasId: string, draw: (context: CanvasContext) => void, timeoutMs = 800) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('画布绘制超时'))
    }, timeoutMs)
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    try {
      const context = api().createCanvasContext(canvasId) as CanvasContext
      draw(context)
      context.draw(false, finish)
    } catch (error) {
      settled = true
      clearTimeout(timer)
      reject(error)
    }
  })
}

export interface WidgetViewport {
  windowWidth: number
  windowHeight: number
  pixelRatio: number
  safeBottom: number
}

export function widgetCanvasContext(canvasId: string) {
  return api().createCanvasContext(canvasId) as CanvasContext
}

export function widgetSelectorQuery() {
  const create = api().createSelectorQuery
  if (typeof create !== 'function') return null
  return create() as {
    select: (selector: string) => {
      boundingClientRect: (callback: (rect: { left?: number; top?: number } | Array<{ left?: number; top?: number }>) => void) => { exec: () => void }
    }
  }
}

export function widgetViewport(): WidgetViewport {
  try {
    const info = api().getSystemInfoSync() as {
      windowWidth?: number
      windowHeight?: number
      screenHeight?: number
      pixelRatio?: number
      safeArea?: { height?: number }
    }
    const windowWidth = Number(info.windowWidth) || 375
    let windowHeight = Number(info.windowHeight) || 640
    const screenHeight = Number(info.screenHeight) || windowHeight
    const displayMode = (info as { displayMode?: string }).displayMode
    let half = displayMode !== 'full'
    try {
      const launch = api().getLaunchOptionsSync() as { launchMode?: string; query?: { xhsMpScreenMode?: string } }
      half = displayMode !== 'full' && (launch?.launchMode === 'half' || launch?.query?.xhsMpScreenMode === 'half')
    } catch {
      half = displayMode !== 'full' && half
    }
    // Some half-screen hosts report the full screen before the card is measured.
    // A later onResize carries the real webview height and must not pass through here.
    if (half && windowHeight > screenHeight * 0.9) windowHeight = Math.round(screenHeight * 0.69)
    const safeHeight = Number(info.safeArea?.height) || windowHeight
    const safeBottom = Math.max(0, Math.min(28, windowHeight - safeHeight))
    return {
      windowWidth,
      windowHeight,
      pixelRatio: Math.max(1, Number(info.pixelRatio) || 2),
      safeBottom,
    }
  } catch {
    return { windowWidth: 375, windowHeight: 640, pixelRatio: 2, safeBottom: 0 }
  }
}

function finite(value: number | undefined) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** Canvas touch coordinates that land inside the CSS canvas, whatever pixel space the host used. */
export function canvasTouchPoint(
  touch: Record<string, number | undefined>,
  origin: { x: number; y: number },
  width: number,
  height: number,
  pixelRatio: number,
  measuredWidth = width,
  measuredHeight = height,
) {
  const touchWidth = measuredWidth || width
  const touchHeight = measuredHeight || height
  const ratio = Math.max(1, pixelRatio)
  const pageX = finite(touch.pageX)
  const pageY = finite(touch.pageY)
  const clientX = finite(touch.clientX) ?? pageX
  const clientY = finite(touch.clientY) ?? pageY
  const rawX = finite(touch.x)
  const rawY = finite(touch.y)
  // Xiaohongshu touch objects carry page/client coordinates. Some hosts also
  // copy those onto x/y; only an x/y pair that differs from the page point is
  // canvas-local (the WeChat canvas convention).
  const rawIsPage = rawX != null && rawY != null && pageX != null && pageY != null
    && Math.abs(rawX - pageX) < 0.5 && Math.abs(rawY - pageY) < 0.5
  let x: number
  let y: number
  if (rawX != null && rawY != null && !rawIsPage) {
    x = rawX
    y = rawY
    const localX = clientX != null ? clientX - origin.x : undefined
    const localY = clientY != null ? clientY - origin.y : undefined
    const physical = localX != null && localY != null && ratio > 1
      && Math.abs(x - localX * ratio) <= ratio * 2
      && Math.abs(y - localY * ratio) <= ratio * 2
    if (physical) {
      x = localX as number
      y = localY as number
    } else if (ratio > 1 && (x > touchWidth + 1 || y > touchHeight + 1) && x / ratio <= touchWidth + 1 && y / ratio <= touchHeight + 1) {
      x /= ratio
      y /= ratio
    }
  } else if (clientX != null && clientY != null) {
    x = clientX - origin.x
    y = clientY - origin.y
    if (ratio > 1 && (clientX > touchWidth + origin.x + 1 || clientY > touchHeight + origin.y + 1)) {
      x = clientX / ratio - origin.x
      y = clientY / ratio - origin.y
    }
  } else {
    x = 0
    y = 0
  }
  // The native canvas can be displayed larger than the bitmap we draw into.
  if (touchWidth > 0 && touchHeight > 0 && (Math.abs(touchWidth - width) > 2 || Math.abs(touchHeight - height) > 2)) {
    x = (x * width) / touchWidth
    y = (y * height) / touchHeight
  }
  return { x, y }
}

function decodeBase64(value: string): Uint8ClampedArray {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '')
  const length = Math.floor((clean.length * 3) / 4)
  const bytes = new Uint8ClampedArray(length)
  let output = 0
  for (let index = 0; index < clean.length; index += 4) {
    const a = alphabet.indexOf(clean[index])
    const b = alphabet.indexOf(clean[index + 1])
    const c = alphabet.indexOf(clean[index + 2])
    const d = alphabet.indexOf(clean[index + 3])
    const chunk = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d)
    bytes[output] = (chunk >> 16) & 255
    if (c >= 0 && output + 1 < length) bytes[output + 1] = (chunk >> 8) & 255
    if (d >= 0 && output + 2 < length) bytes[output + 2] = chunk & 255
    output += 3
  }
  return bytes
}

function toRgbaBytes(data: unknown, width: number, height: number): Uint8ClampedArray {
  const expected = width * height * 4
  if (typeof data === 'string') {
    // A base64 payload can be the same length as the raw byte count, so the
    // charset decides. Raw pixels include bytes outside the base64 alphabet.
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      const decoded = decodeBase64(data)
      if (decoded.length >= 4) return decoded
    }
    if (data.length === expected) {
      const bytes = new Uint8ClampedArray(expected)
      for (let index = 0; index < expected; index += 1) bytes[index] = data.charCodeAt(index) & 255
      return bytes
    }
    const decoded = decodeBase64(data)
    if (decoded.length < expected) throw new Error('画布像素长度不足')
    return decoded
  }
  if (data instanceof Uint8ClampedArray) return data
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    return new Uint8ClampedArray(view.buffer, view.byteOffset, view.byteLength)
  }
  if (data instanceof ArrayBuffer) return new Uint8ClampedArray(data)
  if (Array.isArray(data)) return Uint8ClampedArray.from(data)
  throw new Error('无法读取画布像素')
}

function sampleGrid(bytes: Uint8ClampedArray, width: number, height: number, cols: number, rows: number) {
  if (bytes.length < width * height * 4) throw new Error('画布像素长度不足')
  if (width === cols && height === rows) return bytes
  const output = new Uint8ClampedArray(cols * rows * 4)
  for (let y = 0; y < rows; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / rows))
    for (let x = 0; x < cols; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / cols))
      const source = (sourceY * width + sourceX) * 4
      const target = (y * cols + x) * 4
      output[target] = bytes[source]
      output[target + 1] = bytes[source + 1]
      output[target + 2] = bytes[source + 2]
      output[target + 3] = bytes[source + 3]
    }
  }
  return output
}

async function readCanvas(canvasId: string, cssWidth: number, cssHeight: number) {
  const result = await callXhs<{ data: unknown; width?: number; height?: number }>('canvasGetImageData', {
    canvasId,
    x: 0,
    y: 0,
    width: cssWidth,
    height: cssHeight,
  })
  const width = Number(result.width) || cssWidth
  const height = Number(result.height) || cssHeight
  return sampleGrid(toRgbaBytes(result.data, width, height), width, height, cssWidth, cssHeight)
}

export interface WidgetImageSource {
  path: string
  width: number
  height: number
  name: string
}

export function leaveWidget() {
  const xhs = api()
  for (const method of ['navigateBack', 'exitMiniProgram']) {
    const fn = xhs[method]
    if (typeof fn !== 'function') continue
    try {
      fn({ delta: 1 })
    } catch {
      // Simulator stubs are empty functions.
    }
  }
}

export async function chooseWidgetImage(): Promise<WidgetImageSource | null> {
  const result = await callXhs<{ tempFilePaths?: string[]; tempFiles?: Array<{ path?: string; width?: number; height?: number }> } | null>('chooseImage', {
    count: 1,
    sourceType: ['album', 'camera'],
  })
  const file = result?.tempFiles?.[0]
  const path = result?.tempFilePaths?.[0] || file?.path
  if (!path) return null
  let width = Number(file?.width) || 0
  let height = Number(file?.height) || 0
  if (!width || !height) {
    const info = await callXhs<{ width?: number; height?: number } | null>('getImageInfo', { src: path }).catch(() => null)
    width = Number(info?.width) || width
    height = Number(info?.height) || height
  }
  return {
    path,
    width: width || 1,
    height: height || 1,
    name: path.split('/').pop() || 'source-image',
  }
}

export async function decodeWidgetImage(source: WidgetImageSource, cols: number, rows: number) {
  if (cols > DECODE_CANVAS_SIZE || rows > DECODE_CANVAS_SIZE) throw new Error('网格超过解码画布')
  await drawAndWait('decode-canvas', (context) => {
    context.clearRect(0, 0, cols, rows)
    context.drawImage(source.path, 0, 0, cols, rows)
  })
  return { data: await readCanvas('decode-canvas', cols, rows), cols, rows }
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

export interface WidgetExportLayout {
  padding: number
  cell: number
  ruler: number
  gridWidth: number
  gridHeight: number
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
  gridLeft: number
  gridTop: number
  legendTop: number
  width: number
  height: number
  scale: number
  pixelRatio: number
  canvasWidth: number
  canvasHeight: number
  destWidth: number
  destHeight: number
}

/** Logical sheet geometry. The PNG is scaled up from this when it is assembled. */
export function widgetExportLayout(cols: number, rows: number, legendCount: number, pixelRatio: number): WidgetExportLayout {
  const padding = 48
  const headerHeight = 132
  const cell = Math.max(12, Math.min(34, Math.floor(1200 / Math.max(cols, rows, 1))))
  const ruler = Math.max(cell, 22)
  const gridWidth = cols * cell
  const gridHeight = rows * cell
  const frameWidth = gridWidth + ruler * 2
  const frameHeight = gridHeight + ruler * 2
  const legendRows = Math.ceil(legendCount / 4)
  const width = frameWidth + padding * 2
  const height = headerHeight + frameHeight + 36 + legendRows * 46 + padding
  const ratio = Math.max(1, pixelRatio)
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
    scale: 1,
    pixelRatio: ratio,
    canvasWidth: EXPORT_CANVAS_SIDE,
    canvasHeight: EXPORT_CANVAS_SIDE,
    destWidth: width,
    destHeight: height,
  }
}

export function exportSheetSize(snapshot: PatternSnapshot, pixelRatio: number) {
  const cols = snapshot.pattern[0]?.length || 1
  const rows = snapshot.pattern.length || 1
  const legendCount = snapshot.palette.filter((color) => color.count > 0).length
  return widgetExportLayout(cols, rows, legendCount, pixelRatio)
}

async function readPixel(canvasId: string, x: number, y: number) {
  const result = await callXhs<{ data: unknown; width?: number; height?: number }>('canvasGetImageData', {
    canvasId,
    x,
    y,
    width: 1,
    height: 1,
  })
  const width = Number(result.width) || 1
  const height = Number(result.height) || 1
  const bytes = toRgbaBytes(result.data, width, height)
  return bytes[0] || 0
}

/** The host only sizes a canvas from the style it had on first attach. */
async function ensureExportCanvas(width: number, height: number) {
  let last = '未创建'
  for (let cycle = 0; cycle < 4; cycle += 1) {
    try {
      await drawAndWait('export-canvas', (context) => {
        context.setFillStyle('#ff2d2d')
        context.fillRect(0, 0, width, height)
      })
    } catch (error) {
      last = error instanceof Error ? error.message : '绘制失败'
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 80))
      try {
        const red = await readPixel('export-canvas', Math.max(0, width - 1), Math.max(0, height - 1))
        if (red > 180) return
        last = `角点颜色 ${red}`
      } catch (error) {
        last = error instanceof Error ? error.message : '读取失败'
      }
    }
  }
  throw new Error(`导出画布未就绪（${last}）`)
}

interface SheetClip {
  x0: number
  y0: number
  x1: number
  y1: number
}

function overlaps(clip: SheetClip, left: number, top: number, width: number, height: number) {
  return left + width >= clip.x0 && left <= clip.x1 && top + height >= clip.y0 && top <= clip.y1
}

function paintSheet(
  context: CanvasContext,
  snapshot: PatternSnapshot,
  mirrored: boolean,
  layout: WidgetExportLayout,
  clip: SheetClip,
) {
  const cols = snapshot.pattern[0]?.length || 1
  const rows = snapshot.pattern.length || 1
  const legend = snapshot.palette.filter((color) => color.count > 0)
  const activeCells = legend.reduce((total, color) => total + color.count, 0)
  const cellAt = (x: number, y: number) => snapshot.pattern[y]?.[mirrored ? cols - 1 - x : x]
  const hexAt = (x: number, y: number) => {
    const cellData = cellAt(x, y)
    const paletteHex = cellData && cellData.colorIndex >= 0 ? snapshot.palette[cellData.colorIndex]?.hex : undefined
    return paletteHex || cellData?.hex || '#fffaf1'
  }

  context.setFillStyle('#fffaf1')
  context.fillRect(0, 0, layout.width, layout.height)
  if (overlaps(clip, layout.padding, 20, layout.width, 90)) {
    context.setFillStyle('#17131f')
    context.setFontSize(34)
    context.fillText('拼豆图纸 · 本地生成', layout.padding, 54)
    context.setFillStyle('#756b82')
    context.setFontSize(22)
    context.fillText(`${cols} × ${rows} · ${legend.length} 色 · ${activeCells} 颗${mirrored ? ' · 镜像' : ''}`, layout.padding, 92)
  }

  if (overlaps(clip, layout.frameLeft, layout.frameTop, layout.frameWidth, layout.frameHeight)) {
    context.setFillStyle('#e4e1e8')
    context.fillRect(layout.frameLeft, layout.frameTop, layout.frameWidth, layout.frameHeight)
    colorRuns({ x0: 0, x1: cols - 1, y0: 0, y1: rows - 1 }, hexAt).forEach((list, hex) => {
      context.setFillStyle(hex)
      for (let index = 0; index < list.length; index += 3) {
        const left = layout.gridLeft + list[index] * layout.cell
        const top = layout.gridTop + list[index + 1] * layout.cell
        const runWidth = list[index + 2] * layout.cell
        if (!overlaps(clip, left, top, runWidth, layout.cell)) continue
        context.fillRect(left, top, runWidth, layout.cell)
      }
    })

    context.beginPath()
    for (let x = 0; x <= cols; x += 1) {
      const lineX = layout.gridLeft + x * layout.cell
      if (lineX < clip.x0 - 2 || lineX > clip.x1 + 2) continue
      context.moveTo(lineX, layout.frameTop)
      context.lineTo(lineX, layout.frameTop + layout.frameHeight)
    }
    for (let y = 0; y <= rows; y += 1) {
      const lineY = layout.gridTop + y * layout.cell
      if (lineY < clip.y0 - 2 || lineY > clip.y1 + 2) continue
      context.moveTo(layout.frameLeft, lineY)
      context.lineTo(layout.frameLeft + layout.frameWidth, lineY)
    }
    context.rect(layout.frameLeft, layout.frameTop, layout.frameWidth, layout.frameHeight)
    context.setStrokeStyle('rgba(35, 25, 45, 0.22)')
    context.setLineWidth(1)
    context.stroke()

    context.setTextAlign?.('center')
    context.setTextBaseline?.('middle')
    if (layout.cell >= 18) {
      context.setFontSize(Math.max(10, Math.floor(layout.cell * 0.36)))
      for (const dark of [false, true]) {
        context.setFillStyle(dark ? '#ffffff' : '#17131f')
        for (let y = 0; y < rows; y += 1) {
          const centerY = layout.gridTop + y * layout.cell + layout.cell / 2
          if (centerY < clip.y0 - layout.cell || centerY > clip.y1 + layout.cell) continue
          for (let x = 0; x < cols; x += 1) {
            const centerX = layout.gridLeft + x * layout.cell + layout.cell / 2
            if (centerX < clip.x0 - layout.cell || centerX > clip.x1 + layout.cell) continue
            const cellData = cellAt(x, y)
            if (!cellData?.symbol || cellData.colorIndex < 0 || isDarkHex(hexAt(x, y)) !== dark) continue
            context.fillText(cellData.symbol.slice(0, 4), centerX, centerY)
          }
        }
      }
    }

    const indexDigits = String(Math.max(cols, rows, 1) - 1).length
    context.setFontSize(Math.max(5, Math.min(13, Math.floor((layout.cell - 2) / (0.62 * indexDigits)))))
    context.setFillStyle('#4c4254')
    for (let x = 0; x < cols; x += 1) {
      const centerX = layout.gridLeft + x * layout.cell + layout.cell / 2
      if (centerX < clip.x0 - layout.cell || centerX > clip.x1 + layout.cell) continue
      context.fillText(String(x), centerX, layout.frameTop + layout.ruler / 2)
      context.fillText(String(x), centerX, layout.gridTop + layout.gridHeight + layout.ruler / 2)
    }
    for (let y = 0; y < rows; y += 1) {
      const centerY = layout.gridTop + y * layout.cell + layout.cell / 2
      if (centerY < clip.y0 - layout.cell || centerY > clip.y1 + layout.cell) continue
      context.fillText(String(y), layout.frameLeft + layout.ruler / 2, centerY)
      context.fillText(String(y), layout.gridLeft + layout.gridWidth + layout.ruler / 2, centerY)
    }

    context.beginPath()
    for (let x = 0; x <= cols; x += EXPORT_GUIDE_BLOCK) {
      const lineX = layout.gridLeft + x * layout.cell
      if (lineX < clip.x0 - 4 || lineX > clip.x1 + 4) continue
      context.moveTo(lineX, layout.frameTop)
      context.lineTo(lineX, layout.frameTop + layout.frameHeight)
    }
    for (let y = 0; y <= rows; y += EXPORT_GUIDE_BLOCK) {
      const lineY = layout.gridTop + y * layout.cell
      if (lineY < clip.y0 - 4 || lineY > clip.y1 + 4) continue
      context.moveTo(layout.frameLeft, lineY)
      context.lineTo(layout.frameLeft + layout.frameWidth, lineY)
    }
    context.setStrokeStyle('#e5484d')
    context.setLineWidth(Math.max(2, Math.round(layout.cell / 10)))
    context.stroke()
  }

  context.setTextAlign?.('left')
  context.setTextBaseline?.('normal')
  context.setFontSize(20)
  legend.forEach((color, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const x = layout.padding + column * Math.floor(layout.frameWidth / 4)
    const y = layout.legendTop + row * 46
    if (!overlaps(clip, x, y - 18, 180, 30)) return
    context.setFillStyle(color.hex)
    context.fillRect(x, y - 18, 24, 24)
    context.setStrokeStyle('rgba(35, 25, 45, 0.22)')
    context.setLineWidth(1)
    context.strokeRect(x, y - 18, 24, 24)
    context.setFillStyle('#403749')
    context.fillText(`${color.code} ×${color.count}`, x + 34, y)
  })
}

async function readPixels(canvasId: string, x: number, y: number, width: number, height: number) {
  const result = await callXhs<{ data: unknown; width?: number; height?: number }>('canvasGetImageData', {
    canvasId,
    x,
    y,
    width,
    height,
  })
  const pixelWidth = Number(result.width) || width
  const pixelHeight = Number(result.height) || height
  const bytes = toRgbaBytes(result.data, pixelWidth, pixelHeight)
  if (bytes.length < pixelWidth * pixelHeight * 4) throw new Error('画布像素长度不足')
  return { bytes, width: pixelWidth, height: pixelHeight }
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  parts.forEach((part) => {
    out.set(part, offset)
    offset += part.length
  })
  return out
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out[4] = type.charCodeAt(0)
  out[5] = type.charCodeAt(1)
  out[6] = type.charCodeAt(2)
  out[7] = type.charCodeAt(3)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function encodePng(width: number, height: number, rgba: Uint8Array) {
  const stride = width * 4
  const compressed: Uint8Array[] = []
  const zlib = new Zlib({ level: 1, mem: 4 }, (data) => {
    compressed.push(data)
  })
  const line = new Uint8Array(stride + 1)
  for (let y = 0; y < height; y += 1) {
    line[0] = 0
    line.set(rgba.subarray(y * stride, y * stride + stride), 1)
    zlib.push(line, y === height - 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  return concatBytes([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', concatBytes(compressed)), pngChunk('IEND', new Uint8Array())])
}

/** The widget file API accepts binary strings, not base64. */
function encodeBinary(bytes: Uint8Array) {
  const parts: string[] = []
  const slice = 8192
  for (let start = 0; start < bytes.length; start += slice) {
    const end = Math.min(bytes.length, start + slice)
    let part = ''
    for (let index = start; index < end; index += 1) part += String.fromCharCode(bytes[index])
    parts.push(part)
  }
  return parts.join('')
}

function writeFileBytes(filePath: string, data: ArrayBuffer | string) {
  const manager = api().getFileSystemManager() as { writeFile: (options: Record<string, unknown>) => void }
  return new Promise<void>((resolve, reject) => {
    manager.writeFile({
      filePath,
      data,
      encoding: 'binary',
      success: () => resolve(),
      fail: (error: { errMsg?: string }) => reject(new Error(error?.errMsg || '写入图片失败')),
    })
  })
}

async function writePngFile(bytes: Uint8Array) {
  const env = api().env as { USER_DATA_PATH?: string } | undefined
  const root = env?.USER_DATA_PATH || 'xhsfile://usr'
  const filePath = `${root}/pattern-sheet.png`
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  try {
    await writeFileBytes(filePath, buffer)
  } catch {
    // Some hosts only accept a binary string. The bytes are still one character each.
    await writeFileBytes(filePath, encodeBinary(bytes))
  }
  return filePath
}

/** Album save reads temp files. A user-directory PNG has to be copied there first. */
async function albumFilePath(filePath: string) {
  const copied = await callXhs<{ tempFilePath?: string }>('compressImage', { src: filePath, quality: 100 }).catch(() => null)
  return copied?.tempFilePath || filePath
}

function blit(target: Uint8Array, outWidth: number, outHeight: number, raw: Uint8ClampedArray, rawWidth: number, rawHeight: number, px: number, py: number) {
  const copyWidth = Math.min(rawWidth, outWidth - px)
  const copyHeight = Math.min(rawHeight, outHeight - py)
  for (let row = 0; row < copyHeight; row += 1) {
    const source = row * rawWidth * 4
    target.set(raw.subarray(source, source + copyWidth * 4), ((py + row) * outWidth + px) * 4)
  }
}

export async function renderWidgetSheet(snapshot: PatternSnapshot, mirrored: boolean, pixelRatio: number) {
  const cols = snapshot.pattern[0]?.length || 1
  const rows = snapshot.pattern.length || 1
  const legendCount = snapshot.palette.filter((color) => color.count > 0).length
  const layout = widgetExportLayout(cols, rows, legendCount, pixelRatio)
  await ensureExportCanvas(EXPORT_CANVAS_SIDE, EXPORT_CANVAS_SIDE)
  const probed = await readPixels('export-canvas', 0, 0, 8, 8)
  const ratio = Math.max(1, Math.round(probed.width / 8) || Math.round(pixelRatio) || 1)
  const outputScale = Math.min(ratio, MAX_EXPORT_OUTPUT_SIDE / Math.max(layout.width, layout.height, 1))
  const outWidth = Math.max(1, Math.round(layout.width * outputScale))
  const outHeight = Math.max(1, Math.round(layout.height * outputScale))
  let pixels: Uint8Array
  try {
    pixels = new Uint8Array(outWidth * outHeight * 4)
  } catch {
    throw new Error('图纸过大，无法导出')
  }
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 255
    pixels[index + 1] = 250
    pixels[index + 2] = 241
    pixels[index + 3] = 255
  }
  const tileCss = Math.max(32, Math.min(EXPORT_CANVAS_SIDE, Math.floor(EXPORT_TILE_PHYSICAL / ratio)))
  const cssScale = outputScale / ratio
  const tilePixels = tileCss * ratio
  for (let py = 0; py < outHeight; py += tilePixels) {
    for (let px = 0; px < outWidth; px += tilePixels) {
      const cssWidth = Math.min(tileCss, Math.ceil((outWidth - px) / ratio))
      const cssHeight = Math.min(tileCss, Math.ceil((outHeight - py) / ratio))
      const originX = px / ratio
      const originY = py / ratio
      const clip = {
        x0: originX / cssScale,
        y0: originY / cssScale,
        x1: (originX + cssWidth) / cssScale,
        y1: (originY + cssHeight) / cssScale,
      }
      await drawAndWait('export-canvas', (context) => {
        if (typeof context.scale !== 'function' || typeof context.translate !== 'function') throw new Error('画布不支持缩放')
        context.setFillStyle('#fffaf1')
        context.fillRect(0, 0, EXPORT_CANVAS_SIDE, EXPORT_CANVAS_SIDE)
        context.save()
        context.translate(-originX, -originY)
        context.scale(cssScale, cssScale)
        paintSheet(context, snapshot, mirrored, layout, clip)
        context.restore()
      }, 4000)
      const region = await readPixels('export-canvas', 0, 0, cssWidth, cssHeight)
      blit(pixels, outWidth, outHeight, region.bytes, region.width, region.height, px, py)
    }
  }
  const tempFilePath = await writePngFile(encodePng(outWidth, outHeight, pixels))
  return { ...layout, destWidth: outWidth, destHeight: outHeight, tempFilePath }
}

export async function saveWidgetSnapshot(snapshot: PatternSnapshot, mirrored: boolean, pixelRatio: number) {
  const output = await renderWidgetSheet(snapshot, mirrored, pixelRatio)
  const filePath = await albumFilePath(output.tempFilePath)
  try {
    await callXhs('authorize', { scope: 'scope.writePhotosAlbum' })
  } catch {
    // The album call still prompts when this host has no authorize scope.
  }
  await callXhs('saveImageToPhotosAlbum', { filePath })
  return { ...output, tempFilePath: filePath }
}

export function showWidgetLoading(title: string) {
  try {
    api().showLoading({ title, mask: true })
  } catch {
    // The page notice still says the save is in progress.
  }
}

export function hideWidgetLoading() {
  try {
    api().hideLoading()
  } catch {
    // Already dismissed.
  }
}

export function showWidgetToast(title: string, icon: 'success' | 'none') {
  try {
    api().showToast({ title, icon, duration: 2000 })
  } catch {
    // The page notice keeps the same message.
  }
}
