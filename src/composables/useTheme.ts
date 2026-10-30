import { ref, onMounted, onUnmounted } from 'vue'
import type { ThemeMode } from '../../electron/shared/ipc-contract.cjs'

const STORAGE_KEY = 'translate-app.theme'
export type { ThemeMode } from '../../electron/shared/ipc-contract.cjs'

const mode = ref<ThemeMode>('system')
const resolvedTheme = ref<'light' | 'dark'>('light')
let mql: MediaQueryList | null = null
let systemListener: (() => void) | null = null
let storageListener: ((event: StorageEvent) => void) | null = null
let consumerCount = 0

function resolveTheme() {
  if (mode.value === 'system') {
    return mql?.matches ? 'dark' : 'light'
  }
  return mode.value
}

function applyTheme() {
  resolvedTheme.value = resolveTheme()
  document.documentElement.dataset.theme = resolvedTheme.value
  // Keep the system mode intact so Electron can clear a previous native override.
  window.api?.setThemeMode(mode.value)
}

function normalizeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function startThemeSync() {
  if (mql) return
  mql = window.matchMedia('(prefers-color-scheme: dark)')
  systemListener = () => {
    if (mode.value === 'system') applyTheme()
  }
  storageListener = (event) => {
    if (event.key !== STORAGE_KEY) return
    mode.value = normalizeMode(event.newValue)
    applyTheme()
  }
  mql.addEventListener('change', systemListener)
  window.addEventListener('storage', storageListener)
}

function stopThemeSync() {
  if (mql && systemListener) mql.removeEventListener('change', systemListener)
  if (storageListener) window.removeEventListener('storage', storageListener)
  mql = null
  systemListener = null
  storageListener = null
}

export function useTheme() {
  onMounted(() => {
    consumerCount += 1
    mode.value = normalizeMode(localStorage.getItem(STORAGE_KEY))
    startThemeSync()
    applyTheme()
  })

  onUnmounted(() => {
    consumerCount = Math.max(0, consumerCount - 1)
    if (consumerCount === 0) stopThemeSync()
  })

  function setMode(next: ThemeMode) {
    mode.value = normalizeMode(next)
    localStorage.setItem(STORAGE_KEY, mode.value)
    applyTheme()
  }

  function toggleLightDark() {
    setMode(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    mode,
    resolvedTheme,
    setMode,
    toggleLightDark,
    cycle: toggleLightDark
  }
}
