import {
  AiConfigError,
  describeAiConfig,
  formatAttemptLog,
  maskKey,
  resolveAiConfig,
} from '../../../server/ai/index.mjs'
import { executeGenerateRequest } from '../../../server/ai/http.mjs'

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

// Visible in Cloudflare: Pages project → Deployments → <deployment> → Functions →
// "Begin log stream", or `wrangler pages deployment tail --project-name <name>`.
const generateHooks = {
  onAttempt(attempt, config) {
    const line = formatAttemptLog(attempt, config)
    if (attempt.ok) console.log(line)
    else console.warn(line)
  },
  onFallback({ from, to }) {
    console.warn(`[ai] fallback ${from} → ${to}`)
  },
}

async function handlePost(context, aiConfig) {
  const { result, meta } = await executeGenerateRequest(context.request, aiConfig, generateHooks)
  console.log(`[ai] request count=${meta.count} size=${meta.size} ratio=${meta.ratio || '-'} image=${meta.imageSize ? `${Math.round(meta.imageSize / 1024)}KB` : 'none'} effect=${meta.hasEffectImage ? 'yes' : 'no'} default=${aiConfig.default.model} key=${maskKey(aiConfig.default.apiKey)} fallback=${aiConfig.fallback?.model ?? 'none'}`)
  return jsonResponse(200, result)
}

export async function onRequest(context) {
  try {
    const { method } = context.request

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: 'GET, POST, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (method !== 'GET' && method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    // Resolve per request: Pages Functions have no startup hook, and env can
    // differ between preview and production deployments.
    let aiConfig
    try {
      aiConfig = resolveAiConfig(context.env ?? {})
    } catch (cause) {
      if (method === 'GET') {
        return jsonResponse(200, {
          ok: false,
          route: '/api/agnes/generate',
          error: cause instanceof Error ? cause.message : String(cause),
        })
      }
      throw cause
    }

    if (method === 'GET') {
      return jsonResponse(200, { ok: true, route: '/api/agnes/generate', ...describeAiConfig(aiConfig) })
    }

    return await handlePost(context, aiConfig)
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      console.error(`[ai] config error: ${cause.message}`)
      return jsonResponse(500, { error: cause.message })
    }
    const message = cause instanceof Error ? cause.message : 'AI 生成失败'
    const status = Number(cause?.status) || 502
    const attempts = cause && typeof cause === 'object' && 'attempts' in cause ? cause.attempts : undefined
    console.error(`[ai] request failed: ${message}`)
    return jsonResponse(status, attempts ? { error: message, attempts } : { error: message })
  }
}
