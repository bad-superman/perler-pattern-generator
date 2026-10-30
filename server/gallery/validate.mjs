import { GALLERY_LIMITS, PALETTE_SIZES } from './limits.mjs'

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fail(error) {
  return { ok: false, error }
}

export async function validateShare(input, paletteSizes = PALETTE_SIZES) {
  if (!input || typeof input !== 'object') return fail('图纸数据无效')
  const nickname = typeof input.nickname === 'string' ? input.nickname.trim() : ''
  const nicknameLength = [...nickname].length
  if (nicknameLength < 1 || nicknameLength > GALLERY_LIMITS.nicknameMax) return fail('请填写 1–16 个字的昵称')
  if (/[\u0000-\u001f]/.test(nickname)) return fail('昵称不能包含换行')

  const brand = input.brand
  if (brand !== 'mard' && brand !== 'hama') return fail('色卡品牌无效')
  const { cols, rows, mirrored, cells } = input
  if (!Number.isInteger(cols) || cols < GALLERY_LIMITS.minGrid || cols > GALLERY_LIMITS.maxGrid) return fail('图纸宽度无效')
  if (!Number.isInteger(rows) || rows < GALLERY_LIMITS.minGrid || rows > GALLERY_LIMITS.maxGrid) return fail('图纸高度无效')
  if (typeof mirrored !== 'boolean') return fail('图纸数据无效')
  if (!Array.isArray(cells) || cells.length !== cols * rows) return fail('图纸格子数量不对')

  const paletteSize = paletteSizes[brand]
  const used = new Set()
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < -1 || cell >= paletteSize) return fail('图纸里有无法识别的色号')
    if (cell >= 0) used.add(cell)
  }
  if (used.size < 1) return fail('图纸是空的')
  if (used.size > GALLERY_LIMITS.maxColors) return fail('颜色超过 50 种')

  const canonical = { brand, cols, rows, mirrored, cells }
  return {
    ok: true,
    value: {
      nickname,
      ...canonical,
      colorCount: used.size,
      contentHash: await sha256(JSON.stringify(canonical)),
    },
  }
}

export async function hashIp(ip) {
  return sha256(String(ip || 'unknown'))
}

export function validateNickname(nickname) {
  const trimmed = typeof nickname === 'string' ? nickname.trim() : ''
  const length = [...trimmed].length
  if (length < 1 || length > GALLERY_LIMITS.nicknameMax || /[\u0000-\u001f]/.test(trimmed)) {
    return { ok: false, error: '请填写 1–16 个字的昵称' }
  }
  return { ok: true, nickname: trimmed }
}
