const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createConfigStore } = require('../dist-electron/config-store.cjs')

function fixture(t, initial) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-config-'))
  const filePath = path.join(directory, 'config.json')
  if (initial) fs.writeFileSync(filePath, JSON.stringify(initial))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { filePath, store: createConfigStore({ filePath }) }
}

test('configuration preserves old credentials and defaults when a provider is updated partially', async (t) => {
  const { filePath, store } = fixture(t, {
    providers: { deepseek: { enabled: true, apiKey: 'synthetic-key', endpoint: 'https://example.invalid' } },
    shortcuts: { translate: 'Ctrl+Alt+Q' }, settingsOrder: { general: ['raceMode'] },
    theme: 'dark', customFutureSetting: { preserved: true }
  })
  assert.equal(store.load().shortcuts.show, 'Alt+E')
  await store.save({ providers: { deepseek: { model: 'model-b' } }, settingsOrder: { shortcuts: ['show'] } })
  const reopened = createConfigStore({ filePath }).load()
  assert.equal(reopened.providers.deepseek.apiKey, 'synthetic-key')
  assert.equal(reopened.providers.deepseek.endpoint, 'https://example.invalid')
  assert.equal(reopened.providers.deepseek.model, 'model-b')
  assert.deepEqual(reopened.settingsOrder, { general: ['raceMode'], shortcuts: ['show'] })
  assert.equal(reopened.theme, 'dark')
  assert.deepEqual(reopened.customFutureSetting, { preserved: true })
})

test('overlapping setting saves retain both changes and publish only durable state', async () => {
  let serialized = null
  let unblock
  let started
  const writing = new Promise(resolve => { started = resolve })
  const blocked = new Promise(resolve => { unblock = resolve })
  let firstWrite = true
  const storage = {
    read: () => serialized,
    async write(value) {
      if (firstWrite) { firstWrite = false; started(); await blocked }
      serialized = value
    }
  }
  const store = createConfigStore({ storage })
  const first = store.save({ target: 'English' })
  await writing
  const second = store.save({ uiLanguage: 'en' })
  assert.equal(store.load().target, '中文(简体)', 'pending data must not masquerade as saved settings')
  unblock()
  await Promise.all([first, second])
  const reopened = createConfigStore({ storage }).load()
  assert.equal(reopened.target, 'English')
  assert.equal(reopened.uiLanguage, 'en')
})

test('failed saves report a credential-safe error, retain durable settings, and allow a later retry', async () => {
  let serialized = JSON.stringify({ target: 'English', providers: { deepseek: { apiKey: 'synthetic-private-key', enabled: true } } })
  let fail = true
  const storage = {
    read: () => serialized,
    async write(value) {
      if (fail) throw new Error('permission denied: synthetic-private-key')
      serialized = value
    }
  }
  const store = createConfigStore({ storage })
  const updates = []
  const off = store.subscribe(config => updates.push(config.target))
  await assert.rejects(store.save({ target: '日本語' }), error => error.message.includes('配置保存失败') && !error.message.includes('synthetic-private-key'))
  assert.equal(store.load().target, 'English')
  assert.deepEqual(updates, [])
  fail = false
  await store.save({ uiLanguage: 'en' })
  assert.equal(store.load().target, 'English')
  assert.equal(store.load().uiLanguage, 'en')
  assert.deepEqual(updates, ['English'])
  off()
  await store.save({ raceMode: false })
  assert.deepEqual(updates, ['English'])
})

test('configuration rejects malformed untyped updates without replacing current data', async (t) => {
  const { store } = fixture(t, { target: 'English' })
  for (const invalid of [null, [], { providers: [] }, { providers: { deepseek: { enabled: 'yes' } } },
    { shortcuts: { translate: 1 } }, { settingsOrder: { general: 'raceMode' } },
    { popupBounds: { width: Infinity, height: 400 } }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    await assert.rejects(store.save(invalid), /无效的配置更新/)
    assert.equal(store.load().target, 'English')
  }
})

test('legacy shortcut remains active and cached configuration is not reread during translations', async (t) => {
  const { filePath, store } = fixture(t, { shortcut: 'Ctrl+Alt+Q', target: 'English' })
  const first = store.load()
  assert.equal(first.shortcuts.translate, 'Ctrl+Alt+Q')
  first.providers.deepseek.apiKey = 'caller mutation'
  fs.writeFileSync(filePath, JSON.stringify({ target: '日本語' }))
  assert.equal(store.load().target, 'English')
  assert.equal(store.load().providers.deepseek.apiKey, '')
})

test('unreadable existing settings use safe defaults but cannot be silently overwritten', async (t) => {
  const { filePath, store } = fixture(t)
  fs.writeFileSync(filePath, '{broken-json')
  assert.equal(store.load().target, '中文(简体)')
  await assert.rejects(store.save({ target: 'English' }), /现有配置读取失败/)
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{broken-json')
})

test('omitted optional IPC fields do not erase stored provider credentials or endpoint', async (t) => {
  const { store } = fixture(t, { providers: { deepseek: { enabled: true, apiKey: 'synthetic-key', endpoint: 'https://example.invalid' } } })
  await store.save({ providers: { deepseek: { model: 'model-c', endpoint: undefined, apiKey: undefined }, youdao: { enabled: false, apiKey: '', endpoint: undefined } } })
  assert.equal(store.load().providers.deepseek.apiKey, 'synthetic-key')
  assert.equal(store.load().providers.deepseek.endpoint, 'https://example.invalid')
  assert.equal(store.load().providers.deepseek.model, 'model-c')
})

test('an unrelated malformed legacy preference cannot discard valid provider credentials', async (t) => {
  const { filePath, store } = fixture(t, {
    raceMode: 'old-invalid-flag', settingsOrder: { general: 'invalid-order', providers: ['deepseek'] },
    providers: { deepseek: { enabled: true, apiKey: 'synthetic-preserved', model: 42 } }
  })
  assert.equal(store.load().providers.deepseek.apiKey, 'synthetic-preserved')
  assert.equal(store.load().raceMode, true)
  await store.save({ target: 'English' })
  const reopened = createConfigStore({ filePath }).load()
  assert.equal(reopened.providers.deepseek.apiKey, 'synthetic-preserved')
  assert.deepEqual(reopened.settingsOrder.providers, ['deepseek'])
})

test('exit flushing also waits for saves queued while an earlier write is completing', async () => {
  let releaseFirst, releaseSecond, firstStarted, secondStarted
  const firstGate = new Promise(resolve => { releaseFirst = resolve })
  const secondGate = new Promise(resolve => { releaseSecond = resolve })
  const firstWriting = new Promise(resolve => { firstStarted = resolve })
  const secondWriting = new Promise(resolve => { secondStarted = resolve })
  const storage = {
    read: () => null,
    async write(value) {
      if (JSON.parse(value).uiLanguage === 'en') { secondStarted(); await secondGate }
      else { firstStarted(); await firstGate }
    }
  }
  const store = createConfigStore({ storage })
  const first = store.save({ target: 'English' })
  await firstWriting
  let flushed = false
  const flush = store.flush().then(() => { flushed = true })
  const second = store.save({ uiLanguage: 'en' })
  releaseFirst()
  await secondWriting
  await new Promise(resolve => setImmediate(resolve))
  const premature = flushed
  releaseSecond()
  await Promise.all([first, second, flush])
  assert.equal(premature, false)
  assert.equal(store.load().uiLanguage, 'en')
})
