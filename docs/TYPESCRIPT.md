# TypeScript compatibility stage

The first migration adds a compiled preload and shared IPC contract while retaining the existing CommonJS main process and JavaScript Vue views. `electron/shared/ipc-contract.cts` owns wire data, channel arguments/results, the public `EasyTranslateApi` and runtime validation for translation input. `src/env.d.ts` gives renderer TypeScript the same API. Existing positional calls remain valid; callers may also pass a `TranslationRequest` / `RaceRequest` object.

`npm run typecheck` checks the migrated Electron files and renderer TypeScript entry. Existing JavaScript Vue scripts/templates are not yet type checked; this is an expand–contract stage, not a claim that the entire application is typed. Migrate affected logic with its behavioral ticket instead of weakening the shared contract.

`npm run build:electron` emits `.cts` files under `electron/` as `.cjs` under `dist-electron/`. `npm run dev`, `npm test` and the production build run that step. After a fresh checkout use one of these commands before manually invoking `electron .`. Both `dist/` and `dist-electron/` are included in packaged applications and excluded from Git.

Each BrowserWindow loads `dist-electron/preload.cjs` directly. Electron's sandboxed preload cannot require an arbitrary local forwarding module. Shared preload imports are therefore type-only and erase; its sole runtime import is `electron`. Main-process validation loads the compiled shared module normally. Keep context isolation and the sandbox enabled. The unused legacy `electron/preload.cjs` is retained temporarily for migration comparison; it is not the window's runtime preload.

Compatibility verification exercises the compiled preload through its exposed API: old/new translation and race calls have identical payloads, race identity survives and event subscriptions can be released. Main IPC tests use isolated HOME/USERPROFILE storage and assert malformed requests become controlled errors. The explicit Linux Wayland/X11 and Windows startup tests exercise platform policy independently of the test host.

Windows artifact validation for this stage built `release/win-unpacked` with Electron 43.2.0 and inspected its ASAR for the main entry, compiled preload, shared contract and frontend. The compiled preload's only runtime import was `electron`. This archive check does not establish NSIS installation or Linux desktop execution; native smoke and performance evidence are recorded separately.

For an offline unpacked build using a locally installed Electron distribution:

```powershell
npm run check
npx electron-builder --win dir --x64 '--config.electronDist=PATH\TO\electron\dist' '--config.win.signAndEditExecutable=false' --publish never
```

Disabling executable resource editing is limited to this local validation command. Release configuration keeps its existing behavior.
