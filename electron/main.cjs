const { app, BrowserWindow, Menu, ipcMain, shell, clipboard, screen, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const net = require('net')
const { getSelection } = require('./selection.cjs')
const { translateWith } = require('./translate.cjs')
const { getProvider, getAll: getAllProviders } = require('./providers.cjs')
const { load: loadConfig, save: saveConfig } = require('./config.cjs')
const history = require('./history.cjs')

const isDev = !!process.env.VITE_DEV_SERVER_URL

// Force X11 on Wayland so globalShortcut works
if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
}

Menu.setApplicationMenu(null)

let mainWin = null
let popupWin = null
let popupPinned = false
let tray = null
const POPUP_BOUNDS_KEY = 'popupBounds'

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon-16.png')
  try {
    const img = nativeImage.createFromPath(iconPath)
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

function getStoredBounds() {
  const cfg = loadConfig()
  return cfg[POPUP_BOUNDS_KEY] || { width: 420, height: 320 }
}
function storeBounds(bounds) {
  const cfg = loadConfig()
  cfg[POPUP_BOUNDS_KEY] = { ...cfg[POPUP_BOUNDS_KEY], ...bounds }
  saveConfig(cfg)
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1100, height: 720, minWidth: 900, minHeight: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    backgroundColor: '#fafafa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  if (isDev) mainWin.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWin.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWin.once('ready-to-show', () => {
    mainWin.show()
    mainWin.focus()
  })
  mainWin.on('close', (e) => {
    if (app.isQuiting) return
    e.preventDefault()
    mainWin.hide()
  })
}

function ensurePopupWindow() {
  if (popupWin && !popupWin.isDestroyed()) return popupWin

  const stored = getStoredBounds()
  popupWin = new BrowserWindow({
    width: stored.width || 420,
    height: stored.height || 320,
    x: stored.x,
    y: stored.y,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 280,
    minHeight: 200,
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

  popupWin.on('closed', () => { popupWin = null })

  // 失焦自动隐藏(未固定时)
  popupWin.on('blur', () => {
    if (popupPinned) return
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide()
  })

  // 拖拽/缩放后保存位置与大小
  const saveDebounced = (() => {
    let t = null
    return () => {
      clearTimeout(t)
      t = setTimeout(() => {
        if (popupWin && !popupWin.isDestroyed()) {
          storeBounds(popupWin.getBounds())
        }
      }, 200)
    }
  })()
  popupWin.on('move', saveDebounced)
  popupWin.on('resize', saveDebounced)

  return popupWin
}

function showPopupNearCursor(text) {
  const win = ensurePopupWindow()
  // 首次创建时若无保存位置,放到鼠标附近
  const stored = getStoredBounds()
  if (stored.x === undefined || stored.y === undefined) {
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

async function onShortcut() {
  const { text } = await getSelection()
  showPopupNearCursor(text || '')
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
  input: () => { if (mainWin) { mainWin.show(); mainWin.focus() } },
  show: () => {
    if (!mainWin) return
    if (mainWin.isVisible()) mainWin.hide()
    else { mainWin.show(); mainWin.focus() }
  },
  ocr: () => { console.log('[translate] OCR not implemented yet') }
}

function getShortcutMap(cfg) {
  return cfg.shortcuts || {
    translate: cfg.shortcut || 'Alt+Q',
    input: 'Alt+D',
    ocr: '',
    show: 'Alt+E'
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

function addToHistory(src, dst, providerId, targetLang) {
  const p = getProvider(providerId)
  history.add({
    engine: p ? p.name : providerId,
    color: p ? p.color : '#888',
    lang: targetLang,
    src, dst, ts: Date.now()
  })
  broadcastHistoryUpdate()
}

app.whenReady().then(() => {
  createMainWindow()
  createTray()
  const server = startSocketServer()
  const _cfg = loadConfig()
  registerShortcuts(getShortcutMap(_cfg))
  app.on('will-quit', () => { try { server.close(); fs.unlinkSync(SOCK_PATH) } catch (_) {} })

  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', (_evt, cfg) => { saveConfig(cfg) })
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
      if (r.text) addToHistory(text, r.text, id, targetLang)
      return { text: r.text, ms: Date.now() - t0, engine: id }
    } catch (e) {
      return { error: e.message || String(e) }
    }
  })
  ipcMain.on('translate:race:start', async (event, { text, target }) => {
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    const targetLang = target || (cfg.target || '中文(简体)')
    const enabled = Object.entries(providers).filter(([, v]) => v && v.enabled && v.apiKey)
    if (!enabled.length) {
      event.sender.send('translate:race:done', { error: '未配置启用的翻译接口,请到设置中填写 API Key' })
      return
    }
    let saved = false
    const handler = async ([id, p]) => {
      const t0 = Date.now()
      try {
        const r = await translateWith(p, id, { text, target: targetLang })
        const result = { text: r.text, ms: Date.now() - t0, engine: id, error: null }
        if (!saved && r.text) { saved = true; addToHistory(text, r.text, id, targetLang) }
        event.sender.send('translate:race:progress', result)
        return result
      } catch (e) {
        const result = { text: null, ms: Date.now() - t0, engine: id, error: e.message || String(e) }
        event.sender.send('translate:race:progress', result)
        return result
      }
    }
    const all = await Promise.all(enabled.map(handler))
    const ok = all.filter(r => !r.error)
    all.sort((a, b) => a.ms - b.ms)
    event.sender.send('translate:race:done', { results: all, best: ok[0] || null })
  })
  ipcMain.handle('providers:list', () => getAllProviders())
  ipcMain.on('settings:open', () => {
    if (mainWin) { mainWin.show(); mainWin.focus() }
  })
  ipcMain.on('popup:close', () => {
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide()
  })
  // pinned = true 表示固定悬浮窗:失焦不消失,alwaysOnTop 仍保持
  // pinned = false 表示自由模式:失焦自动消失
  ipcMain.on('popup:pin', (_e, on) => {
    popupPinned = !!on
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.setAlwaysOnTop(true)
    }
  })
  ipcMain.on('popup:resize', (_e, { width, height }) => {
    if (popupWin && !popupWin.isDestroyed()) {
      const b = popupWin.getBounds()
      popupWin.setBounds({ x: b.x, y: b.y, width, height })
      storeBounds({ width, height })
    }
  })
  // 主动让悬浮窗消失(自由模式触发,例如点击空白)
  ipcMain.on('popup:move', (_e, { dx, dy }) => {
    if (popupWin && !popupWin.isDestroyed()) {
      const [x, y] = popupWin.getPosition()
      popupWin.setPosition(x + dx, y + dy)
    }
  })
  ipcMain.handle('shortcuts:load', () => getShortcutMap(loadConfig()))
  ipcMain.handle('shortcuts:save', (_evt, shortcuts) => {
    const cfg = loadConfig()
    cfg.shortcuts = shortcuts
    saveConfig(cfg)
    registerShortcuts(shortcuts)
  })
  ipcMain.handle('history:load', () => history.load())
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
