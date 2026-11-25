import { drawImageSmallGrid, drawImageToSampledGrid, fitGridToImage } from './sample'
import { type QuantizeOptions, type QuantizedPattern, quantizeRgbaGrid } from './rgba'

export { quantizeRgbaGrid } from './rgba'
export type { BoardShape, QuantizeOptions, QuantizedPattern, RgbaGrid } from './rgba'
export type { DitherMode } from './postprocess'

export function quantizeToPalette(image: HTMLImageElement, options: QuantizeOptions): QuantizedPattern {
  const { cols, rows } = fitGridToImage(image, options.gridSize, options.shape)
  const smallGrid = Math.max(cols, rows) <= 56
  const imageData = smallGrid
    ? drawImageSmallGrid(image, cols, rows, options.shape)
    : drawImageToSampledGrid(image, cols, rows, options.shape, options.edgePriority ?? false)
  return quantizeRgbaGrid({ data: imageData.data, cols, rows }, options)
}
