const POPUP_BOUNDS_KEY = 'popupBounds'
const POPUP_BOUNDS_VERSION_KEY = 'popupBoundsVersion'
const POPUP_BOUNDS_VERSION = 3

const DEFAULT_POPUP_BOUNDS = Object.freeze({ width: 380, height: 500 })
const MIN_POPUP_BOUNDS = Object.freeze({ width: 320, height: 360 })
const LANDSCAPE_POPUP_BOUNDS = Object.freeze({ width: 520, height: 280 })

function cloneDefaultBounds() {
  return { ...DEFAULT_POPUP_BOUNDS }
}

function isLegacyLandscapeDefault(bounds) {
  return (
    Number(bounds?.width) === LANDSCAPE_POPUP_BOUNDS.width &&
    Number(bounds?.height) === LANDSCAPE_POPUP_BOUNDS.height
  )
}

function normalizeBounds(bounds = {}) {
  return {
    ...bounds,
    width: Math.max(
      MIN_POPUP_BOUNDS.width,
      Number(bounds.width) || DEFAULT_POPUP_BOUNDS.width
    ),
    height: Math.max(
      MIN_POPUP_BOUNDS.height,
      Number(bounds.height) || DEFAULT_POPUP_BOUNDS.height
    )
  }
}

function resolvePopupBounds(config = {}) {
  const saved = config[POPUP_BOUNDS_KEY]
  if (!saved) {
    return {
      bounds: cloneDefaultBounds(),
      changed: false
    }
  }

  const needsDefaultMigration =
    config[POPUP_BOUNDS_VERSION_KEY] !== POPUP_BOUNDS_VERSION &&
    isLegacyLandscapeDefault(saved)

  if (needsDefaultMigration) {
    return {
      bounds: cloneDefaultBounds(),
      changed: true
    }
  }

  const bounds = normalizeBounds(saved)
  const dimensionsChanged =
    bounds.width !== Number(saved.width) ||
    bounds.height !== Number(saved.height)

  return {
    bounds,
    changed:
      config[POPUP_BOUNDS_VERSION_KEY] !== POPUP_BOUNDS_VERSION ||
      dimensionsChanged
  }
}

function createPopupBoundsStore({ loadConfig, saveConfig }) {
  if (typeof loadConfig !== 'function' || typeof saveConfig !== 'function') {
    throw new TypeError('loadConfig and saveConfig are required')
  }

  function persist(config, bounds) {
    config[POPUP_BOUNDS_KEY] = { ...bounds }
    config[POPUP_BOUNDS_VERSION_KEY] = POPUP_BOUNDS_VERSION
    saveConfig(config)
  }

  return {
    get() {
      const config = loadConfig()
      const resolved = resolvePopupBounds(config)
      if (resolved.changed) persist(config, resolved.bounds)
      return { ...resolved.bounds }
    },

    update(partialBounds) {
      const config = loadConfig()
      const current = config[POPUP_BOUNDS_KEY] || cloneDefaultBounds()
      const bounds = normalizeBounds({ ...current, ...partialBounds })
      persist(config, bounds)
      return { ...bounds }
    },

    reset() {
      const config = loadConfig()
      const bounds = cloneDefaultBounds()
      persist(config, bounds)
      return bounds
    }
  }
}

module.exports = {
  POPUP_BOUNDS_KEY,
  POPUP_BOUNDS_VERSION_KEY,
  POPUP_BOUNDS_VERSION,
  DEFAULT_POPUP_BOUNDS,
  MIN_POPUP_BOUNDS,
  LANDSCAPE_POPUP_BOUNDS,
  normalizeBounds,
  resolvePopupBounds,
  createPopupBoundsStore
}
