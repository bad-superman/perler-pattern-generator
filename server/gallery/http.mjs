import { GALLERY_LIMITS } from './limits.mjs'
import { listAdmin, listPublic, submitShare, updateShare } from './service.mjs'

function json(status, payload, cache) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache || 'no-store',
    },
  })
}

function authorized(request, adminToken) {
  if (!adminToken) return 'missing'
  const header = request.headers.get('Authorization') || ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (presented.length !== adminToken.length) return 'wrong'
  let diff = 0
  for (let index = 0; index < presented.length; index += 1) diff |= presented.charCodeAt(index) ^ adminToken.charCodeAt(index)
  return diff === 0 ? 'ok' : 'wrong'
}

function clientIp(request, fallback) {
  return fallback || request.headers.get('CF-Connecting-IP') || 'unknown'
}

export async function handleGalleryRequest(request, store, options = {}) {
  const url = new URL(request.url)
  const admin = url.pathname.startsWith('/api/admin/gallery')
  const parts = url.pathname.split('/').filter(Boolean)
  const id = admin ? parts[3] : parts[2]
  if (admin) {
    const access = authorized(request, options.adminToken)
    if (access === 'missing') return json(503, { error: '管理员登录未配置' })
    if (access !== 'ok') return json(401, { error: '需要管理员身份' })
    if (request.method === 'GET' && !id) {
      const result = await listAdmin(store, url.searchParams.get('status') || 'pending')
      return json(result.ok ? 200 : result.status, result.ok ? { items: result.items } : { error: result.error })
    }
    if (request.method === 'PATCH' && id) {
      const patch = await request.json().catch(() => null)
      const result = await updateShare(store, id, patch || {}, options.now)
      return json(result.status, result.ok ? result.item : { error: result.error })
    }
    if (request.method === 'DELETE' && id) {
      const removed = await store.remove(id)
      return json(removed ? 200 : 404, removed ? { ok: true } : { error: '记录不存在' })
    }
    return json(405, { error: '不支持的操作' })
  }

  if (request.method === 'GET' && !id) {
    const page = Number(url.searchParams.get('page') || 1)
    const pageSize = Number(url.searchParams.get('pageSize') || GALLERY_LIMITS.maxPageSize)
    const body = await listPublic(store, {
      page: Number.isInteger(page) ? page : 1,
      pageSize: Number.isInteger(pageSize) ? pageSize : GALLERY_LIMITS.maxPageSize,
    })
    return json(200, body, 'public, max-age=60')
  }
  if (request.method === 'POST' && !id) {
    const input = await request.json().catch(() => null)
    const result = await submitShare(store, input, { now: options.now, ip: clientIp(request, options.ip) })
    return json(result.status, result.ok ? result.item : { error: result.error })
  }
  if (request.method === 'GET' && id) {
    const row = await store.findById(id)
    if (!row || row.status !== 'approved') return json(404, { error: '图纸不存在' })
    return json(200, {
      id: row.id,
      nickname: row.nickname,
      brand: row.brand,
      cols: row.cols,
      rows: row.rows,
      mirrored: Boolean(row.mirrored),
      colorCount: row.colorCount,
      cells: row.cells,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
    }, 'public, max-age=60')
  }
  return json(405, { error: '不支持的操作' })
}
