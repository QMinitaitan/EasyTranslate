throw new Error('Historical native validation is disabled; see docs/validation/NATIVE-VALIDATION.md')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const electron = require('electron')
const root = process.env.EASY_QUIT_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_QUIT_OUTPUT
const stage = process.env.EASY_QUIT_STAGE
const mode = process.env.EASY_QUIT_MODE || 'app'
const setting = process.env.EASY_QUIT_SETTING || 'general'
const fault = process.env.EASY_QUIT_FAULT || 'none'
if (!output || !['edit', 'verify'].includes(stage)) throw new Error('An isolated quit fixture output/stage is required')
electron.app.setPath('userData', path.join(output, 'userData'))
const deadline = setTimeout(() => electron.app.exit(1), 15000)
let quitRequestedAt
let abortedQuit
let selectionCleanup = false
let releaseSelection
let triggerCount = 0
electron.app.on('will-quit', () => {
  clearTimeout(deadline)
  const captureSafe = setting !== 'capture' || stage !== 'edit' || selectionCleanup
  fs.writeFileSync(path.join(output, `exit-${stage}.json`), JSON.stringify({ naturalExit: captureSafe, elapsedMs: quitRequestedAt === undefined ? null : performance.now() - quitRequestedAt, ...(setting === 'capture' ? { selectionCleanup, triggerCount } : {}) }))
  if (!captureSafe) electron.app.exit(1)
})
electron.app.on('browser-window-created', (_event, window) => {
  window.show = () => { window.testShowCount = (window.testShowCount || 0) + 1 }
  window.focus = () => {}
  window.webContents.setBackgroundThrottling(false)
  const send = window.webContents.send.bind(window.webContents)
  window.webContents.send = (channel, ...args) => { if (channel === 'translate:trigger') triggerCount++; return send(channel, ...args) }
})
const actions = {}
electron.globalShortcut.register = (key, callback) => { actions[key] = callback; return true }
if (setting === 'capture' && stage === 'edit') {
  require(path.join(root, 'electron/selection.cjs')).getSelection = async () => {
    await new Promise(resolve => { releaseSelection = resolve })
    selectionCleanup = true
    return { text: 'controlled captured selection', source: 'controlled-cleanup' }
  }
}
let failWrites = stage === 'edit' && fault === 'disk'
const rename = fs.promises.rename.bind(fs.promises)
fs.promises.rename = async (from, to) => {
  if (failWrites && to === path.join(output, '.translate-app.config.json')) throw new Error('controlled config atomic replacement failure')
  return rename(from, to)
}
if (stage === 'edit' && fault === 'timeout') {
  // Drop one acknowledgement at the IPC boundary to model an unresponsive participant.
  const handle = electron.ipcMain.handle.bind(electron.ipcMain)
  let dropOnce = true
  electron.ipcMain.handle = (channel, callback) => handle(channel, (...args) => {
    if (channel === 'app:flush:done' && dropOnce) { dropOnce = false; return }
    return callback(...args)
  })
}
const entry = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main
try { require(path.resolve(root, entry)) }
catch (error) {
  fs.writeFileSync(path.join(output, 'setup-failure.json'), JSON.stringify({ setupFailure: true, error: error.stack }, null, 2))
  electron.app.exit(1)
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(check, label) {
  const started = Date.now()
  while (Date.now() - started < 6000) {
    try { if (await check()) return } catch {}
    await delay(10)
  }
  throw new Error(`Timed out: ${label}`)
}
electron.app.whenReady().then(async () => {
  try {
    if (setting === 'startup' && stage === 'edit') {
      const loadingWindow = electron.BrowserWindow.getAllWindows().some(window => window.webContents.isLoading())
      fs.writeFileSync(path.join(output, 'edit.json'), JSON.stringify({ mode, setting, loadingWindow }))
      quitRequestedAt = performance.now()
      electron.app.quit()
      return
    }
    let main
    await wait(() => {
      main = electron.BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('/popup'))
      return main && !main.webContents.isLoading()
    }, 'main document')
    const evaluate = script => main.webContents.executeJavaScript(script)
    await wait(() => evaluate('!!window.api'), 'preload')
    if (stage === 'edit') {
      if (setting === 'capture') {
        await wait(() => actions['Alt+Q'], 'registered selection trigger')
        const capture = actions['Alt+Q']()
        await wait(() => releaseSelection, 'selection in progress')
        quitRequestedAt = performance.now()
        setTimeout(() => releaseSelection(), 200)
        electron.app.quit()
        await capture
        assert.equal(triggerCount, 0, 'quit must finish capture cleanup without showing a delayed popup')
        return
      }
      await evaluate(`window.location.hash='#/settings/${setting === 'shortcut' ? 'shortcut' : setting}'`)
      let edited
      if (setting === 'general') {
        await wait(() => evaluate("[...document.querySelectorAll('.setting-row')].some(row=>row.textContent.includes('启动到托盘'))"), 'actual General view')
        edited = await evaluate(`(() => {
          const checkbox = [...document.querySelectorAll('.setting-row')].find(row=>row.textContent.includes('启动到托盘')).querySelector('input')
          checkbox.checked = false
          checkbox.dispatchEvent(new Event('change', { bubbles: true }))
          return { requested: checkbox.checked, at: performance.now() }
        })()`)
      } else if (setting === 'api') {
        await wait(() => evaluate("[...document.querySelectorAll('.setting-row')].some(row=>row.textContent.includes('DeepSeek'))"), 'actual API view')
        await evaluate("[...document.querySelectorAll('.setting-row')].find(row=>row.textContent.includes('DeepSeek')).click()")
        await wait(() => evaluate("!!document.querySelector('.setting-expand')"), 'expanded provider')
        edited = await evaluate(`(() => {
          const input = [...document.querySelectorAll('.setting-expand .field')].find(field=>field.querySelector('label')?.textContent==='模型').querySelector('input')
          input.value = 'quit-fixture-model'
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return { requested: input.value, at: performance.now() }
        })()`)
      } else {
        await wait(() => evaluate("!!document.querySelector('.sc-row button[title=\"清除\"]')"), 'actual Shortcut view')
        edited = await evaluate(`(() => {
          document.querySelector('.sc-row button[title="清除"]').click()
          return { requested: '', at: performance.now() }
        })()`)
      }
      // Public reads yield to Vue's watcher without waiting out its debounce.
      const before = await evaluate('window.api.loadConfig()')
      const elapsedMs = await evaluate('performance.now()') - edited.at
      fs.writeFileSync(path.join(output, 'edit.json'), JSON.stringify({ mode, setting, edited, before: setting === 'general' ? before.launchToTray : setting === 'api' ? before.providers.deepseek.model : before.shortcuts.translate, quitBeforeDebounceMs: elapsedMs, controlledHiddenDom: true }))
      quitRequestedAt = performance.now()
      if (mode === 'close') main.close()
      else electron.app.quit()
      if (fault !== 'none') {
        await wait(() => evaluate("document.querySelector('.config-save-error')?.textContent.includes('退出前未能保存')"), 'failed or timed out quit remains open with truthful feedback')
        assert.equal(main.isDestroyed(), false)
        // New work is allowed again after abort; no selection/network/clipboard is used.
        await wait(async () => {
          try { await evaluate("window.api.translate({text:''})"); return true } catch { return false }
        }, 'application usable after aborted quit')
        assert.ok(main.testShowCount > 0, 'an aborted quit must reveal the existing error window even when launched to tray')
        const durable = await evaluate('window.api.loadConfig()')
        abortedQuit = { fault, elapsedMs: performance.now() - quitRequestedAt, windowKeptOpen: true, errorWindowShowRequested: true, usable: true, durableBeforeRetry: durable.launchToTray }
        if (fault === 'disk') assert.equal(durable.launchToTray, true)
        fs.writeFileSync(path.join(output, 'aborted-quit.json'), JSON.stringify(abortedQuit, null, 2))
        failWrites = false
        // Repair storage and retry quit without dispatching another UI edit.
        quitRequestedAt = performance.now()
        if (mode === 'close') main.close()
        else electron.app.quit()
      }
    } else {
      const config = await evaluate('window.api.loadConfig()')
      const actual = setting === 'general' ? config.launchToTray : setting === 'api' ? config.providers.deepseek.model : config.shortcuts.translate
      const expected = setting === 'general' ? false : setting === 'api' ? 'quit-fixture-model' : ['capture', 'startup'].includes(setting) ? 'Alt+Q' : ''
      const result = { pass: actual === expected, mode, setting, fault, actual, expected, controlledHiddenDom: true }
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
      assert.equal(actual, expected, 'the actual Vue edit must survive immediate native quit and relaunch')
      electron.app.quit()
    }
  } catch (error) {
    fs.writeFileSync(path.join(output, `${stage}-failure.json`), JSON.stringify({ pass: false, error: error.stack }, null, 2))
    console.error(error)
    electron.app.exit(1)
  }
})
