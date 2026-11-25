import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { EMPTY_CELL_HEX, type PatternSnapshot } from '../../../src/pattern/types'
import { colorRuns } from '../pattern-view/runs'
import {
  cellAt,
  cellsBetween,
  fitView,
  panBy,
  visibleRange,
  zoomAt,
  zoomPercent,
  type ViewGeometry,
  type ViewTransform,
} from '../pattern-view/viewport'

export type PatternCanvasMode = 'view' | 'paint' | 'erase' | 'pan'

export interface PatternCanvasHandle {
  /** Zooms around the centre of the canvas. */
  zoomBy: (factor: number) => void
  /** Shows the whole pattern, centred. */
  fit: () => void
}

interface PatternCanvasProps {
  canvasId: string
  /** Canvas size in CSS px. The element never resizes while zooming. */
  width: number
  height: number
  snapshot: PatternSnapshot
  mirrored: boolean
  /** What one finger does. Two fingers always zoom and pan. */
  mode: PatternCanvasMode
  /** Colour previewed under the finger while a paint stroke is in progress. */
  paintHex?: string
  /**
   * Renders a same-sized placeholder instead of the canvas. The legacy canvas
   * is a native view that can sit above page overlays, so it is taken out
   * while a drawer or popup is open.
   */
  hidden?: boolean
  /** Called once per finished stroke with the touched cells in pattern coordinates. */
  onStroke?: (cells: Array<{ x: number; y: number }>) => void
  /** Zoom level relative to "fit to screen" (100 = fitted), reported when a gesture ends. */
  onZoomChange?: (percent: number) => void
}

interface Point {
  x: number
  y: number
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; last: Point }
  | { kind: 'stroke'; hex: string; cells: Point[]; lastCell: Point | null }
  | { kind: 'pinch'; distance: number; middle: Point }
  /** Fingers are lifting after a pinch; ignore them until all are up. */
  | { kind: 'settling' }

const BACKDROP = '#2b2635'
const GRID_LINE = 'rgba(35, 25, 45, 0.18)'
/** Below this cell size the grid lines would swallow the colours. */
const MIN_GRID_LINE_CELL = 4

