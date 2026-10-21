const { app, BrowserWindow, Menu, ipcMain, shell, clipboard, screen, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const net = require('net')
const { getSelection } = require('./selection.cjs')
const { translateWith, inspectProvider, getProviderCapabilities, probeProvider } = require('./translate.cjs')
const { getProvider, getAll: getAllProviders } = require('./providers.cjs')
const { load: loadConfig, save: saveConfig, flush: flushConfig, subscribe: subscribeConfig } = require('./config.cjs')
const history = require('./history.cjs')
const autoStart = require('./autostart.cjs')
const { runTranslationRace } = require('./race.cjs')
const { createTranslationSessions } = require('../dist-electron/translation-session.cjs')
const { createDesktopRuntime } = require('../dist-electron/desktop-runtime.cjs')
const { parseTranslationRequest, parseRaceRequest, parseProviderConfigs, parseProviderProbe } = require('../dist-electron/shared/ipc-contract.cjs')
const { supportsCursorPositioning } = require('./popup-bounds.cjs')

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
let tray = null
const desktop = createDesktopRuntime({
  createWindow: options => new BrowserWindow(options),
  frontend: {
    htmlPath: path.join(__dirname, '../dist/index.html'),
    preloadPath: path.join(__dirname, '../dist-electron/preload.cjs'),
    devServerUrl: process.env.VITE_DEV_SERVER_URL
  },
  screen, loadConfig, saveConfig, onSaveError: reportConfigSaveError
})

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
      preload: path.join(__dirname, '../dist-electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  if (!windowIcon.isEmpty() && process.platform !== 'darwin') {
    mainWin.setIcon(windowIcon)
  }
  mainWin.webContents.once('did-finish-load', () => desktop.schedulePrewarm())
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

let selectionCaptureBusy = false
async function onShortcut() {
  if (selectionCaptureBusy) return
  selectionCaptureBusy = true
  desktop.beginSelectionCapture()
  translationSessions.cancel()
  try {
    const { text, source, reason } = await getSelection()
    const detail = reason ? `${source}/${reason}` : source
    console.log(`[translate] selection capture: ${detail}, ${text.length} chars`)
    desktop.showTranslation(text || '')
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

function broadcastConfig(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed?.()) win.webContents.send(channel, payload)
    } catch { /* A closing/crashed renderer cannot prevent other windows receiving the update. */ }
  }
}

function reportConfigSaveError(error) {
  broadcastConfig('config:save:error', error?.message || '配置保存失败，请重试')
}

async function saveSettings(partial) {
  try { return await saveConfig(partial) }
  catch (error) { reportConfigSaveError(error); throw error }
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

const translationSessions = createTranslationSessions({
  execute: ({ id, provider }, input) => translateWith(provider, id, input),
  saveHistory: ({ text, target, engine, result, isCurrent }) =>
    isCurrent() ? addToHistory(text, result.text, engine.id, target) : null
})

app.whenReady().then(() => {
  // Initialize once before any translation trigger; subsequent reads use the durable cache.
  loadConfig()
  createMainWindow()
  createTray()
  const server = process.platform === 'win32' ? null : startSocketServer()
  const _cfg = loadConfig()
  registerShortcuts(getShortcutMap(_cfg))
  const unsubscribeConfig = subscribeConfig(() => {
    broadcastConfig('config:updated')
  })
  let configFlushed = false
  let flushInProgress = false
  app.on('before-quit', (event) => {
    if (configFlushed) return
    event.preventDefault()
    if (flushInProgress) return
    flushInProgress = true
    // Flush the window-owned debounce before draining durable configuration writes.
    void desktop.flush().catch(() => {}).then(() => flushConfig()).catch(reportConfigSaveError).finally(() => {
      configFlushed = true
      app.isQuiting = true
      app.quit()
    })
  })
  app.on('will-quit', () => {
    unsubscribeConfig()
    translationSessions.dispose()
    desktop.dispose()
    try {
      server?.close()
      if (process.platform !== 'win32') fs.unlinkSync(SOCK_PATH)
    } catch (_) {}
  })

  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', async (_evt, partial) => {
    const next = await saveSettings(partial)
    if (partial.shortcuts || partial.shortcut !== undefined) registerShortcuts(getShortcutMap(next))
    return next
  })
  ipcMain.handle('translate:do', async (_evt, payload) => {
    const request = parseTranslationRequest(payload)
    if (!request) return { error: '无效的翻译请求' }
    const { text, target, providerId, requestId } = request
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    const selected = providerId
      ? [providerId, providers[providerId]]
      : Object.entries(providers).find(([id, config]) => config && inspectProvider(id, config).available)
    // An explicit unavailable engine still enters the session so it supersedes old work;
    // the shared execution capability returns its precise reason before any network call.
    const engine = selected?.[1]
      ? { id: selected[0], provider: selected[1] }
      : undefined
    const targetLang = target || (cfg.target || '中文(简体)')
    const session = translationSessions.start({ text, target: targetLang, engine, requestId })
    const completed = await session.done
    return {
      ...completed.result, sessionId: session.sessionId, requestId,
      ...(completed.status === 'superseded' ? { stale: true } : {})
    }
  })
  ipcMain.on('translate:cancel', () => translationSessions.cancel())
  ipcMain.on('translate:race:start', async (event, payload) => {
    const request = parseRaceRequest(payload)
    if (!request) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('translate:race:done', {
          requestId: typeof payload?.requestId === 'string' ? payload.requestId : undefined,
          error: '无效的翻译请求'
        })
      }
      return
    }
    const { text, target, requestId } = request
    // The legacy race remains until #4, but it already supersedes pending singles.
    translationSessions.cancel()
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    const targetLang = target || (cfg.target || '中文(简体)')
    const enabled = Object.entries(providers).filter(([id, config]) => config && inspectProvider(id, config).available)
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
  ipcMain.handle('providers:capabilities', (_event, input) => {
    const providers = input === undefined ? loadConfig().providers : parseProviderConfigs(input)
    if (!providers) throw new Error('无效的引擎配置')
    return getProviderCapabilities(providers)
  })
  ipcMain.handle('providers:probe', (_event, input) => {
    const request = parseProviderProbe(input)
    if (!request) throw new Error('无效的引擎探测请求')
    return probeProvider(request.providerId, request.config || loadConfig().providers[request.providerId] || {})
  })
  ipcMain.on('settings:open', () => {
    desktop.hide()
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
  ipcMain.handle('autostart:set', async (_evt, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('无效的开机启动设置')
    const actual = autoStart.setEnabled(app, enabled)
    await saveSettings({ autoLaunch: actual })
    return actual
  })
  ipcMain.handle('popup:ready', (event) => {
    const state = desktop.markReady(event.sender)
    if (!state) throw new Error('Only the current popup can declare application readiness')
    return state
  })
  ipcMain.on('popup:unready', event => desktop.markNotReady(event.sender))
  ipcMain.on('popup:close', () => desktop.hide())
  ipcMain.on('popup:pin', (_event, pinned) => desktop.setPinned(pinned))
  ipcMain.on('popup:resize', (_event, bounds) => desktop.resize(bounds?.width, bounds?.height))
  ipcMain.handle('shortcuts:load', () => getShortcutMap(loadConfig()))
  ipcMain.handle('shortcuts:save', async (_evt, shortcuts) => {
    const cfg = await saveSettings({ shortcuts })
    registerShortcuts(cfg.shortcuts)
  })
  ipcMain.handle('popup:bounds:reset', () => desktop.resetBounds())
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
  ipcMain.on('popup:dismiss', () => desktop.dismiss())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
