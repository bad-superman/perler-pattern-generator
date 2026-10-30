import { buildAgnesPrompt, type AiFraming } from './styles'

interface GenerateAgnesImageOptions {
  file?: File
  effectFile?: File
  styleId: string
  extraPrompt?: string
  gridSize?: number
  maxColors?: number
  size?: string
  ratio?: string
  count?: number
  prompt?: string
  negativePrompt?: string
  hasEffectReference?: boolean
  framing?: AiFraming
}

export type AgnesProviderRole = 'default' | 'fallback'

interface AgnesGenerateResponse {
  imageBase64?: string
  mimeType?: string
  imageUrl?: string
  /** Which configured provider produced this image. Absent on older servers. */
  provider?: AgnesProviderRole
  model?: string
  images?: AgnesGenerateResponse[]
}

export interface AgnesGenerationResult {
  files: File[]
  /** True when at least one image came from the fallback provider. */
  usedFallback: boolean
  providers: AgnesProviderRole[]
  models: string[]
}

async function responseToFile(payload: AgnesGenerateResponse, styleId: string): Promise<File> {
  if (payload.imageBase64) {
    const mimeType = payload.mimeType ?? 'image/png'
    const binary = atob(payload.imageBase64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new File([bytes], `ai-${styleId}.png`, { type: mimeType })
  }

  if (payload.imageUrl) {
    const response = await fetch(payload.imageUrl)
    if (!response.ok) throw new Error('无法下载 AI 生成的图片')
    const blob = await response.blob()
    return new File([blob], `ai-${styleId}.png`, { type: blob.type || 'image/png' })
  }

  throw new Error('AI 未返回有效图片')
}

export async function generateAgnesImages(options: GenerateAgnesImageOptions): Promise<AgnesGenerationResult> {
  const prompt = options.prompt ?? buildAgnesPrompt({
    styleId: options.styleId,
    extraPrompt: options.extraPrompt,
    gridSize: options.gridSize,
    maxColors: options.maxColors,
    negativePrompt: options.negativePrompt,
    hasEffectReference: options.hasEffectReference ?? Boolean(options.effectFile),
    framing: options.framing,
  })
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('styleId', options.styleId)
  if (options.size) form.append('size', options.size)
  if (options.ratio) form.append('ratio', options.ratio)
  if (options.count && options.count > 1) form.append('count', String(Math.min(4, Math.round(options.count))))
  if (options.file) form.append('image', options.file)
  if (options.effectFile) form.append('effectImage', options.effectFile)

  const response = await fetch('/api/agnes/generate', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(360_000),
  })

  const raw = await response.text()
  const payload = (() => {
    try {
      return JSON.parse(raw) as AgnesGenerateResponse & { error?: string }
    } catch {
      return null
    }
  })()
  if (!response.ok) {
    if (!payload) {
      const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
      throw new Error(snippet
        ? `AI 服务异常（${response.status}）：${snippet}`
        : `AI 服务未就绪（${response.status}），请检查 Cloudflare Functions 与环境变量`)
    }
    throw new Error(payload.error ?? `AI 生成失败（${response.status}）`)
  }
  if (!payload) throw new Error('AI 返回数据无效')

  const images = payload.images?.length ? payload.images : [payload]
  const files = await Promise.all(images.map((image) => responseToFile(image, options.styleId)))
  const providers = images.map((image) => image.provider ?? 'default')
  return {
    files,
    usedFallback: providers.includes('fallback'),
    providers,
    models: images.map((image) => image.model ?? ''),
  }
}

export async function generateAgnesImage(options: GenerateAgnesImageOptions): Promise<File> {
  const { files: [image] } = await generateAgnesImages(options)
  return image
}

export async function pickAgnesSize(file?: File, shape: 'ratio' | 'square' = 'ratio', framing: AiFraming = 'follow'): Promise<{ size: string; ratio: string }> {
  if (framing === 'headshot') return { size: '1K', ratio: '1:1' }
  if (!file) return { size: '1K', ratio: framing === 'half' || framing === 'full' ? '3:4' : '1:1' }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('无法解析上传图片尺寸'))
      element.src = url
    })

    if (shape === 'square') return { size: '1K', ratio: '1:1' }

    const ratio = image.width / Math.max(image.height, 1)
    if (framing === 'half' || framing === 'full') {
      return { size: '1K', ratio: ratio >= 1.2 ? '4:3' : '3:4' }
    }
    if (ratio >= 1.2) return { size: '1K', ratio: '4:3' }
    if (ratio <= 0.8) return { size: '1K', ratio: '3:4' }
    return { size: '1K', ratio: '1:1' }
  } finally {
    URL.revokeObjectURL(url)
  }
}
