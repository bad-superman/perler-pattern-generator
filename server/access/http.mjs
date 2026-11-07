import { AccessError } from './errors.mjs'

export function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function errorResponse(error) {
  if (error instanceof AccessError) return json(error.status, { code: error.code, error: error.message })
  const status = Number(error?.status) || 500
  return json(status, { code: error?.code || 'INTERNAL_ERROR', error: error instanceof Error ? error.message : '服务异常' })
}

export function requireAdmin(request, adminToken) {
  if (!adminToken) throw new AccessError('ADMIN_NOT_CONFIGURED', '管理员登录未配置', 503)
  const header = request.headers.get('Authorization') || ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (presented.length !== adminToken.length) throw new AccessError('ADMIN_UNAUTHORIZED', '需要管理员身份', 401)
  let diff = 0
  for (let index = 0; index < presented.length; index += 1) diff |= presented.charCodeAt(index) ^ adminToken.charCodeAt(index)
  if (diff !== 0) throw new AccessError('ADMIN_UNAUTHORIZED', '需要管理员身份', 401)
}

export function requirePaidDb(env) {
  if (!env?.PAID_DB) throw new AccessError('PAID_DB_NOT_CONFIGURED', '付费数据库未配置', 503)
  return env.PAID_DB
}
