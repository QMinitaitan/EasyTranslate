# Reviewed production ASAR: complete frozen performance acceptance

The latest reviewed production artifact, source **`15c32a52148399d6ff383d80874f60931954ee77`** and ASAR **`F0D9E094…D03CE`**, completed **22/22 frozen gates**. The cohort contains seven fresh processes/profiles, 30 warm invocations and one deliberate empty selection: **38 shortcuts, 37 exact successful capture → transport → visible DOM → accepted-history correlations, zero capture timeouts, and seven natural exits with code 0**. After-use private-memory P50 was **248.0859375 MiB**, below the unchanged **315.7828125 MiB** limit. [The complete JSON](2026-10-23-review-production.json) contains all attempts, histories, gates, identities and resource summaries.

The [earlier same-artifact attempt](2026-10-23-review-production-incomplete.md) remains incomplete: its source command was unacknowledged and the guard prevented its first Alt+Q. Its raw data, two failed prerequisites and twenty unavailable gates were not rewritten. The 100/100 non-GUI callback experiment narrows the file-protocol path but does not prove native message pumping or activation behavior. This new successful result does **not** establish or fix the earlier failure's cause.

## Authorization, identity and exact duration

A three-minute grant received at `02:09:16Z` did not launch a cohort: by the worker's first clock check at `02:10:08Z`, only 128 seconds remained before its `02:12:16Z` deadline. The time guard stopped before any execution, application, source window, clipboard action or key. That grant was not extended or reused.

The user then explicitly authorized a **fresh five-minute** idle interval. Root launched the one prepared cohort directly, avoiding the relay delay. The user was asked to click the visible owned source window once and then leave input idle. **The click was requested, not observed or recorded**; no causal claim about that action is made. No timed script, gate, parameter or provider behavior changed and there was no automatic retry.

Driver observations span **`2026-10-23T02:12:41.522Z`–`02:14:59.588Z`**, exactly **138,066 ms** from cold-1 launch-start to cold-7 run-end. Root's foreground session 13346 ended naturally with code 0 and all seven runs completed. No more native validation was launched for this documentation curation.

| Identity | Value |
| --- | --- |
| Application source | `15c32a52148399d6ff383d80874f60931954ee77` |
| Runtime-equivalent integration base | `1b9258d0ca562d159043f9a9d10e52d30f48c1d6` |
| Production ASAR SHA256 | `F0D9E094FCB66A662F7120420CC31D0263C5E594204D82D23554E2ED70BD03CE` |
| Stock Electron 43.2.0 SHA256 | `8593DB40C0C6E5E3C4B6B0A225B1DC9A549ECDF10F6CF2010CF5B6CE869CE07F` |
| Frozen timed component version | `4f031292033b4abc6baacf353a833ccea00e5517` |
| Separate AB2 analysis SHA256 | `AB2D256793B2584DB5B1A88A89C4AC963291B8DC45A9E4E9DAAD2167AEA903BB` |

The sampler, analyzer, driver, launcher and source-form hashes still match the prepared manifest. The analysis file's reporting-only incomplete-cohort qualification has its own hash rather than being claimed identical to the older manifest version. Windows 10.0.26200 has 16 logical processors. The same approximately 100 ms causal PID-plus-birth sampler, actual native WinForms selection/Alt+Q, seven fresh profiles, 30 warm/one empty and two 30-second idle intervals remain frozen.

All seven pre-import isolation-ready events are present. HOME/USERPROFILE/app data/config/history are fixture-only, the provider uses an exact synthetic endpoint/key/model and **50 ms** in-memory HTTPS response, alternative Node/Electron network calls are denied and only the exact production Windows copy helper is admitted. Real paid-model budget is zero. This is a separate in-process native guard, not an OS firewall or the Node unit-test guard. No personal profile/history or daily installation was opened.

No Node inspector or debugger attachment was used. The unchanged Chromium port 9333 flag remained present without attachment. This boundary is stock Electron loading the unchanged real ASAR; actual EXE functionality is separate, and NSIS/Linux retain their prior-payload scope.

## Complete latency and result evidence

The table uses nearest-rank quantiles and full observed ranges. Seven first samples make P95 the maximum. Every nonempty capture succeeded, so all-attempt and successful-only first/warm distributions coincide; no timeout was omitted. DOM mutation availability does not measure physical pixel presentation.

| Local metric (ms) | First, n=7: P50 / P95; range | Warm, n=30: P50 / P95; range |
| --- | --- | --- |
| Full selection | 738 / 916; 724–916 | 720 / 741; 705–765 |
| Native helper | 604 / 779; 596–779 | 582 / 601; 566–613 |
| Shortcut → popup show | **788 / 948; 751–948** | **734 / 754; 713–800** |
| Shortcut → backend/history response | 861 / 1014; 832–1014 | 804 / 822; 781–878 |
| Shortcut → visible DOM | **857 / 1010; 827–1010** | **802 / 820; 777–877** |
| Capture → show | 32 / 53; 27–53 | 14 / 35; 5–35 |
| Capture → visible DOM | 103 / 122; 94–122 | 75 / 101; 65–112 |

