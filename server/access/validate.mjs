import { ACCESS_ERRORS, AccessError } from './errors.mjs'

export function normalizeCredits(value) {
  const credits = Number(value)
  if (!Number.isInteger(credits) || credits < 1 || credits > 10000) {
    throw new AccessError('INVALID_CREDITS', '次数必须是 1 到 10000 之间的整数', 400)
  }
  return credits
}

export function normalizeExpiry(value) {
  if (value === null || value === undefined || value === '') return null
  const expiry = Number(value)
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new AccessError('INVALID_EXPIRY', '有效期必须晚于当前时间', 400)
  }
  return Math.round(expiry)
}

export function assertPassUsable(pass, now = Date.now(), { requireCredits = true } = {}) {
  if (!pass) throw ACCESS_ERRORS.invalid()
  if (pass.status !== 'active') throw ACCESS_ERRORS.disabled()
  if (pass.expiresAt && pass.expiresAt <= now) throw ACCESS_ERRORS.expired()
  const available = pass.remainingCredits - pass.reservedCredits
  if (requireCredits && available <= 0) throw ACCESS_ERRORS.exhausted()
  return { ...pass, availableCredits: Math.max(0, available) }
}
