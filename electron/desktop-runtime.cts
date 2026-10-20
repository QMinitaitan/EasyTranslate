import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle, Screen, WebContents } from 'electron'
import type { AppConfig, ConfigUpdate, TranslationTrigger } from './shared/ipc-contract.cjs'
import { createPopupBoundsStore, DEFAULT_POPUP_BOUNDS, MIN_POPUP_BOUNDS, supportsCursorPositioning } from '../electron/popup-bounds.cjs'
import { createPopupAutoHideController, type PopupAutoHideController } from '../electron/popup-auto-hide.cjs'

type Timer = ReturnType<typeof setTimeout>
interface Dependencies {
  createWindow(options: BrowserWindowConstructorOptions): BrowserWindow
  frontend: { htmlPath: string; preloadPath: string; devServerUrl?: string }
  loadConfig(): Partial<AppConfig>
  saveConfig(partial: ConfigUpdate): unknown
  screen: Pick<Screen, 'getCursorScreenPoint' | 'getDisplayNearestPoint'>
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  schedule?(callback: () => void, delay: number): Timer
  cancel?(timer: Timer): void
  now?(): number
  onSaveError?(error: unknown): void
}
interface Popup {
  window: BrowserWindow
  ready: boolean
  cleanup: (() => void)[]
  autoHide: PopupAutoHideController
  geometryTimer: Timer | null
  geometry: Rectangle | null
  ignoreBounds: Rectangle | null
}

