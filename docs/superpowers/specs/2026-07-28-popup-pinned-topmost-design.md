# Pinned Popup Topmost Design

## Goal

Make “固定” mean that the translation popup remains visible and always stays
above ordinary application windows.

## Behavior

- An unpinned popup is temporarily topmost while visible.
- An unpinned popup hides after a genuine focus loss.
- A native Wayland drag must cancel the pending focus-loss hide.
- A pinned popup does not hide on focus loss and remains always on top.
- Unpinning restores the transient auto-hide behavior without changing the
  popup's temporary topmost status.

## Implementation

Keep the existing delayed auto-hide controller and change only its pin-state
topmost policy. `onPinChange` clears any pending hide and calls
`setAlwaysOnTop(true)` for both pin states. The pin state continues to control
whether blur schedules a hide.

## Verification

Update the controller regression test to require topmost status after pinning
and unpinning. Run the focused test red and green, then the complete test suite,
production build, Debian package build, replacement installation, and installed
process verification.
