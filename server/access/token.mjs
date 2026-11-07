function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function generateAccessToken(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(24)
  cryptoApi.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export async function hashAccessToken(token, cryptoApi = globalThis.crypto) {
  const normalized = String(token || '').trim()
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return bytesToHex(new Uint8Array(digest))
}

export function readBearerToken(request) {
  const header = request.headers.get('Authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}
