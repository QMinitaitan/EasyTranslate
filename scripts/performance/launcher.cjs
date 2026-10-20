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
stamp('launcher', { pid: process.pid, electron: process.versions.electron, node: process.versions.node })
electron.app.setPath('userData', path.join(run, 'userData'))
const originalClipboard = { text: 'BENCH_CLIPBOARD', html: '<b>BENCH_CLIPBOARD</b>', rtf: '{\\rtf1 BENCH_CLIPBOARD}' }
electron.app.whenReady().then(() => { stamp('app-ready'); electron.clipboard.write(originalClipboard) })

const nativeExec = require('node:child_process').execFile
require('node:child_process').execFile = function(file, args, options, callback) {
  const started = Date.now()
  const child = nativeExec.call(this, file, args, options, (error, stdout, stderr) => {
    stamp('helper-end', { elapsed: Date.now() - started, error: !!error, pid: child.pid })
    callback(error, stdout, stderr)
  })
  stamp('helper-start', { pid: child.pid, file: path.basename(file) })
  return child
}

// Controlled in-process transport: real adapter is retained, external network is impossible.
require('node:https').request = (url, options, callback) => {
  const request = new EventEmitter()
  let body = ''
  request.write = (data) => { body += data }
  request.end = () => {
    const source = JSON.parse(body).messages?.find(m => m.role === 'user')?.content || ''
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

const selection = require(path.join(root, 'electron/selection.cjs'))
const nativeGetSelection = selection.getSelection
selection.getSelection = async (...args) => {
  stamp('selection-start')
  const result = await nativeGetSelection(...args)
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
require(process.env.EASY_BENCH_MAIN || path.join(root, 'electron/main.cjs'))
