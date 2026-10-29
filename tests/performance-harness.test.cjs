const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { test } = require('node:test')

function launcherFixture(t, capturedText, overrides = {}) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-bench-guard-'))
  t.after(() => fs.rmSync(run, { recursive: true, force: true }))
  fs.writeFileSync(path.join(run, 'trial.json'), JSON.stringify({ id: 'cold-1-invoke-3' }))
  fs.writeFileSync(path.join(run, '.translate-app.config.json'), JSON.stringify(overrides.config || { providers: { openai: { enabled: true, apiKey: 'BENCH_FAKE_KEY', endpoint: 'https://benchmark.invalid', model: 'controlled', prompt: 'Translate {{src}} into {{target}}' } }, launchToTray: true, raceMode: false, shortcuts: { translate: 'Alt+Q', show: 'Alt+E' } }))
  const callbacks = new Map()
  const paths = {}
  const blockedFilters = []
  const electron = {
    app: Object.assign(new EventEmitter(), { isReady: () => false, setPath(name, value) { paths[name] = value }, getPath(name) { return paths[name] }, whenReady: () => Promise.resolve() }),
    net: { request() { throw new Error('UNGUARDED_ELECTRON_TRANSPORT') }, fetch() { throw new Error('UNGUARDED_ELECTRON_TRANSPORT') } },
    session: { defaultSession: { webRequest: { onBeforeRequest(filter, callback) { blockedFilters.push({ filter, callback }) } } } },
    clipboard: { write() {}, readText: () => 'BENCH_CLIPBOARD', readHTML: () => 'BENCH_CLIPBOARD', readRTF: () => 'BENCH_CLIPBOARD' },
    globalShortcut: { register: (shortcut, callback) => { callbacks.set(shortcut, callback); return true } },
    ipcMain: { handle() {} }
  }
  const selection = { getSelection: async () => ({ text: capturedText, source: capturedText ? 'win32-selection' : 'empty', reason: capturedText ? undefined : 'copy-timeout' }) }
  const https = {}
  const unguarded = () => { throw new Error('UNGUARDED_NODE_TRANSPORT') }
  const network = { 'node:net': { Socket: function Socket() {} }, 'node:tls': { connect: unguarded }, 'node:http': { request: unguarded, get: unguarded }, 'node:http2': { connect: unguarded }, 'node:dgram': { Socket: function Socket() {} }, 'node:module': { syncBuiltinESMExports() {} } }
  network['node:net'].Socket.prototype.connect = unguarded
  network['node:dgram'].Socket.prototype.send = unguarded
  const delays = []
  const dependencies = { ...network, electron, 'node:fs': fs, 'node:path': path, 'node:events': require('node:events'), 'node:stream': require('node:stream'), 'node:child_process': { execFile() { throw new Error('native helper must not run in this fixture') } }, 'node:https': https, BENCH_MAIN_NOOP: {} }
  const context = {
    require: id => {
      if (id === 'BENCH_MAIN_NOOP') overrides.onImport?.()
      return id.endsWith('electron/selection.cjs') || id.endsWith('electron\\selection.cjs') ? selection : dependencies[id]
    },
    process: { pid: 1, platform: 'win32', versions: { electron: 'fixture', node: process.versions.node }, env: { HOME: run, USERPROFILE: run, APPDATA: path.join(run, 'appData'), LOCALAPPDATA: path.join(run, 'localAppData'), TEMP: path.join(run, 'temp'), TMP: path.join(run, 'temp'), EASY_BENCH_REPO: run, EASY_BENCH_RUN: run, EASY_BENCH_MAIN: 'BENCH_MAIN_NOOP', ...overrides.env } },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: (_callback, delay) => { delays.push(delay); return 1 },
    fetch: async () => unguarded(),
    WebSocket: class { constructor() { unguarded() } }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/performance/launcher.cjs'), 'utf8'), context, { filename: 'launcher.cjs' })
  electron.globalShortcut.register('Alt+Q', () => {})
  callbacks.get('Alt+Q')()
  const events = () => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
  const raw = () => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8')
  const request = (source, model = 'controlled') => {
    const req = https.request('https://benchmark.invalid/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer BENCH_FAKE_KEY' } }, () => {})
    const errors = []
    req.on('error', error => errors.push(error.message))
    req.write(JSON.stringify({ model, messages: [{ role: 'user', content: source }] }))
    req.end()
    return errors
  }
  return { selection, events, raw, request, delays, paths, blockedFilters, network, electron, run, https, context, children: dependencies['node:child_process'] }
}

