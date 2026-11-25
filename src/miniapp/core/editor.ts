import { EMPTY_CELL_HEX, type PatternSnapshot } from '../../pattern/types'

export function updatePatternCell(snapshot: PatternSnapshot, x: number, y: number, colorIndex: number) {
  const current = snapshot.pattern[y]?.[x]
  if (!current) return snapshot

  const palette = snapshot.palette.map((color) => ({ ...color }))
  if (current.colorIndex >= 0 && palette[current.colorIndex]) {
    palette[current.colorIndex].count = Math.max(0, palette[current.colorIndex].count - 1)
  }

  const nextColor = colorIndex >= 0 ? palette[colorIndex] : undefined
  if (nextColor) nextColor.count += 1

  return {
    ...snapshot,
    palette,
    pattern: snapshot.pattern.map((row, rowIndex) => row.map((cell, colIndex) => {
      if (rowIndex !== y || colIndex !== x) return cell
      return nextColor
        ? { colorIndex, hex: nextColor.hex, symbol: nextColor.symbol }
        : { colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' }
    })),
  }
}

export function cyclePatternCell(snapshot: PatternSnapshot, x: number, y: number) {
  if (!snapshot.palette.length) return snapshot
  const current = snapshot.pattern[y]?.[x]
  if (!current) return snapshot
  return updatePatternCell(snapshot, x, y, (current.colorIndex + 1) % snapshot.palette.length)
}

export function erasePatternCell(snapshot: PatternSnapshot, x: number, y: number) {
  return updatePatternCell(snapshot, x, y, -1)
}
