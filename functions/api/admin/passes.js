import { createAccessD1Store } from '../../../server/access/d1-store.mjs'
import { errorResponse, json, requireAdmin, requirePaidDb } from '../../../server/access/http.mjs'
import { createPass, publicPass } from '../../../server/access/service.mjs'
import { resolvePaidSiteOrigin } from '../../../server/site/config.mjs'

export async function onRequest(context) {
  try {
    await requireAdmin(context.request, context.env.ADMIN_TOKEN || context.env.ADMIN_GALLERY_TOKEN)
    const store = createAccessD1Store(await requirePaidDb(context.env, context.request))
    if (context.request.method === 'GET') {
      return json(200, { items: (await store.listPasses()).map((pass) => publicPass(pass)) })
    }
    if (context.request.method === 'POST') {
      const input = await context.request.json().catch(() => ({}))
      const created = await createPass(store, input)
      const origin = resolvePaidSiteOrigin(context.env, context.request)
      return json(201, { ...created, url: `${origin}/access/${created.token}` })
    }
    return json(405, { error: '不支持的操作' })
  } catch (error) {
    return errorResponse(error)
  }
}
