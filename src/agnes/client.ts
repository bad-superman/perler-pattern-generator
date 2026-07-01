import { buildAgnesPrompt } from './styles'

interface GenerateAgnesImageOptions {
  file?: File
  styleId: string
  extraPrompt?: string
  gridSize?: number
  maxColors?: number
  size?: string
  prompt?: string
}

interface AgnesGenerateResponse {
  imageBase64?: string
  mimeType?: string
  imageUrl?: string
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

export async function generateAgnesImage(options: GenerateAgnesImageOptions): Promise<File> {
  const prompt = options.prompt ?? buildAgnesPrompt(options.styleId, options.extraPrompt, options.gridSize, options.maxColors)
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('styleId', options.styleId)
  if (options.size) form.append('size', options.size)
  if (options.file) form.append('image', options.file)

  const response = await fetch('/api/agnes/generate', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(360_000),
  })

  const payload = await response.json().catch(() => null) as (AgnesGenerateResponse & { error?: string }) | null
  if (!response.ok) {
    if (!payload) {
      throw new Error(`AI 服务未就绪（${response.status}），请检查 Cloudflare Functions 与环境变量`)
    }
    throw new Error(payload.error ?? `AI 生成失败（${response.status}）`)
  }
  if (!payload) throw new Error('AI 返回数据无效')

  return responseToFile(payload, options.styleId)
}

export async function pickAgnesSize(file?: File, shape: 'ratio' | 'square' = 'ratio'): Promise<string> {
  if (!file) return '1024x1024'

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('无法解析上传图片尺寸'))
      element.src = url
    })

    if (shape === 'square') return '1024x1024'

    const ratio = image.width / Math.max(image.height, 1)
    if (ratio >= 1.2) return '1024x768'
    if (ratio <= 0.8) return '768x1024'
    return '1024x1024'
  } finally {
    URL.revokeObjectURL(url)
  }
}
