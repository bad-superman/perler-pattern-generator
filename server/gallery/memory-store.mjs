export function createMemoryStore(seed = []) {
  const rows = seed.map((row) => ({ ...row }))
  return {
    async insert(row) {
      rows.push({ ...row })
    },
    async findById(id) {
      return rows.find((row) => row.id === id) ?? null
    },
    async countSinceByIp(ipHash, since) {
      return rows.filter((row) => row.ipHash === ipHash && row.createdAt >= since).length
    },
    async findSinceByHash(contentHash, since) {
      return rows.find((row) => row.contentHash === contentHash && row.createdAt >= since) ?? null
    },
    async listApproved({ offset, limit }) {
      const approved = rows
        .filter((row) => row.status === 'approved')
        .sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0) || b.createdAt - a.createdAt)
      return { total: approved.length, rows: approved.slice(offset, offset + limit) }
    },
    async listByStatus(status) {
      return rows
        .filter((row) => row.status === status)
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    async update(id, patch) {
      const row = rows.find((entry) => entry.id === id)
      if (!row) return null
      Object.assign(row, patch)
      return { ...row }
    },
    async remove(id) {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) return false
      rows.splice(index, 1)
      return true
    },
    all() {
      return rows.map((row) => ({ ...row }))
    },
  }
}
