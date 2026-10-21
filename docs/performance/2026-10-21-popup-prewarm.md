# Popup prewarm and desktop lifecycle verification

The final integrated production source **`6223e2e194fb07fa90550e4d1d48bf3cffd9148b`** passes the unchanged [frozen gates](2026-10-20-protocol.md) on this Windows desktop. First captures succeeded **6/7**, warm captures **28/30**: the three retained copy timeouts match the baseline counts, and every one of the 34 nonempty captures reached a visible DOM result. All 38 selection attempts restored the text/HTML/RTF clipboard fixture, the intentional empty selection made no translation request, and all seven application processes exited naturally with code zero.

This source includes integration `3558c74` (durable history and the Forms copy helper). Its total latency improvement combines those changes with the popup lifecycle work. The separate original-helper cohort below isolates the window work and retains its failed absolute-latency outcome.

## Final comparison

The [final full summary](2026-10-21-popup-final.json) retains individual attempts and ranges; [gate and source records](2026-10-21-popup-gates.json) contain exact limits, component hashes, startup readiness, exits and the timeout foreground audit. Values below are P50 / P95, milliseconds unless stated. First-path successful n=6 gives a coarse P95 near the maximum, rather than a confidence bound.

| Successful path | Frozen baseline | Final integrated source |
| --- | ---: | ---: |
| First shortcut → popup show | 923 / 986 | 830 / 894 |
| First shortcut → visible DOM result | 1120 / 1192 | 897 / 962 |
| First selection complete → DOM result | 240 / 309 | 105 / 132 |
| Warm shortcut → popup show | 902 / 1036 | 757 / 781 |
| Warm shortcut → visible DOM result | 963 / 1104 | 823 / 856 |
| Warm selection complete → DOM result | 91 / 116 | 85 / 102 |

All-attempt show timing, including empty results from the copy timeouts, is 834 / 1712 first and 763 / 1695 warm (baseline 935 / 1952 and 903 / 1774). DOM timing is necessarily conditional on a nonempty captured result; failures have not been removed from the attempt ledger. The final first helper execution is 656 / 721 and warm helper execution 600 / 631. Electron app-ready and main document startup P50 are 231 and 549 ms; popup application-ready is independently recorded for every launch, rather than inferred from document load.

| Idle resource | Frozen baseline before / after | Final before / after | Frozen limit |
| --- | ---: | ---: | ---: |
| Normalized process-tree CPU % | 0.070 / 0.273 | 0.060 / 0.158 | ≤ 1.0 |
| Private MiB P50 | 222.36 / 274.59 | 147.18 / 245.63 | after ≤ 315.78 |
| Private MiB P95 | 230.08 / 340.54 | 148.98 / 269.64 | P50 gate above |
| Summed working set MiB P50 | see baseline JSON | 376.30 / 442.87 | observation |
| Steady process count P50 | 4 / 5 | 5 / 5 | no linear growth |
| Created / maximum live windows | 1 before, 2 after | 2 / 2 in each run | reuse one popup |

Idle intervals are 30 seconds with the analyzer's existing first-two-second exclusion (final retained durations 27.823 / 27.809 seconds). Before first use both windows are hidden; after repeated use one popup remains visible throughout the final idle interval. The baseline after interval contains both visible and hidden observations. These measurements do not establish resource bounds after opening the main window or under every visibility state. The long run has a transient private peak of 351.45 MiB, working set peak 560.09 MiB and at most seven processes including helper children; after-idle process P95 is five, maximum six. The memory gate is the predeclared steady P50, not a retroactive peak threshold. No forced GC or thread-pool tuning was used.

The three copy timeouts are `cold-1-invoke-2`, `cold-1-invoke-30`, and `cold-5-invoke-1`. Foreground sampling observed a window outside the synthetic source during all three capture intervals; the second already had that foreground at shortcut emission. This is a correlation, not proof of the precise Ctrl+C failure or child-control focus. The unrelated HWND is recorded numerically without attributing it to an application or user action. The separate prewarm guard below samples continuously from before hidden window creation without reactivating the source.

## Source and retained experiment ledger

Raw events, sampled identities, synthetic profiles and stderr remain under `E:\EasyTranslate-implementation-notes-20261020\benchmark`. Each directory below has the prefix `runs-`. JSON committed here is derived evidence; original raw runs and the baseline have not been replaced. Controls with one first capture and 30 warm captures diagnose a variable and are not substituted for the required seven-launch acceptance cohort.

