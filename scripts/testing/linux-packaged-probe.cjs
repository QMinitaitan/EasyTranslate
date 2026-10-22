// Evaluated on the real packaged main-entry call frame by linux-packaged-validation.cjs.
// All instrumentation lives in this test program; the packaged product is unmodified.
(() => {
  const fs = require('node:fs')
  const path = require('node:path')
  const assert = require('node:assert/strict')
  const { EventEmitter } = require('node:events')
  const { PassThrough } = require('node:stream')
  const { app, BrowserWindow, globalShortcut, net: electronNet } = require('electron')
  const run = process.env.EASY_LINUX_RUN
  const stage = process.env.EASY_LINUX_STAGE
  if (!run || !['edit', 'verify'].includes(stage) || app.isReady()) throw new Error('An isolated pre-ready Linux probe is required')
  assert.equal(app.isPackaged, true, 'Only the real packaged product is accepted')
  const importedProductModules = Object.keys(require.cache).filter(file => /[/\\]dist-electron[/\\]/.test(file) && !/[/\\]main\.cjs$/.test(file))
  assert.deepEqual(importedProductModules, [], 'Install the guard before any product module import')
  const home = process.env.HOME
  assert.match(home, /^\/tmp\/easytranslate-pr12-[A-Za-z0-9]+$/)
  assert.equal(require('node:os').homedir(), home)
  assert.equal(process.env.USERPROFILE, home)
  const fixture = JSON.parse(fs.readFileSync(path.join(home, '.translate-app.config.json'), 'utf8'))
  assert.ok(fixture.providers.deepseek.apiKey === 'synthetic-linux-fixture-key', 'Synthetic credential required')
  assert.equal(fixture.providers.deepseek.model, 'deepseek-v4-flash')
  for (const [id, provider] of Object.entries(fixture.providers)) {
    assert.equal(provider.endpoint, 'https://linux-fixture.invalid')
    assert.equal(provider.enabled, id === 'deepseek')
    if (id !== 'deepseek') assert.ok(provider.apiKey === '', 'Disabled fixture provider has no credential')
  }
  const write = (name, value) => fs.writeFileSync(path.join(run, `${stage}-${name}.json`), JSON.stringify(value, null, 2))
  for (const name of ['appData', 'userData', 'sessionData', 'crashDumps']) app.setPath(name, path.join(run, name))
  app.setAppLogsPath(path.join(run, 'logs'))
  app.disableHardwareAcceleration()
  for (const name of ['appData', 'userData', 'sessionData', 'crashDumps', 'logs']) assert.equal(app.getPath(name), path.join(run, name))
  for (const name of ['APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'TMPDIR', 'TMP', 'TEMP']) {
    assert.ok(process.env[name]?.startsWith(run + path.sep), `Isolate ${name}`)
  }
  const requests = []
  const errors = []
  const rendererErrors = []
  let checkpoint = 'before ready'
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('preload-error', (_event, file, error) => errors.push({ file, error: error.message }))
    window.webContents.on('console-message', (_event, details) => {
      if (details.level === 'error') rendererErrors.push(details.message)
    })
  })
  app.on('will-quit', () => write('will-quit', { naturalLifecycle: true, preloadErrors: errors, requests }))
  // Native Electron is outside npm-test's Node guard. Deny all other Node
  // network routes here and allow only the product's exact owned Unix socket.
  const blocked = () => { throw new Error('Linux validation blocks external network access') }
  const net = require('node:net')
  const connect = net.Socket.prototype.connect
  const productSocket = path.join(home, '.translate-app.sock')
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0]
    const target = typeof first === 'string' ? first : first?.path
    if (target !== productSocket) blocked()
    return connect.apply(this, args)
  }
  require('node:tls').connect = blocked
  require('node:http').request = blocked
  require('node:http').get = blocked
  require('node:https').get = blocked
  require('node:http2').connect = blocked
  require('node:dgram').Socket.prototype.send = blocked
  globalThis.fetch = async () => blocked()
  if (globalThis.WebSocket) globalThis.WebSocket = class { constructor() { blocked() } }
  electronNet.request = blocked
  electronNet.fetch = async () => blocked()
  app.on('session-created', session => {
    session.fetch = async () => blocked()
    session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
  })
  require('node:https').request = (url, _options, callback) => {
    assert.equal(url.hostname, 'linux-fixture.invalid', 'No real provider/network request is allowed')
    assert.ok(_options?.headers?.Authorization === 'Bearer synthetic-linux-fixture-key', 'Only synthetic authorization reaches the controlled transport')
    const request = new EventEmitter()
    let body = ''
    request.write = chunk => { body += chunk; return true }
    request.end = () => {
      const parsed = JSON.parse(body)
      assert.equal(parsed.model, 'deepseek-v4-flash', 'Only flash reaches the controlled transport')
      const text = parsed.messages.find(message => message.role === 'user').content
      assert.ok(['LINUX PRIMARY', 'LINUX EDIT'].includes(text), 'Unexpected translation input was redacted and rejected')
      requests.push(text)
      setTimeout(() => {
        const response = new PassThrough()
        response.statusCode = 200
        callback(response)
        response.end(JSON.stringify({ choices: [{ message: { content: `LINUX RESULT ${text}` } }] }))
      }, 50)
    }
    request.destroy = () => request
    return request
  }
  require('node:module').syncBuiltinESMExports()
  assert.throws(() => new net.Socket().connect({ host: 'offline.invalid', port: 443 }), /blocks external network/)
  assert.throws(() => require('node:https').request(new URL('https://offline.invalid')), /No real provider\/network request/)
  assert.throws(() => electronNet.request('https://offline.invalid'), /blocks external network/)
  // WSLg may bridge PRIMARY from another desktop. Validate actual selection at
  // its public return boundary before main can deliver it to desktop/session.
  const Module = require('node:module')
  const load = Module._load
  let selectionGuardInstalled = false
  Module._load = function (request, parent, isMain) {
    const exports = load.apply(this, arguments)
    const resolved = Module._resolveFilename(request, parent)
    if (resolved === path.join(app.getAppPath(), 'electron', 'selection.cjs') && !selectionGuardInstalled) {
      const capture = exports.getSelection
      exports.getSelection = async (...args) => {
        const selection = await capture(...args)
        if (selection?.text !== 'LINUX PRIMARY') {
          write('privacy-failure', { code: 'unexpected-primary', redacted: true, deliveryPrevented: true })
          app.exit(1)
          throw new Error('Unexpected PRIMARY selection was redacted and rejected before delivery')
        }
        return selection
      }
      selectionGuardInstalled = true
    }
    return exports
  }
  const preflight = { passed: true, productImportsBeforeGuard: importedProductModules.length, isolatedHome: true, syntheticCredentialsOnly: true, model: fixture.providers.deepseek.model, endpoint: fixture.providers.deepseek.endpoint, controlledHttpsBeforeProductImports: true, nodeExternalNetworkBlocked: true, electronNetBlocked: true, chromiumHttpBlocked: true, selectionBoundaryGuardArmed: true, exactSyntheticInputBeforeLogging: true }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function wait(check, label) {
    const start = Date.now()
    while (Date.now() - start < 15000) {
      try { const value = await check(); if (value) return value } catch {}
      await delay(25)
    }
    throw new Error(`Timed out: ${label}`)
  }
  async function quitAfterInspectorDisconnect(beforeQuit) {
    await wait(() => fs.existsSync(path.join(run, `${stage}-quit-requested.json`)), 'controller inspector disconnect')
    assert.equal(JSON.parse(fs.readFileSync(path.join(run, `${stage}-quit-requested.json`))).inspectorDisconnected, true)
    if (beforeQuit) await beforeQuit()
    app.quit()
  }
  app.whenReady().then(async () => {
    try {
      const main = await wait(() => BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('/popup')), 'main window')
      const evaluate = expression => main.webContents.executeJavaScript(expression)
      await wait(() => evaluate('!!window.api && !!document.querySelector(".page")'), 'packaged frontend and preload')
      assert.equal(await evaluate('window.api.platform'), 'linux')
      const config = await evaluate('window.api.loadConfig()')
      const result = {
        stage, isPackaged: app.isPackaged, executable: app.getPath('exe'), appPath: app.getAppPath(),
        versions: { electron: process.versions.electron, node: process.versions.node },
        paths: Object.fromEntries(['appData', 'userData', 'sessionData', 'crashDumps', 'logs'].map(name => [name, app.getPath(name)])),
        preloadErrors: errors, initialMainVisible: main.isVisible(),
        display: { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || '', XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE },
        shortcutsRegistered: { translate: globalShortcut.isRegistered('Alt+Q'), show: globalShortcut.isRegistered('Alt+E') }
      }
      if (stage === 'verify') {
        checkpoint = 'verify durable public reads'
        const history = await evaluate('window.api.loadHistory()')
        assert.equal(config.launchToTray, true, 'Vue pending setting must survive native quit')
        assert.deepEqual(history.map(item => item.src), ['LINUX EDIT', 'LINUX PRIMARY'])
        assert.equal(history[0].favorite, true, 'UI favorite must survive relaunch')
        result.persisted = { launchToTray: config.launchToTray, history: history.map(({ src, favorite }) => ({ src, favorite })) }
        result.pass = true
        write('result', result)
        await quitAfterInspectorDisconnect()
        return
      }
      assert.equal(config.launchToTray, false)
      checkpoint = 'provider and prewarm'
      const capabilities = await evaluate('window.api.providerCapabilities()')
      assert.equal(capabilities.find(item => item.id === 'deepseek').available, true)
      result.providerReady = true
      const popup = await wait(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/popup')), 'one prewarmed popup')
      const popupEvaluate = expression => popup.webContents.executeJavaScript(expression)
      await wait(() => popupEvaluate('!!window.api && !!document.querySelector(".popup-body")'), 'prewarmed actual Vue')
      result.prewarm = { visible: popup.isVisible(), windows: BrowserWindow.getAllWindows().length }
      assert.equal(result.prewarm.visible, false)
      assert.equal(result.prewarm.windows, 2)
      // The external xclip process owns X11 PRIMARY. This supported socket is the
      // same Linux trigger boundary as electron/trigger.sh, without global input.
      const primary = require('electron').clipboard.readText('selection')
      assert.ok(primary === 'LINUX PRIMARY', 'Unexpected PRIMARY selection was redacted')
      assert.equal(selectionGuardInstalled, true, 'The real product selection boundary must be guarded')
      await wait(() => fs.existsSync(path.join(process.env.HOME, '.translate-app.sock')), 'product native Unix trigger socket')
      checkpoint = 'native PRIMARY socket trigger'
      await new Promise((resolve, reject) => {
        const socket = require('node:net').connect(path.join(process.env.HOME, '.translate-app.sock'))
        socket.once('connect', () => socket.end('trigger'))
        socket.once('error', reject)
        socket.once('close', resolve)
      })
      await wait(() => popupEvaluate('document.querySelector(".dst-text")?.textContent === "LINUX RESULT LINUX PRIMARY"'), 'Linux PRIMARY through native trigger/provider/session/preload/Vue')
      assert.equal(popup.isVisible(), true)
      result.selection = { owner: 'external xclip X11 PRIMARY', source: primary, visibleResult: await popupEvaluate('document.querySelector(".dst-text").textContent'), socketTrigger: true }
      checkpoint = 'source edit and second-view history'
      await popupEvaluate(`(() => {
        const source = document.querySelector('.src-text')
        source.textContent = 'LINUX EDIT'
        source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })()`)
      await wait(() => popupEvaluate('document.querySelector(".dst-text")?.textContent === "LINUX RESULT LINUX EDIT"'), 'source edit translates')
      await wait(() => evaluate('document.querySelector(".h-src")?.textContent === "LINUX EDIT"'), 'history notification in second real view')
      await evaluate('document.querySelector(".h-actions button").click()')
      await wait(async () => (await evaluate('window.api.loadHistory()'))[0]?.favorite, 'favorite durable public read')
      checkpoint = 'popup pin control'
      await popupEvaluate('document.querySelector(".popup-actions button").click()')
      await wait(() => popupEvaluate('document.querySelector(".popup-actions button").classList.contains("active")'), 'popup pin state')
      result.popup = { visible: popup.isVisible(), bounds: popup.getBounds(), alwaysOnTop: popup.isAlwaysOnTop(), nativeHandle: popup.getNativeWindowHandle().toString('hex') }
      assert.equal(result.popup.alwaysOnTop, true)
      const image = await popup.webContents.capturePage()
      assert.equal(image.isEmpty(), false)
      fs.writeFileSync(path.join(run, 'popup.png'), image.toPNG())
      result.capture = { ...image.getSize(), visibleAtCapture: popup.isVisible() }
      result.history = (await evaluate('window.api.loadHistory()')).map(({ src, favorite }) => ({ src, favorite }))
      assert.deepEqual(result.history, [{ src: 'LINUX EDIT', favorite: true }, { src: 'LINUX PRIMARY', favorite: false }])
      checkpoint = 'pending General edit and immediate native quit'
      await evaluate('window.location.hash = "#/settings/general"')
      await wait(() => evaluate('[...document.querySelectorAll(".setting-row")].some(row => row.textContent.includes("Launch to Tray"))'), 'General settings actual Vue')
      await delay(100)
      const editStartedAt = Date.now()
      const edit = await evaluate(`(async () => {
        const row = [...document.querySelectorAll('.setting-row')].find(row => row.textContent.includes('Launch to Tray'))
        const checkbox = row.querySelector('input')
        checkbox.checked = true
        const at = performance.now()
        checkbox.dispatchEvent(new Event('change', { bubbles: true }))
        const before = await window.api.loadConfig()
        return { requested: checkbox.checked, before: before.launchToTray, elapsedMs: performance.now() - at }
      })()`)
      assert.equal(edit.requested, true)
      assert.equal(edit.before, false, 'quit must be requested while the real debounce is still pending')
      assert.ok(edit.elapsedMs < 120)
      result.immediateQuitEdit = edit
      result.requests = requests
      assert.deepEqual(errors, [])
      result.pass = true
      write('result', result)
      await quitAfterInspectorDisconnect(async () => {
        const beforeQuit = await evaluate('window.api.loadConfig()')
        const boundary = { elapsedSinceEditMs: Date.now() - editStartedAt, launchToTrayBeforeQuit: beforeQuit.launchToTray, inspectorDisconnected: true }
        write('quit-boundary', boundary)
        assert.equal(beforeQuit.launchToTray, false, 'Native quit must begin before the Vue debounce commits')
      })
    } catch (error) {
      write('failure', { pass: false, checkpoint, error: error.stack, requests, preloadErrors: errors, rendererErrors })
      app.exit(1)
    }
  })
  return { injectedBeforeReady: true, stage, preflight }
})()
