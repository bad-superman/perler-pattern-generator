import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'

const DEFAULT_PORT = Number(process.env.VITE_PORT ?? '5174')
const OUT_DIR = process.env.OUT_DIR ?? path.join(os.tmpdir(), 'perler-verify-36')

const REF_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <rect width="900" height="900" fill="#fffaf1"/>
  <ellipse cx="450" cy="365" rx="275" ry="285" fill="#ffd0b8" stroke="#21181c" stroke-width="18"/>
  <rect x="325" y="590" width="250" height="200" rx="70" fill="#69d5ff" stroke="#21181c" stroke-width="18"/>
  <ellipse cx="322" cy="348" rx="38" ry="46" fill="#171116"/>
  <ellipse cx="578" cy="348" rx="38" ry="46" fill="#171116"/>
  <path d="M395 456 Q450 502 505 456" fill="none" stroke="#171116" stroke-width="12" stroke-linecap="round"/>
</svg>`

const AI_SVG = `
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

const FRAGILE_AI_SVG = `
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

const MISSING_FEATURES_AI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fffaf1"/>
  <rect x="370" y="660" width="284" height="250" rx="86" fill="#ff62c8" stroke="#171118" stroke-width="24"/>
  <ellipse cx="512" cy="465" rx="342" ry="360" fill="#7448ff" stroke="#171118" stroke-width="24"/>
  <ellipse cx="512" cy="492" rx="282" ry="316" fill="#ffd4bc" stroke="#171118" stroke-width="20"/>
  <path d="M210 348 Q512 105 814 348 L778 414 Q512 312 246 414 Z" fill="#8757ff" stroke="#171118" stroke-width="16"/>
  <ellipse cx="326" cy="540" rx="33" ry="20" fill="#ff80aa"/>
  <ellipse cx="698" cy="540" rx="33" ry="20" fill="#ff80aa"/>
</svg>`

const SMALL_OFFCENTER_AI_SVG = `
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

const PASTEL_LOW_CONTRAST_AI_SVG = `
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

