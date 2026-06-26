import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = Number(process.env.VITE_PORT ?? '5174')
const APP_URL = process.env.APP_URL ?? `http://127.0.0.1:${PORT}`
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

function startDevServerIfNeeded() {
  if (process.env.APP_URL) return null
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
      detached: true,
    },
  )
  child.stdout.on('data', (data) => process.stdout.write(`[vite] ${data}`))
  child.stderr.on('data', (data) => process.stderr.write(`[vite] ${data}`))
  return child
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

    cells.forEach((cell, index) => {
      const color = parseColor(getComputedStyle(cell).backgroundColor)
      active[index] = luma(color) < 248
      dark[index] = active[index] && luma(color) <= 92
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

    const eyeTop = minY + Math.round(subjectH * 0.23)
    const eyeBottom = minY + Math.round(subjectH * 0.53)
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

    const mouthTop = minY + Math.round(subjectH * 0.42)
    const mouthBottom = minY + Math.round(subjectH * 0.72)
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

    return {
      summary,
      cellCount: cells.length,
      legendCount: document.querySelectorAll('.legend-item').length,
      bounds: { minX, minY, maxX, maxY, subjectW, subjectH },
      eyes: { left: leftEye, right: rightEye },
      bestMouthRun,
    }
  }, { parseRgb: parseRgb.toString() })
}

async function main() {
  const refPath = writeFixture('verify-36-ref.svg', REF_SVG)
  const aiBase64 = svgBase64(AI_SVG)
  const screenshotPath = path.join(OUT_DIR, 'verify-36-clarity.png')
  const devServer = startDevServerIfNeeded()
  const errors = []
  let agnesPostData = ''
  let browser

  try {
    await waitForApp(APP_URL)
    browser = await chromium.launch({ headless: true })
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
          imageBase64: aiBase64,
          mimeType: 'image/svg+xml',
        }),
      })
    })

    await page.goto(APP_URL, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'AI 生成' }).click()
    await page.locator('input[type=file]').setInputFiles(refPath)
    await page.getByRole('button', { name: '36 格' }).click()
    await page.getByRole('button', { name: /AI 生成拼豆图/ }).click()
    await page.waitForSelector('.legend-item', { timeout: 20_000 })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const result = await analyzePattern(page)
    const pass = (
      errors.length === 0
      && agnesPostData.includes('36')
      && agnesPostData.includes('3×3')
      && result.summary.includes('36×36')
      && result.cellCount === 1296
      && result.legendCount <= 7
      && result.eyes.left.count >= 4
      && result.eyes.left.width >= 2
      && result.eyes.left.height >= 2
      && result.eyes.right.count >= 4
      && result.eyes.right.width >= 2
      && result.eyes.right.height >= 2
      && result.bestMouthRun >= 3
    )

    console.log(JSON.stringify({
      appUrl: APP_URL,
      screenshot: screenshotPath,
      promptIncludes36: agnesPostData.includes('36'),
      promptIncludes3x3: agnesPostData.includes('3×3'),
      result,
      errors,
      pass,
    }, null, 2))

    if (!pass) process.exit(1)
  } finally {
    if (browser) await browser.close()
    await stopDevServer(devServer)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
