// Manual-only isolated Windows fixture. Never invoke from npm test or app startup.
// Usage: repo-local electron.exe this-file --profile <absolute NEW .runtime directory>
// The caller must set HOME, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP and TMP to it.
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

let electron
let profile
let profileReady = false
let deadline
let phase = 'preflight'
let lastState = {}

function blocked() {
  const error = new Error('Native validation transport and child processes are blocked')
  error.code = 'EASY_NATIVE_VALIDATION_BLOCKED'
  throw error
}

function writeState(value) {
  lastState = value
  const temporary = path.join(profile, 'state.tmp')
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8' })
  fs.renameSync(temporary, path.join(profile, 'state.json'))
}

async function run() {
  assert.equal(process.platform, 'win32', 'Windows-only fixture')
  const args = process.argv.slice(2)
  assert.equal(args.length, 2, 'Explicit --profile is required; other switches are forbidden')
  assert.equal(args[0], '--profile', 'Explicit --profile is required')
  assert.ok(path.isAbsolute(args[1]), 'Profile must be absolute')
  const root = fs.realpathSync(path.resolve(__dirname, '../..'))
  const runtime = path.join(root, '.runtime')
  profile = path.resolve(args[1])
  assert.equal(path.dirname(profile).toLowerCase(), runtime.toLowerCase(), 'Profile must be a direct .runtime child')
  assert.match(path.basename(profile), /^settings-popup-native-[a-zA-Z0-9-]+$/, 'Use a unique fixture profile name')
  assert.equal(fs.realpathSync(process.execPath).toLowerCase(), fs.realpathSync(path.join(root, 'node_modules/electron/dist/electron.exe')).toLowerCase(), 'Use only repository-local Electron')
  for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
    assert.ok(process.env[name] && path.isAbsolute(process.env[name]), 'All profile variables must be explicit absolute paths')
    assert.equal(path.resolve(process.env[name]).toLowerCase(), profile.toLowerCase(), 'Profile variables must agree')
  }
  for (const name of Object.keys(process.env)) {
    assert.ok(!/^(?:NODE_OPTIONS|NODE_PATH|VITE_DEV_SERVER_URL|ELECTRON_.+|LD_PRELOAD|DYLD_.+|PYTHONPATH)$/i.test(name), 'Startup hook environment is forbidden')
    assert.ok(!/key|token|secret|password|credential|authorization/i.test(name), 'Credential environment must be sanitized by the caller')
  }
  if (fs.existsSync(runtime)) assert.ok(!fs.lstatSync(runtime).isSymbolicLink(), 'Runtime cannot be a link')
  else fs.mkdirSync(runtime)
  if (fs.existsSync(profile)) {
    assert.ok(!fs.lstatSync(profile).isSymbolicLink(), 'Profile cannot be a link')
    assert.equal(fs.readdirSync(profile).length, 0, 'Profile must be new and empty')
  } else fs.mkdirSync(profile)
  assert.equal(fs.realpathSync(profile).toLowerCase(), profile.toLowerCase(), 'Profile cannot traverse links')
  profileReady = true

  // Install all Node boundaries before requiring Electron or any product module.
  const net = require('node:net')
  net.connect = net.createConnection = net.Socket.prototype.connect = net.Server.prototype.listen = blocked
  require('node:tls').connect = blocked
  require('node:dgram').createSocket = blocked
  require('node:http2').connect = blocked
  for (const name of ['node:http', 'node:https']) {
    const transport = require(name)
    transport.request = transport.get = blocked
  }
  globalThis.fetch = async () => blocked()
  globalThis.WebSocket = class { constructor() { blocked() } }
  const children = require('node:child_process')
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) children[name] = blocked
  require('node:module').syncBuiltinESMExports()
  const denied = { code: 'EASY_NATIVE_VALIDATION_BLOCKED' }
  assert.throws(() => net.connect(443, 'synthetic.invalid'), denied)
  assert.throws(() => require('node:https').request('https://synthetic.invalid'), denied)
  assert.throws(() => require('node:http2').connect('https://synthetic.invalid'), denied)
  assert.throws(() => new globalThis.WebSocket('wss://synthetic.invalid'), denied)
  assert.throws(() => children.spawn('synthetic-never-launched'), denied)
  await assert.rejects(globalThis.fetch('https://synthetic.invalid'), denied)

  electron = require('electron')
  const { app, session, nativeTheme, BrowserWindow, ipcMain, screen } = electron
  for (const name of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps']) {
    const isolated = path.join(profile, name)
    fs.mkdirSync(isolated)
    app.setPath(name, isolated)
    assert.equal(app.getPath(name), isolated)
  }
  app.setPath('temp', profile)
  app.setPath('home', profile)
  assert.equal(app.getPath('temp'), profile)
  assert.equal(require('node:os').homedir().toLowerCase(), profile.toLowerCase())
  electron.net.request = blocked
  electron.net.fetch = async () => blocked()
  electron.globalShortcut.register = () => true
  electron.globalShortcut.unregisterAll = () => {}
  electron.shell.openExternal = async () => blocked()
  // No clipboard operation is needed by this empty-popup test.
  for (const name of ['readText', 'readHTML', 'readRTF', 'readImage', 'readBuffer', 'write', 'writeText', 'clear']) {
    electron.clipboard[name] = blocked
  }
  assert.throws(() => electron.net.request('https://synthetic.invalid'), denied)
  await assert.rejects(electron.net.fetch('https://synthetic.invalid'), denied)

  const guardSession = ses => {
    ses.fetch = async () => blocked()
    const restrictRequest = (details, callback) => callback({ cancel: !/^(?:file|data):/i.test(details.url) })
    // This sole listener owns the fixture's Chromium transport before main loads.
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, restrictRequest)
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
    let cancelled
    restrictRequest({ url: 'https://synthetic.invalid' }, result => { cancelled = result.cancel })
    assert.equal(cancelled, true)
  }
  app.on('session-created', guardSession)
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-attach-webview', event => event.preventDefault())
    contents.on('will-navigate', (event, url) => { if (!/^file:/i.test(url)) event.preventDefault() })
  })

  // The profile contains only disabled synthetic providers, never inherited data.
  const providers = Object.fromEntries(['deepseek', 'openai', 'bing', 'google', 'deepl', 'youdao', 'tencent', 'caiyun', 'baidu'].map(id => [id, {
    enabled: false, apiKey: 'synthetic-disabled-key', endpoint: 'https://synthetic.invalid',
    ...(id === 'deepseek' ? { model: 'deepseek-v4-flash' } : {})
  }]))
  fs.writeFileSync(path.join(profile, '.translate-app.config.json'), JSON.stringify({ providers, launchToTray: true, autoLaunch: false, raceMode: false, closeAction: 'tray' }))
  fs.writeFileSync(path.join(profile, '.translate-app.history.json'), '[]')

  let main, popup, popupReady = false
  app.on('browser-window-created', (_event, win) => {
    if (!main) main = win
    else if (!popup) popup = win
  })
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => handle(channel, async (...parameters) => {
    const result = await listener(...parameters)
    if (channel === 'popup:ready') popupReady = true
    return result
  })

  const started = Date.now()
  deadline = setTimeout(() => {
    try { writeState({ pass: false, stage: phase, error: 'Native fixture deadline exceeded' }) }
    finally { app.exit(1) }
  }, 40000)
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function wait(check, message) {
    while (Date.now() - started < 38000) {
      if (await check()) return
      await pause(30)
    }
    throw new Error(message)
  }

  await app.whenReady()
  guardSession(session.defaultSession)
  await assert.rejects(session.defaultSession.fetch('https://synthetic.invalid'), denied)
  phase = 'product-loading'
  // Product code is imported only after isolation, disabled config, transport,
  // process and native-input boundaries have all been installed and checked.
  require(path.join(root, 'dist-electron/main.cjs'))
  await wait(() => main && popup && popupReady, 'Product popup did not become ready')
  main.hide()
  assert.equal(main.isVisible(), false)

  phase = 'native-theme'
  const verifiedThemeModes = []
  for (const [mode, index] of [['dark', 2], ['light', 1], ['system', 0]]) {
    await main.webContents.executeJavaScript(`document.querySelectorAll('.theme-switch button')[${index}].click()`)
    await wait(async () => nativeTheme.themeSource === mode && await main.webContents.executeJavaScript(`document.documentElement.dataset.theme === ${JSON.stringify(mode === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : mode)}`), 'Native theme and renderer did not agree')
    verifiedThemeModes.push(mode)
  }
  // The pin is a real renderer action; the native click messages below must also
  // close a pinned popup, while a footer caption double-click must not close it.
  await popup.webContents.executeJavaScript("document.querySelector('.popup-actions button[title=\"固定窗口\"]').click()")
  await wait(() => popup.webContents.executeJavaScript("document.querySelector('.popup-actions button[title=\"固定窗口\"]').classList.contains('active')"), 'Popup did not become pinned')
  popup.showInactive()
  assert.equal(popup.isVisible(), true)
  assert.equal(popup.isMaximizable(), false)
  const points = await popup.webContents.executeJavaScript(`(() => {
    const point = selector => { const rect = document.querySelector(selector).getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
    return { header: point('.zoom-feedback-slot'), footer: point('.popup-foot') };
  })()`)
  const content = popup.getContentBounds()
  const zoom = popup.webContents.getZoomFactor()
  const physical = point => screen.dipToScreenPoint({ x: Math.round(content.x + point.x * zoom), y: Math.round(content.y + point.y * zoom) })
  const hwndBytes = popup.getNativeWindowHandle()
  const hwnd = (hwndBytes.length >= 8 ? hwndBytes.readBigUInt64LE(0) : BigInt(hwndBytes.readUInt32LE(0))).toString()
  const state = { pass: null, stage: 'ready', hwnd, coordinates: { header: physical(points.header), footer: physical(points.footer) }, zoom, verifiedThemeModes, visible: true, maximized: false }
  phase = 'ready'
  writeState(state)

  async function command(expected) {
    await wait(() => {
      const commandPath = path.join(profile, 'command.json')
      if (!fs.existsSync(commandPath)) return false
      assert.ok(fs.statSync(commandPath).size <= 256, 'Command file is too large')
      let value
      try { value = JSON.parse(fs.readFileSync(commandPath, 'utf8')) } catch { return false }
      return value && value.stage === expected
    }, 'External native message command did not arrive')
    await pause(150)
  }
  await command('footer-sent')
  assert.equal(popup.isVisible(), true, 'Footer double-click must leave the popup visible')
  assert.equal(popup.isMaximized(), false, 'Footer double-click must not maximize')
  phase = 'footer-verified'
  writeState({ ...state, stage: phase, footerVerified: true })
  await command('header-sent')
  await wait(() => !popup.isVisible(), 'Header double-click did not close the popup')
  assert.equal(popup.isMaximized(), false, 'Header double-click must not maximize')
  assert.equal(main.isVisible(), false, 'Native validation must not show the settings window')
  phase = 'complete'
  writeState({ ...state, pass: true, stage: phase, footerVerified: true, headerVerified: true, visible: false, maximized: false })
}

void run().then(() => {
  clearTimeout(deadline)
  electron.app.exit(0)
}).catch(error => {
  clearTimeout(deadline)
  try {
    if (profileReady) writeState({ ...lastState, pass: false, stage: phase, error: error instanceof Error ? error.message.slice(0, 300) : 'Native fixture assertion failed' })
  } finally {
    if (electron) electron.app.exit(1)
    else process.exit(1)
  }
})
