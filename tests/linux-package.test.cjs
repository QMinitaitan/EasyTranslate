const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')
const { LinuxTargetHelper } = require('app-builder-lib/out/targets/LinuxTargetHelper')

test('Linux application-menu launch always opens the main window', async () => {
  const projectRoot = path.join(__dirname, '..')
  const config = yaml.load(
    fs.readFileSync(path.join(projectRoot, 'electron-builder.yml'), 'utf8')
  )
  const helper = Object.create(LinuxTargetHelper.prototype)
  helper.packager = {
    executableName: config.linux.executableName,
    appInfo: {
      productName: 'EasyTranslate',
      sanitizedProductName: 'EasyTranslate',
      description: 'Lightweight selection translation app'
    },
    info: { metadata: { desktopName: 'EasyTranslate' } },
    fileAssociations: [],
    config: { protocols: [] },
    platformSpecificBuildOptions: { protocols: [] }
  }

  const desktopEntry = await helper.computeDesktopEntry(config.linux, null, {})

  assert.match(
    desktopEntry,
    /^Exec=\/opt\/EasyTranslate\/easytranslate --show %U$/m
  )
})
