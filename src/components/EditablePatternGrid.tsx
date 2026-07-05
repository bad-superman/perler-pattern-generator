import { useEffect, useRef, useState } from 'react'
import type { BeadCell } from '../pattern/types'

export type EditorTool = 'paint' | 'erase' | 'pan' | 'replace'

interface EditablePatternGridProps {
  pattern: BeadCell[][]
  gridCols: number
  gridRows: number
  cellSize: number
  renderMode: 'symbols' | 'solid'
  tool: EditorTool
  selectedPaletteIndex: number
  onStrokeComplete: (cells: Array<{ x: number; y: number }>, paletteIndex: number | null) => void
}

interface PointerPoint {
  x: number
  y: number
}

interface PinchState {
  distance: number
  zoom: number
}

interface ViewportMetrics {
  width: number
  height: number
  scrollLeft: number
  scrollTop: number
}

function isDarkHex(hex: string) {
  const normalized = hex.replace('#', '')
  const value = parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function getPointerDistance(points: PointerPoint[]) {
  if (points.length < 2) return 0
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}

function getPointerCenter(points: PointerPoint[]) {
  const [first, second] = points
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function EditablePatternGrid({
  pattern,
  gridCols,
  gridRows,
  cellSize,
  renderMode,
  tool,
  selectedPaletteIndex,
  onStrokeComplete,
}: EditablePatternGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const miniMapRef = useRef<HTMLDivElement>(null)
  const miniMapCanvasRef = useRef<HTMLCanvasElement>(null)
  const strokeRef = useRef<Array<{ x: number; y: number }>>([])
  const activePointersRef = useRef(new Map<number, PointerPoint>())
  const paintingRef = useRef(false)
  const panningRef = useRef(false)
  const miniMapDraggingRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const pinchRef = useRef<PinchState | null>(null)
  const zoomRef = useRef(1)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const [fitZoom, setFitZoom] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [viewportMetrics, setViewportMetrics] = useState<ViewportMetrics>({
    width: 0,
    height: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })

  const gridWidth = gridCols * cellSize + Math.max(0, gridCols - 1) + 24
  const gridHeight = gridRows * cellSize + Math.max(0, gridRows - 1) + 24
  const scaledGridWidth = gridWidth * zoom
  const scaledGridHeight = gridHeight * zoom
  const scaledCellSize = cellSize * zoom
  const minZoom = Math.max(0.06, Math.min(0.35, fitZoom))
  const showMiniMap = zoom < 1 || scaledGridWidth > viewportMetrics.width + 2 || scaledGridHeight > viewportMetrics.height + 2
  const miniMapWidth = gridCols >= gridRows ? 132 : Math.max(76, Math.round(132 * (gridCols / gridRows)))
  const miniMapHeight = gridRows >= gridCols ? 132 : Math.max(76, Math.round(132 * (gridRows / gridCols)))
  const miniViewport = {
    left: scaledGridWidth > viewportMetrics.width
      ? clamp((viewportMetrics.scrollLeft / scaledGridWidth) * 100, 0, 100)
      : 0,
    top: scaledGridHeight > viewportMetrics.height
      ? clamp((viewportMetrics.scrollTop / scaledGridHeight) * 100, 0, 100)
      : 0,
    width: scaledGridWidth > 0
      ? clamp((Math.min(viewportMetrics.width, scaledGridWidth) / scaledGridWidth) * 100, 4, 100)
      : 100,
    height: scaledGridHeight > 0
      ? clamp((Math.min(viewportMetrics.height, scaledGridHeight) / scaledGridHeight) * 100, 4, 100)
      : 100,
  }

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const canvas = miniMapCanvasRef.current
    if (!canvas || !gridCols || !gridRows) return

    canvas.width = gridCols
    canvas.height = gridRows
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.createImageData(gridCols, gridRows)
    pattern.forEach((row, y) => {
      row.forEach((cell, x) => {
        const offset = (y * gridCols + x) * 4
        const color = hexToRgb(cell.hex)
        imageData.data[offset] = color.r
        imageData.data[offset + 1] = color.g
        imageData.data[offset + 2] = color.b
        imageData.data[offset + 3] = 255
      })
    })
    ctx.putImageData(imageData, 0, 0)
  }, [pattern, gridCols, gridRows, showMiniMap])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    const syncFitZoom = () => {
      const fitScale = Math.min(1, (viewport.clientWidth - 24) / gridWidth, (viewport.clientHeight - 24) / gridHeight)
      const nextFitZoom = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1
      setFitZoom(nextFitZoom)
      setZoom(nextFitZoom)
      window.requestAnimationFrame(() => syncViewportMetrics())
    }

    syncFitZoom()
    const observer = new ResizeObserver(syncFitZoom)
    observer.observe(viewport)
    window.addEventListener('resize', syncFitZoom)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncFitZoom)
    }
  }, [gridWidth, gridHeight])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => syncViewportMetrics())
    return () => window.cancelAnimationFrame(frame)
  }, [zoom, gridCols, gridRows])

  function syncViewportMetrics() {
    const viewport = viewportRef.current
    if (!viewport) return
    setViewportMetrics({
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    })
  }

  function clampZoom(value: number) {
    return clamp(Number(value.toFixed(3)), minZoom, 4)
  }

  function zoomTo(nextZoom: number, clientX?: number, clientY?: number) {
    const viewport = viewportRef.current
    if (!viewport) return
    const currentZoom = zoomRef.current
    const targetZoom = clampZoom(nextZoom)
    const rect = viewport.getBoundingClientRect()
    const anchorX = typeof clientX === 'number' ? clientX - rect.left : viewport.clientWidth / 2
    const anchorY = typeof clientY === 'number' ? clientY - rect.top : viewport.clientHeight / 2
    const contentX = (viewport.scrollLeft + anchorX) / currentZoom
    const contentY = (viewport.scrollTop + anchorY) / currentZoom

    setZoom(targetZoom)
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = contentX * targetZoom - anchorX
      viewport.scrollTop = contentY * targetZoom - anchorY
      syncViewportMetrics()
    })
  }

  function cellFromTarget(target: EventTarget | Element | null) {
    if (!(target instanceof HTMLElement)) return null
    const cell = target.closest('[data-cell-x]') as HTMLElement | null
    if (!cell) return null
    const x = Number(cell.dataset.cellX)
    const y = Number(cell.dataset.cellY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  }

  function cellFromPoint(clientX: number, clientY: number) {
    return cellFromTarget(document.elementFromPoint(clientX, clientY))
  }

  function addStrokeCell(cell: { x: number; y: number }) {
    const key = `${cell.x},${cell.y}`
    if (strokeRef.current.some((item) => `${item.x},${item.y}` === key)) return
    strokeRef.current.push(cell)
  }

  function finishStroke() {
    if (!strokeRef.current.length) return
    const paletteIndex = tool === 'erase' ? null : selectedPaletteIndex
    onStrokeComplete(strokeRef.current, paletteIndex)
    strokeRef.current = []
  }

  function startPinch() {
    const points = [...activePointersRef.current.values()]
    if (points.length < 2) return
    paintingRef.current = false
    panningRef.current = false
    strokeRef.current = []
    pinchRef.current = {
      distance: getPointerDistance(points),
      zoom: zoomRef.current,
    }
  }

  function handlePinchMove() {
    const pinch = pinchRef.current
    const points = [...activePointersRef.current.values()]
    if (!pinch || points.length < 2 || !pinch.distance) return
    const center = getPointerCenter(points)
    const nextZoom = pinch.zoom * (getPointerDistance(points) / pinch.distance)
    zoomTo(nextZoom, center.x, center.y)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)

    if (activePointersRef.current.size >= 2) {
      startPinch()
      return
    }

    if (tool === 'pan' || tool === 'replace') {
      const viewport = viewportRef.current
      if (!viewport) return
      panningRef.current = true
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      }
      return
    }

    const cell = cellFromPoint(event.clientX, event.clientY) ?? cellFromTarget(event.target)
    if (!cell) return
    paintingRef.current = true
    strokeRef.current = []
    addStrokeCell(cell)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    if (pinchRef.current && activePointersRef.current.size >= 2) {
      handlePinchMove()
      return
    }

    if (panningRef.current && viewportRef.current) {
      const deltaX = event.clientX - panStartRef.current.x
      const deltaY = event.clientY - panStartRef.current.y
      viewportRef.current.scrollLeft = panStartRef.current.scrollLeft - deltaX
      viewportRef.current.scrollTop = panStartRef.current.scrollTop - deltaY
      syncViewportMetrics()
      return
    }

    const cell = cellFromPoint(event.clientX, event.clientY)
    setHoverCell(cell)
    if (!paintingRef.current || !cell || tool === 'pan' || tool === 'replace') return
    addStrokeCell(cell)
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (pinchRef.current) {
      if (activePointersRef.current.size < 2) pinchRef.current = null
      return
    }

    if (panningRef.current) {
      panningRef.current = false
      return
    }

    if (!paintingRef.current) return
    paintingRef.current = false
    finishStroke()
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.12 : 0.88
    zoomTo(zoomRef.current * factor, event.clientX, event.clientY)
  }

  function moveViewportFromMiniMap(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    const miniMap = miniMapRef.current
    if (!viewport || !miniMap) return
    const rect = miniMap.getBoundingClientRect()
    const ratioX = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1)
    const ratioY = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1)
    viewport.scrollLeft = ratioX * scaledGridWidth - viewport.clientWidth / 2
    viewport.scrollTop = ratioY * scaledGridHeight - viewport.clientHeight / 2
    syncViewportMetrics()
  }

  function handleMiniMapPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    miniMapDraggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    moveViewportFromMiniMap(event)
  }

  function handleMiniMapPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!miniMapDraggingRef.current) return
    event.preventDefault()
    event.stopPropagation()
    moveViewportFromMiniMap(event)
  }

  function handleMiniMapPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    miniMapDraggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="editor-grid-shell">
      <div className="editor-board-badge" aria-live="polite">
        {Math.round(zoom * 100)}%
      </div>
      {showMiniMap && (
        <div
          ref={miniMapRef}
          className="editor-minimap"
          style={{ width: miniMapWidth, height: miniMapHeight }}
          onPointerDown={handleMiniMapPointerDown}
          onPointerMove={handleMiniMapPointerMove}
          onPointerUp={handleMiniMapPointerEnd}
          onPointerCancel={handleMiniMapPointerEnd}
        >
          <canvas ref={miniMapCanvasRef} className="editor-minimap-canvas" aria-label="全图预览" />
          <span
            className="editor-minimap-viewport"
            style={{
              left: `${miniViewport.left}%`,
              top: `${miniViewport.top}%`,
              width: `${miniViewport.width}%`,
              height: `${miniViewport.height}%`,
            }}
          />
        </div>
      )}
      <div
        ref={viewportRef}
        className={`editor-grid-viewport ${tool === 'pan' || tool === 'replace' ? 'is-panning-tool' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={() => setHoverCell(null)}
        onWheel={handleWheel}
        onScroll={syncViewportMetrics}
      >
        <div
          className="editor-grid-stage"
          style={{
            width: scaledGridWidth,
            height: scaledGridHeight,
          }}
        >
          <div
            className={`pattern-grid ${renderMode} actual-grid editing`}
            style={{
              gridTemplateColumns: `repeat(${gridCols}, ${scaledCellSize}px)`,
              gap: `${zoom}px`,
              padding: `${10 * zoom}px`,
              borderWidth: `${2 * zoom}px`,
              borderRadius: `${18 * zoom}px`,
              ['--cell-font' as string]: `${Math.max(7, 9 * zoom)}px`,
            }}
          >
            {pattern.flat().map((cell, index) => {
              const x = index % gridCols
              const y = Math.floor(index / gridCols)
              const isHover = hoverCell?.x === x && hoverCell?.y === y
              return (
                <span
                  key={`${index}-${cell.symbol}-${cell.hex}`}
                  data-cell-x={x}
                  data-cell-y={y}
                  data-testid="pattern-cell"
                  className={isHover ? 'cell-hover' : undefined}
                  style={{
                    background: cell.hex,
                    color: cell.colorIndex >= 0 && isDarkHex(cell.hex) ? '#fff' : '#1d1a23',
                  }}
                >
                  {renderMode === 'symbols' && cell.colorIndex >= 0 && scaledCellSize >= 7 ? cell.symbol : ''}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
