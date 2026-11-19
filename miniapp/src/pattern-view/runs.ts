export interface CellRange {
  x0: number
  x1: number
  y0: number
  y1: number
}

/**
 * Groups the cells of an inclusive range into horizontal same-colour runs.
 * Returns, per colour, a flat list of (x, y, length) triples so a pattern can
 * be painted with far fewer canvas commands than one rectangle per cell.
 * Cells whose colour is `skipHex` are left out.
 */
export function colorRuns(range: CellRange, hexAt: (x: number, y: number) => string, skipHex?: string) {
  const runs = new Map<string, number[]>()
  const push = (hex: string, x: number, y: number, length: number) => {
    if (!hex || hex === skipHex || length <= 0) return
    const list = runs.get(hex)
    if (list) list.push(x, y, length)
    else runs.set(hex, [x, y, length])
  }
  for (let y = range.y0; y <= range.y1; y += 1) {
    let runHex = ''
    let runStart = range.x0
    for (let x = range.x0; x <= range.x1; x += 1) {
      const hex = hexAt(x, y)
      if (hex === runHex) continue
      push(runHex, runStart, y, x - runStart)
      runHex = hex
      runStart = x
    }
    push(runHex, runStart, y, range.x1 + 1 - runStart)
  }
  return runs
}
