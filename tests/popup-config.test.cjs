const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse, compileScript } = require('@vue/compiler-sfc')

const flush = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const metadata = [
  { id: 'deepseek', name: 'DeepSeek', color: '#123456' },
  { id: 'openai', name: 'OpenAI', color: '#654321' }
]
function popup() {
  const mounted = [], unmounted = [], updates = new Set(), raceProgress = new Set(), raceDone = new Set()
  const requests = [], history = []
  let config = { raceMode: false, providers: { deepseek: {}, openai: {} } }
  let capabilities = metadata.map(item => ({ id: item.id, available: true }))
  let loadConfig = () => Promise.resolve(structuredClone(config))
  const api = {
    isPopup: () => true,
    loadConfig: () => loadConfig(),
    listProviders: async () => metadata,
    providerCapabilities: async () => structuredClone(capabilities),
    onConfigUpdate: callback => { updates.add(callback); return () => updates.delete(callback) },
    triggerTranslate: () => () => {},
    popupReady: async () => ({ pinned: true }),
    popupNotReady() {}, cancelTranslation() {},
    onTranslationProgress: () => () => {},
    saveConfig: async () => true,
    onRaceProgress: callback => { raceProgress.add(callback); return () => raceProgress.delete(callback) },
    onRaceDone: callback => { raceDone.add(callback); return () => raceDone.delete(callback) },
    startRaceTranslate: request => { requests.push(request); history.push({ src: request.text, engine: 'deepseek' }) },
    translate: async request => {
      requests.push(request)
      history.push({ src: request.text, engine: request.providerId })
      return { requestId: request.requestId, text: 'SYNTHETIC RESULT', engine: request.providerId, ms: 5 }
    }
  }
  const filename = path.join(__dirname, '../src/views/Popup.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const script = compileScript(descriptor, { id: 'popup-config-regression' })
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports, setTimeout, clearTimeout,
    window: { api, localStorage: { getItem: () => null }, setTimeout },
    document: { addEventListener() {}, removeEventListener() {} },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted: callback => mounted.push(callback), onUnmounted: callback => unmounted.push(callback) }
      if (id === 'vue-router') return { useRoute: () => ({ query: { window: 'popup' } }) }
      if (id.endsWith('useTheme')) return { useTheme: () => ({ mode: vue.ref('light'), resolvedTheme: vue.ref('light'), toggleLightDark() {} }) }
      if (id.endsWith('useBrand')) return { setBrand() {} }
      if (id.endsWith('useSpeech')) return { useSpeech: () => ({ speaking: vue.ref(false), stop() {}, toggle() {} }) }
      if (id.endsWith('usePendingSettings')) return { trackSettingsSave: promise => promise }
      if (id === '../types') return { errorMessage: error => error.message }
      return {}
    }
  }, { filename })
  const view = exports.default.setup({}, { expose() {} })
  return {
    view, requests, history, updates,
    mount: async () => { await Promise.all(mounted.map(callback => callback())); await flush() },
    unmount: () => unmounted.forEach(callback => callback()),
    change(nextConfig, nextCapabilities) { config = nextConfig; capabilities = nextCapabilities; for (const update of updates) update() },
    notify: () => { for (const update of updates) update() },
    setLoader: loader => { loadConfig = loader },
    completeRace() {
      const requestId = requests.at(-1).requestId
      const result = { requestId, engine: 'deepseek', text: 'SYNTHETIC RACE RESULT', ms: 5 }
      for (const progress of raceProgress) progress(result)
      for (const done of raceDone) done({ requestId, best: result, results: [result] })
    }
  }
}

