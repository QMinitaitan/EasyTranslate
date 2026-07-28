const { app, BrowserWindow, Menu, ipcMain, shell, clipboard, screen, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const net = require('net')
const { getSelection } = require('./selection.cjs')
const { translateWith } = require('./translate.cjs')
const { getProvider, getAll: getAllProviders } = require('./providers.cjs')
const { load: loadConfig, save: saveConfig } = require('./config.cjs')
const history = require('./history.cjs')
const autoStart = require('./autostart.cjs')
const { runTranslationRace } = require('./race.cjs')
const { createPopupAutoHideController } = require('./popup-auto-hide.cjs')
const {
  DEFAULT_POPUP_BOUNDS,
  MIN_POPUP_BOUNDS,
  createPopupBoundsStore,
  supportsCursorPositioning
} = require('./popup-bounds.cjs')

const isDev = !!process.env.VITE_DEV_SERVER_URL
const cursorPositioningSupported = supportsCursorPositioning(process.platform, process.env)
const appIconDir = path.join(__dirname, '../assets/icon-v3')
const trayIconPath = path.join(appIconDir, 'easytranslate-mark-16.png')
const windowIconPath = path.join(appIconDir, 'easytranslate-mark-256.png')

app.setName('EasyTranslate')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.easytranslate.app')
}
if (!cursorPositioningSupported) {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
}

Menu.setApplicationMenu(null)

let mainWin = null
let popupWin = null
let popupPinned = false
let popupAutoHideController = null
let tray = null
const popupBoundsStore = createPopupBoundsStore({ loadConfig, saveConfig })

function createTray() {
  try {
    const img = nativeImage.createFromPath(trayIconPath)
    if (img.isEmpty()) throw new Error(`failed to load ${trayIconPath}`)
    tray = new Tray(img.resize({ width: 16, height: 16 }))
    const ctxMenu = Menu.buildFromTemplate([
      { label: '打开设置', click: () => { mainWin.show(); mainWin.focus() } },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuiting = true; app.quit() } }
    ])
    tray.setToolTip('Translate · 划词翻译')
    tray.setContextMenu(ctxMenu)
    tray.on('click', () => { mainWin.show(); mainWin.focus() })
    console.log('[translate] tray created')
  } catch (e) {
    console.warn('[translate] tray not available:', e.message)
  }
}

function resetPopupBounds() {
  const bounds = popupBoundsStore.reset()
  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.setSize(bounds.width, bounds.height)
  }
  return bounds
}

function createMainWindow() {
  const windowIcon = nativeImage.createFromPath(windowIconPath)
  mainWin = new BrowserWindow({
    width: 1100, height: 720, minWidth: 900, minHeight: 600,
    icon: windowIcon.isEmpty() ? windowIconPath : windowIcon,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    backgroundColor: '#fafafa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  if (!windowIcon.isEmpty() && process.platform !== 'darwin') {
    mainWin.setIcon(windowIcon)
  }
  if (isDev) mainWin.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWin.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWin.once('ready-to-show', () => {
    const cfg = loadConfig()
    const forceShow = process.argv.includes('--show')
    const forceHidden = process.argv.includes('--hidden')
    if (!forceShow && (forceHidden || cfg.launchToTray)) return
    mainWin.show()
    mainWin.focus()
  })
  mainWin.on('close', (e) => {
    if (app.isQuiting) return
    const cfg = loadConfig()
    if (cfg.closeAction === 'quit') {
      app.isQuiting = true
      app.quit()
      return
    }
    e.preventDefault()
    mainWin.hide()
  })
}

function ensurePopupWindow() {
  if (popupWin && !popupWin.isDestroyed()) return popupWin

  const stored = popupBoundsStore.get()
  popupWin = new BrowserWindow({
    width: stored.width || DEFAULT_POPUP_BOUNDS.width,
    height: stored.height || DEFAULT_POPUP_BOUNDS.height,
    x: cursorPositioningSupported ? stored.x : undefined,
    y: cursorPositioningSupported ? stored.y : undefined,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: MIN_POPUP_BOUNDS.width,
    minHeight: MIN_POPUP_BOUNDS.height,
    show: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false
    }
  })

  // 通过 ?window=popup 标记 standalone 模式
  if (isDev) {
    popupWin.loadURL(process.env.VITE_DEV_SERVER_URL + '/#/popup?window=popup')
  } else {
    popupWin.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/popup?window=popup' })
  }

  const win = popupWin
  const autoHideController = createPopupAutoHideController({
    isPinned: () => popupPinned,
    hide: () => {
      if (!win.isDestroyed()) win.hide()
    },
    setAlwaysOnTop: (value) => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(value)
    }
  })
  popupAutoHideController = autoHideController

  win.on('closed', () => {
    autoHideController.dispose()
    if (popupAutoHideController === autoHideController) {
      popupAutoHideController = null
    }
    if (popupWin === win) popupWin = null
  })

  // 失焦自动隐藏(未固定时)
  win.on('blur', () => autoHideController.onBlur())
  win.on('focus', () => autoHideController.onFocus())

  // 拖拽/缩放后保存位置与大小
  const saveDebounced = (() => {
    let t = null
    return () => {
      clearTimeout(t)
      t = setTimeout(() => {
        if (popupWin && !popupWin.isDestroyed()) {
          const bounds = popupWin.getBounds()
          popupBoundsStore.update(bounds, {
            preservePosition: cursorPositioningSupported
          })
        }
      }, 200)
    }
  })()
  win.on('move', () => {
    autoHideController.onMove()
    saveDebounced()
  })
  win.on('resize', () => {
    autoHideController.onMove()
    saveDebounced()
  })

  return popupWin
}

