import { createAccessD1Store } from '../../../../server/access/d1-store.mjs'
import { errorResponse, json, requireAdmin, requirePaidDb } from '../../../../server/access/http.mjs'
import { reconcileStaleReservations } from '../../../../server/access/service.mjs'

export async function onRequestPost(context) {
  try {
    requireAdmin(context.request, context.env.ADMIN_TOKEN || context.env.ADMIN_GALLERY_TOKEN)
    const result = await reconcileStaleReservations(createAccessD1Store(await requirePaidDb(context.env, context.request)))
    return json(200, result)
  } catch (error) {
    return errorResponse(error)
  }
}

export function onRequest() {
  return json(405, { error: '不支持的操作' })
}
