const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

function launchSwitches(platform, sessionType, waylandDisplay) {
  const originalLoad = Module._load
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const originalSessionType = process.env.XDG_SESSION_TYPE
  const originalWaylandDisplay = process.env.WAYLAND_DISPLAY
  const switches = []
  const pending = new Promise(() => {})

  Object.defineProperty(process, 'platform', { value: platform })
  process.env.XDG_SESSION_TYPE = sessionType
  process.env.WAYLAND_DISPLAY = waylandDisplay
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
    Object.defineProperty(process, 'platform', originalPlatform)
    if (originalSessionType === undefined) delete process.env.XDG_SESSION_TYPE
    else process.env.XDG_SESSION_TYPE = originalSessionType
    if (originalWaylandDisplay === undefined) delete process.env.WAYLAND_DISPLAY
    else process.env.WAYLAND_DISPLAY = originalWaylandDisplay
  }

  return switches
}

test('Linux Wayland sessions keep Electron on the native display platform on every test host', () => {
  const switches = launchSwitches('linux', 'wayland', 'wayland-0')
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

test('Linux X11 and Windows do not enable a Wayland shortcut portal', () => {
  for (const [platform, sessionType, display] of [
    ['linux', 'x11', ''],
    ['win32', 'wayland', 'wayland-0']
  ]) {
    const switches = launchSwitches(platform, sessionType, display)
    assert.equal(switches.some(([name]) => name === 'enable-features'), false)
  }
})
