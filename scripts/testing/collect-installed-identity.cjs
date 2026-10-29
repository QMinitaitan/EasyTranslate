const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const [asarFile, source, previousAsar, output] = process.argv.slice(2)
if (![asarFile, source, previousAsar, output].every(Boolean) || fs.existsSync(output)) throw new Error('ASAR SOURCE PRIOR_ASAR FRESH_OUTPUT required')
const asar = require(path.join(source, 'node_modules', '@electron', 'asar'))
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
const files = ['dist-electron/main.cjs', 'dist-electron/preload.cjs', 'dist-electron/desktop-runtime.cjs', 'dist-electron/provider-service.cjs', 'dist-electron/providers.cjs', 'dist/index.html', 'electron/selection.cjs']
const identity = { asar: asarFile, source, asarSha256: hash(fs.readFileSync(asarFile)), files: files.map(name => {
 const sha256 = hash(asar.extractFile(asarFile, name))
 return { name, sha256, matchesIndependentSource: sha256 === hash(fs.readFileSync(path.join(source, name))), unchangedFromPrior: sha256 === hash(asar.extractFile(previousAsar, name)) }
}) }
if (!identity.files.every(file => file.matchesIndependentSource)) throw new Error('Packaged source mismatch')
fs.writeFileSync(output, JSON.stringify(identity, null, 2))
console.log(JSON.stringify(identity))
