import { cropSubjectFromImage } from './cropSubject'

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法解析参考图'))
    }
    image.src = url
  })
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法预处理参考图'))
        return
      }
      resolve(new File([blob], fileName, { type: 'image/png' }))
    }, 'image/png')
  })
}

function ratioValue(ratio: string) {
  if (ratio === '4:3') return 4 / 3
  if (ratio === '3:4') return 3 / 4
  if (ratio === '16:9') return 16 / 9
  if (ratio === '9:16') return 9 / 16
  return 1
}

async function cropToRatio(file: File, ratio: string) {
  const image = await loadImage(file)
  const target = ratioValue(ratio)
  const current = image.width / Math.max(image.height, 1)
  if (Math.abs(current - target) < 0.04) return file

  let cropW = image.width
  let cropH = image.height
  if (current > target) cropW = Math.round(image.height * target)
  else cropH = Math.round(image.width / target)
  const cropX = Math.max(0, Math.round((image.width - cropW) / 2))
  const cropY = Math.max(0, Math.round((image.height - cropH) / 2))

  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return canvasToFile(canvas, file.name.replace(/\.\w+$/, '') + '-ref.png')
}

async function shrinkForUpload(file: File, maxSide = 1280) {
  const image = await loadImage(file)
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height, 1))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  if (scale === 1 && file.size < 900_000) return file

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法压缩参考图'))
        return
      }
      resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '-ref.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.85)
  })
}

export async function prepareReferenceImage(file: File, ratio: string) {
  const cropped = await cropSubjectFromImage(file)
  const framed = await cropToRatio(cropped, ratio)
  return shrinkForUpload(framed)
}