/** Owns this application's one concrete Electron popup and its delivery lifecycle. */
export function createDesktopRuntime({ createWindow, frontend, screen, loadConfig, saveConfig, platform = process.platform, env = process.env, onSaveError, schedule = setTimeout, cancel = clearTimeout, now = Date.now }: Dependencies) {
  let popup: Popup | null = null
  let pending: TranslationTrigger | null = null
  let prewarm: Timer | null = null
  let disposed = false
  let pinned = false
  const cursorPositioningSupported = supportsCursorPositioning(platform, env)
  const boundsStore = createPopupBoundsStore({ loadConfig, saveConfig, onSaveError })
  const isIgnoredGeometry = (record: Popup, bounds: Rectangle) => !!record.ignoreBounds &&
    (['x', 'y', 'width', 'height'] as const).every(key => bounds[key] === record.ignoreBounds![key])

  const saveGeometry = (record: Popup) => {
    if (record.geometryTimer !== null) cancel(record.geometryTimer)
    record.geometryTimer = null
    if (!record.geometry) return
    const bounds = record.geometry
    record.geometry = null
    boundsStore.update(bounds, { preservePosition: cursorPositioningSupported })
  }

  const cancelPrewarm = () => { if (prewarm !== null) cancel(prewarm); prewarm = null }
  const deliver = () => {
    if (!popup?.ready || !pending || popup.window.isDestroyed()) return
    const trigger = pending
    pending = null
    const stored = boundsStore.get()
    const win = popup.window
    const current = win.getBounds()
    if (current.width !== stored.width || current.height !== stored.height) win.setSize(stored.width, stored.height)
    if (cursorPositioningSupported && (stored.x === undefined || stored.y === undefined)) {
      popup.ignoreBounds = null
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      const bounds = win.getBounds()
      let x = cursor.x + 12
      let y = cursor.y + 12
      if (x + bounds.width > display.bounds.x + display.bounds.width) x = Math.max(display.bounds.x, cursor.x - bounds.width - 12)
      if (y + bounds.height > display.bounds.y + display.bounds.height) y = Math.max(display.bounds.y, cursor.y - bounds.height - 12)
      win.setBounds({ x, y, width: bounds.width, height: bounds.height })
    }
    popup.window.show()
    popup.window.focus()
    popup.window.webContents.send('translate:trigger', trigger)
  }
  const ensureWindow = () => {
    cancelPrewarm()
    if (popup && !popup.window.isDestroyed()) return popup
    const stored = boundsStore.get()
    pinned = false
    const win = createWindow({
      width: stored.width || DEFAULT_POPUP_BOUNDS.width, height: stored.height || DEFAULT_POPUP_BOUNDS.height,
      ...(cursorPositioningSupported ? { x: stored.x, y: stored.y } : {}),
      minWidth: MIN_POPUP_BOUNDS.width, minHeight: MIN_POPUP_BOUNDS.height,
      frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: true, show: false, backgroundColor: '#fafafa',
      webPreferences: { preload: frontend.preloadPath, contextIsolation: true, nodeIntegration: false }
    })
    const autoHide = createPopupAutoHideController({
      isPinned: () => pinned,
      hide: () => { if (!win.isDestroyed()) win.hide() },
      setAlwaysOnTop: value => { if (!win.isDestroyed()) win.setAlwaysOnTop(value) },
      schedule, cancel
    })
    const record: Popup = { window: win, ready: false, cleanup: [], autoHide, geometryTimer: null, geometry: null, ignoreBounds: null }
    popup = record
    const loading = () => { record.ready = false }
    const closed = () => {
      saveGeometry(record)
      record.autoHide.dispose()
      for (const cleanup of record.cleanup) cleanup()
      if (popup === record) { popup = null; pending = null }
    }
    win.webContents.on('did-start-loading', loading)
    win.webContents.on('render-process-gone', loading)
    win.on('closed', closed)
    record.cleanup.push(
      () => win.webContents.removeListener('did-start-loading', loading),
      () => win.webContents.removeListener('render-process-gone', loading),
      () => win.removeListener('closed', closed)
    )
    const moved = () => {
      if (win.isDestroyed()) return
      record.autoHide.onMove()
      const bounds = win.getBounds()
      if (isIgnoredGeometry(record, bounds)) return
      record.ignoreBounds = null
      record.geometry = bounds
      if (record.geometryTimer !== null) cancel(record.geometryTimer)
      record.geometryTimer = schedule(() => saveGeometry(record), 200)
    }
    const focus = () => record.autoHide.onFocus()
    const blur = () => record.autoHide.onBlur()
    win.on('move', moved)
    win.on('resize', moved)
    win.on('focus', focus)
    win.on('blur', blur)
    record.cleanup.push(
      () => win.removeListener('move', moved), () => win.removeListener('resize', moved),
      () => win.removeListener('focus', focus), () => win.removeListener('blur', blur)
    )
    const loadingPage = frontend.devServerUrl
      ? win.loadURL(frontend.devServerUrl + '/#/popup?window=popup')
      : win.loadFile(frontend.htmlPath, { hash: '/popup?window=popup' })
    void loadingPage.catch(() => { record.ready = false })
    return record
  }

  return {
    schedulePrewarm() {
      if (disposed || popup || prewarm !== null) return
      prewarm = schedule(() => { prewarm = null; if (!disposed) ensureWindow() }, 0)
    },
    prewarm() { if (!disposed) ensureWindow() },
    showTranslation(text: string) {
      if (disposed) return
      ensureWindow()
      pending = { text, ts: now() }
      deliver()
    },
    markReady(sender: WebContents): { pinned: boolean } | null {
      if (disposed || !popup || popup.window.isDestroyed() || popup.window.webContents !== sender) return null
      popup.ready = true
      deliver()
      return { pinned }
    },
    markNotReady(sender: WebContents) {
      if (!popup || popup.window.webContents !== sender) return false
      popup.ready = false
      return true
    },
    setPinned(value: boolean) {
      if (typeof value !== 'boolean' || disposed) return
      pinned = value
      popup?.autoHide.onPinChange(value)
    },
    hide() {
      popup?.autoHide.onFocus()
      if (popup && !popup.window.isDestroyed()) popup.window.hide()
    },
    dismiss() {
      if (!pinned && popup && !popup.window.isDestroyed()) popup.window.hide()
    },
    resize(width: number, height: number) {
      if (disposed || !popup || popup.window.isDestroyed() || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
      popup.window.setSize(Math.max(MIN_POPUP_BOUNDS.width, Math.round(width)), Math.max(MIN_POPUP_BOUNDS.height, Math.round(height)))
    },
    async resetBounds() {
      if (disposed) throw new Error('Desktop runtime has been disposed')
      if (popup) {
        if (popup.geometryTimer !== null) cancel(popup.geometryTimer)
        popup.geometryTimer = null
        popup.geometry = null
      }
      const bounds = boundsStore.reset()
      if (popup && !popup.window.isDestroyed()) {
        popup.ignoreBounds = { ...popup.window.getBounds(), width: bounds.width, height: bounds.height }
        popup.window.setSize(bounds.width, bounds.height)
      }
      await boundsStore.flush()
      return bounds
    },
    async flush() {
      if (popup && !popup.window.isDestroyed()) {
        const current = popup.window.getBounds()
        if (!isIgnoredGeometry(popup, current)) popup.geometry = current
      }
      if (popup) saveGeometry(popup)
      await boundsStore.flush()
    },
    dispose() {
      disposed = true
      cancelPrewarm()
      pending = null
      if (popup) saveGeometry(popup)
      if (popup && !popup.window.isDestroyed()) popup.window.destroy()
      popup = null
    }
  }
}
