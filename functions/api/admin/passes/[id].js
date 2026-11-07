import { createAccessD1Store } from '../../../../server/access/d1-store.mjs'
import { AccessError } from '../../../../server/access/errors.mjs'
import { errorResponse, json, requireAdmin, requirePaidDb } from '../../../../server/access/http.mjs'
import { adjustPassCredits, publicPass } from '../../../../server/access/service.mjs'

export async function onRequest(context) {
  try {
    await requireAdmin(context.request, context.env.ADMIN_TOKEN || context.env.ADMIN_GALLERY_TOKEN)
    const store = createAccessD1Store(await requirePaidDb(context.env, context.request))
    const passId = context.params.id
    if (context.request.method === 'GET') {
      const pass = await store.findPassById(passId)
      if (!pass) throw new AccessError('PASS_NOT_FOUND', '专属链接不存在', 404)
      const [jobs, ledger] = await Promise.all([store.listJobs(passId), store.listLedger(passId)])
      return json(200, { pass: publicPass(pass), jobs, ledger })
    }
    if (context.request.method === 'PATCH') {
      const input = await context.request.json().catch(() => ({}))
      if (input.action === 'adjust') return json(200, { pass: await adjustPassCredits(store, passId, input.delta) })
      if (input.action === 'status' && ['active', 'disabled'].includes(input.status)) {
        const pass = await store.updatePassStatus(passId, input.status, Date.now())
        if (!pass) throw new AccessError('PASS_NOT_FOUND', '专属链接不存在', 404)
        return json(200, { pass: publicPass(pass) })
      }
      throw new AccessError('INVALID_ACTION', '不支持的管理操作', 400)
    }
    return json(405, { error: '不支持的操作' })
  } catch (error) {
    return errorResponse(error)
  }
}
