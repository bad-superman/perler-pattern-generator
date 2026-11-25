import type { RgbaGrid } from '../core'

export interface MiniappImageSource {
  name: string
  width: number
  height: number
  sizeBytes?: number
  tempPath?: string
}

export interface MiniappCanvasAdapter {
  /** Decode and fit a platform image into the RGBA grid consumed by the core. */
  decodeToGrid(source: MiniappImageSource, cols: number, rows: number, shape?: 'square' | 'ratio'): Promise<RgbaGrid>
  /** Render the shared pattern snapshot into a PNG-ready platform canvas. */
  renderExportSheet(input: RenderExportSheetInput): Promise<MiniappExportedImage>
}

export interface MiniappImagePicker {
  chooseImage(): Promise<MiniappImageSource | null>
}

export interface MiniappAlbumAdapter {
  requestPermission(): Promise<boolean>
  saveImage(path: string): Promise<void>
}

export interface RenderExportSheetInput {
  cols: number
  rows: number
  activeCells: number
  mirrored: boolean
  pattern: ReadonlyArray<ReadonlyArray<{ hex: string; symbol: string; colorIndex: number }>>
  palette: ReadonlyArray<{ code: string; name: string; hex: string; count: number; symbol: string }>
}

export interface MiniappExportedImage {
  tempPath: string
  width: number
  height: number
}