function showPopupNearCursor(text) {
  const win = ensurePopupWindow()
  const stored = popupBoundsStore.get()
  const current = win.getBounds()
  if (current.width !== stored.width || current.height !== stored.height) {
    win.setSize(stored.width, stored.height)
  }
  // 首次创建或尺寸迁移后若无保存位置,放到鼠标附近
  if (
    cursorPositioningSupported &&
    (stored.x === undefined || stored.y === undefined)
  ) {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const b = win.getBounds()
    let x = cursor.x + 12
    let y = cursor.y + 12
    if (x + b.width > display.bounds.x + display.bounds.width) {
      x = Math.max(display.bounds.x, cursor.x - b.width - 12)
    }
    if (y + b.height > display.bounds.y + display.bounds.height) {
      y = Math.max(display.bounds.y, cursor.y - b.height - 12)
    }
    win.setBounds({ x, y, width: b.width, height: b.height })
  }
  win.show()
  win.focus()

  // 等渲染进程就绪再发
  const send = () => {
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send('translate:trigger', { text, ts: Date.now() })
    }
  }
  if (popupWin.webContents.isLoading()) {
    popupWin.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

let selectionCaptureBusy = false
async function onShortcut() {
  if (selectionCaptureBusy) return
  selectionCaptureBusy = true
  try {
    const { text, source, reason } = await getSelection()
    const detail = reason ? `${source}/${reason}` : source
    console.log(`[translate] selection capture: ${detail}, ${text.length} chars`)
    showPopupNearCursor(text || '')
  } finally {
    selectionCaptureBusy = false
  }
}

const SOCK_PATH = path.join(process.env.HOME || '/tmp', '.translate-app.sock')

function startSocketServer() {
  // 清理旧 socket
  try { fs.unlinkSync(SOCK_PATH) } catch (_) {}

  const server = net.createServer((conn) => {
    conn.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg === 'trigger') onShortcut()
    })
    conn.on('error', () => {})
  })
  server.listen(SOCK_PATH, () => {
    fs.chmodSync(SOCK_PATH, 0o600)
    console.log('[translate] socket server listening on', SOCK_PATH)
  })
  server.on('error', console.error)
  return server
}

const SHORTCUT_ACTIONS = {
  translate: onShortcut,
  show: () => {
    if (!mainWin) return
    if (mainWin.isVisible()) mainWin.hide()
    else { mainWin.show(); mainWin.focus() }
  }
}

function getShortcutMap(cfg) {
  const saved = cfg.shortcuts || {}
  return {
    translate: saved.translate ?? cfg.shortcut ?? 'Alt+Q',
    show: saved.show ?? 'Alt+E'
  }
}

function registerShortcuts(shortcutMap) {
  try {
    const { globalShortcut } = require('electron')
    globalShortcut.unregisterAll()
    for (const [id, accel] of Object.entries(shortcutMap)) {
      if (!accel) continue
      const action = SHORTCUT_ACTIONS[id]
      if (!action) continue
      const ok = globalShortcut.register(accel, action)
      console.log(`[translate] globalShortcut ${id}: ${accel} → ${ok ? 'OK' : 'FAILED'}`)
    }
  } catch (_) {
    console.log('[translate] globalShortcut not available')
  }
}

function broadcastHistoryUpdate() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('history:updated')
  }
}

function addToHistory(src, dst, providerId, targetLang, extra = {}) {
  const p = getProvider(providerId)
  const item = history.add({
    engine: p ? p.name : providerId,
    color: p ? p.color : '#888',
    lang: targetLang,
    src, dst, ts: Date.now(),
    ...extra
  })
  broadcastHistoryUpdate()
  return item
}

