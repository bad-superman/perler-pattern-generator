import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const FPS = 10
const campaignRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(campaignRoot, '../../..')
const sourcePath = path.join(campaignRoot, 'source/pet-reference.png')
const resultPath = path.join(campaignRoot, 'screenshots/result-solid.png')
const framesRoot = path.join(campaignRoot, 'video/frames')
const videoDir = path.join(campaignRoot, 'video')
const outputPath = path.join(videoDir, 'mobile-demo.mp4')
const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const sceneDurations = [2, 3, 4, 5, 5, 4]
const browserErrors = []
let viteProcess

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? `signal ${signal}`}`))
    })
  })
}

function isServerReady() {
  return new Promise((resolve) => {
    const request = http.get(appUrl, (response) => {
      response.resume()
      resolve(Boolean(response.statusCode && response.statusCode < 500))
    })
    request.setTimeout(500, () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
  })
}

async function ensureVite() {
  if (await isServerReady()) return false
  viteProcess = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  let startupError
  viteProcess.stdout.on('data', (chunk) => output.push(chunk.toString()))
  viteProcess.stderr.on('data', (chunk) => output.push(chunk.toString()))
  viteProcess.once('error', (error) => {
    startupError = error
  })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (startupError) throw new Error(`Vite failed to start: ${startupError.message}`)
    if (viteProcess.exitCode !== null) {
      throw new Error(`Vite stopped before startup:\n${output.join('')}`)
    }
    if (await isServerReady()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out starting Vite:\n${output.join('')}`)
}

