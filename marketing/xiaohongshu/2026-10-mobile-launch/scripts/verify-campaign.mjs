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
const screenshots = [
  'screenshots/source-card.png',
  'screenshots/result-symbols.png',
  'screenshots/result-solid.png',
  'screenshots/editor.png',
  'screenshots/export-sheet.png',
]
for (const screenshot of screenshots) {
  const { width, height } = await readPngSize(screenshot)
  if (width < 300 || height < 200) throw new Error(`Screenshot too small: ${screenshot}`)
}
const carousel = [
  '01-cover.png',
  '02-pain-point.png',
  '03-upload.png',
  '04-result.png',
  '05-edit.png',
  '06-save.png',
  '07-cta.png',
]
for (const name of carousel) {
  const size = await readPngSize(`carousel/${name}`)
  if (size.width !== 1242 || size.height !== 1660) {
    throw new Error(`Wrong carousel size: ${name} ${size.width}x${size.height}`)
  }
}
console.log(JSON.stringify({ stage: 'carousel', ok: true }))
