const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse, compileScript } = require('@vue/compiler-sfc')
const { createConfigStore } = require('../dist-electron/config-store.cjs')
const { PROMPT_PRESETS } = require('../dist-electron/prompt-presets.cjs')

function editor() {
  const mounted = [], unmounted = []
  let fail = false, writes = 0, serialized = null
  const store = createConfigStore({ storage: {
    read: () => serialized,
    write: async value => { if (fail) throw new Error('synthetic failure'); writes++; serialized = value }
  } })
  const pendingExports = {}
  const pendingCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/composables/usePendingSettings.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  vm.runInNewContext(pendingCode, { exports: pendingExports, Promise, AggregateError, Error })
  const filename = path.join(__dirname, '../src/views/SettingsPrompts.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const script = compileScript(descriptor, { id: 'prompt-editor-regression' })
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports, clearTimeout() {},
    window: { setTimeout: () => 1, api: {
      loadConfig: async () => store.load(), listPromptDefaults: async () => structuredClone(PROMPT_PRESETS),
      saveConfig: update => store.save(update)
    } },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted: callback => mounted.push(callback), onUnmounted: callback => unmounted.push(callback) }
      if (id.endsWith('useLocale')) return { useLocale: () => ({ isEnglish: vue.ref(false) }) }
      if (id.endsWith('usePendingSettings')) return pendingExports
      throw new Error(`Unexpected synthetic test import: ${id}`)
    }
  }, { filename })
  const scope = vue.effectScope()
  const view = scope.run(() => exports.default.setup({}, { expose() {} }))
  return {
    view, store, pending: pendingExports,
    mount: async () => { await Promise.all(mounted.map(callback => callback())); await vue.nextTick() },
    unmount: () => { for (const callback of unmounted) callback(); scope.stop() },
    fail: value => { fail = value }, writes: () => writes
  }
}

test('editor hydration does not save; edits reach the durable store and restoring one preset preserves others', async () => {
  const fixture = editor()
  await fixture.mount()
  assert.equal(fixture.writes(), 0)
  fixture.view.drafts.concise.prompt = 'SYNTHETIC CONCISE EDIT'
  fixture.view.drafts.natural.prompt = 'SYNTHETIC NATURAL EDIT'
  await fixture.view.saveNow()
  assert.equal(fixture.store.load().promptPresets.concise.prompt, 'SYNTHETIC CONCISE EDIT')
  fixture.view.restore('concise')
  await fixture.view.saveNow()
  assert.equal(fixture.store.load().promptPresets.concise.prompt, PROMPT_PRESETS.concise.prompt)
  assert.equal(fixture.store.load().promptPresets.natural.prompt, 'SYNTHETIC NATURAL EDIT')
  fixture.unmount()
})

test('failed editor saves retain a concrete draft after unmount and quit flushing can retry it', async () => {
  const fixture = editor()
  await fixture.mount()
  fixture.fail(true)
  fixture.view.drafts.concise.prompt = 'SYNTHETIC RETAINED EDIT'
  await fixture.view.saveNow()
  assert.match(fixture.view.saveError.value, /保存失败/)
  assert.equal(fixture.store.load().promptPresets.concise.prompt, PROMPT_PRESETS.concise.prompt)
  fixture.unmount()
  await new Promise(resolve => setImmediate(resolve))
  fixture.fail(false)
  await fixture.pending.flushPendingSettings()
  assert.equal(fixture.store.load().promptPresets.concise.prompt, 'SYNTHETIC RETAINED EDIT')
})

test('an empty prompt stays in the editor draft but cannot erase the saved preset', async () => {
  const fixture = editor()
  await fixture.mount()
  fixture.view.drafts.concise.prompt = ' '
  await fixture.view.saveNow()
  assert.match(fixture.view.saveError.value, /保存失败/)
  assert.equal(fixture.view.drafts.concise.prompt, ' ')
  assert.equal(fixture.store.load().promptPresets.concise.prompt, PROMPT_PRESETS.concise.prompt)
  fixture.view.restore('concise')
  await fixture.view.saveNow()
  assert.equal(fixture.view.saveError.value, '')
  fixture.unmount()
})
