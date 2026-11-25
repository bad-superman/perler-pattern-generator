import { getPaletteColors } from '../../../../src/palettes'
import { quantizedPatternToSnapshot } from '../../../../src/miniapp/core'
import { applyStroke, ensurePaletteColor, recalculatePaletteCounts } from '../../../../src/pattern/ops'
import { isDarkHex } from '../../../../src/pattern/color'
import { EMPTY_CELL_HEX, type PatternSnapshot } from '../../../../src/pattern/types'
import {
  cellAt,
  cellsBetween,
  fitView,
  panBy,
  zoomAt,
  zoomPercent,
  type ViewGeometry,
  type ViewTransform,
} from '../../../../miniapp/src/pattern-view/viewport'
import { drawPatternView } from '../../pattern/draw'
import {
  canvasTouchPoint,
  chooseWidgetImage,
  exportSheetSize,
  leaveWidget,
  quantizeWidgetImage,
  hideWidgetLoading,
  saveWidgetSnapshot,
  showWidgetLoading,
  showWidgetToast,
  widgetCanvasContext,
  widgetSelectorQuery,
  widgetViewport,
  type WidgetImageSource,
  type WidgetViewport,
} from '../../platform/xhs-widget-bridge'

type Shape = 'square' | 'ratio'
type Stage = 'home' | 'configure' | 'processing' | 'result' | 'edit'
type EditorTool = 'paint' | 'erase' | 'pan'
type Overlay = '' | 'colors' | 'more'
type Point = { x: number; y: number }
type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; last: Point }
  | { kind: 'stroke'; hex: string; cells: Point[]; lastCell: Point | null }
  | { kind: 'pinch'; distance: number; middle: Point }
  | { kind: 'settling' }
type TouchPoint = Record<string, number | undefined>
type TouchEvent = {
  touches?: ArrayLike<TouchPoint>
  changedTouches?: ArrayLike<TouchPoint>
  currentTarget?: { dataset?: Record<string, string> }
}
type ResizeEvent = {
  size?: { windowWidth?: number; windowHeight?: number }
  safeArea?: { bottom?: number; height?: number }
  interactive?: boolean | string
}
type DatasetEvent = { currentTarget: { dataset: Record<string, string> }; detail?: { value?: number } }

const BRAND_COLORS = getPaletteColors('mard')

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function commit(page: { setData: (data: Record<string, unknown>, callback?: () => void) => void }, data: Record<string, unknown>) {
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      page.setData(data, finish)
    } catch {
      page.setData(data)
    }
    setTimeout(finish, 48)
  })
}

function failureNotice(fallback: string, error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return message && message !== fallback ? `${fallback}（${message}）` : fallback
}

function saveFailureNotice(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const permission = /auth|deny|permission|authorize|权限/i.test(message)
  return failureNotice(permission ? '保存失败，请检查相册权限后重试' : '保存失败，请重试', error)
}

function rowsFor(source: WidgetImageSource | null, gridSize: number, shape: Shape) {
  if (shape !== 'ratio' || !source) return gridSize
  return Math.max(1, Math.min(104, Math.round((gridSize * source.height) / source.width)))
}

function blankSnapshot(cols: number, rows: number): PatternSnapshot {
  const assignments = new Int16Array(cols * rows)
  assignments.fill(-1)
  const blank = quantizedPatternToSnapshot({
    cols,
    rows,
    selected: [],
    assignments,
  })
  const starter = BRAND_COLORS.find(([code, name]) => /黑|black/i.test(`${code} ${name}`)) ?? BRAND_COLORS[0]
  return {
    ...blank,
    palette: starter ? [{ code: starter[0], name: starter[1], hex: starter[2], count: 0, symbol: starter[0] }] : [],
  }
}

function resultCanvasSize(metrics: WidgetViewport) {
  const canvasWidth = Math.max(220, Math.floor(metrics.windowWidth - 36))
  const canvasHeight = Math.max(180, Math.floor(Math.min(canvasWidth * 1.1, metrics.windowHeight * 0.5)))
  return { canvasWidth, canvasHeight }
}

function editChrome(metrics: WidgetViewport) {
  const topBarHeight = 48
  const toolbarHeight = 56 + metrics.safeBottom
  return {
    topBarHeight,
    toolbarHeight,
    toolWidth: Math.floor(metrics.windowWidth / 5),
    canvasWidth: Math.max(220, Math.floor(metrics.windowWidth)),
    canvasHeight: Math.max(160, Math.floor(metrics.windowHeight - topBarHeight - toolbarHeight)),
  }
}

