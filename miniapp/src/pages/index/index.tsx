import { useMemo, useRef, useState } from 'react'
import { Button, Canvas, Image, Progress, Slider, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getPaletteColors, type BeadPaletteEntry } from '../../../../src/palettes'
import { quantizeRgbaGrid, quantizedPatternToSnapshot } from '../../../../src/miniapp/core'
import { applyStroke, ensurePaletteColor, recalculatePaletteCounts } from '../../../../src/pattern/ops'
import type { MiniappImageSource } from '../../../../src/miniapp/platform/types'
import type { PatternSnapshot } from '../../../../src/pattern/types'
import { ColorPickerPopup } from '../../components/ColorPickerPopup'
import { PatternCanvas, type PatternCanvasHandle } from '../../components/PatternCanvas'
import {
  DECODE_CANVAS_SIZE,
  exportSheetLayout,
  getViewportMetrics,
  showSavePermissionHint,
  taroAlbumAdapter,
  taroCanvasAdapter,
  taroImagePicker,
} from '../../platform/bridge'
import './index.css'

type Stage = 'home' | 'configure' | 'processing' | 'result' | 'edit'
type BoardShape = 'square' | 'ratio'
type EditorTool = 'paint' | 'erase' | 'pan'
/** Layers shown above the editor; the pattern canvas is hidden while one is open. */
type EditorOverlay = 'colors' | 'more' | null

const BRAND_COLORS = getPaletteColors('mard')
/** Zoom change per tap on the − / ＋ buttons. */
const ZOOM_STEP = 1.5

function gridRowsFor(source: MiniappImageSource | null, gridSize: number, shape: BoardShape) {
  if (shape !== 'ratio' || !source?.width || !source.height) return gridSize
  return Math.max(1, Math.min(104, Math.round((gridSize * source.height) / source.width)))
}

function createBlankSnapshot(cols: number, rows: number): PatternSnapshot {
  const assignments = new Int16Array(cols * rows)
  assignments.fill(-1)
  const blank = quantizedPatternToSnapshot({
    cols,
    rows,
    selected: [],
    assignments,
  })
  // Start on black, matching the web blank board; every other colour is reachable from the picker.
  const starter = BRAND_COLORS.find(([code, name]) => /黑|black/i.test(`${code} ${name}`)) ?? BRAND_COLORS[0]
  return {
    ...blank,
    palette: starter ? [{ code: starter[0], name: starter[1], hex: starter[2], count: 0, symbol: starter[0] }] : [],
  }
}

function createPatternSnapshot(source: MiniappImageSource, cols: number, rows: number, maxColors: number, shape: BoardShape) {
  return taroCanvasAdapter.decodeToGrid(source, cols, rows, shape).then((grid) => {
    const result = quantizeRgbaGrid(grid, {
      shape,
      gridSize: cols,
      maxColors,
      palette: BRAND_COLORS,
      edgePriority: false,
      removeBackground: false,
      dither: 'off',
      cleanupIsolated: true,
    })
    return quantizedPatternToSnapshot(result)
  })
}

function usedColorCount(snapshot: PatternSnapshot) {
  return snapshot.palette.reduce((total, color) => total + (color.count > 0 ? 1 : 0), 0)
}

function exportCanvasDimensions(snapshot: PatternSnapshot | null) {
  // Nothing is exported before a pattern exists, so keep the idle canvas small.
  if (!snapshot) return { width: 300, height: 150 }
  const layout = exportSheetLayout(snapshot.pattern[0]?.length ?? 1, snapshot.pattern.length || 1, usedColorCount(snapshot))
  return { width: layout.canvasWidth, height: layout.canvasHeight }
}

