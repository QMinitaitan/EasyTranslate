# Final production-ASAR cohort: incomplete and not accepted

The first authorized final cohort stopped on a foreground precondition failure. It emitted **9 of 38 planned shortcuts**: one first invocation and eight warm invocations. Five captures reached their exact synthetic visible result and durable history; four warm captures timed out. Before invocation 10, the foreground HWND differed from the owned source, so the runner issued **no tenth Alt+Q** and exited 1 through cleanup. No automatic retry, relaunch, forced GC or threshold change followed that abort. A later comparison had separate explicit authorization and a known user idle interval, as linked below.

This first attempt **does not meet** final performance acceptance. Four observed warm timeouts already exceed the frozen maximum of two. The incomplete latency distributions, missing after-idle interval and absent natural-quit record cannot establish the remaining final gates. [The machine-readable report](2026-10-22-final-production-incomplete.json) retains every emitted attempt, the prevented invocation, all gate limits and partial comparisons. A partial numeric comparison is never a formal PASS. After this report's observations, a separately authorized [controlled idle-interval cohort](2026-10-22-final-production.md) completed all frozen gates using the same timed scripts and artifact; this first attempt remains failed and its cause unresolved.

## Product and measurement identity

- Production application source: `2e97ef06d5b91de1ba929ad87425a083006039ce`, including the flash-only request policy. The actual Windows executable and isolated installer have separate functional evidence; this performance runner uses stock Electron to load the unchanged production ASAR.
- ASAR: `E:\EasyTranslate-implementation-notes-20261020\windows-final-validation\production-2e97ef0\win-unpacked\resources\app.asar`; SHA256 `52059FFAB86FB8EC1900FDCC30E720ED481798E10F9957D63FB14D75BEE618E0`, independently checked before launch.
- Timed harness commit: `4f031292033b4abc6baacf353a833ccea00e5517`. The external `benchmark\final-production-2e97ef0-20261022\frozen-manifest.json` records stock Electron executable and all timed-script hashes. The later completeness qualification changes post-processing only; it does not change or repeat this timed run.
- Windows 10.0.26200, 16 logical processors; stock Electron **43.2.0**, embedded Node **24.18.0**. The causal PID-plus-birth sampler SHA256 is `899EE9392DC989B70F0A74D90FE7ABB6FE961BC32C23C162C0C129887608303B`.
- Frozen plan: seven fresh processes/profiles, 30 warm invocations, one deliberate empty selection, two 30-second idle intervals, fixed **50 ms** HTTPS response. Sampling, waits, source form and shortcut cadence remain frozen. No Node inspector or debugger attachment was used. Chromium's existing port 9333 flag remained present; stderr reports its loopback DevTools endpoint and the console-message deprecation warning.
- Real API budget: **zero**. Before selection/application imports, the launcher validated isolated fixture paths/configuration, installed exact synthetic endpoint/key/model transport, denied alternative Node/Electron network calls and admitted only the exact existing Windows copy helper. Both Electron and the source form received an environment allowlist. The guard is in-process instrumentation, not an operating-system firewall.

## Complete observed attempt ledger

Every emitted shortcut began with source HWND `6166600` as the foreground. The approximately 100 ms sampler then observed the following capture intervals. HWNDs identify observations, without attributing them to an application or actor.

| Invocation | Capture | Sampled departure from source during capture | Transport / visible DOM / history |
| --- | --- | --- | --- |
| 1, first | Exact synthetic source | 0 of 7 samples | One transport; exact visible result; accepted ID |
| 2, warm | `copy-timeout` | 14 of 15; HWND `14487152` | None |
| 3, warm | Exact synthetic source | 0 of 7 | One transport; exact visible result; accepted ID |
| 4, warm | `copy-timeout` | 10 of 15; HWND `14487152` | None |
| 5, warm | Exact synthetic source | 0 of 7 | One transport; exact visible result; accepted ID |
| 6, warm | Exact synthetic source | 0 of 7 | One transport; exact visible result; accepted ID |
| 7, warm | `copy-timeout` | 8 of 15; HWND `10688552` | None |
| 8, warm | Exact synthetic source | 0 of 9 | One transport; exact visible result; accepted ID |
| 9, warm | `copy-timeout` | 14 of 16; HWND `10688552` | None |
| 10, prevented | Not captured; no shortcut emitted | Foreground `10688552` before Alt+Q, expected `6166600` | None |

