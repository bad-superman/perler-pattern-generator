import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Grid3X3, ImageUp, Info, LoaderCircle, Printer, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import { saveAs } from 'file-saver'
import { generateAgnesImage, pickAgnesSize } from './agnes/client'
import { cropSubjectFromImage } from './agnes/cropSubject'
import { AGNES_STYLE_PRESETS } from './agnes/styles'
import {
  DEFAULT_PALETTE_BRAND,
  getPalette,
  getPaletteColors,
  getPaletteSize,
  type BeadPaletteEntry,
  type PaletteBrand,
} from './palettes'
import './App.css'

interface PaletteColor {
  code: string
  name: string
  hex: string
  count: number
  symbol: string
}

interface BeadCell {
  colorIndex: number
  hex: string
  symbol: string
}

type BoardShape = 'ratio' | 'square'
type RenderMode = 'symbols' | 'solid'
type SourceMode = 'local' | 'ai'

const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789◆●■▲★✦✚✕⬟⬢'
const AI_DEFAULT_GRID_SIZE = 48
const AI_GRID_RECOMMEND_MAX = 56

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function nearestPaletteColor(r: number, g: number, b: number, palette: readonly BeadPaletteEntry[]) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  palette.forEach(([, , hex], index) => {
    const color = hexToRgb(hex)
    const distance = (r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
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

function fitGridToImage(image: HTMLImageElement, longSide: number, shape: BoardShape) {
  if (shape === 'square') return { cols: longSide, rows: longSide }
  if (image.width >= image.height) {
    return { cols: longSide, rows: Math.max(1, Math.round((longSide * image.height) / image.width)) }
  }
  return { cols: Math.max(1, Math.round((longSide * image.width) / image.height)), rows: longSide }
}

function isDarkHex(hex: string) {
  return Number.parseInt(hex.slice(1), 16) < 0x777777
}

function formatLegendLabel(color: Pick<PaletteColor, 'code' | 'name'>) {
  return color.name ? `${color.code} ${color.name}` : color.code
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

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成 PNG'))
    }, type)
  })
}

