export function beadCodesToPaletteIndices(
  codes: readonly string[],
  cells: ReadonlyArray<{ colorIndex: number; symbol: string }>,
): number[] {
  const byCode = new Map(codes.map((code, index) => [code, index]))
  return cells.map((cell) => {
    if (cell.colorIndex < 0 || !cell.symbol) return -1
    const index = byCode.get(cell.symbol)
    if (index === undefined) throw new Error('图纸里有无法识别的色号')
    return index
  })
}
