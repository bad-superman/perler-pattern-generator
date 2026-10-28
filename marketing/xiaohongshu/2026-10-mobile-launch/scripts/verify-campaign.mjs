import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function assertFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  const info = await stat(absolutePath).catch(() => {
    throw new Error(`Missing asset: ${relativePath}`)
  })
  if (!info.isFile() || info.size === 0) throw new Error(`Missing asset: ${relativePath}`)
  return absolutePath
}

export async function readPngSize(relativePath) {
  const buffer = await readFile(await assertFile(relativePath))
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not PNG: ${relativePath}`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

await assertFile('source/pet-reference.png')
const publish = await readFile(await assertFile('copy/publish.md'), 'utf8')
for (const phrase of ['免费', '无需登录', '主页', '#拼豆图纸']) {
  if (!publish.includes(phrase)) throw new Error(`Copy missing phrase: ${phrase}`)
}
console.log(JSON.stringify({ stage: 'foundation', ok: true }))
