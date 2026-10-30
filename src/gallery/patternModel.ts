import { getPaletteColors, type PaletteBrand } from '../palettes'
import { mirrorPatternHorizontal } from '../pattern/ops'
import { EMPTY_CELL_HEX, type BeadCell, type PaletteColor } from '../pattern/types'

export function galleryPattern(input: {
  brand: PaletteBrand
  cols: number
  rows: number
  cells: number[]
  mirrored: boolean
}): { pattern: BeadCell[][]; palette: PaletteColor[]; activeCells: number } {
  const catalog = getPaletteColors(input.brand)
  const counts = new Map<number, number>()
  const flat: BeadCell[] = input.cells.map((index) => {
    const entry = index >= 0 ? catalog[index] : undefined
    if (!entry) return { colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' }
    counts.set(index, (counts.get(index) ?? 0) + 1)
    return { colorIndex: index, hex: entry[2], symbol: entry[0] }
  })
  const grid: BeadCell[][] = []
  for (let y = 0; y < input.rows; y += 1) {
    grid.push(flat.slice(y * input.cols, (y + 1) * input.cols))
  }
  const palette = [...counts.entries()]
    .map(([index, count]) => {
      const entry = catalog[index]
      return { code: entry[0], name: entry[1], hex: entry[2], count, symbol: entry[0] }
    })
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
  return {
    pattern: input.mirrored ? mirrorPatternHorizontal(grid) : grid,
    palette,
    activeCells: [...counts.values()].reduce((sum, count) => sum + count, 0),
  }
}
