const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

test('Wayland sessions keep Electron on its native display platform', () => {
  const originalLoad = Module._load
  const originalSessionType = process.env.XDG_SESSION_TYPE
  const originalWaylandDisplay = process.env.WAYLAND_DISPLAY
  const switches = []
  const pending = new Promise(() => {})

  process.env.XDG_SESSION_TYPE = 'wayland'
  process.env.WAYLAND_DISPLAY = 'wayland-0'
  Module._load = function (request, parent, isMain) {
    if (request !== 'electron') return originalLoad.call(this, request, parent, isMain)
    return {
      app: {
        commandLine: {
          appendSwitch(name, value) {
            switches.push([name, value])
          }
        },
        setName() {},
        setAppUserModelId() {},
        whenReady() {
          return pending
        },
        on() {}
      },
      BrowserWindow: class {},
      Menu: { setApplicationMenu() {} },
      ipcMain: {},
      shell: {},
      clipboard: {},
      screen: {},
      Tray: class {},
      nativeImage: {}
    }
  }

  try {
    const mainPath = path.join(__dirname, '../electron/main.cjs')
    delete require.cache[require.resolve(mainPath)]
    require(mainPath)
  } finally {
    Module._load = originalLoad
    if (originalSessionType === undefined) delete process.env.XDG_SESSION_TYPE
    else process.env.XDG_SESSION_TYPE = originalSessionType
    if (originalWaylandDisplay === undefined) delete process.env.WAYLAND_DISPLAY
    else process.env.WAYLAND_DISPLAY = originalWaylandDisplay
  }

  assert.equal(
    switches.some(([name]) => name === 'ozone-platform'),
    false
  )
  assert.equal(
    switches.some(
      ([name, value]) =>
        name === 'enable-features' &&
        value.split(',').includes('GlobalShortcutsPortal')
    ),
    true
  )
})
