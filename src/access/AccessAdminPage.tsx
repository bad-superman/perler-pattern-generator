import { useEffect, useState, type FormEvent } from 'react'
import { createAccessPass, fetchAccessPassDetail, fetchAccessPasses, reconcileAccessPasses, updateAccessPass, type AccessPassDetail, type AccessPassSummary } from './client'
import '../gallery/gallery.css'

const TOKEN_KEY = 'gallery-admin-token'

export function AccessAdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [draft, setDraft] = useState(token)
  const [items, setItems] = useState<AccessPassSummary[]>([])
  const [label, setLabel] = useState('')
  const [credits, setCredits] = useState(10)
  const [expires, setExpires] = useState('')
  const [createdUrl, setCreatedUrl] = useState('')
  const [detail, setDetail] = useState<AccessPassDetail | null>(null)
  const [error, setError] = useState('')

  async function load(nextToken = token) {
    if (!nextToken) return setItems([])
    try {
      setItems(await fetchAccessPasses(nextToken))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load() })
    return () => window.cancelAnimationFrame(frame)
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  function login(event: FormEvent) {
    event.preventDefault()
    sessionStorage.setItem(TOKEN_KEY, draft)
    setToken(draft)
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    try {
      const result = await createAccessPass(token, {
        label,
        totalCredits: credits,
        expiresAt: expires ? new Date(`${expires}T23:59:59+08:00`).getTime() : null,
      })
      setCreatedUrl(result.url)
      setLabel('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    }
  }

  async function patch(id: string, input: Parameters<typeof updateAccessPass>[2]) {
    try {
      await updateAccessPass(token, id, input)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    }
  }

  return (
    <main className="app-shell gallery-admin">
      <header className="gallery-head"><h2>付费链接管理</h2><p>创建专属链接、调整 AI 次数并停用异常链接。</p></header>
      <form className="gallery-token" onSubmit={login}>
        <input type="password" value={draft} placeholder="管理员口令" onChange={(event) => setDraft(event.target.value)} />
        <button className="primary-btn" type="submit">进入</button>
      </form>
      {token && <form className="gallery-token access-create-form" onSubmit={(event) => void create(event)}>
        <input value={label} maxLength={100} placeholder="客户或订单备注" onChange={(event) => setLabel(event.target.value)} />
        <input type="number" min={1} max={10000} value={credits} onChange={(event) => setCredits(Number(event.target.value))} />
        <input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} />
        <button className="primary-btn" type="submit">创建链接</button>
      </form>}
      {createdUrl && <div className="access-created"><input readOnly value={createdUrl} /><button type="button" onClick={() => void navigator.clipboard.writeText(createdUrl)}>复制</button></div>}
      {token && <button className="ghost-btn" type="button" onClick={() => void reconcileAccessPasses(token).then((result) => { setError(`已检查 ${result.inspected} 个异常任务，释放 ${result.released} 个预占次数`); return load() }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '清理失败'))}>清理超时预占</button>}
      {error && <p className="gallery-error">{error}</p>}
      <div className="gallery-table-wrap"><table className="gallery-table">
        <thead><tr><th>备注</th><th>次数</th><th>状态</th><th>有效期</th><th>操作</th></tr></thead>
        <tbody>
          {!items.length && <tr><td colSpan={5} className="gallery-muted">暂无专属链接</td></tr>}
          {items.map((item) => <tr key={item.id}>
            <td>{item.label || '未命名'}<small className="access-id">{item.id}</small></td>
            <td>{item.availableCredits} 可用 / {item.totalCredits} 总计{item.reservedCredits ? ` · ${item.reservedCredits} 处理中` : ''}</td>
            <td>{item.expired ? '已过期' : item.status === 'active' ? '启用' : '停用'}</td>
            <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('zh-CN') : '永久'}</td>
            <td className="gallery-ops">
              <button type="button" className="gallery-ok" onClick={() => void patch(item.id, { action: 'adjust', delta: 1 })}>+1</button>
              <button type="button" className="ghost-btn" disabled={item.availableCredits <= 0} onClick={() => void patch(item.id, { action: 'adjust', delta: -1 })}>-1</button>
              <button type="button" className={item.status === 'active' ? 'gallery-danger' : 'gallery-ok'} onClick={() => void patch(item.id, { action: 'status', status: item.status === 'active' ? 'disabled' : 'active' })}>{item.status === 'active' ? '停用' : '启用'}</button>
              <button type="button" className="ghost-btn" onClick={() => void fetchAccessPassDetail(token, item.id).then(setDetail).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '加载明细失败'))}>明细</button>
            </td>
          </tr>)}
        </tbody>
      </table></div>
      {detail && <section className="access-detail">
        <div className="access-detail-head"><h3>{detail.pass.label || detail.pass.id} · 使用明细</h3><button type="button" onClick={() => setDetail(null)}>关闭</button></div>
        <h4>最近任务</h4>
        <ul>{detail.jobs.length ? detail.jobs.map((job) => <li key={job.id}>{new Date(job.createdAt).toLocaleString('zh-CN')} · {job.status}/{job.creditState} · {job.model || job.errorMessage || '无详情'}</li>) : <li>暂无生成任务</li>}</ul>
        <h4>次数流水</h4>
        <ul>{detail.ledger.map((entry) => <li key={entry.id}>{new Date(entry.created_at).toLocaleString('zh-CN')} · {entry.reason} · {entry.delta > 0 ? '+' : ''}{entry.delta} · 余额 {entry.balance_after}</li>)}</ul>
      </section>}
    </main>
  )
}
