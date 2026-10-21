// Native shutdown regression: no foreground or clipboard interaction.
const fs = require('node:fs')
const path = require('node:path')
const { app, ipcMain, BrowserWindow } = require('electron')
const root = process.env.EASY_QUIT_ROOT || path.resolve(__dirname, '../..')
const output = process.env.EASY_QUIT_OUTPUT
if (!output) throw new Error('EASY_QUIT_OUTPUT must name an isolated directory')
fs.mkdirSync(output, { recursive: true })
process.env.HOME = output
process.env.USERPROFILE = output
app.setPath('userData', path.join(output, 'userData'))
const stamp = (event, extra = {}) => fs.appendFileSync(path.join(output, 'events.jsonl'), JSON.stringify({ t: Date.now(), event, ...extra }) + '\n')
fs.writeFileSync(path.join(output, '.translate-app.config.json'), JSON.stringify({ launchToTray: true }))
let began = false
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  const result = await listener(...args)
  if (channel === 'popup:ready' && !began) {
    began = true
    setTimeout(() => {
      stamp('quit-request', { windows: BrowserWindow.getAllWindows().length })
      app.isQuiting = true
      app.quit()
    }, 250)
  }
  return result
})
app.on('browser-window-created', (_event, win) => {
  stamp('window-created', { id: win.id })
  win.on('closed', () => stamp('window-closed', { id: win.id }))
})
for (const event of ['before-quit', 'will-quit', 'quit']) app.on(event, () => stamp(event))
process.on('exit', code => stamp('process-exit', { code }))
require('node:https').request = () => { throw new Error('No translation transport is permitted in a shutdown test') }
require(path.join(root, require(path.join(root, 'package.json')).main))