function panPattern(geometry: ViewGeometry, view: ViewTransform, dx: number, dy: number): ViewTransform {
  const limit = (offset: number, viewport: number, content: number) => {
    const visible = Math.min(48, content, viewport)
    return Math.max(visible - content, Math.min(viewport - visible, offset))
  }
  return {
    scale: view.scale,
    offsetX: limit(view.offsetX + dx, geometry.width, geometry.cols * view.scale),
    offsetY: limit(view.offsetY + dy, geometry.height, geometry.rows * view.scale),
  }
}

function bottomInset(windowHeight: number, safeArea?: { bottom?: number; height?: number }) {
  if (!safeArea) return 0
  const bottom = Number(safeArea.bottom)
  if (bottom > 0 && bottom <= windowHeight) return Math.max(0, Math.min(40, Math.round(windowHeight - bottom)))
  const height = Number(safeArea.height)
  if (height > 0 && height < windowHeight) return Math.max(0, Math.min(40, Math.round(windowHeight - height)))
  return 0
}

function touchList(event: TouchEvent, includeChanged: boolean): TouchPoint[] {
  if (event.touches && event.touches.length) return Array.from(event.touches)
  if (includeChanged && event.changedTouches && event.changedTouches.length) return Array.from(event.changedTouches)
  return []
}

function fingersDown(event: TouchEvent) {
  const current = event.touches ? Array.from(event.touches) : []
  const ended = event.changedTouches ? Array.from(event.changedTouches) : []
  if (!current.length) return 0
  const endedIds = new Set(ended.map((touch) => touch.identifier).filter((id) => id != null))
  if (endedIds.size) return current.filter((touch) => !endedIds.has(touch.identifier)).length
  if (ended.length >= current.length) return 0
  return current.length - ended.length
}

function touchPoints(
  event: TouchEvent,
  origin: Point,
  width: number,
  height: number,
  pixelRatio: number,
  measuredWidth: number,
  measuredHeight: number,
  includeChanged: boolean,
): Point[] {
  return touchList(event, includeChanged).map((touch) => canvasTouchPoint(touch, origin, width, height, pixelRatio, measuredWidth, measuredHeight))
}

