import type { PaletteColor } from '../pattern/types'

interface ColorReplacePanelProps {
  palette: PaletteColor[]
  fromSymbol: string
  toPaletteIndex: number
  affectedCount: number
  onFromSymbolChange: (symbol: string) => void
  onToPaletteIndexChange: (index: number) => void
  onApply: () => void
}

export function ColorReplacePanel({
  palette,
  fromSymbol,
  toPaletteIndex,
  affectedCount,
  onFromSymbolChange,
  onToPaletteIndexChange,
  onApply,
}: ColorReplacePanelProps) {
  const usedColors = palette.filter((color) => color.count > 0)

  return (
    <div className="color-replace-panel" data-testid="color-replace-panel">
      <strong>批量换色</strong>
      <div className="color-replace-row">
        <label>
          <span>源颜色</span>
          <select value={fromSymbol} onChange={(event) => onFromSymbolChange(event.target.value)}>
            <option value="">选择要替换的颜色</option>
            {usedColors.map((color) => (
              <option key={color.symbol} value={color.symbol}>
                {color.symbol} · {color.code} ({color.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>目标颜色</span>
          <select
            value={toPaletteIndex >= 0 ? String(toPaletteIndex) : ''}
            onChange={(event) => onToPaletteIndexChange(Number(event.target.value))}
          >
            <option value="">选择目标颜色</option>
            {palette.map((color, index) => (
              <option key={`${color.symbol}-${color.code}`} value={index}>
                {color.symbol} · {color.code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="color-replace-hint">
        {fromSymbol && toPaletteIndex >= 0
          ? `将替换 ${affectedCount} 格`
          : '选择源色与目标色后，可一次性替换全部匹配格子'}
      </p>
      <button
        type="button"
        className="primary-btn"
        disabled={!fromSymbol || toPaletteIndex < 0 || !affectedCount}
        onClick={onApply}
      >
        应用换色
      </button>
    </div>
  )
}
