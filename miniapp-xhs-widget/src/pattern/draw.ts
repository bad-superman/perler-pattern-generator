import { colorRuns } from '../../../miniapp/src/pattern-view/runs'
import { visibleRange, type ViewGeometry, type ViewTransform } from '../../../miniapp/src/pattern-view/viewport'
import { EMPTY_CELL_HEX, type PatternSnapshot } from '../../../src/pattern/types'

const BACKDROP = '#2b2635'
const GRID_LINE = 'rgba(35, 25, 45, 0.18)'
/** Below this cell size the grid lines would swallow the colours. */
const MIN_GRID_LINE_CELL = 4

interface DrawContext {
  setFillStyle(value: string): void
  fillRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  setStrokeStyle(value: string): void
  setLineWidth(value: number): void
  stroke(): void
}

/** Paints the whole pattern into a fixed-size canvas. Zoom only changes the transform. */
export function drawPatternView(
  context: DrawContext,
  geometry: ViewGeometry,
  view: ViewTransform,
  snapshot: PatternSnapshot,
  mirrored: boolean,
  pending: Map<number, string>,
) {
  const { scale, offsetX, offsetY } = view
  const { cols } = geometry
  context.setFillStyle(BACKDROP)
  context.fillRect(0, 0, geometry.width, geometry.height)
  if (!cols || !geometry.rows) return

  const range = visibleRange(geometry, view)
  const left = offsetX + range.x0 * scale
  const top = offsetY + range.y0 * scale
  const visibleWidth = (range.x1 - range.x0 + 1) * scale
  const visibleHeight = (range.y1 - range.y0 + 1) * scale

  context.setFillStyle(EMPTY_CELL_HEX)
  context.fillRect(left, top, visibleWidth, visibleHeight)

  const runs = colorRuns(
    range,
    (x, y) => {
      const sourceX = mirrored ? cols - 1 - x : x
      const pendingHex = pending.get(y * cols + sourceX)
      if (pendingHex) return pendingHex
      const cell = snapshot.pattern[y]?.[sourceX]
      if (!cell || cell.colorIndex < 0) return EMPTY_CELL_HEX
      return snapshot.palette[cell.colorIndex]?.hex || cell.hex
    },
    EMPTY_CELL_HEX,
  )
  runs.forEach((list, hex) => {
    context.setFillStyle(hex)
    for (let index = 0; index < list.length; index += 3) {
      context.fillRect(offsetX + list[index] * scale, offsetY + list[index + 1] * scale, list[index + 2] * scale + 0.5, scale + 0.5)
    }
  })

  if (scale < MIN_GRID_LINE_CELL) return
  context.beginPath()
  for (let x = range.x0; x <= range.x1 + 1; x += 1) {
    const lineX = Math.round(offsetX + x * scale) + 0.5
    context.moveTo(lineX, top)
    context.lineTo(lineX, top + visibleHeight)
  }
  for (let y = range.y0; y <= range.y1 + 1; y += 1) {
    const lineY = Math.round(offsetY + y * scale) + 0.5
    context.moveTo(left, lineY)
    context.lineTo(left + visibleWidth, lineY)
  }
  context.setStrokeStyle(GRID_LINE)
  context.setLineWidth(1)
  context.stroke()
}
