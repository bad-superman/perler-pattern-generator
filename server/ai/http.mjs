import { MAX_IMAGE_BYTES, generateImages } from './index.mjs'

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x400
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function isUpload(value) {
  return Boolean(value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.size === 'number' && value.size > 0)
}

async function blobToDataUri(blob) {
  const mimeType = blob.type?.startsWith('image/') ? blob.type : 'image/png'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

export async function executeGenerateRequest(request, aiConfig, hooks, options = {}) {
  const formData = await request.formData()
  const prompt = String(formData.get('prompt') ?? '').trim()
  const size = String(formData.get('size') ?? '1K').trim() || '1K'
  const ratio = String(formData.get('ratio') ?? '').trim()
  const requestedCount = Number(formData.get('count') ?? '1')
  const count = options.forceCount ?? requestedCount
  const image = formData.get('image')
  const effectImage = formData.get('effectImage')

  if (!prompt) throw Object.assign(new Error('缺少 prompt 参数'), { status: 400, code: 'INVALID_PROMPT' })
  if (isUpload(image) && image.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('图片过大，请上传 8MB 以内的图片'), { status: 400, code: 'IMAGE_TOO_LARGE' })
  }
  if (isUpload(effectImage) && effectImage.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('效果参考图过大，请上传 8MB 以内的图片'), { status: 400, code: 'EFFECT_IMAGE_TOO_LARGE' })
  }

  const generationRequest = {
    prompt,
    size,
    ratio,
    imageDataUri: isUpload(image) ? await blobToDataUri(image) : undefined,
    effectImageDataUri: isUpload(effectImage) ? await blobToDataUri(effectImage) : undefined,
  }
  const result = await generateImages(generationRequest, count, aiConfig, hooks)
  return {
    result,
    meta: {
      count,
      size,
      ratio,
      imageSize: isUpload(image) ? image.size : 0,
      hasEffectImage: isUpload(effectImage),
    },
  }
}
