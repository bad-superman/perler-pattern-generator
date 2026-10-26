interface AxisPeriod {
  period: number
  correlation: number
  offset: number
  peak: number
}

function edgeScores(data: Uint8ClampedArray, width: number, height: number, axis: 'x' | 'y') {
  const length = axis === 'x' ? width - 1 : height - 1
  const scores = new Float64Array(length)
  const sampleStep = Math.max(1, Math.floor((axis === 'x' ? height : width) / 80))
  for (let index = 0; index < length; index += 1) {
    let sum = 0
    let count = 0
    if (axis === 'x') {
      for (let y = 0; y < height; y += sampleStep) {
        const offset = (y * width + index) * 4
        sum += Math.abs(data[offset] - data[offset + 4])
          + Math.abs(data[offset + 1] - data[offset + 5])
          + Math.abs(data[offset + 2] - data[offset + 6])
        count += 1
      }
    } else {
      for (let x = 0; x < width; x += sampleStep) {
        const offset = (index * width + x) * 4
        const next = offset + width * 4
        sum += Math.abs(data[offset] - data[next])
          + Math.abs(data[offset + 1] - data[next + 1])
          + Math.abs(data[offset + 2] - data[next + 2])
        count += 1
      }
    }
    scores[index] = sum / Math.max(count, 1)
  }
  return scores
}

function correlationAt(scores: Float64Array, lag: number) {
  let mean = 0
  for (const value of scores) mean += value
  mean /= scores.length
  let product = 0
  let leftEnergy = 0
  let rightEnergy = 0
  for (let index = 0; index + lag < scores.length; index += 1) {
    const left = scores[index] - mean
    const right = scores[index + lag] - mean
    product += left * right
    leftEnergy += left * left
    rightEnergy += right * right
  }
  return product / Math.sqrt(leftEnergy * rightEnergy + 1e-9)
}

function analyzeAxis(scores: Float64Array): AxisPeriod | null {
  if (scores.length < 32) return null
  const maxPeriod = Math.min(96, Math.floor(scores.length / 6))
  const candidates: Array<{ period: number; correlation: number }> = []
  for (let period = 4; period <= maxPeriod; period += 1) {
    const correlation = correlationAt(scores, period)
    if (correlation >= 0.55) candidates.push({ period, correlation })
  }
  if (!candidates.length) return null
  candidates.sort((left, right) => right.correlation - left.correlation)
  const bestCorrelation = candidates[0].correlation
  const fundamental = candidates
    .filter((candidate) => bestCorrelation - candidate.correlation < 0.05)
    .sort((left, right) => left.period - right.period)[0]

  let offset = 0
  let peak = -1
  for (let candidate = 0; candidate < fundamental.period; candidate += 1) {
    let sum = 0
    let count = 0
    for (let index = candidate; index < scores.length; index += fundamental.period) {
      sum += scores[index]
      count += 1
    }
    const average = sum / count
    if (average > peak) {
      peak = average
      offset = candidate
    }
  }

  let mean = 0
  for (const value of scores) mean += value
  mean /= scores.length
  if (fundamental.correlation < 0.62 || peak < Math.max(18, mean * 2.2)) return null
  return { period: fundamental.period, correlation: fundamental.correlation, offset, peak }
}

export interface PixelGridDetection {
  period: number
  offsetX: number
  offsetY: number
  confidence: number
}

export function detectPixelGrid(data: Uint8ClampedArray, width: number, height: number): PixelGridDetection | null {
  const horizontal = analyzeAxis(edgeScores(data, width, height, 'x'))
  const vertical = analyzeAxis(edgeScores(data, width, height, 'y'))
  if (!horizontal || !vertical) return null
  if (horizontal.period !== vertical.period) return null
  const originX = (horizontal.offset + 1) % horizontal.period
  const originY = (vertical.offset + 1) % vertical.period
  const cellsX = Math.floor((width - originX) / horizontal.period)
  const cellsY = Math.floor((height - originY) / vertical.period)
  if (cellsX < 8 || cellsY < 8 || cellsX > 160 || cellsY > 160) return null
  return {
    period: horizontal.period,
    offsetX: originX,
    offsetY: originY,
    confidence: Math.min(horizontal.correlation, vertical.correlation),
  }
}

export function sampleDetectedGrid(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  detection: PixelGridDetection,
  cols: number,
  rows: number,
) {
  const { period, offsetX, offsetY } = detection
  const artCols = Math.floor((width - offsetX) / period)
  const artRows = Math.floor((height - offsetY) / period)
  const art = new Uint8ClampedArray(artCols * artRows * 4)
  const inset = Math.max(1, Math.floor(period * 0.3))
  for (let y = 0; y < artRows; y += 1) {
    for (let x = 0; x < artCols; x += 1) {
      const sx = Math.min(width - 1, offsetX + x * period + inset)
      const sy = Math.min(height - 1, offsetY + y * period + inset)
      const from = (sy * width + sx) * 4
      const to = (y * artCols + x) * 4
      art[to] = source[from]
      art[to + 1] = source[from + 1]
      art[to + 2] = source[from + 2]
      art[to + 3] = source[from + 3]
    }
  }

  const scaled = new ImageData(cols, rows)
  for (let y = 0; y < rows; y += 1) {
    const sy = Math.min(artRows - 1, Math.floor(((y + 0.5) * artRows) / rows))
    for (let x = 0; x < cols; x += 1) {
      const sx = Math.min(artCols - 1, Math.floor(((x + 0.5) * artCols) / cols))
      const from = (sy * artCols + sx) * 4
      const to = (y * cols + x) * 4
      scaled.data[to] = art[from]
      scaled.data[to + 1] = art[from + 1]
      scaled.data[to + 2] = art[from + 2]
      scaled.data[to + 3] = art[from + 3]
    }
  }
  return scaled
}