The final rejection occurred at epoch **1792654685098**, `2026-10-22T07:38:05.098Z`, about **64.293 s** after launch-start. All four timeouts correlate with a sampled departure during capture, while all five successes have no sampled departure. This is failure-time correlation; window ownership, the cause of focus changes and whether the product contributed are **unresolved**. A later live HWND-to-process mapping cannot establish historical ownership. No unexpected captured content was logged or delivered.

The five nonempty captures each produced exactly one transport with the same source, the exact `BENCH_TRANSLATED:` DOM value while visible, and an accepted history ID. The isolated history file contains exactly those five successes, newest first, with matching IDs/source/destination and `favorite=false`. The four copy timeouts generated no transport, successful result or history. The deliberate-empty case and the remaining 29 planned capture slots were not reached.

## Partial measurements, not final distributions

These nearest-rank summaries retain all emitted attempts. A result metric exists only where a result was observed; the timeout count remains explicit. With one first sample and four successful warm samples, P95 is especially coarse. DOM availability measures the observed mutation, not physical pixel presentation.

| Observed subset | n | Show P50 / P95, range (ms) | Visible result P50 / P95, range (ms) |
| --- | ---: | --- | --- |
| First | 1 | 776 / 776, 776–776 | 854 / 854, 854–854 |
| Warm, all attempts | 8 | 1062 / 1824, 743–1824 | Four results; four copy timeouts |
| Warm, successful only | 4 | 752 / 1062, 743–1062 | 820 / 1136, 807–1136 |

First selection took 743 ms, including a 602 ms native helper; capture-to-show was 33 ms and capture-to-DOM 111 ms. Across all eight warm attempts, selection P50/P95 was 1016/1781 ms and helper P50/P95 598/876 ms. The four successful warm captures had selection P50/P95 734/1016 ms and capture-to-DOM 89/120 ms. These values describe this interrupted run and do not replace the frozen seven/30-sample comparison.

Launch-to-app-ready was 1216 ms, main-document ready 1537 ms, hidden popup document ready 1785 ms, actual popup-ready IPC 1788 ms and observer-ready 1795 ms. During the measured before interval, both windows were hidden. This is preheat work rather than an independent installed-product startup result.

## Frozen gates

`UNAVAILABLE` means the required complete-cohort evidence does not exist. The JSON preserves the observed arithmetic in `observedComparisonPass`, while setting formal `pass=false` and an explicit status for every incomplete gate. The before/after resource and timeout limits are unchanged.

| Gate | Final status | Observation and frozen requirement |
| --- | --- | --- |
| Complete frozen cohort | FAIL | 1/7 fresh, 8/30 warm, 0/1 deliberate empty; after idle absent |
| No harness precondition violation | FAIL | Invocation 10 rejected for different foreground HWND |
| First successful show P50 improves | UNAVAILABLE | n=1 observed 776; frozen reference 923 ms |
| First successful DOM P50 improves | UNAVAILABLE | n=1 observed 854; reference 1120 ms |
| Successful warm show P50 | UNAVAILABLE | n=4 observed 752; limit 1037.3 ms |
| Successful warm show P95 | UNAVAILABLE | n=4 observed 1062; limit 1191.4 ms |
| Successful warm DOM P50 | UNAVAILABLE | n=4 observed 820; limit 1107.45 ms |
| Successful warm DOM P95 | UNAVAILABLE | n=4 observed 1136; limit 1269.6 ms |
| All-attempt warm show P50 | UNAVAILABLE | n=8 observed 1062 exceeds 1038.45 ms; partial distribution |
| All-attempt warm show P95 | UNAVAILABLE | n=8 observed 1824; limit 2040.1 ms |
| Cold capture timeouts ≤1 | UNAVAILABLE | Zero observed from only one first invocation |
| Warm capture timeouts ≤2 | FAIL | Four observed; later samples cannot remove them |
| All nonempty captures reach exact visible result and one transport | UNAVAILABLE | Observed subset 5/5 satisfies the invariant |
| Empty captures skip transport/result/history | UNAVAILABLE | Four copy timeouts satisfy it; deliberate-empty case unobserved |
| Text/HTML/RTF restored for all 38 captures | UNAVAILABLE | All nine observed captures restored all three fixtures |
| All 38 shortcuts/captures/completions observed | UNAVAILABLE | Nine observed; 10th prevented |
| Durable history equals latest successful captures in all seven runs | UNAVAILABLE | Observed run matches exactly five successes |
| Idle normalized CPU ≤1% | UNAVAILABLE | Before 0.0245%; after absent |
| After-idle private P50 ≤315.7828125 MiB | UNAVAILABLE | No after-idle sample; transient peak is not this metric |
| Exactly two created/live windows per run | UNAVAILABLE | Observed run created two, maximum live two |
| No retained process growth after 30 warm invocations | UNAVAILABLE | Before count five; 30 warm and after interval not reached |
| All seven runs exit naturally with code 0 | UNAVAILABLE | Abort cleanup, no normal quit/run-end record |

