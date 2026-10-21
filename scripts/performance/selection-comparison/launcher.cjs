const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { createHash } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const electron = require('electron')
const root = process.env.EASY_BENCH_REPO
const run = process.env.EASY_BENCH_RUN
let trial = null
let command = null
const output = path.join(run, 'events.jsonl')
const stamp = (event, extra = {}) => fs.appendFileSync(output, JSON.stringify({ t: Date.now(), event, trial, ...extra }) + '\n')
const readCommand = () => { command = JSON.parse(fs.readFileSync(path.join(run, 'trial.json'), 'utf8').replace(/^\uFEFF/, '')); trial = command.id }
const digest = image => image && !image.isEmpty() ? createHash('sha256').update(image.toBitmap()).digest('hex') : ''
const fixtureImage = electron.nativeImage.createFromBitmap(Buffer.from([0,0,255,255,0,255,0,255,255,0,0,255,255,255,255,255]), { width: 2, height: 2 })
stamp('launcher', { pid: process.pid, electron: process.versions.electron, node: process.versions.node })
electron.app.setPath('userData', path.join(run, 'userData'))
electron.app.whenReady().then(() => stamp('app-ready'))

const nativeExec = require('node:child_process').execFile
require('node:child_process').execFile = function(file, args, options, callback) {
  const started = performance.now()
  const child = nativeExec.call(this, file, args, options, (error, stdout, stderr) => {
    stamp('helper-end', { elapsed: performance.now() - started, error: !!error, pid: child.pid })
    callback(error, stdout, stderr)
  })
  stamp('helper-start', { pid: child.pid, file: path.basename(file) })
  return child
}
require('node:https').request = (_url, _options, callback) => {
  const request = new EventEmitter()
  let body = '', timer
  request.write = data => { body += data }
  request.end = () => {
    const source = JSON.parse(body).messages.find(message => message.role === 'user').content
    stamp('transport-start')
    timer = setTimeout(() => {
      const response = new PassThrough()
      response.statusCode = 200
      callback(response)
      response.end(JSON.stringify({ choices: [{ message: { content: 'BENCH_TRANSLATED: ' + source } }] }))
      stamp('transport-end')
    }, 50)
  }
  request.destroy = () => { clearTimeout(timer) }
  return request
}
const selection = require(path.join(root, 'electron/selection.cjs'))
const nativeGetSelection = selection.getSelection
// Freeze the original control independently of the product's current Windows helper.
const originalCopy = (_platform, runCommand) => {
  const member = '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'
  const script = [
    `Add-Type -MemberDefinition '${member}' -Name NativeKeyboard -Namespace EasyTranslate`,
    '[EasyTranslate.NativeKeyboard]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)',
    '[EasyTranslate.NativeKeyboard]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)',
    '[EasyTranslate.NativeKeyboard]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)',
    '[EasyTranslate.NativeKeyboard]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)'
  ].join('; ')
  return runCommand('powershell.exe', ['-NoProfile','-NonInteractive','-Sta','-Command',script])
}
const formsCopy = selection.sendCopyShortcut
const failingCopy = (_platform, runCommand) => runCommand('powershell.exe', ['-NoProfile','-NonInteractive','-Sta','-Command','exit 1'])
stamp('selection-implementation', { sha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'electron/selection.cjs'))).digest('hex') })
selection.getSelection = async () => {
  readCommand()
  const fixture = { text: command.same ? command.text : 'BENCH_CLIPBOARD', html: '<b>BENCH_CLIPBOARD</b>', rtf: '{\\rtf1 BENCH_CLIPBOARD}', image: fixtureImage }
  electron.clipboard.write(fixture)
  const expectedImage = digest(electron.clipboard.readImage())
  const fixtureReady = { text: electron.clipboard.readText() === fixture.text, html: electron.clipboard.readHTML().includes('BENCH_CLIPBOARD'), rtf: electron.clipboard.readRTF().includes('BENCH_CLIPBOARD'), image: expectedImage === digest(fixtureImage) }
  stamp('selection-start', { variant: command.variant, empty: !!command.empty, failure: !!command.failure, same: !!command.same, fixtureReady })
  const started = performance.now()
  let sentinel, restoreMs = 0, restoreStarted
  const clipboardApi = {
    readText: type => {
      const value = electron.clipboard.readText(type)
      if (sentinel && value && value !== sentinel) stamp('copy-detected', { elapsed: performance.now() - started })
      return value
    },
    readHTML: () => electron.clipboard.readHTML(), readRTF: () => electron.clipboard.readRTF(), readImage: () => electron.clipboard.readImage(),
    writeText: value => { electron.clipboard.writeText(value); sentinel = value; stamp('sentinel-written', { elapsed: performance.now() - started }) },
    write: data => { restoreStarted = performance.now(); electron.clipboard.write(data); restoreMs = performance.now() - restoreStarted; stamp('clipboard-restored', { elapsed: restoreMs }) },
    clear: () => { restoreStarted = performance.now(); electron.clipboard.clear(); restoreMs = performance.now() - restoreStarted }
  }
  let releaseMs = 0, pollingMs = 0
  const result = await nativeGetSelection({ clipboardApi, copyShortcut: command.failure ? failingCopy : command.variant === 'forms' ? formsCopy : originalCopy, wait: async ms => {
    const waitStart = performance.now()
    await new Promise(resolve => setTimeout(resolve, ms))
    const elapsed = performance.now() - waitStart
    if (ms === 120) releaseMs += elapsed
    else pollingMs += elapsed
  } })
  const restored = { text: electron.clipboard.readText() === fixture.text, html: electron.clipboard.readHTML().includes('BENCH_CLIPBOARD'), rtf: electron.clipboard.readRTF().includes('BENCH_CLIPBOARD'), image: digest(electron.clipboard.readImage()) === expectedImage }
  stamp('selection-end', { variant: command.variant, textMatches: result.text === command.text, textEmpty: result.text === '', reason: result.reason, warning: result.warning, source: result.source, captureMs: performance.now() - started, releaseMs, pollingMs, restoreMs, restored })
  return result
}
const register = electron.globalShortcut.register.bind(electron.globalShortcut)
electron.globalShortcut.register = (shortcut, callback) => register(shortcut, () => { readCommand(); stamp('shortcut', { shortcut }); return callback() })
const handle = electron.ipcMain.handle.bind(electron.ipcMain)
electron.ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  const result = await listener(...args)
  if (channel === 'translate:do') stamp('translate-end', { ok: !result?.error, history: !!result?.historyId })
  return result
})
let windowCount = 0
electron.app.on('browser-window-created', (_event, win) => {
  const kind = ++windowCount === 1 ? 'main' : 'popup'
  stamp('window-created', { kind, id: win.id })
  for (const event of ['show','hide','focus','blur','closed']) win.on(event, () => stamp('window-' + event, { kind }))
  win.webContents.on('did-finish-load', () => {
    stamp('document-ready', { kind })
    if (kind !== 'popup') return
    win.webContents.executeJavaScript(`(() => { let prior=''; const check=()=>{const value=document.querySelector('.dst-text')?.textContent || ''; if(!value){prior='';return} if(value!==prior){prior=value;console.log('__SELECTION_DOM__'+JSON.stringify({t:Date.now(),matches:value.startsWith('BENCH_TRANSLATED:'),visible:document.visibilityState}))}};new MutationObserver(check).observe(document.body,{subtree:true,childList:true,characterData:true});check()})()`)
  })
  win.webContents.on('console-message', (_event, details, legacy) => {
    const message = typeof details === 'object' ? details.message : legacy
    if (message?.startsWith('__SELECTION_DOM__')) stamp('dom-result', JSON.parse(message.slice('__SELECTION_DOM__'.length)))
  })
})
const health = setInterval(() => {
  const windows = electron.BrowserWindow.getAllWindows()
  stamp('health', { windows: windows.length, pids: electron.app.getAppMetrics().map(process => process.pid) })
  if (fs.existsSync(path.join(run, 'stop'))) { electron.app.isQuiting = true; electron.app.quit() }
}, 500)
electron.app.on('will-quit', () => { clearInterval(health); stamp('quit') })
require(process.env.EASY_BENCH_MAIN || path.resolve(root, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main))
