import { Check, Eraser, Hand, Paintbrush, PaintBucket, Palette, Redo2, Replace, Undo2 } from 'lucide-react'
import type { PaletteColor } from '../pattern/types'
import type { EditorTool } from './EditablePatternGrid'

interface PatternEditorToolbarProps {
  tool: EditorTool
  selectedColor?: PaletteColor
  colorPickerOpen: boolean
  canUndo: boolean
  canRedo: boolean
  onColorPickerToggle: () => void
  onToolChange: (tool: EditorTool) => void
  onUndo: () => void
  onRedo: () => void
  onExit: () => void
}

export function PatternEditorToolbar({
  tool,
  selectedColor,
  colorPickerOpen,
  canUndo,
  canRedo,
  onColorPickerToggle,
  onToolChange,
  onUndo,
  onRedo,
  onExit,
}: PatternEditorToolbarProps) {
  return (
    <div className="editor-toolbar" data-testid="editor-toolbar">
      <div className="editor-tools-grid" aria-label="绘制工具">
        <button
          type="button"
          className={`editor-tool-btn editor-color-btn ${colorPickerOpen ? 'active' : ''}`}
          onClick={onColorPickerToggle}
          aria-label="选色"
        >
          <span className="editor-selected-color" style={{ background: selectedColor?.hex ?? '#ffffff' }} aria-hidden="true">
            {selectedColor?.symbol || <Palette size={16} />}
          </span>
          选色
        </button>
        <button
          type="button"
          className={`editor-tool-btn ${tool === 'paint' && !colorPickerOpen ? 'active' : ''}`}
          onClick={() => onToolChange('paint')}
        >
          <Paintbrush size={18} /> 画笔
        </button>
        <button
          type="button"
          className={`editor-tool-btn ${tool === 'erase' ? 'active' : ''}`}
          onClick={() => onToolChange('erase')}
        >
          <Eraser size={18} /> 橡皮
        </button>
        <button
          type="button"
          className={`editor-tool-btn ${tool === 'fill' ? 'active' : ''}`}
          onClick={() => onToolChange('fill')}
        >
          <PaintBucket size={18} /> 填充
        </button>
        <button
          type="button"
          className={`editor-tool-btn ${tool === 'replace' ? 'active' : ''}`}
          onClick={() => onToolChange('replace')}
        >
          <Replace size={18} /> 换色
        </button>
        <button
          type="button"
          className={`editor-tool-btn ${tool === 'pan' ? 'active' : ''}`}
          onClick={() => onToolChange('pan')}
        >
          <Hand size={18} /> 移动
        </button>
        <button type="button" className="editor-tool-btn editor-done-btn" onClick={onExit}>
          <Check size={18} /> 完成
        </button>
      </div>
      <div className="editor-history-actions" aria-label="编辑历史">
        <button type="button" className="editor-history-btn" disabled={!canUndo} onClick={onUndo} aria-label="撤销">
          <Undo2 size={16} /> 撤销
        </button>
        <button type="button" className="editor-history-btn" disabled={!canRedo} onClick={onRedo} aria-label="重做">
          <Redo2 size={16} /> 重做
        </button>
      </div>
    </div>
  )
}