## Resource and cleanup evidence

The completed 30-second before interval retained 27.926 seconds after the frozen two-second exclusion, with 257 samples. Normalized full-tree CPU was **0.02448%**; private memory P50/P95 was **148.398/149.766 MiB**, range 146.652–149.770 MiB; summed working set P50/P95 was **383.449/385.434 MiB**. Five processes and two hidden windows remained present through this interval. It is not the required after-use steady measurement.

The interrupted full-tree series contains 581 creation-aware samples, a transient maximum of seven processes, **337.066 MiB** peak private memory and **557.246 MiB** peak summed working set. All nine helper PIDs were observed. Sampler work P50/P95 was 45/67 ms, range 36–106 ms. Observed cumulative process CPU was 9.125 s. Sample-delta normalized CPU P95/max was 6.330%/23.205%; newly discovered child lifetime CPU is charged on discovery, so these short intervals are not hardware peaks. Summed working sets may double-count shared pages. No after-use retained-memory/CPU/no-growth conclusion is available, and no forced collection was used.

The runner entered `finally` cleanup after the exception rather than its normal natural-quit path. A subsequent exact executable/owned source-command metadata check found **zero matching owned processes**; product PID 5516 and source PID 7580 were gone. This establishes cleanup, not natural exit 0.

The initial outer clipboard DataObject remained in driver memory. `clipboard-guard.json` reports **seven saved formats, final format presence restored=true, payloadLogged=false**. All nine product capture fixtures independently restored text/HTML/RTF. Format presence does not prove arbitrary opaque-object byte equality. Separately, earlier Windows functional attempts 1–8 lacked the outer snapshot and overwrote the initial clipboard with synthetic text; the original could not be restored. This remains a disclosed limitation and is not repaired by this cohort's successful final restoration check.

One 8-byte PowerShell `ModuleAnalysisCache` appeared under the owned source-form working directory rather than its per-run profile. Its content was not read. After absolute-path/no-reparse checks it was archived unchanged under this fresh run's `runner-side-effects/Microsoft/Windows/PowerShell/`. This confines the observed side effect to the owned checkout/raw archive, while preventing a claim that every source-form cache stayed inside the profile. No user's daily config/history or installation was opened or changed.

## Retained evidence and verification

All observations remain at `E:\EasyTranslate-implementation-notes-20261020\benchmark\runs-final-production-2e97ef0-20261022-1`. The JSON records SHA256 for the original driver/events/resources/source metadata/stdout/stderr/history and clipboard metadata. The frozen manifest and both prequalification/qualified derived reports remain in sibling `final-production-2e97ef0-20261022`. Historical successful and failed cohorts are unchanged.

The actual command used was:

```powershell
powershell.exe -NoProfile -Sta -File "D:\codex_worktree\easytranslate-t7\EasyTranslate\scripts\performance\run.ps1" -Repo "E:\EasyTranslate-implementation-notes-20261020\windows-final-validation\production-2e97ef0\win-unpacked\resources\app.asar" -ElectronPath "E:\EasyTranslate-implementation-notes-20261020\windows-final-validation\source-2e97ef0\node_modules\electron\dist\electron.exe" -OutputRoot "E:\EasyTranslate-implementation-notes-20261020\benchmark" -Label "final-production-2e97ef0-20261022-1" -ColdCount 7 -WarmCount 30 -IdleSeconds 30
```

The used label is retained and cannot be reused. Any further native diagnosis or formal run requires a separately defined plan and explicit root coordination; no automatic continuation is scheduled.

Light isolated Node/VM verification passed **7/7**: six native-harness rejection/preservation cases and one incomplete-evidence acceptance case. Both safety gaps and the incomplete-report case were observed RED before their fixes. Node and PowerShell syntax checks and whitespace checks passed. Reporting regression checks still classify the historical full #8 cohort PASS and the historical **329.7265625 MiB** cohort FAIL solely against the unchanged **315.7828125 MiB** steady-private limit. No new product build or native test was used for these post-processing changes.