function buildPatternExportCanvas(
  pattern: BeadCell[][],
  palette: PaletteColor[],
  gridCols: number,
  gridRows: number,
  renderMode: RenderMode,
  activeCells: number,
) {
  const exportCell = 16
  const gap = 1
  const gridPad = 12
  const gridInnerW = gridCols * exportCell + Math.max(0, gridCols - 1) * gap
  const gridInnerH = gridRows * exportCell + Math.max(0, gridRows - 1) * gap
  const gridW = gridInnerW + gridPad * 2
  const gridH = gridInnerH + gridPad * 2

  const legendCols = Math.min(4, Math.max(1, palette.length))
  const legendRows = Math.ceil(palette.length / legendCols)
  const legendItemW = 220
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
      if (renderMode === 'symbols') {
        ctx.fillStyle = isDarkHex(cell.hex) ? '#fff' : '#1d1a23'
        ctx.font = `700 ${Math.max(8, Math.floor(exportCell * 0.55))}px "Noto Sans SC", sans-serif`
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
  ctx.fillText('色号清单', legendX + legendPad, legendY + 20)

  palette.forEach((color, index) => {
    const col = index % legendCols
    const row = Math.floor(index / legendCols)
    const x = legendX + legendPad + col * legendItemW
    const y = legendY + 36 + row * legendItemH
    ctx.fillStyle = color.hex
    ctx.fillRect(x, y + 4, 20, 20)
    ctx.strokeStyle = 'rgba(43, 35, 58, 0.18)'
    ctx.strokeRect(x + 0.5, y + 4.5, 19, 19)
    ctx.fillStyle = isDarkHex(color.hex) ? '#fff' : '#1d1a23'
    ctx.font = '700 11px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(color.symbol, x + 10, y + 14)
    ctx.fillStyle = '#1d1a23'
    ctx.font = '400 13px "Noto Sans SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(formatLegendLabel(color), x + 28, y + 14)
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
  const [gridSize, setGridSize] = useState(64)
  const [gridCols, setGridCols] = useState(64)
  const [gridRows, setGridRows] = useState(64)
  const [maxColors, setMaxColors] = useState(24)
  const [shape, setShape] = useState<BoardShape>('ratio')
  const [renderMode, setRenderMode] = useState<RenderMode>('symbols')
  const [pattern, setPattern] = useState<BeadCell[][]>([])
  const [palette, setPalette] = useState<PaletteColor[]>([])
  const [paletteBrand, setPaletteBrand] = useState<PaletteBrand>(DEFAULT_PALETTE_BRAND)
  const [sourceMode, setSourceMode] = useState<SourceMode>('local')
  const [aiStyleId, setAiStyleId] = useState(AGNES_STYLE_PRESETS[0].id)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [error, setError] = useState('')
  const patternRef = useRef<HTMLDivElement>(null)
  const paperViewportRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const lastSourceFileRef = useRef<File | null>(null)
  const exportNoticeTimerRef = useRef<number | null>(null)
  const [paperScale, setPaperScale] = useState(1)

  const activeCells = useMemo(() => pattern.flat().filter((cell) => cell.colorIndex >= 0).length, [pattern])
  const cellSize = renderMode === 'symbols' ? 20 : 14
  const modeLabel = renderMode === 'symbols' ? '符号图纸' : '纯色预览'
  const activePalette = useMemo(() => getPalette(paletteBrand), [paletteBrand])
  const activePaletteColors = useMemo(() => getPaletteColors(paletteBrand), [paletteBrand])
  const activePaletteSize = useMemo(() => getPaletteSize(paletteBrand), [paletteBrand])

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
  }, [])


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
      const { cols, rows } = fitGridToImage(image, nextGridSize, nextShape)
      setGridCols(cols)
      setGridRows(rows)
      if (updatePreview) {
        setSourceName(file.name)
        setSourcePreview(URL.createObjectURL(file))
      }

      const canvas = document.createElement('canvas')
      canvas.width = cols
      canvas.height = rows
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('浏览器不支持 Canvas')

      ctx.imageSmoothingEnabled = !sharpQuantize
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, cols, rows)
      const imageData = ctx.getImageData(0, 0, cols, rows)

      const sampled: number[] = []
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const offset = (y * cols + x) * 4
          if (imageData.data[offset + 3] < 80) continue
          sampled.push(nearestPaletteColor(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], beadPalette))
        }
      }

      const frequency = new Map<number, number>()
      sampled.forEach((index) => frequency.set(index, (frequency.get(index) ?? 0) + 1))
      const selected = [...frequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, nextMaxColors)
        .map(([index]) => index)
      if (!selected.length) throw new Error('图片内容太少，无法生成图纸')

      const selectedPalette = selected.map((paletteIndex, index) => ({
        code: beadPalette[paletteIndex][0],
        name: beadPalette[paletteIndex][1],
        hex: beadPalette[paletteIndex][2],
        count: 0,
        symbol: SYMBOLS[index] ?? String(index + 1),
      }))

      const selectedColors = selected.map((index) => beadPalette[index])
      const grid: BeadCell[][] = []
      for (let y = 0; y < rows; y += 1) {
        const row: BeadCell[] = []
        for (let x = 0; x < cols; x += 1) {
          const offset = (y * cols + x) * 4
          const originalNearest = nearestPaletteColor(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], selectedColors)
          selectedPalette[originalNearest].count += 1
          row.push({
            colorIndex: originalNearest,
            hex: selectedPalette[originalNearest].hex,
            symbol: selectedPalette[originalNearest].symbol,
          })
        }
        grid.push(row)
      }

      setPalette(selectedPalette.filter((color) => color.count > 0))
      setPattern(grid)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败，请换一张图片试试')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleFile(file?: File) {
    if (!file) return
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
      const size = await pickAgnesSize(refFile, shape)
      const aiFile = await generateAgnesImage({
        file: refFile,
        styleId: aiStyleId,
        extraPrompt: aiPrompt,
        size,
      })
      const croppedFile = await cropSubjectFromImage(aiFile)
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

  async function regenerate(
    nextGridSize = gridSize,
    nextMaxColors = maxColors,
    nextShape = shape,
    nextPaletteBrand = paletteBrand,
  ) {
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
    const nextMaxColors = Math.min(maxColors, getPaletteSize(brand))
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
      const canvas = buildPatternExportCanvas(pattern, palette, gridCols, gridRows, renderMode, activeCells)
      const blob = await canvasToBlob(canvas)
      saveAs(blob, `拼豆图纸-${sanitizeExportFilename(sourceName)}.png`)
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
            style={{ background: cell.hex, color: isDarkHex(cell.hex) ? '#fff' : '#1d1a23' }}
          >
            {renderMode === 'symbols' ? cell.symbol : ''}
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
          <p>支持本地转换与 AI 创作两种方式：上传图片后可直接量化，或由 AI 生成更适合拼豆的中间图。</p>
          <div className="hero-actions">
            <button className="primary-btn" type="button" onClick={() => uploadRef.current?.click()}>
              <ImageUp size={18} /> 上传图片
            </button>
            <button className="ghost-btn" type="button" onClick={() => window.print()} disabled={!pattern.length}>
              <Printer size={18} /> 打印图纸
            </button>
          </div>
        </div>
        <div className="sample-card" aria-label="拼豆说明">
          <div className="mini-board">
            {Array.from({ length: 100 }).map((_, index) => <span key={index} style={{ background: activePaletteColors[(index * 7) % activePaletteColors.length][2] }} />)}
          </div>
          <p><strong>拼豆是什么？</strong>把小塑料管按图纸摆到底盘上，再隔着助烫纸熨烫定型，像年轻人的像素版十字绣。</p>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="segmented mode-tabs">
            <button className={sourceMode === 'local' ? 'active' : ''} onClick={() => switchSourceMode('local')} type="button">本地转换</button>
            <button className={sourceMode === 'ai' ? 'active' : ''} onClick={() => switchSourceMode('ai')} type="button">AI 生成</button>
          </div>

          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
          <button className="upload-zone" type="button" onClick={() => uploadRef.current?.click()}>
            {sourcePreview ? <img src={sourcePreview} alt="上传预览" /> : <ImageUp size={34} />}
            <span>{sourcePreview ? sourceName : '选择一张图片'}</span>
            <small>{sourceMode === 'ai' ? '上传参考图，AI 将聚焦主体并简化背景' : '按原图比例完整预览，不裁切'}</small>
          </button>

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

          <label>
            <span>
              图纸精度 <b>最长边 {gridSize} 格</b>
              {sourceMode === 'ai' && <small className="control-hint"> AI 推荐 32–56 格，主体更清晰</small>}
            </span>
            <input type="range" min="24" max="128" step="4" value={gridSize} onChange={(event) => {
              const value = Number(event.target.value)
              setGridSize(value)
              void regenerate(value, maxColors, shape)
            }} />
          </label>

          <label>
            <span>色卡 <b>{activePalette.label}</b></span>
            <div className="segmented">
              <button className={paletteBrand === 'mard' ? 'active' : ''} onClick={() => switchPaletteBrand('mard')} type="button">MARD（国产）</button>
              <button className={paletteBrand === 'hama' ? 'active' : ''} onClick={() => switchPaletteBrand('hama')} type="button">Hama</button>
            </div>
          </label>

          <label>
            <span>最大颜色数 <b>{maxColors}</b></span>
            <input type="range" min="4" max={activePaletteSize} step="1" value={maxColors} onChange={(event) => {
              const value = Number(event.target.value)
              setMaxColors(value)
              void regenerate(gridSize, value, shape)
            }} />
          </label>

          <div className="segmented">
            <button className={shape === 'ratio' ? 'active' : ''} onClick={() => { setShape('ratio'); void regenerate(gridSize, maxColors, 'ratio') }} type="button">按原图比例</button>
            <button className={shape === 'square' ? 'active' : ''} onClick={() => { setShape('square'); void regenerate(gridSize, maxColors, 'square') }} type="button">方形图纸</button>
          </div>

          <div className="segmented">
            <button className={renderMode === 'symbols' ? 'active' : ''} onClick={() => setRenderMode('symbols')} type="button">符号图纸</button>
            <button className={renderMode === 'solid' ? 'active' : ''} onClick={() => setRenderMode('solid')} type="button">纯色预览</button>
          </div>

          <div className="action-grid">
            <button type="button" onClick={() => void regenerate()} disabled={!sourcePreview || isProcessing || isAiGenerating}><RotateCcw size={17} /> 重新生成</button>
            <button type="button" onClick={() => void exportPng()} disabled={!pattern.length || isExporting}>
              {isExporting ? <LoaderCircle className="spin-icon" size={17} /> : <Download size={17} />}
              {isExporting ? '导出中...' : '导出 PNG'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </aside>

        <section className="panel preview-panel">
          <div className="section-title">
            <div><Grid3X3 size={18} /> 图纸预览</div>
            <span>{activeCells ? `${gridCols}×${gridRows} · ${activeCells} 颗豆 · ${palette.length} 色` : '等待上传'}</span>
          </div>

          {pattern.length > 0 && (
            <div className="result-summary" aria-label="图纸摘要">
              <div>
                <small>尺寸</small>
                <strong>{gridCols} × {gridRows}</strong>
                <span>按当前图纸精度生成</span>
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

          <div className="pattern-paper" ref={patternRef}>
            {pattern.length ? (
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
                <div className="legend">
                  {palette.map((color) => (
                    <div className="legend-item" key={color.symbol}>
                      <i style={{ background: color.hex }}>{color.symbol}</i>
                      <span>{formatLegendLabel(color)}</span>
                      <b>{color.count}</b>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Info size={38} />
                <h2>从一张图开始</h2>
                <p>这里会生成类似拼豆图纸的编号网格：每个格子代表一颗豆，底部清单统计每种颜色需要的数量。</p>
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
            <span>AI 创作中，完成后将自动量化成拼豆图纸…</span>
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

      {exportNotice && (
        <div className="export-toast" role="status" aria-live="polite">
          {exportNotice}
        </div>
      )}
    </main>
  )
}

export default App
