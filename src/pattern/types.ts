export interface PaletteColor {
  code: string
  name: string
  hex: string
  count: number
  symbol: string
}

export interface BeadCell {
  colorIndex: number
  hex: string
  symbol: string
}

export interface PatternSnapshot {
  pattern: BeadCell[][]
  palette: PaletteColor[]
}

export const EMPTY_CELL_HEX = '#fffaf1'
