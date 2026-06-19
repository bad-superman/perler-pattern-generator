import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Grid3X3, ImageUp, Info, LoaderCircle, Printer, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import { toPng } from 'html-to-image'
import { saveAs } from 'file-saver'
import { generateAgnesImage, pickAgnesSize } from './agnes/client'
import { AGNES_STYLE_PRESETS } from './agnes/styles'
import './App.css'

interface PaletteColor {
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

const PERLER_PALETTE = [
  ['白色', '#f8f7f0'], ['奶油', '#f4dfb6'], ['浅黄', '#ffd766'], ['黄色', '#f9b233'], ['橙色', '#ef7d32'],
  ['浅粉', '#f7b6c8'], ['粉红', '#ee6f9f'], ['玫红', '#c83d7d'], ['红色', '#c93636'], ['酒红', '#7e2633'],
  ['薰衣草', '#b7a6dc'], ['紫色', '#7955a3'], ['深紫', '#42316f'], ['浅蓝', '#8fc7e8'], ['蓝色', '#2d84c6'],
  ['深蓝', '#22518b'], ['薄荷', '#9bd8bf'], ['绿色', '#51aa6b'], ['深绿', '#236042'], ['青色', '#38a7a5'],
  ['棕色', '#8b5a36'], ['浅棕', '#c08a55'], ['灰色', '#9c9a94'], ['深灰', '#4f5358'], ['黑色', '#171717'],
] as const

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function nearestPaletteColor(r: number, g: number, b: number, palette: readonly (readonly [string, string])[]) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  palette.forEach(([, hex], index) => {
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
    options?: { updatePreview?: boolean },
  ) {
    const updatePreview = options?.updatePreview ?? true
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

      ctx.imageSmoothingEnabled = true
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, cols, rows)
      const imageData = ctx.getImageData(0, 0, cols, rows)

      const sampled: number[] = []
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const offset = (y * cols + x) * 4
          if (imageData.data[offset + 3] < 80) continue
          sampled.push(nearestPaletteColor(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], PERLER_PALETTE))
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
        name: PERLER_PALETTE[paletteIndex][0],
        hex: PERLER_PALETTE[paletteIndex][1],
        count: 0,
        symbol: SYMBOLS[index] ?? String(index + 1),
      }))

      const selectedColors = selected.map((index) => PERLER_PALETTE[index])
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
      await generatePattern(aiFile, gridSize, maxColors, shape, { updatePreview: false })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 生成失败，请稍后重试')
    } finally {
      setIsAiGenerating(false)
    }
  }

  async function regenerate(nextGridSize = gridSize, nextMaxColors = maxColors, nextShape = shape) {
    const file = lastSourceFileRef.current ?? uploadRef.current?.files?.[0]
    if (file) {
      await generatePattern(file, nextGridSize, nextMaxColors, nextShape, { updatePreview: sourceMode !== 'ai' })
    }
  }

  async function exportPng() {
    if (!patternRef.current || isExporting) return
    setIsExporting(true)
    setExportNotice('')
    const startedAt = Date.now()
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const dataUrl = await toPng(patternRef.current, { pixelRatio: 4, backgroundColor: '#fffaf1' })
      saveAs(dataUrl, `拼豆图纸-${sourceName || 'pattern'}.png`)
      setExportNotice('PNG 已开始下载')
      if (exportNoticeTimerRef.current) window.clearTimeout(exportNoticeTimerRef.current)
      exportNoticeTimerRef.current = window.setTimeout(() => setExportNotice(''), 2800)
    } catch (cause) {
      setError(cause instanceof Error ? `导出失败：${cause.message}` : '导出失败，请稍后重试')
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < 600) await new Promise((resolve) => window.setTimeout(resolve, 600 - elapsed))
      setIsExporting(false)
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
            style={{ background: cell.hex, color: cell.colorIndex >= 0 && Number.parseInt(cell.hex.slice(1), 16) < 0x777777 ? '#fff' : '#1d1a23' }}
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
            {Array.from({ length: 100 }).map((_, index) => <span key={index} style={{ background: PERLER_PALETTE[(index * 7) % PERLER_PALETTE.length][1] }} />)}
          </div>
          <p><strong>拼豆是什么？</strong>把小塑料管按图纸摆到底盘上，再隔着助烫纸熨烫定型，像年轻人的像素版十字绣。</p>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="segmented mode-tabs">
            <button className={sourceMode === 'local' ? 'active' : ''} onClick={() => setSourceMode('local')} type="button">本地转换</button>
            <button className={sourceMode === 'ai' ? 'active' : ''} onClick={() => setSourceMode('ai')} type="button">AI 生成</button>
          </div>

          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
          <button className="upload-zone" type="button" onClick={() => uploadRef.current?.click()}>
            {sourcePreview ? <img src={sourcePreview} alt="上传预览" /> : <ImageUp size={34} />}
            <span>{sourcePreview ? sourceName : '选择一张图片'}</span>
            <small>{sourceMode === 'ai' ? '上传参考图，选择风格后 AI 生成' : '按原图比例完整预览，不裁切'}</small>
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
                  placeholder="例如：更偏暖色调、保留人物五官"
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
            <span>图纸精度 <b>最长边 {gridSize} 格</b></span>
            <input type="range" min="24" max="128" step="4" value={gridSize} onChange={(event) => {
              const value = Number(event.target.value)
              setGridSize(value)
              void regenerate(value, maxColors, shape)
            }} />
          </label>

          <label>
            <span>最大颜色数 <b>{maxColors}</b></span>
            <input type="range" min="4" max="25" step="1" value={maxColors} onChange={(event) => {
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
                <span>已匹配拼豆色号</span>
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
                      <span>{color.name}</span>
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
