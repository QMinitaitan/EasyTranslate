# Typed migration and native quit validation (#10)

The runtime now starts the actual compiled `dist-electron/main.cjs`. Main assembles the existing deep modules and owns application/IPC lifecycle; the single/race session and desktop module retain their behavior. All thirteen Vue SFCs, their templates and involved composables are strictly checked by vue-tsc. The retained CJS selection, autostart and window policies have concrete declarations and their existing behavioral tests.

## Caller migration and compatibility

Removed product paths: old main/preload, config/history/providers/translate/race forwarding entries, independent compatibility race runner, positional translation/race overloads, unused saveFavorite/history:favorite bridge and unused popup:resize IPC. Popup's actual race caller now sends a request object. Ranking tests remain on the real ranking module; high-level session tests retain first-success, progress, current ownership and history coverage. IPC tests exercise the real compiled entry and existing history favorite operations. Launchers resolve package main or explicit benchmark override, retaining archived original-source control support.

`scripts/build-electron.cjs` resolves and cleans only this project's dist-electron output before compiling, so deleted entries cannot remain accidentally loadable or packaged. The sandboxed preload still has only Electron as a runtime import. Configuration credentials/unknown fields/legacy shortcut and history string/numeric IDs/custom fields retain their compatibility tests. Visual design, platform strategies and provider protocol scope remain unchanged.

## Red → green observations

| Behavior | Observed red | Final green |
| --- | --- | --- |
| General debounce and native app.quit | Actual checkbox edited false; restart/public read returned old true | New false preserved |
| General debounce and main closeAction=quit | Actual checkbox edited false; native close destroyed renderer before pending save | Close prevented until acknowledged flush; new false preserved |
| Normal debounce during an earlier write | Controlled older save completed; newer timer's save returned older result and durable state stayed older | Attached save continues with latest snapshot, without requiring quit |
| Quit during selection cleanup | Native quit reached will-quit before controlled selection Promise cleanup (62.8 ms, cleanup=false) | Final run waited for cleanup (222.0 ms, cleanup=true), sent no delayed popup trigger |
| Aborted quit while launched to tray | Failure feedback existed only in hidden DOM; existing main window was not shown | Abort restores usable actions and requests show/focus on the existing error window |

The first two native red fixtures are preserved outside the worktree as well as represented in the JSON. The native capture and hidden-feedback red fixtures and module red/green observation are also recorded. Setup errors are not counted as application regressions.

## Final native functional cases

The final built source passed **10/10 cases**, each using native application quit/main-window close and a fresh process for public configuration read:

| Cases | Edit/outcome |
| --- | --- |
| General × app.quit / close | launchToTray true → false, both preserved |
| API × app.quit / close | DeepSeek model original-model → quit-fixture-model, both preserved |
| Shortcut × app.quit / close | translate Alt+Q → empty, both preserved |
| Atomic config replacement failure | Quit aborted, window stayed usable, old durable value retained; repaired storage and quit again **without another edit**, new value preserved |
| Dropped renderer acknowledgement | Quit aborted after about 3023 ms with feedback; retry without another edit exited normally and preserved settings |
| Active selection cleanup | Quit waited for the controlled selection Promise; no late popup trigger |
| Loading main window | Quit while the document was still loading completed without waiting for an unregistered renderer; restart remained usable |

The six setting edits requested quit after about 1.2–4.9 ms, before their 100/120/800 ms debounces. Every final edit/verify process reached normal will-quit and exited successfully. Individual timing, aborted-quit state and restart read are in `2026-10-22-typed-migration.json`; these controlled lifecycle timings are not a native performance benchmark.

Main tracks only known live renderer registrations, authenticates each acknowledgement by sender/token, and bounds acknowledgement wait. A failed flush/timeout aborts quit, reveals the error window and restores shortcuts. Unsaved setting mutations survive failed saves and view unmount; newer edits supersede retained older drafts. Once acknowledged, quit waits for selection cleanup, desktop geometry and history/config queues. New translation/probe/history work is refused while draining. Successful shutdown removes participant listeners, session subscriptions and desktop-owned work.

## Same-application flow

One isolated application ran single translation, held/failed history save, real copy IPC, retry, favorite/unfavorite including failure, delete/clear, actual API and General setting changes, two-engine race, comparison switch/edit, pin/unpin, native resize, UI size reset, hide and history revisit. Both existing Home subscribers observed durable history changes. A separate race regression retained first success before slower engines/history, comparison edits and current-only history across both mode switches.

These fixtures use actual built Vue, compiled preload, main, durable file adapters and native app lifecycle. Synthetic transport, file errors and one acknowledgement drop control timing/failure. Windows stay hidden through show/focus interception, clipboard writes are intercepted, and no paid API or real user data is used. The show request on an aborted hidden quit is asserted at the native window boundary. Hidden compositor screenshots are not treated as evidence. Installed-product focus/clipboard/performance and fresh packaging belong to #11.

## Checks and reproduction

Final `npm run check` passed strict Electron typing, vue-tsc SFC/template checking, **95 tests** and production build. Tests include four public pending-settings regressions: failed drain retry after view release, latest edit after in-flight write, a normal timer firing during an older save, and remount supersession. Public IPC tests cover malformed data, acknowledgement identity, failed-quit retry and refusal of new work while draining.

This worker reused the existing Electron/dependency junction and ran the new vue-tsc from the renderer worker's verified tooling on PATH. No npm ci or dependency-junction replacement was used. The exact check environment was:

```powershell
$env:Path = 'D:\codex_worktree\easytranslate-t7\EasyTranslate\node_modules\.bin;' + $env:Path
npm run check
```

Native fixtures use PowerShell 7 (`C:\Users\mini0\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe`):

```powershell
./scripts/testing/run-quit-durability.ps1 -Setting general -Mode app
./scripts/testing/run-quit-durability.ps1 -Setting api -Mode close
./scripts/testing/run-quit-durability.ps1 -Setting shortcut -Mode close
./scripts/testing/run-quit-durability.ps1 -Fault disk -Mode close
./scripts/testing/run-quit-durability.ps1 -Fault timeout -Mode close
./scripts/testing/run-quit-durability.ps1 -Setting capture
./scripts/testing/run-quit-durability.ps1 -Setting startup
./scripts/testing/run-session-ui-smoke.ps1 -Scenario flow
./scripts/testing/run-session-ui-smoke.ps1 -Scenario race
```

Each runner requires a new/empty isolated fixture directory. The final JSON and needed logs/config/exit evidence were copied outside the worktree to `E:\EasyTranslate-implementation-notes-20261020\typed-migration-native-evidence-20261022`; browser caches are unnecessary. #11 must independently install the final lockfile in a fresh tree and verify compiled/ASAR paths.

Excluded attempts: a root-checkout control launch had missing ignored compiled provider output and was stopped after verifying its process identity; it measured no application behavior. An initial combined-flow selector matched OpenAI text in another provider's description; narrowing it to the provider title produced the passing final run. Both are listed separately in the machine report.
