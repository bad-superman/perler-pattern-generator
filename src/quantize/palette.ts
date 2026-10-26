import type { BeadPaletteEntry } from '../palettes'
import { hexToRgb, rgbToLab, type Lab, type Rgb } from './color'

export interface PreparedColor {
  index: number
  code: string
  name: string
  hex: string
  rgb: Rgb
  lab: Lab
}

const preparedCache = new WeakMap<object, PreparedColor[]>()

export function preparePalette(colors: readonly BeadPaletteEntry[]): PreparedColor[] {
  const cached = preparedCache.get(colors)
  if (cached) return cached
  const prepared = colors.map(([code, name, hex], index) => {
    const rgb = hexToRgb(hex)
    return {
      index,
      code,
      name,
      hex,
      rgb,
      lab: rgbToLab(rgb.r, rgb.g, rgb.b),
    }
  })
  preparedCache.set(colors, prepared)
  return prepared
}

export function nearestPreparedIndex(lab: Lab, palette: readonly PreparedColor[]) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < palette.length; index += 1) {
    const color = palette[index].lab
    const distance = (lab.l - color.l) ** 2 + (lab.a - color.a) ** 2 + (lab.b - color.b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return bestIndex
}
