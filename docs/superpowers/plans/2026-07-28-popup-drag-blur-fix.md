# Popup Drag Blur Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep an unpinned Wayland translation popup visible while its native drag region is being dragged, make pinning keep it open and always on top, then replace the installed package and push the verified source changes.

**Architecture:** Move popup blur handling into a small timer-backed controller. A genuine blur hides after a short delay, while a window move or refocus cancels the pending hide, preventing Wayland's drag-start blur from racing the compositor's move event.

**Tech Stack:** Electron 43 CommonJS main process, Vue 3, Node.js built-in test runner, electron-builder deb packaging, Git.

## Global Constraints

- Preserve native Wayland rendering and `GlobalShortcutsPortal`.
- Preserve native `app-region: drag` regions and clickable `no-drag` controls.
- Preserve the user's EasyTranslate configuration during package replacement.
- Do not include unrelated `.vscode/settings.json` or `assets/icon-v2/` files in the commit.

---

### Task 1: Prevent drag-start blur from hiding the popup

**Files:**
- Create: `electron/popup-auto-hide.cjs`
- Modify: `electron/main.cjs`
- Create: `tests/popup-auto-hide.test.cjs`

**Interfaces:**
- Produces: `createPopupAutoHideController({ isPinned, hide, setAlwaysOnTop, schedule, cancel, delayMs })`
- Consumes: Electron `blur`, `focus`, and `move` window events.

- [ ] **Step 1: Write the failing controller test**

```js
test('a move cancels the hide scheduled by drag-start blur', () => {
  const harness = createHarness()
  harness.controller.onBlur()
  harness.controller.onMove()
  harness.flush()
  assert.equal(harness.hides(), 0)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/popup-auto-hide.test.cjs`

Expected: FAIL because `electron/popup-auto-hide.cjs` does not exist.

- [ ] **Step 3: Implement the minimal delayed-hide controller**

```js
function createPopupAutoHideController({
  isPinned,
  hide,
  schedule = setTimeout,
  cancel = clearTimeout,
  delayMs = 250
}) {
  let pending = null
  const clearPending = () => {
    if (pending !== null) cancel(pending)
    pending = null
  }
  return {
    onBlur() {
      clearPending()
      pending = schedule(() => {
        pending = null
        if (!isPinned()) hide()
      }, delayMs)
    },
    onFocus: clearPending,
    onMove: clearPending,
    dispose: clearPending
  }
}
```

- [ ] **Step 4: Wire the controller into the popup window**

Replace immediate `blur → hide()` with controller calls, cancel the pending hide on `focus` and `move`, and dispose it when the popup closes.

Pin changes must call `onPinChange(pinned)`: pinned windows remain open and use `setAlwaysOnTop(true)`; unpinned transient popups also remain temporarily topmost with `setAlwaysOnTop(true)`.

- [ ] **Step 5: Run focused and full verification**

Run: `node --test tests/popup-auto-hide.test.cjs && npm test && npm run build`

Expected: all tests and the Vite build pass.

### Task 2: Package, replace, verify, commit, and push

**Files:**
- Build artifact: `release/EasyTranslate-0.0.2-amd64.deb`
- Commit: only intended source, tests, configuration, and plan files.

**Interfaces:**
- Consumes: the passing source tree from Task 1.
- Produces: installed `/opt/EasyTranslate/easytranslate` and a pushed `main` commit.

- [ ] **Step 1: Build and inspect the deb**

Run: `npm run dist:linux`

Verify the package contains the blur controller, native drag markup, Portal flag, and `Exec=/opt/EasyTranslate/easytranslate --show %U`.

- [ ] **Step 2: Remove the installed package without deleting user configuration**

Stop `/opt/EasyTranslate/easytranslate`, then run `pkexec apt-get remove -y easytranslate`.

- [ ] **Step 3: Install and start the rebuilt package**

Run: `pkexec apt-get install -y /home/mini-taitan/EasyTranslate/release/EasyTranslate-0.0.2-amd64.deb`, then launch `/opt/EasyTranslate/easytranslate --show`.

- [ ] **Step 4: Verify installed bytes and process mode**

Compare installed and release `app.asar` hashes; confirm the running process uses `--ozone-platform=wayland` and `GlobalShortcutsPortal`.

- [ ] **Step 5: Commit only intended files**

```bash
git add electron src/views/Popup.vue tests electron-builder.yml docs/superpowers/plans/2026-07-28-popup-drag-blur-fix.md
git commit -m "fix: stabilize popup dragging on Wayland"
```

- [ ] **Step 6: Push the current branch**

Run: `git push origin main`

Expected: the remote accepts the new commit and reports `main -> main`.
