import { useEffect, useRef, useState } from 'react'
import type { BeadCell, PaletteColor } from '../pattern/types'

export type EditorTool = 'paint' | 'erase' | 'pan' | 'replace'

interface EditablePatternGridProps {
  pattern: BeadCell[][]
  palette: PaletteColor[]
  gridCols: number
  gridRows: number
  cellSize: number
  renderMode: 'symbols' | 'solid'
  tool: EditorTool
  selectedPaletteIndex: number
  onStrokeComplete: (cells: Array<{ x: number; y: number }>, paletteIndex: number | null) => void
}

function isDarkHex(hex: string) {
  const normalized = hex.replace('#', '')
  const value = parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
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
  const strokeRef = useRef<Array<{ x: number; y: number }>>([])
  const paintingRef = useRef(false)
  const panningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  const gridWidth = gridCols * cellSize + Math.max(0, gridCols - 1) + 24
  const gridHeight = gridRows * cellSize + Math.max(0, gridRows - 1) + 24

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const fitScale = Math.min(1, (viewport.clientWidth - 24) / gridWidth, (viewport.clientHeight - 24) / gridHeight)
    setZoom(Number.isFinite(fitScale) && fitScale > 0 ? Math.max(0.35, fitScale) : 1)
  }, [gridCols, gridRows, cellSize, gridWidth, gridHeight])

  function cellFromTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return null
    const cell = target.closest('[data-cell-x]') as HTMLElement | null
    if (!cell) return null
    const x = Number(cell.dataset.cellX)
    const y = Number(cell.dataset.cellY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
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

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
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
      viewport.setPointerCapture(event.pointerId)
      return
    }

    const cell = cellFromTarget(event.target)
    if (!cell) return
    paintingRef.current = true
    strokeRef.current = []
    addStrokeCell(cell)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (panningRef.current && viewportRef.current) {
      const deltaX = event.clientX - panStartRef.current.x
      const deltaY = event.clientY - panStartRef.current.y
      viewportRef.current.scrollLeft = panStartRef.current.scrollLeft - deltaX
      viewportRef.current.scrollTop = panStartRef.current.scrollTop - deltaY
      return
    }

    const cell = cellFromTarget(event.target)
    setHoverCell(cell)
    if (!paintingRef.current || !cell || tool === 'pan' || tool === 'replace') return
    addStrokeCell(cell)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (panningRef.current) {
      panningRef.current = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }

    if (!paintingRef.current) return
    paintingRef.current = false
    finishStroke()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.12 : -0.12
    setZoom((current) => Math.min(4, Math.max(0.35, Number((current + delta).toFixed(2)))))
  }

  return (
    <div className="editor-grid-shell">
      <div className="editor-zoom-controls" aria-label="缩放控制">
        <button type="button" onClick={() => setZoom((value) => Math.min(4, Number((value + 0.15).toFixed(2))))}>放大</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.35, Number((value - 0.15).toFixed(2))))}>缩小</button>
      </div>
      <div
        ref={viewportRef}
        className="editor-grid-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverCell(null)}
        onWheel={handleWheel}
      >
        <div
          className="editor-grid-stage"
          style={{
            width: gridWidth * zoom,
            height: gridHeight * zoom,
          }}
        >
          <div
            className={`pattern-grid ${renderMode} actual-grid editing`}
            style={{
              gridTemplateColumns: `repeat(${gridCols}, ${cellSize}px)`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
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
                  {renderMode === 'symbols' && cell.colorIndex >= 0 ? cell.symbol : ''}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
