# Measured Windows copy helper (#9)

The Windows helper now loads the built-in `System.Windows.Forms` assembly and calls `SendKeys.SendWait('^c')`, using the same Windows PowerShell executable, STA mode and 2.5 s process timeout. The paired experiment supports a modest local improvement: helper median 655.95 → 568.88 ms and capture median 802.54 → 710.48 ms. Eighteen of twenty matched rounds improved; two were slower. The 120 ms shortcut-release wait, nominal 700 ms/25 ms sentinel poll, supported clipboard restoration and other platform adapters remain in place.

This is a helper comparison with the existing lazy popup. It does not claim popup-preheat gains, faster external providers or a universal Windows latency guarantee. [The frozen original baseline](2026-10-20-baseline.md) and its acceptance thresholds are unchanged.

## Protocol and provenance

[The protocol](2026-10-21-selection-protocol.md) was written before changing the product helper. The formal run used unchanged integration `9d6fc07`, injecting either the original public copy dependency or the candidate command into the real selection service. Both variants ran inside the same application, alternating which went first in each round. Twenty selected captures per variant included ten Chinese inputs and six inputs equal to the previous clipboard fixture. Each variant also had two empty selections and two actual PowerShell `exit 1` failures. No attempts were discarded.

The source was a native Windows WinForms TextBox selected through the real Alt+Q shortcut. Main process, selection, preload, Vue, adapter and isolated file history ran normally. Only the HTTPS transport was replaced with a deterministic 50 ms synthetic response. The clipboard fixture simultaneously contained text, HTML, RTF and a real opaque 2×2 image. Image restoration was compared through bitmap hashes. The outer runner kept the user's readable clipboard formats only in memory and restored them after exit; no personal clipboard payload, configuration or credential was logged.

Environment: the original protocol's Windows machine and 16 logical processors; Windows PowerShell 5.1.26100.9711 / CLR 4.0.30319.42000; Electron 43.2.0 / embedded Node 24.18.0. CLI analysis used Node 26.7.0. Shared-desktop scheduling, file caches, instrumentation and the sampler affect elapsed time. Capture timing includes the same fixture/audit instrumentation for both variants.

