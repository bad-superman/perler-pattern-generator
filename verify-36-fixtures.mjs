import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

export const DEFAULT_PORT = Number(process.env.VITE_PORT ?? '5174')
export const OUT_DIR = process.env.OUT_DIR ?? path.join(os.tmpdir(), 'perler-verify-36')

export const REF_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <rect width="900" height="900" fill="#fffaf1"/>
  <ellipse cx="450" cy="365" rx="275" ry="285" fill="#ffd0b8" stroke="#21181c" stroke-width="18"/>
  <rect x="325" y="590" width="250" height="200" rx="70" fill="#69d5ff" stroke="#21181c" stroke-width="18"/>
  <ellipse cx="322" cy="348" rx="38" ry="46" fill="#171116"/>
  <ellipse cx="578" cy="348" rx="38" ry="46" fill="#171116"/>
  <path d="M395 456 Q450 502 505 456" fill="none" stroke="#171116" stroke-width="12" stroke-linecap="round"/>
</svg>`

export const AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <rect x="350" y="640" width="324" height="280" rx="95" fill="#ff5bbd" stroke="#171118" stroke-width="34"/>
  <rect x="412" y="700" width="200" height="150" rx="50" fill="#57d9ff" stroke="#171118" stroke-width="20"/>
  <ellipse cx="512" cy="446" rx="370" ry="370" fill="#5a32d6" stroke="#171118" stroke-width="34"/>
  <ellipse cx="512" cy="472" rx="306" ry="327" fill="#ffd2b8" stroke="#171118" stroke-width="30"/>
  <path d="M170 330 Q512 30 854 330 L806 410 Q512 290 218 410 Z" fill="#6f45ff" stroke="#171118" stroke-width="24"/>
  <path d="M310 255 L405 255 L350 410 Z" fill="#6f45ff" stroke="#171118" stroke-width="14"/>
  <path d="M420 255 L515 255 L460 410 Z" fill="#6f45ff" stroke="#171118" stroke-width="14"/>
  <path d="M530 255 L625 255 L570 410 Z" fill="#6f45ff" stroke="#171118" stroke-width="14"/>
  <path d="M640 255 L735 255 L680 410 Z" fill="#6f45ff" stroke="#171118" stroke-width="14"/>
  <ellipse cx="377" cy="430" rx="33" ry="42" fill="#151015"/>
  <ellipse cx="647" cy="430" rx="33" ry="42" fill="#151015"/>
  <circle cx="382" cy="414" r="10" fill="#fff"/>
  <circle cx="652" cy="414" r="10" fill="#fff"/>
  <ellipse cx="312" cy="526" rx="38" ry="25" fill="#ff7aa9"/>
  <ellipse cx="712" cy="526" rx="38" ry="25" fill="#ff7aa9"/>
  <path d="M455 535 Q512 580 570 535" fill="none" stroke="#171118" stroke-width="12" stroke-linecap="round"/>
  <path d="M710 205 L800 155 L800 255 Z" fill="#fff044" stroke="#171118" stroke-width="12"/>
  <path d="M890 205 L800 155 L800 255 Z" fill="#fff044" stroke="#171118" stroke-width="12"/>
  <circle cx="800" cy="205" r="25" fill="#ff7857" stroke="#171118" stroke-width="8"/>
</svg>`

export const FRAGILE_AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <rect x="365" y="665" width="294" height="245" rx="82" fill="#ff62c8" stroke="#171118" stroke-width="20"/>
  <ellipse cx="512" cy="465" rx="342" ry="360" fill="#7748ff" stroke="#171118" stroke-width="22"/>
  <ellipse cx="512" cy="492" rx="282" ry="316" fill="#ffd4bc" stroke="#171118" stroke-width="18"/>
  <path d="M210 348 Q512 105 814 348 L778 414 Q512 312 246 414 Z" fill="#8757ff" stroke="#171118" stroke-width="14"/>
  <ellipse cx="391" cy="454" rx="9" ry="12" fill="#151015"/>
  <ellipse cx="633" cy="454" rx="9" ry="12" fill="#151015"/>
  <path d="M497 552 L505 557" fill="none" stroke="#171118" stroke-width="5" stroke-linecap="round"/>
  <path d="M519 557 L527 552" fill="none" stroke="#171118" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="326" cy="540" rx="33" ry="20" fill="#ff80aa"/>
  <ellipse cx="698" cy="540" rx="33" ry="20" fill="#ff80aa"/>
  <path d="M198 498 L248 482" fill="none" stroke="#171118" stroke-width="8" stroke-linecap="round"/>
  <path d="M826 498 L776 482" fill="none" stroke="#171118" stroke-width="8" stroke-linecap="round"/>
</svg>`

export const MISSING_FEATURES_AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <rect x="370" y="660" width="284" height="250" rx="86" fill="#ff62c8" stroke="#171118" stroke-width="24"/>
  <ellipse cx="512" cy="465" rx="342" ry="360" fill="#7448ff" stroke="#171118" stroke-width="24"/>
  <ellipse cx="512" cy="492" rx="282" ry="316" fill="#ffd4bc" stroke="#171118" stroke-width="20"/>
  <path d="M210 348 Q512 105 814 348 L778 414 Q512 312 246 414 Z" fill="#8757ff" stroke="#171118" stroke-width="16"/>
  <ellipse cx="326" cy="540" rx="33" ry="20" fill="#ff80aa"/>
  <ellipse cx="698" cy="540" rx="33" ry="20" fill="#ff80aa"/>
</svg>`

