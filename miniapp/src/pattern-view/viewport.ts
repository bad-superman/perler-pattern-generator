/**
 * Pure pan/zoom math for the pattern canvas. The canvas element keeps a fixed
 * size; zooming and panning only change which part of the grid is drawn.
 */

export interface ViewGeometry {
  /** Canvas size in CSS px. */
  width: number
  height: number
  cols: number
  rows: number
}

export interface ViewTransform {
  /** Size of one bead cell in CSS px. */
  scale: number
  /** Position of the grid's top-left corner inside the canvas. */
  offsetX: number
  offsetY: number
}

/** Gap kept around the pattern when it is fitted to the canvas. */
const FIT_MARGIN = 8
/** Largest cell size reachable by zooming: comfortable to tap with a finger. */
const MAX_CELL_PX = 44

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/** Cell size at which the whole pattern is visible ("fit to screen"). */
export function fitScale(geometry: ViewGeometry) {
  const cols = Math.max(1, geometry.cols)
  const rows = Math.max(1, geometry.rows)
  return Math.max(0.5, Math.min((geometry.width - FIT_MARGIN * 2) / cols, (geometry.height - FIT_MARGIN * 2) / rows))
}

export function maxScale(geometry: ViewGeometry) {
  return Math.max(MAX_CELL_PX, fitScale(geometry))
}

/** Keeps the scale in range, centres axes that fit and stops panning past the edges. */
export function clampView(geometry: ViewGeometry, view: ViewTransform): ViewTransform {
  const scale = clamp(view.scale, fitScale(geometry), maxScale(geometry))
  const clampAxis = (offset: number, viewport: number, content: number) =>
    content <= viewport ? (viewport - content) / 2 : clamp(offset, viewport - content, 0)
  return {
    scale,
    offsetX: clampAxis(view.offsetX, geometry.width, geometry.cols * scale),
    offsetY: clampAxis(view.offsetY, geometry.height, geometry.rows * scale),
  }
}

/** The whole pattern, centred. */
export function fitView(geometry: ViewGeometry): ViewTransform {
  return clampView(geometry, { scale: fitScale(geometry), offsetX: 0, offsetY: 0 })
}

/** Changes the scale while keeping the grid point under (anchorX, anchorY) in place. */
export function zoomAt(geometry: ViewGeometry, view: ViewTransform, nextScale: number, anchorX: number, anchorY: number): ViewTransform {
  const scale = clamp(nextScale, fitScale(geometry), maxScale(geometry))
  const ratio = scale / view.scale
  return clampView(geometry, {
    scale,
    offsetX: anchorX - (anchorX - view.offsetX) * ratio,
    offsetY: anchorY - (anchorY - view.offsetY) * ratio,
  })
}

export function panBy(geometry: ViewGeometry, view: ViewTransform, dx: number, dy: number): ViewTransform {
  return clampView(geometry, { scale: view.scale, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy })
}

/** Grid cell under a canvas point, or null when the point is outside the pattern. */
export function cellAt(geometry: ViewGeometry, view: ViewTransform, x: number, y: number) {
  const column = Math.floor((x - view.offsetX) / view.scale)
  const row = Math.floor((y - view.offsetY) / view.scale)
  if (column < 0 || row < 0 || column >= geometry.cols || row >= geometry.rows) return null
  return { x: column, y: row }
}

/** Inclusive range of cells that intersect the canvas. */
export function visibleRange(geometry: ViewGeometry, view: ViewTransform) {
  return {
    x0: clamp(Math.floor(-view.offsetX / view.scale), 0, Math.max(0, geometry.cols - 1)),
    x1: clamp(Math.ceil((geometry.width - view.offsetX) / view.scale) - 1, 0, Math.max(0, geometry.cols - 1)),
    y0: clamp(Math.floor(-view.offsetY / view.scale), 0, Math.max(0, geometry.rows - 1)),
    y1: clamp(Math.ceil((geometry.height - view.offsetY) / view.scale) - 1, 0, Math.max(0, geometry.rows - 1)),
  }
}

/** Zoom level relative to "fit to screen", for display (100 = fitted). */
export function zoomPercent(geometry: ViewGeometry, view: ViewTransform) {
  return Math.round((view.scale / fitScale(geometry)) * 100)
}

/** Cells on the straight line between two cells, inclusive (keeps fast strokes gap-free). */
export function cellsBetween(from: { x: number; y: number }, to: { x: number; y: number }) {
  const cells: Array<{ x: number; y: number }> = []
  let { x, y } = from
  const dx = Math.abs(to.x - x)
  const dy = Math.abs(to.y - y)
  const stepX = x < to.x ? 1 : -1
  const stepY = y < to.y ? 1 : -1
  let error = dx - dy
  for (;;) {
    cells.push({ x, y })
    if (x === to.x && y === to.y) break
    const doubled = error * 2
    if (doubled > -dy) {
      error -= dy
      x += stepX
    }
    if (doubled < dx) {
      error += dx
      y += stepY
    }
  }
  return cells
}
