import path from 'node:path'
import { spawn } from 'node:child_process'

const platform = process.argv[2]
if (!['weapp', 'xhs'].includes(platform)) {
  console.error('Usage: node scripts/build-platform.mjs <weapp|xhs>')
  process.exit(2)
}

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)
const outputRoot = platform === 'weapp' ? 'dist' : 'dist-xhs'
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const child = spawn(command, ['taro', 'build', '--type', platform], {
  cwd: projectRoot,
  env: { ...process.env, TARO_OUTPUT_ROOT: outputRoot },
  stdio: 'inherit',
})

const exitCode = await new Promise((resolve) => {
  child.once('error', () => resolve(1))
  child.once('exit', (code) => resolve(code ?? 1))
})

process.exit(exitCode)
