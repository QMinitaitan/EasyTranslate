const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const net = require('node:net')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const [binaryArg, outputArg, ...extra] = process.argv.slice(2)
if (process.platform !== 'linux' || !binaryArg || !outputArg || extra.length) throw new Error('Usage on Linux: node linux-packaged-validation.cjs EXTRACTED_BINARY FRESH_OUTPUT')
const binary = fs.realpathSync(binaryArg)
const output = path.resolve(outputArg)
assert.equal(fs.existsSync(output), false, 'Keep observations; choose a fresh output directory')
for (const name of ['home', 'appData', 'localAppData', 'userData', 'sessionData', 'crashDumps', 'logs', 'tmp']) fs.mkdirSync(path.join(output, name), { recursive: true })
// DrvFs supports our large artifacts, but not AF_UNIX. Create only the small
// synthetic config/history/socket HOME on the native Linux filesystem.
const home = fs.mkdtempSync('/tmp/easytranslate-pr12-')
fs.chmodSync(home, 0o700)
const ownership = { token: randomUUID(), output, pid: process.pid }
const marker = path.join(home, '.validation-owner.json')
fs.writeFileSync(marker, JSON.stringify(ownership), { mode: 0o600, flag: 'wx' })
function assertOwnedHome() {
  assert.match(home, /^\/tmp\/easytranslate-pr12-[A-Za-z0-9]+$/)
  assert.equal(fs.realpathSync(home), home, 'Owned native HOME must not be a symlink')
  const stat = fs.lstatSync(home)
  assert.equal(stat.isDirectory(), true)
  assert.equal(stat.uid, process.getuid())
  assert.equal(stat.mode & 0o777, 0o700)
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, 'utf8')), ownership)
}
assertOwnedHome()
assert.ok(Buffer.byteLength(path.join(home, '.translate-app.sock')) < 108, 'Use a short owned HOME alias for Unix sockets')
const fixture = {
  launchToTray: false, closeAction: 'quit', uiLanguage: 'en', raceMode: false,
  providers: Object.fromEntries(['deepseek', 'openai', 'bing', 'google', 'deepl', 'youdao', 'tencent', 'caiyun', 'baidu'].map(id => [id, { enabled: id === 'deepseek', apiKey: id === 'deepseek' ? 'synthetic-linux-fixture-key' : '', endpoint: 'https://linux-fixture.invalid', model: id === 'deepseek' ? 'deepseek-v4-flash' : 'fixture-model' }]))
}
fs.writeFileSync(path.join(home, '.translate-app.config.json'), JSON.stringify(fixture), { mode: 0o600, flag: 'wx' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const summary = { binary, output, nativeHome: { path: home, mode: '0700', uid: process.getuid(), archive: path.join(output, 'home'), socketSupported: false }, stages: [], transport: '50 ms in-process controlled HTTPS boundary; no external provider network', status: 'running' }
let clipboardOwner

async function runStage(stage) {
  let child, socket, stdout = '', stderr = '', id = 0
  const pending = new Map(), paused = [], scripts = new Map()
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id
    pending.set(requestId, { resolve, reject })
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
  const deadlineAt = Date.now() + 60000
  async function wait(check, label) {
    while (Date.now() < deadlineAt) {
      const value = check()
      if (value) return value
      if (child?.exitCode !== null) throw new Error(`Product exited before ${label}: ${child?.exitCode}`)
      await delay(20)
    }
    throw new Error(`Deadline: ${label}`)
  }
  const args = ['--inspect-brk=127.0.0.1:0', '--no-sandbox', '--ozone-platform=x11', '--disable-gpu']
  assertOwnedHome()
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/key|token|secret|password|credential|authorization/i.test(name)))
  const env = { ...environment, HOME: home, USERPROFILE: home, APPDATA: path.join(output, 'appData'), LOCALAPPDATA: path.join(output, 'localAppData'), XDG_CONFIG_HOME: path.join(output, 'appData'), XDG_CACHE_HOME: path.join(output, 'cache'), XDG_DATA_HOME: path.join(output, 'data'), TMPDIR: path.join(output, 'tmp'), TMP: path.join(output, 'tmp'), TEMP: path.join(output, 'tmp'), EASY_LINUX_RUN: output, EASY_LINUX_STAGE: stage, XDG_SESSION_TYPE: 'x11', WAYLAND_DISPLAY: '' }
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'VITE_DEV_SERVER_URL']) delete env[key]
  let timer
  try {
    child = spawn(binary, args, { cwd: path.dirname(binary), env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    const exited = new Promise((resolve, reject) => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', reject) })
    timer = setTimeout(() => {
      for (const operation of pending.values()) operation.reject(new Error('Linux packaged validation deadline'))
      socket?.close()
      child.kill('SIGKILL')
    }, 65000)
    const url = await wait(() => stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/)?.[0], 'loopback inspector')
    socket = new WebSocket(url)
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (pending.has(message.id)) {
        const operation = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) operation.reject(new Error(JSON.stringify(message.error)))
        else operation.resolve(message.result)
      } else if (message.method === 'Debugger.scriptParsed') scripts.set(message.params.scriptId, message.params.url)
      else if (message.method === 'Debugger.paused') paused.push(message.params)
    })
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    await send('Runtime.enable')
    await send('Debugger.enable')
    await send('Runtime.runIfWaitingForDebugger')
    let pause = await wait(() => paused.shift(), 'initial debugger pause')
    const entry = pause => pause.callFrames.find(frame => /[/\\]dist-electron[/\\]main[.]cjs$/.test(frame.url || scripts.get(frame.location.scriptId) || ''))
    if (!entry(pause)) {
      await send('Debugger.setBreakpointByUrl', { lineNumber: 0, urlRegex: '[/\\\\]dist-electron[/\\\\]main[.]cjs$' })
      await send('Debugger.resume')
      pause = await wait(() => paused.shift(), 'packaged main entry')
    }
    assert.ok(entry(pause), 'Pause must reach compiled packaged main before execution')
    const program = fs.readFileSync(path.join(__dirname, 'linux-packaged-probe.cjs'), 'utf8')
    const injection = await send('Debugger.evaluateOnCallFrame', { callFrameId: entry(pause).callFrameId, expression: `eval(${JSON.stringify(program)})`, returnByValue: true })
    assert.equal(injection.exceptionDetails, undefined, JSON.stringify(injection.exceptionDetails))
    assert.equal(injection.result.value.injectedBeforeReady, true)
    assert.equal(injection.result.value.preflight.passed, true)
    fs.writeFileSync(path.join(output, `${stage}-preflight.json`), JSON.stringify(injection.result.value.preflight, null, 2))
    await send('Debugger.resume')
    await wait(() => fs.existsSync(path.join(output, `${stage}-result.json`)) || fs.existsSync(path.join(output, `${stage}-failure.json`)), 'public UI / persistence checks')
    assert.equal(fs.existsSync(path.join(output, `${stage}-failure.json`)), false, fs.existsSync(path.join(output, `${stage}-failure.json`)) ? fs.readFileSync(path.join(output, `${stage}-failure.json`), 'utf8') : '')
    // The probe waits for this file. Acknowledge only after inspector transport
    // has disconnected so process exit is not held open by the debugger.
    await new Promise(resolve => { socket.addEventListener('close', resolve, { once: true }); socket.close() })
    fs.writeFileSync(path.join(output, `${stage}-quit-requested.json`), JSON.stringify({ inspectorDisconnected: true }))
    const exit = await exited
    assert.equal(exit.code, 0, 'Packaged binary must naturally quit')
    const result = JSON.parse(fs.readFileSync(path.join(output, `${stage}-result.json`)))
    assert.equal(fs.existsSync(path.join(output, `${stage}-will-quit.json`)), true)
    assert.equal(fs.existsSync(path.join(home, '.translate-app.sock')), false, 'Owned Unix socket must be removed on exit')
    const quitBoundary = fs.existsSync(path.join(output, `${stage}-quit-boundary.json`)) ? JSON.parse(fs.readFileSync(path.join(output, `${stage}-quit-boundary.json`))) : undefined
    return { ...result, quitBoundary, exit, inspectorDisconnectedBeforeQuit: true, socketRemovedAfterExit: true, command: { binary, args } }
  } finally {
    clearTimeout(timer)
    socket?.close()
    if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGKILL')
    fs.writeFileSync(path.join(output, `${stage}-stdout.txt`), stdout)
    fs.writeFileSync(path.join(output, `${stage}-stderr.txt`), stderr)
  }
}

