const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

async function withMain(run) {
  const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-ipc-'))
  const originalHome = process.env.HOME
  const originalProfile = process.env.USERPROFILE
  const originalLoad = Module._load
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const handles = new Map()
  const events = new Map()
  const windows = []
  const notifications = []
  let ready
  class Window extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.webContents = new EventEmitter()
      this.webContents.send = (channel, payload) => notifications.push({ channel, payload })
      windows.push(this)
    }
    loadFile() {}
    setIcon() {}
    isDestroyed() { return false }
    static getAllWindows() { return windows }
  }
  const electron = {
    app: {
      setName() {}, setAppUserModelId() {}, on() {},
      commandLine: { appendSwitch() {} },
      whenReady: () => ({ then: (callback) => { ready = callback } })
    },
    BrowserWindow: Window,
    Menu: { setApplicationMenu() {}, buildFromTemplate: () => [] },
    ipcMain: { handle: (channel, handler) => handles.set(channel, handler), on: (channel, handler) => events.set(channel, handler) },
    globalShortcut: { unregisterAll() {}, register: () => true },
    Tray: class { setToolTip() {}; setContextMenu() {}; on() {} },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }
  }
  process.env.HOME = temporaryHome
  process.env.USERPROFILE = temporaryHome
  Object.defineProperty(process, 'platform', { value: 'win32' })
  Module._load = function (name, parent, isMain) {
    return name === 'electron' ? electron : originalLoad.call(this, name, parent, isMain)
  }
  const mainPath = require.resolve('../electron/main.cjs')
  delete require.cache[mainPath]
  // Config/history capture the isolated home on require, never the developer's credentials.
  delete require.cache[require.resolve('../electron/config.cjs')]
  delete require.cache[require.resolve('../dist-electron/config-store.cjs')]
  delete require.cache[require.resolve('../electron/history.cjs')]
  try {
    require(mainPath)
    await ready()
    return await run({ handles, events, windows, notifications })
  } finally {
    Module._load = originalLoad
    Object.defineProperty(process, 'platform', originalPlatform)
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalProfile
    fs.rmSync(temporaryHome, { recursive: true, force: true })
  }
}

test('main IPC returns a controlled error for untyped malformed translation input', async () => {
  await withMain(async ({ handles }) => {
    const translate = handles.get('translate:do')
    const result = await translate({}, null)
    assert.equal(result.error, '无效的翻译请求')
  })
})

test('main rejects malformed race requests without escaping the IPC handler', async () => {
  await withMain(async ({ events }) => {
    const responses = []
    const sender = { send: (channel, payload) => responses.push({ channel, payload }), isDestroyed: () => false }
    await events.get('translate:race:start')({ sender }, { text: 42, requestId: 'race-a' })
    assert.deepEqual(responses, [{ channel: 'translate:race:done', payload: { requestId: 'race-a', error: '无效的翻译请求' } }])
  })
})

test('settings IPC saves partial provider updates durably and notifies existing windows', async () => {
  await withMain(async ({ handles, notifications }) => {
    const save = handles.get('config:save')
    await save({}, { providers: { deepseek: { enabled: true, apiKey: 'synthetic-key' } } })
    await save({}, { providers: { deepseek: { model: 'model-d' } } })
    const loaded = await handles.get('config:load')({})
    assert.equal(loaded.providers.deepseek.apiKey, 'synthetic-key')
    assert.equal(loaded.providers.deepseek.model, 'model-d')
    assert.equal(notifications.filter(item => item.channel === 'config:updated').length, 2)
    await assert.rejects(save({}, { shortcuts: { translate: 1 } }), /无效的配置更新/)
  })
})