export const SMALL_OFFCENTER_AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <g transform="translate(126 116) scale(0.68)">
    <rect x="350" y="640" width="324" height="280" rx="95" fill="#ff5bbd" stroke="#171118" stroke-width="34"/>
    <ellipse cx="512" cy="446" rx="370" ry="370" fill="#5a32d6" stroke="#171118" stroke-width="34"/>
    <ellipse cx="512" cy="472" rx="306" ry="327" fill="#ffd2b8" stroke="#171118" stroke-width="30"/>
    <path d="M170 330 Q512 30 854 330 L806 410 Q512 290 218 410 Z" fill="#6f45ff" stroke="#171118" stroke-width="24"/>
    <ellipse cx="377" cy="430" rx="23" ry="33" fill="#151015"/>
    <ellipse cx="647" cy="430" rx="23" ry="33" fill="#151015"/>
    <path d="M455 535 Q512 580 570 535" fill="none" stroke="#171118" stroke-width="10" stroke-linecap="round"/>
  </g>
  <path d="M842 118 L882 208 L982 218 L908 286 L930 384 L842 334 L754 384 L776 286 L702 218 L802 208 Z" fill="#fff044" stroke="#171118" stroke-width="12"/>
</svg>`

export const PASTEL_LOW_CONTRAST_AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <rect x="352" y="656" width="320" height="260" rx="90" fill="#ffb6df" stroke="#b988aa" stroke-width="18"/>
  <ellipse cx="512" cy="454" rx="360" ry="360" fill="#c9b6ff" stroke="#b988aa" stroke-width="18"/>
  <ellipse cx="512" cy="486" rx="292" ry="314" fill="#ffd8c7" stroke="#b988aa" stroke-width="14"/>
  <path d="M200 340 Q512 92 824 340 L782 410 Q512 318 242 410 Z" fill="#d0b8ff" stroke="#b988aa" stroke-width="12"/>
  <ellipse cx="384" cy="464" rx="12" ry="16" fill="#aa7f9f"/>
  <ellipse cx="640" cy="464" rx="12" ry="16" fill="#aa7f9f"/>
  <path d="M492 558 Q512 570 532 558" fill="none" stroke="#aa7f9f" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="320" cy="544" rx="36" ry="22" fill="#ffabc6"/>
  <ellipse cx="704" cy="544" rx="36" ry="22" fill="#ffabc6"/>
</svg>`

export const ANIMAL_AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <ellipse cx="512" cy="548" rx="338" ry="300" fill="#ffbf4f" stroke="#171118" stroke-width="30"/>
  <circle cx="330" cy="330" r="120" fill="#ffbf4f" stroke="#171118" stroke-width="28"/>
  <circle cx="694" cy="330" r="120" fill="#ffbf4f" stroke="#171118" stroke-width="28"/>
  <circle cx="330" cy="330" r="62" fill="#ffd98b"/>
  <circle cx="694" cy="330" r="62" fill="#ffd98b"/>
  <ellipse cx="392" cy="520" rx="42" ry="52" fill="#151015"/>
  <ellipse cx="632" cy="520" rx="42" ry="52" fill="#151015"/>
  <ellipse cx="512" cy="604" rx="54" ry="36" fill="#3a2224"/>
  <path d="M512 635 Q472 690 430 642" fill="none" stroke="#171118" stroke-width="18" stroke-linecap="round"/>
  <path d="M512 635 Q552 690 594 642" fill="none" stroke="#171118" stroke-width="18" stroke-linecap="round"/>
  <ellipse cx="305" cy="620" rx="52" ry="34" fill="#ff7aa9"/>
  <ellipse cx="719" cy="620" rx="52" ry="34" fill="#ff7aa9"/>
</svg>`

export function writeFixture(name, content) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const filePath = path.join(OUT_DIR, name)
  fs.writeFileSync(filePath, content.trim())
  return filePath
}

export function svgBase64(svg) {
  return Buffer.from(svg.trim(), 'utf8').toString('base64')
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForApp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  let lastError = ''
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause)
    }
    await sleep(300)
  }
  throw new Error(`应用未就绪：${url} (${lastError})`)
}

export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

export async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`找不到可用端口：${startPort}-${startPort + 79}`)
}

export async function startDevServerIfNeeded() {
  if (process.env.APP_URL) return { child: null, appUrl: process.env.APP_URL }
  const port = await findAvailablePort(DEFAULT_PORT)
  const appUrl = `http://127.0.0.1:${port}`
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
      detached: true,
    },
  )
  child.stdout.on('data', (data) => process.stdout.write(`[vite] ${data}`))
  child.stderr.on('data', (data) => process.stderr.write(`[vite] ${data}`))
  return { child, appUrl }
}

export async function stopDevServer(child) {
  if (!child || child.killed) return
  child.stdout?.removeAllListeners('data')
  child.stderr?.removeAllListeners('data')

  const closed = new Promise((resolve) => {
    child.once('close', resolve)
  })

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }

  const stopped = await Promise.race([
    closed.then(() => true),
    sleep(2_000).then(() => false),
  ])
  if (stopped) return

  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
  await closed
}

export function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return [255, 255, 255]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
