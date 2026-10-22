const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const electron = require('electron')
const root = process.env.EASY_BENCH_REPO
const run = process.env.EASY_BENCH_RUN
const output = path.join(run, 'events.jsonl')
let trial = null
const stamp = (event, extra = {}) => fs.appendFileSync(output, JSON.stringify({ t: Date.now(), event, trial, ...extra }) + '\n')
function currentTrial() {
  try { trial = JSON.parse(fs.readFileSync(path.join(run, 'trial.json'), 'utf8')).id } catch (_) {}
}
function expectedSource() {
  const index = /^cold-[1-9]\d*-invoke-([1-9]\d*)$/.exec(trial || '')?.[1]
  return index ? 'Hello baseline world ' + Number(index) + '.' : null
}
const isolatedPaths = { home: run, appData: path.join(run, 'appData'), userData: path.join(run, 'userData'), sessionData: path.join(run, 'userData'), crashDumps: path.join(run, 'crashDumps'), logs: path.join(run, 'logs'), temp: path.join(run, 'temp') }
const expectedEnv = { HOME: run, USERPROFILE: run, APPDATA: isolatedPaths.appData, LOCALAPPDATA: path.join(run, 'localAppData'), TEMP: isolatedPaths.temp, TMP: isolatedPaths.temp }
if (process.platform !== 'win32' || electron.app.isReady() || Object.entries(expectedEnv).some(([name, value]) => process.env[name] !== value) || process.env.NODE_OPTIONS || process.env.ELECTRON_RUN_AS_NODE || process.env.VITE_DEV_SERVER_URL || Object.keys(process.env).some(name => /key|token|secret|password|credential|authorization/i.test(name))) {
  const error = new Error('Benchmark requires a fresh isolated Windows fixture profile before app readiness')
  error.code = 'EASY_BENCH_PROFILE_INVALID'
  throw error
}
const fixtureConfig = JSON.parse(fs.readFileSync(path.join(run, '.translate-app.config.json'), 'utf8'))
const fixtureProvider = fixtureConfig.providers?.openai
if (fixtureProvider?.enabled !== true || fixtureProvider.apiKey !== 'BENCH_FAKE_KEY' || fixtureProvider.endpoint !== 'https://benchmark.invalid' || fixtureProvider.model !== 'controlled' || fixtureProvider.prompt !== 'Translate {{src}} into {{target}}' || Object.entries(fixtureConfig.providers).some(([id, config]) => id !== 'openai' && (config.enabled || config.apiKey)) || fixtureConfig.launchToTray !== true || fixtureConfig.raceMode !== false || fixtureConfig.shortcuts?.translate !== 'Alt+Q' || fixtureConfig.shortcuts?.show !== 'Alt+E' || fs.existsSync(path.join(run, '.translate-app.history.json'))) {
  const error = new Error('Benchmark requires only its synthetic provider and a fresh history fixture')
  error.code = 'EASY_BENCH_PROFILE_INVALID'
  throw error
}
stamp('launcher', { pid: process.pid, electron: process.versions.electron, node: process.versions.node })
for (const [name, directory] of Object.entries(isolatedPaths)) {
  fs.mkdirSync(directory, { recursive: true })
  electron.app.setPath(name, directory)
}
const blocked = () => {
  stamp('harness-failure', { stage: 'network', reason: 'unapproved-transport' })
  const error = new Error('Benchmark isolation blocks unapproved network and process access')
  error.code = 'EASY_BENCH_NETWORK_BLOCKED'
  throw error
}
// This is an in-process Windows harness guard, not an OS firewall. The exact
// selection helper below is the only native child admitted by this launcher.
require('node:net').Socket.prototype.connect = blocked
require('node:tls').connect = blocked
require('node:http').request = blocked
require('node:http').get = blocked
require('node:https').get = blocked
require('node:http2').connect = blocked
require('node:dgram').Socket.prototype.send = blocked
globalThis.fetch = async () => blocked()
if (globalThis.WebSocket) globalThis.WebSocket = class { constructor() { blocked() } }
electron.net.request = blocked
electron.net.fetch = async () => blocked()
if (electron.shell) electron.shell.openExternal = async () => blocked()
const originalClipboard = { text: 'BENCH_CLIPBOARD', html: '<b>BENCH_CLIPBOARD</b>', rtf: '{\\rtf1 BENCH_CLIPBOARD}' }
electron.app.whenReady().then(() => {
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => {
    stamp('harness-failure', { stage: 'network', reason: 'unapproved-renderer-transport' })
    callback({ cancel: true })
  })
  stamp('app-ready'); electron.clipboard.write(originalClipboard)
})