export default function IndexPage() {
  const [stage, setStage] = useState<Stage>('home')
  const [source, setSource] = useState<MiniappImageSource | null>(null)
  const [gridSize, setGridSize] = useState(52)
  const [maxColors, setMaxColors] = useState(12)
  const [shape, setShape] = useState<BoardShape>('square')
  const [mirrored, setMirrored] = useState(false)
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0)
  const [editorTool, setEditorTool] = useState<EditorTool>('paint')
  const [snapshot, setSnapshot] = useState<PatternSnapshot | null>(null)
  const [past, setPast] = useState<PatternSnapshot[]>([])
  const [future, setFuture] = useState<PatternSnapshot[]>([])
  const [notice, setNotice] = useState('')
  const [overlay, setOverlay] = useState<EditorOverlay>(null)
  const [zoom, setZoom] = useState(100)
  const generationRef = useRef(0)
  const canvasRef = useRef<PatternCanvasHandle>(null)
  const metrics = useMemo(() => getViewportMetrics(), [])
  const exportDimensions = exportCanvasDimensions(snapshot)

  const usedColors = useMemo(
    () => (snapshot?.palette ?? []).filter((color) => color.count > 0).sort((a, b) => b.count - a.count),
    [snapshot],
  )
  // Undo can bring back a palette that is shorter than the one the index was picked from.
  const activePaletteIndex = Math.max(0, Math.min(selectedPaletteIndex, (snapshot?.palette.length ?? 1) - 1))
  const activeColor = snapshot?.palette[activePaletteIndex]

  async function pickImage() {
    try {
      const source = await taroImagePicker.chooseImage()
      if (!source?.tempPath) return
      setSource(source)
      setStage('configure')
      setNotice('图片已选择，调整参数后开始生成')
    } catch (error) {
      if ((error as { errMsg?: string })?.errMsg?.includes('cancel')) return
      setNotice('图片选择失败，请重试')
    }
  }

  function openBlankEditor(cols: number, rows: number) {
    setSnapshot(createBlankSnapshot(cols, rows))
    setMirrored(false)
    setPast([])
    setFuture([])
    setSelectedPaletteIndex(0)
    setEditorTool('paint')
    setOverlay(null)
    setZoom(100)
    setStage('edit')
    setNotice('')
  }

  function startBlankBoard() {
    setSource(null)
    setStage('configure')
    setNotice('选择尺寸后进入编辑')
  }

  async function startDrawingBlank() {
    const painted = snapshot?.pattern.some((row) => row.some((cell) => cell.colorIndex >= 0)) ?? false
    if (painted || past.length) {
      const result = await Taro.showModal({
        title: '创建新画板',
        content: '将清空当前图纸，是否继续？',
        confirmText: '继续',
      })
      if (!result.confirm) return
    }
    openBlankEditor(gridSize, gridSize)
  }

  async function generate() {
    if (!source?.tempPath) return
    const requestId = generationRef.current + 1
    generationRef.current = requestId
    setStage('processing')
    setNotice('正在本地生成图纸…')
    try {
      const next = await createPatternSnapshot(source, gridSize, gridRowsFor(source, gridSize, shape), maxColors, shape)
      if (requestId !== generationRef.current) return
      setSnapshot(next)
      setMirrored(false)
      setPast([])
      setFuture([])
      setStage('result')
      setNotice('生成完成，图片未上传网络')
    } catch (error) {
      if (requestId !== generationRef.current) return
      console.error(error)
      setStage('configure')
      setNotice('图片解码失败，请换一张图片重试')
    }
  }

  function enterEdit() {
    setStage('edit')
    setEditorTool('paint')
    setOverlay(null)
    setSelectedPaletteIndex(activePaletteIndex)
  }

  function leaveEdit() {
    setOverlay(null)
    setStage('result')
    setNotice('')
  }

  function selectPaletteColor(index: number) {
    setSelectedPaletteIndex(index)
    setEditorTool('paint')
    setOverlay(null)
  }

  function selectBrandColor(entry: BeadPaletteEntry) {
    if (!snapshot) return
    const { palette, index } = ensurePaletteColor(snapshot.palette, entry)
    if (palette !== snapshot.palette) setSnapshot({ ...snapshot, palette })
    selectPaletteColor(index)
  }

  function applyEditorStroke(cells: Array<{ x: number; y: number }>, paletteIndex: number | null) {
    if (!snapshot || !cells.length) return
    const nextPattern = applyStroke(snapshot.pattern, snapshot.palette, cells, paletteIndex)
    if (nextPattern === snapshot.pattern) return
    const nextSnapshot = {
      ...snapshot,
      pattern: nextPattern,
      palette: recalculatePaletteCounts(nextPattern, snapshot.palette),
    }
    setPast((items) => [...items.slice(-29), snapshot])
    setFuture([])
    setSnapshot(nextSnapshot)
  }

  function undo() {
    if (!snapshot || !past.length) return
    const previous = past[past.length - 1]
    setPast((items) => items.slice(0, -1))
    setFuture((items) => [snapshot, ...items].slice(0, 30))
    setSnapshot(previous)
  }

  function redo() {
    if (!snapshot || !future.length) return
    const next = future[0]
    setFuture((items) => items.slice(1))
    setPast((items) => [...items.slice(-29), snapshot])
    setSnapshot(next)
  }

  function goBack() {
    if (stage === 'processing') {
      generationRef.current += 1
      setStage(source ? 'configure' : 'home')
      return
    }
    if (stage === 'configure') {
      setStage('home')
      return
    }
    if (stage === 'result') {
      setStage('configure')
      return
    }
    if (stage === 'edit') leaveEdit()
  }

  async function saveImage() {
    if (!snapshot) return
    try {
      setNotice('正在生成 PNG…')
      // The editor has no notice line, so the progress is shown as a native loading toast.
      void Taro.showLoading({ title: '正在生成 PNG…', mask: true })
      const exported = await taroCanvasAdapter.renderExportSheet({
        cols: snapshot.pattern[0]?.length ?? 0,
        rows: snapshot.pattern.length,
        activeCells: snapshot.palette.reduce((total, color) => total + color.count, 0),
        mirrored,
        pattern: snapshot.pattern,
        palette: snapshot.palette,
      })
      Taro.hideLoading()
      const permission = await taroAlbumAdapter.requestPermission()
      if (!permission) {
        await showSavePermissionHint()
        return
      }
      await taroAlbumAdapter.saveImage(exported.tempPath)
      setNotice('PNG 已保存到相册')
      await Taro.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      console.error(error)
      Taro.hideLoading()
      setNotice('保存失败，请重试')
      await Taro.showToast({ title: '保存失败', icon: 'none' })
    }
  }

  if (stage === 'home') {
    return (
      <View className="page-shell">
        <View className="eyebrow">LOCAL MINIAPP · V1</View>
        <Text className="page-title">把图片变成可以照着做的图纸</Text>
        <Text className="page-subtitle">本地处理，不上传图片。生成后还能改色、镜像和保存。</Text>
        <Button className="primary-button" onClick={pickImage}>选择图片生成</Button>
        <Button className="secondary-button" onClick={startBlankBoard}>创建空白画板</Button>
        <View className="privacy-card"><Text>🔒 图片只在本机处理</Text><Text>首发版本不需要登录或服务器</Text></View>
        <HiddenCanvases exportWidth={exportDimensions.width} exportHeight={exportDimensions.height} />
      </View>
    )
  }

  if (stage === 'configure') {
    return (
      <View className="page-shell">
        <View className="top-row"><Button className="back-button" onClick={goBack}>返回</Button><Text className="page-heading">{source ? '生成图纸' : '空白画板'}</Text></View>
        {source?.tempPath ? <Image className="source-image" src={source.tempPath} mode="aspectFill" /> : <View className="blank-source"><Text>选择尺寸后直接绘制</Text></View>}
        <View className="setting-card"><View className="setting-row"><Text>图纸尺寸</Text><Text className="setting-value">{gridSize} × {gridRowsFor(source, gridSize, shape)}</Text></View><Slider value={gridSize} min={32} max={104} step={4} onChanging={(event) => setGridSize(event.detail.value)} activeColor="#7c4dff" />{source ? <View className="shape-row"><Button className={shape === 'square' ? 'shape-button active' : 'shape-button'} onClick={() => setShape('square')}>方形</Button><Button className={shape === 'ratio' ? 'shape-button active' : 'shape-button'} onClick={() => setShape('ratio')}>原比例</Button></View> : null}</View>
        {source ? <View className="setting-card"><View className="setting-row"><Text>最多颜色</Text><Text className="setting-value">{maxColors} 色</Text></View><Slider value={maxColors} min={4} max={24} step={1} onChanging={(event) => setMaxColors(event.detail.value)} activeColor="#54d4a0" /></View> : null}
        <Button className="primary-button" onClick={source ? generate : () => { void startDrawingBlank() }}>{source ? '开始生成' : '开始绘制'}</Button>
        <Text className="hint">{notice || 'MARD 221 · 方形画布 · 背景保留 · Web 同款量化参数'}</Text>
        <HiddenCanvases exportWidth={exportDimensions.width} exportHeight={exportDimensions.height} />
      </View>
    )
  }

  if (stage === 'processing') {
    return <View className="page-shell centered"><View className="top-row"><Button className="back-button" onClick={goBack}>返回</Button><Text className="page-heading">生成图纸</Text></View><Text className="processing-title">正在生成拼豆图纸</Text><Progress percent={62} active strokeWidth={6} activeColor="#7c4dff" /><Text className="hint">本地采样 → 选色 → 后处理</Text><HiddenCanvases exportWidth={exportDimensions.width} exportHeight={exportDimensions.height} /></View>
  }

  if (!snapshot) return null

  if (stage === 'edit') {
    // The editor fills the window: fixed-height bars, everything else is canvas.
    const topBarHeight = Math.round(metrics.rpx(96))
    const toolbarHeight = Math.round(metrics.rpx(124))
    const canvasHeight = Math.max(160, Math.floor(metrics.windowHeight - topBarHeight - toolbarHeight - metrics.safeBottom))
    const toolClass = (tool: EditorTool) => (editorTool === tool ? 'tool-item active' : 'tool-item')
    return (
      <View className="edit-shell">
        <View className="edit-top-bar" style={{ height: `${topBarHeight}px` }}>
          <View className="edit-top-action primary" onClick={leaveEdit}><Text>完成</Text></View>
          <Text className="edit-top-title">编辑图纸</Text>
          <View className="edit-top-group">
            <View className={past.length ? 'edit-top-action' : 'edit-top-action disabled'} onClick={undo}><Text>撤销</Text></View>
            <View className={future.length ? 'edit-top-action' : 'edit-top-action disabled'} onClick={redo}><Text>重做</Text></View>
          </View>
        </View>
        <PatternCanvas
          ref={canvasRef}
          canvasId="preview-canvas"
          width={metrics.windowWidth}
          height={canvasHeight}
          snapshot={snapshot}
          mirrored={mirrored}
          mode={editorTool}
          paintHex={activeColor?.hex}
          hidden={overlay !== null}
          onStroke={(cells) => applyEditorStroke(cells, editorTool === 'erase' ? null : activePaletteIndex)}
          onZoomChange={setZoom}
        />
        <View className="edit-toolbar" style={{ height: `${toolbarHeight}px`, paddingBottom: `${metrics.safeBottom}px` }}>
          <View className="tool-item" onClick={() => setOverlay('colors')}>
            <View className="tool-color" style={{ backgroundColor: activeColor?.hex || '#ffffff' }} />
            <Text className="tool-label">{activeColor?.code || '选色'}</Text>
          </View>
          <View className={toolClass('paint')} onClick={() => setEditorTool('paint')}><Text className="tool-name">画笔</Text></View>
          <View className={toolClass('erase')} onClick={() => setEditorTool('erase')}><Text className="tool-name">橡皮</Text></View>
          <View className={toolClass('pan')} onClick={() => setEditorTool('pan')}><Text className="tool-name">移动</Text></View>
          <View className="tool-item" onClick={() => setOverlay('more')}><Text className="tool-name">更多</Text></View>
        </View>
        {overlay === 'colors' ? (
          <ColorPickerPopup
            palette={snapshot.palette}
            selectedPaletteIndex={activePaletteIndex}
            brandColors={BRAND_COLORS}
            onSelectPalette={selectPaletteColor}
            onSelectBrand={selectBrandColor}
            onClose={() => setOverlay(null)}
          />
        ) : null}
        {overlay === 'more' ? (
          <>
            <View className="drawer-mask" onClick={() => setOverlay(null)} />
            <View className="drawer" style={{ paddingBottom: `${metrics.safeBottom}px` }}>
              <View className="drawer-item" onClick={() => { setMirrored((value) => !value); setOverlay(null) }}><Text>{mirrored ? '取消镜像' : '镜像预览'}</Text></View>
              <View className="drawer-item" onClick={() => { canvasRef.current?.fit(); setOverlay(null) }}><Text>适应屏幕</Text></View>
              <View className="drawer-item" onClick={() => { setOverlay(null); void saveImage() }}><Text>保存 PNG</Text></View>
              <View className="drawer-item cancel" onClick={() => setOverlay(null)}><Text>取消</Text></View>
            </View>
          </>
        ) : null}
        <HiddenCanvases exportWidth={exportDimensions.width} exportHeight={exportDimensions.height} />
      </View>
    )
  }

  const previewWidth = Math.floor(metrics.windowWidth - metrics.rpx(36) * 2)
  const previewHeight = Math.floor(Math.min(previewWidth * 1.1, metrics.windowHeight * 0.5))
  return (
    <View className="page-shell">
      <View className="top-row result-top-row"><Button className="back-button" onClick={goBack}>返回</Button><Text className="page-heading">你的拼豆图纸</Text><Text className="badge">{usedColors.length} 色</Text></View>
      <View className="pattern-viewport" style={{ width: `${previewWidth}px`, height: `${previewHeight}px` }}>
        <PatternCanvas
          ref={canvasRef}
          canvasId="preview-canvas"
          width={previewWidth}
          height={previewHeight}
          snapshot={snapshot}
          mirrored={mirrored}
          mode="view"
          onZoomChange={setZoom}
        />
      </View>
      <View className="pattern-zoom-controls">
        <Button className="zoom-button" onClick={() => canvasRef.current?.zoomBy(1 / ZOOM_STEP)}>−</Button>
        <Text className="zoom-value">{zoom}%</Text>
        <Button className="zoom-button" onClick={() => canvasRef.current?.zoomBy(ZOOM_STEP)}>＋</Button>
        <Button className="zoom-button fit" onClick={() => canvasRef.current?.fit()}>适应</Button>
      </View>
      <Text className="zoom-hint">双指缩放 · 单指拖动</Text>
      <View className="result-meta"><Text>{snapshot.pattern[0]?.length ?? 0} × {snapshot.pattern.length} · 本地结果</Text><Text className="muted">预览模式</Text></View>
      <View className="palette-card"><View className="section-heading"><Text>色号清单</Text><Text className="muted">用量倒序</Text></View><View className="palette-row">{usedColors.map((color) => <View key={color.code} className="palette-chip"><View className="palette-dot" style={{ backgroundColor: color.hex }} /><Text>{color.code} {color.count}</Text></View>)}</View></View>
      {notice ? <Text className="hint">{notice}</Text> : null}
      <Button className="mirror-button" onClick={() => setMirrored((value) => !value)}>{mirrored ? '取消镜像' : '镜像预览'}</Button>
      <View className="action-row"><Button className="secondary-button half" onClick={enterEdit}>编辑图纸</Button><Button className="primary-button half" onClick={saveImage}>保存 PNG</Button></View>
      <HiddenCanvases exportWidth={exportDimensions.width} exportHeight={exportDimensions.height} />
    </View>
  )
}

function HiddenCanvases({ exportWidth, exportHeight }: { exportWidth: number; exportHeight: number }) {
  return (
    <View className="hidden-canvases" aria-hidden="true">
      <Canvas canvasId="decode-canvas" style={{ width: `${DECODE_CANVAS_SIZE}px`, height: `${DECODE_CANVAS_SIZE}px` }} />
      <Canvas canvasId="export-canvas" style={{ width: `${exportWidth}px`, height: `${exportHeight}px` }} />
    </View>
  )
}
