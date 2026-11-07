import { createAccessD1Store } from '../../../server/access/d1-store.mjs'
import { errorResponse, json, requirePaidDb } from '../../../server/access/http.mjs'
import { verifyToken } from '../../../server/access/service.mjs'

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}))
    const pass = await verifyToken(createAccessD1Store(await requirePaidDb(context.env, context.request)), body.token)
    return json(200, { valid: true, pass })
  } catch (error) {
    return errorResponse(error)
  }
}

export function onRequest() {
  return json(405, { error: '不支持的操作' })
}
