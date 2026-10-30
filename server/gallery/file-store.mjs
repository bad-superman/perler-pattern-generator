import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createMemoryStore } from './memory-store.mjs'

export function createFileStore(file) {
  let seed = []
  try {
    seed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    seed = []
  }
  const memory = createMemoryStore(seed)
  const save = () => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(memory.all()))
  }
  return {
    insert: async (row) => { await memory.insert(row); save() },
    update: async (id, patch) => { const row = await memory.update(id, patch); save(); return row },
    remove: async (id) => { const removed = await memory.remove(id); save(); return removed },
    findById: (id) => memory.findById(id),
    countSinceByIp: (ipHash, since) => memory.countSinceByIp(ipHash, since),
    findSinceByHash: (contentHash, since) => memory.findSinceByHash(contentHash, since),
    listApproved: (query) => memory.listApproved(query),
    listByStatus: (status) => memory.listByStatus(status),
  }
}
