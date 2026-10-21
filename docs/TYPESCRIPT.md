# TypeScript runtime boundaries

The application entry is the actual compiled `dist-electron/main.cjs`, sourced from `electron/main.cts`. Main assembles desktop runtime, translation sessions, provider capabilities and durable configuration/history stores. The old main/preload implementations, forwarding CJS entries, positional translation calls and independent compatibility race runner have been removed after their actual callers migrated.

`npm run typecheck` performs strict Electron TypeScript checking and `vue-tsc --noEmit -p tsconfig.json`. All thirteen Vue components/views and their involved TypeScript composables participate, including templates, props/emits, DOM events, settings drafts and subscription ownership. `Window.api` remains optional for web preview. `electron/shared/ipc-contract.cts` owns the shared wire data and concrete operations. IPC inputs are still validated as unknown at runtime; static types do not validate another process.

`npm run build:electron` first removes only its resolved `dist-electron/` output, then emits the `.cts` source. This prevents removed source entries surviving as stale compiled files. Dev, test and production build run it before starting the application. Both `dist/` and `dist-electron/` are packaged and excluded from Git. Launchers resolve the package entry or an explicit benchmark override so archived original-source controls remain runnable.

Each BrowserWindow loads compiled `preload.cjs` directly with isolation and sandboxing. Its only runtime import is `electron`; shared imports are type-only. Retained tested CJS strategies (`selection`, `autostart`, `popup-auto-hide`, `popup-bounds`) have concrete `.d.cts` declarations. Typed code deliberately imports them from `../electron/`, whereas typed business modules import compiled siblings. These are real strategy implementations, not forwarding wrappers.

Settings retain renderer debounce behavior, but their concrete pending mutations survive a failed save and view unmount. Before native quit, main asks registered live renderer participants to flush; acknowledgements are scoped to the sender and token. Failure or a bounded timeout aborts quit, restores usable shortcuts and reveals the existing main error window. Successful quit waits for active selection cleanup before desktop geometry and durable storage queues. Existing configuration fields/credentials and history string/numeric IDs remain compatible. Native red/green evidence is recorded in `docs/validation/2026-10-22-typed-migration.md`.

Behavior tests exercise current single/race ownership, cancellation, persistence, IPC validation, pending settings and the useful retained platform/window policies. Hidden controlled Electron fixtures run real Vue/preload/main/storage and native quit/relaunch with isolated data; installed-product/native focus/resource gates are separate evidence. A fresh package must include compiled main/preload/business modules, frontend and retained source strategies. Verify the compiled entry/asset paths in unpacked and ASAR output.

For an offline unpacked build using a locally installed Electron distribution:

```powershell
npm run check
npx electron-builder --win dir --x64 '--config.electronDist=PATH\TO\electron\dist' '--config.win.signAndEditExecutable=false' --publish never
```

Disabling executable resource editing is limited to this local validation command. Release configuration keeps its existing behavior.
