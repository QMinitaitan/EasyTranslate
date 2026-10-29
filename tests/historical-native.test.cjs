const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const entries = [
  'scripts/provider-ui-smoke.cjs',
  'scripts/testing/desktop-quit.cjs',
  'scripts/testing/desktop-startup.cjs',
  'scripts/testing/quit-durability.cjs',
  'scripts/testing/prewarm-native.cjs',
  'scripts/testing/session-ui-smoke.cjs',
  'scripts/testing/race-ui-smoke.cjs',
  'scripts/testing/history-ui-smoke.cjs',
  'scripts/performance/selection-comparison/launcher.cjs'
]
const launchers = [
  'scripts/testing/run-desktop-quit.ps1',
  'scripts/testing/run-desktop-startup.ps1',
  'scripts/testing/run-quit-durability.ps1',
  'scripts/testing/run-prewarm-native.ps1',
  'scripts/testing/run-session-ui-smoke.ps1',
  'scripts/performance/selection-comparison/run.ps1'
]
const disabled = /Historical native validation is disabled.*docs\/validation\/NATIVE-VALIDATION.md/

for (const entry of entries) {
  test(`${entry} refuses before importing, reading credentials, logging or touching native input`, () => {
    const touched = []
    const forbidden = name => { touched.push(name); throw new Error(`Unexpected boundary: ${name}`) }
    const scope = {
      require: name => forbidden(`require ${name}`),
      process: new Proxy({}, { get: (_, name) => forbidden(`process.${String(name)}`) }),
      console: new Proxy({}, { get: (_, name) => forbidden(`console.${String(name)}`) }),
      setTimeout: () => forbidden('timer'),
      __dirname: path.dirname(path.join(__dirname, '..', entry))
    }
    const source = fs.readFileSync(path.join(__dirname, '..', entry), 'utf8')
    assert.throws(() => vm.runInNewContext(source, scope, { filename: entry }), disabled)
    assert.deepEqual(touched, [])
  })
}

for (const launcher of launchers) {
  test(`${launcher} has an unconditional refusal before any PowerShell operation`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', launcher), 'utf8')
    // These retained launchers have a single-line declarative param block. No
    // executable prefix is permitted: even profile setup can otherwise follow input.
    const firstStatement = source.replace(/^\uFEFF/, '').split(/\r?\n/)
      .filter(line => line.trim() && !line.trim().startsWith('#'))
      .filter((line, index) => index !== 0 || !/^param\([^\r\n]*\)$/.test(line))[0]
    assert.match(firstStatement, /^throw 'Historical native validation is disabled[^']*docs\/validation\/NATIVE-VALIDATION.md'$/)
  })
}
