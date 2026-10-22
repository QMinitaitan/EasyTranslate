# Windows packaged-product validation — 2026-10-22

The production Windows payload built from **`2e97ef06d5b91de1ba929ad87425a083006039ce`** passed 30 named functional checks in the actual `EasyTranslate.exe`, an isolated NSIS install/start/quit/uninstall lifecycle, and actual native header dragging and edge resizing. Every final applicable outer clipboard guard reported restoration. **The final packaged same-as-clipboard capture case remains invalid because foreground and native keyboard focus changed during capture.** The complete native series is therefore not reported as passing. Performance is reported separately and must satisfy the frozen gates.

Machine evidence: [2026-10-22-windows-packaged.json](2026-10-22-windows-packaged.json). The [native popup capture](2026-10-22-windows-packaged.png) was visually inspected: the pinned popup displays synthetic `NATIVE_DRAG` / `NATIVE_DRAG fast` clearly after actual resize, with unclipped controls. Bulky packages, logs, isolated profiles and all failed attempts remain outside Git at `E:/EasyTranslate-implementation-notes-20261020/windows-final-validation`.

## Artifact and build identity

| Artifact | SHA256 |
| --- | --- |
| Production `win-unpacked/resources/app.asar` | `52059ffab86fb8ec1900fdcc30e720ed481798e10f9957d63fb14d75bee618e0` |
| Production `win-unpacked/EasyTranslate.exe` | `8608ee5eccba07f3b3163712694c0e6161ef347512b3648d6152fb1020ede465` |
| Compiled preload | `51f4d3d50d132301bf1a225f6e8e5fea62656ba096cd03209d82791df86bf342` |

The source is a fresh `git archive` of `2e97ef0`; it includes the request-time DeepSeek flash restriction. Dependencies reuse the private tree from the earlier isolated `npm ci`, with unchanged lockfile. This final archive did not perform another `npm ci`. Strict Electron/Vue type checks, **97/97 offline tests**, production build and production-config Windows packaging passed. Electron is 43.2.0, embedded Node 24.18.0, builder 26.15.3. Build logs are `check-2e97ef0.txt` and `build-2e97ef0-2.txt`; the earlier CLI config-option quoting failure is retained as `build-2e97ef0.txt`.

`candidate-2e97ef0-identity.json` independently compares seven packaged files with the build. Main, preload, desktop-runtime, selection and HTML entry are byte-identical to the prior `dd7a274` payload. Provider-service and provider metadata differ and contain the new safety policy. The final ASAR is not the old `E8A991…E88` candidate.

## Isolation and paid-API boundary

No real paid model API calls were authorized. The inspected packaged CJS entry was paused before provider/session imports. Before resuming it, the harness verified isolated HOME/USERPROFILE/app-data/temp paths, explicit Electron profile/session/log/crash paths, synthetic keys, exact `.invalid` origin and the DeepSeek flash model. Only OS/runtime environment variables are inherited. The application has no test environment backdoor and its ASAR is unchanged.

The injected transport denies Node sockets, TLS, HTTP, HTTP/2, datagrams, fetch and WebSocket, plus Electron net/session fetch and external renderer requests. It denies Node children except the exact production PowerShell Ctrl+C command. Twelve negative operations must throw before product imports. The allowed HTTPS request is an in-memory synthetic response; it never opens a socket. Eight final-candidate processes passed this preflight (**96 negative self-checks**), producing **53 in-memory requests** across the curated functional/native/mouse/installer runs. No unexpected-text abort event occurred in these runs. Zero paid provider requests follows from this construction; this is **not** a provider billing audit and does not resolve the earlier usage complaint.

The test source is an owned, read-only WinForms TextBox. Before keyboard input, its actual foreground HWND, native TextBox focus, and expected synthetic selection are checked. Current source samples contain expected-selection booleans and lengths, never raw unexpected text. The captured result is checked against the exact expected fixture before transport/history logging; unexpected text is redacted and aborts the run. Mouse presses require `WindowFromPoint`/`GetParent` ownership immediately before pressing.

Every final fixture uses an outer STA `DataObject` snapshot held in memory and restored in `finally`; inability to preserve any format prevents launch, and restore failure fails the driver. All-profile testing stays under the external validation directory. No personal credential/config/history file was read by this worker. Daily program hashes and scoped registry/shortcut snapshots were checked. Scheduled continuation remains disabled. Historical unpaused runners are now explicitly disabled because they lack pre-import transport interception.

## Verified behavior and limits

| Boundary | Evidence and result |
| --- | --- |
| Actual packaged entry | Correct `process.execPath`, `resourcesPath`, `app.isPackaged`, packaged main and preload identities; no alternate app-path argument; two real BrowserWindows and Vue/preload readiness. |
| Sessions and race | Slow A / fast B, first success before slower comparison and history persistence, edited result survives later completion, current-session display/history ownership, physically late synthetic responses after cancellation attempts, single/race switching, partial/all/empty failures. |
| History and settings | Legacy values/defaults, both subscribed views receive history/config notifications, favorites and newest 20 recent retention, favorite/delete/clear, history failure without invented ID, settings-save alert/retry, partial saves preserve provider settings. |
| Existing UI | Source/destination edits, Copy, speech invocation with edited synthetic text, result cycling, actual theme DOM/storage and app language, pin/unpin native blur behavior, reset/close/hide/reuse. Speech invocation does not prove audible voice. |
| Tray and shortcuts | Tray/menu registration and actual menu callback; real Alt+Q travels through selection→provider→Vue for the successful native case. A physical system-tray icon click was not exercised. |
| Native capture | In post-startup cohort: selected text, empty selection and deliberate helper exit 7 passed; text/HTML/RTF/opaque-image restored in all four cases. Same-as-clipboard returned copy-timeout after foreign foreground/native focus loss, and is **invalid**, not a product-semantic pass. |
| Actual mouse input | After the real Vue Pin button and native visible/focused/always-on-top acknowledgments, native header drag changed bounds from `(610,226,380,500)` to `(663,268,381,500)`; bottom-right edge resize produced `(663,268,428,538)`. Both used real user32 mouse input with ownership guards. Scope is a pinned visible popup. |
| Quit | Functional, mouse and installed-startup processes exited naturally with code 0 after debugger disconnection. The immediate pending General setting was prepared for quit; broader pending-save failure/retry evidence remains in the separate #10 report. Failed diagnostic drivers that forced cleanup are not counted as natural exits. |