function drawPattern(
  context: Taro.CanvasContext,
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

  // Empty cells first, as one rectangle; coloured runs go on top.
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
      // The half-pixel overlap hides anti-aliasing seams between neighbours.
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

export const PatternCanvas = forwardRef<PatternCanvasHandle, PatternCanvasProps>(function PatternCanvas(
  { canvasId, width, height, snapshot, mirrored, mode, paintHex, hidden = false, onStroke, onZoomChange },
  ref,
) {
  const cols = snapshot.pattern[0]?.length ?? 0
  const rows = snapshot.pattern.length
  const geometry = useMemo<ViewGeometry>(() => ({ width, height, cols, rows }), [width, height, cols, rows])

  // Gestures bypass React: the view lives in refs and is painted straight to the canvas.
  const viewRef = useRef<ViewTransform | null>(null)
  if (!viewRef.current) viewRef.current = fitView(geometry)
  const latest = useRef({ geometry, snapshot, mirrored, mode, paintHex, hidden, onStroke, onZoomChange })
  latest.current = { geometry, snapshot, mirrored, mode, paintHex, hidden, onStroke, onZoomChange }
  const gestureRef = useRef<Gesture>({ kind: 'idle' })
  /** Cells touched by the stroke in progress: pattern cell offset -> colour. */
  const pendingRef = useRef(new Map<number, string>())
  const originRef = useRef({ left: 0, top: 0 })
  const drawState = useRef({ busy: false, dirty: false, token: 0, disposed: false, timer: undefined as ReturnType<typeof setTimeout> | undefined })

  const requestDraw = useCallback(() => {
    const state = drawState.current
    if (state.disposed || latest.current.hidden) return
    // Legacy canvas draws are asynchronous; never queue more than one behind the one in flight.
    if (state.busy) {
      state.dirty = true
      return
    }
    state.busy = true
    state.token += 1
    const token = state.token
    const finish = () => {
      if (state.token !== token || !state.busy) return
      state.busy = false
      clearTimeout(state.timer)
      if (state.dirty) {
        state.dirty = false
        requestDraw()
      }
    }
    const { geometry: currentGeometry, snapshot: currentSnapshot, mirrored: currentMirrored } = latest.current
    const context = Taro.createCanvasContext(canvasId)
    drawPattern(context, currentGeometry, viewRef.current as ViewTransform, currentSnapshot, currentMirrored, pendingRef.current)
    context.draw(false, finish)
    // The draw callback is not guaranteed on every platform; never stall on it.
    state.timer = setTimeout(finish, 120)
  }, [canvasId])

  const reportZoom = useCallback(() => {
    const current = latest.current
    current.onZoomChange?.(zoomPercent(current.geometry, viewRef.current as ViewTransform))
  }, [])

  useEffect(() => {
    const state = drawState.current
    state.disposed = false
    return () => {
      state.disposed = true
      clearTimeout(state.timer)
    }
  }, [])

  // A new canvas size or grid size starts from "fit to screen".
  useEffect(() => {
    viewRef.current = fitView(geometry)
    reportZoom()
  }, [geometry, reportZoom])

  // The committed stroke is now part of the snapshot.
  useEffect(() => {
    pendingRef.current.clear()
  }, [snapshot])

  useEffect(() => {
    requestDraw()
  }, [snapshot, mirrored, requestDraw])

  useEffect(() => {
    if (hidden) return undefined
    try {
      Taro.createSelectorQuery()
        .select(`#${canvasId}`)
        .boundingClientRect((rect) => {
          const box = (Array.isArray(rect) ? rect[0] : rect) as { left?: number; top?: number } | null
          if (box && Number.isFinite(box.left) && Number.isFinite(box.top)) originRef.current = { left: Number(box.left), top: Number(box.top) }
        })
        .exec()
    } catch {
      // Only needed on platforms whose canvas touches lack canvas-relative x/y.
    }
    // The legacy canvas can be reset while layout settles: draw once when the
    // node is mounted and once after its size is committed.
    requestDraw()
    const timer = setTimeout(requestDraw, 80)
    return () => clearTimeout(timer)
  }, [hidden, geometry, canvasId, requestDraw])

  useImperativeHandle(ref, () => ({
    zoomBy(factor: number) {
      const current = latest.current.geometry
      const view = viewRef.current as ViewTransform
      viewRef.current = zoomAt(current, view, view.scale * factor, current.width / 2, current.height / 2)
      requestDraw()
      reportZoom()
    },
    fit() {
      viewRef.current = fitView(latest.current.geometry)
      requestDraw()
      reportZoom()
    },
  }), [requestDraw, reportZoom])

  function touchPoints(event: unknown): Point[] {
    const touches = (event as { touches?: ArrayLike<Record<string, number | undefined>> }).touches
    if (!touches) return []
    return Array.from(touches).map((touch) => {
      // Legacy canvas touches are already relative to the canvas.
      if (Number.isFinite(touch.x) && Number.isFinite(touch.y)) return { x: Number(touch.x), y: Number(touch.y) }
      return {
        x: Number(touch.clientX ?? touch.pageX ?? 0) - originRef.current.left,
        y: Number(touch.clientY ?? touch.pageY ?? 0) - originRef.current.top,
      }
    })
  }

  function discardStroke() {
    if (!pendingRef.current.size) return
    pendingRef.current.clear()
    requestDraw()
  }

  function beginPinch(first: Point, second: Point) {
    // A second finger turns a stroke into a zoom; nothing is painted.
    if (gestureRef.current.kind === 'stroke') discardStroke()
    gestureRef.current = {
      kind: 'pinch',
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      middle: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    }
  }

  function extendStroke(gesture: Extract<Gesture, { kind: 'stroke' }>, point: Point) {
    const current = latest.current
    const cell = cellAt(current.geometry, viewRef.current as ViewTransform, point.x, point.y)
    if (!cell) {
      gesture.lastCell = null
      return
    }
    const totalCols = current.geometry.cols
    const segment = gesture.lastCell ? cellsBetween(gesture.lastCell, cell) : [cell]
    let changed = false
    segment.forEach((step) => {
      const sourceX = current.mirrored ? totalCols - 1 - step.x : step.x
      const offset = step.y * totalCols + sourceX
      if (pendingRef.current.has(offset)) return
      pendingRef.current.set(offset, gesture.hex)
      gesture.cells.push({ x: sourceX, y: step.y })
      changed = true
    })
    gesture.lastCell = cell
    if (changed) requestDraw()
  }

  function handleTouchStart(event: unknown) {
    const points = touchPoints(event)
    if (points.length >= 2) {
      beginPinch(points[0], points[1])
      return
    }
    if (points.length !== 1 || gestureRef.current.kind === 'settling') return
    const current = latest.current
    if (current.mode === 'paint' || current.mode === 'erase') {
      pendingRef.current.clear()
      const gesture: Gesture = {
        kind: 'stroke',
        hex: current.mode === 'erase' ? EMPTY_CELL_HEX : current.paintHex || EMPTY_CELL_HEX,
        cells: [],
        lastCell: null,
      }
      gestureRef.current = gesture
      extendStroke(gesture, points[0])
      return
    }
    gestureRef.current = { kind: 'pan', last: points[0] }
  }

  function handleTouchMove(event: unknown) {
    const points = touchPoints(event)
    const gesture = gestureRef.current
    const currentGeometry = latest.current.geometry
    const view = viewRef.current as ViewTransform
    if (points.length >= 2) {
      if (gesture.kind !== 'pinch') {
        beginPinch(points[0], points[1])
        return
      }
      const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y))
      const middle = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      const moved = panBy(currentGeometry, view, middle.x - gesture.middle.x, middle.y - gesture.middle.y)
      viewRef.current = zoomAt(currentGeometry, moved, moved.scale * (distance / gesture.distance), middle.x, middle.y)
      gesture.distance = distance
      gesture.middle = middle
      requestDraw()
      return
    }
    if (points.length !== 1) return
    if (gesture.kind === 'pan') {
      viewRef.current = panBy(currentGeometry, view, points[0].x - gesture.last.x, points[0].y - gesture.last.y)
      gesture.last = points[0]
      requestDraw()
    } else if (gesture.kind === 'stroke') {
      extendStroke(gesture, points[0])
    }
  }

  function handleTouchEnd(event: unknown) {
    const remaining = touchPoints(event).length
    const gesture = gestureRef.current
    if (remaining > 0) {
      if (gesture.kind === 'pinch') gestureRef.current = { kind: 'settling' }
      return
    }
    gestureRef.current = { kind: 'idle' }
    if (gesture.kind === 'stroke') {
      // The preview stays until the parent's updated snapshot arrives.
      if (gesture.cells.length) latest.current.onStroke?.(gesture.cells)
      return
    }
    if (gesture.kind !== 'idle') reportZoom()
  }

  function handleTouchCancel() {
    if (gestureRef.current.kind === 'stroke') discardStroke()
    gestureRef.current = { kind: 'idle' }
    reportZoom()
  }

  const style = { width: `${width}px`, height: `${height}px` }
  if (hidden) return <View className="pattern-canvas-placeholder" style={style} />
  return (
    <Canvas
      id={canvasId}
      canvasId={canvasId}
      className="pattern-canvas"
      style={style}
      disableScroll
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    />
  )
})
