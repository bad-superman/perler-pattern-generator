import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import {
  ANIMAL_AI_SVG,
  OUT_DIR,
  REF_SVG,
  startDevServerIfNeeded,
  stopDevServer,
  svgBase64,
  waitForApp,
  writeFixture,
} from './verify-36-fixtures.mjs'

function expectedExportSize(paletteCount, gridCols = 36, gridRows = 36) {
  const exportCell = Math.max(gridCols, gridRows) >= 96 ? 8 : (Math.max(gridCols, gridRows) > 64 ? 12 : 16)
  const gap = 1
  const gridPad = 12
  const gridInnerW = gridCols * exportCell + Math.max(0, gridCols - 1) * gap
  const gridInnerH = gridRows * exportCell + Math.max(0, gridRows - 1) * gap
  const gridW = gridInnerW + gridPad * 2
  const gridH = gridInnerH + gridPad * 2
  const legendCols = Math.min(4, Math.max(1, paletteCount))
  const legendRows = Math.ceil(paletteCount / legendCols)
  const legendItemW = 220
  const legendItemH = 28
  const legendPad = 24
  const legendW = legendCols * legendItemW + legendPad * 2
  const legendH = legendRows * legendItemH + legendPad * 2 + 28
  const margin = 32
  const headerH = 72
  const contentW = Math.max(gridW, legendW, 640)

  return {
    width: contentW + margin * 2,
    height: headerH + gridH + 24 + legendH + margin,
    exportCell,
    gap,
    gridPad,
    gridW,
    gridH,
    gridX: margin + (contentW - gridW) / 2,
    gridY: headerH,
    legendCols,
    legendRows,
    legendW,
    legendH,
    legendX: margin + (contentW - legendW) / 2,
    legendY: headerH + gridH + 24,
  }
}

