import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Grid3X3, ImageUp, Info, LoaderCircle, Pencil, Printer, Redo2, RotateCcw, Sparkles, Undo2, WandSparkles } from 'lucide-react'
import { saveAs } from 'file-saver'
import { generateAgnesImages, pickAgnesSize } from './agnes/client'
import { cropSubjectFromImage } from './agnes/cropSubject'
import { prepareReferenceImage } from './agnes/prepareReference'
import { AGNES_STYLE_PRESETS, AI_FRAMING_OPTIONS, DEFAULT_NEGATIVE_PROMPT, buildAgnesPrompt, type AiFraming } from './agnes/styles'
import { useMediaQuery } from './hooks/useMediaQuery'
import { PatternEditor, type EditorTool } from './components/PatternEditor'
import { PatternZoomView } from './components/PatternZoomView'
import { usePatternHistory } from './hooks/usePatternHistory'
import {
  applyStroke,
  countCellsWithSymbol,
  createEmptyCell,
  ensurePaletteColor,
  recalculatePaletteCounts,
  replaceColorGlobally,
} from './pattern/ops'
import { EMPTY_CELL_HEX, type BeadCell, type PaletteColor } from './pattern/types'
import {
  DEFAULT_PALETTE_BRAND,
  getPalette,
  getPaletteColors,
  getPaletteSize,
  type BeadPaletteEntry,
  type PaletteBrand,
} from './palettes'
import { quantizeToPalette, type DitherMode } from './quantize'
import './App.css'

type BoardShape = 'ratio' | 'square'
type RenderMode = 'symbols' | 'solid'
type SourceMode = 'local' | 'ai' | 'board'
type PreviewMode = 'view' | 'edit'

const DEFAULT_GRID_SIZE = 52
const AI_DEFAULT_GRID_SIZE = 52
const AI_GRID_RECOMMEND_MAX = 56
const MAX_COLOR_LIMIT = 50
const PROMO_AD_URL = 'https://p.pinduoduo.com/b5eq4V9Z?sc=EFAC'
const PROMO_AD_IMAGE = '/promo/pinduoduo-beads.jpeg'
const HERO_CAROUSEL_INTERVAL_MS = 5000
const HERO_CAROUSEL_SLIDE_COUNT = 2
const QUICK_GRID_SIZES = [52, 104, 156, 208] as const
const BOARD_QUICK_SIZES = QUICK_GRID_SIZES
const GUIDE_BLOCK_SIZE = 5

function readDebugModeFromUrl() {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('debug')
  if (value === null) return false
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = reject
    image.src = url
  })
}

function getGridSizeHint(size: number) {
  if (size <= 32) return '适合简单图标/头像，建议 8–12 色'
  if (size <= 56) return '推荐范围，清晰度和豆数较平衡'
  return '更清晰但豆数多，导出图纸也更大'
}

function getExportCellSize(gridCols: number, gridRows: number) {
  const longSide = Math.max(gridCols, gridRows)
  if (longSide >= 96) return 14
  if (longSide > 64) return 16
  return 18
}

function HeroCarousel({ paletteColors }: { paletteColors: readonly BeadPaletteEntry[] }) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return undefined
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % HERO_CAROUSEL_SLIDE_COUNT)
    }, HERO_CAROUSEL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [paused])

  function goToSlide(index: number) {
    setActiveSlide((index + HERO_CAROUSEL_SLIDE_COUNT) % HERO_CAROUSEL_SLIDE_COUNT)
  }

  return (
    <div
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="拼豆介绍与推广"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="carousel-viewport">
        <div
          className="carousel-track"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          <div className="carousel-slide carousel-slide-intro" aria-hidden={activeSlide !== 0}>
            <div className="mini-board">
              {Array.from({ length: 100 }).map((_, index) => (
                <span key={index} style={{ background: paletteColors[(index * 7) % paletteColors.length][2] }} />
              ))}
            </div>
            <p><strong>拼豆是什么？</strong>把小塑料管按图纸摆到底盘上，再隔着助烫纸熨烫定型，像年轻人的像素版十字绣。</p>
          </div>
          <a
            className="carousel-slide carousel-slide-ad"
            href={PROMO_AD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-hidden={activeSlide !== 1}
            aria-label="查看融豆拼拼 2.6mm 融合豆全色套装推广"
          >
            <img src={PROMO_AD_IMAGE} alt="融豆拼拼 2.6mm 融合豆全色套装" />
            <span className="ad-badge">推广</span>
          </a>
        </div>
      </div>
      <div className="carousel-controls">
        <button type="button" className="carousel-nav-btn" onClick={() => goToSlide(activeSlide - 1)} aria-label="上一张">
          <ChevronLeft size={18} />
        </button>
        <div className="carousel-dots" role="tablist" aria-label="幻灯片切换">
          {Array.from({ length: HERO_CAROUSEL_SLIDE_COUNT }).map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              className={activeSlide === index ? 'active' : ''}
              aria-selected={activeSlide === index}
              aria-label={`第 ${index + 1} 张`}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>
        <button type="button" className="carousel-nav-btn" onClick={() => goToSlide(activeSlide + 1)} aria-label="下一张">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

function isDarkHex(hex: string) {
  return Number.parseInt(hex.slice(1), 16) < 0x777777
}

function formatLegendLabel(color: Pick<PaletteColor, 'code' | 'name'>) {
  return color.name ? `${color.code} ${color.name}` : color.code
}

function createBlankPattern(cols: number, rows: number): BeadCell[][] {
  return Array.from({ length: rows }, () => (
    Array.from({ length: cols }, () => createEmptyCell())
  ))
}

function createBoardStarterPalette(brandColors: readonly BeadPaletteEntry[]): PaletteColor[] {
  const starter = brandColors.find(([code, name]) => /黑|black/i.test(`${code} ${name}`)) ?? brandColors[0]
  if (!starter) return []
  return [{
    code: starter[0],
    name: starter[1],
    hex: starter[2],
    count: 0,
    symbol: starter[0],
  }]
}

function sanitizeExportFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim()
  return base.slice(0, 80) || 'pattern'
}

function formatExportError(cause: unknown) {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return '浏览器资源限制或内存不足'
}

function limitExportCanvas(source: HTMLCanvasElement, maxSide: number) {
  const longSide = Math.max(source.width, source.height)
  if (longSide <= maxSide) return source
  const scale = maxSide / longSide
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成 PNG'))
    }, type)
  })
}

function drawExportGuideLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cellSize: number,
  gap: number,
  cols: number,
  rows: number,
) {
  if (cols <= GUIDE_BLOCK_SIZE && rows <= GUIDE_BLOCK_SIZE) return

  const lines: Array<[number, number, number, number]> = []
  for (let col = GUIDE_BLOCK_SIZE; col < cols; col += GUIDE_BLOCK_SIZE) {
    const guideX = x + col * cellSize + (col - 0.5) * gap
    lines.push([guideX, y, guideX, y + height])
  }
  for (let row = GUIDE_BLOCK_SIZE; row < rows; row += GUIDE_BLOCK_SIZE) {
    const guideY = y + row * cellSize + (row - 0.5) * gap
    lines.push([x, guideY, x + width, guideY])
  }
  if (!lines.length) return

  const strokeLines = (lineWidth: number, strokeStyle: string) => {
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = strokeStyle
    ctx.lineCap = 'butt'
    lines.forEach(([x1, y1, x2, y2]) => {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    })
    ctx.stroke()
  }

  ctx.save()
  strokeLines(3, 'rgba(255, 255, 255, 0.78)')
  strokeLines(1, 'rgba(29, 26, 35, 0.78)')
  ctx.restore()
}

function buildPatternExportCanvas(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  gridCols: number,
  gridRows: number,
  renderMode: RenderMode,
  activeCells: number,
) {
  const exportCell = getExportCellSize(gridCols, gridRows)
  const gap = 1
  const gridPad = 12
  const gridInnerW = gridCols * exportCell + Math.max(0, gridCols - 1) * gap
  const gridInnerH = gridRows * exportCell + Math.max(0, gridRows - 1) * gap
  const gridW = gridInnerW + gridPad * 2
  const gridH = gridInnerH + gridPad * 2

  const legendCols = Math.min(4, Math.max(1, palette.length))
  const legendRows = Math.ceil(palette.length / legendCols)
  const legendItemW = 240
  const legendItemH = 28
  const legendPad = 24
  const legendW = legendCols * legendItemW + legendPad * 2
  const legendH = legendRows * legendItemH + legendPad * 2 + 28

  const margin = 32
  const headerH = 72
  const contentW = Math.max(gridW, legendW, 640)
  const canvas = document.createElement('canvas')
  canvas.width = contentW + margin * 2
  canvas.height = headerH + gridH + 24 + legendH + margin

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')

  ctx.fillStyle = '#fffaf1'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#1d1a23'
  ctx.font = '700 24px "Noto Sans SC", sans-serif'
  ctx.fillText('拼豆图纸', margin, margin + 24)
  ctx.font = '400 14px "Noto Sans SC", sans-serif'
  ctx.fillStyle = '#6f647d'
  ctx.fillText(`${gridCols}×${gridRows} · ${activeCells.toLocaleString()} 颗豆 · ${palette.length} 色`, margin, margin + 48)

  const gridX = margin + (contentW - gridW) / 2
  const gridY = headerH
  ctx.fillStyle = '#2a2633'
  roundRect(ctx, gridX, gridY, gridW, gridH, 18)
  ctx.fill()

  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const cell = pattern[y][x]
      const px = gridX + gridPad + x * (exportCell + gap)
      const py = gridY + gridPad + y * (exportCell + gap)
      ctx.fillStyle = cell.hex
      ctx.fillRect(px, py, exportCell, exportCell)
    }
  }
  drawExportGuideLines(
    ctx,
    gridX + gridPad,
    gridY + gridPad,
    gridInnerW,
    gridInnerH,
    exportCell,
    gap,
    gridCols,
    gridRows,
  )
  if (renderMode === 'symbols') {
    for (let y = 0; y < gridRows; y += 1) {
      for (let x = 0; x < gridCols; x += 1) {
        const cell = pattern[y][x]
        if (cell.colorIndex < 0) continue
        const px = gridX + gridPad + x * (exportCell + gap)
        const py = gridY + gridPad + y * (exportCell + gap)
        ctx.fillStyle = isDarkHex(cell.hex) ? '#fff' : '#1d1a23'
        ctx.font = `800 ${Math.max(7, Math.floor(exportCell * 0.42))}px "Noto Sans SC", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(cell.symbol, px + exportCell / 2, py + exportCell / 2 + 0.5)
      }
    }
  }

  const legendX = margin + (contentW - legendW) / 2
  const legendY = gridY + gridH + 24
  ctx.fillStyle = '#1d1a23'
  ctx.font = '700 16px "Noto Sans SC", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('色号清单（用量倒序）', legendX + legendPad, legendY + 20)

  palette.forEach((color, index) => {
    const col = index % legendCols
    const row = Math.floor(index / legendCols)
    const x = legendX + legendPad + col * legendItemW
    const y = legendY + 36 + row * legendItemH
    ctx.fillStyle = color.hex
    ctx.fillRect(x, y + 4, 32, 20)
    ctx.strokeStyle = 'rgba(43, 35, 58, 0.18)'
    ctx.strokeRect(x + 0.5, y + 4.5, 31, 19)
    ctx.fillStyle = isDarkHex(color.hex) ? '#fff' : '#1d1a23'
    ctx.font = '700 10px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(color.code, x + 16, y + 14)
    ctx.fillStyle = '#1d1a23'
    ctx.font = '400 13px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(formatLegendLabel(color), x + 40, y + 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#6f647d'
    ctx.fillText(String(color.count), x + legendItemW - 12, y + 14)
  })

  return canvas
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function App() {
  const [sourceName, setSourceName] = useState('')
  const [sourcePreview, setSourcePreview] = useState('')
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  const [boardRowsInput, setBoardRowsInput] = useState(DEFAULT_GRID_SIZE)
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_SIZE)
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_SIZE)
  const [maxColors, setMaxColors] = useState(MAX_COLOR_LIMIT)
  const [shape, setShape] = useState<BoardShape>('ratio')
  const [renderMode, setRenderMode] = useState<RenderMode>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 620px)').matches ? 'solid' : 'symbols'
  ))
  const {
    pattern,
    palette,
    reset: resetPatternHistory,
    commit: commitPatternHistory,
    undo: undoPatternEdit,
    redo: redoPatternEdit,
    canUndo,
    canRedo,
    setSnapshot: setPatternSnapshot,
  } = usePatternHistory()
  const [previewMode, setPreviewMode] = useState<PreviewMode>('view')
  const [editorTool, setEditorTool] = useState<EditorTool>('paint')
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0)
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false)
  const [replaceFromSymbol, setReplaceFromSymbol] = useState('')
  const [replaceToPaletteIndex, setReplaceToPaletteIndex] = useState(-1)
  const [paletteBrand, setPaletteBrand] = useState<PaletteBrand>(DEFAULT_PALETTE_BRAND)
  const [removeBackground, setRemoveBackground] = useState(true)
  const [cleanupIsolated, setCleanupIsolated] = useState(true)
  const [dither, setDither] = useState<DitherMode>('off')
  const [aiCandidateCount, setAiCandidateCount] = useState(1)
  const [aiFraming, setAiFraming] = useState<AiFraming>('follow')
  const [aiStage, setAiStage] = useState('AI 创作中，完成后将自动量化成拼豆图纸…')
  const [legendExpanded, setLegendExpanded] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [boardConfirm, setBoardConfirm] = useState(false)
  const [exportSheetUrl, setExportSheetUrl] = useState('')
  const isMobile = useMediaQuery('(max-width: 620px)')
  const [aiCandidates, setAiCandidates] = useState<Array<{ url: string; file: File }>>([])
  const [aiCandidateIndex, setAiCandidateIndex] = useState(0)
  const quantizeRef = useRef({ removeBackground: true, cleanupIsolated: true, dither: 'off' as DitherMode })
  const [sourceMode, setSourceMode] = useState<SourceMode>('local')
  const [aiStyleId, setAiStyleId] = useState(AGNES_STYLE_PRESETS[0].id)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiNegativePrompt, setAiNegativePrompt] = useState(DEFAULT_NEGATIVE_PROMPT)
  const [effectReferenceName, setEffectReferenceName] = useState('')
  const [effectReferencePreview, setEffectReferencePreview] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [error, setError] = useState('')
  const [debugMode, setDebugMode] = useState(readDebugModeFromUrl)
  const [debugPrompt, setDebugPrompt] = useState('')
  const [debugAiImageUrl, setDebugAiImageUrl] = useState('')
  const patternRef = useRef<HTMLDivElement>(null)
  const previewPanelRef = useRef<HTMLElement>(null)
  const paperViewportRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const effectReferenceRef = useRef<HTMLInputElement>(null)
  const lastSourceFileRef = useRef<File | null>(null)
  const exportNoticeTimerRef = useRef<number | null>(null)
  const debugAiImageUrlRef = useRef('')
  const effectReferencePreviewRef = useRef('')
  const [paperScale, setPaperScale] = useState(1)

  const activeCells = useMemo(() => pattern.flat().filter((cell) => cell.colorIndex >= 0).length, [pattern])
  const cellSize = renderMode === 'symbols' ? 20 : 14
  const modeLabel = renderMode === 'symbols' ? '色号图纸' : '纯色预览'
  const activePalette = useMemo(() => getPalette(paletteBrand), [paletteBrand])
  const activePaletteColors = useMemo(() => getPaletteColors(paletteBrand), [paletteBrand])
  const activePaletteSize = useMemo(() => getPaletteSize(paletteBrand), [paletteBrand])
  const colorSliderMax = Math.min(activePaletteSize, MAX_COLOR_LIMIT)
  const gridSizeHint = useMemo(() => getGridSizeHint(gridSize), [gridSize])
  const replaceAffectedCount = useMemo(
    () => (replaceFromSymbol ? countCellsWithSymbol(pattern, replaceFromSymbol) : 0),
    [pattern, replaceFromSymbol],
  )

  const isEditing = previewMode === 'edit' && pattern.length > 0
  const activeSelectedPaletteIndex = palette.length
    ? Math.min(Math.max(selectedPaletteIndex, 0), palette.length - 1)
    : 0

  useEffect(() => {
    if (!isEditing) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const meta = event.metaKey || event.ctrlKey
      if (!meta || key !== 'z') return
      event.preventDefault()
      if (event.shiftKey) redoPatternEdit()
      else undoPatternEdit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEditing, undoPatternEdit, redoPatternEdit])

  useEffect(() => {
    if (!pattern.length) return undefined

    const actualWidth = gridCols * cellSize + Math.max(0, gridCols - 1) + 24
    const actualHeight = gridRows * cellSize + Math.max(0, gridRows - 1) + 24

    const updateScales = () => {
      const paperViewport = paperViewportRef.current
      if (paperViewport) {
        const viewportWidth = paperViewport.clientWidth - 48
        const viewportHeight = Math.min(760, Math.max(420, window.innerHeight * 0.72))
        const nextPaperScale = Math.min(1, viewportWidth / actualWidth, viewportHeight / actualHeight)
        setPaperScale(Number.isFinite(nextPaperScale) ? nextPaperScale : 1)
      }
    }

    updateScales()
    const observer = new ResizeObserver(updateScales)
    if (paperViewportRef.current) observer.observe(paperViewportRef.current)
    window.addEventListener('resize', updateScales)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScales)
    }
  }, [pattern, gridCols, gridRows, cellSize])

  useEffect(() => () => {
    if (exportNoticeTimerRef.current) window.clearTimeout(exportNoticeTimerRef.current)
    if (debugAiImageUrlRef.current) URL.revokeObjectURL(debugAiImageUrlRef.current)
    if (effectReferencePreviewRef.current) URL.revokeObjectURL(effectReferencePreviewRef.current)
  }, [])

  useEffect(() => {
    const syncDebugMode = () => setDebugMode(readDebugModeFromUrl())
    window.addEventListener('popstate', syncDebugMode)
    return () => window.removeEventListener('popstate', syncDebugMode)
  }, [])

  function updateDebugAiImage(file: File) {
    if (debugAiImageUrlRef.current) URL.revokeObjectURL(debugAiImageUrlRef.current)
    const url = URL.createObjectURL(file)
    debugAiImageUrlRef.current = url
    setDebugAiImageUrl(url)
  }

  function clearDebugAiImage() {
    if (debugAiImageUrlRef.current) URL.revokeObjectURL(debugAiImageUrlRef.current)
    debugAiImageUrlRef.current = ''
    setDebugAiImageUrl('')
  }


  function clearEffectReference() {
    if (effectReferencePreviewRef.current) URL.revokeObjectURL(effectReferencePreviewRef.current)
    effectReferencePreviewRef.current = ''
    setEffectReferenceName('')
    setEffectReferencePreview('')
    if (effectReferenceRef.current) effectReferenceRef.current.value = ''
  }

  function handleEffectReferenceFile(file?: File) {
    if (!file) return
    if (effectReferencePreviewRef.current) URL.revokeObjectURL(effectReferencePreviewRef.current)
    const url = URL.createObjectURL(file)
    effectReferencePreviewRef.current = url
    setEffectReferenceName(file.name)
    setEffectReferencePreview(url)
  }


  async function generatePattern(
    file: File,
    nextGridSize = gridSize,
    nextMaxColors = maxColors,
    nextShape = shape,
    nextPaletteBrand = paletteBrand,
    options?: { updatePreview?: boolean; sharpQuantize?: boolean },
  ) {
    const updatePreview = options?.updatePreview ?? true
    const sharpQuantize = options?.sharpQuantize ?? false
    const beadPalette = getPaletteColors(nextPaletteBrand)
    setError('')
    setIsProcessing(true)
    lastSourceFileRef.current = file
    try {
      const image = await loadImage(file)
      const quantizeOptions = quantizeRef.current
      const quantized = quantizeToPalette(image, {
        shape: nextShape,
        gridSize: nextGridSize,
        maxColors: nextMaxColors,
        palette: beadPalette,
        edgePriority: sharpQuantize,
        removeBackground: quantizeOptions.removeBackground,
        dither: quantizeOptions.dither,
        cleanupIsolated: quantizeOptions.cleanupIsolated,
      })
      const { cols, rows, selected, assignments } = quantized
      setGridCols(cols)
      setGridRows(rows)
      if (updatePreview) {
        setSourceName(file.name)
        setSourcePreview(URL.createObjectURL(file))
      }
      if (!selected.length) throw new Error('图片内容太少，无法生成图纸')

      const selectedPalette = selected.map((color) => ({
        code: color.code,
        name: color.name,
        hex: color.hex,
        count: 0,
        symbol: color.code,
      }))

      const grid: BeadCell[][] = []
      for (let y = 0; y < rows; y += 1) {
        const row: BeadCell[] = []
        for (let x = 0; x < cols; x += 1) {
          const colorIndex = assignments[y * cols + x]
          if (colorIndex < 0) {
            row.push({
              colorIndex: -1,
              hex: EMPTY_CELL_HEX,
              symbol: '',
            })
            continue
          }
          selectedPalette[colorIndex].count += 1
          row.push({
            colorIndex,
            hex: selectedPalette[colorIndex].hex,
            symbol: selectedPalette[colorIndex].symbol,
          })
        }
        grid.push(row)
      }

      resetPatternHistory({
        pattern: grid,
        palette: selectedPalette.filter((color) => color.count > 0),
      })
      setPreviewMode('view')
      setReplaceFromSymbol('')
      setReplaceToPaletteIndex(-1)
      setSelectedPaletteIndex(0)
      setLegendExpanded(false)
      if (window.matchMedia('(max-width: 620px)').matches) {
        window.requestAnimationFrame(() => previewPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败，请换一张图片试试')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleFile(file?: File) {
    if (!file) return
    if (sourceMode === 'board') {
      setSourceMode('local')
      await generatePattern(file)
      return
    }
    if (sourceMode === 'ai') {
      setSourceName(file.name)
      setSourcePreview(URL.createObjectURL(file))
      setError('')
      return
    }
    await generatePattern(file)
  }

  async function generateWithAi() {
    const refFile = uploadRef.current?.files?.[0]
    if (!refFile) {
      setError('请先上传一张参考图')
      return
    }

    setError('')
    setIsAiGenerating(true)
    try {
      setAiStage('正在准备参考图…')
      const { size, ratio } = await pickAgnesSize(refFile, shape, aiFraming)
      const preparedFile = await prepareReferenceImage(refFile, ratio)
      const effectFile = effectReferenceRef.current?.files?.[0]
      const prompt = buildAgnesPrompt({
        styleId: aiStyleId,
        extraPrompt: aiPrompt,
        gridSize,
        maxColors,
        negativePrompt: aiNegativePrompt,
        hasEffectReference: Boolean(effectFile),
        framing: aiFraming,
      })
      setAiStage('AI 生成中…')
      if (debugMode) {
        setDebugPrompt(prompt)
        clearDebugAiImage()
      }
      const aiFiles = await generateAgnesImages({
        file: preparedFile,
        styleId: aiStyleId,
        extraPrompt: aiPrompt,
        gridSize,
        maxColors,
        size,
        ratio,
        count: aiCandidateCount,
        prompt,
        effectFile,
        framing: aiFraming,
      })
      setAiStage('正在量化成图纸…')
      const candidates = aiFiles.map((file) => ({ url: URL.createObjectURL(file), file }))
      setAiCandidateIndex(0)
      setAiCandidates((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.url))
        return candidates
      })
      if (debugMode) updateDebugAiImage(aiFiles[0])
      const croppedFile = await cropSubjectFromImage(aiFiles[0])
      await generatePattern(croppedFile, gridSize, maxColors, shape, paletteBrand, {
        updatePreview: false,
        sharpQuantize: true,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 生成失败，请稍后重试')
    } finally {
      setIsAiGenerating(false)
    }
  }

  function updateQuantize(partial: Partial<{ removeBackground: boolean; cleanupIsolated: boolean; dither: DitherMode }>) {
    quantizeRef.current = { ...quantizeRef.current, ...partial }
    if (partial.removeBackground !== undefined) setRemoveBackground(partial.removeBackground)
    if (partial.cleanupIsolated !== undefined) setCleanupIsolated(partial.cleanupIsolated)
    if (partial.dither !== undefined) setDither(partial.dither)
    if (sourceMode !== 'board') void regenerate()
  }

  async function applyAiCandidate(index: number) {
    const candidate = aiCandidates[index]
    if (!candidate) return
    setAiCandidateIndex(index)
    if (debugMode) updateDebugAiImage(candidate.file)
    const croppedFile = await cropSubjectFromImage(candidate.file)
    await generatePattern(croppedFile, gridSize, maxColors, shape, paletteBrand, {
      updatePreview: false,
      sharpQuantize: true,
    })
  }

  function handleSelectPaletteColor(index: number) {
    if (index < 0) {
      const entry = activePaletteColors[-(index + 1)]
      if (!entry) return
      const { palette: nextPalette, index: paletteIndex } = ensurePaletteColor(palette, entry)
      setPatternSnapshot({ pattern, palette: nextPalette })
      setSelectedPaletteIndex(paletteIndex)
      setEditorTool('paint')
      return
    }
    setSelectedPaletteIndex(index)
    setEditorTool('paint')
  }

  function handleStrokeComplete(cells: Array<{ x: number; y: number }>, paletteIndex: number | null) {
    const nextPattern = applyStroke(pattern, palette, cells, paletteIndex)
    if (nextPattern === pattern) return
    commitPatternHistory({
      pattern: nextPattern,
      palette: recalculatePaletteCounts(nextPattern, palette),
    })
  }

  function handleApplyColorReplace() {
    if (!replaceFromSymbol || replaceToPaletteIndex < 0) return
    commitPatternHistory(replaceColorGlobally(pattern, palette, replaceFromSymbol, replaceToPaletteIndex))
    setReplaceFromSymbol('')
    setReplaceToPaletteIndex(-1)
    setEditorTool('paint')
  }

  function exitEditMode() {
    setPreviewMode('view')
    setEditorTool('paint')
    setIsColorPickerOpen(false)
    setReplaceFromSymbol('')
    setReplaceToPaletteIndex(-1)
  }

  function enterEditMode() {
    if (!pattern.length) return
    setPreviewMode('edit')
    setEditorTool('paint')
    setIsColorPickerOpen(false)
    setError('')
  }

  function handleEditorToolChange(tool: EditorTool) {
    setEditorTool(tool)
    setIsColorPickerOpen(false)
  }

  function toggleColorPicker() {
    setEditorTool('paint')
    setIsColorPickerOpen((current) => !current)
  }

  function createBoardPattern() {
    const cols = Math.max(1, Math.round(gridSize))
    const rows = Math.max(1, Math.round(boardRowsInput))
    if (pattern.length && !boardConfirm) {
      setBoardConfirm(true)
      return
    }
    setBoardConfirm(false)

    const nextPalette = createBoardStarterPalette(activePaletteColors)
    resetPatternHistory({
      pattern: createBlankPattern(cols, rows),
      palette: nextPalette,
    })
    setGridCols(cols)
    setGridRows(rows)
    setSourceName(`手绘画板-${cols}x${rows}`)
    setSourcePreview('')
    lastSourceFileRef.current = null
    setSelectedPaletteIndex(0)
    setIsColorPickerOpen(false)
    setReplaceFromSymbol('')
    setReplaceToPaletteIndex(-1)
    setRenderMode('symbols')
    setPreviewMode('edit')
    setEditorTool('paint')
    setError('')
  }

  async function regenerate(
    nextGridSize = gridSize,
    nextMaxColors = maxColors,
    nextShape = shape,
    nextPaletteBrand = paletteBrand,
  ) {
    if (previewMode === 'edit' && canUndo) {
      const confirmed = window.confirm('重新生成将覆盖当前编辑，是否继续？')
      if (!confirmed) return
    }
    exitEditMode()
    const file = lastSourceFileRef.current ?? uploadRef.current?.files?.[0]
    if (file) {
      await generatePattern(file, nextGridSize, nextMaxColors, nextShape, nextPaletteBrand, {
        updatePreview: sourceMode !== 'ai',
        sharpQuantize: sourceMode === 'ai',
      })
    }
  }

  function switchPaletteBrand(brand: PaletteBrand) {
    if (brand === paletteBrand) return
    if (previewMode === 'edit') {
      setError('请先完成编辑，再切换色号品牌')
      return
    }
    const nextMaxColors = Math.min(maxColors, getPaletteSize(brand), MAX_COLOR_LIMIT)
    setPaletteBrand(brand)
    setMaxColors(nextMaxColors)
    void regenerate(gridSize, nextMaxColors, shape, brand)
  }

  async function exportPng() {
    if (!pattern.length || isExporting) return
    setIsExporting(true)
    setExportNotice('')
    const startedAt = Date.now()
    try {
      await document.fonts.ready
      const exportPalette = [...palette]
        .filter((color) => color.count > 0)
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      const canvas = limitExportCanvas(buildPatternExportCanvas(pattern, exportPalette, gridCols, gridRows, renderMode, activeCells), isMobile ? 4096 : 8192)
      const blob = await canvasToBlob(canvas)
      const filename = `拼豆图纸-${sanitizeExportFilename(sourceName)}.png`
      if (isMobile) {
        const file = new File([blob], filename, { type: 'image/png' })
        const shareData = { files: [file], title: filename }
        if (typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData)
            setExportNotice('请在分享面板中选择“存储图像”保存到相册')
            return
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') return
          }
        }
        if (exportSheetUrl) URL.revokeObjectURL(exportSheetUrl)
        setExportSheetUrl(URL.createObjectURL(blob))
        return
      }
      saveAs(blob, filename)
      setExportNotice('PNG 已开始下载')
      if (exportNoticeTimerRef.current) window.clearTimeout(exportNoticeTimerRef.current)
      exportNoticeTimerRef.current = window.setTimeout(() => setExportNotice(''), 2800)
    } catch (cause) {
      setError(`导出失败：${formatExportError(cause)}`)
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < 600) await new Promise((resolve) => window.setTimeout(resolve, 600 - elapsed))
      setIsExporting(false)
    }
  }

  function switchSourceMode(mode: SourceMode) {
    setSourceMode(mode)
    if (mode === 'ai') {
      setGridSize((current) => (current > AI_GRID_RECOMMEND_MAX ? AI_DEFAULT_GRID_SIZE : current))
    }
  }

  function renderGrid() {
    return (
      <div
        className={`pattern-grid ${renderMode} actual-grid`}
        style={{
          gridTemplateColumns: `repeat(${gridCols}, ${cellSize}px)`,
          ['--grid-ratio' as string]: `${gridCols} / ${gridRows}`,
          ['--cell-font' as string]: '9px',
        }}
      >
        {pattern.flat().map((cell, index) => (
          <span
            key={`${index}-${cell.symbol}`}
            style={{ background: cell.hex, color: cell.colorIndex >= 0 && isDarkHex(cell.hex) ? '#fff' : '#1d1a23' }}
          >
            {renderMode === 'symbols' && cell.colorIndex >= 0 ? cell.symbol : ''}
          </span>
        ))}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={16} /> Perler Beads Pattern Maker</div>
          <h1>上传图片，一键生成可打印拼豆图纸</h1>
          <p>支持本地转换、AI 创作与空白画板：上传图片可直接量化，也可以从指定尺寸开始手动绘制拼豆图纸。</p>
          <div className="hero-actions">
            <button className="primary-btn" type="button" onClick={() => sourceMode === 'board' ? createBoardPattern() : uploadRef.current?.click()}>
              {sourceMode === 'board' ? <Pencil size={18} /> : <ImageUp size={18} />}
              {sourceMode === 'board' ? '创建画板' : '上传图片'}
            </button>
            <button className="ghost-btn desktop-only" type="button" onClick={() => window.print()} disabled={!pattern.length}>
              <Printer size={18} /> 打印图纸
            </button>
          </div>
        </div>
        <div className="hero-side-panel" aria-label="拼豆介绍与推广">
          <HeroCarousel paletteColors={activePaletteColors} />
          <a className="ad-bar" href={PROMO_AD_URL} target="_blank" rel="noopener noreferrer">
            推荐：融豆拼拼 2.6mm 融合豆全色套装 →
          </a>
        </div>
      </section>

      <section className={`workspace ${isEditing ? 'editing' : ''}`}>
        <aside className="panel controls-panel">
          <div className="source-block">
          <div className="segmented mode-tabs source-mode-tabs" role="group" aria-label="生成方式">
            <button className={sourceMode === 'local' ? 'active' : ''} onClick={() => switchSourceMode('local')} type="button">本地转换</button>
            <button className={sourceMode === 'ai' ? 'active' : ''} onClick={() => switchSourceMode('ai')} type="button">AI 生成</button>
            <button className={sourceMode === 'board' ? 'active' : ''} onClick={() => switchSourceMode('board')} type="button">画板绘制</button>
          </div>

          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
          <input ref={effectReferenceRef} type="file" accept="image/*" hidden onChange={(event) => handleEffectReferenceFile(event.target.files?.[0])} />
          {sourceMode !== 'board' ? (
            <button className="upload-zone" type="button" onClick={() => uploadRef.current?.click()}>
              {sourcePreview ? <img src={sourcePreview} alt="上传预览" /> : <ImageUp size={34} />}
              <span>{sourcePreview ? sourceName : '选择一张图片'}</span>
              <small>{sourceMode === 'ai' ? '上传参考图，AI 将聚焦主体并简化背景' : '按原图比例完整预览，不裁切'}</small>
            </button>
          ) : (
            <div className="board-panel">
              <div className="board-panel-head">
                <strong>空白画板</strong>
                <span>选择宽高后进入编辑器，像素格就是拼豆位置</span>
              </div>
              <label>
                <span>画板高度 <b>{boardRowsInput} 格</b></span>
                <input type="range" min="8" max="208" step="1" value={boardRowsInput} onChange={(event) => setBoardRowsInput(Number(event.target.value))} />
              </label>
              <div className="board-size-presets" aria-label="常用画板高度">
                {BOARD_QUICK_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={boardRowsInput === size ? 'active' : ''}
                    onClick={() => setBoardRowsInput(size)}
                  >
                    {size} 格
                  </button>
                ))}
              </div>
              {boardConfirm && <p className="board-confirm">创建新画板将清空当前图纸。</p>}
              <div className="board-create-actions">
                <button type="button" className="primary-btn board-create-btn" onClick={createBoardPattern}>
                  <Pencil size={18} /> {boardConfirm ? '确认创建' : '创建并开始绘制'}
                </button>
                {boardConfirm && <button type="button" onClick={() => setBoardConfirm(false)}>取消</button>}
              </div>
              <small>进入画板后可使用画笔、橡皮、移动、撤销/重做和批量换色。</small>
            </div>
          )}

          {sourceMode === 'ai' && (
            <div className="ai-panel">
              <div className="ai-panel-head">
                <span>AI 风格</span>
                <small>选择风格后一键生成</small>
              </div>
              <div className="style-grid">
                {AGNES_STYLE_PRESETS.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className={`style-card ${aiStyleId === style.id ? 'active' : ''}`}
                    onClick={() => setAiStyleId(style.id)}
                  >
                    <strong>{style.label}</strong>
                    <span>{style.description}</span>
                  </button>
                ))}
              </div>
              <div className="effect-reference-panel">
                <button className="effect-reference-upload" type="button" onClick={() => effectReferenceRef.current?.click()}>
                  {effectReferencePreview ? <img src={effectReferencePreview} alt="效果参考图预览" /> : <ImageUp size={24} />}
                  <span>{effectReferenceName || '添加效果参考图（选填）'}</span>
                  <small>只参考风格、色块、轮廓和简化程度，不作为主体</small>
                </button>
                {effectReferencePreview && (
                  <button className="ghost-btn effect-reference-clear" type="button" onClick={clearEffectReference}>
                    移除效果参考图
                  </button>
                )}
              </div>
              <label className="ai-prompt-field">
                <span>补充描述（选填）</span>
                <textarea
                  className="ai-prompt-input"
                  rows={3}
                  placeholder="例如：放大主体、减少留白；只要人物、不要背景文字"
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                />
              </label>
              <div className="segmented" role="group" aria-label="构图">
                {AI_FRAMING_OPTIONS.map((option) => (
                  <button key={option.id} className={aiFraming === option.id ? 'active' : ''} onClick={() => setAiFraming(option.id)} type="button">{option.label}</button>
                ))}
              </div>
              <div className="segmented" role="group" aria-label="AI 候选数量">
                {[1, 2, 3, 4].map((count) => (
                  <button key={count} className={aiCandidateCount === count ? 'active' : ''} onClick={() => setAiCandidateCount(count)} type="button">{count} 张</button>
                ))}
              </div>
              <label className="ai-prompt-field">
                <span>补充指令</span>
                <textarea
                  className="ai-prompt-input"
                  rows={2}
                  placeholder="例如：换成纯白背景、去掉文字和水印"
                  value={aiNegativePrompt}
                  onChange={(event) => setAiNegativePrompt(event.target.value)}
                />
              </label>
              <button
                className="primary-btn ai-generate-btn"
                type="button"
                onClick={() => void generateWithAi()}
                disabled={!sourcePreview || isAiGenerating || isProcessing}
              >
                {isAiGenerating ? <LoaderCircle className="spin-icon" size={18} /> : <WandSparkles size={18} />}
                {isAiGenerating ? 'AI 生成中…' : 'AI 生成拼豆图'}
              </button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          </div>

          <div className="settings-block">
          <label>
            <span>
              {sourceMode === 'board' ? '画板宽度' : '图纸宽度'} <b>{gridSize} 格</b>
              <small className="control-hint"> {gridSizeHint}{sourceMode === 'ai' ? '；AI 推荐约 52 格' : ''}{sourceMode === 'board' ? '；创建后可手动绘制' : ''}</small>
            </span>
            <input type="range" min="24" max="208" step="4" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} onPointerUp={(event) => {
              if (sourceMode !== 'board') void regenerate(Number(event.currentTarget.value), maxColors, shape)
            }} onKeyUp={(event) => {
              if (sourceMode !== 'board') void regenerate(Number(event.currentTarget.value), maxColors, shape)
            }} />
            <div className="quick-size-grid" aria-label={sourceMode === 'board' ? '常用画板宽度' : '常用图纸宽度'}>
              {QUICK_GRID_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={gridSize === size ? 'active' : ''}
                  onClick={() => {
                    setGridSize(size)
                    if (sourceMode !== 'board') void regenerate(size, maxColors, shape)
                  }}
                >
                  {size} 格
                </button>
              ))}
            </div>
          </label>

          {sourceMode !== 'board' && (
            <>
              <label>
                <span>最大颜色数 <b>{maxColors}</b></span>
                <input type="range" min="4" max={colorSliderMax} step="1" value={maxColors} onChange={(event) => setMaxColors(Number(event.target.value))} onPointerUp={(event) => {
                  void regenerate(gridSize, Number(event.currentTarget.value), shape)
                }} onKeyUp={(event) => {
                  void regenerate(gridSize, Number(event.currentTarget.value), shape)
                }} />
              </label>

              <details className="advanced-panel">
                <summary>更多设置</summary>
              <label>
                <span>色卡 <b>{activePalette.label}</b></span>
                <div className="segmented" role="group" aria-label="色卡">
                  <button className={paletteBrand === 'mard' ? 'active' : ''} onClick={() => switchPaletteBrand('mard')} type="button">MARD（国产）</button>
                  <button className={paletteBrand === 'hama' ? 'active' : ''} onClick={() => switchPaletteBrand('hama')} type="button">Hama</button>
                </div>
              </label>
              <div className="segmented" role="group" aria-label="图纸形状">
                <button className={shape === 'ratio' ? 'active' : ''} onClick={() => { setShape('ratio'); void regenerate(gridSize, maxColors, 'ratio') }} type="button">按原图比例</button>
                <button className={shape === 'square' ? 'active' : ''} onClick={() => { setShape('square'); void regenerate(gridSize, maxColors, 'square') }} type="button">方形 · 左上裁剪</button>
              </div>
              <details className="advanced-panel">
                <summary>高级量化</summary>
                <label className="check-row">
                  <input type="checkbox" checked={removeBackground} onChange={(event) => updateQuantize({ removeBackground: event.target.checked })} />
                  去掉连通的纯色背景
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={cleanupIsolated} onChange={(event) => updateQuantize({ cleanupIsolated: event.target.checked })} />
                  清理孤立豆
                </label>
                <div className="advanced-dither">
                  <span>渐变抖动</span>
                  <div className="segmented">
                    <button className={dither === 'off' ? 'active' : ''} onClick={() => updateQuantize({ dither: 'off' })} type="button">关</button>
                    <button className={dither === 'light' ? 'active' : ''} onClick={() => updateQuantize({ dither: 'light' })} type="button">弱</button>
                    <button className={dither === 'medium' ? 'active' : ''} onClick={() => updateQuantize({ dither: 'medium' })} type="button">中</button>
                  </div>
                </div>
              </details>
              </details>
            </>
          )}

          {sourceMode === 'board' && (
            <label>
              <span>色卡 <b>{activePalette.label}</b></span>
              <div className="segmented" role="group" aria-label="色卡">
                <button className={paletteBrand === 'mard' ? 'active' : ''} onClick={() => switchPaletteBrand('mard')} type="button">MARD（国产）</button>
                <button className={paletteBrand === 'hama' ? 'active' : ''} onClick={() => switchPaletteBrand('hama')} type="button">Hama</button>
              </div>
            </label>
          )}

          <div className="action-grid">
            {sourceMode === 'board' ? (
              <button type="button" onClick={createBoardPattern}><RotateCcw size={17} /> 新建画板</button>
            ) : (
              <button type="button" onClick={() => void regenerate()} disabled={!sourcePreview || isProcessing || isAiGenerating}><RotateCcw size={17} /> 重新生成</button>
            )}
            <button type="button" onClick={enterEditMode} disabled={!pattern.length || isEditing}>
              <Pencil size={17} /> 编辑图纸
            </button>
            <button type="button" className="action-history-btn desktop-only" onClick={undoPatternEdit} disabled={!canUndo}>
              <Undo2 size={17} /> 撤销
            </button>
            <button type="button" className="action-history-btn desktop-only" onClick={redoPatternEdit} disabled={!canRedo}>
              <Redo2 size={17} /> 重做
            </button>
            <button type="button" className="action-export-btn" onClick={() => void exportPng()} disabled={!pattern.length || isExporting}>
              {isExporting ? <LoaderCircle className="spin-icon" size={17} /> : <Download size={17} />}
              {isExporting ? '导出中...' : '导出 PNG'}
            </button>
          </div>
          </div>
        </aside>

        <section className={`panel preview-panel ${isEditing ? 'editing-active' : ''}`} ref={previewPanelRef}>
          <div className="section-title">
            <div><Grid3X3 size={18} /> {isEditing ? '图纸编辑' : '图纸预览'}</div>
            <span>{pattern.length ? `${gridCols}×${gridRows} · ${activeCells} 颗豆 · ${palette.length} 色` : (sourceMode === 'board' ? '等待创建画板' : '等待上传')}</span>
            {pattern.length > 0 && (
              <div className="preview-mode-tabs">
                <button type="button" className={renderMode === 'symbols' ? 'active' : ''} onClick={() => setRenderMode('symbols')}>色号</button>
                <button type="button" className={renderMode === 'solid' ? 'active' : ''} onClick={() => setRenderMode('solid')}>纯色</button>
                {!isEditing && <button type="button" onClick={() => setZoomOpen(true)}>放大</button>}
                <button type="button" className={previewMode === 'view' ? 'active' : ''} onClick={exitEditMode}>预览</button>
                <button type="button" className={previewMode === 'edit' ? 'active' : ''} onClick={enterEditMode}>编辑</button>
              </div>
            )}
          </div>

          {pattern.length > 0 && !isEditing && (
            <div className="result-summary" aria-label="图纸摘要">
              <div>
                <small>尺寸</small>
                <strong>{gridCols} × {gridRows}</strong>
                <span>按当前宽度生成</span>
              </div>
              <div>
                <small>豆数</small>
                <strong>{activeCells.toLocaleString()}</strong>
                <span>预计用豆总量</span>
              </div>
              <div>
                <small>颜色</small>
                <strong>{palette.length}</strong>
                <span>已匹配 {activePalette.label} 色号</span>
              </div>
              <div>
                <small>模式</small>
                <strong>{modeLabel}</strong>
                <span>{Math.round(paperScale * 100)}% 适配显示</span>
              </div>
            </div>
          )}

          <div className={`pattern-paper ${isEditing ? 'editing' : ''}`} ref={patternRef}>
            {pattern.length ? (
              !isEditing ? (
                <>
                  <div className="paper-header">
                    <div>
                      <strong>整体图纸</strong>
                      <span>已缩放到当前区域，完整查看构图</span>
                    </div>
                    <b>{Math.round(paperScale * 100)}%</b>
                  </div>
                  <div className="paper-overview" ref={paperViewportRef}>
                    <div
                      className="print-pattern-wrap"
                      style={{ ['--paper-scale' as string]: paperScale }}
                    >
                      {renderGrid()}
                    </div>
                  </div>
                  {aiCandidates.length > 1 && (
                    <div className="ai-candidates preview-candidates">
                      {aiCandidates.map((candidate, index) => (
                        <button key={candidate.url} type="button" className={index === aiCandidateIndex ? 'active' : ''} onClick={() => void applyAiCandidate(index)}>
                          <img src={candidate.url} alt={`候选 ${index + 1}`} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="legend">
                    {(isMobile && !legendExpanded ? palette.slice(0, 8) : palette).map((color) => (
                      <div className="legend-item" key={color.symbol}>
                        <i style={{ background: color.hex, color: isDarkHex(color.hex) ? '#fff' : '#17131f' }}>{color.symbol}</i>
                        <span>{formatLegendLabel(color)}</span>
                        <b>{color.count}</b>
                      </div>
                    ))}
                  </div>
                  {isMobile && palette.length > 8 && (
                    <button className="ghost-btn legend-toggle" type="button" onClick={() => setLegendExpanded((current) => !current)}>
                      {legendExpanded ? '收起色号' : `查看全部 ${palette.length} 色`}
                    </button>
                  )}
                </>
              ) : (
                <PatternEditor
                  pattern={pattern}
                  palette={palette}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  cellSize={cellSize}
                  renderMode={renderMode}
                  tool={editorTool}
                  selectedPaletteIndex={activeSelectedPaletteIndex}
                  colorPickerOpen={isColorPickerOpen}
                  brandColors={activePaletteColors}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  replaceFromSymbol={replaceFromSymbol}
                  replaceToPaletteIndex={replaceToPaletteIndex}
                  replaceAffectedCount={replaceAffectedCount}
                  onStrokeComplete={handleStrokeComplete}
                  onColorPickerToggle={toggleColorPicker}
                  onToolChange={handleEditorToolChange}
                  onUndo={undoPatternEdit}
                  onRedo={redoPatternEdit}
                  onExit={exitEditMode}
                  onSelectPaletteColor={handleSelectPaletteColor}
                  onCloseColorPicker={() => setIsColorPickerOpen(false)}
                  onReplaceFromSymbolChange={setReplaceFromSymbol}
                  onReplaceToPaletteIndexChange={setReplaceToPaletteIndex}
                  onApplyColorReplace={handleApplyColorReplace}
                />
              )
            ) : (
              <div className="empty-state">
                {sourceMode === 'board' ? <Pencil size={38} /> : <Info size={38} />}
                <h2>{sourceMode === 'board' ? '创建空白画板' : '从一张图开始'}</h2>
                <p>{sourceMode === 'board' ? '选择宽高后创建画板，使用画笔和色卡手动绘制每一颗拼豆。' : '这里会生成类似拼豆图纸的编号网格：每个格子代表一颗豆，底部清单统计每种颜色需要的数量。'}</p>
              </div>
            )}
          </div>
        </section>
      </section>

      {isAiGenerating && (
        <div className="export-loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="export-loading-card">
            <div className="export-spinner" aria-hidden="true">
              <LoaderCircle size={30} />
            </div>
            <strong>AI 正在生成图片</strong>
            <span>{aiStage}</span>
          </div>
        </div>
      )}

      {isExporting && (
        <div className="export-loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="export-loading-card">
            <div className="export-spinner" aria-hidden="true">
              <LoaderCircle size={30} />
            </div>
            <strong>正在导出 PNG</strong>
            <span>高清图纸生成中，请稍等一下…</span>
          </div>
        </div>
      )}

      {pattern.length > 0 && !isEditing && (
        <div className="mobile-action-bar">
          <button type="button" onClick={() => void regenerate()} disabled={!sourcePreview || isProcessing || isAiGenerating}>重新生成</button>
          <button type="button" onClick={enterEditMode}>编辑</button>
          <button type="button" onClick={() => void exportPng()} disabled={isExporting}>保存到相册</button>
        </div>
      )}

      {zoomOpen && pattern.length > 0 && (
        <div className="zoom-sheet" role="dialog" aria-label="放大查看图纸">
          <header>
            <strong>放大查看</strong>
            <button type="button" onClick={() => setZoomOpen(false)}>关闭</button>
          </header>
          <PatternZoomView pattern={pattern} gridCols={gridCols} gridRows={gridRows} cellSize={cellSize} renderMode={renderMode} />
        </div>
      )}

      {exportSheetUrl && (
        <div className="export-sheet" role="dialog" aria-label="保存到相册">
          <img src={exportSheetUrl} alt="拼豆图纸，长按可保存到相册" />
          <p>长按图片，选择“保存到相册”</p>
          <div className="export-sheet-actions">
            <button type="button" onClick={() => saveAs(exportSheetUrl, `拼豆图纸-${sanitizeExportFilename(sourceName)}.png`)}>下载文件</button>
            <button type="button" onClick={() => { URL.revokeObjectURL(exportSheetUrl); setExportSheetUrl('') }}>关闭</button>
          </div>
        </div>
      )}

      {exportNotice && (
        <div className="export-toast" role="status" aria-live="polite">
          {exportNotice}
        </div>
      )}

      {debugMode && (
        <details className="debug-panel" open>
          <summary>AI 调试模式</summary>
          <div className="debug-content">
            <section>
              <h2>AI 完整提示词{debugPrompt ? ` · ${debugPrompt.length} 字` : ''}</h2>
              {debugPrompt ? (
                <pre>{debugPrompt}</pre>
              ) : (
                <p>生成一次 AI 拼豆图后会显示本次请求使用的完整提示词。</p>
              )}
            </section>
            <section>
              <h2>AI 生成原图</h2>
              {debugAiImageUrl ? (
                <img src={debugAiImageUrl} alt="AI 生成原图（裁切前）" />
              ) : (
                <p>生成完成后会显示裁切和量化前的 AI 原图。</p>
              )}
            </section>
          </div>
        </details>
      )}

      <footer className="site-footer">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          京ICP备2024067456号-3
        </a>
      </footer>
    </main>
  )
}

export default App
