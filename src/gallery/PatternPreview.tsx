import { useEffect, useRef } from 'react'
import { getPaletteColors, type PaletteBrand } from '../palettes'

export function PatternPreview({
  cells,
  cols,
  rows,
  brand,
}: {
  cells: number[]
  cols: number
  rows: number
  brand: PaletteBrand
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || cols < 1 || rows < 1) return
    canvas.width = cols
    canvas.height = rows
    const context = canvas.getContext('2d')
    if (!context) return
    const palette = getPaletteColors(brand)
    for (let index = 0; index < cells.length; index += 1) {
      const colorIndex = cells[index]
      context.fillStyle = colorIndex >= 0 && palette[colorIndex] ? palette[colorIndex][2] : '#fffaf1'
      context.fillRect(index % cols, Math.floor(index / cols), 1, 1)
    }
  }, [brand, cells, cols, rows])
  return <canvas ref={canvasRef} className="gallery-preview" aria-hidden="true" />
}
