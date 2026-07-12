import type { VisionPerlerAnalysis, VisionRequestOptions } from './visionTypes'

function stripJsonFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function normalizeAnalysis(value: unknown): VisionPerlerAnalysis {
  const candidate = value && typeof value === 'object' && 'analysis' in value
    ? (value as { analysis: unknown }).analysis
    : value
  if (!candidate || typeof candidate !== 'object') throw new Error('Vision 返回 JSON 无效')
  return candidate as VisionPerlerAnalysis
}

export async function analyzeImageForPerler(options: VisionRequestOptions): Promise<VisionPerlerAnalysis> {
  const form = new FormData()
  form.append('image', options.file)
  form.append('gridSize', String(options.gridSize))
  form.append('maxColors', String(options.maxColors))
  form.append('userStyle', options.userStyle)

  const response = await fetch('/api/agnes/analyze', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(180_000),
  })

  const payload = await response.json().catch(() => null) as { analysis?: unknown; rawText?: string; error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? `Vision 分析失败（${response.status}）`)
  if (!payload) throw new Error('Vision 返回数据无效')
  if (payload.rawText && !payload.analysis) return normalizeAnalysis(JSON.parse(stripJsonFence(payload.rawText)))
  return normalizeAnalysis(payload)
}
