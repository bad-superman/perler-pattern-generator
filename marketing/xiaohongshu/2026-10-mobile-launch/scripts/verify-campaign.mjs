import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execFileAsync = promisify(execFile)

export async function assertFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  let info
  try {
    info = await stat(absolutePath)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing asset: ${relativePath}`)
    throw error
  }
  if (!info.isFile() || info.size === 0) throw new Error(`Missing asset: ${relativePath}`)
  return absolutePath
}

async function assertDirectoryEntries(relativePath, expected) {
  const actual = (await readdir(path.join(root, relativePath))).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`Wrong ${relativePath} manifest: ${actual.join(', ')}`)
  }
}

export async function readPngSize(relativePath) {
  const buffer = await readFile(await assertFile(relativePath))
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not PNG: ${relativePath}`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const source = ['pet-reference.png']
const screenshots = [
  'source-card.png',
  'result-symbols.png',
  'result-solid.png',
  'editor.png',
  'export-sheet.png',
]
const carousel = [
  '01-cover.png',
  '02-pain-point.png',
  '03-upload.png',
  '04-result.png',
  '05-edit.png',
  '06-save.png',
  '07-cta.png',
]
const videos = ['mobile-demo.mp4']
const copy = ['publish.md']

await assertDirectoryEntries('source', source)
await assertDirectoryEntries('screenshots', screenshots)
await assertDirectoryEntries('carousel', [...carousel, 'slides.html'])
await assertDirectoryEntries('video', videos)
await assertDirectoryEntries('copy', copy)

await assertFile(`source/${source[0]}`)
const publish = await readFile(await assertFile(`copy/${copy[0]}`), 'utf8')
for (const phrase of ['免费', '无需登录', '主页', '#拼豆图纸']) {
  if (!publish.includes(phrase)) throw new Error(`Copy missing phrase: ${phrase}`)
}
if (/(二维码|扫码)/u.test(publish)) throw new Error('Copy contains QR-code guidance')

function readSection(heading) {
  const match = publish.match(
    new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'mu'),
  )
  if (!match?.[1].trim()) throw new Error(`Copy missing section: ${heading}`)
  return match[1].trim()
}

readSection('首选标题')
readSection('正文')
const tags = readSection('标签').match(/#[^\s`]+/gu) ?? []
if (tags.length !== 8) throw new Error(`Copy must contain exactly 8 tags, found ${tags.length}`)
readSection('置顶评论')

for (const screenshot of screenshots) {
  const relativePath = `screenshots/${screenshot}`
  const { width, height } = await readPngSize(relativePath)
  if (width < 300 || height < 200) throw new Error(`Screenshot too small: ${relativePath}`)
}
for (const name of carousel) {
  const size = await readPngSize(`carousel/${name}`)
  if (size.width !== 1242 || size.height !== 1660) {
    throw new Error(`Wrong carousel size: ${name} ${size.width}x${size.height}`)
  }
}
const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'stream=width,height,codec_name:format=duration',
  '-of', 'json',
  await assertFile(`video/${videos[0]}`),
])
const probe = JSON.parse(stdout)
const video = probe.streams.find((stream) => stream.codec_name === 'h264')
const duration = Number(probe.format.duration)
if (!video || video.width !== 1080 || video.height !== 1920) throw new Error('Wrong video format')
if (duration < 20 || duration > 25) throw new Error(`Wrong video duration: ${duration}`)

console.log(JSON.stringify({ stage: 'video', ok: true, duration, video }))
