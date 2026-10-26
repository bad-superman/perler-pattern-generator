import { useEffect, useRef, useState } from 'react'
import { BeadLogo } from '../components/BeadLogo'
import { PatternEditor, type EditorTool } from '../components/PatternEditor'
import { PatternZoomView } from '../components/PatternZoomView'
import { AGNES_STYLE_PRESETS, AI_FRAMING_OPTIONS, type AiFraming } from '../agnes/styles'
import type { BeadPaletteEntry, PaletteBrand } from '../palettes'
import type { BeadCell, PaletteColor } from '../pattern/types'
import type { BoardShape, DitherMode } from '../quantize'
import '../styles/mobile.css'

const QUICK_SIZES = [52, 104, 156, 208]

export interface MobileLayoutProps {
  sourceMode: 'local' | 'ai' | 'board'
  switchSourceMode: (mode: 'local' | 'ai' | 'board') => void
  sourceName: string
  sourcePreview: string
  onPickFile: () => void
  onPickEffect: () => void
  onGenerate: () => void
  pattern: BeadCell[][]
  palette: PaletteColor[]
  gridCols: number
  gridRows: number
  activeCells: number
  renderMode: 'symbols' | 'solid'
  setRenderMode: (mode: 'symbols' | 'solid') => void
  cellSize: number
  gridSize: number
  setGridSize: (size: number) => void
  maxColors: number
  setMaxColors: (count: number) => void
  colorSliderMax: number
  shape: BoardShape
  setShape: (shape: BoardShape) => void
  paletteBrand: PaletteBrand
  paletteLabel: string
  switchPaletteBrand: (brand: PaletteBrand) => void
  removeBackground: boolean
  cleanupIsolated: boolean
  dither: DitherMode
  updateQuantize: (partial: Partial<{ removeBackground: boolean; cleanupIsolated: boolean; dither: DitherMode }>) => void
  regenerate: (grid?: number, colors?: number, shape?: BoardShape) => void
  boardRowsInput: number
  setBoardRowsInput: (rows: number) => void
  createBoard: () => void
  boardConfirm: boolean
  cancelBoardConfirm: () => void
  aiStyleId: string
  setAiStyleId: (id: string) => void
  aiPrompt: string
  setAiPrompt: (value: string) => void
  aiFraming: AiFraming
  setAiFraming: (value: AiFraming) => void
  aiCandidateCount: number
  setAiCandidateCount: (count: number) => void
  aiCandidates: Array<{ url: string; file: File }>
  aiCandidateIndex: number
  applyCandidate: (index: number) => void
  generateAi: () => void
  isAiGenerating: boolean
  aiStage: string
  effectReferenceName: string
  onEffectFile: (file?: File) => void
  clearEffect: () => void
  isProcessing: boolean
  isEditing: boolean
  enterEdit: () => void
  exitEdit: () => void
  editorTool: EditorTool
  setEditorTool: (tool: EditorTool) => void
  selectedPaletteIndex: number
  colorPickerOpen: boolean
  toggleColorPicker: () => void
  brandColors: readonly BeadPaletteEntry[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  onStroke: (cells: Array<{ x: number; y: number }>, paletteIndex: number | null) => void
  onSelectColor: (index: number) => void
  closeColorPicker: () => void
  replaceFromSymbol: string
  replaceToPaletteIndex: number
  replaceAffectedCount: number
  setReplaceFrom: (symbol: string) => void
  setReplaceTo: (index: number) => void
  applyReplace: () => void
  exportPng: () => void
  isExporting: boolean
  exportSheetUrl: string
  closeExportSheet: () => void
  downloadSheet: () => void
  error: string
  promoUrl: string
  promoImage: string
}

function AboutPage() {
  return (
    <section className="m-card m-about">
      <h2>关于</h2>
      <BeadLogo size={72} />
      <p>拼豆是把小塑料管按图纸摆到底盘上，再隔着助烫纸熨烫定型，像年轻人的像素版十字绣。上传图片后，可以在手机上直接生成色号图纸、调整颜色，并保存到相册。</p>
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">京ICP备2024067456号-3</a>
    </section>
  )
}

const PROMO_SLIDES = [
  { key: 'kit', image: '', label: '融豆拼拼 2.6mm 全色套装' },
]

function PromoCarousel({ promoUrl, promoImage }: { promoUrl: string; promoImage: string }) {
  const slides = PROMO_SLIDES.map((slide) => ({ ...slide, image: slide.image || promoImage }))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'move' | 'reset'>('idle')
  const active = slides[index] ?? slides[0]
  const upcoming = slides[(index + 1) % slides.length] ?? active

  useEffect(() => {
    const timer = window.setInterval(() => setPhase('move'), 4000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (phase !== 'move') return undefined
    const timer = window.setTimeout(() => setPhase('reset'), 460)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'reset') return undefined
    setIndex((current) => (current + 1) % slides.length)
    const frame = window.requestAnimationFrame(() => setPhase('idle'))
    return () => window.cancelAnimationFrame(frame)
  }, [phase, slides.length])

  function step(direction: 1 | -1) {
    setIndex((current) => (current + (direction === 1 ? 1 : slides.length - 1)) % slides.length)
    setPhase('idle')
  }

  return (
    <section className="m-card m-promo" aria-label="推广" aria-roledescription="carousel">
      <a href={promoUrl} target="_blank" rel="noopener noreferrer">
        <div
          className="m-promo-frame"
          onTouchStart={(event) => { event.currentTarget.dataset.x = String(event.changedTouches[0]?.clientX ?? 0) }}
          onTouchEnd={(event) => {
            const start = Number(event.currentTarget.dataset.x ?? 0)
            const delta = (event.changedTouches[0]?.clientX ?? start) - start
            if (Math.abs(delta) < 40) return
            step(delta < 0 ? 1 : -1)
          }}
        >
          <div className={`m-promo-track ${phase === 'move' ? 'is-moving' : ''}`}>
            <img src={active.image} alt={active.label} />
            <img src={upcoming.image} alt="" />
          </div>
          <span className="m-promo-badge">推广</span>
        </div>
        <strong>{active.label}</strong>
      </a>
      <div className="m-promo-dots">
        {slides.map((slide, slideIndex) => (
          <button key={slide.key} type="button" className={slideIndex === index % slides.length ? 'active' : ''} aria-label={slide.label} onClick={() => { setIndex(slideIndex); setPhase('idle') }} />
        ))}
      </div>
    </section>
  )
}

function isDark(hex: string) {
  return Number.parseInt(hex.slice(1), 16) < 0x777777
}

export function MobileLayout(props: MobileLayoutProps) {
  const [moreSettings, setMoreSettings] = useState(false)
  const [moreAi, setMoreAi] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [page, setPage] = useState<'app' | 'about'>('app')
  const [legendOpen, setLegendOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [customSize, setCustomSize] = useState(String(props.gridSize))
  const paperRef = useRef<HTMLDivElement>(null)
  const [paperBox, setPaperBox] = useState(320)
  const hasPattern = props.pattern.length > 0
  const showGenerate = props.sourceMode !== 'board' && !hasPattern
  const paperWidth = Math.max(1, props.gridCols * props.cellSize + Math.max(0, props.gridCols - 1) + 24)
  const paperHeight = Math.max(1, props.gridRows * props.cellSize + Math.max(0, props.gridRows - 1) + 24)
  const visibleLegend = legendOpen ? props.palette : props.palette.slice(0, 8)
  const paperScale = paperBox / paperWidth
  const paperViewHeight = Math.min(paperHeight * paperScale, window.innerHeight * 0.8)

  useEffect(() => {
    const element = paperRef.current
    if (!element) return undefined
    const update = () => setPaperBox(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasPattern, props.gridCols, props.gridRows, props.renderMode])

  function commitSize(raw: number) {
    const next = Math.min(208, Math.max(24, Math.round(raw / 4) * 4))
    props.setGridSize(next)
    setCustomSize(String(next))
    if (props.sourceMode !== 'board') props.regenerate(next, props.maxColors, props.shape)
  }

  function commitColors(next: number) {
    const value = Math.min(props.colorSliderMax, Math.max(4, next))
    props.setMaxColors(value)
    if (props.sourceMode !== 'board') props.regenerate(props.gridSize, value, props.shape)
  }

  const modeLabel = props.sourceMode === 'ai' ? 'AI 生成' : props.sourceMode === 'board' ? '画板绘制' : '本地转换'

  return (
    <main className={`m-shell ${hasPattern && !props.isEditing && page === 'app' ? 'has-bar' : ''}`}>
      <header className="m-appbar">
        <div className="m-brand">
          <BeadLogo size={28} />
          <strong>拼豆图纸</strong>
        </div>
        <button className="m-menu-btn" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {page === 'about' ? '关于' : modeLabel}
        </button>
        {menuOpen && (
          <>
            <button className="m-menu-backdrop" type="button" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />
            <div className="m-menu" role="menu">
              {([['local', '本地转换'], ['ai', 'AI 生成'], ['board', '画板绘制']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className={page === 'app' && props.sourceMode === id ? 'active' : ''}
                  onClick={() => { props.switchSourceMode(id); setPage('app'); setMenuOpen(false) }}
                >
                  {label}
                </button>
              ))}
              <button type="button" role="menuitem" className={page === 'about' ? 'active' : ''} onClick={() => { setPage('about'); setMenuOpen(false) }}>关于</button>
            </div>
          </>
        )}
      </header>
      {page === 'about' ? <AboutPage /> : <>

      <section className="m-card m-source">
        {props.sourceMode !== 'board' && (
          <button className="m-upload" type="button" onClick={props.onPickFile}>
            {props.sourcePreview ? <img src={props.sourcePreview} alt="" /> : <span className="m-plus">+</span>}
            <b>{props.sourcePreview ? `${props.sourceName} · 点击更换` : '点击选择图片'}</b>
            {!props.sourcePreview && <span>支持 JPG / PNG，按原图比例生成</span>}
          </button>
        )}

        {props.sourceMode === 'ai' && (
          <div className="m-ai-card">
            <div>
              <div className="m-row">风格</div>
              <div className="m-chips m-style-chips">
                {AGNES_STYLE_PRESETS.map((style) => (
                  <button key={style.id} type="button" className={props.aiStyleId === style.id ? 'active' : ''} onClick={() => props.setAiStyleId(style.id)}>{style.label}</button>
                ))}
              </div>
            </div>
            <textarea className="m-field" rows={2} placeholder="例如：换成纯白背景、去掉文字" value={props.aiPrompt} onChange={(event) => props.setAiPrompt(event.target.value)} />
            <button className="m-disclosure" type="button" onClick={() => setMoreAi((value) => !value)}>
              更多选项 <span>{moreAi ? '︿' : '﹀'}</span>
            </button>
            {moreAi && (
              <div className="m-ai-more">
                <div>
                  <div className="m-row">构图</div>
                  <div className="m-chips">
                    {AI_FRAMING_OPTIONS.map((option) => (
                      <button key={option.id} type="button" className={props.aiFraming === option.id ? 'active' : ''} onClick={() => props.setAiFraming(option.id)}>{option.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="m-row">候选数量</div>
                  <div className="m-chips">
                    {[1, 2, 3, 4].map((count) => (
                      <button key={count} type="button" className={props.aiCandidateCount === count ? 'active' : ''} onClick={() => props.setAiCandidateCount(count)}>{count} 张</button>
                    ))}
                  </div>
                </div>
                <button className="m-secondary" type="button" style={{ width: '100%', marginTop: 8 }} onClick={props.onPickEffect}>
                  {props.effectReferenceName || '添加效果参考图'}
                </button>
                {props.effectReferenceName && <button className="m-more" type="button" onClick={props.clearEffect}>移除效果参考图</button>}
              </div>
            )}
          </div>
        )}

        {props.sourceMode === 'board' && (
          <div>
            <div className="m-row">画板高度 <span>{props.boardRowsInput} 格</span></div>
            <div className="m-chips">
              {QUICK_SIZES.map((size) => (
                <button key={size} type="button" className={props.boardRowsInput === size ? 'active' : ''} onClick={() => props.setBoardRowsInput(size)}>{size}</button>
              ))}
            </div>
            {props.boardConfirm && <p className="m-hint">创建新画板将清空当前图纸。</p>}
          </div>
        )}

        {showGenerate && props.sourceMode === 'local' && (
          <>
            <button className="m-primary m-generate" type="button" style={{ marginTop: 12 }} disabled={!props.sourcePreview || props.isProcessing} onClick={props.onGenerate}>生成图纸</button>
            <p className="m-hint">{props.sourcePreview ? '按当前参数重新生成' : '选择图片后即可生成'}</p>
          </>
        )}
        {props.sourceMode === 'ai' && (
          <button className="m-primary m-generate" type="button" style={{ marginTop: 12 }} disabled={!props.sourcePreview || props.isAiGenerating || props.isProcessing} onClick={props.generateAi}>
            {props.isAiGenerating ? props.aiStage : 'AI 生成拼豆图'}
          </button>
        )}
        {props.sourceMode === 'board' && (
          <button className="m-primary m-generate" type="button" style={{ marginTop: 12 }} onClick={props.createBoard}>
            {props.boardConfirm ? '确认创建' : '创建画板'}
          </button>
        )}
        {props.error && <p className="error">{props.error}</p>}
      </section>

      <section className="m-card m-result">
        <div className="m-result-head">
          <strong>图纸预览</strong>
          {hasPattern && (
            <div className="m-switch">
              <button type="button" className={props.renderMode === 'symbols' ? 'active' : ''} onClick={() => props.setRenderMode('symbols')}>色号</button>
              <button type="button" className={props.renderMode === 'solid' ? 'active' : ''} onClick={() => props.setRenderMode('solid')}>纯色</button>
            </div>
          )}
        </div>
        {hasPattern ? (
          <>
            <p className="m-stats">{props.gridCols}×{props.gridRows} · {props.activeCells} 颗 · {props.palette.length} 色</p>
            {props.aiCandidates.length > 1 && (
              <div className="m-candidates">
                {props.aiCandidates.map((candidate, index) => (
                  <button key={candidate.url} type="button" className={index === props.aiCandidateIndex ? 'active' : ''} onClick={() => props.applyCandidate(index)}>
                    <img src={candidate.url} alt={`候选 ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
            <div className="m-paper" ref={paperRef} style={{ height: paperViewHeight }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: paperWidth, height: paperHeight, transform: `scale(${paperScale})`, transformOrigin: 'top left' }}>
                <div className={`pattern-grid ${props.renderMode} actual-grid`} style={{ gridTemplateColumns: `repeat(${props.gridCols}, ${props.cellSize}px)` }}>
                  {props.pattern.flat().map((cell, index) => (
                    <span key={`${index}-${cell.symbol}`} style={{ background: cell.hex, color: cell.colorIndex >= 0 && isDark(cell.hex) ? '#fff' : '#1d1a23' }}>
                      {props.renderMode === 'symbols' && cell.colorIndex >= 0 ? cell.symbol : ''}
                    </span>
                  ))}
                </div>
              </div>
              <button className="m-zoom-fab" type="button" onClick={() => setZoomOpen(true)}>放大</button>
            </div>
            <div className="m-legend">
              {visibleLegend.map((color) => (
                <div className="m-chip" key={color.symbol}>
                  <i style={{ background: color.hex }} />
                  <span>{color.code}</span>
                  <b>{color.count}</b>
                </div>
              ))}
            </div>
            {props.palette.length > 8 && (
              <button className="m-more" type="button" onClick={() => setLegendOpen((value) => !value)}>
                {legendOpen ? '收起色号' : `查看全部 ${props.palette.length} 色`}
              </button>
            )}
          </>
        ) : (
          <p className="m-stats">生成后这里显示色号网格，每格一颗豆。</p>
        )}
      </section>

      <section className="m-card m-settings">
        <div className="m-row">图纸宽度 <span>{props.gridSize} 格</span></div>
        <div className="m-chips">
          {QUICK_SIZES.map((size) => (
            <button key={size} type="button" className={props.gridSize === size ? 'active' : ''} onClick={() => commitSize(size)}>{size}</button>
          ))}
          <input className="m-custom" inputMode="numeric" aria-label="自定义宽度" value={customSize} onChange={(event) => setCustomSize(event.target.value)} onBlur={() => commitSize(Number(customSize) || props.gridSize)} onKeyDown={(event) => { if (event.key === 'Enter') commitSize(Number(customSize) || props.gridSize) }} />
        </div>
        {props.sourceMode !== 'board' && (
          <div className="m-row" style={{ marginTop: 14 }}>
            最大颜色数
            <span className="m-stepper">
              <button type="button" onClick={() => commitColors(props.maxColors - 1)}>−</button>
              <b>{props.maxColors}</b>
              <button type="button" onClick={() => commitColors(props.maxColors + 1)}>+</button>
            </span>
          </div>
        )}
        <button className="m-disclosure" type="button" onClick={() => setMoreSettings((value) => !value)}>
          更多设置 <span>{moreSettings ? '︿' : '﹀'}</span>
        </button>
        {moreSettings && (
          <div>
            <div className="m-row">色卡 <span>{props.paletteLabel}</span></div>
            <div className="m-chips">
              <button type="button" className={props.paletteBrand === 'mard' ? 'active' : ''} onClick={() => props.switchPaletteBrand('mard')}>MARD（国产）</button>
              <button type="button" className={props.paletteBrand === 'hama' ? 'active' : ''} onClick={() => props.switchPaletteBrand('hama')}>Hama</button>
            </div>
            {props.sourceMode !== 'board' && (
              <>
                <div className="m-row" style={{ marginTop: 12 }}>形状</div>
                <div className="m-chips">
                  <button type="button" className={props.shape === 'ratio' ? 'active' : ''} onClick={() => { props.setShape('ratio'); props.regenerate(props.gridSize, props.maxColors, 'ratio') }}>按原图比例</button>
                  <button type="button" className={props.shape === 'square' ? 'active' : ''} onClick={() => { props.setShape('square'); props.regenerate(props.gridSize, props.maxColors, 'square') }}>方形</button>
                </div>
                <label className="check-row"><input type="checkbox" checked={props.removeBackground} onChange={(event) => props.updateQuantize({ removeBackground: event.target.checked })} />去掉连通的纯色背景</label>
                <label className="check-row"><input type="checkbox" checked={props.cleanupIsolated} onChange={(event) => props.updateQuantize({ cleanupIsolated: event.target.checked })} />清理孤立豆</label>
                <div className="m-chips">
                  {([['off', '关'], ['light', '弱'], ['medium', '中']] as const).map(([id, label]) => (
                    <button key={id} type="button" className={props.dither === id ? 'active' : ''} onClick={() => props.updateQuantize({ dither: id })}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <PromoCarousel promoUrl={props.promoUrl} promoImage={props.promoImage} />
      </>}

      {page === 'app' && hasPattern && !props.isEditing && (
        <div className="m-actionbar">
          <button className="m-secondary" type="button" onClick={props.onGenerate} disabled={props.isProcessing || props.isAiGenerating}>重新生成</button>
          <button className="m-secondary" type="button" onClick={props.enterEdit}>编辑</button>
          <button className="m-primary" type="button" onClick={props.exportPng} disabled={props.isExporting}>保存到相册</button>
        </div>
      )}

      {props.isEditing && (
        <div className="m-editor">
          <PatternEditor
            pattern={props.pattern}
            palette={props.palette}
            gridCols={props.gridCols}
            gridRows={props.gridRows}
            cellSize={props.cellSize}
            renderMode={props.renderMode}
            tool={props.editorTool}
            selectedPaletteIndex={props.selectedPaletteIndex}
            colorPickerOpen={props.colorPickerOpen}
            brandColors={props.brandColors}
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            replaceFromSymbol={props.replaceFromSymbol}
            replaceToPaletteIndex={props.replaceToPaletteIndex}
            replaceAffectedCount={props.replaceAffectedCount}
            onStrokeComplete={props.onStroke}
            onColorPickerToggle={props.toggleColorPicker}
            onToolChange={props.setEditorTool}
            onUndo={props.undo}
            onRedo={props.redo}
            onExit={props.exitEdit}
            onSelectPaletteColor={props.onSelectColor}
            onCloseColorPicker={props.closeColorPicker}
            onReplaceFromSymbolChange={props.setReplaceFrom}
            onReplaceToPaletteIndexChange={props.setReplaceTo}
            onApplyColorReplace={props.applyReplace}
          />
        </div>
      )}

      {zoomOpen && (
        <div className="m-sheet" role="dialog">
          <PatternZoomView pattern={props.pattern} gridCols={props.gridCols} gridRows={props.gridRows} cellSize={props.cellSize} renderMode={props.renderMode} />
          <button type="button" onClick={() => setZoomOpen(false)}>关闭</button>
        </div>
      )}

      {props.exportSheetUrl && (
        <div className="m-sheet" role="dialog">
          <img src={props.exportSheetUrl} alt="拼豆图纸，长按可保存到相册" />
          <p>长按图片，选择“保存到相册”</p>
          <div className="m-sheet-actions">
            <button type="button" onClick={props.downloadSheet}>下载文件</button>
            <button type="button" onClick={props.closeExportSheet}>关闭</button>
          </div>
        </div>
      )}

      {props.isAiGenerating && (
        <div className="export-loading-overlay" role="status">
          <div className="export-loading-card"><strong>{props.aiStage}</strong></div>
        </div>
      )}
    </main>
  )
}
