const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../scripts/testing/settings-popup-native.cjs'), 'utf8')

for (const failure of ['no-profile', 'outside-runtime', 'mismatched-profile', 'startup-hook', 'existing-profile']) {
  test(`native fixture rejects ${failure} before transport, Electron, product imports or profile writes`, async () => {
    const root = 'E:\\EasyTranslate'
    const profile = root + '\\.runtime\\settings-popup-native-policy'
    const imports = [], writes = [], exits = []
    const fakeFs = {
      realpathSync: value => value,
      existsSync: () => true,
      lstatSync: () => ({ isSymbolicLink: () => false }),
      readdirSync: () => ['existing-user-file'],
      mkdirSync: (...args) => writes.push(['mkdir', ...args]),
      writeFileSync: (...args) => writes.push(['write', ...args]),
      renameSync: (...args) => writes.push(['rename', ...args])
    }
    const process = {
      platform: 'win32', execPath: root + '\\node_modules\\electron\\dist\\electron.exe',
      argv: ['electron.exe', 'settings-popup-native.cjs', '--profile', profile],
      env: Object.fromEntries(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'].map(name => [name, profile])),
      exit: code => exits.push(code)
    }
    if (failure === 'no-profile') process.argv.length = 2
    if (failure === 'outside-runtime') process.argv[3] = 'C:\\Users\\synthetic\\daily-profile'
    if (failure === 'mismatched-profile') process.env.APPDATA = 'C:\\Users\\synthetic\\daily-profile'
    if (failure === 'startup-hook') process.env.NODE_OPTIONS = '--require synthetic-forbidden-hook'
    vm.runInNewContext(source, {
      __dirname: root + '\\scripts\\testing', process,
      clearTimeout() {},
      require(name) {
        imports.push(name)
        if (name === 'node:fs') return fakeFs
        if (name === 'node:path') return path.win32
        if (name === 'node:assert/strict') return assert
        throw new Error('Unexpected import past preflight gate')
      }
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(imports, ['node:fs', 'node:path', 'node:assert/strict'])
    assert.deepEqual(writes, [])
    assert.deepEqual(exits, [1])
  })
}
