import { ColorPickerStrip } from './ColorPickerStrip'
import { ColorReplacePanel } from './ColorReplacePanel'
import { EditablePatternGrid, type EditorTool } from './EditablePatternGrid'
import { PatternEditorToolbar } from './PatternEditorToolbar'
import type { BeadPaletteEntry } from '../palettes'
import type { BeadCell, PaletteColor } from '../pattern/types'

type RenderMode = 'symbols' | 'solid'

interface PatternEditorProps {
  pattern: BeadCell[][]
  palette: PaletteColor[]
  gridCols: number
  gridRows: number
  cellSize: number
  renderMode: RenderMode
  tool: EditorTool
  selectedPaletteIndex: number
  colorPickerOpen: boolean
  brandColors: readonly BeadPaletteEntry[]
  canUndo: boolean
  canRedo: boolean
  replaceFromSymbol: string
  replaceToPaletteIndex: number
  replaceAffectedCount: number
  onStrokeComplete: (cells: Array<{ x: number; y: number }>, paletteIndex: number | null) => void
  onColorPickerToggle: () => void
  onToolChange: (tool: EditorTool) => void
  onUndo: () => void
  onRedo: () => void
  onExit: () => void
  onSelectPaletteColor: (paletteIndex: number) => void
  onCloseColorPicker: () => void
  onReplaceFromSymbolChange: (symbol: string) => void
  onReplaceToPaletteIndexChange: (index: number) => void
  onApplyColorReplace: () => void
}

export type { EditorTool }

export function PatternEditor({
  pattern,
  palette,
  gridCols,
  gridRows,
  cellSize,
  renderMode,
  tool,
  selectedPaletteIndex,
  colorPickerOpen,
  brandColors,
  canUndo,
  canRedo,
  replaceFromSymbol,
  replaceToPaletteIndex,
  replaceAffectedCount,
  onStrokeComplete,
  onColorPickerToggle,
  onToolChange,
  onUndo,
  onRedo,
  onExit,
  onSelectPaletteColor,
  onCloseColorPicker,
  onReplaceFromSymbolChange,
  onReplaceToPaletteIndexChange,
  onApplyColorReplace,
}: PatternEditorProps) {
  return (
    <div className="pattern-editor-layout">
      <EditablePatternGrid
        pattern={pattern}
        gridCols={gridCols}
        gridRows={gridRows}
        cellSize={cellSize}
        renderMode={renderMode}
        tool={tool}
        selectedPaletteIndex={selectedPaletteIndex}
        onStrokeComplete={onStrokeComplete}
      />
      <div className="editor-dock">
        <PatternEditorToolbar
          tool={tool}
          selectedColor={palette[selectedPaletteIndex]}
          colorPickerOpen={colorPickerOpen}
          canUndo={canUndo}
          canRedo={canRedo}
          onColorPickerToggle={onColorPickerToggle}
          onToolChange={onToolChange}
          onUndo={onUndo}
          onRedo={onRedo}
          onExit={onExit}
        />
        <ColorPickerStrip
          palette={palette}
          selectedPaletteIndex={selectedPaletteIndex}
          brandColors={brandColors}
          open={colorPickerOpen}
          onSelect={onSelectPaletteColor}
          onClose={onCloseColorPicker}
        />
        {tool === 'replace' ? (
          <ColorReplacePanel
            palette={palette}
            fromSymbol={replaceFromSymbol}
            toPaletteIndex={replaceToPaletteIndex}
            affectedCount={replaceAffectedCount}
            onFromSymbolChange={onReplaceFromSymbolChange}
            onToPaletteIndexChange={onReplaceToPaletteIndexChange}
            onApply={onApplyColorReplace}
          />
        ) : null}
      </div>
    </div>
  )
}
