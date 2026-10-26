import { deltaE76, rgbToLab, type Lab } from './color'
import { nearestPreparedIndex, type PreparedColor } from './palette'

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export type DitherMode = 'off' | 'light' | 'medium'

function readLab(data: Uint8ClampedArray, offset: number) {
  return rgbToLab(data[offset], data[offset + 1], data[offset + 2])
}

export function detectBorderBackground(data: Uint8ClampedArray, cols: number, rows: number): Lab | null {
  if (cols < 2 || rows < 2) return null
  const points = [
    [0, 0],
    [cols - 1, 0],
    [0, rows - 1],
    [cols - 1, rows - 1],
    [Math.floor(cols / 2), 0],
    [Math.floor(cols / 2), rows - 1],
    [0, Math.floor(rows / 2)],
    [cols - 1, Math.floor(rows / 2)],
  ]
  const samples: Lab[] = []
  for (const [x, y] of points) {
    const offset = (y * cols + x) * 4
    if (data[offset + 3] < 80) continue
    samples.push(readLab(data, offset))
  }
  if (samples.length < 5) return null

  let best = samples[0]
  let bestCount = 0
  for (const candidate of samples) {
    const count = samples.filter((sample) => deltaE76(candidate, sample) < 8).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return bestCount >= 5 ? best : null
}

export function clearConnectedBackground(data: Uint8ClampedArray, cols: number, rows: number, threshold = 14) {
  const background = detectBorderBackground(data, cols, rows)
  if (!background) return false

  const visited = new Uint8Array(cols * rows)
  const queue: number[] = []
  const consider = (x: number, y: number) => {
    const index = y * cols + x
    if (visited[index]) return
    const offset = index * 4
    if (data[offset + 3] < 80) {
      visited[index] = 1
      return
    }
    if (deltaE76(readLab(data, offset), background) > threshold) return
    visited[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < cols; x += 1) {
    consider(x, 0)
    consider(x, rows - 1)
  }
  for (let y = 0; y < rows; y += 1) {
    consider(0, y)
    consider(cols - 1, y)
  }

  while (queue.length) {
    const index = queue.pop() as number
    data[index * 4 + 3] = 0
    const x = index % cols
    const y = Math.floor(index / cols)
    if (x > 0) consider(x - 1, y)
    if (x + 1 < cols) consider(x + 1, y)
    if (y > 0) consider(x, y - 1)
    if (y + 1 < rows) consider(x, y + 1)
  }
  return true
}

function diffuse(errors: Float64Array, index: number, cols: number, rows: number, amount: number) {
  const x = index % cols
  const y = Math.floor(index / cols)
  const spread = (nx: number, ny: number, factor: number) => {
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return
    errors[ny * cols + nx] += amount * factor
  }
  spread(x + 1, y, 7 / 16)
  spread(x - 1, y + 1, 3 / 16)
  spread(x, y + 1, 5 / 16)
  spread(x + 1, y + 1, 1 / 16)
}

export function assignPalette(data: Uint8ClampedArray, cols: number, rows: number, palette: readonly PreparedColor[], dither: DitherMode) {
  const assigned = new Int16Array(cols * rows)
  assigned.fill(-1)
  const errorL = new Float64Array(cols * rows)
  const errorA = new Float64Array(cols * rows)
  const errorB = new Float64Array(cols * rows)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x
      const offset = index * 4
      if (data[offset + 3] < 80) continue
      const source = readLab(data, offset)
      let lab = source
      if (dither === 'light') {
        const nearest = palette[nearestPreparedIndex(source, palette)]
        if (deltaE76(source, nearest.lab) > 8) {
          const threshold = BAYER4[y % 4][x % 4] / 16 - 0.5
          lab = { ...source, l: source.l + threshold * 12 }
        }
      } else if (dither === 'medium') {
        lab = {
          l: source.l + errorL[index],
          a: source.a + errorA[index],
          b: source.b + errorB[index],
        }
      }
      const chosen = nearestPreparedIndex(lab, palette)
      assigned[index] = chosen
      if (dither === 'medium') {
        const color = palette[chosen].lab
        diffuse(errorL, index, cols, rows, (lab.l - color.l) * 0.5)
        diffuse(errorA, index, cols, rows, (lab.a - color.a) * 0.5)
        diffuse(errorB, index, cols, rows, (lab.b - color.b) * 0.5)
      }
    }
  }

  return assigned
}

export function cleanupIsolatedAssignments(assigned: Int16Array, cols: number, rows: number, palette: readonly PreparedColor[], rounds = 2) {
  const next = new Int16Array(assigned)
  for (let round = 0; round < rounds; round += 1) {
    next.set(assigned)
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = y * cols + x
        const current = assigned[index]
        if (current < 0) continue
        const votes = new Map<number, number>()
        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          const neighbor = assigned[ny * cols + nx]
          if (neighbor < 0) continue
          votes.set(neighbor, (votes.get(neighbor) ?? 0) + 1)
        }
        let winner = -1
        let winnerCount = 0
        for (const [color, count] of votes) {
          if (count > winnerCount) {
            winner = color
            winnerCount = count
          }
        }
        if (winner < 0 || winner === current || winnerCount < 3) continue
        if (deltaE76(palette[current].lab, palette[winner].lab) > 18) continue
        next[index] = winner
      }
    }
    assigned.set(next)
  }
}
