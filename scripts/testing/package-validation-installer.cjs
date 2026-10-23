const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process')
const [production, output, source, cache] = process.argv.slice(2)
if (![production,output,source,cache].every(Boolean)) throw new Error('Usage: node package-validation-installer.cjs PRODUCTION_DIR FRESH_OUTPUT SOURCE BUILDER_CACHE')
if (fs.existsSync(output)) throw new Error('Use fresh output; preserve previous builds')
fs.mkdirSync(output, { recursive: true })
const stage = path.join(output, 'staging'), temp = path.join(output, 'temp')
fs.mkdirSync(temp); fs.cpSync(production, stage, { recursive: true })
fs.renameSync(path.join(stage, 'EasyTranslate.exe'), path.join(stage, 'EasyTranslateValidationPR12.exe'))
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const files = []
function compare(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) compare(path.join(dir, entry.name), relative)
    else {
      const renamed = relative === 'EasyTranslate.exe' ? 'EasyTranslateValidationPR12.exe' : relative
      const original = hash(path.join(production, relative)), copied = hash(path.join(stage, renamed))
      if (original !== copied) throw new Error('Staging payload mismatch: ' + relative)
      files.push({ production: relative, staged: renamed, sha256: original })
    }
  }
}
compare(production)
fs.writeFileSync(path.join(output, 'payload-identity.json'), JSON.stringify({ production, stage, files }, null, 2))
const config = {
  appId: 'com.easytranslate.validation.pr12', productName: 'EasyTranslate PR12 Validation', executableName: 'EasyTranslateValidationPR12', asar: true,
  directories: { output: path.join(output, 'installer') },
  win: { target: [{ target:'nsis', arch:['x64'] }], artifactName: 'EasyTranslateValidationPR12-Setup.exe', signAndEditExecutable: false },
  nsis: { oneClick:false, perMachine:false, selectPerMachineByDefault:false, allowElevation:false, allowToChangeInstallationDirectory:true, createDesktopShortcut:false, createStartMenuShortcut:false, shortcutName:'EasyTranslate PR12 Validation', uninstallDisplayName:'EasyTranslate PR12 Validation', runAfterFinish:false, deleteAppDataOnUninstall:false },
  publish: null
}
const configFile = path.join(output, 'validation-builder.json')
fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
const args = [path.join(source,'node_modules/electron-builder/out/cli/cli.js'), '--config', configFile, '--prepackaged', stage, '--win', 'nsis', '--x64', '--publish', 'never']
const child = spawnSync(process.execPath, args, { cwd: source, env: { ...process.env, ELECTRON_BUILDER_CACHE: cache, TEMP: temp, TMP: temp, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 180000 })
fs.writeFileSync(path.join(output,'build-stdout.txt'), child.stdout || ''); fs.writeFileSync(path.join(output,'build-stderr.txt'), child.stderr || '')
fs.writeFileSync(path.join(output,'build-result.json'), JSON.stringify({ command:{ file:process.execPath,args }, exit:child.status, error:child.error?.message, payloadFiles:files.length, config }, null, 2))
if (child.status !== 0) process.exitCode = 1
console.log(JSON.stringify({ output, status:child.status, error:child.error?.message, payloadFiles:files.length }))