async function analyzeCapturedExport(page) {
  return page.evaluate(async () => {
    const capture = window.__perlerExportCaptures?.at(-1)
    if (!capture) return { error: '未捕获到导出 Canvas' }

    const summary = document.querySelector('.section-title span')?.textContent ?? ''
    const sizeMatch = summary.match(/(\d+)×(\d+)/)
    const gridCols = sizeMatch ? Number(sizeMatch[1]) : 0
    const gridRows = sizeMatch ? Number(sizeMatch[2]) : 0
    const paletteCount = document.querySelectorAll('.legend-item').length

    const longSide = Math.max(gridCols, gridRows)
    const exportCell = longSide >= 96 ? 8 : (longSide > 64 ? 12 : 16)
    const gap = 1
    const gridPad = 12
    const gridInnerW = gridCols * exportCell + Math.max(0, gridCols - 1) * gap
    const gridInnerH = gridRows * exportCell + Math.max(0, gridRows - 1) * gap
    const gridW = gridInnerW + gridPad * 2
    const gridH = gridInnerH + gridPad * 2
    const legendCols = Math.min(4, Math.max(1, paletteCount))
    const legendRows = Math.ceil(paletteCount / legendCols)
    const legendItemW = 220
    const legendItemH = 28
    const legendPad = 24
    const legendW = legendCols * legendItemW + legendPad * 2
    const legendH = legendRows * legendItemH + legendPad * 2 + 28
    const margin = 32
    const headerH = 72
    const contentW = Math.max(gridW, legendW, 640)
    const expected = {
      width: contentW + margin * 2,
      height: headerH + gridH + 24 + legendH + margin,
      exportCell,
      gap,
      gridPad,
      gridW,
      gridH,
      gridX: margin + (contentW - gridW) / 2,
      gridY: headerH,
      legendCols,
      legendRows,
      legendW,
      legendH,
      legendX: margin + (contentW - legendW) / 2,
      legendY: headerH + gridH + 24,
    }

    const image = new Image()
    image.src = capture.dataUrl
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)

    const pixel = (x, y) => {
      const data = ctx.getImageData(Math.max(0, Math.min(canvas.width - 1, Math.round(x))), Math.max(0, Math.min(canvas.height - 1, Math.round(y))), 1, 1).data
      return [data[0], data[1], data[2], data[3]]
    }
    const luma = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114
    const colorDistance = (color, target) => Math.abs(color[0] - target[0]) + Math.abs(color[1] - target[1]) + Math.abs(color[2] - target[2])
    const isBackground = (color) => colorDistance(color, [255, 250, 241]) <= 12
    const isDark = (color) => luma(color) <= 80
    const isVivid = (color) => (Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2])) >= 48 && luma(color) >= 45 && luma(color) <= 245

    function rectStats(x, y, width, height, step = 2) {
      let samples = 0
      let nonBackground = 0
      let dark = 0
      let vivid = 0
      for (let yy = y; yy < y + height; yy += step) {
        for (let xx = x; xx < x + width; xx += step) {
          const color = pixel(xx, yy)
          samples += 1
          if (!isBackground(color)) nonBackground += 1
          if (isDark(color)) dark += 1
          if (isVivid(color)) vivid += 1
        }
      }
      return { samples, nonBackground, dark, vivid }
    }

    const gridColors = new Map()
    let gridNonBackground = 0
    let gridVivid = 0
    let gridDark = 0
    for (let y = 0; y < gridRows; y += 1) {
      for (let x = 0; x < gridCols; x += 1) {
        const sampleX = expected.gridX + gridPad + x * (exportCell + gap) + 3
        const sampleY = expected.gridY + gridPad + y * (exportCell + gap) + 3
        const color = pixel(sampleX, sampleY)
        const key = `${color[0]},${color[1]},${color[2]}`
        gridColors.set(key, (gridColors.get(key) ?? 0) + 1)
        if (!isBackground(color)) gridNonBackground += 1
        if (isVivid(color)) gridVivid += 1
        if (isDark(color)) gridDark += 1
      }
    }

    let darkSeparatorSamples = 0
    let separatorSamples = 0
    for (let y = 1; y < gridRows; y += 5) {
      for (let x = 2; x < gridCols; x += 5) {
        const sampleX = expected.gridX + gridPad + x * (exportCell + gap) + exportCell / 2
        const sampleY = expected.gridY + gridPad + y * (exportCell + gap) - 1
        separatorSamples += 1
        if (isDark(pixel(sampleX, sampleY))) darkSeparatorSamples += 1
      }
    }

    const swatches = []
    for (let index = 0; index < paletteCount; index += 1) {
      const col = index % legendCols
      const row = Math.floor(index / legendCols)
      const x = expected.legendX + legendPad + col * legendItemW + 10
      const y = expected.legendY + 36 + row * legendItemH + 14
      const color = pixel(x, y)
      swatches.push({ color: color.slice(0, 3), nonBackground: !isBackground(color), dark: isDark(color), vivid: isVivid(color) })
    }

    const headerStats = rectStats(24, 16, 380, 48, 2)
    const legendStats = rectStats(expected.legendX, expected.legendY, expected.legendW, expected.legendH, 3)
    const gridBorderProbe = pixel(expected.gridX + expected.gridW / 2, expected.gridY + 8)

    return {
      capture: {
        width: capture.width,
        height: capture.height,
        type: capture.type,
        size: capture.size,
        pngSignature: capture.dataUrl.startsWith('data:image/png;base64,iVBOR'),
      },
      image: {
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      summary,
      gridCols,
      gridRows,
      paletteCount,
      expected,
      grid: {
        sampledCells: gridCols * gridRows,
        distinctCornerColors: gridColors.size,
        nonBackground: gridNonBackground,
        vivid: gridVivid,
        dark: gridDark,
        nonBackgroundRatio: gridCols && gridRows ? gridNonBackground / (gridCols * gridRows) : 0,
        vividRatio: gridCols && gridRows ? gridVivid / (gridCols * gridRows) : 0,
      },
      separators: {
        samples: separatorSamples,
        dark: darkSeparatorSamples,
        darkRatio: separatorSamples ? darkSeparatorSamples / separatorSamples : 0,
      },
      headerStats,
      legendStats,
      swatches,
      gridBorderProbe: gridBorderProbe.slice(0, 3),
      toastText: document.querySelector('.export-toast')?.textContent ?? '',
      appError: document.querySelector('.error')?.textContent ?? '',
    }
  })
}

