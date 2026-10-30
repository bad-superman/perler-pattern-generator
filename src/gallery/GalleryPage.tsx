import { useEffect, useState } from 'react'
import { saveAs } from 'file-saver'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  buildPatternExportCanvas,
  canvasToBlob,
  deliverPatternPng,
  formatExportError,
  limitExportCanvas,
  sanitizeExportFilename,
} from '../pattern/exportSheet'
import { fetchGalleryPage, formatGalleryDate, type GalleryItem } from './client'
import { galleryPattern } from './patternModel'
import { PatternPreview } from './PatternPreview'
import './gallery.css'

export function GalleryPage() {
  const isMobile = useMediaQuery('(max-width: 620px)')
  const pageSize = isMobile ? 8 : 18
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<GalleryItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GalleryItem | null>(null)
  const pages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    let cancelled = false
    fetchGalleryPage(page, pageSize)
      .then((result) => {
        if (cancelled) return
        const nextPages = Math.max(1, Math.ceil(result.total / pageSize))
        if (page > nextPages) {
          setPage(nextPages)
          return
        }
        setItems(result.items)
        setTotal(result.total)
        setError('')
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '酷图加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [page, pageSize])

  return (
    <section className="gallery-page" id="gallery">
      <header className="gallery-head">
        <h2>酷图</h2>
        <p>{total > 0 ? `已通过 ${total} 张` : '审核通过的图纸会显示在这里'}</p>
      </header>
      {error && <p className="gallery-error">{error}</p>}
      {loading && !items.length ? <p className="gallery-muted">加载中…</p> : null}
      {!loading && !error && !items.length ? <p className="gallery-muted">还没有通过审核的图纸。</p> : null}
      <div className={`gallery-grid ${isMobile ? 'cols-2' : 'cols-6'}`}>
        {items.map((item) => (
          <button key={item.id} type="button" className="gallery-card" onClick={() => setSelected(item)}>
            <PatternPreview cells={item.cells} cols={item.cols} rows={item.rows} brand={item.brand} />
            <span className="gallery-card-meta">
              <strong>{item.nickname}</strong>
              <span>{formatGalleryDate(item.reviewedAt || item.createdAt)}</span>
            </span>
            <small>{item.cols}×{item.rows} · {item.colorCount} 色</small>
          </button>
        ))}
      </div>
      {total > pageSize && (
        <div className="gallery-pager">
          <button type="button" className="ghost-btn" disabled={page <= 1} onClick={() => { setLoading(true); setPage((current) => current - 1) }}>上一页</button>
          <span>{page} / {pages}</span>
          <button type="button" className="ghost-btn" disabled={page >= pages} onClick={() => { setLoading(true); setPage((current) => current + 1) }}>下一页</button>
        </div>
      )}
      {selected && <GalleryDetail item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

function GalleryDetail({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  const isMobile = useMediaQuery('(max-width: 620px)')
  const [mirrored, setMirrored] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const view = galleryPattern({ ...item, mirrored })
  const previewCells = view.pattern.flat().map((cell) => cell.colorIndex)

  useEffect(() => () => {
    if (sheetUrl) URL.revokeObjectURL(sheetUrl)
  }, [sheetUrl])

  async function exportSheet() {
    if (exporting) return
    setExporting(true)
    setNotice('')
    try {
      await Promise.all([
        (async () => {
          await document.fonts.ready
          const maxExportSide = isMobile ? 4096 : 8192
          const canvas = limitExportCanvas(
            buildPatternExportCanvas(view.pattern, view.palette, item.cols, item.rows, view.activeCells, maxExportSide, mirrored),
            maxExportSide,
          )
          const blob = await canvasToBlob(canvas)
          const filename = `拼豆图纸-${sanitizeExportFilename(item.nickname)}.png`
          const delivered = await deliverPatternPng({ blob, filename, mobile: isMobile, existingSheetUrl: sheetUrl })
          if (delivered.sheetUrl) setSheetUrl(delivered.sheetUrl)
          if (delivered.notice) setNotice(delivered.notice)
        })(),
        new Promise((resolve) => window.setTimeout(resolve, 600)),
      ])
    } catch (cause) {
      setNotice(`导出失败：${formatExportError(cause)}`)
    } finally {
      setExporting(false)
    }
  }

  function downloadSheet() {
    if (!sheetUrl) return
    saveAs(sheetUrl, `拼豆图纸-${sanitizeExportFilename(item.nickname)}.png`)
  }

  function closeSheet() {
    if (sheetUrl) URL.revokeObjectURL(sheetUrl)
    setSheetUrl('')
  }

  return (
    <div className="gallery-scrim" role="presentation" onClick={onClose}>
      <div className="gallery-modal gallery-detail" role="dialog" aria-label={item.nickname} onClick={(event) => event.stopPropagation()}>
        <div className="gallery-card-meta">
          <strong>{item.nickname}</strong>
          <button type="button" className="ghost-btn" onClick={onClose}>关闭</button>
        </div>
        <div className="gallery-detail-body">
          <PatternPreview cells={previewCells} cols={item.cols} rows={item.rows} brand={item.brand} />
          <p>{item.cols}×{item.rows} · {item.colorCount} 色 · {formatGalleryDate(item.reviewedAt || item.createdAt)}{mirrored ? ' · 镜像' : ''}</p>
          <div className="gallery-legend">
            {view.palette.map((color) => (
              <span key={color.code}>
                <i style={{ background: color.hex }} />
                {color.name ? `${color.code} ${color.name}` : color.code}
                <b>{color.count}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="gallery-detail-actions">
          {notice && <p className="gallery-muted" role="status">{notice}</p>}
          <div>
            <button
              type="button"
              className={mirrored ? 'active' : ''}
              role="switch"
              aria-checked={mirrored}
              onClick={() => setMirrored((current) => !current)}
            >
              镜像
            </button>
            <button type="button" className="primary-btn" disabled={exporting} onClick={() => void exportSheet()}>
              {exporting ? '导出中...' : isMobile ? '保存到相册' : '导出 PNG'}
            </button>
          </div>
        </div>
      </div>
      {sheetUrl && (
        <div className="export-sheet gallery-export-sheet" role="dialog" aria-label="保存到相册" onClick={(event) => event.stopPropagation()}>
          <img src={sheetUrl} alt="拼豆图纸，长按可保存到相册" />
          <p>长按图片，选择“保存到相册”</p>
          <div className="export-sheet-actions">
            <button type="button" onClick={downloadSheet}>下载文件</button>
            <button type="button" onClick={closeSheet}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
