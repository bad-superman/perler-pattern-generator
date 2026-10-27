export function isDarkHex(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(value)) return false
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  // Perceived brightness (ITU-R BT.601); dark backgrounds get white labels.
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}
