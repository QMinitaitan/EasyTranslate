# Linux build and extracted-package validation — 2026-10-22

The final Linux candidate for Issue #11 passed on source archive **`64a97273aba387fe2287958d6b8b73c87fe277d5`**, tree `1e787640ba484664f62719408cda2d653bfa282c`. It includes API containment commit `2e97ef06d5b91de1ba929ad87425a083006039ce`: the packaged request-time DeepSeek flash policy is present. Native Linux **offline `npm ci`**, strict Electron/Vue type checks, **97/97 guarded tests**, production build and production-config **amd64 .deb** creation passed. Two processes of the actual binary extracted from that .deb then passed the controlled WSLg X11 runtime checks and exited naturally with code 0. This Linux worker changed validation scripts and evidence only.

Machine-readable evidence: [2026-10-22-linux-packaged.json](2026-10-22-linux-packaged.json). The refreshed [visible popup capture](2026-10-22-linux-packaged.png) was inspected: `LINUX EDIT` and `LINUX RESULT LINUX EDIT` are clear and unclipped in a 380 × 500 window. External runtime harness commit: `92567a92cbbd93159a6a673c5068a1b78b23e93f`; its later privacy checks do not change the packaged product payload.

## Environment and artifact identity

- Ubuntu 22.04.3 x86_64 under WSL2, kernel `6.6.87.2-microsoft-standard-WSL2`; native CLI Node **22.12.0**, npm **10.9.0**, electron-builder **26.15.3**. Packaged Electron **43.2.0**, embedded Node **24.18.0**.
- Current raw root: `E:/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-64a9727-final` (Linux `/mnt/e/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-64a9727-final`). Fresh source archive, dependencies, package, extracted layout, profiles, caches, logs and captures remain there.
- Dependencies are the previously prepared extracted `linux/rootfs` libraries. No system `apt`/`dpkg` installation, maintainer-script execution, desktop-menu installation or daily application replacement occurred. The inspected desktop entry is `/opt/EasyTranslate/easytranslate --show %U`.
- `logs/packaged-entry.json` confirms the packaged main is `dist-electron/main.cjs`; main, preload, provider guard, HTML and selection files are byte-identical to the fresh build. Installed-layout ASAR equals production `linux-unpacked` ASAR.

| Artifact | SHA256 |
| --- | --- |
| `package/EasyTranslate-0.0.2-amd64.deb` (99,287,172 bytes) | `51692959eb6495f4990a3899f94a8eaf5df12e1dc00f32c5739d8ee834f5ccbf` |
| `installed/opt/EasyTranslate/resources/app.asar` | `33b6d5bc2e1f5b9ed1ec1aa66bd1ff3f595a09e463f7b929774e7cd84a0e456b` |
| `package/linux-unpacked/resources/app.asar` | `33b6d5bc2e1f5b9ed1ec1aa66bd1ff3f595a09e463f7b929774e7cd84a0e456b` |
| `installed/opt/EasyTranslate/easytranslate` | `84e1078c8f38659f3785fec90b68ff47dcb7b5ed94e97e4e4cc6dd3290758991` |
| `runtime-guarded-final/popup.png` | `bc4e9cc6a0685ff79dd5d2d1d7766cd1190fd0e029c91f15c0a495e082e81350` |

## Safety boundary before application imports

The controller launched the real extracted executable, attached only to its loopback Node inspector and paused at the first compiled main entry. Each process returned a passing `edit-preflight.json` or `verify-preflight.json` **before product execution resumed**, with **zero prior product-module imports**.

- HOME/USERPROFILE point to the controller's verified owned native directory. `os.homedir()` matches it. All five Electron paths (`appData`, `userData`, `sessionData`, `crashDumps`, logs), APPDATA/LOCALAPPDATA, XDG paths and temp are explicit isolated fixture paths. Secret-bearing environment variables and inherited Node injection settings are removed.
- Only the DeepSeek fixture is enabled; its credential is synthetic, endpoint is `https://linux-fixture.invalid` and model is `deepseek-v4-flash`. No daily configuration/history or real key is loaded.
- The external probe replaces HTTPS with the same controlled **50 ms** response boundary before imports. It accepts only the fixture hostname, synthetic authorization and flash model. Node HTTP, TLS, HTTP/2, UDP, fetch, WebSocket and TCP routes are blocked; the exact owned product Unix socket is the sole Node socket exception. Electron `net.request`/`net.fetch` are blocked, and session-created handlers deny Chromium HTTP(S) and session fetch. Local blocked-route checks pass before execution resumes.
- WSLg may bridge PRIMARY across desktops. The real `getSelection()` return is checked before delivery to the desktop/session: it must be exactly `LINUX PRIMARY`; unexpected content causes a static redacted failure and process exit. Controlled provider input must be exactly `LINUX PRIMARY` or `LINUX EDIT` before it can enter logs, a response or history. Assertions do not print unexpected selection values.

The Node unit-test guard and native guard are separate mechanisms. Both were used in their respective scopes. This run issued **zero real paid model API requests**; it used only the in-process synthetic transport. No fallback, retry, scheduled API work or daily installed app was used.

## Observed behavior

