const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const electron = require('electron')
const root = process.env.EASY_QUIT_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_QUIT_OUTPUT
const stage = process.env.EASY_QUIT_STAGE
const mode = process.env.EASY_QUIT_MODE || 'app'
if (!output || !['edit', 'verify'].includes(stage)) throw new Error('An isolated quit fixture output/stage is required')
electron.app.setPath('userData', path.join(output, 'userData'))
const deadline = setTimeout(() => electron.app.exit(1), 15000)
electron.app.on('will-quit', () => clearTimeout(deadline))
electron.app.on('browser-window-created', (_event, window) => {
  window.show = () => {}
  window.focus = () => {}
  window.webContents.setBackgroundThrottling(false)
})
electron.globalShortcut.register = () => true
const entry = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main
require(path.resolve(root, entry))
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
    let main
    await wait(() => {
      main = electron.BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('/popup'))
      return main && !main.webContents.isLoading()
    }, 'main document')
    const evaluate = script => main.webContents.executeJavaScript(script)
    await wait(() => evaluate('!!window.api'), 'preload')
    if (stage === 'edit') {
      await evaluate("window.location.hash='#/settings/general'")
      await wait(() => evaluate("[...document.querySelectorAll('.setting-row')].some(row=>row.textContent.includes('启动到托盘'))"), 'actual General view')
      const edited = await evaluate(`(() => {
        const checkbox = [...document.querySelectorAll('.setting-row')].find(row=>row.textContent.includes('启动到托盘')).querySelector('input')
        checkbox.checked = false
        checkbox.dispatchEvent(new Event('change', { bubbles: true }))
        return { requested: checkbox.checked, at: performance.now() }
      })()`)
      // A public read lets Vue's change/watch microtask run without waiting out its 120 ms debounce.
      const before = await evaluate('window.api.loadConfig()')
      fs.writeFileSync(path.join(output, 'edit.json'), JSON.stringify({ mode, edited, before: before.launchToTray, controlledHiddenDom: true }))
      if (mode === 'close') main.close()
      else electron.app.quit()
    } else {
      const config = await evaluate('window.api.loadConfig()')
      const result = { pass: config.launchToTray === false, mode, actual: config.launchToTray, expected: false, controlledHiddenDom: true }
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
      assert.equal(config.launchToTray, false, 'the actual Vue edit must survive immediate native quit and relaunch')
      electron.app.quit()
    }
  } catch (error) {
    fs.writeFileSync(path.join(output, `${stage}-failure.json`), JSON.stringify({ pass: false, error: error.stack }, null, 2))
    console.error(error)
    electron.app.exit(1)
  }
})
