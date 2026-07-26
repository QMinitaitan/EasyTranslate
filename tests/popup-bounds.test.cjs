const test = require('node:test')
const assert = require('node:assert/strict')
const {
  POPUP_BOUNDS_VERSION,
  DEFAULT_POPUP_BOUNDS,
  createPopupBoundsStore,
  resolvePopupBounds
} = require('../electron/popup-bounds.cjs')

function createConfigStore(initial) {
  let config = structuredClone(initial)
  let saves = 0
  return {
    loadConfig: () => structuredClone(config),
    saveConfig: (next) => {
      config = structuredClone(next)
      saves += 1
    },
    read: () => structuredClone(config),
    saves: () => saves
  }
}

test('missing popup bounds use the portrait default without an unnecessary write', () => {
  const resolved = resolvePopupBounds({})

  assert.deepEqual(resolved, {
    bounds: { ...DEFAULT_POPUP_BOUNDS },
    changed: false
  })
})

test('the previous landscape default migrates once and discards its old position', () => {
  const storage = createConfigStore({
    popupBounds: { width: 520, height: 280, x: 900, y: 400 },
    popupBoundsVersion: 2
  })
  const boundsStore = createPopupBoundsStore(storage)

  assert.deepEqual(boundsStore.get(), { ...DEFAULT_POPUP_BOUNDS })
  assert.deepEqual(storage.read().popupBounds, { ...DEFAULT_POPUP_BOUNDS })
  assert.equal(storage.read().popupBoundsVersion, POPUP_BOUNDS_VERSION)
  assert.equal(storage.saves(), 1)

  assert.deepEqual(boundsStore.get(), { ...DEFAULT_POPUP_BOUNDS })
  assert.equal(storage.saves(), 1)
})

test('custom portrait bounds and position survive a version upgrade', () => {
  const storage = createConfigStore({
    popupBounds: { width: 420, height: 620, x: 120, y: 80 },
    popupBoundsVersion: 2
  })
  const boundsStore = createPopupBoundsStore(storage)

  assert.deepEqual(boundsStore.get(), {
    width: 420,
    height: 620,
    x: 120,
    y: 80
  })
  assert.equal(storage.read().popupBoundsVersion, POPUP_BOUNDS_VERSION)
})

test('undersized custom bounds are clamped while retaining their position', () => {
  const storage = createConfigStore({
    popupBounds: { width: 100, height: 200, x: 40, y: 60 },
    popupBoundsVersion: POPUP_BOUNDS_VERSION
  })
  const boundsStore = createPopupBoundsStore(storage)

  assert.deepEqual(boundsStore.get(), {
    width: 320,
    height: 360,
    x: 40,
    y: 60
  })
})

test('reset restores the portrait default and clears a custom position', () => {
  const storage = createConfigStore({
    popupBounds: { width: 500, height: 700, x: 40, y: 60 },
    popupBoundsVersion: POPUP_BOUNDS_VERSION
  })
  const boundsStore = createPopupBoundsStore(storage)

  assert.deepEqual(boundsStore.reset(), { ...DEFAULT_POPUP_BOUNDS })
  assert.deepEqual(storage.read().popupBounds, { ...DEFAULT_POPUP_BOUNDS })
})
