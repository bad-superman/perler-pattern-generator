import { ACCESS_ERRORS, AccessError } from './errors.mjs'
import { generateAccessToken, hashAccessToken } from './token.mjs'
import { assertPassUsable, normalizeCredits, normalizeExpiry } from './validate.mjs'

function id(prefix, cryptoApi = globalThis.crypto) {
  return `${prefix}_${cryptoApi.randomUUID().replaceAll('-', '')}`
}

export function publicPass(pass, now = Date.now()) {
  const availableCredits = Math.max(0, pass.remainingCredits - pass.reservedCredits)
  return {
    id: pass.id,
    label: pass.label,
    totalCredits: pass.totalCredits,
    remainingCredits: pass.remainingCredits,
    availableCredits,
    reservedCredits: pass.reservedCredits,
    status: pass.status,
    expiresAt: pass.expiresAt,
    createdAt: pass.createdAt,
    updatedAt: pass.updatedAt,
    expired: Boolean(pass.expiresAt && pass.expiresAt <= now),
  }
}

export async function createPass(store, input, options = {}) {
  const now = options.now ?? Date.now()
  const cryptoApi = options.cryptoApi ?? globalThis.crypto
  const totalCredits = normalizeCredits(input.totalCredits)
  const expiresAt = normalizeExpiry(input.expiresAt)
  const token = generateAccessToken(cryptoApi)
  const pass = await store.createPass({
    id: id('pass', cryptoApi),
    tokenHash: await hashAccessToken(token, cryptoApi),
    label: String(input.label || '').trim().slice(0, 100),
    totalCredits,
    expiresAt,
    createdAt: now,
  }, { id: id('ledger', cryptoApi) })
  return { pass: publicPass(pass, now), token }
}

export async function verifyToken(store, token, options = {}) {
  if (!token) throw ACCESS_ERRORS.invalid()
  const pass = await store.findPassByTokenHash(await hashAccessToken(token, options.cryptoApi))
  return publicPass(assertPassUsable(pass, options.now ?? Date.now(), { requireCredits: false }), options.now ?? Date.now())
}

export async function beginGeneration(store, token, requestId, options = {}) {
  const now = options.now ?? Date.now()
  if (!requestId || requestId.length > 100) throw new AccessError('INVALID_REQUEST_ID', '缺少有效的幂等请求标识', 400)
  const tokenHash = await hashAccessToken(token, options.cryptoApi)
  const pass = assertPassUsable(await store.findPassByTokenHash(tokenHash), now)
  const existing = await store.findJobByRequest(pass.id, requestId)
  if (existing?.status === 'succeeded') throw ACCESS_ERRORS.duplicate()
  if (existing?.status === 'processing') throw ACCESS_ERRORS.processing()
  const cryptoApi = options.cryptoApi ?? globalThis.crypto
  const job = { id: id('job', cryptoApi), requestId }
  const reserved = await store.reserve(pass.id, job, now)
  if (!reserved) {
    const latest = await store.findPassById(pass.id)
    assertPassUsable(latest, now)
    throw ACCESS_ERRORS.processing()
  }
  return { pass, job: { ...job, passId: pass.id } }
}

export async function completeGeneration(store, job, details = {}, options = {}) {
  const claimed = await store.claimJob(job.id, 'reserved', 'charging')
  if (!claimed) return store.findPassById(job.passId)
  const cryptoApi = options.cryptoApi ?? globalThis.crypto
  try {
    return await store.charge(job.id, job.passId, details, id('ledger', cryptoApi), options.now ?? Date.now())
  } catch (error) {
    if (await store.claimJob(job.id, 'charging', 'releasing')) {
      await store.release(job.id, job.passId, { code: 'CHARGE_FAILED', message: error instanceof Error ? error.message : String(error) }, options.now ?? Date.now())
    }
    throw error
  }
}

export async function failGeneration(store, job, error, options = {}) {
  const claimed = await store.claimJob(job.id, 'reserved', 'releasing')
  if (!claimed) return store.findPassById(job.passId)
  return store.release(job.id, job.passId, {
    code: error?.code || 'AI_GENERATION_FAILED',
    message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
  }, options.now ?? Date.now())
}

export async function adjustPassCredits(store, passId, delta, options = {}) {
  const value = Number(delta)
  if (!Number.isInteger(value) || value === 0 || Math.abs(value) > 10000) {
    throw new AccessError('INVALID_CREDIT_ADJUSTMENT', '调整次数必须是非零整数', 400)
  }
  const cryptoApi = options.cryptoApi ?? globalThis.crypto
  const pass = await store.adjustCredits(passId, value, id('ledger', cryptoApi), options.now ?? Date.now())
  if (!pass) throw new AccessError('CREDIT_ADJUSTMENT_FAILED', '次数调整失败，请检查余额和预占次数', 409)
  return publicPass(pass, options.now ?? Date.now())
}

export async function reconcileStaleReservations(store, options = {}) {
  const now = options.now ?? Date.now()
  const staleBefore = now - (options.staleAfterMs ?? 10 * 60 * 1000)
  const jobs = await store.listStaleJobs(staleBefore)
  let released = 0
  for (const job of jobs) {
    const claimed = await store.claimJob(job.id, job.creditState, 'releasing')
    if (!claimed) continue
    await store.release(job.id, job.passId, {
      code: 'STALE_RESERVATION_RELEASED',
      message: '生成任务超时，系统已释放预占次数',
    }, now)
    released += 1
  }
  return { inspected: jobs.length, released }
}