app.whenReady().then(() => {
  createMainWindow()
  createTray()
  const server = process.platform === 'win32' ? null : startSocketServer()
  const _cfg = loadConfig()
  registerShortcuts(getShortcutMap(_cfg))
  app.on('will-quit', () => {
    try {
      server?.close()
      if (process.platform !== 'win32') fs.unlinkSync(SOCK_PATH)
    } catch (_) {}
  })

  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', (_evt, partial) => {
    const current = loadConfig()
    const next = {
      ...current,
      ...partial,
      providers: partial.providers
        ? { ...current.providers, ...partial.providers }
        : current.providers,
      shortcuts: partial.shortcuts
        ? { ...current.shortcuts, ...partial.shortcuts }
        : current.shortcuts,
      settingsOrder: partial.settingsOrder
        ? { ...(current.settingsOrder || {}), ...partial.settingsOrder }
        : current.settingsOrder
    }
    saveConfig(next)
    return next
  })
  ipcMain.handle('translate:do', async (_evt, { text, target, providerId }) => {
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    let id, p
    if (providerId) {
      p = providers[providerId]
      id = providerId
      if (!p || !p.enabled || !p.apiKey) {
        return { error: `所选引擎未配置或未启用` }
      }
    } else {
      const entry = Object.entries(providers).find(([, v]) => v && v.enabled && v.apiKey)
      if (!entry) return { error: '未配置启用的翻译接口,请到设置中填写 API Key' }
      ;[id, p] = entry
    }
    const targetLang = target || (cfg.target || '中文(简体)')
    try {
      const t0 = Date.now()
      const r = await translateWith(p, id, { text, target: targetLang })
      const historyItem = r.text ? addToHistory(text, r.text, id, targetLang) : null
      return { text: r.text, ms: Date.now() - t0, engine: id, historyId: historyItem?.id }
    } catch (e) {
      return { error: e.message || String(e) }
    }
  })
  ipcMain.on('translate:race:start', async (event, { text, target, requestId }) => {
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    const targetLang = target || (cfg.target || '中文(简体)')
    const enabled = Object.entries(providers).filter(([, v]) => v && v.enabled && v.apiKey)
    if (!enabled.length) {
      event.sender.send('translate:race:done', {
        requestId,
        error: '未配置启用的翻译接口,请到设置中填写 API Key'
      })
      return
    }
    const race = await runTranslationRace({
      requestId,
      engines: enabled.map(([id, provider]) => ({ id, provider })),
      execute: ({ id, provider }) =>
        translateWith(provider, id, { text, target: targetLang }),
      onFirstSuccess: (result, engine) =>
        addToHistory(text, result.text, engine.id, targetLang),
      onProgress: (result) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('translate:race:progress', result)
        }
      }
    })
    if (!event.sender.isDestroyed()) {
      event.sender.send('translate:race:done', race)
    }
  })
  ipcMain.handle('providers:list', () => getAllProviders())
  ipcMain.on('settings:open', () => {
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide()
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.show()
      mainWin.focus()
      mainWin.webContents.send('main:navigate', '/settings/general')
    }
  })
  ipcMain.on('main:open', () => {
    if (!mainWin || mainWin.isDestroyed()) return
    mainWin.show()
    mainWin.focus()
    mainWin.webContents.send('main:navigate', '/')
  })
  ipcMain.handle('clipboard:write', (_evt, text) => {
    clipboard.writeText(String(text || ''))
    return true
  })
  ipcMain.handle('autostart:get', () => autoStart.isEnabled(app))
  ipcMain.handle('autostart:set', (_evt, enabled) => {
    const actual = autoStart.setEnabled(app, enabled)
    const cfg = loadConfig()
    cfg.autoLaunch = actual
    saveConfig(cfg)
    return actual
  })
  ipcMain.on('popup:close', () => {
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide()
  })
  // pinned = true: 保持打开但允许其他应用覆盖
  // pinned = false: 临时置顶,失焦后自动隐藏
  ipcMain.on('popup:pin', (_e, on) => {
    popupPinned = !!on
    popupAutoHideController?.onPinChange(popupPinned)
  })
  ipcMain.on('popup:resize', (_e, { width, height }) => {
    if (popupWin && !popupWin.isDestroyed()) {
      const b = popupWin.getBounds()
      popupWin.setBounds({ x: b.x, y: b.y, width, height })
      popupBoundsStore.update(
        { width, height },
        { preservePosition: cursorPositioningSupported }
      )
    }
  })
  ipcMain.handle('shortcuts:load', () => getShortcutMap(loadConfig()))
  ipcMain.handle('shortcuts:save', (_evt, shortcuts) => {
    const cfg = loadConfig()
    cfg.shortcuts = getShortcutMap({ shortcuts })
    saveConfig(cfg)
    registerShortcuts(cfg.shortcuts)
  })
  ipcMain.handle('popup:bounds:reset', () => resetPopupBounds())
  ipcMain.handle('history:load', () => history.load())
  ipcMain.handle('history:favorite', (_evt, payload) => {
    let item = payload.historyId
      ? history.setFavorite(payload.historyId, true)
      : null
    if (!item) {
      item = addToHistory(
        payload.src,
        payload.dst,
        payload.providerId,
        payload.target,
        { favorite: true }
      )
    } else {
      broadcastHistoryUpdate()
    }
    return item
  })
  ipcMain.handle('history:favorite:set', (_evt, id, favorite) => {
    const item = history.setFavorite(id, favorite)
    broadcastHistoryUpdate()
    return item
  })
  ipcMain.handle('history:delete', (_evt, id) => history.remove(id))
  ipcMain.handle('history:clear', () => history.clearAll())
  ipcMain.on('popup:dismiss', () => {
    if (popupPinned) return
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
