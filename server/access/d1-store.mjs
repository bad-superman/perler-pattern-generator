function mapPass(row) {
  if (!row) return null
  return {
    id: row.id,
    tokenHash: row.token_hash,
    label: row.label,
    totalCredits: Number(row.total_credits),
    remainingCredits: Number(row.remaining_credits),
    reservedCredits: Number(row.reserved_credits),
    status: row.status,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapJob(row) {
  if (!row) return null
  return {
    id: row.id,
    passId: row.pass_id,
    requestId: row.request_id,
    status: row.status,
    creditState: row.credit_state,
    provider: row.provider ?? null,
    model: row.model ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  }
}

export function createAccessD1Store(db) {
  return {
    async createPass(pass, ledger) {
      await db.batch([
        db.prepare(`INSERT INTO access_passes
          (id, token_hash, label, total_credits, remaining_credits, reserved_credits, status, expires_at, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?4, 0, 'active', ?5, ?6, ?6)`)
          .bind(pass.id, pass.tokenHash, pass.label, pass.totalCredits, pass.expiresAt, pass.createdAt),
        db.prepare(`INSERT INTO credit_ledger
          (id, pass_id, job_id, delta, balance_after, reason, created_at)
          VALUES (?1, ?2, NULL, ?3, ?3, 'pass_created', ?4)`)
          .bind(ledger.id, pass.id, pass.totalCredits, pass.createdAt),
      ])
      return this.findPassById(pass.id)
    },
    async findPassById(id) {
      return mapPass(await db.prepare('SELECT * FROM access_passes WHERE id = ?1').bind(id).first())
    },
    async findPassByTokenHash(tokenHash) {
      return mapPass(await db.prepare('SELECT * FROM access_passes WHERE token_hash = ?1').bind(tokenHash).first())
    },
    async listPasses() {
      const result = await db.prepare('SELECT * FROM access_passes ORDER BY created_at DESC').all()
      return (result.results || []).map(mapPass)
    },
    async updatePassStatus(id, status, now) {
      await db.prepare('UPDATE access_passes SET status = ?1, updated_at = ?2 WHERE id = ?3').bind(status, now, id).run()
      return this.findPassById(id)
    },
    async adjustCredits(id, delta, ledgerId, now) {
      const result = await db.prepare(`UPDATE access_passes
        SET total_credits = MAX(0, total_credits + ?1),
            remaining_credits = remaining_credits + ?1,
            updated_at = ?2
        WHERE id = ?3 AND remaining_credits + ?1 >= reserved_credits`).bind(delta, now, id).run()
      if (!(result.meta?.changes > 0)) return null
      const pass = await this.findPassById(id)
      await db.prepare(`INSERT INTO credit_ledger
        (id, pass_id, job_id, delta, balance_after, reason, created_at)
        VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)`)
        .bind(ledgerId, id, delta, pass.remainingCredits, delta >= 0 ? 'admin_add' : 'admin_remove', now).run()
      return pass
    },
    async findJobByRequest(passId, requestId) {
      return mapJob(await db.prepare('SELECT * FROM generation_jobs WHERE pass_id = ?1 AND request_id = ?2').bind(passId, requestId).first())
    },
    async reserve(passId, job, now) {
      const result = await db.prepare(`UPDATE access_passes
        SET reserved_credits = reserved_credits + 1, updated_at = ?1
        WHERE id = ?2 AND status = 'active' AND remaining_credits - reserved_credits > 0
          AND (expires_at IS NULL OR expires_at > ?1)`).bind(now, passId).run()
      if (!(result.meta?.changes > 0)) return false
      try {
        await db.prepare(`INSERT INTO generation_jobs
          (id, pass_id, request_id, status, credit_state, created_at)
          VALUES (?1, ?2, ?3, 'processing', 'reserved', ?4)`)
          .bind(job.id, passId, job.requestId, now).run()
        return true
      } catch (error) {
        await db.prepare(`UPDATE access_passes SET reserved_credits = MAX(0, reserved_credits - 1), updated_at = ?1 WHERE id = ?2`).bind(now, passId).run()
        throw error
      }
    },
    async claimJob(jobId, from, to) {
      const result = await db.prepare('UPDATE generation_jobs SET credit_state = ?1 WHERE id = ?2 AND credit_state = ?3').bind(to, jobId, from).run()
      return (result.meta?.changes || 0) > 0
    },
    async charge(jobId, passId, details, ledgerId, now) {
      await db.batch([
        db.prepare(`UPDATE access_passes
          SET remaining_credits = remaining_credits - 1,
              reserved_credits = reserved_credits - 1,
              updated_at = ?1
          WHERE id = ?2 AND remaining_credits > 0 AND reserved_credits > 0`).bind(now, passId),
        db.prepare(`UPDATE generation_jobs
          SET status = 'succeeded', credit_state = 'charged', provider = ?1, model = ?2, completed_at = ?3
          WHERE id = ?4 AND credit_state = 'charging'`).bind(details.provider, details.model, now, jobId),
      ])
      const pass = await this.findPassById(passId)
      await db.prepare(`INSERT OR IGNORE INTO credit_ledger
        (id, pass_id, job_id, delta, balance_after, reason, created_at)
        VALUES (?1, ?2, ?3, -1, ?4, 'generation_succeeded', ?5)`)
        .bind(ledgerId, passId, jobId, pass.remainingCredits, now).run()
      return pass
    },
    async release(jobId, passId, details, now) {
      await db.batch([
        db.prepare(`UPDATE access_passes
          SET reserved_credits = MAX(0, reserved_credits - 1), updated_at = ?1
          WHERE id = ?2 AND reserved_credits > 0`).bind(now, passId),
        db.prepare(`UPDATE generation_jobs
          SET status = 'failed', credit_state = 'released', error_code = ?1, error_message = ?2, completed_at = ?3
          WHERE id = ?4 AND credit_state = 'releasing'`).bind(details.code, details.message, now, jobId),
      ])
      return this.findPassById(passId)
    },
    async listJobs(passId) {
      const result = await db.prepare('SELECT * FROM generation_jobs WHERE pass_id = ?1 ORDER BY created_at DESC LIMIT 100').bind(passId).all()
      return (result.results || []).map(mapJob)
    },
    async listStaleJobs(before) {
      const result = await db.prepare(`SELECT * FROM generation_jobs
        WHERE status = 'processing' AND credit_state IN ('reserved', 'charging') AND created_at < ?1
        ORDER BY created_at ASC LIMIT 100`).bind(before).all()
      return (result.results || []).map(mapJob)
    },
    async listLedger(passId) {
      const result = await db.prepare('SELECT * FROM credit_ledger WHERE pass_id = ?1 ORDER BY created_at DESC LIMIT 100').bind(passId).all()
      return result.results || []
    },
  }
}
