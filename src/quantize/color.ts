export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Lab {
  l: number
  a: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function srgbToLinear(channel: number) {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function labPivot(value: number) {
  return value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116)
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const red = srgbToLinear(r)
  const green = srgbToLinear(g)
  const blue = srgbToLinear(b)
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883
  const fx = labPivot(x)
  const fy = labPivot(y)
  const fz = labPivot(z)
  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function deltaE76(left: Lab, right: Lab) {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b)
}

export function createRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}
