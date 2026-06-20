export type BeadPaletteEntry = readonly [code: string, name: string, hex: string]

export type PaletteBrand = 'mard' | 'hama'

export interface PaletteDefinition {
  brand: PaletteBrand
  label: string
  colors: readonly BeadPaletteEntry[]
}
