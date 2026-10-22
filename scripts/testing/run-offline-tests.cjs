const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(root, '.offline-tests-'))
const guard = path.join(__dirname, 'block-network.cjs')
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/key|token|secret|password|credential|authorization/i.test(name)))
try {
  const files = fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.cjs')).map(file => path.join(root, 'tests', file))
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...environment,
      HOME: profile, USERPROFILE: profile, APPDATA: profile, LOCALAPPDATA: profile,
      NODE_OPTIONS: `--require ${JSON.stringify(guard)}`
    }
  })
  process.exitCode = result.error || result.signal ? 1 : result.status ?? 1
} finally {
  fs.rmSync(profile, { recursive: true, force: true })
}