Both launches reported `app.isPackaged === true` and an application path inside the extracted `app.asar`. The runtime uses the unmodified production main/preload/Vue with external instrumentation.

| Boundary | Result |
| --- | --- |
| Main/preload/Vue | Production UI and context-isolated public API loaded in both processes; no preload errors. |
| Startup/prewarm | First main window visible; one hidden popup and two windows total. `Alt+Q`/`Alt+E` registrations reported true; stdout recorded tray creation. |
| Actual Linux selection | An owned external `xclip` supplied synthetic X11 PRIMARY. The product Unix socket accepted `trigger`; actual selection returned `electron-primary`, and provider/session/preload/Vue displayed `LINUX RESULT LINUX PRIMARY` in the visible popup. |
| Editing/history/favorite | Editing the real source element to `LINUX EDIT` translated again. The second real view received history updates; clicking its favorite control persisted the favorite. Public reads returned exactly the two synthetic entries. |
| Popup | Clicking the real pin control made its UI active and native window always-on-top. A nonempty native handle and visible 380 × 500 `capturePage()` PNG were recorded. |
| Pending UI save and quit | General's actual Launch to Tray checkbox was edited, then native `app.quit()` began **35 ms** later. Immediately before quit, a public config read still returned `false`, proving the 120 ms Vue debounce remained pending. The inspector had disconnected first. |
| Separate-process persistence | The second process used the same fixture HOME and read `launchToTray: true`, both history entries and the favorite through public APIs. Its main window was initially hidden. |
| Cleanup | Both reached `will-quit` and exited naturally with code 0. The socket was removed after each. Owned `xclip` SIGTERM exit was awaited. A subsequent read-only `/proc` check found no process whose first command argument matched this exact packaged executable. |

The full interval had an outer **115-second deadline** and finished normally. Foreground/PRIMARY ownership was explicitly released after cleanup; no further Linux native run is retained.

## Native HOME and historical evidence

DrvFs cannot host this application's AF_UNIX socket. The explicitly authorized native exception remains `fs.mkdtempSync('/tmp/easytranslate-pr12-')`, verified real path, owner UID, **0700** mode, exact prefix and unique ownership marker. A listen/connect/close check in that exact directory passed before launch. Final contents were synthetic config (2,039 bytes), history (461 bytes) and ownership marker (182 bytes): **2,682 bytes**. Those explicit regular files were archived to `runtime-guarded-final/home`, then the exact verified native directory was removed. Bulky artifacts stayed on E.

The earlier `dd7a274` source run is preserved as [2026-10-22-linux-packaged-dd7a274.json](2026-10-22-linux-packaged-dd7a274.json) and raw root `E:/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-dd7a274-1`. Its first/second environment failures, third harness failure and fourth passing process pair remain unchanged. They were not repeated for this final candidate. Its older package and PNG hashes remain in that manifest; they are prior-source evidence and do not identify this guarded package.

## Reproduction and limits

Use the isolated prepared `linux/env.sh`. Build from a **fresh git archive** of the tested source inside a fresh owned validation root. `scripts/testing/linux-build-validation.sh` runs native `npm ci --offline`, `npm run check`, electron-builder `--linux deb --x64 --publish never`, package inspection and `dpkg-deb --extract`. Extra read-only package-entry inspection is retained as `inspect-package.cjs`/`inspect-package.sh` in the raw root. Build/check/package logs and SHA256 files are under `logs/`.

The successful runtime command was:

```bash
timeout --signal=TERM --kill-after=3s 115s bash \
  /mnt/d/codex_worktree/easytranslate-t8/EasyTranslate/scripts/testing/linux-run-packaged.sh \
  /mnt/e/EasyTranslate-implementation-notes-20261020/linux-validation-20261022-64a9727-final \
  guarded-final /mnt/e/EasyTranslate-implementation-notes-20261020/linux/env.sh
```

For another run, use the current checkout and a **fresh label**; existing output/log paths are rejected. The checked-in launcher/controller/probe are external test tools, not production backdoors. The controller creates, verifies, archives and removes its own small native HOME; it accepts no arbitrary HOME path. Its launch arguments are `--inspect-brk=127.0.0.1:0 --no-sandbox --ozone-platform=x11 --disable-gpu`. Raw evidence includes both preflights, result/will-quit records, quit boundary, stdout/stderr, summary, PNG and `post-run-cleanup.json`.

Root requires `--no-sandbox`; WSLg X11 and software rendering are explicit limits, and missing user D-Bus/GSettings warnings remain in stderr. Production Wayland policy is covered by the passing platform tests: retain native display choice and enable `GlobalShortcutsPortal` for Linux Wayland, without forcing X11. This runtime deliberately selected X11.

**Native Wayland portals, GNOME/KDE tray interaction, desktop-menu invocation, actual global-key input, audible speech, native dragging, system installation/uninstallation and Linux race UI were not exercised here.** Startup was inspector-paused to establish safety before imports; it is not unpaused foreground-focus evidence. Windows clipboard/focus/performance are separate acceptance evidence, and this Linux subset does not establish Windows clipboard preservation. The PNG is a visible BrowserWindow capture, not photometric latency evidence. No version, tag, release, `main` merge or remote mutation was performed by this worker.