test('a pinned popup refreshes engine availability after settings save without altering edited result provenance or creating translation/history', async () => {
  const fixture = popup()
  await fixture.mount()
  const view = fixture.view
  view.srcEl.value = { textContent: 'SYNTHETIC SOURCE' }
  view.onSrcEdit()
  await flush()
  view.dstEl.value = { innerText: 'EDITED RESULT' }
  view.onDstEdit()
  view.srcEl.value.textContent = 'DRAFT SOURCE'
  assert.equal(view.pinned.value, true)
  assert.equal(fixture.updates.size, 1)
  fixture.change({ raceMode: true, providers: { deepseek: {}, openai: {} } }, [
    { id: 'deepseek', available: false }, { id: 'openai', available: true }
  ])
  await flush()
  assert.deepEqual(Array.from(view.engines.value, item => item.id), ['openai'])
  assert.equal(view.current.value, 'OpenAI')
  assert.equal(view.raceMode.value, true)
  assert.equal(view.engineLabel.value, 'DeepSeek')
  assert.equal(view.activeTranslation.value, 'EDITED RESULT')
  assert.equal(view.src.value, 'SYNTHETIC SOURCE')
  assert.equal(view.srcEl.value.textContent, 'DRAFT SOURCE')
  assert.equal(view.pinned.value, true)
  fixture.change({ raceMode: false, providers: { deepseek: {}, openai: {} } }, [
    { id: 'deepseek', available: true }, { id: 'openai', available: false }
  ])
  await flush()
  assert.deepEqual(Array.from(view.engines.value, item => item.id), ['deepseek'])
  assert.equal(view.activeTranslation.value, 'EDITED RESULT')
  assert.equal(fixture.requests.length, 1)
  assert.equal(fixture.history.length, 1)
  fixture.unmount()
})

for (const staleOutcome of ['success', 'failure']) {
  test(`a stale configuration ${staleOutcome} cannot roll back the latest engine choices`, async () => {
    const fixture = popup()
    await fixture.mount()
    const pending = deferred()
    fixture.setLoader(() => pending.promise)
    fixture.notify()
    await flush()
    fixture.setLoader(async () => ({ raceMode: false, providers: { openai: {} } }))
    fixture.change({}, [{ id: 'openai', available: true }])
    await flush()
    assert.deepEqual(Array.from(fixture.view.engines.value, item => item.id), ['openai'])
    if (staleOutcome === 'success') pending.resolve({ raceMode: true, providers: { deepseek: {} } })
    else pending.reject(new Error('synthetic old configuration failure'))
    await flush()
    assert.deepEqual(Array.from(fixture.view.engines.value, item => item.id), ['openai'])
    assert.equal(fixture.view.raceMode.value, false)
    assert.equal(fixture.requests.length, 0)
    assert.equal(fixture.history.length, 0)
    fixture.unmount()
  })
}

test('unmount releases the config listener and invalidates a refresh already in flight', async () => {
  const fixture = popup()
  await fixture.mount()
  const pending = deferred()
  fixture.setLoader(() => pending.promise)
  fixture.notify()
  await flush()
  fixture.unmount()
  assert.equal(fixture.updates.size, 0)
  pending.resolve({ raceMode: true, providers: {} })
  await flush()
  assert.deepEqual(Array.from(fixture.view.engines.value, item => item.id), ['deepseek', 'openai'])
  assert.equal(fixture.view.raceMode.value, false)
  assert.equal(fixture.requests.length, 0)
})

test('a burst of config notifications shares one capability refresh', async () => {
  const fixture = popup()
  await fixture.mount()
  let loads = 0
  fixture.setLoader(async () => { loads++; return { raceMode: false, providers: { openai: {} } } })
  fixture.notify()
  fixture.notify()
  fixture.notify()
  await flush()
  assert.equal(loads, 1)
  assert.deepEqual(Array.from(fixture.view.engines.value, item => item.id), ['openai'])
  fixture.unmount()
})

test('a settings mode change preserves a completed race result, its edit and actual engine', async () => {
  const fixture = popup()
  await fixture.mount()
  const view = fixture.view
  view.onEngineChange({ race: true })
  view.srcEl.value = { textContent: 'SYNTHETIC RACE SOURCE' }
  view.onSrcEdit()
  fixture.completeRace()
  view.dstEl.value = { innerText: 'EDITED RACE RESULT' }
  view.onDstEdit()
  fixture.change({ raceMode: false, providers: { openai: {} } }, [{ id: 'openai', available: true }])
  await flush()
  assert.equal(view.raceMode.value, false)
  assert.equal(view.activeTranslation.value, 'EDITED RACE RESULT')
  assert.equal(view.raceActive.value.engine, 'deepseek')
  assert.equal(view.engineLabel.value, 'DeepSeek')
  assert.equal(view.current.value, 'OpenAI')
  assert.equal(fixture.requests.length, 1)
  assert.equal(fixture.history.length, 1)
  fixture.unmount()
})

test('unmount before a queued notification refresh prevents another IPC read', async () => {
  const fixture = popup()
  await fixture.mount()
  let loads = 0
  fixture.setLoader(async () => { loads++; return {} })
  fixture.notify()
  fixture.unmount()
  await flush()
  assert.equal(loads, 0)
  assert.equal(fixture.updates.size, 0)
})