test('native benchmark denies alternative paid transports and isolates app data before product import', async t => {
  const fixture = launcherFixture(t, '')
  await Promise.resolve()
  for (const transport of [() => fixture.network['node:net'].Socket.prototype.connect(), () => fixture.network['node:tls'].connect(), () => fixture.network['node:http'].request(), () => fixture.network['node:http2'].connect(), () => fixture.network['node:dgram'].Socket.prototype.send(), () => fixture.https.get(), () => fixture.electron.net.request(), () => new fixture.context.WebSocket(), () => fixture.children.spawn(), () => fixture.children.execFile('unapproved.exe', [], {}, () => {})]) {
    assert.throws(transport, error => error.code === 'EASY_BENCH_NETWORK_BLOCKED')
  }
  await assert.rejects(fixture.context.fetch(), error => error.code === 'EASY_BENCH_NETWORK_BLOCKED')
  await assert.rejects(fixture.electron.net.fetch(), error => error.code === 'EASY_BENCH_NETWORK_BLOCKED')
  assert.equal(fixture.paths.appData, path.join(fixture.run, 'appData'))
  assert.equal(fixture.paths.userData, path.join(fixture.run, 'userData'))
  assert.equal(fixture.paths.sessionData, path.join(fixture.run, 'userData'))
  assert.equal(fixture.blockedFilters.length, 1)
  let cancelled
  fixture.blockedFilters[0].callback({ url: 'https://unexpected.invalid/private' }, result => { cancelled = result.cancel })
  assert.equal(cancelled, true)
  assert.equal(fixture.raw().includes('unexpected.invalid'), false)
  assert.equal(fixture.events().some(event => event.event === 'transport-start'), false)
})

test('native benchmark refuses inherited profiles, preloads or credentials before importing product code', t => {
  for (const env of [{ HOME: 'UNEXPECTED_TEST_ONLY_PROFILE' }, { APPDATA: 'UNEXPECTED_TEST_ONLY_PROFILE' }, { NODE_OPTIONS: '--require UNEXPECTED_TEST_ONLY_PRELOAD' }, { PRIVATE_API_KEY: 'UNEXPECTED_TEST_ONLY_SECRET' }]) {
    let imported = false
    assert.throws(() => launcherFixture(t, '', { env, onImport: () => { imported = true } }), error => error.code === 'EASY_BENCH_PROFILE_INVALID' && !error.message.includes('UNEXPECTED_TEST_ONLY'))
    assert.equal(imported, false)
  }
})

test('native benchmark rejects nonfixture endpoints, credentials and models without recording their values', t => {
  const fixture = launcherFixture(t, '')
  for (const [url, authorization] of [['https://UNEXPECTED_TEST_ONLY_ENDPOINT.invalid', 'Bearer BENCH_FAKE_KEY'], ['https://benchmark.invalid/v1/chat/completions', 'UNEXPECTED_TEST_ONLY_SECRET']]) {
    assert.throws(() => fixture.https.request(url, { method: 'POST', headers: { Authorization: authorization } }, () => {}), error => error.code === 'EASY_BENCH_NETWORK_BLOCKED')
  }
  assert.equal(fixture.request('Hello baseline world 3.', 'UNEXPECTED_TEST_ONLY_MODEL').length, 1)
  assert.equal(fixture.raw().includes('UNEXPECTED_TEST_ONLY'), false)
  assert.equal(fixture.events().some(event => event.event === 'transport-start'), false)
  assert.equal(fixture.delays.length, 0)
})

test('benchmark rejects and redacts a capture outside the synthetic fixture before the product receives it', async t => {
  const fixture = launcherFixture(t, 'UNEXPECTED_TEST_ONLY_CONTENT')
  const result = await fixture.selection.getSelection()
  assert.equal(result.text, '')
  assert.equal(fixture.raw().includes('UNEXPECTED_TEST_ONLY_CONTENT'), false)
  assert.equal(fixture.events().some(event => event.event === 'harness-failure' && event.stage === 'capture'), true)
})

test('benchmark rejects an unexpected transport source before logging or scheduling a response', t => {
  const fixture = launcherFixture(t, '')
  const errors = fixture.request('UNEXPECTED_TEST_ONLY_CONTENT')
  assert.equal(errors.length, 1)
  assert.equal(fixture.raw().includes('UNEXPECTED_TEST_ONLY_CONTENT'), false)
  assert.equal(fixture.events().some(event => event.event === 'transport-start'), false)
  assert.equal(fixture.events().some(event => event.event === 'harness-failure' && event.stage === 'transport'), true)
  assert.equal(fixture.delays.length, 0)
})

test('benchmark preserves matching capture, fixed transport delay and deliberate empty behavior', async t => {
  const source = 'Hello baseline world 3.'
  const fixture = launcherFixture(t, source)
  assert.equal((await fixture.selection.getSelection()).text, source)
  assert.equal(fixture.request(source).length, 0)
  assert.equal(fixture.events().some(event => event.event === 'transport-start' && event.source === source), true)
  assert.equal(fixture.events().some(event => event.event === 'harness-failure'), false)
  assert.deepEqual(fixture.delays, [50])
  const empty = launcherFixture(t, '')
  assert.equal((await empty.selection.getSelection()).text, '')
  assert.equal(empty.events().some(event => event.event === 'harness-failure'), false)
})
