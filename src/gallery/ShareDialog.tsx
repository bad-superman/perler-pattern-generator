import { useEffect, useState, type FormEvent } from 'react'
import { getPaletteColors, type PaletteBrand } from '../palettes'
import { submitGalleryShare } from './client'
import { beadCodesToPaletteIndices } from './paletteIndex'
import './gallery.css'

const NICKNAME_KEY = 'gallery-nickname'

export function ShareDialog({
  pattern,
  onClose,
  onSuccess,
}: {
  pattern: {
    brand: PaletteBrand
    cols: number
    rows: number
    mirrored: boolean
    cells: ReadonlyArray<{ colorIndex: number; symbol: string }>
  }
  onClose: () => void
  onSuccess: () => void
}) {
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) || '')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = nickname.trim()
    if ([...trimmed].length < 1 || [...trimmed].length > 16) {
      setError('请填写 1–16 个字的昵称')
      return
    }
    setPending(true)
    setError('')
    try {
      const cells = beadCodesToPaletteIndices(
        getPaletteColors(pattern.brand).map((entry) => entry[0]),
        pattern.cells,
      )
      await submitGalleryShare({ ...pattern, nickname: trimmed, cells })
      localStorage.setItem(NICKNAME_KEY, trimmed)
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交失败')
      setPending(false)
    }
  }

  return (
    <div className="gallery-scrim" role="presentation">
      <form className="gallery-modal" role="dialog" aria-labelledby="share-title" onSubmit={(event) => void submit(event)}>
        <h3 id="share-title">分享到酷图？</h3>
        <p>提交后先审核，通过了才会公开。</p>
        <label htmlFor="gallery-nickname">昵称</label>
        <input id="gallery-nickname" maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} autoFocus />
        <p className="gallery-error">{error}</p>
        <div className="gallery-actions">
          <button className="primary-btn" type="submit" disabled={pending}>{pending ? '提交中…' : '提交审核'}</button>
          <button className="ghost-btn" type="button" onClick={onClose} disabled={pending}>先不了</button>
        </div>
      </form>
    </div>
  )
}
