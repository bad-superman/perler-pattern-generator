import type { BeadPaletteEntry } from '../palettes'
import { deltaE76, rgbToLab } from './color'
import { preparePalette, type PreparedColor } from './palette'
import { assignPalette, cleanupIsolatedAssignments, clearConnectedBackground, type DitherMode } from './postprocess'
import { drawImageToSampledGrid, fitGridToImage, type BoardShape } from './sample'
import { selectPaletteColors, type LabSample } from './select'

export type { BoardShape } from './sample'
export type { DitherMode } from './postprocess'

export interface QuantizeOptions {
  shape: BoardShape
  gridSize: number
  maxColors: number
  palette: readonly BeadPaletteEntry[]
  edgePriority?: boolean
  removeBackground?: boolean
  dither?: DitherMode
  cleanupIsolated?: boolean
}

export interface QuantizedPattern {
  cols: number
  rows: number
  selected: PreparedColor[]
  assignments: Int16Array
}

function collectSamples(data: Uint8ClampedArray, cols: number, rows: number): LabSample[] {
  const samples: LabSample[] = []
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const offset = (y * cols + x) * 4
      if (data[offset + 3] < 80) continue
      const lab = rgbToLab(data[offset], data[offset + 1], data[offset + 2])
      let contrast = 0
      const compare = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
        const neighborOffset = (ny * cols + nx) * 4
        if (data[neighborOffset + 3] < 80) return
        contrast = Math.max(contrast, deltaE76(lab, rgbToLab(data[neighborOffset], data[neighborOffset + 1], data[neighborOffset + 2])))
      }
      compare(x + 1, y)
      compare(x, y + 1)
      samples.push({ lab, weight: contrast > 18 ? 2 : 1 })
    }
  }
  return samples
}

export function quantizeToPalette(image: HTMLImageElement, options: QuantizeOptions): QuantizedPattern {
  const { cols, rows } = fitGridToImage(image, options.gridSize, options.shape)
  const imageData = drawImageToSampledGrid(image, cols, rows, options.shape, options.edgePriority ?? false)
  if (options.removeBackground) clearConnectedBackground(imageData.data, cols, rows)

  const palette = preparePalette(options.palette)
  const samples = collectSamples(imageData.data, cols, rows)
  const selected = selectPaletteColors(samples, palette, options.maxColors)
  const assignments = assignPalette(imageData.data, cols, rows, selected, options.dither ?? 'off')
  if (options.cleanupIsolated) cleanupIsolatedAssignments(assignments, cols, rows, selected)
  return { cols, rows, selected, assignments }
}
