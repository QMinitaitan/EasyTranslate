const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const root = process.env.EASY_SESSION_TEST_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_SESSION_TEST_OUTPUT
if (!output) throw new Error('EASY_SESSION_TEST_OUTPUT requires an isolated fixture directory')
const electron = require('electron')
electron.app.setPath('userData', path.join(output, 'userData'))
const deadline = setTimeout(() => electron.app.exit(1), 25000)
electron.app.on('will-quit', () => clearTimeout(deadline))
// This is controlled DOM/IPC evidence: no window, focus or system clipboard interaction.
electron.app.on('browser-window-created', (_event, window) => {
  window.show = () => {}
  window.focus = () => {}
  window.webContents.setBackgroundThrottling(false)
})
const copied = []
electron.clipboard.writeText = value => copied.push(value)
const actions = {}
electron.globalShortcut.register = (key, callback) => { actions[key] = callback; return true }
require(path.join(root, 'electron/selection.cjs')).getSelection = async () => ({ text: '', source: 'controlled-selection' })
const historyPath = path.join(output, '.translate-app.history.json')
const legacy = { id: 'legacy-id', src: 'LEGACY', dst: 'preserved translation', engine: 'DeepSeek', color: '#6366f1', lang: 'English', ts: Date.now() - 5000, favorite: true, custom: { preserved: true } }
fs.writeFileSync(historyPath, JSON.stringify([legacy]))
const originalWrite = fs.promises.writeFile.bind(fs.promises)
const originalRename = fs.promises.rename.bind(fs.promises)
let writeMode = 'hold', releaseWrite, waitingWrite = false
fs.promises.writeFile = async (file, ...args) => {
  if (String(file).startsWith(historyPath + '.') && writeMode === 'hold') {
    waitingWrite = true
    await new Promise(resolve => { releaseWrite = resolve })
  }
  return originalWrite(file, ...args)
}
fs.promises.rename = async (from, to) => {
  if (to === historyPath && writeMode === 'fail') throw new Error('controlled atomic replacement failure')
  return originalRename(from, to)
}
const responses = []
const originalHandle = electron.ipcMain.handle.bind(electron.ipcMain)
electron.ipcMain.handle = (channel, handler) => originalHandle(channel, async (...args) => {
  const result = await handler(...args)
  if (channel === 'translate:do') responses.push(result)
  return result
})
require('node:https').request = (_url, _options, callback) => {
  const request = new EventEmitter()
  let body = ''
  request.write = chunk => { body += chunk }
  request.destroy = () => request
  request.end = () => setTimeout(() => {
    const input = JSON.parse(body).messages[1].content
    const response = new PassThrough()
    response.statusCode = 200
    callback(response)
    response.end(JSON.stringify({ choices: [{ message: { content: `${input} translated` } }] }))
  }, 20)
  return request
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(check, label) {
  const started = Date.now()
  while (Date.now() - started < 6000) {
    try { if (await check()) return } catch {}
    await delay(15)
  }
  throw new Error(`Timed out: ${label}`)
}
require(path.resolve(root, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main))
electron.app.whenReady().then(async () => {
  try {
    await wait(() => actions['Alt+Q'], 'shortcut registration')
    const main = electron.BrowserWindow.getAllWindows()[0]
    const evaluate = (window, script) => window.webContents.executeJavaScript(script)
    await wait(() => evaluate(main, "document.querySelector('.h-src')?.textContent==='LEGACY'"), 'legacy history in Home')
    const mirror = new electron.BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false } })
    await mirror.loadFile(path.join(root, 'dist/index.html'))
    await wait(() => evaluate(mirror, "document.querySelector('.h-src')?.textContent==='LEGACY'"), 'second subscribed Home')
    await actions['Alt+Q']()
    let popup
    await wait(() => {
      popup = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/popup'))
      return popup && !popup.webContents.isLoading()
    }, 'popup document')
    await wait(() => evaluate(popup, "!!document.querySelector('.popup-body')"), 'mounted popup')
    await delay(150)
    const trigger = source => popup.webContents.send('translate:trigger', { text: source, ts: Date.now() })
    const displayed = () => evaluate(popup, "document.querySelector('.dst-text')?.textContent")
    const sources = window => evaluate(window, "[...document.querySelectorAll('.h-src')].map(item=>item.textContent)")
    const clickAction = (window, source, title) => evaluate(window, `[...document.querySelectorAll('.history-item')].find(item=>item.querySelector('.h-src').textContent===${JSON.stringify(source)}).querySelector('button[title=${JSON.stringify(title)}]').click()`)
    trigger('FAIL')
    await wait(async () => await displayed() === 'FAIL translated' && waitingWrite, 'single result before durable save')
    assert.equal(responses.length, 0, 'IPC completion must still be awaiting the held durable write')
    assert.deepEqual(await sources(main), ['LEGACY'])
    const beforePersistence = { text: await displayed(), ipcCompleted: false, historySources: await sources(main) }
    writeMode = 'fail'
    releaseWrite()
    await wait(() => evaluate(popup, "!!document.querySelector('.save-warning') && !!document.querySelector('.history-save-error')"), 'popup save failure feedback')
    await wait(() => evaluate(main, "!!document.querySelector('.history-save-error')"), 'main save failure feedback')
    assert.equal(responses[0].historyId, undefined)
    assert.match(responses[0].historyError, /历史保存失败/)
    assert.deepEqual(JSON.parse(fs.readFileSync(historyPath, 'utf8')), [legacy])
    assert.deepEqual(await sources(mirror), ['LEGACY'])
    // Exercise the real copy IPC, intercepted before it can access the physical clipboard.
    await evaluate(popup, "document.querySelector('button[title=\"复制译文\"]').click()")
    await wait(() => copied.includes('FAIL translated'), 'copyable successful translation after failed save')
    writeMode = 'pass'
    trigger('SAVED')
    await wait(async () => (await sources(main)).includes('SAVED') && (await sources(mirror)).includes('SAVED'), 'durable translation reaches both Homes')
    await wait(() => evaluate(popup, "!document.querySelector('.history-save-error')"), 'durable retry clears global failure')
    const saved = JSON.parse(fs.readFileSync(historyPath, 'utf8')).find(item => item.src === 'SAVED')
    assert.ok(saved.id)
    assert.deepEqual(JSON.parse(fs.readFileSync(historyPath, 'utf8')).find(item => item.id === 'legacy-id'), legacy)
    await clickAction(main, 'SAVED', '收藏')
    await wait(() => evaluate(mirror, "[...document.querySelectorAll('.history-item')].find(item=>item.querySelector('.h-src').textContent==='SAVED').querySelector('.favorite')!==null"), 'favorite reaches second subscriber')
    assert.equal(JSON.parse(fs.readFileSync(historyPath, 'utf8')).find(item => item.id === saved.id).favorite, true)
    writeMode = 'fail'
    await clickAction(main, 'SAVED', '取消收藏')
    await wait(() => evaluate(main, "!!document.querySelector('.history-error')"), 'favorite failure is visible locally')
    assert.equal(JSON.parse(fs.readFileSync(historyPath, 'utf8')).find(item => item.id === saved.id).favorite, true)
    assert.equal(await evaluate(mirror, "!!document.querySelector('.favorite')"), true)
    writeMode = 'pass'
    await clickAction(main, 'SAVED', '取消收藏')
    await wait(() => evaluate(mirror, "[...document.querySelectorAll('.history-item')].find(item=>item.querySelector('.h-src').textContent==='SAVED').querySelector('.favorite')===null"), 'unfavorite reaches second subscriber')
    await clickAction(main, 'SAVED', '删除')
    await wait(async () => !(await sources(mirror)).includes('SAVED'), 'delete reaches second subscriber')
    await evaluate(main, "document.querySelector('.toolbar .btn-ghost').click()")
    await wait(() => evaluate(main, "!!document.querySelector('.confirm-actions .btn-danger')"), 'clear confirmation')
    await evaluate(main, "document.querySelector('.confirm-actions .btn-danger').click()")
    await wait(async () => !(await sources(main)).length && !(await sources(mirror)).length, 'clear reaches both subscribers')
    assert.deepEqual(JSON.parse(fs.readFileSync(historyPath, 'utf8')), [])
    assert.deepEqual(fs.readdirSync(output).filter(name => name.endsWith('.tmp')), [])
    assert.ok(electron.BrowserWindow.getAllWindows().every(window => !window.isVisible()))
    const result = { pass: true, controlledHiddenDom: true, physicalClipboardUsed: false, beforePersistence, failedSave: { translation: responses[0].text, historyId: responses[0].historyId ?? null, historyError: responses[0].historyError }, legacyIdAndCustomFieldPreserved: true, subscribers: 2, verified: ['translation', 'save failure', 'copy IPC', 'retry', 'favorite', 'failed unfavorite', 'unfavorite', 'delete', 'clear'], windowsStayedHidden: true }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
    electron.app.isQuiting = true
    electron.app.quit()
  } catch (error) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: false, error: error.stack }, null, 2))
    console.error(error)
    electron.app.exit(1)
  }
})