Raw synthetic observations remain at `E:\EasyTranslate-implementation-notes-20261020\selection-comparison\runs-paired-20261021\`: `events.jsonl`, `driver.jsonl`, `resources.csv`, stdout/stderr and the analyzed `summary.json`. [The committed summary](2026-10-21-selection-comparison.json) contains every attempted capture, foreground/restoration outcome, quantile and paired difference. The earlier two-pair pilot is retained in `runs-pilot-20261021`; its initial DOM observer suppressed a repeated equal result. That observer was corrected before the formal run, and all forty formal selected results were observed.

## Timing and capture results

Quantiles use nearest rank, twenty selected attempts per variant, milliseconds:

| Stage | Original P50 | Forms P50 | Original P95 | Forms P95 | Original max | Forms max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Helper process, startup through exit | 655.95 | 568.88 | 942.11 | 812.68 | 1084.67 | 907.09 |
| Complete capture | 802.54 | 710.48 | 1081.77 | 939.54 | 1218.54 | 1043.55 |
| Requested 120 ms release wait, observed | 129.13 | 128.83 | 133.17 | 132.15 | — | — |
| Clipboard restore | 0.60 | 0.58 | 0.90 | 0.83 | — | — |

The median reduction is 87.07 ms (13.3%) for the helper and 92.07 ms (11.5%) for capture. Matching the same source round gives median original-minus-Forms differences of 83.85 and 87.74 ms respectively. Capture differences range from −182.02 to +347.18 ms; Forms is not faster on every call. Both P95 values improved relative to the paired control without relaxing the frozen degradation tolerance. Final application performance gates remain a separate acceptance step. The setup-only experiment suggested the candidate but is not the performance proof.

All successful copies were already available at the first clipboard read after the helper, so measured successful-path poll waits were zero. Empty selections still exhausted the same nominal 700 ms poll loop; actual elapsed waits can exceed that budget because timer scheduling is not exact. No wait was shortened to obtain the result.

- Original and Forms each captured 20/20 selected inputs, including 6/6 inputs equal to the previous clipboard text.
- All 48 attempts had the expected selected/empty/failure outcome, restored all four fixture formats and started with the intended source in the foreground. Every resource sample during capture also observed that source foreground HWND. Sampling cannot prove the foreground at every instant.
- Each variant's two empty selections returned `copy-timeout`; its two real failed helper processes returned `copy-command-failed`. Neither path sent a translation or produced a history record.
- All forty selected results reached the actual DOM. Retained history contained twenty synthetic entries, respecting the existing limit. The application created two windows with no repeated window growth.

DOM P50/P95 was 887/1314 ms for original and 793/1032 ms for Forms. Those values are secondary: the first original attempt also created the lazy popup, so the table above isolates the helper/capture stages instead of attributing popup creation to the helper.

## Resource attribution audit

The formal run sampled the entire purported descendant tree approximately every 100 ms, including all 48 observed helper PIDs. Its sampler cost was P50 38 ms / P95 56 ms / maximum 72 ms. However, auditing per-interval CPU discovered a corrupt attribution in `original-selected-6`: sample 467 added four PIDs and 121.125 cumulative CPU seconds over a 103 ms interval. The old sampler inferred ancestry from parent PID alone and used PID alone for CPU history. A stale parent link after PID reuse can admit an unrelated process. The CSV lacks process creation times and per-process counters, so those historical totals cannot be reconstructed safely.

Follow-up live identity checks found suspect PIDs 36524 (`conhost`) and 31004 (`python`) still running since 2026-10-19 07:52 UTC, before the formal application launch. These two process lifetimes establish that the old tree included unrelated processes. No unrelated process contents, command lines or paths were read.

Consequently, the old reported 602.49 MiB peak and eleven-process maximum, all original-run transient resource comparisons, and any claimed per-helper CPU improvement are **not acceptance evidence**. They remain in the JSON as flagged raw observations, rather than being silently removed or corrected. Functional results, stage timers and foreground/restoration events are recorded independently. The mixed-run idle values also cannot identify either helper's retained cost.

The seven immutable original-baseline CSVs were checked offline: none has the same impossible-size CPU jump (largest adjacent aggregate CPU increment 0.484375 s). That absence does not prove correct historical ancestry. Their raw files, published values and gates are retained with this provenance limitation; final acceptance must use the corrected sampler and the existing thresholds.

Future runners use `scripts/performance/process-sampler.cs`. It requires a child to be born no earlier than its actual parent and application root, retains previously validated descendants after a parent exits, rejects reused root/child identities and keys CPU history by PID plus birth time. Appended CSV metadata records `pid:parent:birthTicks:cpuSeconds:privateBytes:workingSetBytes` for later audit. Deterministic fixtures verify stale-parent exclusion, live-orphan retention and both PID reuse cases. Approximately 100 ms sampling still misses sufficiently short-lived processes and cannot measure true continuous peaks; summed working sets can double-count shared pages.

## Creation-aware resource confirmation

After the separate popup experiment released the foreground, a fresh three-pair plus eight-edge run exercised the actual committed production helper on `42dfa78` (includes integration `50efe7a`, without popup preheat). [Its separate summary](2026-10-21-selection-resource-confirmation.json) records the selection source hash, sampler hash and raw-file SHA256 values. Raw observations are retained beside the formal run in `runs-resource-confirmation-20261021-1`; this small confirmation does not replace the twenty-pair latency dataset.

All fourteen attempts had the expected outcome, all fourteen helper PIDs appeared in the sampled tree, all four formats restored on every attempt, all six selected results reached the DOM and foreground mismatches remained zero. The six retained history entries were synthetic. The application exited with code 0 and the outer clipboard restore succeeded. Two windows were created, with maximum two live windows.

The creation-aware audit checked 241 samples / 1,311 process entries: zero unattributable identities, invalid birth relationships, process-count mismatches, memory-sum mismatches or cumulative CPU-counter mismatches. Sampler overhead was P50 31 / P95 43 / maximum 76 ms. The selected-attempt resource observations below are for the entire sampled application tree, including native helpers; three observations per variant make P95 equal the maximum.

| Resource during selected capture | Original min / P50 / max | Production Forms min / P50 / max |
| --- | ---: | ---: |
| Peak private MiB | 275.63 / 376.82 / 396.96 | 370.84 / 380.83 / 384.85 |
| Peak summed working-set MiB | 439.83 / 540.36 / 560.18 | 530.07 / 537.98 / 538.61 |
| Maximum observed process count | 7 / 8 / 8 | 7 / 7 / 7 |
| Sampled aggregate CPU seconds | 0.59375 / 0.625 / 0.640625 | 0.515625 / 0.546875 / 0.609375 |
| Sampled CPU normalized to 16 logical processors, % | 5.14 / 5.83 / 6.08 | 4.94 / 5.22 / 6.96 |

Across all fourteen attempts, sampled peak private/working-set totals were 414.86/560.77 MiB and maximum process count eight. The first original capture precedes lazy popup creation; subsequent captures include that renderer, explaining its smaller minimum. Forms' private-memory median is slightly higher in this small cohort even though its observed maximum is lower. Sample boundaries affect CPU deltas, and Forms' normalized CPU maximum is higher. These observations establish measured transient resources with validated ancestry; they do **not** establish a general memory/CPU improvement or a retained-memory result. Final application idle/growth gates still require their full sample sizes and original thresholds.

The short confirmation also preserved the direction of the timing result (capture P50 834.70 → 725.95 ms; helper 695.03 → 593.26 ms), but the twenty-pair run remains the timing evidence.

## Implementation and reproduction

The production helper is the exact Forms command tested above, with no resident helper, added runtime or dependency. [Microsoft documents](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type?view=powershell-5.1) loading an existing assembly via `Add-Type -AssemblyName`, whereas the original helper compiled a C# P/Invoke type on each call. [SendWait's documented timing and cross-process limitations](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.sendkeys.sendwait?view=netframework-4.8.1) are why the sentinel poll remains necessary.

Three public selection tests were added red → green for a rejected copy operation, failed snapshot and failed clipboard read during detection. They verify controlled empty outcomes and unchanged/restored content; Linux PRIMARY selection tests remain green. `npm run check` after merging integration `50efe7a` passed typechecking, all 70 tests and the production build. The sampler's creation-time fixtures and JavaScript syntax checks also passed.

From a Windows interactive desktop with exclusive foreground ownership, after `npm run build`:

```powershell
powershell.exe -NoProfile -Sta -File scripts/performance/selection-comparison/run.ps1 -Label fresh-paired
node scripts/performance/selection-comparison/analyze.cjs .runtime/performance/selection-comparison/runs-fresh-paired
powershell.exe -NoProfile -File scripts/performance/verify-process-sampler.ps1
```

The portable comparison freezes the original P/Invoke control and invokes the current production `sendCopyShortcut` for the Forms variant. It records the application commit, selection source hash and sampler hash. `-Rounds 3 -IdleSeconds 0` is a short resource/semantic confirmation only, not a replacement for twenty-pair timing evidence or the final 7-cold/30-warm/idle application acceptance run. Use a fresh label to preserve every observation. The installed application is not replaced.