const nativeExec = require('node:child_process').execFile
require('node:child_process').execFile = function(file, args, options, callback) {
  const expectedArgs = ['-NoProfile', '-NonInteractive', '-Sta', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"]
  if (file !== 'powershell.exe' || JSON.stringify(args) !== JSON.stringify(expectedArgs) || options?.timeout !== 2500 || options?.windowsHide !== true) return blocked()
  const started = Date.now()
  const child = nativeExec.call(this, file, args, options, (error, stdout, stderr) => {
    stamp('helper-end', { elapsed: Date.now() - started, error: !!error, pid: child.pid })
    callback(error, stdout, stderr)
  })
  stamp('helper-start', { pid: child.pid, file: path.basename(file) })
  return child
}
for (const name of ['exec', 'execSync', 'execFileSync', 'spawn', 'spawnSync', 'fork']) require('node:child_process')[name] = blocked

// Controlled in-process transport: real adapter is retained, external network is impossible.
require('node:https').request = (url, options, callback) => {
  if (String(url) !== 'https://benchmark.invalid/v1/chat/completions' || options?.method !== 'POST' || options?.headers?.Authorization !== 'Bearer BENCH_FAKE_KEY') return blocked()
  const request = new EventEmitter()
  let body = ''
  request.write = (data) => { body += data }
  request.end = () => {
    const parsed = JSON.parse(body)
    const source = parsed.messages?.find(m => m.role === 'user')?.content || ''
    if (source !== expectedSource() || parsed.model !== 'controlled') {
      stamp('harness-failure', { stage: 'transport', reason: 'unexpected-source-fixture' })
      request.emit('error', new Error('Benchmark transport rejected a source outside its synthetic fixture'))
      return
    }
    stamp('transport-start', { source })
    setTimeout(() => {
      const response = new PassThrough()
      response.statusCode = 200
      callback(response)
      response.end(JSON.stringify({ choices: [{ message: { content: 'BENCH_TRANSLATED: ' + source } }] }))
      stamp('transport-end')
    }, 50)
  }
  request.destroy = (error) => { if (error) request.emit('error', error) }
  return request
}
require('node:module').syncBuiltinESMExports()
stamp('isolation-ready', { profile: 'fixture-only', transport: 'exact-synthetic-https-50ms', nodeNetwork: 'blocked', electronNetwork: 'blocked-before-product-ready', nativeChildren: 'exact-windows-copy-helper-only', localDevTools: 'frozen-chromium-port-9333-no-attachment' })

const selection = require(path.join(root, 'electron/selection.cjs'))
const nativeGetSelection = selection.getSelection
selection.getSelection = async (...args) => {
  stamp('selection-start')
  let result = await nativeGetSelection(...args)
  if (result.text && result.text !== expectedSource()) {
    stamp('harness-failure', { stage: 'capture', reason: 'unexpected-selection-fixture' })
    result = { ...result, text: '', source: 'empty', reason: 'benchmark-fixture-rejected' }
  }
  stamp('selection-end', {
    source: result.source, reason: result.reason, text: result.text,
    clipboardRestored: electron.clipboard.readText() === originalClipboard.text,
    htmlRestored: electron.clipboard.readHTML().includes('BENCH_CLIPBOARD'),
    rtfRestored: electron.clipboard.readRTF().includes('BENCH_CLIPBOARD')
  })
  return result
}
const register = electron.globalShortcut.register.bind(electron.globalShortcut)
electron.globalShortcut.register = (shortcut, fn) => register(shortcut, (...args) => {
  currentTrial(); stamp('shortcut', { shortcut }); return fn(...args)
})
const handle = electron.ipcMain.handle.bind(electron.ipcMain)
electron.ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  if (channel === 'translate:do') stamp('translate-start')
  const result = await listener(...args)
  if (channel === 'translate:do') stamp('translate-end', { ok: !result?.error, historyId: result?.historyId, error: result?.error })
  if (channel === 'popup:ready') stamp('popup-app-ready', { id: args[0].sender.id })
  return result
})
let windowCount = 0
electron.app.on('browser-window-created', (_event, win) => {
  const kind = ++windowCount === 1 ? 'main' : 'popup'
  stamp('window-created', { kind, id: win.id })
  for (const event of ['show', 'hide', 'focus', 'blur', 'ready-to-show', 'closed']) {
    win.on(event, () => stamp('window-' + event, { kind, id: win.id }))
  }
  win.webContents.on('did-finish-load', () => {
    stamp('document-ready', { kind, id: win.id })
    if (kind !== 'popup') return
    win.webContents.executeJavaScript(`(() => {
      let prior = '';
      const check = () => {
        const node = document.querySelector('.dst-text');
        const value = node?.textContent || '';
        if (value && value !== prior) {
          prior = value;
          console.log('__EASY_BENCH_DOM__' + JSON.stringify({t:Date.now(), text:value, visible:document.visibilityState}));
        }
      };
      new MutationObserver(check).observe(document.body,{subtree:true,childList:true,characterData:true});
      check();
      console.log('__EASY_BENCH_OBSERVER__');
    })()`)
  })
  win.webContents.on('console-message', (_event, details, message) => {
    const msg = typeof details === 'object' ? details.message : message
    if (msg?.startsWith('__EASY_BENCH_DOM__')) stamp('dom-result', { kind, ...JSON.parse(msg.slice('__EASY_BENCH_DOM__'.length)) })
    if (msg === '__EASY_BENCH_OBSERVER__') stamp('observer-ready', { kind })
  })
})
const health = setInterval(() => {
  const windows = electron.BrowserWindow.getAllWindows()
  stamp('health', { windows: windows.length, visible: windows.filter(w => w.isVisible()).length, pids: electron.app.getAppMetrics().map(p => p.pid) })
  if (fs.existsSync(path.join(run, 'stop'))) { electron.app.isQuiting = true; electron.app.quit() }
}, 500)
electron.app.on('will-quit', () => { clearInterval(health); stamp('quit') })
require(process.env.EASY_BENCH_MAIN || path.resolve(root, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main))
