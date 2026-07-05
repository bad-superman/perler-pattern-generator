import { X } from 'lucide-react'
import type { BeadPaletteEntry } from '../palettes'
import type { PaletteColor } from '../pattern/types'

interface ColorPickerStripProps {
  palette: PaletteColor[]
  selectedPaletteIndex: number
  brandColors: readonly BeadPaletteEntry[]
  open: boolean
  onSelect: (paletteIndex: number) => void
  onClose: () => void
}

function formatColorLabel(color: Pick<PaletteColor, 'code' | 'name'>) {
  return color.name ? `${color.code} ${color.name}` : color.code
}

export function ColorPickerStrip({
  palette,
  selectedPaletteIndex,
  brandColors,
  open,
  onSelect,
  onClose,
}: ColorPickerStripProps) {
  const usedColors = palette
    .map((color, index) => ({ color, index }))
    .filter(({ color }) => color.count > 0)
  const selectedColor = palette[selectedPaletteIndex]

  function selectAndClose(index: number) {
    onSelect(index)
    onClose()
  }

  return (
    <div className={`color-picker-popover ${open ? 'open' : ''}`} hidden={!open} data-testid="color-picker-strip">
      <div className="color-picker-head">
        <div>
          <strong>选择拼豆颜色</strong>
          <span>
            当前：{selectedColor ? formatColorLabel(selectedColor) : '未选择'}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭选色">
          <X size={16} />
        </button>
      </div>

      <section className="color-picker-section">
        <h3>当前用到颜色</h3>
        {usedColors.length ? (
          <div className="color-picker-used">
            {usedColors.map(({ color, index }) => (
              <button
                key={`${color.symbol}-${color.code}`}
                type="button"
                className={`color-swatch ${selectedPaletteIndex === index ? 'active' : ''}`}
                onClick={() => selectAndClose(index)}
                title={formatColorLabel(color)}
                aria-label={`${formatColorLabel(color)}，已使用 ${color.count} 格`}
              >
                <i style={{ background: color.hex }}>{color.symbol}</i>
                <span>{color.code}</span>
                <b>{color.count}</b>
              </button>
            ))}
          </div>
        ) : (
          <p className="color-picker-empty">还没有上色，先从下方全部颜色中选择一个颜色开始绘制。</p>
        )}
      </section>

      <section className="color-picker-section">
        <h3>全部颜色</h3>
        <div className="color-picker-all">
          {brandColors.map((entry, brandIndex) => {
            const existingIndex = palette.findIndex((color) => color.code === entry[0])
            const isActive = existingIndex === selectedPaletteIndex
            return (
              <button
                key={`${entry[0]}-${brandIndex}`}
                type="button"
                className={`color-swatch compact ${isActive ? 'active' : ''}`}
                onClick={() => selectAndClose(-(brandIndex + 1))}
                title={`${entry[0]} ${entry[1]}`}
                aria-label={`${entry[0]} ${entry[1]}`}
              >
                <i style={{ background: entry[2] }}>{existingIndex >= 0 ? palette[existingIndex].symbol : ''}</i>
                <span>{entry[0]}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
