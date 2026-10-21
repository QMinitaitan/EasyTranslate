import { app, BrowserWindow, Menu, ipcMain, clipboard, screen, Tray, nativeImage, globalShortcut } from 'electron'
import type { WebContents } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as net from 'node:net'
import { randomUUID } from 'node:crypto'
import { getSelection } from '../electron/selection.cjs'
import { translateWith, inspectProvider, getProviderCapabilities, probeProvider } from './provider-service.cjs'
import { getProvider, getAll as getAllProviders } from './providers.cjs'
import { load as loadConfig, save as saveConfig, flush as flushConfig, subscribe as subscribeConfig } from './config-store.cjs'
import * as history from './history-store.cjs'
import * as autoStart from '../electron/autostart.cjs'
import { createTranslationSessions, type SessionRequest } from './translation-session.cjs'
import { createDesktopRuntime } from './desktop-runtime.cjs'
import { parseTranslationRequest, parseRaceRequest, parseProviderConfigs, parseProviderProbe } from './shared/ipc-contract.cjs'
import type { AppConfig, ConfigUpdate, EventChannels, Shortcuts } from './shared/ipc-contract.cjs'
import { supportsCursorPositioning } from '../electron/popup-bounds.cjs'

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

let mainWin: BrowserWindow | null = null
let tray: Tray | null = null
let quitPhase: 'running' | 'draining' | 'ready' = 'running'
const desktop = createDesktopRuntime({
  createWindow: options => new BrowserWindow(options),
  frontend: {
    htmlPath: path.join(__dirname, '../dist/index.html'),
    preloadPath: path.join(__dirname, 'preload.cjs'),
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
      { label: '打开设置', click: () => { mainWin?.show(); mainWin?.focus() } },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
    tray.setToolTip('Translate · 划词翻译')
    tray.setContextMenu(ctxMenu)
    tray.on('click', () => { mainWin?.show(); mainWin?.focus() })
    console.log('[translate] tray created')
  } catch (e) {
    console.warn('[translate] tray not available:', e instanceof Error ? e.message : 'unknown error')
  }
}

function createMainWindow() {
  const cfg = loadConfig()
  const forceShow = process.argv.includes('--show')
  const forceHidden = process.argv.includes('--hidden')
  const initiallyHidden = !forceShow && (forceHidden || cfg.launchToTray)
  const windowIcon = nativeImage.createFromPath(windowIconPath)
  mainWin = new BrowserWindow({
    width: 1100, height: 720, minWidth: 900, minHeight: 600,
    icon: windowIcon.isEmpty() ? windowIconPath : windowIcon,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    backgroundColor: '#fafafa',
    show: false,
    paintWhenInitiallyHidden: !initiallyHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  if (!windowIcon.isEmpty() && process.platform !== 'darwin') {
    mainWin.setIcon(windowIcon)
  }
  mainWin.webContents.once('did-finish-load', () => { if (quitPhase === 'running') desktop.schedulePrewarm() })
  if (isDev) mainWin.loadURL(process.env.VITE_DEV_SERVER_URL!)
  else mainWin.loadFile(path.join(__dirname, '../dist/index.html'))
  if (!initiallyHidden) mainWin.once('ready-to-show', () => {
    mainWin?.show()
    mainWin?.focus()
  })
  mainWin.on('close', (e) => {
    if (quitPhase === 'ready') return
    if (quitPhase === 'draining') { e.preventDefault(); return }
    const cfg = loadConfig()
    if (cfg.closeAction === 'quit') {
      e.preventDefault()
      app.quit()
      return
    }
    e.preventDefault()
    mainWin?.hide()
  })
}

let selectionCaptureBusy = false
async function onShortcut() {
  if (selectionCaptureBusy || quitPhase !== 'running') return
  selectionCaptureBusy = true
  desktop.beginSelectionCapture()
  translationSessions.cancel()
  try {
    const { text, source, reason } = await getSelection()
    const detail = reason ? `${source}/${reason}` : source
    console.log(`[translate] selection capture: ${detail}, ${text.length} chars`)
    if (quitPhase === 'running') desktop.showTranslation(text || '')
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
    if (!mainWin || quitPhase !== 'running') return
    if (mainWin.isVisible()) mainWin.hide()
    else { mainWin.show(); mainWin.focus() }
  }
}

function getShortcutMap(cfg: AppConfig): Shortcuts {
  const saved = cfg.shortcuts || {}
  return {
    translate: saved.translate ?? cfg.shortcut ?? 'Alt+Q',
    show: saved.show ?? 'Alt+E'
  }
}

function registerShortcuts(shortcutMap: Shortcuts) {
  try {
    globalShortcut.unregisterAll()
    for (const [id, accel] of Object.entries(shortcutMap)) {
      if (!accel) continue
      const action = SHORTCUT_ACTIONS[id as keyof Shortcuts]
      if (!action) continue
      const ok = globalShortcut.register(accel, action)
      console.log(`[translate] globalShortcut ${id}: ${accel} → ${ok ? 'OK' : 'FAILED'}`)
    }
  } catch (_) {
    console.log('[translate] globalShortcut not available')
  }
}

function broadcastConfig<C extends keyof EventChannels>(channel: C, payload?: EventChannels[C]) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed?.()) win.webContents.send(channel, payload)
    } catch { /* A closing/crashed renderer cannot prevent other windows receiving the update. */ }
  }
}

