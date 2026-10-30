import { useEffect, useState, type FormEvent } from 'react'
import { deleteAdminGallery, fetchAdminGallery, formatGalleryDate, updateAdminGallery, type GalleryItem } from './client'
import { PatternPreview } from './PatternPreview'
import './gallery.css'

const TOKEN_KEY = 'gallery-admin-token'
const TABS = [
  ['pending', '待审核'],
  ['approved', '已通过'],
  ['rejected', '未通过'],
  ['hidden', '已隐藏'],
] as const

type Status = (typeof TABS)[number][0]

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [draft, setDraft] = useState(token)
  const [status, setStatus] = useState<Status>('pending')
  const [items, setItems] = useState<GalleryItem[]>([])
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function load(nextToken = token, nextStatus = status) {
    if (!nextToken) {
      setItems([])
      return
    }
    try {
      setItems(await fetchAdminGallery(nextToken, nextStatus))
      setError('')
    } catch (cause) {
      setItems([])
      setError(cause instanceof Error ? cause.message : '加载失败')
    }
  }

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    fetchAdminGallery(token, status)
      .then((next) => {
        if (cancelled) return
        setItems(next)
        setError('')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setItems([])
        setError(cause instanceof Error ? cause.message : '加载失败')
      })
    return () => { cancelled = true }
  }, [token, status])

  async function saveToken(event: FormEvent) {
    event.preventDefault()
    sessionStorage.setItem(TOKEN_KEY, draft)
    if (!draft) setItems([])
    setToken(draft)
  }

  async function patch(id: string, body: { nickname?: string; status?: string }) {
    try {
      await updateAdminGallery(token, id, body)
      setEditingId(null)
      setConfirmId(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }

  return (
    <main className="app-shell gallery-admin">
      <header className="gallery-head">
        <h2>图库审核</h2>
        <p>通过后才会出现在酷图。本地开发口令是 dev-gallery-admin。</p>
      </header>
      <form className="gallery-token" onSubmit={(event) => void saveToken(event)}>
        <input type="password" value={draft} placeholder="管理员口令" onChange={(event) => setDraft(event.target.value)} />
        <button className="primary-btn" type="submit">进入</button>
      </form>
      <div className="gallery-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={status === id ? 'active' : ''} onClick={() => setStatus(id)}>{label}</button>
        ))}
      </div>
      {error && <p className="gallery-error">{error}</p>}
      <div className="gallery-table-wrap">
        <table className="gallery-table">
          <thead>
            <tr><th>预览</th><th>昵称</th><th>尺寸</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="gallery-muted">这一栏是空的</td></tr>}
            {items.map((item) => (
              <tr key={item.id}>
                <td><PatternPreview cells={item.cells} cols={item.cols} rows={item.rows} brand={item.brand} /></td>
                <td>
                  {editingId === item.id ? (
                    <form className="gallery-actions" onSubmit={(event) => { event.preventDefault(); void patch(item.id, { nickname }) }}>
                      <input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} />
                      <button className="primary-btn" type="submit">保存</button>
                    </form>
                  ) : item.nickname}
                </td>
                <td>{item.cols}×{item.rows} · {item.colorCount} 色</td>
                <td>{formatGalleryDate(item.createdAt)}</td>
                <td className="gallery-ops">
                  {confirmId === item.id ? (
                    <>
                      <button type="button" className="gallery-danger" onClick={() => void deleteAdminGallery(token, item.id).then(() => load()).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '删除失败'))}>确认删除</button>
                      <button type="button" className="ghost-btn" onClick={() => setConfirmId(null)}>取消</button>
                    </>
                  ) : (
                    <>
                      {item.status === 'pending' && <button type="button" className="gallery-ok" onClick={() => void patch(item.id, { status: 'approved' })}>通过</button>}
                      {item.status === 'pending' && <button type="button" className="gallery-warn" onClick={() => void patch(item.id, { status: 'rejected' })}>不通过</button>}
                      {item.status === 'approved' && <button type="button" className="ghost-btn" onClick={() => void patch(item.id, { status: 'hidden' })}>隐藏</button>}
                      {item.status === 'hidden' && <button type="button" className="gallery-ok" onClick={() => void patch(item.id, { status: 'approved' })}>恢复公开</button>}
                      {item.status === 'rejected' && <button type="button" className="gallery-ok" onClick={() => void patch(item.id, { status: 'approved' })}>改为通过</button>}
                      <button type="button" className="ghost-btn" onClick={() => { setEditingId(item.id); setNickname(item.nickname) }}>改昵称</button>
                      <button type="button" className="gallery-danger" onClick={() => setConfirmId(item.id)}>删除</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
