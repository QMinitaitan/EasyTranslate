const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createDesktopRuntime } = require('../dist-electron/desktop-runtime.cjs')

function fixture({ platform = 'win32', env = {}, initial = {} } = {}) {
  let config = structuredClone(initial)
  let saveFailure = false
  const errors = []
  const windows = []
  class Window extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.webContents = new EventEmitter()
      this.webContents.send = (channel, payload) => this.messages.push({ channel, payload })
      this.messages = []
      this.bounds = { x: 0, y: 0, ...options }
      this.visible = false
      this.focuses = 0
      this.dead = false
      this.topmost = options.alwaysOnTop
      windows.push(this)
    }
    loadFile(file, options) { this.loaded = { file, options }; this.webContents.emit('did-start-loading'); return Promise.resolve() }
    loadURL(url) { this.loaded = url; this.webContents.emit('did-start-loading'); return Promise.resolve() }
    isDestroyed() { return this.dead }
    getBounds() { const { x = 0, y = 0, width, height } = this.bounds; return { x, y, width, height } }
    setBounds(bounds) { this.bounds = { ...this.bounds, ...bounds }; this.emit('move'); this.emit('resize') }
    setSize(width, height) { this.setBounds({ width, height }) }
    setAlwaysOnTop(on) { this.topmost = on }
    show() { this.visible = true; this.emit('show') }
    focus() { this.focuses++; this.emit('focus') }
    hide() { this.visible = false; this.emit('hide') }
    destroy() { this.dead = true; this.emit('closed') }
  }
  let time = 0
  let next = 0
  const tasks = new Map()
  const schedule = (fn, ms) => { const id = ++next; tasks.set(id, { fn, at: time + ms }); return id }
  const cancel = id => tasks.delete(id)
  const advance = ms => {
    time += ms
    for (const [id, task] of [...tasks]) if (task.at <= time) { tasks.delete(id); task.fn() }
  }
  const desktop = createDesktopRuntime({
    createWindow: options => new Window(options),
    frontend: { htmlPath: '/test/index.html', preloadPath: '/test/preload.cjs' },
    platform, env,
    screen: {
      getCursorScreenPoint: () => { if (platform === 'linux') throw new Error('Wayland has no global cursor'); return { x: 100, y: 100 } },
      getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0, width: 1200, height: 800 } })
    },
    loadConfig: () => structuredClone(config),
    saveConfig: partial => { if (saveFailure) throw new Error('fixture disk failure'); config = { ...config, ...structuredClone(partial) } },
    onSaveError: error => errors.push(error.message),
    schedule, cancel, now: () => time
  })
  return { desktop, windows, advance, pending: () => tasks.size, config: () => structuredClone(config), failSaves: () => { saveFailure = true }, errors }
}

test('idle prewarm stays hidden and only the authenticated application-ready popup receives the latest queued trigger', () => {
  const f = fixture()
  f.desktop.schedulePrewarm()
  f.desktop.schedulePrewarm()
  f.advance(1000)
  const win = f.windows[0]
  assert.equal(f.windows.length, 1)
  assert.equal(win.visible, false)
  assert.equal(win.focuses, 0)
  f.desktop.showTranslation('old')
  f.desktop.showTranslation('latest')
  win.webContents.emit('did-finish-load')
  assert.deepEqual(win.messages, [])
  assert.equal(f.desktop.markReady(new EventEmitter()), null)
  assert.deepEqual(f.desktop.markReady(win.webContents), { pinned: false })
  assert.deepEqual(win.messages.map(message => message.payload.text), ['latest'])
  assert.equal(win.visible, true)
  assert.equal(win.focuses, 1)
  assert.equal(f.windows.length, 1)
  f.desktop.dispose()
})

