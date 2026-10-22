throw new Error('Historical native validation is disabled; see docs/validation/NATIVE-VALIDATION.md')
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const root = process.env.EASY_PREWARM_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_PREWARM_OUTPUT
const mode = process.env.EASY_PREWARM_MODE || 'focus'
if (!output) throw new Error('An isolated EASY_PREWARM_OUTPUT is required')
app.setPath('userData', path.join(output, 'userData'))
const events = path.join(output, 'events.jsonl')
const stamp = (event, extra = {}) => fs.appendFileSync(events, JSON.stringify({ t: Date.now(), event, ...extra }) + '\n')
const clipboardFixture = { text: 'PREWARM_CLIPBOARD', html: '<b>PREWARM_CLIPBOARD</b>', rtf: '{\\rtf1 PREWARM_CLIPBOARD}' }
app.whenReady().then(() => { require('electron').clipboard.write(clipboardFixture); stamp('clipboard-installed') })
const selection = require(path.join(root, 'electron/selection.cjs'))
const capture = selection.getSelection
selection.getSelection = async (...args) => {
  const result = await capture(...args)
  const clipboard = require('electron').clipboard
  stamp('selection', { text: result.text, source: result.source, restored: clipboard.readText() === clipboardFixture.text && clipboard.readHTML().includes(clipboardFixture.text) && clipboard.readRTF().includes(clipboardFixture.text) })
  return result
}
const requests = []
require('node:https').request = (_url, _options, callback) => {
  const request = new EventEmitter()
  let body = ''
  request.write = value => { body += value }
  request.destroy = () => request
  request.end = () => {
    const text = JSON.parse(body).messages.find(message => message.role === 'user').content
    requests.push(text)
    setTimeout(() => {
      const response = new PassThrough()
      response.statusCode = 200
      callback(response)
      response.end(JSON.stringify({ choices: [{ message: { content: `TRANSLATED ${text}` } }] }))
    }, 50)
  }
  return request
}
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, async (event, ...args) => {
  if (channel === 'popup:ready') {
    const visibility = await event.sender.executeJavaScript('document.visibilityState')
    if (visibility !== 'hidden') {
      fs.writeFileSync(path.join(output, 'error.txt'), `Prewarmed renderer initialized with page visibility ${visibility}`)
      app.exit(1)
      throw new Error('The prewarmed renderer must initialize with the page hidden')
    }
    stamp('popup-initialized-hidden', { visibility })
  }
  if (mode === 'queue' && channel === 'config:load' && event.sender.getURL().includes('window=popup')) {
    stamp('popup-config-wait')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  const result = await listener(event, ...args)
  if (channel === 'popup:ready') stamp('popup-app-ready', { visible: BrowserWindow.fromWebContents(event.sender).isVisible() })
  if (channel === 'translate:do') stamp('backend-result', { text: result.text })
  return result
})
let popup
let windowCount = 0
app.on('browser-window-created', (_event, win) => {
  const kind = ++windowCount === 1 ? 'main' : 'popup'
  stamp('window-created', { kind, visible: win.isVisible() })
  for (const name of ['show', 'focus', 'hide', 'closed']) win.on(name, () => stamp('window-' + name, { kind }))
  if (kind === 'popup') popup = win
})
const monitor = setInterval(async () => {
  if (popup && !popup.isDestroyed()) {
    const text = await popup.webContents.executeJavaScript("document.querySelector('.dst-text')?.textContent || ''").catch(() => '')
    const wanted = mode === 'queue' ? 'PREWARM_B' : 'PREWARM_A'
    const historyPath = path.join(output, '.translate-app.history.json')
    if (text === `TRANSLATED ${wanted}` && !fs.existsSync(path.join(output, 'result.json')) && fs.existsSync(historyPath)) {
      const items = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
      assert.deepEqual(requests, [wanted])
      assert.deepEqual(items.map(item => item.src), [wanted])
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: true, mode, visible: text, requests, history: items.map(item => item.src), windows: windowCount }, null, 2))
      stamp('dom-result', { text })
    }
  }
  if (fs.existsSync(path.join(output, 'stop'))) { app.isQuiting = true; app.quit() }
}, 100)
const deadline = setTimeout(() => app.exit(1), 25000)
app.on('will-quit', () => { clearInterval(monitor); clearTimeout(deadline) })
process.on('unhandledRejection', error => { fs.writeFileSync(path.join(output, 'error.txt'), error.stack); app.exit(1) })
require(path.join(root, require(path.join(root, 'package.json')).main))
