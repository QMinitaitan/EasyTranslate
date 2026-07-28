# Pinned Popup Topmost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a fixed popup permanently above ordinary application windows without regressing native Wayland dragging.

**Architecture:** Preserve the delayed blur controller and native drag regions. Correct only the controller's pin-change topmost policy and lock the behavior with a focused regression test.

**Tech Stack:** Electron 43 CommonJS main process, Node.js built-in test runner, electron-builder Debian packaging.

## Global Constraints

- Fixed popups remain visible and always on top.
- Unfixed popups remain temporarily topmost and auto-hide after genuine blur.
- Native Wayland dragging must not close the popup.
- Do not stage `.vscode/settings.json` or `assets/icon-v2/`.

---

### Task 1: Correct the pin topmost policy

**Files:**
- Modify: `tests/popup-auto-hide.test.cjs`
- Modify: `electron/popup-auto-hide.cjs`

**Interfaces:**
- Consumes: `createPopupAutoHideController(...).onPinChange(pinned)`
- Produces: `setAlwaysOnTop(true)` for both pinned and unpinned visible states.

- [ ] **Step 1: Change the regression test**

Require `staysOnTop()` to remain `true` after `onPinChange(true)` and
`onPinChange(false)`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/popup-auto-hide.test.cjs`

Expected: the pinning assertion fails because the current controller passes
`false` when pinned.

- [ ] **Step 3: Implement the minimal correction**

Change `onPinChange` to clear the pending hide and call
`setAlwaysOnTop(true)`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/popup-auto-hide.test.cjs && npm test && npm run build`

Expected: all focused and complete tests pass, and Vite builds successfully.

### Task 2: Package, install, and publish

**Files:**
- Build artifact: `release/EasyTranslate-0.0.2-amd64.deb`

**Interfaces:**
- Produces: corrected installed EasyTranslate 0.0.2 and a pushed `main` commit.

- [ ] **Step 1: Build the Debian package**

Run: `npm run dist:linux`

- [ ] **Step 2: Replace the installed package**

Stop EasyTranslate, remove `easytranslate`, install the rebuilt package, and
launch `/opt/EasyTranslate/easytranslate --show`.

- [ ] **Step 3: Verify the installation**

Confirm dpkg version 0.0.2, matching release/installed `app.asar` hashes, native
Wayland process mode, and `GlobalShortcutsPortal`.

- [ ] **Step 4: Commit and push**

Stage only the controller, tests, specification, and plan; commit the correction
and push `main` to `origin`.
