throw new Error('Historical native validation is disabled; see docs/validation/NATIVE-VALIDATION.md')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { roleForModel } = require('./session-fixture.cjs')
const root = process.env.EASY_SESSION_TEST_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_SESSION_TEST_OUTPUT
if (!output) throw new Error('EASY_SESSION_TEST_OUTPUT requires an isolated fixture directory')
const electron = require('electron')
electron.app.setPath('userData', path.join(output, 'userData'))
const deadline = setTimeout(() => electron.app.exit(1), 20000)
electron.app.on('will-quit', () => clearTimeout(deadline))
// Controlled DOM/IPC smoke: never show/focus a window or compete with native measurement.
electron.app.on('browser-window-created', (_event, window) => {
  window.show = () => {}
  window.focus = () => {}
  window.webContents.setBackgroundThrottling(false)
})
const actions = {}
electron.globalShortcut.register = (shortcut, callback) => { actions[shortcut] = callback; return true }
require(path.join(root, 'electron/selection.cjs')).getSelection = async () => ({ text: '', source: 'controlled-selection' })
const history = require(path.join(root, 'dist-electron/history-store.cjs'))
const durableAdd = history.add
const queuedHistory = []
let holdRaceHistory = true
history.add = (entry, options) => {
  if (entry.src === 'RACE' && holdRaceHistory) return new Promise(resolve => queuedHistory.push(() => resolve(durableAdd(entry, options))))
  return durableAdd(entry, options)
}
const requests = []
let abortAttempts = 0
require('node:https').request = (_url, _options, callback) => {
  const request = new EventEmitter()
  let body = ''
  request.write = chunk => { body += chunk }
  request.destroy = () => { abortAttempts++; return request }
  request.end = () => {
    const data = JSON.parse(body)
    const record = { source: data.messages[1].content, engine: roleForModel(data.model), replied: false }
    record.reply = failed => {
      if (record.replied) return
      record.replied = true
      const response = new PassThrough()
      response.statusCode = failed ? 500 : 200
      callback(response)
      response.end(failed ? 'controlled late failure' : JSON.stringify({ choices: [{ message: { content: `${record.source} ${record.engine}` } }] }))
    }
    requests.push(record)
    if (record.source.startsWith('OLD_') || (record.source === 'RACE' && record.engine === 'slow')) return
    setTimeout(() => record.reply(false), record.engine === 'fast' ? 25 : 120)
  }
  return request
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(check, label) {
  const start = Date.now()
  while (Date.now() - start < 6000) {
    try { if (await check()) return } catch (_) {}
    await delay(15)
  }
  throw new Error(`Timed out: ${label}`)
}
require(path.resolve(root, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main))
electron.app.whenReady().then(async () => {
  try {
    await wait(() => actions['Alt+Q'], 'registered action')
    await actions['Alt+Q']()
    let popup
    await wait(() => {
      popup = electron.BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/popup'))
      return popup && !popup.webContents.isLoading()
    }, 'popup document')
    const evaluate = script => popup.webContents.executeJavaScript(script)
    const text = () => evaluate("document.querySelector('.dst-text')?.textContent")
    const loadHistory = () => evaluate('window.api.loadHistory()')
    const trigger = source => popup.webContents.send('translate:trigger', { text: source, ts: Date.now() })
    const edit = source => evaluate(`document.querySelector('.src-text').textContent=${JSON.stringify(source)}; document.querySelector('.src-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
    const chooseMode = async label => {
      await evaluate("document.querySelector('.es-trigger').click()")
      await wait(() => evaluate(`[...document.querySelectorAll('.es-item')].some(button=>button.textContent.includes(${JSON.stringify(label)}))`), 'engine panel render')
      await evaluate(`[...document.querySelectorAll('.es-item')].find(button=>button.textContent.includes(${JSON.stringify(label)})).click()`)
    }
    await wait(() => evaluate("!!document.querySelector('.popup-body')"), 'mounted Vue')
    await delay(150)
    trigger('RACE')
    await wait(async () => await text() === 'RACE fast', 'first race result')
    assert.equal(queuedHistory.length, 1)
    assert.equal(requests.find(record => record.source === 'RACE' && record.engine === 'slow').replied, false)
    assert.deepEqual(await loadHistory(), [])
    const beforeSaveAndSlow = { text: await text(), historyCount: 0, slowFinished: false }
    requests.find(record => record.source === 'RACE' && record.engine === 'slow').reply(false)
    await wait(() => evaluate("document.querySelector('.race-count')?.textContent==='1/2'"), 'later comparison result')
    await evaluate("document.querySelector('.race-cycle').click()")
    await wait(async () => await text() === 'RACE slow', 'cycle comparison')
    await evaluate("document.querySelector('.dst-text').innerText='EDITED SLOW'; document.querySelector('.dst-text').dispatchEvent(new Event('blur'))")
    await wait(async () => await text() === 'EDITED SLOW', 'edited comparison')
    holdRaceHistory = false
    queuedHistory.forEach(save => save())
    await wait(async () => (await loadHistory()).length === 1, 'one durable history')
    await delay(100)
    assert.equal(await text(), 'EDITED SLOW', 'completion must preserve the chosen comparison and its edit')
    const raceHistory = await loadHistory()
    assert.equal(raceHistory[0].engine, 'DeepSeek')

    await evaluate('window.api.clearHistory()')
    trigger('OLD_RACE')
    await wait(() => requests.filter(record => record.source === 'OLD_RACE').length === 2, 'old race started')
    await chooseMode('DeepSeek')
    await edit('SINGLE_CURRENT')
    await wait(async () => await text() === 'SINGLE_CURRENT fast', 'race replaced by single')
    requests.filter(record => record.source === 'OLD_RACE').forEach((record, index) => record.reply(index === 1))
    await delay(150)
    assert.equal(await text(), 'SINGLE_CURRENT fast')
    const raceToSingleHistory = await loadHistory()
    assert.deepEqual(raceToSingleHistory.map(item => item.src), ['SINGLE_CURRENT'])

    await evaluate('window.api.clearHistory()')
    trigger('OLD_SINGLE')
    await wait(() => requests.some(record => record.source === 'OLD_SINGLE'), 'old single started')
    await chooseMode('Race')
    await edit('RACE_CURRENT')
    await wait(async () => await text() === 'RACE_CURRENT fast', 'single replaced by race')
    await wait(() => evaluate("document.querySelector('.race-count')?.textContent==='1/2'"), 'current race fully comparable')
    requests.filter(record => record.source === 'OLD_SINGLE').forEach((record, index) => record.reply(index === 1))
    await delay(150)
    assert.equal(await text(), 'RACE_CURRENT fast')
    const singleToRaceHistory = await loadHistory()
    assert.deepEqual(singleToRaceHistory.map(item => item.src), ['RACE_CURRENT'])
    assert.ok(electron.BrowserWindow.getAllWindows().every(window => !window.isVisible()))
    // A never-shown renderer intentionally has no surface after hidden painting
    // is disabled. DOM assertions remain required; a screenshot is only an artifact.
    const screenshot = { captured: false, reason: '' }
    try {
      const image = await popup.capturePage(undefined, { stayHidden: true })
      if (!image.isEmpty()) {
        fs.writeFileSync(path.join(output, 'popup.png'), image.toPNG())
        screenshot.captured = true
      } else screenshot.reason = 'The hidden renderer has no painted surface'
    } catch (error) {
      if (error.message !== 'Current display surface not available for capture') throw error
      screenshot.reason = error.message
    }
    assert.ok(electron.BrowserWindow.getAllWindows().every(window => !window.isVisible()))
    const result = { pass: true, controlledHiddenDom: true, screenshot, beforeSaveAndSlow, chosenComparisonAfterDone: 'EDITED SLOW', raceHistoryCount: raceHistory.length, raceToSingleHistory: raceToSingleHistory.map(item => item.src), singleToRaceHistory: singleToRaceHistory.map(item => item.src), abortAttempts, windows: electron.BrowserWindow.getAllWindows().length, requests: requests.map(({ source, engine }) => ({ source, engine })) }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
    electron.app.quit()
  } catch (error) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: false, error: error.stack, requests: requests.map(({ source, engine }) => ({ source, engine })) }, null, 2))
    console.error(error)
    electron.app.exit(1)
  }
})