test('the reused popup preserves pin/topmost, genuine blur, drag protection and durable dimensions', async () => {
  const f = fixture()
  f.desktop.prewarm()
  const win = f.windows[0]
  f.desktop.markReady(win.webContents)
  f.desktop.showTranslation('first')
  f.desktop.setPinned(true)
  win.emit('blur')
  f.advance(300)
  assert.equal(win.visible, true)
  assert.equal(win.topmost, true)
  f.desktop.setPinned(false)
  win.emit('blur')
  win.setBounds({ x: 140, y: 160, width: 440, height: 600 })
  f.advance(300)
  assert.equal(win.visible, true, 'native dragging cancels a focus-loss hide')
  await f.desktop.flush()
  assert.deepEqual(f.config().popupBounds, { x: 140, y: 160, width: 440, height: 600 })
  win.emit('blur')
  f.advance(300)
  assert.equal(win.visible, false)
  f.desktop.showTranslation('again')
  assert.equal(f.windows.length, 1)
  assert.deepEqual(win.messages.map(message => message.payload.text), ['first', 'again'])
  assert.equal(win.topmost, true)
  f.desktop.dispose()
  assert.equal(f.pending(), 0)
})

test('renderer restart and window replacement require a new ready signal and release owned timers/listeners', () => {
  const f = fixture()
  f.desktop.prewarm()
  const first = f.windows[0]
  f.desktop.markReady(first.webContents)
  f.desktop.showTranslation('initial')
  first.webContents.emit('render-process-gone')
  f.desktop.showTranslation('discarded')
  f.desktop.showTranslation('after restart')
  first.webContents.emit('did-finish-load')
  assert.deepEqual(first.messages.map(message => message.payload.text), ['initial'])
  f.desktop.markReady(first.webContents)
  f.desktop.markReady(first.webContents)
  assert.deepEqual(first.messages.map(message => message.payload.text), ['initial', 'after restart'])
  first.setBounds({ width: 460, height: 610 })
  first.emit('blur')
  first.destroy()
  assert.equal(f.pending(), 0)
  assert.equal(first.listenerCount('move'), 0)
  assert.equal(first.listenerCount('resize'), 0)
  assert.equal(first.listenerCount('blur'), 0)
  assert.equal(first.webContents.listenerCount('did-start-loading'), 0)
  f.desktop.showTranslation('replacement')
  const next = f.windows[1]
  assert.equal(f.desktop.markReady(first.webContents), null)
  assert.deepEqual(next.messages, [])
  f.desktop.markReady(next.webContents)
  assert.deepEqual(next.messages.map(message => message.payload.text), ['replacement'])
  f.desktop.dispose()
  f.desktop.schedulePrewarm()
  f.advance(1000)
  assert.equal(f.windows.length, 2)
  assert.equal(f.pending(), 0)
})

test('resizing validates dimensions, resetting discards old placement and save failures remain observable', async () => {
  const f = fixture()
  f.desktop.prewarm()
  const win = f.windows[0]
  f.desktop.resize(Number.NaN, 200)
  assert.equal(win.getBounds().width, 380)
  f.desktop.resize(100, 200)
  await f.desktop.flush()
  assert.deepEqual(f.config().popupBounds, { x: 0, y: 0, width: 320, height: 360 })
  assert.deepEqual(await f.desktop.resetBounds(), { width: 380, height: 500 })
  f.advance(1000)
  await f.desktop.flush()
  assert.deepEqual(f.config().popupBounds, { width: 380, height: 500 })
  f.failSaves()
  await assert.rejects(f.desktop.resetBounds(), /fixture disk failure/)
  assert.deepEqual(f.errors, ['fixture disk failure'])
  f.desktop.dispose()
})

test('Wayland reuses compositor placement and never reads or persists unsupported global coordinates', async () => {
  const f = fixture({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' }, initial: { popupBounds: { x: 800, y: 600, width: 420, height: 620 }, popupBoundsVersion: 3 } })
  f.desktop.prewarm()
  const win = f.windows[0]
  assert.equal(Object.hasOwn(win.options, 'x'), false)
  assert.equal(Object.hasOwn(win.options, 'y'), false)
  f.desktop.showTranslation('wayland')
  f.desktop.markReady(win.webContents)
  f.desktop.resize(460, 680)
  await f.desktop.flush()
  assert.deepEqual(f.config().popupBounds, { width: 460, height: 680 })
  f.desktop.markNotReady(win.webContents)
  f.desktop.showTranslation('after remount')
  assert.equal(win.messages.length, 1)
  f.desktop.markReady(win.webContents)
  assert.equal(win.messages.at(-1).payload.text, 'after remount')
  f.desktop.dispose()
})
