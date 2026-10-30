function mapRow(row) {
  return {
    id: row.id,
    nickname: row.nickname,
    status: row.status,
    brand: row.brand,
    cols: row.cols,
    rows: row.rows,
    mirrored: Boolean(row.mirrored),
    colorCount: row.color_count ?? row.colorCount,
    cells: typeof row.cells_json === 'string' ? JSON.parse(row.cells_json) : row.cells,
    contentHash: row.content_hash ?? row.contentHash,
    ipHash: row.ip_hash ?? row.ipHash,
    createdAt: row.created_at ?? row.createdAt,
    reviewedAt: row.reviewed_at ?? row.reviewedAt ?? null,
  }
}

export function createD1Store(db) {
  return {
    async insert(row) {
      await db.prepare(`INSERT INTO gallery_shares
        (id, nickname, status, brand, cols, rows, mirrored, color_count, cells_json, content_hash, ip_hash, created_at, reviewed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`).bind(
        row.id,
        row.nickname,
        row.status,
        row.brand,
        row.cols,
        row.rows,
        row.mirrored ? 1 : 0,
        row.colorCount,
        JSON.stringify(row.cells),
        row.contentHash,
        row.ipHash,
        row.createdAt,
        row.reviewedAt,
      ).run()
    },
    async findById(id) {
      const row = await db.prepare('SELECT * FROM gallery_shares WHERE id = ?1').bind(id).first()
      return row ? mapRow(row) : null
    },
    async countSinceByIp(ipHash, since) {
      const row = await db.prepare('SELECT COUNT(*) AS total FROM gallery_shares WHERE ip_hash = ?1 AND created_at >= ?2').bind(ipHash, since).first()
      return Number(row?.total ?? 0)
    },
    async findSinceByHash(contentHash, since) {
      const row = await db.prepare('SELECT * FROM gallery_shares WHERE content_hash = ?1 AND created_at >= ?2 LIMIT 1').bind(contentHash, since).first()
      return row ? mapRow(row) : null
    },
    async listApproved({ offset, limit }) {
      const count = await db.prepare(`SELECT COUNT(*) AS total FROM gallery_shares WHERE status = 'approved'`).first()
      const result = await db.prepare(`SELECT * FROM gallery_shares WHERE status = 'approved' ORDER BY reviewed_at DESC, created_at DESC LIMIT ?1 OFFSET ?2`).bind(limit, offset).all()
      return { total: Number(count?.total ?? 0), rows: (result.results ?? []).map(mapRow) }
    },
    async listByStatus(status) {
      const result = await db.prepare('SELECT * FROM gallery_shares WHERE status = ?1 ORDER BY created_at DESC').bind(status).all()
      return (result.results ?? []).map(mapRow)
    },
    async update(id, patch) {
      const current = await this.findById(id)
      if (!current) return null
      const next = { ...current, ...patch }
      await db.prepare(`UPDATE gallery_shares
        SET nickname = ?1, status = ?2, reviewed_at = ?3
        WHERE id = ?4`).bind(next.nickname, next.status, next.reviewedAt, id).run()
      return next
    },
    async remove(id) {
      const result = await db.prepare('DELETE FROM gallery_shares WHERE id = ?1').bind(id).run()
      return (result.meta?.changes ?? 0) > 0
    },
  }
}
