import { createAccessD1Store } from '../../../server/access/d1-store.mjs'
import { errorResponse, json, requirePaidDb } from '../../../server/access/http.mjs'
import { beginGeneration, completeGeneration, failGeneration, publicPass } from '../../../server/access/service.mjs'
import { readBearerToken } from '../../../server/access/token.mjs'
import { executeGenerateRequest } from '../../../server/ai/http.mjs'
import { formatAttemptLog, resolveAiConfig } from '../../../server/ai/index.mjs'
import { resolveSiteMode } from '../../../server/site/config.mjs'

const hooks = {
  onAttempt(attempt, config) {
    const line = formatAttemptLog(attempt, config)
    if (attempt.ok) console.log(line)
    else console.warn(line)
  },
  onFallback({ from, to }) {
    console.warn(`[ai] fallback ${from} → ${to}`)
  },
}

export async function onRequestPost(context) {
  let reservation
  let store
  try {
    if (resolveSiteMode(context.env) !== 'pro') return json(404, { error: '接口不存在' })
    store = createAccessD1Store(requirePaidDb(context.env))
    reservation = await beginGeneration(
      store,
      readBearerToken(context.request),
      context.request.headers.get('Idempotency-Key') || '',
    )
    const aiConfig = resolveAiConfig(context.env || {})
    const { result } = await executeGenerateRequest(context.request, aiConfig, hooks, { forceCount: 1 })
    const first = result.images?.[0] || result
    const pass = await completeGeneration(store, reservation.job, {
      provider: first.provider || 'default',
      model: first.model || '',
    })
    return json(200, { ...result, pass: publicPass(pass), remainingCredits: pass.remainingCredits })
  } catch (error) {
    if (reservation && store) {
      try {
        await failGeneration(store, reservation.job, error)
      } catch (releaseError) {
        console.error(`[paid] failed to release reservation: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`)
      }
    }
    return errorResponse(error)
  }
}

export function onRequest() {
  return json(405, { error: '不支持的操作' })
}
