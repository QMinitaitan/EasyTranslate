const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'dist-electron')
if (path.dirname(output) !== root || path.basename(output) !== 'dist-electron') throw new Error('Invalid Electron build output')
// Removed source files must not survive in development or packaged output.
fs.rmSync(output, { recursive: true, force: true })
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.electron.json')], { cwd: root, stdio: 'inherit' })
