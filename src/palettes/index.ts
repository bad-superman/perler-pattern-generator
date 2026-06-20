import { HAMA_PALETTE, HAMA_PALETTE_SIZE } from './hama'
import { MARD221_PALETTE, MARD221_PALETTE_SIZE } from './mard221'
import type { BeadPaletteEntry, PaletteBrand, PaletteDefinition } from './types'

export type { BeadPaletteEntry, PaletteBrand, PaletteDefinition } from './types'

export const DEFAULT_PALETTE_BRAND: PaletteBrand = 'mard'

const PALETTES: Record<PaletteBrand, PaletteDefinition> = {
  mard: {
    brand: 'mard',
    label: 'MARD（国产）',
    colors: MARD221_PALETTE,
  },
  hama: {
    brand: 'hama',
    label: 'Hama',
    colors: HAMA_PALETTE,
  },
}

export function getPalette(brand: PaletteBrand): PaletteDefinition {
  return PALETTES[brand]
}

export function getPaletteColors(brand: PaletteBrand): readonly BeadPaletteEntry[] {
  return PALETTES[brand].colors
}

export function getPaletteSize(brand: PaletteBrand): number {
  return brand === 'mard' ? MARD221_PALETTE_SIZE : HAMA_PALETTE_SIZE
}
