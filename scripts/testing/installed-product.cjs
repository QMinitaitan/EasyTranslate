// Run the original packaged executable, with no alternate application argument.
// All raw output belongs outside Git. See installed-product-injection.cjs.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { spawn, execFile } = require('node:child_process')
const [exe, runArg, mode = 'functional', source] = process.argv.slice(2)
if (!exe || !runArg) throw new Error('Usage: node installed-product.cjs EXE FRESH_OUTPUT [functional|native|startup|relaunch] [independent-source]')
const run = path.resolve(runArg)
const ownedRoot = path.resolve('E:/EasyTranslate-implementation-notes-20261020/windows-final-validation') + path.sep
assert.ok(path.resolve(exe).toLowerCase().startsWith(ownedRoot.toLowerCase()), 'Only the explicitly owned validation executable tree is permitted; never launch the daily installation')
assert.ok(run.toLowerCase().startsWith(ownedRoot.toLowerCase()), 'Profile output must stay inside the explicitly owned validation tree')
assert.ok(!fs.existsSync(run), 'Retain previous runs; choose a fresh output')
fs.mkdirSync(run, { recursive: true })
for (const name of ['home', 'appData', 'localAppData', 'temp', 'userData', 'sessionData', 'logs', 'crashDumps']) fs.mkdirSync(path.join(run, name))
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
const asarPath = path.join(path.dirname(exe), 'resources', 'app.asar')
const summary = { mode, run, exe: path.resolve(exe), asar: asarPath, exeSha256: hash(fs.readFileSync(exe)), asarSha256: hash(fs.readFileSync(asarPath)), checks: {}, pauses: [], status: 'running' }
const asar = require((source || 'E:/EasyTranslate') + '/node_modules/@electron/asar')
const pkg = JSON.parse(asar.extractFile(asarPath, 'package.json'))
summary.packagedMain = pkg.main
summary.preloadSha256 = hash(asar.extractFile(asarPath, 'dist-electron/preload.cjs'))
if (source) {
  const files = ['dist-electron/main.cjs', 'dist-electron/preload.cjs', 'dist-electron/provider-service.cjs', 'dist-electron/providers.cjs', 'dist/index.html', 'electron/selection.cjs']
  summary.sourceMatches = Object.fromEntries(files.map(file => [file, hash(asar.extractFile(asarPath, file)) === hash(fs.readFileSync(path.join(source, file)))]))
  assert.ok(Object.values(summary.sourceMatches).every(Boolean), 'Independent compiled source must match payload')
}
const providers = Object.fromEntries(['deepseek','openai','bing','google','deepl','youdao','tencent','caiyun','baidu'].map(id => [id, { enabled: false, apiKey: '' }]))
providers.deepseek = { enabled: true, apiKey: 'SYNTHETIC-ONLY', model: 'deepseek-v4-flash', endpoint: 'https://installed-validation.invalid' }
providers.openai = { enabled: true, apiKey: 'SYNTHETIC-ONLY', model: 'SYNTHETIC-SLOW', endpoint: 'https://installed-validation.invalid' }
fs.writeFileSync(path.join(run, 'home', '.translate-app.config.json'), JSON.stringify({ providers, raceMode: mode === 'functional', launchToTray: true, uiLanguage: 'zh-CN', customPreserved: 'LEGACY-SYNTHETIC', shortcuts: { translate: 'Alt+Q', show: 'Alt+E' } }))
fs.writeFileSync(path.join(run, 'home', '.translate-app.history.json'), JSON.stringify([{ id: 'legacy-id', src: 'LEGACY', dst: 'LEGACY TRANSLATION', ts: 1, favorite: true, customPreserved: 'LEGACY' }]))
// Carry OS/runtime essentials only. Never inherit provider credentials or CLI hooks.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(SystemRoot|WINDIR|ComSpec|PATH|PATHEXT|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS)$/i.test(key)))
Object.assign(env, { HOME: path.join(run, 'home'), USERPROFILE: path.join(run, 'home'), APPDATA: path.join(run, 'appData'), LOCALAPPDATA: path.join(run, 'localAppData'), TEMP: path.join(run, 'temp'), TMP: path.join(run, 'temp') })
let child, socket, stdout = '', stderr = '', timer, stopped = false, nextId = 0
const pending = new Map(), paused = [], scripts = new Map()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const wait = async (check, label, timeout = 10000) => {
  const began = Date.now()
  while (!stopped && Date.now() - began < timeout) { if (fs.existsSync(path.join(run, 'safety-abort.json'))) throw new Error('Unexpected captured text redacted; native validation aborted'); const value = await check(); if (value) return value; await delay(25) }
  throw new Error('Timeout: ' + label)
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const answer = await send('Runtime.evaluate', { expression: `globalThis.__installedOperation = {done:false}; globalThis.__installedPromise = Promise.resolve((${expression})).then(value=>{globalThis.__installedOperation={done:true,value}},error=>{globalThis.__installedOperation={done:true,error:String(error.stack||error)}}); 'started'`, returnByValue: true })
  if (answer.exceptionDetails) throw new Error(JSON.stringify(answer.exceptionDetails))
  const result = await wait(async () => {
    const poll = await send('Runtime.evaluate', { expression: 'globalThis.__installedOperation', returnByValue: true })
    if (poll.exceptionDetails) throw new Error(JSON.stringify(poll.exceptionDetails))
    return poll.result.value?.done && poll.result.value
  }, 'inspector evaluation', 70000)
  if (result.error) throw new Error(result.error)
  return result.value
}
async function disconnectThenQuit() {
  await evaluate("(() => { setTimeout(() => globalThis.__installedValidation.quit(), 50); return 'scheduled' })()")
  const disconnected = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }))
  socket.close(); await disconnected; summary.disconnectedAt = Date.now()
}
;(async () => {
  try {
    const args = ['--inspect-brk=127.0.0.1:0', '--user-data-dir=' + path.join(run, 'userData'), '--hidden']
    if (mode === 'native') await wait(() => fs.existsSync(path.join(run, 'native-source-foreground.json')), 'source foreground before executable launch')
    summary.command = { file: exe, args }; summary.started = Date.now()
    child = spawn(exe, args, { env, cwd: path.dirname(exe), windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    summary.pid = child.pid
    child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b })
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal, t: Date.now() })))
    timer = setTimeout(() => {
      stopped = true
      for (const op of pending.values()) op.reject(new Error('Owned probe deadline'))
      pending.clear(); socket?.close()
      if (child.exitCode === null) { summary.forcedCleanup = true; execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {}) }
    }, ['native','mouse','native-post-startup'].includes(mode) ? 180000 : 90000)
    const url = await wait(() => stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/)?.[0], 'owned inspector')
    socket = new WebSocket(url)
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) { const op = pending.get(message.id); pending.delete(message.id); message.error ? op.reject(new Error(JSON.stringify(message.error))) : op.resolve(message.result) }
      else if (message.method === 'Debugger.scriptParsed') scripts.set(message.params.scriptId, message.params.url)
      else if (message.method === 'Debugger.paused') paused.push(message.params)
    })
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    await send('Runtime.enable'); await send('Debugger.enable'); await send('Runtime.runIfWaitingForDebugger')
    let pause = await wait(() => paused.shift(), 'entry pause')
    const entry = data => data.callFrames.find(frame => /[\\/]dist-electron[\\/]main[.]cjs$/.test(frame.url || scripts.get(frame.location.scriptId) || ''))
    summary.pauses.push(pause.callFrames.slice(0,2).map(frame => ({ url: frame.url || scripts.get(frame.location.scriptId), line: frame.location.lineNumber })))
    if (!entry(pause)) { await send('Debugger.setBreakpointByUrl', { lineNumber: 0, urlRegex: '[\\\\/]dist-electron[\\\\/]main[.]cjs$' }); await send('Debugger.resume'); pause = await wait(() => paused.shift(), 'packaged user entry') }
    assert.ok(entry(pause), 'Actual packaged CJS entry must be paused')
    const injection = fs.readFileSync(path.join(__dirname, 'installed-product-injection.cjs'), 'utf8')
    const result = await send('Debugger.evaluateOnCallFrame', { callFrameId: entry(pause).callFrameId, expression: `(${injection})(require,${JSON.stringify(run)})`, returnByValue: true })
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
    summary.identity = result.result.value
    assert.equal(summary.identity.preflight.pass, true, 'Profile and complete transport guard must precede product entry')
    assert.equal(summary.identity.appReady, false); assert.equal(summary.identity.isPackaged, true)
    assert.equal(path.resolve(summary.identity.execPath), path.resolve(exe)); assert.equal(path.resolve(summary.identity.appPath), path.resolve(asarPath))
    assert.equal(summary.identity.preloadSha256, summary.preloadSha256)
    summary.checks.originalProductionEntry = true
    if (mode === 'native') {
      const expected = JSON.parse(fs.readFileSync(path.join(run, 'native-source-foreground.json'), 'utf8'))
      const lines = fs.readFileSync(path.join(run, 'source-samples.jsonl'), 'utf8').trim().split('\n')
      const latest = JSON.parse(lines.at(-1))
      assert.ok(Date.now() - latest.t < 300 && latest.foreground === expected.handle && latest.expectedSelection && latest.selectionLength === 16, 'Own native foreground and selection required before product resume')
      summary.nativePreResume = { valid: true, t: latest.t, handle: expected.handle }
    }
    await send('Debugger.resume')
    await wait(() => evaluate("globalThis.__installedValidation.ready()"), 'real Vue/prewarm ready')
    await evaluate('globalThis.__installedValidation.saveOuterClipboard()')
    summary.startup = await evaluate('globalThis.__installedValidation.snapshot()')
    assert.equal(summary.startup.windows.length, 2)
    assert.ok(summary.startup.windows.every(w => !w.visible))
    summary.checks.hiddenPrewarm = true
    fs.writeFileSync(path.join(run, 'controller-ready.json'), JSON.stringify(summary.startup, null, 2))
    if (mode === 'functional') {
      const suite = fs.readFileSync(path.join(__dirname, 'installed-product-suite.cjs'), 'utf8')
      summary.functional = await evaluate(`(${suite})(globalThis.__installedValidation)`)
      assert.equal(summary.functional.pass, true)
    } else if (['native','mouse','native-post-startup'].includes(mode)) {
      await wait(() => fs.existsSync(path.join(run, 'native-done.json')), 'native external driver', 160000)
      summary.native = JSON.parse(fs.readFileSync(path.join(run, 'native-done.json'), 'utf8'))
      assert.equal(summary.native.pass, true)
    }
    summary.beforeQuit = await evaluate('globalThis.__installedValidation.snapshot()')
    await disconnectThenQuit()
    summary.exit = await exited
    summary.checks.naturalExit = summary.exit.code === 0 && !summary.forcedCleanup
    summary.checks.disconnectedBeforeQuit = summary.disconnectedAt <= JSON.parse(fs.readFileSync(path.join(run, 'before-quit.json'), 'utf8')).t
    assert.ok(Object.values(summary.checks).every(Boolean))
    summary.status = 'passed'
  } catch (error) { summary.status = 'failed'; summary.error = error.stack; process.exitCode = 1 }
  finally {
    if (socket?.readyState === WebSocket.OPEN && child?.exitCode === null) {
      await Promise.race([send('Runtime.evaluate', { expression: 'globalThis.__installedValidation?.restoreOuterClipboard()' }).catch(() => {}), delay(1000)])
    }
    stopped = true; clearTimeout(timer); socket?.close()
    if (child && child.exitCode === null && child.signalCode === null) { summary.forcedCleanup = true; await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, resolve)) }
    fs.writeFileSync(path.join(run, 'stdout.txt'), stdout); fs.writeFileSync(path.join(run, 'stderr.txt'), stderr)
    summary.completed = Date.now(); fs.writeFileSync(path.join(run, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify({ status: summary.status, run, error: summary.error, exit: summary.exit }))
  }
})()