function reportConfigSaveError(error: unknown) {
  broadcastConfig('config:save:error', error instanceof Error ? error.message : '配置保存失败，请重试')
}

async function saveSettings(partial: unknown) {
  try { return await saveConfig(partial) }
  catch (error) { reportConfigSaveError(error); throw error }
}

function addToHistory(src: string, dst: string, providerId: string, targetLang: string, options: { isCurrent(): boolean }) {
  const p = getProvider(providerId)
  return history.add({
    engine: p ? p.name : providerId,
    color: p ? p.color : '#888',
    lang: targetLang,
    src, dst, ts: Date.now()
  }, options)
}

const translationSessions = createTranslationSessions({
  execute: ({ id, provider }, input) => translateWith(provider, id, input),
  saveHistory: ({ text, target, engine, result, isCurrent }) =>
    addToHistory(text, result.text!, engine.id, target, { isCurrent })
})

// Keep progress owned by the requesting renderer until completion or replacement.
async function runSessionForSender(sender: WebContents, request: SessionRequest, channel: 'translate:progress' | 'translate:race:progress') {
  let sessionId: string
  const offProgress = translationSessions.subscribe((snapshot, progress) => {
    if (snapshot.sessionId !== sessionId || !progress || sender.isDestroyed()) return
    sender.send(channel, progress)
  })
  const session = translationSessions.start(request)
  sessionId = session.sessionId
  const onDestroyed = () => {
    if (translationSessions.current()?.sessionId === sessionId) translationSessions.cancel()
  }
  sender.once?.('destroyed', onDestroyed)
  try { return { sessionId, completed: await session.done } }
  finally {
    offProgress()
    sender.removeListener?.('destroyed', onDestroyed)
  }
}

const quitParticipants = new Map<WebContents, () => void>()
const quitWaiters = new Map<WebContents, { token: string; finish(saved: boolean): void }>()
const quitSaveError = '退出前未能保存待处理设置，请重试'
function setQuitParticipant(sender: WebContents, registered: boolean) {
  if (!registered) {
    quitParticipants.get(sender)?.()
    quitParticipants.delete(sender)
    quitWaiters.get(sender)?.finish(false)
    return
  }
  if (quitParticipants.has(sender) || sender.isDestroyed() || !BrowserWindow.getAllWindows().some(win => !win.isDestroyed() && win.webContents === sender)) return
  const destroyed = () => setQuitParticipant(sender, false)
  sender.once('destroyed', destroyed)
  quitParticipants.set(sender, () => sender.removeListener('destroyed', destroyed))
}
async function drainRendererSettings() {
  const results = await Promise.allSettled([...quitParticipants.keys()].map(sender => new Promise<void>((resolve, reject) => {
    const token = randomUUID()
    const timer = setTimeout(() => finish(false), 3000)
    const finish = (saved: boolean) => {
      clearTimeout(timer)
      quitWaiters.delete(sender)
      if (saved) resolve()
      else reject(new Error(quitSaveError))
    }
    quitWaiters.set(sender, { token, finish })
    try { sender.send('app:before-quit', token) }
    catch { finish(false) }
  })))
  if (results.some(result => result.status === 'rejected')) throw new Error(quitSaveError)
}
function requireRunning() {
  if (quitPhase !== 'running') throw new Error('应用正在退出，请稍后重试')
}

