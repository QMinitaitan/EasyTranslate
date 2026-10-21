// Real startup policy regression: isolated profile, no clipboard or provider calls.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { app, BrowserWindow, ipcMain } = require('electron')
const root = process.env.EASY_STARTUP_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_STARTUP_OUTPUT
const mode = process.env.EASY_STARTUP_MODE
const cases = {
  tray: { launchToTray: true, visible: false },
  normal: { launchToTray: false, visible: true },
  'force-show': { launchToTray: true, visible: true },
  'force-hidden': { launchToTray: false, visible: false }
}
const expected = cases[mode]
if (!output || !expected) throw new Error('An isolated startup output and known mode are required')
process.env.HOME = output
process.env.USERPROFILE = output
app.setPath('userData', path.join(output, 'userData'))
fs.writeFileSync(path.join(output, '.translate-app.config.json'), JSON.stringify({ launchToTray: expected.launchToTray }))
fs.writeFileSync(path.join(output, '.translate-app.history.json'), JSON.stringify([{ id: 'startup-history', src: 'STARTUP_HISTORY', dst: 'startup translation', engine: 'OpenAI', ts: 1, favorite: false }]))
let main
let popupInitialized = false
let mainShows = 0
let mainFocuses = 0
app.on('browser-window-created', (_event, win) => {
  if (!main) {
    main = win
    win.on('show', () => { mainShows++ })
    win.on('focus', () => { mainFocuses++ })
  }
})
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  const result = await listener(...args)
  if (channel === 'popup:ready') popupInitialized = true
  return result
})
require('node:https').request = () => { throw new Error('Startup validation must not use provider transport') }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(check, label) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(20)
  }
  throw new Error(`Startup did not reach ${label}`)
}
const deadline = setTimeout(() => app.exit(1), 8000)
app.on('will-quit', () => clearTimeout(deadline))
require(path.join(root, require(path.join(root, 'package.json')).main))
app.whenReady().then(async () => {
  try {
    await wait(() => popupInitialized, 'application-ready popup')
    if (expected.visible) await wait(() => main.isVisible(), 'initial visible main window')
    else await delay(100)
    const initialVisibility = await main.webContents.executeJavaScript('document.visibilityState')
    assert.equal(main.isVisible(), expected.visible)
    assert.equal(initialVisibility, expected.visible ? 'visible' : 'hidden')
    const initial = { visible: main.isVisible(), visibility: initialVisibility, shows: mainShows, focuses: mainFocuses }
    if (!expected.visible) {
      assert.equal(mainShows, 0)
      assert.equal(mainFocuses, 0)
      const popup = BrowserWindow.getAllWindows().find(win => win !== main)
      await popup.webContents.executeJavaScript('window.api.openMain()')
      await wait(() => main.isVisible(), 'later open-main action')
    }
    await wait(() => main.webContents.executeJavaScript("document.querySelector('.h-src')?.textContent === 'STARTUP_HISTORY'"), 'visible history')
    assert.equal(await main.webContents.executeJavaScript('document.visibilityState'), 'visible')
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: true, mode, initial, laterVisible: main.isVisible(), historyVisible: true, popupApplicationReady: true }, null, 2))
    app.isQuiting = true
    app.quit()
  } catch (error) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: false, mode, error: error.stack }, null, 2))
    app.exit(1)
  }
})