async function main() {
  const refPath = writeFixture('verify-36-export-ref.svg', REF_SVG)
  const outPng = path.join(OUT_DIR, 'verify-36-export.png')
  const devServer = await startDevServerIfNeeded()
  const errors = []
  let agnesPostData = ''
  let browser
  let context

  try {
    await waitForApp(devServer.appUrl)
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      window.__perlerExportCaptures = []
      const originalToBlob = HTMLCanvasElement.prototype.toBlob
      HTMLCanvasElement.prototype.toBlob = function patchedToBlob(callback, type, quality) {
        return originalToBlob.call(this, (blob) => {
          if (blob) {
            window.__perlerExportCaptures.push({
              width: this.width,
              height: this.height,
              type: blob.type,
              size: blob.size,
              dataUrl: this.toDataURL(type || 'image/png'),
            })
          }
          callback(blob)
        }, type, quality)
      }
    })

    await page.route('**/api/agnes/generate', async (route) => {
      agnesPostData = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          imageBase64: svgBase64(ANIMAL_AI_SVG),
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

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null)
    await page.getByRole('button', { name: /导出 PNG/ }).click()
    await page.waitForFunction(() => window.__perlerExportCaptures?.length > 0, null, { timeout: 20_000 })
    await page.waitForFunction(() => !document.querySelector('.export-loading-overlay'), null, { timeout: 20_000 })
    await page.waitForSelector('.export-toast', { timeout: 2_000 })
    const download = await downloadPromise
    const analysis = await analyzeCapturedExport(page)
    const expected = expectedExportSize(analysis.paletteCount, analysis.gridCols, analysis.gridRows)

    const captureDataUrl = await page.evaluate(() => window.__perlerExportCaptures.at(-1).dataUrl)
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPng, Buffer.from(captureDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'))

    const downloadInfo = download ? {
      suggestedFilename: download.suggestedFilename(),
      failure: await download.failure(),
    } : null
    const pass = (
      errors.length === 0
      && agnesPostData.includes('36')
      && agnesPostData.includes('3×3')
      && analysis.gridCols === 36
      && analysis.gridRows === 36
      && analysis.paletteCount >= 4
      && analysis.paletteCount <= 7
      && analysis.capture.pngSignature
      && analysis.capture.type === 'image/png'
      && analysis.capture.size >= 20_000
      && analysis.capture.width === expected.width
      && analysis.capture.height === expected.height
      && analysis.image.width === expected.width
      && analysis.image.height === expected.height
      && analysis.grid.sampledCells === 1296
      && analysis.grid.nonBackgroundRatio >= 0.38
      && analysis.grid.vividRatio >= 0.08
      && analysis.grid.distinctCornerColors >= Math.min(4, analysis.paletteCount)
      && analysis.separators.darkRatio >= 0.9
      && analysis.headerStats.dark >= 80
      && analysis.legendStats.nonBackground >= 200
      && analysis.swatches.filter((item) => item.nonBackground).length >= Math.max(1, analysis.paletteCount - 1)
      && analysis.gridBorderProbe.every((channel) => channel <= 64)
      && analysis.toastText.includes('PNG 已开始下载')
      && !analysis.appError
      && downloadInfo?.suggestedFilename.endsWith('.png')
      && !downloadInfo?.failure
    )

    console.log(JSON.stringify({
      appUrl: devServer.appUrl,
      outPng,
      promptIncludes36: agnesPostData.includes('36'),
      promptIncludes3x3: agnesPostData.includes('3×3'),
      downloadInfo,
      analysis,
      expected,
      errors,
      pass,
    }, null, 2))

    if (!pass) process.exit(1)
  } finally {
    if (context) await context.close()
    if (browser) await browser.close()
    await stopDevServer(devServer.child)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