The deliberate empty invocation completed selection in 1579 ms and showed the empty state in 1585 ms. It made no transport request and produced no translated result/history ID. All 38 shortcuts, captures and completions are recorded. Every shortcut had its exact owned source HWND before emission, and **261 samples** during capture intervals show **zero departures**. Events shorter than the sample cadence cannot be ruled out.

Every one of the 37 nonempty captures matches its exact synthetic trial source, one transport uses that same source, the visible DOM contains the exact synthetic translation, and its accepted history ID matches the durable row. The long run retains exactly the newest 20 successful entries, and each other profile retains its one success, with correct ordering and no empty entries. All favorites are false.

Startup/preheat P50/P95 was **252/442 ms** to app-ready, **526/961 ms** to main document, **751/1186 ms** to actual popup-ready IPC and **756/1192 ms** to observer-ready. Before first use the app retained two hidden windows and five processes. These are observations of the complete hidden-startup path, not an isolated popup-memory estimate or installed-product startup test.

## Frozen gates and resources

The JSON lists all 22 checks with their unchanged exact limits. First show/DOM P50 **788/857 ms** is below **923/1120 ms**. Warm successful show P50/P95 **734/754 ms** is below **1037.3/1191.4 ms**, and DOM **802/820 ms** is below **1107.45/1269.6 ms**. All-attempt warm show also satisfies **1038.45/2040.1 ms**. Cold/warm timeout counts are **0/0**, within **1/2**. Complete coverage, fixture restoration, empty suppression, history, window/process stability and natural-exit checks all pass.

Both 30-second idle intervals exclude their first two seconds: retained before/after windows are **27.896 s / 257 samples** and **27.908 s / 257 samples**.

| Full-tree resource | Before use | After use |
| --- | --- | --- |
| Normalized CPU | 0.024505% | **0.013997%** |
| Private MiB P50 / P95; range | 152.090 / 153.480; 150.020–153.488 | **248.086 / 269.121; 245.281–269.121** |
| Summed working-set MiB P50 / P95; range | 391.594 / 392.352; 390.316–392.734 | 452.582 / 461.625; 450.527–461.625 |
| Process count P50 / P95 / final | 5 / 5 / 5 | 5 / 5 / 5 |
| Live / visible windows P50 | 2 / 0 | 2 / 1 |

CPU remains below the 1% limit, and after-use private P50 **248.0859375 MiB** remains below **315.7828125 MiB**. The within-cohort private change is 95.996 MiB between different hidden/used/visible states; it cannot isolate preheat cost. Historical baseline resource attribution and different sampling overhead retain their previously documented limitations.

The long run's **1057** resource samples show a transient maximum of **seven processes**, peak **349.195 MiB private** and **562.531 MiB summed working set**. All 32 long-run helper PIDs and the six other helpers were sampled. Sampling work P50/P95 was **33/45 ms**, range 26–70 ms. Observed long-run cumulative CPU was **23.0625 s**; sample-delta normalized CPU P95/max was **8.063%/18.045%**. Newly discovered child lifetime CPU is charged on discovery, so short deltas are not hardware peaks. Summed working sets may double-count shared pages. The steady-private gate applies to after-idle P50, not the transient peak. Both windows and the final five-process state remain stable after the 30 warm invocations.

## Cleanup, retained failures and analysis provenance

All 38 captures restored their text/HTML/RTF fixtures. This run's outer STA DataObject snapshot saved **four formats**, and `clipboard-guard.json` reports final format presence restored=true and payloadLogged=false. Do not substitute earlier runs' seven/eight-format counts. Format presence does not prove arbitrary opaque-object byte equality. Every run has a quit event and native exit0; an independent exact owned-process metadata check at `02:18:42.201Z` found **zero remaining candidate processes**.

The 8,246-byte owned PowerShell module-analysis cache was moved unchanged into this run's `runner-side-effects/` after absolute-bound/no-reparse checks. Its contents were not read. No additional cache was found at the explicitly checked root-E counterpart. The source-form cache side effect remained in owned paths, while preventing a claim that every cache stayed inside its profile.

Root's first report-only invocation lacked the derived `summary.json` and failed before producing the report. Running the existing analyzer generated that summary from retained observations; the same AB2 evidence processor then passed all 22 gates. This ordering correction added no native run, changed no observation and relaxed no gate.

All raw events, profiles, logs and original observation hashes remain under `E:\EasyTranslate-implementation-notes-20261020\benchmark\runs-final-review-15c32a5-20261023-2`. The shared prepared manifest and root verification report remain in sibling `final-review-15c32a5-20261023`. Earlier incomplete and old-artifact reports remain unchanged. The prior irreversible clipboard overwrite in functional probes 1–8 remains disclosed; later restoration guards do not repair it. The earlier billing source remains unresolved; controlled synthetic requests are not a provider billing audit.

This update changes documentation only. It runs no new tests, builds, application, keyboard/clipboard action or model request, and does not merge `main`, publish a release or replace the daily installation. Scheduled continuation stays disabled.
