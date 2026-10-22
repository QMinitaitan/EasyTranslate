# Linux build and extracted-package validation — 2026-10-22

The Linux portion of Issue #11 passed on source commit `dd7a27427d96ce5c348c5af80f80c4d0a46c2a95` (tree `de8780e4ce609b9fad9e5da0285245338772abb2`). Native Linux `npm ci`, strict type checks, all **95 tests**, production build and production-config **amd64 .deb** creation passed. The actual binary extracted from that .deb then passed two separate launch/quit processes through WSLg X11, including real PRIMARY selection, popup UI and persistence. No product code or packaging configuration was changed for this validation.

Machine-readable evidence: [2026-10-22-linux-packaged.json](2026-10-22-linux-packaged.json). The [visible popup capture](2026-10-22-linux-packaged.png) was inspected: the source `LINUX EDIT` and result `LINUX RESULT LINUX EDIT` are clear and unclipped in a 380 × 500 window.

## Environment and artifact identity

- Ubuntu 22.04.3 x86_64 under WSL2, kernel `6.6.87.2-microsoft-standard-WSL2`; CLI Node **22.12.0**, npm **10.9.0**, electron-builder **26.15.3**. The packaged Electron is **43.2.0**, embedded Node **24.18.0**.
- Raw root: `E:/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-dd7a274-1` (Linux `/mnt/e/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-dd7a274-1`). Source, dependencies, package, extracted layout, Chromium profiles, caches, logs and captures remain there.
- Existing dependencies were downloaded and extracted into the separate prepared `linux/rootfs`; no system `apt`/`dpkg` installation, package post-install script, desktop-menu installation or daily application replacement was performed. `.deb` contents/control and the extracted desktop entry were inspected. Its command is `/opt/EasyTranslate/easytranslate --show %U`.

| Artifact | SHA256 |
| --- | --- |
| `package/EasyTranslate-0.0.2-amd64.deb` (99,286,860 bytes) | `ef87ac34207c4b335b224996022d62df90afd9ef4e077530939b3f4beaeeebef` |
| `installed/opt/EasyTranslate/resources/app.asar` | `2b1cfb6e99d3a6cb58b7828d53c2c882ce00543eac47b4079cdb92fe29940fa2` |
| `package/linux-unpacked/resources/app.asar` | `2b1cfb6e99d3a6cb58b7828d53c2c882ce00543eac47b4079cdb92fe29940fa2` |
| `runtime-fourth/popup.png` | `489d4b021d7d74db72048c82c73e7f7bbaf6f4608bb8f34d8024e0fe3eb057fd` |

## Observed behavior

The controller launched `installed/opt/EasyTranslate/easytranslate`, with `app.isPackaged === true` and `app.getAppPath()` inside the extracted `app.asar`. It attached only to that process's loopback Node inspector, paused at the first compiled `dist-electron/main.cjs` entry before application imports, installed external test instrumentation, and resumed the unmodified product. Five Electron paths (`appData`, `userData`, `sessionData`, `crashDumps`, logs) and XDG/temp paths were isolated. HTTPS was replaced only in the external probe with a controlled 50 ms synthetic provider; no real key, personal history or external provider traffic was used.

| Boundary | Result |
| --- | --- |
| Actual main/preload/Vue | Both launches loaded the production UI and context-isolated public API; no preload errors. |
| Startup/prewarm | Main visible on the first launch; one hidden popup, two windows total. Both `Alt+Q` and `Alt+E` registrations reported true. stdout recorded tray creation. |
| Native Linux selection | An owned external `xclip` process supplied only `LINUX PRIMARY` to X11 PRIMARY. The product socket accepted `trigger`; actual `getSelection()` logged `electron-primary`; provider/session/preload/Vue displayed `LINUX RESULT LINUX PRIMARY` in a visible popup. |
| UI/history | Editing the actual source element to `LINUX EDIT` translated again; the second real view received the history update. Clicking its favorite control persisted the favorite. Public reads returned exactly the two synthetic entries. |
| Popup | Clicking the real pin control made the UI active and the native window always-on-top. It was visible with a nonempty native handle; `capturePage()` produced the inspected 380 × 500 PNG. |
| Pending UI save and quit | The actual General checkbox was edited, then native `app.quit()` began **39 ms** later. A public config read immediately before quit still returned the old `launchToTray: false`, proving the 120 ms Vue debounce remained pending. The inspector had disconnected before quit. |
| Separate-process persistence | Relaunching the same product with the **same fixture HOME** read `launchToTray: true`, both history entries and the favorite through the public API. The main window was initially hidden, consistent with the saved setting. |
| Cleanup | Both processes reached `will-quit` and exited naturally with code 0. The Unix socket was removed after each. Owned xclip exit via SIGTERM was awaited. A subsequent read-only `/proc` check found no process whose command began with this exact packaged executable. |