Page({
  data: {
    stage: 'home' as Stage,
    windowWidth: 375,
    windowHeight: 640,
    topBarHeight: 48,
    toolbarHeight: 56,
    toolWidth: 75,
    colorListHeight: 560,
    busy: false,
    saving: false,
    shape: 'square' as Shape,
    gridSize: 52,
    gridRows: 52,
    maxColors: 12,
    mirrored: false,
    sourceName: '',
    sourcePath: '',
    sourceWidth: 0,
    sourceHeight: 0,
    notice: '选择图片后即可在本机生成图纸',
    palettePreview: [] as Array<{ code: string; hex: string; count: number; ink: string }>,
    paletteOptions: [] as Array<{ index: number; code: string; hex: string; count: number }>,
    brandColors: [] as Array<{ code: string; name: string; hex: string; ink: string }>,
    resultCols: 0,
    resultRows: 0,
    colorCount: 0,
    canUndo: false,
    canRedo: false,
    canvasWidth: 320,
    canvasHeight: 280,
    zoomLabel: '100%',
    editorTool: 'paint' as EditorTool,
    overlay: '' as Overlay,
    activeCode: '选色',
    activeHex: '#ffffff',
    exportReady: false,
    exportWidth: 300,
    exportHeight: 300,
    decodeReady: false,
    canvasHold: false,
  },

  _source: null as WidgetImageSource | null,
  _snapshot: null as PatternSnapshot | null,
  _past: [] as PatternSnapshot[],
  _future: [] as PatternSnapshot[],
  _metrics: null as WidgetViewport | null,
  _selected: 0,
  _view: null as ViewTransform | null,
  _geometry: null as ViewGeometry | null,
  _fittedKey: '',
  _gesture: { kind: 'idle' } as Gesture,
  _pending: new Map<number, string>(),
  _origin: { x: 0, y: 0 },
  _touchSize: { width: 0, height: 0 },
  _drawBusy: false,
  _drawDirty: false,
  _drawToken: 0,
  _request: 0,
  _trusted: null as { windowWidth: number; windowHeight: number; safeBottom: number } | null,
  _resizeTimer: 0 as unknown as ReturnType<typeof setTimeout>,

  onLoad() {
    this.prepareViewport(false)
  },

  onShow() {
    this.prepareViewport(false)
    if (this._snapshot && !this.data.overlay && !this.data.canvasHold) {
      this.drawPreview()
      this.refreshOrigin()
    }
  },

  onResize(event: ResizeEvent) {
    const size = event?.size
    const windowWidth = Number(size?.windowWidth)
    const windowHeight = Number(size?.windowHeight)
    if (!(windowWidth > 0) || !(windowHeight > 0)) return
    this._trusted = { windowWidth, windowHeight, safeBottom: bottomInset(windowHeight, event.safeArea) }
    const interactive = event.interactive === true || event.interactive === 'YES'
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    this._resizeTimer = setTimeout(() => {
      this._resizeTimer = 0 as unknown as ReturnType<typeof setTimeout>
      this.prepareViewport(true)
    }, interactive ? 80 : 0)
  },

  prepareViewport(remountCanvas: boolean) {
    const base = widgetViewport()
    const metrics = this._trusted
      ? { ...base, windowWidth: this._trusted.windowWidth, windowHeight: this._trusted.windowHeight, safeBottom: this._trusted.safeBottom }
      : base
    this._metrics = metrics
    const chrome = editChrome(metrics)
    const stage = this.data.stage
    const canvas = stage === 'edit' ? editChrome(metrics) : stage === 'result' ? resultCanvasSize(metrics) : null
    const next = {
      windowWidth: metrics.windowWidth,
      windowHeight: metrics.windowHeight,
      topBarHeight: chrome.topBarHeight,
      toolbarHeight: chrome.toolbarHeight,
      toolWidth: chrome.toolWidth,
      colorListHeight: Math.max(160, metrics.windowHeight - chrome.topBarHeight),
      ...(canvas || {}),
    }
    const unchanged = next.windowWidth === this.data.windowWidth
      && next.windowHeight === this.data.windowHeight
      && next.toolbarHeight === this.data.toolbarHeight
      && (!canvas || (canvas.canvasWidth === this.data.canvasWidth && canvas.canvasHeight === this.data.canvasHeight))
    if (unchanged) return
    const canvasChanged = Boolean(canvas) && (canvas!.canvasWidth !== this.data.canvasWidth || canvas!.canvasHeight !== this.data.canvasHeight)
    const redraw = () => {
      if ((stage === 'edit' || stage === 'result') && this._snapshot && !this.data.overlay && !this.data.canvasHold) {
        this.drawPreview()
        this.refreshOrigin()
      }
    }
    if (remountCanvas && canvasChanged && (stage === 'edit' || stage === 'result') && !this.data.overlay) {
      // The native canvas reads its size once. Remount it after the webview grows.
      this.setData({ ...next, canvasHold: true }, () => {
        this.setData({ canvasHold: false }, () => {
          redraw()
          setTimeout(redraw, 140)
        })
      })
      return
    }
    this.setData(next, redraw)
  },

  metrics() {
    if (!this._metrics) this.prepareViewport(false)
    return this._metrics as WidgetViewport
  },

  activeIndex() {
    const length = this._snapshot?.palette.length ?? 0
    if (!length) return 0
    return Math.max(0, Math.min(this._selected, length - 1))
  },

  _editorTool: 'paint' as EditorTool,

  mode(): EditorTool | 'view' {
    if (this.data.stage !== 'edit') return 'view'
    return this._editorTool || this.data.editorTool
  },

  useTool(editorTool: EditorTool) {
    this._editorTool = editorTool
    this.setData({ editorTool })
  },

  viewState() {
    const snapshot = this._snapshot
    const cols = snapshot?.pattern[0]?.length || 0
    const rows = snapshot?.pattern.length || 0
    const used = (snapshot?.palette || []).filter((color) => color.count > 0).sort((a, b) => b.count - a.count)
    const color = snapshot?.palette[this.activeIndex()]
    return {
      resultCols: cols,
      resultRows: rows,
      colorCount: used.length,
      palettePreview: used.map((item) => ({ code: item.code, hex: item.hex, count: item.count, ink: isDarkHex(item.hex) ? '#ffffff' : '#1d1a23' })),
      canUndo: this._past.length > 0,
      canRedo: this._future.length > 0,
      mirrored: this.data.mirrored,
      activeCode: color?.code || '选色',
      activeHex: color?.hex || '#ffffff',
      editorTool: this.data.editorTool,
    }
  },

  async showPattern(stage: Stage, snapshot: PatternSnapshot, resetHistory: boolean) {
    if (resetHistory) {
      this._past = []
      this._future = []
      this._selected = 0
    }
    this._snapshot = snapshot
    this._pending.clear()
    this._gesture = { kind: 'idle' }
    this._fittedKey = ''
    this._view = null
    const metrics = this.metrics()
    const size = stage === 'edit' ? editChrome(metrics) : resultCanvasSize(metrics)
    await commit(this, {
      ...this.viewState(),
      ...size,
      stage,
      overlay: '',
      busy: false,
      brandColors: [],
      paletteOptions: [],
    })
    this.drawPreview()
    this.refreshOrigin()
    await delay(140)
    this.drawPreview()
    this.refreshOrigin()
  },

  touchPoints(event: TouchEvent, includeChanged: boolean) {
    if (this.data.stage === 'edit' && this._origin.y === 0) this._origin = { x: 0, y: this.data.topBarHeight }
    return touchPoints(event, this._origin, this.data.canvasWidth, this.data.canvasHeight, this.metrics().pixelRatio, this._touchSize.width, this._touchSize.height, includeChanged)
  },

  previewCanvasId() {
    return this.data.stage === 'edit' ? 'edit-canvas' : 'result-canvas'
  },

  refreshOrigin() {
    if (this.data.stage === 'edit') this._origin = { x: 0, y: this.data.topBarHeight }
    const query = widgetSelectorQuery()
    if (!query) return
    const id = this.data.stage === 'edit' ? '#edit-canvas-slot' : '#result-canvas-slot'
    try {
      query.select(id).boundingClientRect((rect: { left?: number; top?: number; width?: number; height?: number } | Array<{ left?: number; top?: number; width?: number; height?: number }>) => {
        const box = Array.isArray(rect) ? rect[0] : rect
        if (!box || !Number.isFinite(box.left) || !Number.isFinite(box.top)) return
        this._origin = { x: Number(box.left), y: Number(box.top) }
        const width = Number((box as { width?: number }).width)
        const height = Number((box as { height?: number }).height)
        if (width > 0 && height > 0) this._touchSize = { width, height }
      }).exec()
    } catch {
      // Touches that already carry canvas x/y do not need the origin.
    }
  },

  drawPreview() {
    if (!this._snapshot || this.data.stage === 'home' || this.data.overlay) return
    const cols = this._snapshot.pattern[0]?.length || 1
    const rows = this._snapshot.pattern.length || 1
    const geometry: ViewGeometry = { width: this.data.canvasWidth, height: this.data.canvasHeight, cols, rows }
    const key = `${geometry.width}x${geometry.height}x${cols}x${rows}`
    if (!this._view || this._fittedKey !== key) {
      this._view = fitView(geometry)
      this._fittedKey = key
      const zoomLabel = `${zoomPercent(geometry, this._view)}%`
      if (zoomLabel !== this.data.zoomLabel) this.setData({ zoomLabel })
    }
    this._geometry = geometry
    if (this._drawBusy) {
      this._drawDirty = true
      return
    }
    this._drawBusy = true
    this._drawToken += 1
    const token = this._drawToken
    const finish = () => {
      if (token !== this._drawToken || !this._drawBusy) return
      this._drawBusy = false
      if (!this._drawDirty) return
      this._drawDirty = false
      this.drawPreview()
    }
    try {
      const context = widgetCanvasContext(this.previewCanvasId())
      drawPatternView(context, geometry, this._view, this._snapshot, this.data.mirrored, this._pending)
      context.draw(false, finish)
      setTimeout(finish, 120)
    } catch (error) {
      this._drawBusy = false
      this.setData({ notice: failureNotice('图纸预览失败', error) })
    }
  },

  goBack() {
    if (this.data.stage === 'processing') {
      this._request += 1
      this.setData({ stage: this._source ? 'configure' : 'home', busy: false, decodeReady: false, notice: '' })
      return
    }
    if (this.data.stage === 'configure') {
      this.setData({ stage: 'home', notice: '' })
      return
    }
    if (this.data.stage === 'result') {
      this.setData({ stage: 'configure', overlay: '', notice: '' })
      return
    }
    if (this.data.stage === 'edit') {
      this.leaveEdit()
      return
    }
    leaveWidget()
  },

  chooseImage() {
    chooseWidgetImage().then((source) => {
      if (!source) return
      this._source = source
      this.setData({
        stage: 'configure',
        sourceName: source.name,
        sourcePath: source.path,
        sourceWidth: source.width,
        sourceHeight: source.height,
        gridRows: rowsFor(source, this.data.gridSize, this.data.shape),
        notice: '图片已选择，调整参数后开始生成',
      })
    }).catch((error: unknown) => this.setData({ notice: failureNotice('图片选择失败，请重试', error) }))
  },

  createBlank() {
    this._source = null
    this.setData({
      stage: 'configure',
      sourceName: '',
      sourcePath: '',
      sourceWidth: 0,
      sourceHeight: 0,
      gridRows: this.data.gridSize,
      notice: '选择尺寸后进入编辑',
    })
  },

  setShape(event: DatasetEvent) {
    const shape = event.currentTarget.dataset.shape as Shape
    this.setData({ shape, gridRows: rowsFor(this._source, this.data.gridSize, shape) })
  },

  onGridChange(event: DatasetEvent) {
    const gridSize = Number(event.detail?.value) || 40
    this.setData({ gridSize, gridRows: rowsFor(this._source, gridSize, this.data.shape) })
  },

  onColorChange(event: DatasetEvent) {
    this.setData({ maxColors: Number(event.detail?.value) || 10 })
  },

  generate() {
    if (!this._source) {
      void this.showPattern('edit', blankSnapshot(this.data.gridSize, this.data.gridSize), true)
      return
    }
    this._request += 1
    const request = this._request
    this.setData({ stage: 'processing', busy: true, notice: '正在本地生成图纸…' })
    const run = async () => {
      await commit(this, { decodeReady: true })
      await delay(120)
      try {
        return await quantizeWidgetImage(this._source as WidgetImageSource, this.data.gridSize, this.data.gridRows, this.data.maxColors)
      } finally {
        await commit(this, { decodeReady: false })
      }
    }
    run().then((snapshot) => {
      if (request !== this._request) return undefined
      return this.showPattern('result', snapshot, true).then(() => {
        this.setData({ notice: '生成完成，图片未上传网络' })
      })
    }).catch((error: unknown) => {
      if (request !== this._request) return
      this.setData({ stage: 'configure', busy: false, decodeReady: false, notice: failureNotice('图片解码失败，请换一张图片重试', error) })
    })
  },

  enterEdit() {
    if (!this._snapshot) return
    void this.showPattern('edit', this._snapshot, false).then(() => this.setData({ notice: '' }))
  },

  leaveEdit() {
    if (!this._snapshot) return
    void this.showPattern('result', this._snapshot, false).then(() => this.setData({ notice: '' }))
  },

  zoomIn() {
    this.zoomBy(1.25)
  },

  zoomOut() {
    this.zoomBy(0.8)
  },

  zoomBy(factor: number) {
    if (!this._geometry || !this._view || this.data.overlay) return
    this._view = zoomAt(this._geometry, this._view, this._view.scale * factor, this._geometry.width / 2, this._geometry.height / 2)
    this.setData({ zoomLabel: `${zoomPercent(this._geometry, this._view)}%` })
    this.drawPreview()
  },

  fitCanvas() {
    if (!this._geometry) return
    this._view = fitView(this._geometry)
    this.setData({ zoomLabel: `${zoomPercent(this._geometry, this._view)}%`, overlay: '', brandColors: [], paletteOptions: [] })
    this.drawPreview()
    setTimeout(() => this.drawPreview(), 120)
  },

  toggleMirror() {
    const mirrored = !this.data.mirrored
    const wasCovered = Boolean(this.data.overlay)
    this.setData({ mirrored, overlay: '', brandColors: [], paletteOptions: [], notice: mirrored ? '已开启镜像预览' : '已恢复原向预览' }, () => this.drawPreview())
    if (wasCovered) setTimeout(() => this.drawPreview(), 140)
  },

  undo() {
    if (!this._snapshot || !this._past.length) return
    this._future.unshift(this._snapshot)
    this._snapshot = this._past.pop() as PatternSnapshot
    this._pending.clear()
    this.setData(this.viewState())
    this.drawPreview()
  },

  redo() {
    if (!this._snapshot || !this._future.length) return
    this._past.push(this._snapshot)
    this._snapshot = this._future.shift() as PatternSnapshot
    this._pending.clear()
    this.setData(this.viewState())
    this.drawPreview()
  },

  setPaint() {
    this.useTool('paint')
  },

  setErase() {
    this.useTool('erase')
  },

  setPan() {
    this.useTool('pan')
  },

  holdSheet() {},

  openColors() {
    if (!this._snapshot) return
    this.setData({
      overlay: 'colors',
      paletteOptions: this._snapshot.palette.map((color, index) => ({ index, code: color.code, hex: color.hex, count: color.count, ink: isDarkHex(color.hex) ? '#ffffff' : '#1d1a23' })),
      brandColors: BRAND_COLORS.map(([code, name, hex]) => ({ code, name, hex, ink: isDarkHex(hex) ? '#ffffff' : '#1d1a23' })),
    })
  },

  openMore() {
    this.setData({ overlay: 'more' })
  },

  closeOverlay() {
    void commit(this, { overlay: '', brandColors: [], paletteOptions: [] }).then(() => {
      this.drawPreview()
      setTimeout(() => this.drawPreview(), 120)
    })
  },

  selectPalette(event: DatasetEvent) {
    this._selected = Number(event.currentTarget.dataset.index) || 0
    void commit(this, { ...this.viewState(), overlay: '', editorTool: 'paint', brandColors: [], paletteOptions: [] }).then(() => {
      this.drawPreview()
      setTimeout(() => this.drawPreview(), 120)
    })
  },

  selectBrand(event: DatasetEvent) {
    if (!this._snapshot) return
    const code = event.currentTarget.dataset.code
    const entry = BRAND_COLORS.find((item) => item[0] === code)
    if (!entry) return
    const next = ensurePaletteColor(this._snapshot.palette, entry)
    if (next.palette !== this._snapshot.palette) this._snapshot = { ...this._snapshot, palette: next.palette }
    this._selected = next.index
    void commit(this, { ...this.viewState(), overlay: '', editorTool: 'paint', brandColors: [], paletteOptions: [] }).then(() => {
      this.drawPreview()
      setTimeout(() => this.drawPreview(), 120)
    })
  },

  onTouchStart(event: TouchEvent) {
    if (this._gesture.kind === 'settling') this._gesture = { kind: 'idle' }
    const points = this.touchPoints(event, true)
    if (points.length >= 2) {
      this.beginPinch(points[0], points[1])
      return
    }
    if (points.length !== 1 || !this._geometry || !this._view) return
    const mode = this.mode()
    if (mode === 'paint' || mode === 'erase') {
      const color = this._snapshot?.palette[this.activeIndex()]
      if (mode === 'paint' && !color) return
      this._pending.clear()
      const gesture: Gesture = { kind: 'stroke', hex: mode === 'erase' ? EMPTY_CELL_HEX : color?.hex || EMPTY_CELL_HEX, cells: [], lastCell: null }
      this._gesture = gesture
      this.extendStroke(gesture, points[0])
      return
    }
    this._gesture = { kind: 'pan', last: points[0] }
  },

  onTouchMove(event: TouchEvent) {
    const points = this.touchPoints(event, true)
    const gesture = this._gesture
    if (gesture.kind === 'settling' || !this._geometry || !this._view) return
    if (points.length >= 2) {
      if (gesture.kind !== 'pinch') {
        this.beginPinch(points[0], points[1])
        return
      }
      const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y))
      const middle = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      const moved = panBy(this._geometry, this._view, middle.x - gesture.middle.x, middle.y - gesture.middle.y)
      this._view = zoomAt(this._geometry, moved, moved.scale * (distance / gesture.distance), middle.x, middle.y)
      gesture.distance = distance
      gesture.middle = middle
      this.drawPreview()
      return
    }
    if (points.length !== 1) return
    if (gesture.kind === 'pan') {
      this._view = panPattern(this._geometry, this._view, points[0].x - gesture.last.x, points[0].y - gesture.last.y)
      gesture.last = points[0]
      this.drawPreview()
    } else if (gesture.kind === 'stroke') {
      this.extendStroke(gesture, points[0])
    }
  },

  onTouchEnd(event: TouchEvent) {
    if (this.finishStroke()) return
    const gesture = this._gesture
    const remaining = fingersDown(event)
    if (remaining > 0) {
      if (gesture.kind === 'pinch') this._gesture = { kind: 'settling' }
      return
    }
    this._gesture = { kind: 'idle' }
    if (gesture.kind !== 'idle' && this._geometry && this._view) {
      this.setData({ zoomLabel: `${zoomPercent(this._geometry, this._view)}%` })
    }
  },

  onTouchCancel() {
    if (this.finishStroke()) return
    this._gesture = { kind: 'idle' }
  },

  finishStroke() {
    const gesture = this._gesture
    if (gesture.kind !== 'stroke') return false
    this._gesture = { kind: 'idle' }
    this.commitStroke(gesture.cells)
    this._pending.clear()
    this.setData(this.viewState())
    this.drawPreview()
    return true
  },

  beginPinch(first: Point, second: Point) {
    if (this._gesture.kind === 'stroke') {
      this._pending.clear()
      this.drawPreview()
    }
    this._gesture = {
      kind: 'pinch',
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      middle: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    }
  },

  extendStroke(gesture: Extract<Gesture, { kind: 'stroke' }>, point: Point) {
    if (!this._geometry || !this._view || !this._snapshot) return
    const cell = cellAt(this._geometry, this._view, point.x, point.y)
    if (!cell) {
      gesture.lastCell = null
      return
    }
    const cols = this._geometry.cols
    const segment = gesture.lastCell ? cellsBetween(gesture.lastCell, cell) : [cell]
    let changed = false
    segment.forEach((step) => {
      const sourceX = this.data.mirrored ? cols - 1 - step.x : step.x
      const offset = step.y * cols + sourceX
      if (this._pending.has(offset)) return
      this._pending.set(offset, gesture.hex)
      gesture.cells.push({ x: sourceX, y: step.y })
      changed = true
    })
    gesture.lastCell = cell
    if (changed) this.drawPreview()
  },

  commitStroke(cells: Point[]) {
    if (!this._snapshot || !cells.length) return
    const paletteIndex = this.mode() === 'erase' ? null : this.activeIndex()
    const nextPattern = applyStroke(this._snapshot.pattern, this._snapshot.palette, cells, paletteIndex)
    if (nextPattern === this._snapshot.pattern) return
    this._past.push(this._snapshot)
    if (this._past.length > 30) this._past.shift()
    this._future = []
    this._snapshot = {
      ...this._snapshot,
      pattern: nextPattern,
      palette: recalculatePaletteCounts(nextPattern, this._snapshot.palette),
    }
  },

  saveImage() {
    this.finishStroke()
    if (!this._snapshot || this.data.saving) return
    const snapshot = this._snapshot
    const mirrored = this.data.mirrored
    const pixelRatio = this.metrics().pixelRatio
    const sheet = exportSheetSize(snapshot, pixelRatio)
    this.setData({ saving: true, overlay: '', brandColors: [], paletteOptions: [], notice: '正在生成并保存 PNG…' })
    showWidgetLoading('正在保存')
    void (async () => {
      await commit(this, { exportReady: false })
      await commit(this, { exportReady: true, exportWidth: sheet.canvasWidth, exportHeight: sheet.canvasHeight })
      await delay(300)
      await saveWidgetSnapshot(snapshot, mirrored, pixelRatio)
      hideWidgetLoading()
      showWidgetToast('已保存到相册', 'success')
      await commit(this, { exportReady: false, saving: false, notice: 'PNG 已保存到相册' })
      this.drawPreview()
      setTimeout(() => this.drawPreview(), 120)
    })().catch((error: unknown) => {
      hideWidgetLoading()
      showWidgetToast('保存失败', 'none')
      void commit(this, { exportReady: false, saving: false, notice: saveFailureNotice(error) })
    })
  },

  resetWidget() {
    this._source = null
    this._snapshot = null
    this._past = []
    this._future = []
    this._pending.clear()
    this._view = null
    this._fittedKey = ''
    this.setData({
      stage: 'home',
      sourceName: '',
      sourcePath: '',
      sourceWidth: 0,
      sourceHeight: 0,
      notice: '选择图片后即可在本机生成图纸',
      mirrored: false,
      canUndo: false,
      canRedo: false,
      overlay: '',
      exportReady: false,
      decodeReady: false,
      palettePreview: [],
      brandColors: [],
      paletteOptions: [],
    })
  },
})
