const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

function fixture(saved = 'dark') {
  const mounted = [], unmounted = [], sent = [], events = new Map()
  const media = { matches: false, addEventListener: (_, cb) => events.set('media', cb), removeEventListener: () => events.delete('media') }
  const localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value } }
  const document = { documentElement: { dataset: {} } }
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/composables/useTheme.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  vm.runInNewContext(code, {
    exports, document, localStorage,
    window: {
      api: { setThemeMode: value => sent.push(value) },
      matchMedia: () => media,
      addEventListener: (name, cb) => events.set(name, cb), removeEventListener: name => events.delete(name)
    },
    require: () => ({ ...vue, onMounted: cb => mounted.push(cb), onUnmounted: cb => unmounted.push(cb) })
  })
  return { exports, document, sent, events, media, mounted, unmounted }
}

test('saved, explicit, cross-window and system theme choices update CSS and native title bars together', () => {
  const f = fixture()
  const theme = f.exports.useTheme()
  f.mounted.forEach(cb => cb())
  assert.equal(f.document.documentElement.dataset.theme, 'dark')
  assert.equal(f.sent.at(-1), 'dark')
  theme.setMode('light')
  assert.equal(f.document.documentElement.dataset.theme, 'light')
  assert.equal(f.sent.at(-1), 'light')
  f.events.get('storage')({ key: 'translate-app.theme', newValue: 'dark' })
  assert.equal(f.document.documentElement.dataset.theme, 'dark')
  assert.equal(f.sent.at(-1), 'dark')
  theme.setMode('system')
  assert.equal(f.document.documentElement.dataset.theme, 'light')
  assert.equal(f.sent.at(-1), 'system')
  f.media.matches = true
  f.events.get('media')()
  assert.equal(f.document.documentElement.dataset.theme, 'dark')
  assert.equal(f.sent.at(-1), 'system')
  f.unmounted.forEach(cb => cb())
  assert.equal(f.events.size, 0)
})
