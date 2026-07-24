import { ref, watch, onMounted, onUnmounted } from 'vue'

const STORAGE_KEY = 'translate-app.theme'

const mode = ref('system')
let mql = null
let systemListener = null

function resolveTheme() {
  if (mode.value === 'system') {
    return mql?.matches ? 'dark' : 'light'
  }
  return mode.value
}

function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme()
}

export function useTheme() {
  onMounted(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || 'system'
    mode.value = saved
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    systemListener = () => { if (mode.value === 'system') applyTheme() }
    mql.addEventListener('change', systemListener)
    applyTheme()
  })

  onUnmounted(() => {
    if (mql && systemListener) mql.removeEventListener('change', systemListener)
  })

  function setMode(next) {
    mode.value = next
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme()
  }

  function cycle() {
    const order = ['system', 'light', 'dark']
    const idx = order.indexOf(mode.value)
    setMode(order[(idx + 1) % order.length])
  }

  return { mode, setMode, cycle }
}
