import { GALLERY_LIMITS } from './limits.mjs'
import { hashIp, validateNickname, validateShare } from './validate.mjs'

const STATUSES = new Set(['pending', 'approved', 'rejected', 'hidden'])

function publicItem(row) {
  return {
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
  }
}

export async function submitShare(store, input, { now = Date.now(), ip = 'unknown' } = {}) {
  const validated = await validateShare(input)
  if (!validated.ok) return { ok: false, status: 400, error: validated.error }
  const ipHash = await hashIp(ip)
  const since = now - GALLERY_LIMITS.duplicateWindowMs
  if (await store.findSinceByHash(validated.value.contentHash, since)) {
    return { ok: false, status: 409, error: '这张图纸刚刚分享过' }
  }
  if (await store.countSinceByIp(ipHash, since) >= GALLERY_LIMITS.dailyShareLimit) {
    return { ok: false, status: 429, error: '今天的分享次数已用完' }
  }
  const row = {
    id: crypto.randomUUID(),
    ...validated.value,
    status: 'pending',
    ipHash,
    createdAt: now,
    reviewedAt: null,
  }
  await store.insert(row)
  return { ok: true, status: 201, item: { id: row.id } }
}

export async function listPublic(store, { page = 1, pageSize = GALLERY_LIMITS.maxPageSize } = {}) {
  const size = Math.min(GALLERY_LIMITS.maxPageSize, Math.max(1, pageSize))
  const current = Math.max(1, page)
  const { total, rows } = await store.listApproved({ offset: (current - 1) * size, limit: size })
  return { page: current, pageSize: size, total, items: rows.map(publicItem) }
}

export async function updateShare(store, id, patch, now = Date.now()) {
  const current = await store.findById(id)
  if (!current) return { ok: false, status: 404, error: '记录不存在' }
  const next = {}
  if (patch.nickname !== undefined) {
    const nickname = validateNickname(patch.nickname)
    if (!nickname.ok) return { ok: false, status: 400, error: nickname.error }
    next.nickname = nickname.nickname
  }
  if (patch.status !== undefined) {
    if (!STATUSES.has(patch.status)) return { ok: false, status: 400, error: '状态无效' }
    next.status = patch.status
    if (patch.status === 'approved') next.reviewedAt = now
  }
  if (!Object.keys(next).length) return { ok: false, status: 400, error: '没有可修改的内容' }
  const updated = await store.update(id, next)
  return { ok: true, status: 200, item: { ...publicItem(updated), status: updated.status } }
}

export async function listAdmin(store, status) {
  if (!STATUSES.has(status)) return { ok: false, status: 400, error: '状态无效' }
  const rows = await store.listByStatus(status)
  return { ok: true, items: rows.map((row) => ({ ...publicItem(row), status: row.status })) }
}