app.whenReady().then(() => {
  // Initialize once before any translation trigger; subsequent reads use the durable cache.
  loadConfig()
  try { history.load() } catch { /* Home displays the read failure; mutations protect the existing file. */ }
  createMainWindow()
  createTray()
  const server = process.platform === 'win32' ? null : startSocketServer()
  const _cfg = loadConfig()
  registerShortcuts(getShortcutMap(_cfg))
  const unsubscribeConfig = subscribeConfig(() => {
    broadcastConfig('config:updated')
  })
  const unsubscribeHistory = history.subscribe(() => broadcastConfig('history:updated'))
  const unsubscribeHistoryErrors = history.subscribeErrors(message => broadcastConfig('history:save:error', message))
  app.on('before-quit', (event) => {
    if (quitPhase === 'ready') return
    event.preventDefault()
    if (quitPhase === 'draining') return
    quitPhase = 'draining'
    globalShortcut.unregisterAll()
    desktop.beginSelectionCapture()
    translationSessions.cancel()
    // The renderer owns debounce timers; drain them before desktop and storage queues.
    void drainRendererSettings().then(() => desktop.flush()).then(() => Promise.all([history.flush(), flushConfig()])).then(() => {
      quitPhase = 'ready'
      app.quit()
    }).catch(error => {
      quitPhase = 'running'
      registerShortcuts(getShortcutMap(loadConfig()))
      reportConfigSaveError(error)
    })
  })
  app.on('will-quit', () => {
    unsubscribeConfig()
    unsubscribeHistory()
    unsubscribeHistoryErrors()
    translationSessions.dispose()
    desktop.dispose()
    for (const off of quitParticipants.values()) off()
    quitParticipants.clear()
    for (const waiter of quitWaiters.values()) waiter.finish(false)
    try {
      server?.close()
      if (process.platform !== 'win32') fs.unlinkSync(SOCK_PATH)
    } catch (_) {}
  })

  ipcMain.on('app:flush:register', (event, registered: unknown) => {
    if (typeof registered === 'boolean') setQuitParticipant(event.sender, registered)
  })
  ipcMain.handle('app:flush:done', (event, token: unknown, saved: unknown) => {
    const waiter = quitWaiters.get(event.sender)
    if (typeof token !== 'string' || typeof saved !== 'boolean' || !waiter || waiter.token !== token) throw new Error('无效的退出保存确认')
    waiter.finish(saved)
  })

  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', async (_evt, partial: unknown) => {
    const previous = getShortcutMap(loadConfig())
    const next = await saveSettings(partial)
    const shortcuts = getShortcutMap(next)
    if (quitPhase === 'running' && (previous.translate !== shortcuts.translate || previous.show !== shortcuts.show)) registerShortcuts(shortcuts)
    return next
  })
  ipcMain.handle('translate:do', async (event, payload: unknown) => {
    requireRunning()
    const request = parseTranslationRequest(payload)
    if (!request) return { error: '无效的翻译请求' }
    const { text, target, providerId, requestId } = request
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    const selected = providerId
      ? [providerId, providers[providerId]] as const
      : Object.entries(providers).find(([id, config]) => config && inspectProvider(id, config).available)
    // An explicit unavailable engine still enters the session so it supersedes old work;
    // the shared execution capability returns its precise reason before any network call.
    const engine = selected?.[1]
      ? { id: selected[0], provider: selected[1] }
      : undefined
    const targetLang = target || (cfg.target || '中文(简体)')
    const { sessionId, completed } = await runSessionForSender(event.sender,
      { text, target: targetLang, engine, requestId }, 'translate:progress')
    return {
      ...completed.result, sessionId, requestId,
      ...(completed.status === 'superseded' ? { stale: true } : {})
    }
  })
  ipcMain.on('translate:cancel', () => translationSessions.cancel())
  ipcMain.on('translate:race:start', async (event, payload: unknown) => {
    const request = parseRaceRequest(payload)
    if (!request || quitPhase !== 'running') {
      if (!event.sender.isDestroyed()) {
        event.sender.send('translate:race:done', {
          requestId: request?.requestId ?? (payload && typeof payload === 'object' && 'requestId' in payload && typeof payload.requestId === 'string' ? payload.requestId : undefined),
          error: quitPhase === 'running' ? '无效的翻译请求' : '应用正在退出，请稍后重试'
        })
      }
      return
    }
    const { text, target, requestId } = request
    const cfg = loadConfig()
    const providers = cfg.providers || {}
    const targetLang = target || (cfg.target || '中文(简体)')
    const enabled = Object.entries(providers).filter(([id, config]) => config && inspectProvider(id, config).available)
    const { sessionId, completed } = await runSessionForSender(event.sender, {
      text, target: targetLang, mode: 'race', requestId,
      engines: enabled.map(([id, provider]) => ({ id, provider }))
    }, 'translate:race:progress')
    if (completed.status === 'superseded' || translationSessions.current()?.sessionId !== sessionId || event.sender.isDestroyed()) return
    event.sender.send('translate:race:done', {
      requestId, sessionId, results: completed.results,
      best: completed.results.find(result => !result.error && result.text) || null,
      ...(completed.status === 'error' ? { error: completed.result?.error } : {})
    })
  })
  ipcMain.handle('providers:list', () => getAllProviders())
  ipcMain.handle('providers:capabilities', (_event, input: unknown) => {
    const providers = input === undefined ? loadConfig().providers : parseProviderConfigs(input)
    if (!providers) throw new Error('无效的引擎配置')
    return getProviderCapabilities(providers)
  })
  ipcMain.handle('providers:probe', (_event, input: unknown) => {
    requireRunning()
    const request = parseProviderProbe(input)
    if (!request) throw new Error('无效的引擎探测请求')
    return probeProvider(request.providerId, request.config || loadConfig().providers[request.providerId] || {})
  })
  ipcMain.on('settings:open', () => {
    if (quitPhase !== 'running') return
    desktop.hide()
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.show()
      mainWin.focus()
      mainWin.webContents.send('main:navigate', '/settings/general')
    }
  })
  ipcMain.on('main:open', () => {
    if (quitPhase !== 'running') return
    if (!mainWin || mainWin.isDestroyed()) return
    mainWin.show()
    mainWin.focus()
    mainWin.webContents.send('main:navigate', '/')
  })
  ipcMain.handle('clipboard:write', (_evt, text: unknown) => {
    if (typeof text !== 'string') throw new Error('无效的复制文本')
    clipboard.writeText(text)
    return true
  })
  ipcMain.handle('autostart:get', () => autoStart.isEnabled(app))
  ipcMain.handle('autostart:set', async (_evt, enabled: unknown) => {
    requireRunning()
    if (typeof enabled !== 'boolean') throw new Error('无效的开机启动设置')
    const actual = autoStart.setEnabled(app, enabled)
    await saveSettings({ autoLaunch: actual })
    return actual
  })
  ipcMain.handle('popup:ready', (event) => {
    requireRunning()
    const state = desktop.markReady(event.sender)
    if (!state) throw new Error('Only the current popup can declare application readiness')
    return state
  })
  ipcMain.on('popup:unready', event => desktop.markNotReady(event.sender))
  ipcMain.on('popup:close', () => desktop.hide())
  ipcMain.on('popup:pin', (_event, pinned: unknown) => {
    if (quitPhase === 'running' && typeof pinned === 'boolean') desktop.setPinned(pinned)
  })
  ipcMain.handle('shortcuts:load', () => getShortcutMap(loadConfig()))
  ipcMain.handle('shortcuts:save', async (_evt, shortcuts: unknown) => {
    const cfg = await saveSettings({ shortcuts })
    if (quitPhase === 'running') registerShortcuts(cfg.shortcuts)
  })
  ipcMain.handle('popup:bounds:reset', () => desktop.resetBounds())
  ipcMain.handle('history:load', () => history.load())
  ipcMain.handle('history:favorite:set', async (_evt, id: unknown, favorite: unknown) => {
    requireRunning()
    if (!history.isHistoryId(id) || typeof favorite !== 'boolean') throw new Error('无效的收藏更新')
    return history.setFavorite(id, favorite)
  })
  ipcMain.handle('history:delete', (_evt, id: unknown) => {
    requireRunning()
    if (!history.isHistoryId(id)) throw new Error('无效的历史记录标识')
    return history.remove(id)
  })
  ipcMain.handle('history:clear', () => { requireRunning(); return history.clearAll() })
  ipcMain.on('popup:dismiss', () => desktop.dismiss())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
