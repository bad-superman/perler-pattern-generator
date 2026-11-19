import { cyclePatternCell, erasePatternCell } from '../../../../src/miniapp/core'
import type { PatternSnapshot } from '../../../../src/pattern/types'
import { chooseWidgetImage, quantizeWidgetImage, saveWidgetSnapshot, type WidgetImageSource } from '../../platform/xhs-widget-bridge'

type Shape = 'square' | 'ratio'
type EventLike = { currentTarget: { dataset: Record<string, string> }; detail?: { value?: number } }

function rowsFor(source: WidgetImageSource | null, gridSize: number, shape: Shape) {
  if (shape !== 'ratio' || !source) return gridSize
  return Math.max(1, Math.min(80, Math.round((gridSize * source.height) / source.width)))
}

function blankSnapshot(cols: number, rows: number): PatternSnapshot {
  return {
    pattern: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ colorIndex: -1, hex: '#fffaf1', symbol: '' }))),
    palette: [],
  }
}

function previewData(snapshot: PatternSnapshot | null, mirrored: boolean) {
  if (!snapshot) return []
  const cols = snapshot.pattern[0]?.length || 1
  const previewCols = Math.min(cols, 18)
  const previewRows = Math.min(snapshot.pattern.length, 18)
  return Array.from({ length: previewRows * previewCols }, (_, index) => {
    const x = index % previewCols
    const y = Math.floor(index / previewCols)
    const sourceX = mirrored ? cols - 1 - x : x
    const cell = snapshot.pattern[y]?.[sourceX]
    return { key: `${sourceX}-${y}`, x: sourceX, y, hex: cell?.hex || '#fffaf1' }
  })
}

function decorateSnapshot(snapshot: PatternSnapshot | null, mirrored: boolean) {
  const cols = snapshot?.pattern[0]?.length || 1
  const rows = snapshot?.pattern.length || 1
  return {
    hasResult: Boolean(snapshot),
    resultCols: cols,
    resultRows: rows,
    previewCols: Math.min(cols, 18),
    previewWidth: Math.max(260, Math.min(520, Math.max(cols, rows) * 22)),
    previewHeight: Math.max(260, Math.min(520, Math.max(cols, rows) * 22)),
    previewCells: previewData(snapshot, mirrored),
    palette: snapshot?.palette || [],
    palettePreview: (snapshot?.palette || []).slice(0, 8),
  }
}

Page({
  data: {
    panelOpen: true,
    busy: false,
    saving: false,
    hasResult: false,
    shape: 'square' as Shape,
    gridSize: 40,
    gridRows: 40,
    maxColors: 10,
    mirrored: false,
    sourceName: '',
    sourceWidth: 0,
    sourceHeight: 0,
    notice: '选择图片后即可在本机生成图纸',
    palette: [],
    palettePreview: [],
    previewCells: [],
    previewCols: 18,
    previewWidth: 360,
    previewHeight: 360,
    resultCols: 0,
    resultRows: 0,
    canUndo: false,
    canRedo: false,
  },

  _source: null as WidgetImageSource | null,
  _snapshot: null as PatternSnapshot | null,
  _past: [] as PatternSnapshot[],
  _future: [] as PatternSnapshot[],

  onResize() {
    if (this._snapshot) this.setData(decorateSnapshot(this._snapshot, this.data.mirrored))
  },

  chooseImage() {
    chooseWidgetImage().then((source) => {
      if (!source) return
      this._source = source
      this.setData({ sourceName: source.name, sourceWidth: source.width, sourceHeight: source.height, panelOpen: true, notice: '图片已选择，调整参数后生成' })
    }).catch(() => this.setData({ notice: '图片选择失败，请重试' }))
  },

  createBlank() {
    this._source = null
    this._snapshot = blankSnapshot(this.data.gridSize, this.data.gridSize)
    this._past = []
    this._future = []
    this.setData({ ...decorateSnapshot(this._snapshot, false), panelOpen: false, notice: '空白画板已创建，可直接编辑' })
  },

  setShape(event: EventLike) {
    const shape = event.currentTarget.dataset.shape as Shape
    this.setData({ shape, gridRows: rowsFor(this._source, this.data.gridSize, shape) })
  },

  onGridChange(event: EventLike) {
    const gridSize = Number(event.detail.value) || 40
    this.setData({ gridSize, gridRows: rowsFor(this._source, gridSize, this.data.shape) })
  },

  onColorChange(event: EventLike) {
    this.setData({ maxColors: Number(event.detail.value) || 10 })
  },

  generate() {
    this.setData({ busy: true, notice: '正在本地采样、选色和生成…' })
    const task = this._source
      ? quantizeWidgetImage(this._source, this.data.gridSize, this.data.gridRows, this.data.maxColors)
      : Promise.resolve(blankSnapshot(this.data.gridSize, this.data.gridRows))
    task.then((snapshot) => {
      this._snapshot = snapshot
      this._past = []
      this._future = []
      this.setData({ ...decorateSnapshot(snapshot, false), panelOpen: false, busy: false, notice: '生成完成，图片未上传网络' })
    }).catch(() => this.setData({ busy: false, notice: '生成失败，请换一张图片重试' }))
  },

  tapCell(event: EventLike) {
    if (!this._snapshot) return
    const { x, y } = event.currentTarget.dataset
    this._past.push(this._snapshot)
    this._snapshot = cyclePatternCell(this._snapshot, Number(x), Number(y))
    this._future = []
    this.setData({ ...decorateSnapshot(this._snapshot, this.data.mirrored), canUndo: true, canRedo: false })
  },

  eraseCell(event: EventLike) {
    if (!this._snapshot) return
    const { x, y } = event.currentTarget.dataset
    this._past.push(this._snapshot)
    this._snapshot = erasePatternCell(this._snapshot, Number(x), Number(y))
    this._future = []
    this.setData({ ...decorateSnapshot(this._snapshot, this.data.mirrored), canUndo: true, canRedo: false })
  },

  toggleMirror() {
    const mirrored = !this.data.mirrored
    this.setData({ mirrored, previewCells: previewData(this._snapshot, mirrored), notice: mirrored ? '已开启镜像预览' : '已恢复原向预览' })
  },

  undo() {
    if (!this._snapshot || !this._past.length) return
    this._future.unshift(this._snapshot)
    this._snapshot = this._past.pop() as PatternSnapshot
    this.setData({ ...decorateSnapshot(this._snapshot, this.data.mirrored), canUndo: this._past.length > 0, canRedo: true })
  },

  redo() {
    if (!this._snapshot || !this._future.length) return
    this._past.push(this._snapshot)
    this._snapshot = this._future.shift() as PatternSnapshot
    this.setData({ ...decorateSnapshot(this._snapshot, this.data.mirrored), canUndo: true, canRedo: this._future.length > 0 })
  },

  saveImage() {
    if (!this._snapshot) return
    this.setData({ saving: true, notice: '正在生成并保存 PNG…' })
    saveWidgetSnapshot(this._snapshot, this.data.mirrored)
      .then(() => this.setData({ saving: false, notice: 'PNG 已保存到相册' }))
      .catch(() => this.setData({ saving: false, notice: '保存失败，请检查相册权限后重试' }))
  },

  resetWidget() {
    this._source = null
    this._snapshot = null
    this._past = []
    this._future = []
    this.setData({ hasResult: false, panelOpen: true, sourceName: '', sourceWidth: 0, sourceHeight: 0, notice: '选择图片后即可在本机生成图纸', mirrored: false, canUndo: false, canRedo: false })
  },
})
