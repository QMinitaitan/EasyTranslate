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

test('compiled preload translates old positional calls and typed requests through the same IPC contract', async () => {
  const { api, requests } = loadPreload()
  const oldResult = await api.translate('hello', '中文(简体)', 'deepseek')
  const newResult = await api.translate({ text: 'hello', target: '中文(简体)', providerId: 'deepseek' })

  assert.equal(oldResult.text, '你好')
  assert.equal(newResult.text, '你好')
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    { channel: 'translate:do', payload: { text: 'hello', target: '中文(简体)', providerId: 'deepseek' } },
    { channel: 'translate:do', payload: { text: 'hello', target: '中文(简体)', providerId: 'deepseek' } }
  ])
})

test('save failures expose the actionable message without Electron IPC implementation details', async () => {
  const { api, ipc } = loadPreload()
  ipc.invoke = async () => { throw new Error("Error invoking remote method 'config:save': Error: 配置保存失败，请重试") }
  await assert.rejects(api.saveConfig({ raceMode: false }), error => error.message === '配置保存失败，请重试')
})

test('compiled preload preserves race identity and subscriptions can be released', () => {
  const { api, ipc, requests } = loadPreload()
  const observed = []
  const off = api.onRaceProgress((result) => observed.push(result.text))
  api.startRaceTranslate('hello', '中文(简体)', 'old-race')
  api.startRaceTranslate({ text: 'world', target: '中文(简体)', requestId: 'typed-race' })
  ipc.emit('translate:race:progress', {}, { requestId: 'typed-race', text: '世界' })
  off()
  ipc.emit('translate:race:progress', {}, { requestId: 'typed-race', text: 'late' })

  assert.deepEqual(observed, ['世界'])
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
    { channel: 'translate:race:start', payload: { text: 'hello', target: '中文(简体)', requestId: 'old-race' } },
    { channel: 'translate:race:start', payload: { text: 'world', target: '中文(简体)', requestId: 'typed-race' } }
  ])
})
