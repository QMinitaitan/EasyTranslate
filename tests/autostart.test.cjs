const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getLaunchSpec,
  getLinuxDesktopPath,
  buildLinuxDesktopEntry
} = require('../electron/autostart.cjs')

function mockApp(isPackaged) {
  return {
    isPackaged,
    getPath(name) {
      if (name === 'exe') return '/opt/Easy Translate/easytranslate'
      if (name === 'appData') return '/home/test/.config'
      throw new Error(`Unexpected path: ${name}`)
    },
    getAppPath() {
      return '/home/test/Easy Translate'
    }
  }
}

test('Packaged startup launches only the application executable', () => {
  assert.deepEqual(getLaunchSpec(mockApp(true)), {
    executable: '/opt/Easy Translate/easytranslate',
    args: []
  })
})

test('Development startup includes the application directory', () => {
  assert.deepEqual(getLaunchSpec(mockApp(false)), {
    executable: '/opt/Easy Translate/easytranslate',
    args: ['/home/test/Easy Translate']
  })
})

test('Linux desktop entry safely quotes paths and uses the autostart directory', () => {
  const app = mockApp(false)
  const entry = buildLinuxDesktopEntry(app)

  assert.equal(
    getLinuxDesktopPath(app).replace(/\\/g, '/'),
    '/home/test/.config/autostart/easytranslate.desktop'
  )
  assert.match(entry, /Exec="\/opt\/Easy Translate\/easytranslate" "\/home\/test\/Easy Translate"/)
  assert.match(entry, /X-GNOME-Autostart-enabled=true/)
  assert.match(entry, /Terminal=false/)
})
