export interface ContentBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface RgbColor {
  r: number
  g: number
  b: number
}

function sampleCornerColors(width: number, height: number, data: Uint8ClampedArray): RgbColor[] {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ]

  return points.map(([x, y]) => {
    const offset = (y * width + x) * 4
    return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
  })
}

export function estimateBackgroundColor(width: number, height: number, data: Uint8ClampedArray): RgbColor | null {
  const samples = sampleCornerColors(width, height, data)
  const channels = samples.reduce(
    (totals, color) => ({
      r: totals.r + color.r,
      g: totals.g + color.g,
      b: totals.b + color.b,
    }),
    { r: 0, g: 0, b: 0 },
  )

  return {
    r: Math.round(channels.r / samples.length),
    g: Math.round(channels.g / samples.length),
    b: Math.round(channels.b / samples.length),
  }
}

function colorDistance(a: RgbColor, b: RgbColor) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
}

export function isBackgroundPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  background?: RgbColor | null,
) {
  if (a < 80) return true

  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  if (min > 238 && max - min < 18) return true
  if (min > 228 && max - min < 30) return true

  if (background) {
    const distance = colorDistance({ r, g, b }, background)
    if (distance <= 42 * 42) return true
    if (max - min < 28 && distance <= 58 * 58) return true
  }

  return false
}

export function findContentBounds(width: number, height: number, data: Uint8ClampedArray): ContentBounds | null {
  const background = estimateBackgroundColor(width, height, data)
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let found = false

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      if (isBackgroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) {
        continue
      }
      found = true
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (!found) return null
  return { minX, minY, maxX, maxY }
}

export function hasBackgroundBelow(
  bounds: ContentBounds,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  background?: RgbColor | null,
) {
  const startY = bounds.maxY + 1
  if (startY >= height - 2) return false

  let backgroundCount = 0
  let total = 0
  for (let y = startY; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      total += 1
      if (isBackgroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) {
        backgroundCount += 1
      }
    }
  }

  return total > 0 && backgroundCount / total > 0.65
}

export function hasBackgroundStripBelowSubject(
  bounds: ContentBounds,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  background?: RgbColor | null,
) {
  const stripStart = Math.min(height - 1, bounds.maxY + Math.max(8, Math.round(height * 0.04)))
  if (stripStart >= height - 2) return false

  let backgroundCount = 0
  let total = 0
  for (let y = stripStart; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      total += 1
      if (isBackgroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) {
        backgroundCount += 1
      }
    }
  }

  return total > 0 && backgroundCount / total > 0.8
}

export function isSkinTonePixel(r: number, g: number, b: number) {
  return r > 95 && r > g + 6 && g > b - 8 && r - b > 18
}

interface RowSubjectMetrics {
  subjectRatio: number
  skinRatio: number
  darkRatio: number
  centerSubjectRatio: number
}

function rowSubjectMetrics(
  width: number,
  data: Uint8ClampedArray,
  y: number,
  background: RgbColor | null,
) {
  const centerStart = Math.floor(width * 0.35)
  const centerEnd = Math.ceil(width * 0.65)
  let subject = 0
  let skin = 0
  let dark = 0
  let centerSubject = 0

  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const a = data[offset + 3]
    if (isBackgroundPixel(r, g, b, a, background)) continue
    subject += 1
    if (isSkinTonePixel(r, g, b)) skin += 1
    if (Math.min(r, g, b) < 70) dark += 1
    if (x >= centerStart && x < centerEnd) centerSubject += 1
  }

  return {
    subjectRatio: subject / width,
    skinRatio: subject > 0 ? skin / subject : 0,
    darkRatio: subject > 0 ? dark / subject : 0,
    centerSubjectRatio: centerSubject / Math.max(1, centerEnd - centerStart),
  } satisfies RowSubjectMetrics
}

export function detectGownHemToBottom(width: number, height: number, data: Uint8ClampedArray) {
  const background = estimateBackgroundColor(width, height, data)
  let darkCenterRows = 0
  let total = 0
  const startY = Math.floor(height * 0.62)

  for (let y = startY; y < height; y += Math.max(1, Math.floor(height / 24))) {
    total += 1
    const x = Math.floor(width / 2)
    const offset = (y * width + x) * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    if (!isBackgroundPixel(r, g, b, 255, background) && Math.min(r, g, b) < 70) {
      darkCenterRows += 1
    }
  }

  return total > 0 && darkCenterRows / total > 0.7
}

export function findLegExtensionCropY(
  refWidth: number,
  refHeight: number,
  refData: Uint8ClampedArray,
  aiWidth: number,
  aiHeight: number,
  aiData: Uint8ClampedArray,
) {
  const refBackground = estimateBackgroundColor(refWidth, refHeight, refData)
  const aiBackground = estimateBackgroundColor(aiWidth, aiHeight, aiData)
  const lowerStartRatio = 0.68

  function countCenterSkinRows(
    width: number,
    height: number,
    data: Uint8ClampedArray,
    background: RgbColor | null,
    startRatio: number,
  ) {
    const startY = Math.floor(height * startRatio)
    const step = Math.max(1, Math.floor(height / 80))
    let count = 0

    for (let y = startY; y < height; y += step) {
      const x = Math.floor(width / 2)
      const offset = (y * width + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const a = data[offset + 3]
      if (isBackgroundPixel(r, g, b, a, background)) continue
      if (isSkinTonePixel(r, g, b)) count += 1
    }

    return count
  }

  const refSkinRows = countCenterSkinRows(refWidth, refHeight, refData, refBackground, lowerStartRatio)
  const aiSkinRows = countCenterSkinRows(aiWidth, aiHeight, aiData, aiBackground, lowerStartRatio)
  if (aiSkinRows <= refSkinRows + 2 || aiSkinRows < 4) return null

  for (let yRatio = 0.98; yRatio >= lowerStartRatio; yRatio -= 0.01) {
    const refY = Math.min(refHeight - 1, Math.round(refHeight * yRatio))
    const aiY = Math.min(aiHeight - 1, Math.round(aiHeight * yRatio))
    const refRow = rowSubjectMetrics(refWidth, refData, refY, refBackground)
    const aiRow = rowSubjectMetrics(aiWidth, aiData, aiY, aiBackground)

    const refHasWideLowerBody = refRow.subjectRatio > 0.42 && refRow.darkRatio > 0.3
    const aiShowsLegExtension = refHasWideLowerBody
      && aiRow.skinRatio > 0.22
      && refRow.skinRatio < 0.08
      && aiRow.centerSubjectRatio > 0.2

    if (aiShowsLegExtension) {
      return Math.max(1, Math.round(aiHeight * Math.min(0.99, yRatio + 0.02)))
    }
  }

  return null
}
