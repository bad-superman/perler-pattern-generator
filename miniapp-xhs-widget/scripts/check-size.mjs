import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
async function total(dir) {
  let size = 0
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name)
    const info = await stat(file)
    size += info.isDirectory() ? await total(file) : info.size
  }
  return size
}
const bytes = await total(root)
const mb = bytes / 1024 / 1024
console.log(`XHS widget dist: ${bytes} bytes (${mb.toFixed(2)} MiB)`)
if (mb > 2) {
  console.error('XHS widget package exceeds the 2 MiB limit')
  process.exitCode = 1
}
