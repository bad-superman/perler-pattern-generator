import { createRng, deltaE76, type Lab } from './color'
import { nearestPreparedIndex, type PreparedColor } from './palette'

export interface LabSample {
  lab: Lab
  weight: number
}

const SAMPLE_LIMIT = 20000
const MAX_ITERATIONS = 20

function reservoirSample(items: LabSample[], count: number, random: () => number) {
  const picked = items.slice(0, count)
  for (let index = count; index < items.length; index += 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    if (swapIndex < count) picked[swapIndex] = items[index]
  }
  return picked
}

function limitSamples(samples: LabSample[], random: () => number) {
  if (samples.length <= SAMPLE_LIMIT) return samples
  const heavy = samples.filter((sample) => sample.weight > 1)
  const light = samples.filter((sample) => sample.weight <= 1)
  if (heavy.length >= SAMPLE_LIMIT) return reservoirSample(heavy, SAMPLE_LIMIT, random)
  return heavy.concat(reservoirSample(light, SAMPLE_LIMIT - heavy.length, random))
}

function kMeans(samples: LabSample[], clusterCount: number, random: () => number): Lab[] {
  const count = Math.min(clusterCount, samples.length)
  if (!count) return []

  const centroids: Lab[] = [samples[Math.floor(random() * samples.length)].lab]
  while (centroids.length < count) {
    let total = 0
    const distances = samples.map((sample) => {
      let nearest = Number.POSITIVE_INFINITY
      for (const centroid of centroids) {
        const distance = (sample.lab.l - centroid.l) ** 2 + (sample.lab.a - centroid.a) ** 2 + (sample.lab.b - centroid.b) ** 2
        if (distance < nearest) nearest = distance
      }
      const weighted = nearest * sample.weight
      total += weighted
      return weighted
    })
    let cursor = random() * total
    let chosen = samples.length - 1
    for (let index = 0; index < samples.length; index += 1) {
      cursor -= distances[index]
      if (cursor <= 0) {
        chosen = index
        break
      }
    }
    centroids.push({ ...samples[chosen].lab })
  }

  const assignment = new Int32Array(samples.length)
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let changed = false
    for (let index = 0; index < samples.length; index += 1) {
      const lab = samples[index].lab
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
        const centroid = centroids[centroidIndex]
        const distance = (lab.l - centroid.l) ** 2 + (lab.a - centroid.a) ** 2 + (lab.b - centroid.b) ** 2
        if (distance < bestDistance) {
          bestDistance = distance
          best = centroidIndex
        }
      }
      if (assignment[index] !== best) {
        assignment[index] = best
        changed = true
      }
    }

    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, w: 0 }))
    for (let index = 0; index < samples.length; index += 1) {
      const bucket = sums[assignment[index]]
      const weight = samples[index].weight
      bucket.l += samples[index].lab.l * weight
      bucket.a += samples[index].lab.a * weight
      bucket.b += samples[index].lab.b * weight
      bucket.w += weight
    }
    for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
      const bucket = sums[centroidIndex]
      if (bucket.w <= 0) continue
      centroids[centroidIndex] = {
        l: bucket.l / bucket.w,
        a: bucket.a / bucket.w,
        b: bucket.b / bucket.w,
      }
    }
    if (!changed && iteration > 0) break
  }

  return centroids
}

export function selectPaletteColors(samples: LabSample[], palette: readonly PreparedColor[], maxColors: number) {
  if (!samples.length || !palette.length || maxColors <= 0) return []
  const random = createRng(1)
  const limited = limitSamples(samples, random)
  const centroids = kMeans(limited, Math.min(maxColors, limited.length), random)
  const selected: PreparedColor[] = []
  const selectedKeys = new Set<number>()

  for (const centroid of centroids) {
    const match = palette[nearestPreparedIndex(centroid, palette)]
    if (selectedKeys.has(match.index)) continue
    selectedKeys.add(match.index)
    selected.push(match)
  }

  const frequency = new Map<number, number>()
  for (const sample of limited) {
    const match = palette[nearestPreparedIndex(sample.lab, palette)]
    frequency.set(match.index, (frequency.get(match.index) ?? 0) + sample.weight)
  }
  const minCount = Math.max(4, Math.round(limited.length * 0.004))
  const candidates = [...frequency.entries()]
    .filter(([index, count]) => !selectedKeys.has(index) && count >= minCount)
    .map(([index, count]) => ({ color: palette[index], count }))

  while (selected.length < maxColors && candidates.length) {
    let bestCandidate = candidates[0]
    let bestDistance = -1
    for (const candidate of candidates) {
      let nearest = Number.POSITIVE_INFINITY
      for (const color of selected) {
        nearest = Math.min(nearest, deltaE76(candidate.color.lab, color.lab))
      }
      if (nearest > bestDistance) {
        bestDistance = nearest
        bestCandidate = candidate
      }
    }
    const coversLargeArea = bestCandidate.count >= limited.length * 0.03
    if (bestDistance < 6 && !coversLargeArea) break
    selected.push(bestCandidate.color)
    selectedKeys.add(bestCandidate.color.index)
    const removeAt = candidates.indexOf(bestCandidate)
    candidates.splice(removeAt, 1)
  }

  return selected
}
