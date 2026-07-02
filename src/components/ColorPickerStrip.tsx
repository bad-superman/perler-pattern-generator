import type { BeadPaletteEntry } from '../palettes'
import type { PaletteColor } from '../pattern/types'

interface ColorPickerStripProps {
  palette: PaletteColor[]
  selectedPaletteIndex: number
  brandColors: readonly BeadPaletteEntry[]
  showAllColors: boolean
  onSelect: (paletteIndex: number) => void
  onToggleAllColors: () => void
}

export function ColorPickerStrip({
  palette,
  selectedPaletteIndex,
  brandColors,
  showAllColors,
  onSelect,
  onToggleAllColors,
}: ColorPickerStripProps) {
  const extraColors = brandColors
    .map((entry, brandIndex) => ({ entry, brandIndex }))
    .filter(({ entry }) => !palette.some((color) => color.code === entry[0]))

  return (
    <div className="color-picker-strip" data-testid="color-picker-strip">
      <div className="color-picker-scroll">
        {palette.map((color, index) => (
          <button
            key={`${color.symbol}-${color.code}`}
            type="button"
            className={`color-swatch ${selectedPaletteIndex === index ? 'active' : ''}`}
            onClick={() => onSelect(index)}
            title={`${color.code} ${color.name}`}
            aria-label={`${color.code} ${color.name}`}
          >
            <i style={{ background: color.hex }}>{color.symbol}</i>
            <span>{color.code}</span>
          </button>
        ))}
      </div>
      <button type="button" className="color-more-btn" onClick={onToggleAllColors}>
        {showAllColors ? '收起全色' : '更多颜色'}
      </button>
      {showAllColors && (
        <div className="color-picker-all">
          {extraColors.map(({ entry, brandIndex }) => (
            <button
              key={`${entry[0]}-${brandIndex}`}
              type="button"
              className="color-swatch compact"
              onClick={() => onSelect(-(brandIndex + 1))}
              title={`${entry[0]} ${entry[1]}`}
            >
              <i style={{ background: entry[2] }} />
              <span>{entry[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
