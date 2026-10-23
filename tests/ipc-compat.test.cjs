const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')

function loadPreload() {
  const ipc = new EventEmitter()
  const requests = []
  ipc.invoke = async (channel, payload) => {
    requests.push({ channel, payload })
    return { text: '你好', engine: 'deepseek', ms: 12 }
  }
  ipc.send = (channel, payload) => requests.push({ channel, payload })
  let api
  const compiled = fs.readFileSync(path.join(__dirname, '../dist-electron/preload.cjs'), 'utf8')
  vm.runInNewContext(compiled, {
    exports: {},
    process: { platform: 'win32' },
    window: { location: { hash: '#/popup?window=popup' } },
    require(name) {
      assert.equal(name, 'electron', 'sandboxed preload may only import Electron at runtime')
      return { ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_name, value) => { api = value } } }
    }
  })
  return { api, ipc, requests }
}

test('compiled preload translates a concrete typed request through the public IPC contract', async () => {
  const { api, requests } = loadPreload()
  const newResult = await api.translate({ text: 'hello', target: '中文(简体)', providerId: 'deepseek' })

  assert.equal(newResult.text, '你好')
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    { channel: 'translate:do', payload: { text: 'hello', target: '中文(简体)', providerId: 'deepseek' } }
  ])
})

test('save failures expose the actionable message without Electron IPC implementation details', async () => {
  const { api, ipc } = loadPreload()
  ipc.invoke = async () => { throw new Error("Error invoking remote method 'config:save': Error: 配置保存失败，请重试") }
  await assert.rejects(api.saveConfig({ raceMode: false }), error => error.message === '配置保存失败，请重试')
})

test('compiled preload exposes actual engine capability and probe operations with draft configuration', async () => {
  const { api, requests } = loadPreload()
  await api.providerCapabilities({ openai: { enabled: true, apiKey: 'synthetic-key' } })
  await api.testProvider('openai', { enabled: true, apiKey: 'synthetic-key' })
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    { channel: 'providers:capabilities', payload: { openai: { enabled: true, apiKey: 'synthetic-key' } } },
    { channel: 'providers:probe', payload: { providerId: 'openai', config: { enabled: true, apiKey: 'synthetic-key' } } }
  ])
})

test('compiled preload preserves race identity and subscriptions can be released', () => {
  const { api, ipc, requests } = loadPreload()
  const observed = []
  const off = api.onRaceProgress((result) => observed.push(result.text))
  api.startRaceTranslate({ text: 'world', target: '中文(简体)', requestId: 'typed-race' })
  ipc.emit('translate:race:progress', {}, { requestId: 'typed-race', text: '世界' })
  off()
  ipc.emit('translate:race:progress', {}, { requestId: 'typed-race', text: 'late' })

  assert.deepEqual(observed, ['世界'])
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    { channel: 'translate:race:start', payload: { text: 'world', target: '中文(简体)', requestId: 'typed-race' } }
  ])
})

test('single progress and history persistence errors retain identity and release listeners', () => {
  const { api, ipc } = loadPreload()
  const observed = []
  const offProgress = api.onTranslationProgress(result => observed.push(result.requestId))
  const offError = api.onHistorySaveError(message => observed.push(message))
  ipc.emit('translate:progress', {}, { requestId: 'current', text: 'visible before storage' })
  ipc.emit('history:save:error', {}, '历史保存失败')
  offProgress()
  offError()
  ipc.emit('translate:progress', {}, { requestId: 'late' })
  ipc.emit('history:save:error', {}, 'late')
  assert.deepEqual(observed, ['current', '历史保存失败'])
})

test('renderer save-drain participation has scoped registration and an explicit acknowledgement', async () => {
  const { api, ipc, requests } = loadPreload()
  const tokens = []
  const off = api.onBeforeQuit(token => tokens.push(token))
  ipc.emit('app:before-quit', {}, 'quit-current')
  await api.completeQuitFlush(tokens[0])
  off()
  ipc.emit('app:before-quit', {}, 'quit-late')
  assert.deepEqual(tokens, ['quit-current'])
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    { channel: 'app:flush:register', payload: true },
    { channel: 'app:flush:done', payload: 'quit-current' },
    { channel: 'app:flush:register', payload: false }
  ])
})