The post-startup same-clipboard case had 53 source samples during capture: 43 observed foreign foreground and missing native child focus, while expected selection remained true. Before Alt+Q, foreground, exact child focus and modifier release were valid. The helper exited 0 in 619 ms with zero stdout/stderr lengths. No product window show/focus event occurred until after capture ended. This localizes an environmental focus loss but does not identify its owner or cause at the failure time. A standalone exact helper control copied synthetic selection both directly and after consumed Alt+Q + 120 ms. It does not reproduce all packaged interactions. No production selection algorithm was changed.

Prior #9 native 48/48 checks and retained unit tests exercise the same byte-identical selection helper, including same-clipboard behavior. They remain prior component evidence; they do not replace a final packaged same-clipboard pass.

## Ordinary startup distinction

Prior-source bare `EasyTranslate.exe` runs `unpaused-show-1` and `unpaused-hidden-focus-2/summary.json` passed application startup and natural exit. The hidden run observed zero visible windows. Their startup components are byte-identical to this final payload, so they support this limited startup comparison. They are not fresh final-payload runs and had no new pre-import guard.

**Ordinary foreground stability did not pass.** `unpaused-hidden-focus-2/focus-result-utf8.json` records 188 samples with 81 bad samples. The original outer focus report also retains a UTF-8 parsing error. Neither record is silently promoted to a foreground pass. Fresh guarded native attempts 6 and 7 each recorded 33 stable prewarm samples; attempt 8 lost its source selection before product imports and correctly refused to resume. These observations remain separate. Inspector-paused functional startup timing is not ordinary launch latency, and no fresh unguarded bare executable was launched after the safety rules changed.

## Isolated NSIS lifecycle

`installer-build-2-2e97ef0` copies all 74 production package files, verifies their hashes and renames only the copied executable. The validation installer uses distinct `com.easytranslate.validation.pr12` appId/GUID, product/display names and `EasyTranslateValidationPR12.exe` basename. This also avoids the NSIS basename-wide process-kill fallback touching the daily app. It creates no desktop/start-menu shortcut, does not run after install, is current-user, permits no elevation and never publishes.

`installer-lifecycle-2-2e97ef0` passed on the first attempt: silent install **0** → actual installed validation executable under the guarded isolated profile, natural exit **0** → its exact registered uninstaller **0**. Installed EXE and ASAR match production bytes. Daily `D:/EasyTranslate` program hashes, existing registration and shortcuts remain unchanged. Validation registration was removed and the verified owned install directory was removed. This verifies application payload plus distinct validation metadata, not an installation of the production NSIS registration/shortcuts. Version, `main`, release/tag and autostart were unchanged.

## Retained failures and clipboard incident

All runs are retained; the JSON contains the full case ledger. Earlier functional 1–8 had harness/functional failures. Functional 9 was a guarded prior-candidate pass. Functional 10 stopped before product resume when the WebSocket negative self-test used a non-constructable arrow; a normal throwing function corrected the harness and the final functional 11 passed.

Native 1–5 retain their foreground/selection/setup failures. Native 6 had stable prewarm then copy-timeout with four-format restoration. Native 7 hit a command-file sharing race before any Alt+Q. Atomic replacement plus shared readers corrected that harness protocol; an independently held reader survived 100 replacements and the STOP command. Native 8 correctly stopped on selection loss before product resume. Post-startup native overall remains false for the invalid same-clipboard case. Mouse 1 refused ownership before a mouse press; mouse 2 used measured DOM/native scale and passed. Previous installer lifecycle 1 keeps both its initial uninstaller-availability failure and explicit resume result.

**An earlier automation mistake overwrote the original system clipboard.** Deliberate Copy probes in functional 1–8 wrote synthetic `EDITED COPY AND SPEECH` before an outer clipboard snapshot existed. The original clipboard content cannot be restored from these fixtures. Clipboard history was not inspected. This incident was disclosed to the user. Subsequent DataObject guards protect later runs and cannot repair the original overwrite. Do not summarize this work as preserving the original clipboard throughout.

## Reproduction pointers

Use the committed `scripts/testing/installed-product.cjs`, injection and suite through `run-installed-product.ps1` for functional validation, `run-installed-native.ps1 -PostStartup` for the explicitly limited native cohort, and `-MouseOnly` for the measured pinned mouse path. Always choose a new output directory; failed attempts must remain. `package-validation-installer.cjs` and `run-validation-installer.ps1` perform the distinct installer lifecycle. `collect-installed-identity.cjs` and `curate-windows-evidence.cjs` collect file and result identities without reading user data.

These commands act on the owned validation tree only; the controller rejects the daily install path. Before any future native run, re-check the current AGENTS rules, transport preflight, clipboard guard, root's physical/CPU ownership and user desktop availability. Set caches and temp explicitly under the external E: validation tree when rebuilding. Performance requires its own frozen cohort and is not inferred from these functional runs. Linux extracted-package evidence is in [the Linux report](2026-10-22-linux-packaged.md).
