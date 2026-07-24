function hexToRgb(hex) {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3
    ? m.split('').map(c => c + c).join('')
    : m, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function shift(hex, amt) {
  const { r, g, b } = hexToRgb(hex)
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt)))
  return `#${[c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export function setBrand(hex) {
  const root = document.documentElement.style
  root.setProperty('--brand', hex)
  root.setProperty('--brand-strong', shift(hex, -28))
  root.setProperty('--brand-soft', hex + '14')
}
