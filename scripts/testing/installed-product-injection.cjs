function (require, run) {
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
  const electron = require('electron'), { app, BrowserWindow, Menu, clipboard, nativeImage } = electron
  if (app.isReady()) throw new Error('Paths and controlled HTTPS must precede app entry')
  const stamp = (event, values = {}) => fs.appendFileSync(path.join(run, 'events.jsonl'), JSON.stringify({ t: Date.now(), event, ...values }) + '\n')
  for (const name of ['appData','userData','sessionData','crashDumps']) app.setPath(name, path.join(run, name))
  app.setAppLogsPath(path.join(run, 'logs'))
  const hash = value => crypto.createHash('sha256').update(value).digest('hex')
  const state = globalThis.__installedValidation = { electron, fs, path, run, requests: [], menus: [], holdHistory: false, writes: [], historyFailure: false, configFailure: false, responses: [] }
  const assert = require('node:assert/strict')
  function deny() { throw new Error('Validation blocked network or unapproved child operation') }
  const net = require('node:net'), tls = require('node:tls'), http = require('node:http'), https = require('node:https')
  net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = deny
  http.request = http.get = https.request = https.get = deny
  require('node:dgram').createSocket = deny
  require('node:http2').connect = deny
  globalThis.fetch = globalThis.WebSocket = deny
  electron.net.request = electron.net.fetch = deny
  electron.shell.openExternal = deny
  // Installed before product's ready listener can create either renderer.
  app.on('session-created', session => {
    session.fetch = deny
    session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|devtools|data|blob):/.test(details.url) }))
  })
  app.on('ready', () => { electron.session.defaultSession.fetch = deny; electron.session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|devtools|data|blob):/.test(details.url) })) })
  const cp = require('node:child_process'), execFile = cp.execFile
  for (const method of ['spawn','spawnSync','exec','execSync','execFileSync','fork']) cp[method] = deny
  cp.execFile = function (file, args, ...rest) {
    const expected = ['-NoProfile','-NonInteractive','-Sta','-Command',"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"]
    if (String(file).toLowerCase() !== 'powershell.exe' || JSON.stringify(args) !== JSON.stringify(expected)) return deny()
    const started = Date.now(), callback = rest.pop()
    stamp('copy-helper-start', { deliberateFailure: !!state.failCopy })
    rest.push((error, stdout, stderr) => { stamp('copy-helper-end', { elapsed: Date.now() - started, errorCode: error?.code || null, stdoutLength: String(stdout || '').length, stderrLength: String(stderr || '').length }); callback(error, stdout, stderr) })
    const child = state.failCopy ? execFile.call(this, file, ['-NoProfile','-NonInteractive','-Command','exit 7'], ...rest) : execFile.call(this, file, args, ...rest)
    stamp('copy-helper-process', { pid: child.pid || null })
    return child
  }
  const preflight = { pass: false, isolatedProfile: false, syntheticProviders: false, socketAndTransportDenied: false, productNotImported: false }
  for (const [key, subdir] of Object.entries({HOME:'home',USERPROFILE:'home',APPDATA:'appData',LOCALAPPDATA:'localAppData',TEMP:'temp',TMP:'temp'})) assert.equal(path.resolve(process.env[key]), path.join(run, subdir))
  preflight.isolatedProfile = true
  const fixture = JSON.parse(fs.readFileSync(path.join(run, 'home', '.translate-app.config.json'), 'utf8'))
  for (const [id, provider] of Object.entries(fixture.providers)) if (provider.enabled) {
    assert.equal(provider.apiKey, 'SYNTHETIC-ONLY'); assert.equal(provider.endpoint, 'https://installed-validation.invalid')
    assert.equal(provider.model, id === 'deepseek' ? 'deepseek-v4-flash' : 'SYNTHETIC-SLOW')
  }
  preflight.syntheticProviders = true
  const operations = [() => net.connect(443,'example.invalid'), () => new net.Socket().connect(443,'example.invalid'), () => tls.connect(443,'example.invalid'), () => http.request('http://example.invalid'), () => https.request('https://example.invalid'), () => https.get('https://example.invalid'), () => require('node:http2').connect('https://example.invalid'), () => require('node:dgram').createSocket('udp4'), () => globalThis.fetch('https://example.invalid'), () => new globalThis.WebSocket('wss://example.invalid'), () => electron.net.request('https://example.invalid'), () => cp.spawn('unapproved')]
  for (const operation of operations) assert.throws(operation, /Validation blocked/)
  preflight.socketAndTransportDenied = true
  assert.ok(!Object.keys(require.cache).some(file => /[\\/]dist-electron[\\/](provider-service|translation-session)[.]cjs$/.test(file)))
  preflight.productNotImported = true; preflight.pass = true
  stamp('transport-preflight', preflight)
  let outerClipboard
  state.saveOuterClipboard = () => {
    outerClipboard = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() }
    stamp('outer-clipboard-saved-in-memory')
    return true
  }
  state.restoreOuterClipboard = () => {
    if (!outerClipboard) return false
    const data = {}
    for (const key of ['text','html','rtf']) if (outerClipboard[key]) data[key] = outerClipboard[key]
    if (!outerClipboard.image.isEmpty()) data.image = outerClipboard.image
    Object.keys(data).length ? clipboard.write(data) : clipboard.clear()
    outerClipboard = undefined
    stamp('outer-clipboard-restored', { ok: true })
    return true
  }
  state.stamp = stamp
  state.clipboardState = () => ({ text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: hash(clipboard.readImage().toBitmap()) })
  state.setClipboardFixture = text => {
    // A raw opaque BGRA buffer avoids any decoder ambiguity in the fixture.
    const opaque = nativeImage.createFromBitmap(Buffer.from([0,0,255,255,0,255,0,255,255,0,0,255,255,255,255,255]), { width: 2, height: 2 })
    clipboard.write({ text, html: '<b>' + text + '</b>', rtf: '{\\rtf1 ' + text + '}', image: opaque })
    state.clipboardExpected = state.clipboardState(); return state.clipboardExpected
  }
  const originalWrite = fs.promises.writeFile.bind(fs.promises)
  fs.promises.writeFile = async (file, ...args) => {
    const value = String(file)
    if (value.startsWith(path.join(run, 'home', '.translate-app.history.json.'))) {
      if (state.holdHistory) { stamp('history-write-held'); await new Promise(resolve => state.writes.push(resolve)) }
      if (state.historyFailure) throw Object.assign(new Error('Controlled validation history EACCES'), { code: 'EACCES' })
    }
    if (state.configFailure && value.startsWith(path.join(run, 'home', '.translate-app.config.json.'))) throw Object.assign(new Error('Controlled validation config EACCES'), { code: 'EACCES' })
    return originalWrite(file, ...args)
  }
  state.releaseWrites = () => { state.holdHistory = false; state.writes.splice(0).forEach(resolve => resolve()) }
  https.request = (url, options, callback) => {
    if (new URL(url).origin !== 'https://installed-validation.invalid') return deny()
    const request = new (require('node:events').EventEmitter)()
    let body = '', record
    request.write = value => { body += value; return true }
    request.destroy = () => { if (record) { record.abortAttempts++; stamp('abort-attempt', { source: record.source, engine: record.engine }) } return request }
    request.end = () => {
      const data = JSON.parse(body)
      assert.ok(['deepseek-v4-flash','SYNTHETIC-SLOW'].includes(data.model), 'Only exact synthetic fixture models')
      record = { source: data.messages?.find(message => message.role === 'user')?.content || data.text?.[0], engine: data.model === 'deepseek-v4-flash' ? 'fast' : 'slow', replied: false, abortAttempts: 0 }
      if (!/^(RACE|SINGLE_CURRENT|RACE_CURRENT|OLD_RACE|OLD_SINGLE|PARTIAL|ALL_FAIL|EMPTY|UI_EDIT|HISTORY_FAIL|HISTORY_RETRY|RETAIN_\d+|FINAL_VISIBLE|NATIVE_DRAG)$/.test(record.source) && record.source !== state.expectedSelection) throw new Error('Unexpected source rejected before synthetic transport logging')
      record.reply = (kind = 'success') => {
        if (record.replied) return
        record.replied = true; stamp('physical-response', { source: record.source, engine: record.engine, kind })
        const response = new (require('node:stream').PassThrough)()
        response.statusCode = kind === 'failure' ? 503 : 200
        callback(response)
        response.end(kind === 'failure' ? 'controlled failure' : JSON.stringify({ choices: [{ message: { content: kind === 'empty' ? '' : `${record.source} ${record.engine}` } }] }))
      }
      state.requests.push(record); stamp('request', { source: record.source, engine: record.engine })
      if (record.source.startsWith('OLD_') || (record.source === 'RACE' && record.engine === 'slow')) return
      setTimeout(() => record.reply(record.source === 'ALL_FAIL' || (record.source === 'PARTIAL' && record.engine === 'slow') ? 'failure' : record.source === 'EMPTY' ? 'empty' : 'success'), record.engine === 'slow' ? 150 : 35)
    }
    return request
  }
  const buildMenu = Menu.buildFromTemplate.bind(Menu)
  Menu.buildFromTemplate = template => { const menu = buildMenu(template); if (template.some(item => item.label === '退出')) state.menus.push({ template, menu }); return menu }
  state.window = kind => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/popup') === (kind === 'popup'))
  state.ui = (script, kind = 'popup') => state.window(kind).webContents.executeJavaScript(script)
  state.ready = () => !!state.popupReady && !!state.window('main') && !state.window('main').webContents.isLoading()
  state.snapshot = () => ({ windows: BrowserWindow.getAllWindows().map(win => ({ id: win.id, url: win.webContents.getURL(), visible: win.isVisible(), focused: win.isFocused(), top: win.isAlwaysOnTop(), bounds: win.getBounds(), preload: win.webContents.getLastWebPreferences().preload })), paths: Object.fromEntries(['appData','userData','sessionData','logs','crashDumps'].map(name => [name, app.getPath(name)])), requests: state.requests.map(({ source, engine, replied, abortAttempts }) => ({ source, engine, replied, abortAttempts })), trayMenus: state.menus.length })
  app.on('browser-window-created', (_event, win) => {
    stamp('window-created', { id: win.id, visible: win.isVisible() })
    for (const event of ['show','focus','blur','hide','closed','move','resize']) win.on(event, () => stamp('window-' + event, { id: win.id }))
    win.webContents.on('console-message', details => stamp('renderer-console', { level: details.level, message: details.message }))
  })
  const handle = electron.ipcMain.handle.bind(electron.ipcMain)
  electron.ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
    const result = await listener(...args)
    if (channel === 'popup:ready') { state.popupReady = true; stamp('popup-ready', { visible: BrowserWindow.fromWebContents(args[0].sender).isVisible() }) }
    if (channel === 'translate:do') state.responses.push(result)
    return result
  })
  // Only the exact production Ctrl+C helper is admitted by the child guard above.
  const selection = require(path.join(app.getAppPath(), 'electron', 'selection.cjs'))
  const capture = selection.getSelection
  selection.getSelection = async (...args) => {
    const result = await capture(...args)
    if (result.text && result.text !== state.expectedSelection) {
      state.unexpectedCapture = true
      stamp('unexpected-selection-redacted', { length: result.text.length })
      fs.writeFileSync(path.join(run, 'safety-abort.json'), JSON.stringify({ reason: 'unexpected-selection-redacted', length: result.text.length }))
      setImmediate(() => app.quit())
      return { text: '', source: 'validation-guard', reason: 'unexpected-selection-redacted' }
    }
    const current = state.clipboardState()
    stamp('selection-result', { result, clipboard: current, restored: JSON.stringify(current) === JSON.stringify(state.clipboardExpected) })
    return result
  }
  state.quit = () => app.quit()
  app.on('before-quit', () => { state.restoreOuterClipboard(); fs.writeFileSync(path.join(run, 'before-quit.json'), JSON.stringify({ t: Date.now(), snapshot: state.snapshot() })) })
  app.on('will-quit', () => { clearInterval(nativePoll); fs.writeFileSync(path.join(run, 'will-quit.json'), JSON.stringify({ t: Date.now(), windows: BrowserWindow.getAllWindows().length })) })
  let lastCommand = ''
  const nativePoll = setInterval(async () => {
    const file = path.join(run, 'native-command.json')
    if (!fs.existsSync(file)) return
    const raw = fs.readFileSync(file, 'utf8'); if (raw === lastCommand) return; lastCommand = raw
    try {
      const command = JSON.parse(raw)
      let value
      if (command.action === 'clipboard') value = state.setClipboardFixture(command.text)
      if (command.action === 'fail') { state.failCopy = command.value; value = state.failCopy }
      if (command.action === 'expected') { state.expectedSelection = command.text; value = true }
      if (command.action === 'eval') value = await (0, eval)(command.expression)
      fs.writeFileSync(path.join(run, 'native-response.json'), JSON.stringify({ id: command.id, value }))
    } catch (error) { fs.writeFileSync(path.join(run, 'native-response.json'), JSON.stringify({ error: error.stack })) }
  }, 40)
  return { preflight, appReady: app.isReady(), isPackaged: app.isPackaged, execPath: process.execPath, resourcesPath: process.resourcesPath, appPath: app.getAppPath(), entry: path.join(app.getAppPath(), 'dist-electron/main.cjs'), preloadSha256: hash(fs.readFileSync(path.join(app.getAppPath(), 'dist-electron/preload.cjs'))), versions: process.versions }
}
