import { Eraser, Hand, Paintbrush, Redo2, Replace, Undo2, X } from 'lucide-react'
import type { EditorTool } from './EditablePatternGrid'

interface PatternEditorToolbarProps {
  tool: EditorTool
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: EditorTool) => void
  onUndo: () => void
  onRedo: () => void
  onExit: () => void
}

export function PatternEditorToolbar({
  tool,
  canUndo,
  canRedo,
  onToolChange,
  onUndo,
  onRedo,
  onExit,
}: PatternEditorToolbarProps) {
  return (
    <div className="editor-toolbar" data-testid="editor-toolbar">
      <div className="editor-toolbar-group">
        <button type="button" className="editor-tool-btn" disabled={!canUndo} onClick={onUndo} aria-label="撤销">
          <Undo2 size={18} /> 撤销
        </button>
        <button type="button" className="editor-tool-btn" disabled={!canRedo} onClick={onRedo} aria-label="重做">
          <Redo2 size={18} /> 重做
        </button>
      </div>
      <div className="editor-toolbar-group">
        <button
          type="button"
          className={`editor-tool-btn ${tool === 'paint' ? 'active' : ''}`}
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
      </div>
      <button type="button" className="editor-tool-btn editor-exit-btn" onClick={onExit}>
        <X size={18} /> 完成
      </button>
    </div>
  )
}