const ANIMAL_AI_SVG = `
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

function writeFixture(name, content) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const filePath = path.join(OUT_DIR, name)
  fs.writeFileSync(filePath, content.trim())
  return filePath
}

function svgBase64(svg) {
  return Buffer.from(svg.trim(), 'utf8').toString('base64')
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForApp(url, timeoutMs = 20_000) {
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

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`找不到可用端口：${startPort}-${startPort + 79}`)
}

async function startDevServerIfNeeded() {
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

async function stopDevServer(child) {
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

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return [255, 255, 255]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

async function analyzePattern(page) {
  return page.evaluate((source) => {
    const parseColor = new Function(`return (${source.parseRgb})`)()
    const luma = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114
    const cells = [...document.querySelectorAll('.pattern-grid span')]
    const summary = document.querySelector('.section-title span')?.textContent ?? ''
    const sizeMatch = summary.match(/(\d+)×(\d+)/)
    const cols = sizeMatch ? Number(sizeMatch[1]) : 0
    const rows = sizeMatch ? Number(sizeMatch[2]) : 0
    const active = []
    const dark = []
    const vivid = []
    const colorCounts = new Map()

    cells.forEach((cell, index) => {
      const color = parseColor(getComputedStyle(cell).backgroundColor)
      const colorKey = color.join(',')
      colorCounts.set(colorKey, (colorCounts.get(colorKey) ?? 0) + 1)
      const colorLuma = luma(color)
      const chroma = Math.max(...color) - Math.min(...color)
      active[index] = colorLuma < 248
      dark[index] = active[index] && colorLuma <= 92
      vivid[index] = active[index] && chroma >= 44 && colorLuma >= 45 && colorLuma <= 245
    })

    const idx = (x, y) => y * cols + x
    let minX = cols
    let minY = rows
    let maxX = -1
    let maxY = -1
    active.forEach((isActive, index) => {
      if (!isActive) return
      const x = index % cols
      const y = Math.floor(index / cols)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })

    const subjectW = maxX - minX + 1
    const subjectH = maxY - minY + 1
    const activeCount = active.filter(Boolean).length
    const darkCount = dark.filter(Boolean).length
    const vividCount = vivid.filter(Boolean).length
    const centerX = Math.round((minX + maxX) / 2)

    function windowStats(left, top, right, bottom) {
      let count = 0
      let winMinX = cols
      let winMinY = rows
      let winMaxX = -1
      let winMaxY = -1
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          if (!dark[idx(x, y)]) continue
          count += 1
          winMinX = Math.min(winMinX, x)
          winMinY = Math.min(winMinY, y)
          winMaxX = Math.max(winMaxX, x)
          winMaxY = Math.max(winMaxY, y)
        }
      }
      return {
        count,
        width: winMaxX >= winMinX ? winMaxX - winMinX + 1 : 0,
        height: winMaxY >= winMinY ? winMaxY - winMinY + 1 : 0,
      }
    }

    function darkComponents(left, top, right, bottom) {
      const visited = new Uint8Array(cols * rows)
      const components = []
      const dirs = [
        [0, -1], [1, -1], [1, 0], [1, 1],
        [0, 1], [-1, 1], [-1, 0], [-1, -1],
      ]

      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const start = idx(x, y)
          if (visited[start] || !dark[start]) continue

          const queue = [[x, y]]
          let minCx = x
          let minCy = y
          let maxCx = x
          let maxCy = y
          let totalX = 0
          let totalY = 0
          let count = 0
          visited[start] = 1

          for (let head = 0; head < queue.length; head += 1) {
            const [cx, cy] = queue[head]
            count += 1
            totalX += cx
            totalY += cy
            minCx = Math.min(minCx, cx)
            minCy = Math.min(minCy, cy)
            maxCx = Math.max(maxCx, cx)
            maxCy = Math.max(maxCy, cy)
            dirs.forEach(([dx, dy]) => {
              const nx = cx + dx
              const ny = cy + dy
              if (nx < left || nx > right || ny < top || ny > bottom) return
              const key = idx(nx, ny)
              if (visited[key] || !dark[key]) return
              visited[key] = 1
              queue.push([nx, ny])
            })
          }

          components.push({
            count,
            width: maxCx - minCx + 1,
            height: maxCy - minCy + 1,
            minX: minCx,
            minY: minCy,
            maxX: maxCx,
            maxY: maxCy,
            centerX: totalX / count,
            centerY: totalY / count,
          })
        }
      }

      return components
    }

    function eyeStats(left, right, expectedX, expectedY) {
      const local = windowStats(
        Math.max(left, Math.round(expectedX) - 2),
        Math.max(eyeTop, Math.round(expectedY) - 3),
        Math.min(right, Math.round(expectedX) + 2),
        Math.min(eyeBottom, Math.round(expectedY) + 3),
      )
      const component = darkComponents(left, eyeTop, right, eyeBottom)
        .filter((item) => {
          const touchesSide = item.minX <= minX + 1 || item.maxX >= maxX - 1
          const tooLarge = item.width > 6 || item.height > 7 || item.count > 24
          return !touchesSide && !tooLarge && item.count >= 3
        })
        .sort((a, b) => {
          const score = (item) => item.count * 2
            + Math.min(item.width, 4)
            + Math.min(item.height, 5)
            - Math.abs(item.centerX - expectedX) * 0.7
            - Math.abs(item.centerY - expectedY) * 1.2
          return score(b) - score(a)
        })[0] ?? { count: 0, width: 0, height: 0 }
      return {
        local,
        component,
        readable: (
          (local.count >= 6 && local.width >= 3 && local.height >= 3)
          || (component.count >= 6 && component.width >= 3 && component.height >= 3)
        ),
      }
    }

    const eyeTop = minY + Math.round(subjectH * 0.32)
    const eyeBottom = minY + Math.round(subjectH * 0.58)
    const expectedEyeY = minY + Math.round(subjectH * 0.43)
    const expectedEyeOffset = Math.max(4, Math.round(subjectW * 0.21))
    const expectedLeftEyeX = centerX - expectedEyeOffset
    const expectedRightEyeX = centerX + expectedEyeOffset
    const leftEye = windowStats(
      Math.max(minX + 3, centerX - Math.round(subjectW * 0.34)),
      eyeTop,
      Math.max(minX + 3, centerX - Math.round(subjectW * 0.04)),
      eyeBottom,
    )
    const rightEye = windowStats(
      Math.min(maxX - 3, centerX + Math.round(subjectW * 0.04)),
      eyeTop,
      Math.min(maxX - 3, centerX + Math.round(subjectW * 0.34)),
      eyeBottom,
    )
    const leftEyeCore = eyeStats(
      Math.max(minX + 3, centerX - Math.round(subjectW * 0.34)),
      Math.max(minX + 3, centerX - Math.round(subjectW * 0.04)),
      expectedLeftEyeX,
      expectedEyeY,
    )
    const rightEyeCore = eyeStats(
      Math.min(maxX - 3, centerX + Math.round(subjectW * 0.04)),
      Math.min(maxX - 3, centerX + Math.round(subjectW * 0.34)),
      expectedRightEyeX,
      expectedEyeY,
    )

    const mouthTop = minY + Math.round(subjectH * 0.5)
    const mouthBottom = minY + Math.round(subjectH * 0.76)
    const mouthLeft = Math.max(minX + 2, centerX - Math.max(3, Math.round(subjectW * 0.2)))
    const mouthRight = Math.min(maxX - 2, centerX + Math.max(3, Math.round(subjectW * 0.2)))
    let bestMouthRun = 0
    for (let y = mouthTop; y <= mouthBottom; y += 1) {
      let run = 0
      for (let x = mouthLeft; x <= mouthRight; x += 1) {
        if (dark[idx(x, y)]) {
          run += 1
        } else {
          bestMouthRun = Math.max(bestMouthRun, run)
          run = 0
        }
      }
      bestMouthRun = Math.max(bestMouthRun, run)
    }
    const mouthCenter = windowStats(
      Math.max(mouthLeft, centerX - 3),
      mouthTop,
      Math.min(mouthRight, centerX + 3),
      mouthBottom,
    )

    return {
      summary,
      cellCount: cells.length,
      legendCount: document.querySelectorAll('.legend-item').length,
      bounds: { minX, minY, maxX, maxY, subjectW, subjectH },
      colorBalance: {
        activeCount,
        darkCount,
        vividCount,
        darkRatio: activeCount ? darkCount / activeCount : 0,
        vividRatio: activeCount ? vividCount / activeCount : 0,
      },
      colorSignature: [...colorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([color, count]) => `${color}:${count}`)
        .join('|'),
      eyes: { left: leftEye, right: rightEye },
      eyeCore: { left: leftEyeCore, right: rightEyeCore },
      mouthCenter,
      bestMouthRun,
    }
  }, { parseRgb: parseRgb.toString() })
}

async function main() {
  const refPath = writeFixture('verify-36-ref.svg', REF_SVG)
  const cases = [
    { label: 'bold', svg: AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-clarity.png') },
    { label: 'fragile', svg: FRAGILE_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-fragile.png') },
    { label: 'missing-features', svg: MISSING_FEATURES_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-missing-features.png') },
    { label: 'small-offcenter', svg: SMALL_OFFCENTER_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-small-offcenter.png') },
    { label: 'pastel-low-contrast', svg: PASTEL_LOW_CONTRAST_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-pastel-low-contrast.png') },
    { label: 'animal', svg: ANIMAL_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-animal.png') },
  ]
  const devServer = await startDevServerIfNeeded()
  const errors = []
  let activeAiBase64 = svgBase64(AI_SVG)
  let agnesPostData = ''
  let browser

  try {
    await waitForApp(devServer.appUrl)
    browser = await chromium.launch({ headless: true })

    const results = []
    for (const testCase of cases) {
      activeAiBase64 = svgBase64(testCase.svg)
      agnesPostData = ''
      errors.length = 0
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/api/agnes/generate', async (route) => {
        agnesPostData = route.request().postData() ?? ''
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            imageBase64: activeAiBase64,
            mimeType: 'image/svg+xml',
          }),
        })
      })

      await page.goto(devServer.appUrl, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'AI 生成' }).click()
      await page.getByRole('button', { name: '36 格' }).click()
      await page.locator('input[type=file]').setInputFiles(refPath)
      const aiResponse = page.waitForResponse('**/api/agnes/generate', { timeout: 20_000 })
      await page.getByRole('button', { name: /AI 生成拼豆图/ }).click()
      await aiResponse
      await page.waitForFunction(() => !document.querySelector('.export-loading-overlay'), null, { timeout: 20_000 })
      await page.waitForSelector('.legend-item', { timeout: 20_000 })
      await page.screenshot({ path: testCase.screenshot, fullPage: true })

      const result = await analyzePattern(page)
      const appError = await page.locator('.error').textContent().catch(() => '')
      const pass = (
        errors.length === 0
        && !appError
        && agnesPostData.includes('36')
        && agnesPostData.includes('3×3')
        && result.summary.includes('36×36')
        && result.cellCount === 1296
        && result.legendCount <= 7
        && result.colorBalance.darkRatio <= 0.78
        && result.colorBalance.vividRatio >= (testCase.label === 'pastel-low-contrast' ? 0.2 : 0.055)
        && result.eyes.left.count >= 4
        && result.eyes.left.width >= 2
        && result.eyes.left.height >= 2
        && result.eyes.right.count >= 4
        && result.eyes.right.width >= 2
        && result.eyes.right.height >= 2
        && result.eyeCore.left.readable
        && result.eyeCore.right.readable
        && result.mouthCenter.count >= 4
        && result.mouthCenter.width >= 3
        && result.bestMouthRun >= 3
      )

      results.push({
        label: testCase.label,
        screenshot: testCase.screenshot,
        promptIncludes36: agnesPostData.includes('36'),
        promptIncludes3x3: agnesPostData.includes('3×3'),
        result,
        appError,
        errors: [...errors],
        pass,
      })

      await page.close()
    }

    const pass = results.every((result) => result.pass)
    const uniqueSignatures = new Set(results.map((result) => result.result.colorSignature))
    const hasOutputDiversity = uniqueSignatures.size >= 3
    console.log(JSON.stringify({
      appUrl: devServer.appUrl,
      results,
      uniqueSignatures: uniqueSignatures.size,
      hasOutputDiversity,
      pass,
    }, null, 2))

    if (!pass || !hasOutputDiversity) process.exit(1)
  } finally {
    if (browser) await browser.close()
    await stopDevServer(devServer.child)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
