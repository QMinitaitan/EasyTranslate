const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function pendingSettings() {
  // The same source is checked by vue-tsc; isolate its public module per scenario.
  const source = fs.readFileSync(path.join(__dirname, '../src/composables/usePendingSettings.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, Promise, AggregateError, Error })
  return exports
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('an unsaved setting survives failed drain and view release so quit can retry without another edit', async () => {
  const { createSettingsMutation, flushPendingSettings } = pendingSettings()
  let failing = true, durable = 'old'
  const owner = createSettingsMutation('preferences', async value => {
    if (failing) return false
    durable = value
    return true
  })
  owner.update('new')
  await assert.rejects(flushPendingSettings(), /Unable to finish saving/)
  assert.equal(durable, 'old')
  owner.release()
  failing = false
  await flushPendingSettings()
  assert.equal(durable, 'new')
})

test('quit drains the newest edit after an older in-flight save completes', async () => {
  const { createSettingsMutation, flushPendingSettings, trackSettingsSave } = pendingSettings()
  const gate = deferred()
  let durable = 'original'
  const owner = createSettingsMutation('provider', async value => {
    if (value === 'older') await trackSettingsSave(gate.promise)
    durable = value
    return true
  })
  owner.update('older')
  const running = owner.save()
  owner.update('latest')
  const drain = flushPendingSettings()
  let done = false
  drain.then(() => { done = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(done, false)
  gate.resolve()
  await running
  await drain
  assert.equal(durable, 'latest')
  owner.release()
})

test('a normal debounce save of a newer edit is persisted after an older save finishes without requiring quit', async () => {
  const { createSettingsMutation } = pendingSettings()
  const gate = deferred()
  let durable = 'original'
  const owner = createSettingsMutation('preferences', async value => {
    if (value === 'older') await gate.promise
    durable = value
    return true
  })
  owner.update('older')
  const earlier = owner.save()
  owner.update('latest')
  const debounce = owner.save()
  gate.resolve()
  await Promise.all([earlier, debounce])
  assert.equal(durable, 'latest')
  owner.release()
})

test('a newer edit after remount supersedes a retained failed draft instead of being overwritten on quit', async () => {
  const { createSettingsMutation, flushPendingSettings } = pendingSettings()
  let durable = 'original', fail = true
  const persist = async value => {
    if (fail) return false
    durable = value
    return true
  }
  const previous = createSettingsMutation('shortcut', persist)
  previous.update('outdated')
  await assert.rejects(flushPendingSettings())
  previous.release()
  const current = createSettingsMutation('shortcut', persist)
  current.update('current')
  fail = false
  await flushPendingSettings()
  assert.equal(durable, 'current')
  current.release()
})