## Native HOME and retained failed attempts

DrvFs cannot host this application's Unix socket. The successful controller used `fs.mkdtempSync('/tmp/easytranslate-pr12-')`, mode **0700**, verified real path, owner UID, path prefix and a unique ownership marker, then proved AF_UNIX listen/connect/close in that exact directory before launch. This was an explicitly authorized exception to the initial E-only test fixture layout. Its only final contents were synthetic config (2,035 bytes), history (461 bytes) and the ownership marker (171 bytes): **2,667 bytes**. Those regular JSON files were copied to `runtime-fourth/home` before the exact verified native directory was removed. Bulky profiles/caches/builds remained on E. Neither the real Linux user HOME nor Windows clipboard content was read or logged; xclip targeted PRIMARY only.

All attempts remain under the raw root:

1. `runtime-first` / `logs/runtime-first.log`: long DrvFs HOME yielded socket `EINVAL`; the socket path exceeded the Unix path limit.
2. `runtime-second` / `logs/runtime-second.log`: a shorter DrvFs alias yielded `ENOTSUP`, establishing the filesystem limitation.
3. `runtime-third` / `logs/runtime-third.log`: native socket, selection, translations and favorite succeeded. The probe's nested quoted selector then generated invalid JavaScript at the pin step. Failure cleanup also tried to recursively copy a socket, causing Node 22 `ERR_INTERNAL_ASSERTION` and masking the controller summary. Its failure/stdout/stderr, partial synthetic archive and recovery record remain. The owned native directory was already absent when recovery subsequently checked it; recovery did not delete another path. The corrected probe uses a simple selector, reports checkpoints and archives only explicit regular fixture files.
4. `runtime-fourth`: both processes and cleanup passed. See `summary.json`, `edit-result.json`, `verify-result.json`, `edit-will-quit.json`, `verify-will-quit.json`, `edit-quit-boundary.json`, `post-run-cleanup.json`, stdout/stderr and PNG.

These failures were test environment/tooling failures; no product patch was needed. Passing build/check results were reused without rerunning unchanged work after the interruption.

## Reproduction and limits

The checked-in tools are `scripts/testing/linux-build-validation.sh`, `linux-run-packaged.sh`, `linux-packaged-validation.cjs` and `linux-packaged-probe.cjs`. Use the already documented isolated `linux/env.sh` preparation. Build from a fresh `git archive` of the exact tested source inside a fresh owned validation directory; the build tool runs native `npm ci`, `npm run check`, electron-builder `--linux deb --x64 --publish never`, package inspection and `dpkg-deb --extract`. The recorded successful runtime command was:

```bash
bash /mnt/d/codex_worktree/easytranslate-t8/EasyTranslate/scripts/testing/linux-run-packaged.sh \
  /mnt/e/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-dd7a274-1 \
  fourth /mnt/e/EasyTranslate-implementation-notes-20261020/linux/env.sh
```

For a later run, substitute the current checkout path and a **fresh label**; existing runtime outputs and logs are rejected. The launcher sets isolated fonts/driver paths and calls the controller with the extracted product binary. The controller creates and cleans its own native HOME; it does not accept an arbitrary HOME path. Launch arguments were `--inspect-brk=127.0.0.1:0 --no-sandbox --ozone-platform=x11 --disable-gpu`. Root requires the sandbox flag; software rendering and WSLg X11 are explicit environment limits. Missing user D-Bus/GSettings warnings remain in stderr.

The production Wayland policy remains covered by the passing platform tests: preserve native display selection and enable `GlobalShortcutsPortal` for Linux Wayland, without forcing X11. This runtime deliberately selected X11. **Native Wayland portals, GNOME/KDE tray interaction, desktop-menu invocation, actual global-key input, audible speech, native dragging and distribution installation/uninstallation were not exercised here.** Runtime translation used one synthetic provider; Linux race UI and Windows focus/clipboard/performance are separate acceptance evidence. The PNG is a captured visible BrowserWindow, not a photometric latency measurement. No version, tag, release, `main` merge or remote mutation was performed by this validation worker.
