const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { test } = require('node:test')

function launcherFixture(t, capturedText) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'easytranslate-bench-guard-'))
  t.after(() => fs.rmSync(run, { recursive: true, force: true }))
  fs.writeFileSync(path.join(run, 'trial.json'), JSON.stringify({ id: 'cold-1-invoke-3' }))
  const callbacks = new Map()
  const electron = {
    app: Object.assign(new EventEmitter(), { setPath() {}, whenReady: () => Promise.resolve() }),
    clipboard: { write() {}, readText: () => 'BENCH_CLIPBOARD', readHTML: () => 'BENCH_CLIPBOARD', readRTF: () => 'BENCH_CLIPBOARD' },
    globalShortcut: { register: (shortcut, callback) => { callbacks.set(shortcut, callback); return true } },
    ipcMain: { handle() {} }
  }
  const selection = { getSelection: async () => ({ text: capturedText, source: capturedText ? 'win32-selection' : 'empty', reason: capturedText ? undefined : 'copy-timeout' }) }
  const https = {}
  const delays = []
  const dependencies = { electron, 'node:fs': fs, 'node:path': path, 'node:events': require('node:events'), 'node:stream': require('node:stream'), 'node:child_process': { execFile() { throw new Error('native helper must not run in this fixture') } }, 'node:https': https, BENCH_MAIN_NOOP: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/performance/launcher.cjs'), 'utf8'), {
    require: id => id.endsWith('electron/selection.cjs') || id.endsWith('electron\\selection.cjs') ? selection : dependencies[id],
    process: { pid: 1, versions: { electron: 'fixture', node: process.versions.node }, env: { EASY_BENCH_REPO: run, EASY_BENCH_RUN: run, EASY_BENCH_MAIN: 'BENCH_MAIN_NOOP' } },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: (_callback, delay) => { delays.push(delay); return 1 }
  }, { filename: 'launcher.cjs' })
  electron.globalShortcut.register('Alt+Q', () => {})
  callbacks.get('Alt+Q')()
  const events = () => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
  const raw = () => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8')
  const request = source => {
    const req = https.request('https://benchmark.invalid', {}, () => {})
    const errors = []
    req.on('error', error => errors.push(error.message))
    req.write(JSON.stringify({ messages: [{ role: 'user', content: source }] }))
    req.end()
    return errors
  }
  return { selection, events, raw, request, delays }
}

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
