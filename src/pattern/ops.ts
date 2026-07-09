import type { BeadPaletteEntry } from '../palettes'
import { EMPTY_CELL_HEX, type BeadCell, type PaletteColor, type PatternSnapshot } from './types'

export function clonePattern(pattern: BeadCell[][]): BeadCell[][] {
  return pattern.map((row) => row.map((cell) => ({ ...cell })))
}

export function clonePalette(palette: PaletteColor[]): PaletteColor[] {
  return palette.map((color) => ({ ...color }))
}

export function cloneSnapshot(snapshot: PatternSnapshot): PatternSnapshot {
  return {
    pattern: clonePattern(snapshot.pattern),
    palette: clonePalette(snapshot.palette),
  }
}

export function createEmptyCell(): BeadCell {
  return { colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' }
}

export function paletteColorAt(palette: PaletteColor[], paletteIndex: number): PaletteColor | null {
  if (paletteIndex < 0 || paletteIndex >= palette.length) return null
  return palette[paletteIndex]
}

export function setCell(
  pattern: BeadCell[][],
  x: number,
  y: number,
  palette: PaletteColor[],
  paletteIndex: number | null,
): BeadCell[][] {
  if (y < 0 || y >= pattern.length || x < 0 || x >= pattern[y].length) return pattern

  const next = clonePattern(pattern)
  if (paletteIndex === null || paletteIndex < 0) {
    next[y][x] = createEmptyCell()
    return next
  }

  const color = paletteColorAt(palette, paletteIndex)
  if (!color) return pattern

  next[y][x] = {
    colorIndex: paletteIndex,
    hex: color.hex,
    symbol: color.symbol,
  }
  return next
}

export function applyStroke(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  cells: Array<{ x: number; y: number }>,
  paletteIndex: number | null,
): BeadCell[][] {
  if (!cells.length) return pattern

  const targetColor = paletteIndex === null || paletteIndex < 0 ? null : paletteColorAt(palette, paletteIndex)
  if (paletteIndex !== null && paletteIndex >= 0 && !targetColor) return pattern

  let next: BeadCell[][] | null = null
  cells.forEach(({ x, y }) => {
    const currentCell = pattern[y]?.[x]
    if (!currentCell) return

    const replacement = targetColor
      ? {
          colorIndex: paletteIndex ?? -1,
          hex: targetColor.hex,
          symbol: targetColor.symbol,
        }
      : createEmptyCell()

    if (
      currentCell.colorIndex === replacement.colorIndex &&
      currentCell.hex === replacement.hex &&
      currentCell.symbol === replacement.symbol
    ) {
      return
    }

    if (!next) next = clonePattern(pattern)
    next[y][x] = replacement
  })

  return next ?? pattern
}

export function recalculatePaletteCounts(pattern: BeadCell[][], palette: PaletteColor[]): PaletteColor[] {
  const counts = new Array(palette.length).fill(0)
  pattern.forEach((row) => {
    row.forEach((cell) => {
      if (cell.colorIndex >= 0 && cell.colorIndex < counts.length) {
        counts[cell.colorIndex] += 1
      }
    })
  })

  return palette.map((color, index) => ({
    ...color,
    count: counts[index] ?? 0,
  }))
}

export function ensurePaletteColor(
  palette: PaletteColor[],
  entry: BeadPaletteEntry,
): { palette: PaletteColor[]; index: number } {
  const existingIndex = palette.findIndex((color) => color.code === entry[0])
  if (existingIndex >= 0) return { palette, index: existingIndex }

  const nextPalette = [
    ...palette,
    {
      code: entry[0],
      name: entry[1],
      hex: entry[2],
      count: 0,
      symbol: entry[0],
    },
  ]
  return { palette: nextPalette, index: nextPalette.length - 1 }
}

export function countCellsWithSymbol(pattern: BeadCell[][], symbol: string) {
  let total = 0
  pattern.forEach((row) => {
    row.forEach((cell) => {
      if (cell.symbol === symbol && cell.colorIndex >= 0) total += 1
    })
  })
  return total
}

export function replaceColorGlobally(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  fromSymbol: string,
  toPaletteIndex: number,
): PatternSnapshot {
  const target = paletteColorAt(palette, toPaletteIndex)
  if (!target) return { pattern, palette }

  const nextPattern = clonePattern(pattern)
  nextPattern.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.symbol === fromSymbol && cell.colorIndex >= 0) {
        nextPattern[y][x] = {
          colorIndex: toPaletteIndex,
          hex: target.hex,
          symbol: target.symbol,
        }
      }
    })
  })

  return {
    pattern: nextPattern,
    palette: recalculatePaletteCounts(nextPattern, palette),
  }
}
