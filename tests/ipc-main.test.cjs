const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')

async function withMain(run, { history = [], request } = {}) {
  const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-ipc-'))
  const originalHome = process.env.HOME
  const originalProfile = process.env.USERPROFILE
  const originalLoad = Module._load
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const handles = new Map()
  const events = new Map()
  const windows = []
  const notifications = []
  const appEvents = new Map()
  let quitCount = 0
  let ready
  class Window extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.webContents = new EventEmitter()
      this.webContents.send = (channel, payload) => notifications.push({ channel, payload })
      this.webContents.isDestroyed = () => false
      windows.push(this)
    }
    loadFile() {}
    show() { this.shown = true }
    focus() {}
    setIcon() {}
    isDestroyed() { return false }
    static getAllWindows() { return windows }
  }
  const electron = {
    app: {
      setName() {}, setAppUserModelId() {}, on: (name, callback) => appEvents.set(name, callback),
      quit: () => { quitCount++ },
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
    if (name === 'node:https' && request) return { ...originalLoad.call(this, name, parent, isMain), request }
    return name === 'electron' ? electron : originalLoad.call(this, name, parent, isMain)
  }
  fs.writeFileSync(path.join(temporaryHome, '.translate-app.history.json'), JSON.stringify(history))
  const mainPath = require.resolve('../dist-electron/main.cjs')
  delete require.cache[mainPath]
  // Config/history capture the isolated home on require, never the developer's credentials.
  delete require.cache[require.resolve('../dist-electron/config-store.cjs')]
  delete require.cache[require.resolve('../dist-electron/history-store.cjs')]
  // Bind the real adapter to this fixture's external transport before importing main.
  delete require.cache[require.resolve('../dist-electron/provider-service.cjs')]
  try {
    require(mainPath)
    await ready()
    return await run({ handles, events, windows, notifications, appEvents, quitCount: () => quitCount })
  } finally {
    delete require.cache[require.resolve('../dist-electron/provider-service.cjs')]
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

test('engine IPC validates untyped drafts and reports unsupported probes without transport', async () => {
  await withMain(async ({ handles }) => {
    const capabilities = handles.get('providers:capabilities')
    const probe = handles.get('providers:probe')
    assert.throws(() => capabilities({}, { openai: { enabled: 'yes' } }), /无效的引擎配置/)
    assert.throws(() => probe({}, { providerId: 42 }), /无效的引擎探测请求/)
    const result = await probe({}, { providerId: 'youdao', config: { enabled: true, apiKey: 'synthetic-key' } })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'unsupported')
    assert.doesNotMatch(JSON.stringify(result), /synthetic-key/)
  })
})

test('history IPC awaits durable mutations and consistently notifies all existing windows', async () => {
  await withMain(async ({ handles, windows, notifications }) => {
    new windows[0].constructor({})
    const save = handles.get('history:favorite:set')
    const entry = await save({}, 'old', true)
    assert.equal(entry.favorite, true)
    assert.equal(notifications.filter(item => item.channel === 'history:updated').length, 2)
    await handles.get('history:favorite:set')({}, entry.id, false)
    assert.equal(handles.get('history:load')({})[0].favorite, false)
    await handles.get('history:delete')({}, entry.id)
    await handles.get('history:clear')({})
    assert.deepEqual(handles.get('history:load')({}), [])
    assert.equal(notifications.filter(item => item.channel === 'history:updated').length, 8)
    await assert.rejects(save({}, 'second', 'yes'), /无效的收藏更新/)
  }, { history: ['old', 'second'].map(id => ({ id, src: id, dst: 'translation', engine: 'DeepSeek', color: '#6366f1', lang: 'English', ts: 100, favorite: false })) })
})

test('native quit waits for its registered renderer save acknowledgement and refuses new translation work', async () => {
  await withMain(async ({ handles, events, windows, notifications, appEvents, quitCount }) => {
    const sender = windows[0].webContents
    events.get('app:flush:register')({ sender }, true)
    appEvents.get('before-quit')({ preventDefault() {} })
    const request = notifications.find(item => item.channel === 'app:before-quit')
    assert.equal(quitCount(), 0)
    await assert.rejects(handles.get('translate:do')({ sender }, { text: 'new' }), /正在退出/)
    assert.throws(() => handles.get('app:flush:done')({ sender }, 'wrong-token', true), /无效/)
    await handles.get('config:save')({}, { launchToTray: false })
    handles.get('app:flush:done')({ sender }, request.payload, true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(quitCount(), 1)
    assert.equal(handles.get('config:load')({}).launchToTray, false)
  })
})

test('failed renderer save aborts native quit and a later acknowledged retry can quit', async () => {
  await withMain(async ({ handles, events, windows, notifications, appEvents, quitCount }) => {
    const sender = windows[0].webContents
    events.get('app:flush:register')({ sender }, true)
    const start = () => appEvents.get('before-quit')({ preventDefault() {} })
    start()
    handles.get('app:flush:done')({ sender }, notifications.findLast(item => item.channel === 'app:before-quit').payload, false)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(quitCount(), 0)
    assert.ok(notifications.some(item => item.channel === 'config:save:error'))
    assert.equal(windows[0].shown, true)
    const result = await handles.get('translate:do')({ sender }, { text: '' })
    assert.equal(result.stale, undefined)
    start()
    handles.get('app:flush:done')({ sender }, notifications.findLast(item => item.channel === 'app:before-quit').payload, true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(quitCount(), 1)
  })
})

test('untyped clipboard and history payloads are rejected without coercing them', async () => {
  await withMain(async ({ handles }) => {
    assert.throws(() => handles.get('clipboard:write')({}, { text: 'object' }), /无效/)
    await assert.rejects(handles.get('history:favorite:set')({}, {}, true), /无效/)
    await assert.rejects(handles.get('history:favorite:set')({}, 'old', 'false'), /无效/)
    assert.throws(() => handles.get('history:delete')({}, NaN), /无效/)
  })
})

test('single and race IPC apply the same saved preset while DeepL retains its translation protocol configuration', async () => {
  const calls = []
  const request = (url, _options, callback) => {
    const req = new EventEmitter()
    const call = { url: String(url), body: null }
    calls.push(call)
    req.write = value => { call.body = JSON.parse(value) }
    req.destroy = () => {}
    req.end = () => queueMicrotask(() => {
      const response = new PassThrough()
      response.statusCode = 200
      callback(response)
      response.end(JSON.stringify(url.pathname === '/v2/translate'
        ? { translations: [{ text: 'SYNTHETIC RESULT' }] }
        : { choices: [{ message: { content: 'SYNTHETIC RESULT' } }] }))
    })
    return req
  }
  await withMain(async ({ handles, events, windows, notifications }) => {
    const defaults = handles.get('prompts:defaults')({})
    assert.equal(Object.keys(defaults).length, 3)
    await handles.get('config:save')({}, {
      selectedPromptPreset: 'concise',
      promptPresets: { concise: { ...defaults.concise, prompt: 'SYNTHETIC SHARED {{target}}' } },
      providers: {
        deepseek: { enabled: true, apiKey: 'synthetic-key', prompt: 'SYNTHETIC LEGACY' },
        openai: { enabled: true, apiKey: 'synthetic-key', prompt: 'SYNTHETIC OTHER LEGACY' },
        deepl: { enabled: true, apiKey: 'synthetic-key' }
      }
    })
    const sender = windows[0].webContents
    const single = await handles.get('translate:do')({ sender }, { text: 'SYNTHETIC SOURCE', target: 'English', providerId: 'deepseek', requestId: 'single-preset' })
    assert.equal(single.text, 'SYNTHETIC RESULT')
    assert.equal(calls[0].url, 'https://api.deepseek.com/v1/chat/completions')
    assert.equal(calls[0].body.model, 'deepseek-v4-flash')
    await events.get('translate:race:start')({ sender }, { text: 'SYNTHETIC SOURCE', target: 'English', promptPresetId: 'concise', requestId: 'race-preset' })
    assert.equal(calls.length, 4)
    for (const call of calls.filter(call => call.body.messages)) assert.deepEqual(call.body.messages, [
      { role: 'system', content: 'SYNTHETIC SHARED English' },
      { role: 'user', content: 'SYNTHETIC SOURCE' }
    ])
    const deepl = calls.find(call => call.url === 'https://api-free.deepl.com/v2/translate')
    assert.deepEqual(deepl.body, { text: ['SYNTHETIC SOURCE'], target_lang: 'EN' })
    const race = notifications.findLast(event => event.channel === 'translate:race:done').payload
    assert.equal(race.results.length, 3)
    assert.ok(race.results.every(result => result.text === 'SYNTHETIC RESULT' && !result.error))
    const failed = await handles.get('translate:do')({ sender }, { text: 'SYNTHETIC SOURCE', promptPresetId: 'missing' })
    assert.match(failed.error, /预设不存在/)
    await events.get('translate:race:start')({ sender }, { text: 'SYNTHETIC SOURCE', promptPresetId: 'missing', requestId: 'bad-preset' })
    assert.match(notifications.at(-1).payload.error, /预设不存在/)
    assert.equal(calls.length, 4)
    events.get('settings:open')({ sender }, '/settings/prompts')
    assert.deepEqual(notifications.at(-1), { channel: 'main:navigate', payload: '/settings/prompts' })
  }, { request })
})
