import { EMPTY_CELL_HEX, type BeadCell, type PaletteColor } from '../../pattern/types'
import type { QuantizedPattern } from '../../quantize'

/**
 * Converts the algorithm result into the snapshot shape shared by mobile UI.
 * Keeping this outside React means both miniapp targets can use identical data.
 */
export function quantizedPatternToSnapshot(result: QuantizedPattern) {
  // Most quantizers return an index into `selected`, while older/platform
  // adapters may still return the original palette index stored on
  // PreparedColor.index. Resolve both forms before building the snapshot so
  // a valid assignment can never turn into an empty preview cell.
  const assignmentIndices = new Int16Array(result.assignments.length)
  assignmentIndices.fill(-1)
  const selectedByOriginalIndex = new Map<number, number>()
  result.selected.forEach((color, index) => selectedByOriginalIndex.set(color.index, index))

  const counts = new Int32Array(result.selected.length)
  for (let offset = 0; offset < result.assignments.length; offset += 1) {
    const colorIndex = result.assignments[offset]
    const selectedIndex = colorIndex >= 0 && colorIndex < result.selected.length
      ? colorIndex
      : selectedByOriginalIndex.get(colorIndex) ?? -1
    assignmentIndices[offset] = selectedIndex
    if (selectedIndex >= 0) counts[selectedIndex] += 1
  }

  const indexMap = new Int16Array(result.selected.length)
  indexMap.fill(-1)
  const palette: PaletteColor[] = []
  result.selected.forEach((color, index) => {
    if (counts[index] <= 0) return
    indexMap[index] = palette.length
    palette.push({
      code: color.code,
      name: color.name,
      hex: color.hex,
      count: counts[index],
      symbol: color.code,
    })
  })

  const pattern: BeadCell[][] = []
  for (let y = 0; y < result.rows; y += 1) {
    const row: BeadCell[] = []
    for (let x = 0; x < result.cols; x += 1) {
      const colorIndex = assignmentIndices[y * result.cols + x]
      if (colorIndex < 0) {
        row.push({ colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' })
        continue
      }

      const nextColorIndex = colorIndex >= 0 && colorIndex < indexMap.length ? indexMap[colorIndex] : -1
      const color = nextColorIndex >= 0 ? palette[nextColorIndex] : undefined
      if (!color) {
        row.push({ colorIndex: -1, hex: EMPTY_CELL_HEX, symbol: '' })
        continue
      }

      row.push({ colorIndex: nextColorIndex, hex: color.hex, symbol: color.symbol })
    }
    pattern.push(row)
  }

  return {
    cols: result.cols,
    rows: result.rows,
    pattern,
    palette,
  }
}
