function createPopupAutoHideController({
  isPinned,
  hide,
  setAlwaysOnTop,
  schedule = setTimeout,
  cancel = clearTimeout,
  delayMs = 250
}) {
  if (
    typeof isPinned !== 'function' ||
    typeof hide !== 'function' ||
    typeof setAlwaysOnTop !== 'function'
  ) {
    throw new TypeError('isPinned, hide, and setAlwaysOnTop are required')
  }

  let pending = null

  function clearPending() {
    if (pending !== null) cancel(pending)
    pending = null
  }

  return {
    onBlur() {
      clearPending()
      if (isPinned()) return
      pending = schedule(() => {
        pending = null
        if (!isPinned()) hide()
      }, delayMs)
    },

    onFocus: clearPending,
    onMove: clearPending,
    onPinChange(pinned) {
      clearPending()
      setAlwaysOnTop(true)
    },
    dispose: clearPending
  }
}

module.exports = { createPopupAutoHideController }
