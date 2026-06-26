import path from 'node:path'
import { chromium } from 'playwright'
import {
  AI_SVG,
  ANIMAL_AI_SVG,
  BROW_CONFUSION_AI_SVG,
  DETACHED_BODY_AI_SVG,
  FAR_DECORATION_AI_SVG,
  FRAGILE_AI_SVG,
  MISSING_FEATURES_AI_SVG,
  MOUTH_CONFUSION_AI_SVG,
  MUTED_FEATURES_AI_SVG,
  MUTED_GRAY_AI_SVG,
  OUT_DIR,
  PASTEL_LOW_CONTRAST_AI_SVG,
  REF_SVG,
  SMALL_OFFCENTER_AI_SVG,
  TEXTURED_REALISTIC_AI_SVG,
  TINY_NEARBY_DETAILS_AI_SVG,
  parseRgb,
  startDevServerIfNeeded,
  stopDevServer,
  svgBase64,
  waitForApp,
  writeFixture,
} from './verify-36-fixtures.mjs'

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

    function componentStats(mask) {
      const visited = new Uint8Array(cols * rows)
      const components = []
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const start = idx(x, y)
          if (visited[start] || !mask[start]) continue

          const queue = [[x, y]]
          let count = 0
          let minCx = x
          let minCy = y
          let maxCx = x
          let maxCy = y
          visited[start] = 1

          for (let head = 0; head < queue.length; head += 1) {
            const [cx, cy] = queue[head]
            count += 1
            minCx = Math.min(minCx, cx)
            minCy = Math.min(minCy, cy)
            maxCx = Math.max(maxCx, cx)
            maxCy = Math.max(maxCy, cy)
            dirs.forEach(([dx, dy]) => {
              const nx = cx + dx
              const ny = cy + dy
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
              const key = idx(nx, ny)
              if (visited[key] || !mask[key]) return
              visited[key] = 1
              queue.push([nx, ny])
            })
          }

          components.push({ count, minX: minCx, minY: minCy, maxX: maxCx, maxY: maxCy })
        }
      }

      const largest = components.sort((a, b) => b.count - a.count)[0]?.count ?? 0
      return {
        count: components.length,
        significantCount: components.filter((item) => item.count >= 3).length,
        largestCount: largest,
        largestRatio: activeCount ? largest / activeCount : 0,
      }
    }

    function enclosedHoleStats() {
      const visited = new Uint8Array(cols * rows)
      const holes = []
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const start = idx(x, y)
          if (visited[start] || active[start]) continue

          const queue = [[x, y]]
          let count = 0
          let touchesBounds = false
          visited[start] = 1

          for (let head = 0; head < queue.length; head += 1) {
            const [cx, cy] = queue[head]
            count += 1
            if (cx === minX || cx === maxX || cy === minY || cy === maxY) touchesBounds = true
            dirs.forEach(([dx, dy]) => {
              const nx = cx + dx
              const ny = cy + dy
              if (nx < minX || nx > maxX || ny < minY || ny > maxY) return
              const key = idx(nx, ny)
              if (visited[key] || active[key]) return
              visited[key] = 1
              queue.push([nx, ny])
            })
          }

          if (!touchesBounds) holes.push(count)
        }
      }

      return {
        count: holes.length,
        totalArea: holes.reduce((total, count) => total + count, 0),
        maxArea: holes.length ? Math.max(...holes) : 0,
      }
    }

    function edgeMarginStats() {
      return {
        left: minX,
        top: minY,
        right: cols - 1 - maxX,
        bottom: rows - 1 - maxY,
        min: Math.min(minX, minY, cols - 1 - maxX, rows - 1 - maxY),
      }
    }

    function outlineStats() {
      const exterior = new Uint8Array(cols * rows)
      const queue = []
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return
        const key = idx(x, y)
        if (exterior[key] || active[key]) return
        exterior[key] = 1
        queue.push([x, y])
      }

      for (let x = 0; x < cols; x += 1) {
        enqueue(x, 0)
        enqueue(x, rows - 1)
      }
      for (let y = 0; y < rows; y += 1) {
        enqueue(0, y)
        enqueue(cols - 1, y)
      }

      for (let head = 0; head < queue.length; head += 1) {
        const [x, y] = queue[head]
        dirs.forEach(([dx, dy]) => enqueue(x + dx, y + dy))
      }

      const boundary = new Uint8Array(cols * rows)
      let boundaryCount = 0
      let darkBoundaryCount = 0
      let vividBoundaryCount = 0
      active.forEach((isActive, index) => {
        if (!isActive) return
        const x = index % cols
        const y = Math.floor(index / cols)
        const touchesExterior = dirs.some(([dx, dy]) => {
          const nx = x + dx
          const ny = y + dy
          return nx < 0 || ny < 0 || nx >= cols || ny >= rows || exterior[idx(nx, ny)] === 1
        })
        if (!touchesExterior) return
        boundary[index] = 1
        boundaryCount += 1
        if (dark[index]) darkBoundaryCount += 1
        if (vivid[index]) vividBoundaryCount += 1
      })

      return {
        boundaryCount,
        darkBoundaryCount,
        vividBoundaryCount,
        darkBoundaryRatio: boundaryCount ? darkBoundaryCount / boundaryCount : 0,
        vividBoundaryRatio: boundaryCount ? vividBoundaryCount / boundaryCount : 0,
      }
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
    const expectedMouthY = minY + Math.round(subjectH * 0.6)
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
    let bestMouthRunNearExpected = 0
    for (let y = Math.max(mouthTop, expectedMouthY - 3); y <= Math.min(mouthBottom, expectedMouthY + 3); y += 1) {
      let run = 0
      for (let x = mouthLeft; x <= mouthRight; x += 1) {
        if (dark[idx(x, y)]) {
          run += 1
        } else {
          bestMouthRunNearExpected = Math.max(bestMouthRunNearExpected, run)
          run = 0
        }
      }
      bestMouthRunNearExpected = Math.max(bestMouthRunNearExpected, run)
    }
    const activeComponents = componentStats(active)
    const holes = enclosedHoleStats()
    const outline = outlineStats()
    const edgeMargin = edgeMarginStats()
    const mouthCenter = windowStats(
      Math.max(mouthLeft, centerX - 3),
      mouthTop,
      Math.min(mouthRight, centerX + 3),
      mouthBottom,
    )
    const mouthCore = windowStats(
      Math.max(mouthLeft, centerX - 3),
      Math.max(mouthTop, expectedMouthY - 2),
      Math.min(mouthRight, centerX + 3),
      Math.min(mouthBottom, expectedMouthY + 2),
    )

    return {
      summary,
      cellCount: cells.length,
      legendCount: document.querySelectorAll('.legend-item').length,
      bounds: { minX, minY, maxX, maxY, subjectW, subjectH },
      integrity: {
        activeComponents,
        holes,
        outline,
        edgeMargin,
        fillRatio: activeCount ? activeCount / Math.max(1, subjectW * subjectH) : 0,
      },
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
      mouthCore,
      bestMouthRun,
      bestMouthRunNearExpected,
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
    { label: 'far-decoration', svg: FAR_DECORATION_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-far-decoration.png') },
    { label: 'pastel-low-contrast', svg: PASTEL_LOW_CONTRAST_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-pastel-low-contrast.png') },
    { label: 'muted-features', svg: MUTED_FEATURES_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-muted-features.png') },
    { label: 'tiny-nearby-details', svg: TINY_NEARBY_DETAILS_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-tiny-nearby-details.png') },
    { label: 'brow-confusion', svg: BROW_CONFUSION_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-brow-confusion.png') },
    { label: 'mouth-confusion', svg: MOUTH_CONFUSION_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-mouth-confusion.png') },
    { label: 'muted-gray', svg: MUTED_GRAY_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-muted-gray.png') },
    { label: 'animal', svg: ANIMAL_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-animal.png') },
    { label: 'textured-realistic', svg: TEXTURED_REALISTIC_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-textured-realistic.png') },
    { label: 'detached-body', svg: DETACHED_BODY_AI_SVG, screenshot: path.join(OUT_DIR, 'verify-36-detached-body.png') },
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
        && (testCase.label !== 'textured-realistic' || result.legendCount <= 5)
        && (testCase.label !== 'far-decoration' || result.bounds.subjectW <= 28)
        && (
          testCase.label !== 'tiny-nearby-details'
          || (
            result.bounds.subjectW >= 28
            && result.colorBalance.activeCount >= 560
          )
        )
        && result.integrity.activeComponents.significantCount <= 1
        && result.integrity.activeComponents.largestRatio >= 0.96
        && result.integrity.holes.count <= 2
        && result.integrity.holes.totalArea <= Math.max(4, Math.round(result.colorBalance.activeCount * 0.015))
        && result.integrity.edgeMargin.min >= 1
        && result.integrity.outline.darkBoundaryRatio >= (testCase.label === 'pastel-low-contrast' ? 0.24 : 0.18)
        && result.integrity.outline.vividBoundaryRatio <= 0.72
        && result.colorBalance.darkRatio <= 0.78
        && result.colorBalance.vividRatio >= (testCase.label === 'pastel-low-contrast' ? 0.2 : 0.055)
        && (
          testCase.label !== 'muted-gray'
          || result.colorBalance.vividRatio >= 0.24
        )
        && result.eyes.left.count >= 4
        && result.eyes.left.width >= 2
        && result.eyes.left.height >= 2
        && result.eyes.right.count >= 4
        && result.eyes.right.width >= 2
        && result.eyes.right.height >= 2
        && result.eyeCore.left.readable
        && result.eyeCore.right.readable
        && (
          testCase.label !== 'brow-confusion'
          || (
            result.eyeCore.left.local.count >= 8
            && result.eyeCore.left.local.width >= 3
            && result.eyeCore.left.local.height >= 3
            && result.eyeCore.right.local.count >= 8
            && result.eyeCore.right.local.width >= 3
            && result.eyeCore.right.local.height >= 3
          )
        )
        && (
          testCase.label !== 'muted-features'
          || (
            result.eyeCore.left.local.count >= 8
            && result.eyeCore.right.local.count >= 8
            && result.bestMouthRun >= 5
          )
        )
        && (
          testCase.label !== 'mouth-confusion'
          || (
            result.mouthCore.count >= 5
            && result.mouthCore.width >= 5
            && result.bestMouthRunNearExpected >= 5
          )
        )
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