| Raw directory suffix / source | Result retained and interpretation |
| --- | --- |
| `prewarm-originalhelper-20261021-1` / `9635f97` | First two captures worked; subsequent captures restored the clipboard but did not show/translate. Minimal repeat and event probes established that same-document navigation during hide cleared readiness without another application-ready handshake. Readiness now resets only for a new main document, renderer loss, or authenticated unready event. Public regression and native three-capture repeat passed. |
| `prewarm-originalhelper-causal-20261021-2` / `d957e2f` | 37/37 nonempty results, but private P50 340.35 MiB exceeded 315.78 and all seven exits required runner termination. A separate hidden quit loop reproduced `Object has been destroyed`: the closed callback read the destroyed window's `webContents` getter. Caching the original emitter fixed the public red test and native quit. This failed cohort remains unchanged. |
| `original30-control-causal-20261021-1` / original `6c85be6` | Same creation-aware sampler, 1+30 successful captures and natural exit0; before / after private P50 185.00 / 252.14 MiB. The earlier `original-control-causal-20261021-1` was only a 1+1 pilot. |
| `prewarm-quitfixed30-causal-20261021-1` / `28a2515` | 1+30 successful captures, exit0, but after private P50 328.44 MiB still failed. |
| `diagnostic-lazy28a2515-causal-20261021-1` / external prewarm-disabled wrapper only | After private P50 329.89 MiB: pre-creation alone did not explain the retained cost. Single first post-capture show / DOM was 178 / 253 ms versus 23 / 84 ms with prewarm enabled; this n=1 contrast is a narrow diagnostic observation. |
| `diagnostic-no-hidden-paint28a2515-causal-20261021-1` / external popup painting option only | After private P50 293.72 MiB, 31/31 results, exit0; actual GPU private allocation fell about 40 MiB while browser-main native private remained approximately 76 MiB. This supported disabling initial hidden popup painting. It does not prove absence of all heap leaks. |
| `prewarm-final-originalhelper-eceae9d-20261021` / `eceae9dc3ccbf709a4376ecaadc5626663743afc` | Full seven-launch window-only cohort, original helper unchanged: memory 292.72 MiB and all exits passed, but absolute latency **failed** (first show 1539 / 2930, DOM 1618 / 2993; warm show 910 / 1719, DOM 970 / 1794). First helper elapsed 1374 / 2765 had also increased. Window-local post-capture first DOM 101 / 106 improved against 240 / 309; warm 85 / 101 against 91 / 116. No specific external cause for helper elapsed variation was proven. [Full failed summary](2026-10-21-popup-prewarm.json). |
| `popup-integrated-forms-05ffa39-20261021` / `05ffa39dc9ec3294e96f84124d661b6b74be118a` | Integrated history + Forms helper: 37/37 results, seven exit0 and latency passed, but after private P50 **329.73 MiB failed**. Role snapshots identified GPU allocation increase, rather than inferring role from a PID. [Full failed summary](2026-10-21-popup-before-main-paint.json). |
| `diagnostic-main-no-hidden-paint05ffa39-causal-20261021-1` / external main painting option only | Same source and 1+30 protocol; after private P50 247.45 MiB, 31/31 results, exit0. Main's default initial painting while tray-hidden explained the measured difference. Product now derives its paint option and initial show behavior from the same startup visibility decision. [Control summaries](2026-10-21-popup-controls.json). |
| `popup-final-both-hidden-6223e2e-20261021` / final `6223e2e194fb07fa90550e4d1d48bf3cffd9148b` | Production launcher without diagnostic wrappers; seven first attempts, 30 warm, both 30-second idle phases. All 14 recorded gate assertions pass, with the retained capture failures stated above. |

The popup and tray-hidden main now use `paintWhenInitiallyHidden: false`. Initially visible main startup keeps its paint and `ready-to-show` path; hidden startup can later open without waiting for that event. [Electron documents the initial visibility and `ready-to-show` consequences](https://www.electronjs.org/docs/latest/api/structures/browser-window-options); the memory reduction is empirical evidence above, not an API guarantee. Popup readiness uses explicit Vue configuration/listener initialization, independent of that event. [The lifecycle guide](../DESKTOP-RUNTIME.md) documents selection ordering, latest pending intent, authenticated readiness, same-document reuse, geometry, Wayland and quit flush behavior.

## Functional checks and measurement limits

`npm run check` passed **88 tests**, TypeScript checking and the production Vite build for the final runtime source. [Native validation results](../validation/2026-10-21-desktop-native.json) retain:

- Source foreground, selection and clipboard remained stable for 36 samples from before startup through hidden prewarm/application-ready, with no hidden show/focus; the subsequent real shortcut translated exactly A and exited naturally.
- Two real captures A/B while configuration initialization was held retained only B for adapter, visible DOM and durable history after application-ready. Both captures restored clipboard data; the prewarm foreground guard remained stable.
- Tray-hidden, ordinary visible, `--show` override and `--hidden` startup all passed; hidden modes subsequently opened the main window and displayed seeded history. All four exited0, as did a dedicated hidden quit regression.
- Integrated hidden history and race smokes retained their DOM/IPC/durable-storage assertions, cancellation, save-error behavior and manual selection protection. A screenshot was explicitly unavailable with `Current display surface not available for capture`; other screenshot errors still fail the harness. No production paint option was overridden to make a hidden screenshot pass.

The final sampler records PID plus creation time and causal parent identity, retaining validated orphan identities and preventing CPU attribution across PID reuse. It addresses an impossible CPU jump found in the separate helper experiment. Frozen raw data has no birth metadata, so its ancestry cannot be proven retrospectively, even though the later audit found no impossible CPU jumps there. Sampling overhead is **not identical**: final long-run sampler work P50 / P95 was 66 / 85 ms, versus earlier creation-aware control 30 / 44 ms. The same-sampler original control helps assess resources; it does not erase changing desktop conditions or make cross-cohort attribution exact. Short children may be missed at approximately 100 ms sampling. Summed working sets can count shared pages more than once.

All tests used isolated synthetic profiles, fake credentials and an in-process 50 ms HTTPS response. They exercised the real adapter and native copy helper without paid/network provider calls. The installed app and personal configuration were not replaced. DOM observation establishes result availability with visible document state, not physical pixel presentation. Installed NSIS behavior, Linux runtime/Wayland compositor behavior, visible pixel capture and real third-party services remain final integration validation work in #11.

To reproduce with a fresh output label, after building and obtaining an uncontested interactive desktop:

```powershell
npm run check
powershell.exe -NoProfile -Sta -File scripts/testing/run-prewarm-native.ps1 -Mode focus
powershell.exe -NoProfile -Sta -File scripts/testing/run-prewarm-native.ps1 -Mode queue
powershell.exe -NoProfile -Sta -File scripts/testing/run-desktop-quit.ps1
powershell.exe -NoProfile -Sta -File scripts/performance/run.ps1 -Label popup-review-NEW
node scripts/performance/analyze.cjs .runtime/performance/runs-popup-review-NEW
```
