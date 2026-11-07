import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginGeneration,
  completeGeneration,
  createPass,
  failGeneration,
  reconcileStaleReservations,
  verifyToken,
} from './service.mjs'

class MemoryAccessStore {
  passes = new Map()
  jobs = new Map()
  requestJobs = new Map()
  ledger = []

  async createPass(pass) {
    const row = { ...pass, remainingCredits: pass.totalCredits, reservedCredits: 0, status: 'active', updatedAt: pass.createdAt }
    this.passes.set(row.id, row)
    return { ...row }
  }
  async findPassById(id) { return this.passes.has(id) ? { ...this.passes.get(id) } : null }
  async findPassByTokenHash(hash) { return [...this.passes.values()].find((pass) => pass.tokenHash === hash) ?? null }
  async findJobByRequest(passId, requestId) { return this.requestJobs.get(`${passId}:${requestId}`) ?? null }
  async reserve(passId, job, now) {
    const pass = this.passes.get(passId)
    if (!pass || pass.status !== 'active' || pass.remainingCredits - pass.reservedCredits <= 0) return false
    pass.reservedCredits += 1
    pass.updatedAt = now
    const row = { ...job, passId, status: 'processing', creditState: 'reserved', createdAt: now }
    this.jobs.set(job.id, row)
    this.requestJobs.set(`${passId}:${job.requestId}`, row)
    return true
  }
  async claimJob(jobId, from, to) {
    const job = this.jobs.get(jobId)
    if (!job || job.creditState !== from) return false
    job.creditState = to
    return true
  }
  async charge(jobId, passId) {
    const pass = this.passes.get(passId)
    const job = this.jobs.get(jobId)
    pass.remainingCredits -= 1
    pass.reservedCredits -= 1
    job.status = 'succeeded'
    job.creditState = 'charged'
    return { ...pass }
  }
  async release(jobId, passId) {
    const pass = this.passes.get(passId)
    const job = this.jobs.get(jobId)
    pass.reservedCredits -= 1
    job.status = 'failed'
    job.creditState = 'released'
    return { ...pass }
  }
  async listStaleJobs(before) {
    return [...this.jobs.values()].filter((job) => job.status === 'processing' && ['reserved', 'charging'].includes(job.creditState) && job.createdAt < before)
  }
}

test('creates a non-guessable pass and verifies it without exposing its hash', async () => {
  const store = new MemoryAccessStore()
  const created = await createPass(store, { label: '订单 A', totalCredits: 3 })
  assert.match(created.token, /^[A-Za-z0-9_-]{32}$/)
  const pass = await verifyToken(store, created.token)
  assert.equal(pass.label, '订单 A')
  assert.equal(pass.availableCredits, 3)
  assert.equal('tokenHash' in pass, false)
})

test('successful generation charges exactly once', async () => {
  const store = new MemoryAccessStore()
  const { token } = await createPass(store, { totalCredits: 2 })
  const reservation = await beginGeneration(store, token, 'request-1')
  assert.equal((await verifyToken(store, token)).availableCredits, 1)
  await completeGeneration(store, reservation.job, { provider: 'default', model: 'test' })
  await completeGeneration(store, reservation.job, { provider: 'default', model: 'test' })
  const pass = await verifyToken(store, token)
  assert.equal(pass.remainingCredits, 1)
  assert.equal(pass.reservedCredits, 0)
})

test('failed generation releases the reservation without charging', async () => {
  const store = new MemoryAccessStore()
  const { token } = await createPass(store, { totalCredits: 1 })
  const reservation = await beginGeneration(store, token, 'request-1')
  await failGeneration(store, reservation.job, new Error('provider failed'))
  const pass = await verifyToken(store, token)
  assert.equal(pass.remainingCredits, 1)
  assert.equal(pass.availableCredits, 1)
})

test('concurrent requests cannot overdraw the last credit', async () => {
  const store = new MemoryAccessStore()
  const { token } = await createPass(store, { totalCredits: 1 })
  const settled = await Promise.allSettled([
    beginGeneration(store, token, 'request-a'),
    beginGeneration(store, token, 'request-b'),
  ])
  assert.equal(settled.filter((item) => item.status === 'fulfilled').length, 1)
  const rejected = settled.find((item) => item.status === 'rejected')
  assert.equal(rejected.reason.code, 'CREDITS_EXHAUSTED')
})

test('a completed idempotency key cannot be charged again', async () => {
  const store = new MemoryAccessStore()
  const { token } = await createPass(store, { totalCredits: 2 })
  const reservation = await beginGeneration(store, token, 'same-request')
  await completeGeneration(store, reservation.job)
  await assert.rejects(() => beginGeneration(store, token, 'same-request'), { code: 'REQUEST_ALREADY_SUCCEEDED' })
  assert.equal((await verifyToken(store, token)).remainingCredits, 1)
})

test('stale reservations can be reconciled without consuming a credit', async () => {
  const store = new MemoryAccessStore()
  const { token } = await createPass(store, { totalCredits: 1 })
  await beginGeneration(store, token, 'stale-request', { now: 1_000 })
  const result = await reconcileStaleReservations(store, { now: 1_000 + 11 * 60 * 1000 })
  assert.deepEqual(result, { inspected: 1, released: 1 })
  assert.equal((await verifyToken(store, token)).availableCredits, 1)
})
