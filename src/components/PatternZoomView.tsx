import { EditablePatternGrid } from './EditablePatternGrid'
import type { BeadCell } from '../pattern/types'

interface PatternZoomViewProps {
  pattern: BeadCell[][]
  gridCols: number
  gridRows: number
  cellSize: number
  renderMode: 'symbols' | 'solid'
}

export function PatternZoomView({ pattern, gridCols, gridRows, cellSize, renderMode }: PatternZoomViewProps) {
  return (
    <EditablePatternGrid
      pattern={pattern}
      gridCols={gridCols}
      gridRows={gridRows}
      cellSize={cellSize}
      renderMode={renderMode}
      tool="pan"
      selectedPaletteIndex={0}
      readOnly
      onStrokeComplete={() => undefined}
    />
  )
}
