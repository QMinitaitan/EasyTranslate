const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const root = process.env.EASY_SESSION_TEST_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_SESSION_TEST_OUTPUT
if (!output) throw new Error('EASY_SESSION_TEST_OUTPUT must point to an isolated fixture directory')
const electron = require('electron')
const deadline = setTimeout(() => { console.error('T2 smoke deadline'); electron.app.exit(1) }, 20000)
electron.app.on('will-quit', () => clearTimeout(deadline))
electron.app.setPath('userData', path.join(output, 'userData'))
const actions = {}
let delayNextConfig = false
let delayedConfigStarted = false
const registerHandle = electron.ipcMain.handle.bind(electron.ipcMain)
electron.ipcMain.handle = (channel, listener) => registerHandle(channel, async (...args) => {
  if (channel === 'config:load' && delayNextConfig) {
    delayNextConfig = false
    delayedConfigStarted = true
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return listener(...args)
})
electron.globalShortcut.register = (shortcut, callback) => { actions[shortcut] = callback; return true }
require(path.join(root, 'electron/selection.cjs')).getSelection = async () => ({ text: 'WARMUP', source: 'controlled-selection' })
const requests = []
let failures = 0
let abortAttempts = 0
require('node:https').request = (_url, _options, response) => {
  const req = new EventEmitter()
  let body = ''
  req.write = chunk => { body += chunk }
  req.end = () => {
    const source = JSON.parse(body).messages.find(message => message.role === 'user').content
    requests.push(source)
    setTimeout(() => {
      const res = new PassThrough()
      const fail = source === 'FAIL' && failures++ === 0
      res.statusCode = fail ? 500 : 200
      response(res)
      res.end(fail ? 'controlled failure' : JSON.stringify({ choices: [{ message: { content: `TRANSLATED ${source}` } }] }))
    }, source === 'A' ? 700 : 25)
  }
  // Deliberately cannot cancel promptly: identity must still protect the current result.
  req.destroy = () => { abortAttempts++; return req }
  return req
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(check, label, timeout = 7000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { if (await check()) return } catch (_) {}
    await delay(20)
  }
  throw new Error(`Timed out: ${label}`)
}
require(path.resolve(root, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main))
electron.app.whenReady().then(async () => {
  try {
    await wait(() => actions['Alt+Q'], 'shortcut registration')
    await actions['Alt+Q']()
    let popup
    await wait(() => {
      popup = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/popup'))
      return popup && !popup.webContents.isLoading()
    }, 'popup document')
    await wait(() => popup.webContents.executeJavaScript("!!document.querySelector('.popup-body')"), 'Vue popup mount')
    await delay(200)
    await popup.webContents.executeJavaScript('window.api.clearHistory()')
    delayNextConfig = true
    popup.webContents.send('translate:trigger', { text: 'QUEUED_OLD', ts: Date.now() })
    await wait(() => delayedConfigStarted, 'old trigger config refresh pending')
    await popup.webContents.executeJavaScript("document.querySelector('.src-text').textContent='NEWER'; document.querySelector('.src-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
    await wait(() => popup.webContents.executeJavaScript("document.querySelector('.dst-text')?.textContent==='TRANSLATED NEWER'"), 'new edit while old trigger initializes')
    await delay(400)
    assert.equal(await popup.webContents.executeJavaScript("document.querySelector('.dst-text')?.textContent"), 'TRANSLATED NEWER')
    const afterQueuedTrigger = await popup.webContents.executeJavaScript('window.api.loadHistory()')
    assert.deepEqual(afterQueuedTrigger.map(item => item.src), ['NEWER'])
    await popup.webContents.executeJavaScript('window.api.clearHistory()')
    popup.webContents.send('translate:trigger', { text: 'A', ts: Date.now() })
    await wait(() => requests.includes('A'), 'slow A request')
    await popup.webContents.executeJavaScript("document.querySelector('.src-text').textContent='B'; document.querySelector('.src-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
    await wait(() => popup.webContents.executeJavaScript("document.querySelector('.dst-text')?.textContent==='TRANSLATED B'"), 'edited B result')
    await delay(850)
    assert.equal(await popup.webContents.executeJavaScript("document.querySelector('.dst-text')?.textContent"), 'TRANSLATED B')
    const afterOverlap = await popup.webContents.executeJavaScript('window.api.loadHistory()')
    assert.deepEqual(afterOverlap.map(item => item.src), ['B'])
    popup.webContents.send('translate:trigger', { text: 'FAIL', ts: Date.now() })
    await wait(() => popup.webContents.executeJavaScript("!!document.querySelector('.error-bar')"), 'current failure')
    await popup.webContents.executeJavaScript("document.querySelector('.error-bar button').click()")
    await wait(() => popup.webContents.executeJavaScript("document.querySelector('.dst-text')?.textContent==='TRANSLATED FAIL'"), 'retry result')
    const history = await popup.webContents.executeJavaScript('window.api.loadHistory()')
    assert.deepEqual(history.map(item => item.src), ['FAIL', 'B'])
    const screenshot = await popup.capturePage()
    fs.writeFileSync(path.join(output, 'popup.png'), screenshot.toPNG())
    const result = { pass: true, queuedTriggerHistory: afterQueuedTrigger.map(item => item.src), overlapVisible: 'TRANSLATED B', overlapHistory: afterOverlap.map(item => item.src), retryVisible: 'TRANSLATED FAIL', finalHistory: history.map(item => item.src), requests, abortAttempts, windows: electron.BrowserWindow.getAllWindows().length }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
    electron.app.isQuiting = true
    electron.app.quit()
  } catch (error) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: false, error: error.stack, requests }, null, 2))
    console.error(error)
    electron.app.exit(1)
  }
})