async function stopVite() {
  if (!viteProcess?.pid) return
  try {
    process.kill(-viteProcess.pid, 'SIGTERM')
  } catch (error) {
    if (error.code === 'ESRCH') return
    throw error
  }
  if (viteProcess.exitCode !== null) return
  await Promise.race([
    new Promise((resolve) => viteProcess.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
  if (viteProcess.exitCode === null) {
    try {
      process.kill(-viteProcess.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

async function captureFrames(page, directory, seconds, onFrame) {
  const frameCount = Math.round(seconds * FPS)
  await mkdir(directory, { recursive: true })
  for (let index = 0; index < frameCount; index += 1) {
    if (onFrame) await onFrame(index, frameCount)
    await page.screenshot({
      path: path.join(directory, `${String(index).padStart(4, '0')}.png`),
      animations: 'disabled',
    })
    await page.waitForTimeout(100)
  }
}

async function setCaption(page, text, dark = true) {
  await page.evaluate(({ caption, useDark }) => {
    let element = document.querySelector('#campaign-caption')
    if (!element) {
      element = document.createElement('div')
      element.id = 'campaign-caption'
      document.body.append(element)
    }
    element.textContent = caption
    Object.assign(element.style, {
      position: 'fixed',
      zIndex: '2147483647',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'max-content',
      maxWidth: 'calc(100vw - 28px)',
      boxSizing: 'border-box',
      padding: '9px 16px',
      borderRadius: '999px',
      background: useDark ? 'rgba(20, 18, 22, 0.88)' : 'rgba(255, 255, 255, 0.96)',
      color: useDark ? '#fff' : '#171419',
      font: '700 17px/1.35 "Noto Sans SC", sans-serif',
      textAlign: 'center',
      boxShadow: '0 4px 18px rgba(0,0,0,.18)',
      pointerEvents: 'none',
    })
  }, { caption: text, useDark: dark })
}

async function showComparison(page) {
  const [source, result] = await Promise.all([readFile(sourcePath), readFile(resultPath)])
  await page.setContent(`<!doctype html>
    <html lang="zh-CN"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box} body{margin:0;width:390px;height:693px;overflow:hidden;background:linear-gradient(150deg,#fff6f0,#f4edff);font-family:"Noto Sans SC",sans-serif;color:#211d25}
      main{height:100%;padding:62px 18px 24px;display:flex;flex-direction:column;gap:14px}
      h1{margin:0;text-align:center;font-size:25px;line-height:1.25} p{margin:0;text-align:center;color:#6e6572;font-size:14px}
      .compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:1;min-height:0}.card{background:#fff;border-radius:22px;padding:10px;box-shadow:0 12px 30px rgba(61,42,75,.13);display:flex;flex-direction:column;gap:8px;min-width:0}
      .label{font-weight:800;text-align:center;font-size:15px}.image{flex:1;min-height:0;border-radius:15px;overflow:hidden;background:#f2edf3;display:flex;align-items:center;justify-content:center}
      img{width:100%;height:100%;object-fit:cover}.result img{object-fit:contain;background:#fff}.arrow{text-align:center;font-size:23px;font-weight:900;color:#914cff}
    </style></head><body><main>
      <h1>宠物照片 → 拼豆图纸</h1><p>先看改版后的真实效果</p>
      <div class="compare">
        <div class="card"><div class="label">原图</div><div class="image"><img src="data:image/png;base64,${source.toString('base64')}"></div></div>
        <div class="card result"><div class="label">生成结果</div><div class="image"><img src="data:image/png;base64,${result.toString('base64')}"></div></div>
      </div><div class="arrow">一键生成可编辑图纸</div>
    </main></body></html>`)
  await setCaption(page, '原图对比生成结果')
}

async function renderScenes(page) {
  const sceneDirectories = sceneDurations.map((_, index) => path.join(framesRoot, `scene-${index + 1}`))

  await showComparison(page)
  await captureFrames(page, sceneDirectories[0], 2)

  await page.goto(appUrl, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const NativeImage = window.Image
    window.Image = class CampaignCaptureImage extends NativeImage {
      set onload(handler) {
        this.addEventListener('load', (event) => {
          window.setTimeout(() => handler?.call(this, event), 1500)
        }, { once: true })
      }
    }
  })
  await setCaption(page, '上传一张宠物照片')
  await captureFrames(page, sceneDirectories[1], 3, async (index) => {
    if (index === 25) {
      await page.locator('input[type=file]').first().setInputFiles(sourcePath)
    }
  })

  await setCaption(page, '自动生成拼豆图纸')
  await captureFrames(page, sceneDirectories[2], 4, async (index) => {
    if (index === 12) {
      await page.locator('.m-result .pattern-grid span').first().waitFor({ timeout: 15000 })
      await page.locator('.m-result').scrollIntoViewIfNeeded()
    }
  })

  await setCaption(page, '色号、纯色和颜色清单')
  await captureFrames(page, sceneDirectories[3], 5, async (index) => {
    if (index === 15) {
      await page.locator('.m-result').getByRole('button', { name: '纯色', exact: true }).click()
    }
    if (index === 30) {
      const moreColors = page.locator('.m-result .m-more')
      if (await moreColors.isVisible()) await moreColors.click()
    }
  })

  await page.locator('.m-actionbar').getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.m-editor [data-testid="editor-toolbar"]').waitFor()
  await setCaption(page, '改一格颜色，还能随时撤销')
  await captureFrames(page, sceneDirectories[4], 5, async (index) => {
    if (index === 15) {
      await page.locator('[data-testid="pattern-cell"]').filter({ visible: true }).nth(12).click({ position: { x: 4, y: 4 } })
    }
    if (index === 30) {
      await page.locator('[data-testid="editor-toolbar"]').getByRole('button', { name: '撤销', exact: true }).click()
    }
  })

  await page.locator('[data-testid="editor-toolbar"]').getByRole('button', { name: '完成', exact: true }).click()
  await setCaption(page, '保存图纸，工具入口在主页')
  await captureFrames(page, sceneDirectories[5], 4, async (index) => {
    if (index === 10) {
      await page.locator('.m-actionbar').getByRole('button', { name: '保存到相册', exact: true }).click()
      await page.locator('.m-sheet img').waitFor()
    }
  })

  return sceneDirectories
}

async function encodeVideo(sceneDirectories) {
  const segmentPaths = []
  for (let index = 0; index < sceneDirectories.length; index += 1) {
    const segmentPath = path.join(framesRoot, `scene-${index + 1}.mp4`)
    await run('/usr/bin/ffmpeg', [
      '-y', '-framerate', String(FPS),
      '-i', path.join(sceneDirectories[index], '%04d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv444p',
      segmentPath,
    ])
    segmentPaths.push(segmentPath)
  }
  const listPath = path.join(framesRoot, 'scenes.txt')
  await writeFile(listPath, segmentPaths.map((segment) => `file '${segment.replaceAll("'", "'\\''")}'`).join('\n'))
  await run('/usr/bin/ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart',
    outputPath,
  ])
}

let browser
try {
  await mkdir(videoDir, { recursive: true })
  await rm(framesRoot, { recursive: true, force: true })
  await ensureVite()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 693 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`))
  const sceneDirectories = await renderScenes(page)
  if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join('\n')}`)
  await encodeVideo(sceneDirectories)
  await rm(framesRoot, { recursive: true, force: true })
  console.log(JSON.stringify({
    output: outputPath,
    duration: sceneDurations.reduce((total, duration) => total + duration, 0),
    frames: sceneDurations.reduce((total, duration) => total + Math.round(duration * FPS), 0),
  }))
} catch (error) {
  console.error(`Frames retained for debugging: ${framesRoot}`)
  throw error
} finally {
  if (browser) await browser.close()
  await stopVite()
}
