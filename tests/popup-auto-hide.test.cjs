const test = require('node:test')
const assert = require('node:assert/strict')

let createPopupAutoHideController
try {
  ;({ createPopupAutoHideController } = require('../electron/popup-auto-hide.cjs'))
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
}

function createHarness() {
  assert.equal(
    typeof createPopupAutoHideController,
    'function',
    'popup auto-hide controller must exist'
  )

  let pinned = false
  let hideCount = 0
  let alwaysOnTop = true
  let nextTimerId = 1
  const timers = new Map()
  const controller = createPopupAutoHideController({
    isPinned: () => pinned,
    hide: () => { hideCount += 1 },
    setAlwaysOnTop(value) {
      alwaysOnTop = value
    },
    schedule(callback) {
      const id = nextTimerId++
      timers.set(id, callback)
      return id
    },
    cancel(id) {
      timers.delete(id)
    }
  })

  return {
    controller,
    setPinned(value) {
      pinned = value
    },
    hides() {
      return hideCount
    },
    staysOnTop() {
      return alwaysOnTop
    },
    flush() {
      const pending = [...timers.values()]
      timers.clear()
      for (const callback of pending) callback()
    }
  }
}

test('a genuine blur hides the unpinned popup after the grace period', () => {
  const harness = createHarness()

  harness.controller.onBlur()
  assert.equal(harness.hides(), 0)

  harness.flush()
  assert.equal(harness.hides(), 1)
})

test('a move cancels the hide scheduled by drag-start blur', () => {
  const harness = createHarness()

  harness.controller.onBlur()
  harness.controller.onMove()
  harness.flush()

  assert.equal(harness.hides(), 0)
})

test('refocusing or pinning keeps a blurred popup visible', () => {
  const focused = createHarness()
  focused.controller.onBlur()
  focused.controller.onFocus()
  focused.flush()
  assert.equal(focused.hides(), 0)

  const pinned = createHarness()
  pinned.controller.onBlur()
  pinned.setPinned(true)
  pinned.flush()
  assert.equal(pinned.hides(), 0)
})

test('pinning keeps the popup open without covering every application', () => {
  const harness = createHarness()
  assert.equal(
    typeof harness.controller.onPinChange,
    'function',
    'popup visibility controller must handle pin changes'
  )

  harness.controller.onPinChange(true)
  assert.equal(harness.staysOnTop(), false)

  harness.controller.onPinChange(false)
  assert.equal(harness.staysOnTop(), true)
})