;(async () => {
  try {
    // Test the exact directory and operating-system socket API before launch.
    const socketPath = path.join(home, 'capability.sock')
    await new Promise((resolve, reject) => {
      const server = net.createServer(connection => connection.end())
      server.once('error', reject)
      server.listen(socketPath, () => {
        const client = net.connect(socketPath)
        client.once('error', reject)
        client.once('close', () => server.close(resolve))
        client.resume()
      })
    })
    assert.equal(fs.existsSync(socketPath), false)
    summary.nativeHome.socketSupported = true
    clipboardOwner = spawn('xclip', ['-quiet', '-selection', 'primary', '-in'], { stdio: ['pipe', 'ignore', 'pipe'] })
    const clipboardExited = new Promise((resolve, reject) => { clipboardOwner.once('exit', (code, signal) => resolve({ code, signal })); clipboardOwner.once('error', reject) })
    summary.primaryOwner = { pid: clipboardOwner.pid, selection: 'X11 PRIMARY', contents: 'synthetic only' }
    clipboardOwner.exited = clipboardExited
    clipboardOwner.stdin.end('LINUX PRIMARY')
    await delay(200)
    summary.stages.push(await runStage('edit'))
    summary.stages.push(await runStage('verify'))
    summary.status = 'passed'
  } catch (error) {
    summary.status = 'failed'
    summary.error = error.stack
    process.exitCode = 1
  } finally {
    clipboardOwner?.kill('SIGTERM')
    if (clipboardOwner?.exited) summary.primaryOwner.exit = await clipboardOwner.exited
    // Preserve the synthetic home before removing only the exact verified path.
    try {
      assertOwnedHome()
      summary.nativeHome.entries = fs.readdirSync(home).map(name => {
        const stat = fs.lstatSync(path.join(home, name))
        return { name, type: stat.isFile() ? 'file' : stat.isSocket() ? 'socket' : stat.isDirectory() ? 'directory' : 'other', bytes: stat.size }
      })
      // Node's recursive copy rejects Unix sockets. Archive only our explicit
      // regular synthetic fixtures; socket metadata belongs in the manifest.
      for (const name of ['.validation-owner.json', '.translate-app.config.json', '.translate-app.history.json']) {
        const file = path.join(home, name)
        if (!fs.existsSync(file)) continue
        assert.equal(fs.lstatSync(file).isFile(), true)
        fs.copyFileSync(file, path.join(output, 'home', name))
      }
      fs.rmSync(home, { recursive: true })
      summary.nativeHome.removed = !fs.existsSync(home)
    } catch (error) {
      summary.nativeHome.cleanupError = error.stack
      summary.status = 'failed'
      process.exitCode = 1
    }
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary, null, 2))
  }
})()
