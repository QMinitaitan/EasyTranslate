# Final production-ASAR performance acceptance

The explicitly authorized cohort during the user's known idle interval completed **all 22 frozen gates**. It exercised seven fresh processes/profiles, 30 warm invocations and one deliberate empty selection: **38 shortcuts, 37 exact nonempty capture → transport → visible DOM → accepted-history correlations, zero copy timeouts, and seven natural exits with code 0**. After-use private-memory P50 was **246.3203125 MiB**, below the unchanged **315.7828125 MiB** limit. [The full JSON](2026-10-22-final-production.json) contains all 38 attempts, every gate and limit, history correlations, process identities and resource summaries.

The earlier cohort remains [incomplete and failed](2026-10-22-final-production-incomplete.md), with nine emitted shortcuts, four warm timeouts and a prevented tenth shortcut after foreground loss. All four timeouts had sampled foreground departures; their cause is unconfirmed. After the user explicitly offered an approximately three-minute idle window, root authorized one controlled comparison using the **same timed scripts, artifact, sample sizes, transport and gates**, with the known availability condition changed. This was not an automatic retry. Its success does not identify the actor or application responsible for the earlier departures, and the earlier raw data and failure assessment remain intact.

## Identity, isolation and reproducibility

- Application source: `2e97ef06d5b91de1ba929ad87425a083006039ce`, including the flash-only provider guard.
- Production ASAR SHA256: `52059FFAB86FB8EC1900FDCC30E720ED481798E10F9957D63FB14D75BEE618E0`, independently checked before launch. Path: `E:\EasyTranslate-implementation-notes-20261020\windows-final-validation\production-2e97ef0\win-unpacked\resources\app.asar`.
- Timed scripts: commit `4f031292033b4abc6baacf353a833ccea00e5517`; stock Electron **43.2.0**, embedded Node **24.18.0**; Windows 10.0.26200, 16 logical processors. The external `benchmark\final-production-2e97ef0-20261022\frozen-manifest.json` records exact executable/script hashes. Its status describes the initial freeze, before either run.
- Analysis version: the unchanged sampler/analyzer/driver/launcher/source-form hashes match the manifest. Only `final-evidence.cjs` changed afterward for reporting-only incomplete-cohort qualification; its analysis SHA256 is **`AB2D256793B2584DB5B1A88A89C4AC963291B8DC45A9E4E9DAAD2167AEA903BB`**, recorded separately in both curated JSON reports. The manifest's earlier hash for that analysis file is retained, rather than claimed unchanged.
- Same causal PID-plus-birth sampler, approximately 100 ms cadence, native WinForms selection and actual Alt+Q, fixed **50 ms** synthetic HTTPS response, seven fresh profiles, 30 warm, one empty, and 30 seconds idle before/after. No forced GC, timeouts removed, parameter changes or gate relaxation.
- **Zero paid API calls.** Before product imports, the launcher verified fresh isolated HOME/USERPROFILE/app data/config/history and exact synthetic provider data, denied alternative Node/Electron transports, and admitted only the exact existing Windows Ctrl+C helper. The guard is in-process instrumentation, not an OS firewall. No personal config/history or daily installation was opened.
- No Node inspector or debugger attachment. The unchanged Chromium `--remote-debugging-port=9333` remains present without attachment; stderr contains that loopback endpoint and Electron's console-message deprecation warning. DOM mutation availability is not photometric presentation.

The actual command used was the same as the first attempt except for the new label:

```powershell
powershell.exe -NoProfile -Sta -File "D:\codex_worktree\easytranslate-t7\EasyTranslate\scripts\performance\run.ps1" -Repo "E:\EasyTranslate-implementation-notes-20261020\windows-final-validation\production-2e97ef0\win-unpacked\resources\app.asar" -ElectronPath "E:\EasyTranslate-implementation-notes-20261020\windows-final-validation\source-2e97ef0\node_modules\electron\dist\electron.exe" -OutputRoot "E:\EasyTranslate-implementation-notes-20261020\benchmark" -Label "final-production-2e97ef0-20261022-2" -ColdCount 7 -WarmCount 30 -IdleSeconds 30
```

It completed in approximately 134 seconds and returned 0. All owned apps/helpers were released. No further native run or automatic continuation is scheduled. Actual packaged-executable, isolated NSIS and Linux functional checks are separate evidence; stock Electron requiring the real ASAR is the frozen same-condition performance boundary.

## Latency, preheat and complete attempt coverage

Nearest-rank P50/P95 and full observed ranges are reported. Seven first samples make P95 the observed maximum. All 37 nonempty captures succeeded, so all-attempt and successful-only first/warm distributions coincide; no failed capture was filtered out.

| Local metric (ms) | First, n=7: P50 / P95; range | Warm, n=30: P50 / P95; range |
| --- | --- | --- |
| Full selection | 823 / 1007; 800–1007 | 950 / 1022; 799–1023 |
| Native helper | 682 / 864; 663–864 | 812 / 883; 662–887 |
| Shortcut → popup show | **859 / 1043; 837–1043** | **969 / 1051; 814–1053** |
| Shortcut → backend/history response | 936 / 1123; 905–1123 | 1049 / 1119; 886–1133 |
| Shortcut → visible DOM result | **932 / 1117; 903–1117** | **1046 / 1117; 884–1130** |
| Capture → popup show | 36 / 49; 30–49 | 22 / 38; 7–46 |
| Capture → visible DOM result | 109 / 128; 95–128 | 94 / 110; 69–114 |

The deliberate empty invocation took 1815 ms to finish selection and 1853 ms to show its empty state. It issued no transport, produced no translated result and received no history ID. All 38 shortcut callbacks, selection completions and driver completions are recorded. All emitted shortcuts had the exact owned source HWND before emission; **335 samples** during capture intervals show **zero foreground departures**. Brief events shorter than the sampler cadence cannot be excluded.

For each of the 37 nonempty captures, source text matches the trial's exact synthetic fixture, exactly one transport uses that source, the visible DOM equals its synthetic result, and the accepted history ID matches the durable row. The long run retains exactly the newest **20** successful translations; each other fresh profile retains exactly its one success. No empty entry appears, all favorites are false, and every durable ordering/source/destination/ID comparison passes.

App-ready from launch P50/P95 was **291/365 ms** (262–365); main document **627/881 ms** (581–881); actual hidden-popup ready IPC **851/1106 ms** (830–1106); observer ready **856/1113 ms** (837–1113). The preheated state holds two hidden windows and five processes before first translation, one more renderer/process than the historical baseline's before state. These report the cost and timing of this startup path; they do not isolate the popup's private-memory contribution from the other source changes.

## Frozen acceptance and resources

All 22 individual checks and numerical limits are in the JSON; the groups below cover them without changing their definitions.

| Gate group | Observed result | Frozen requirement |
| --- | --- | --- |
| Cohort and preconditions | 7 first + 30 warm + 1 empty; no violation | Complete cohort, exact fixture/source preconditions |
| First show / DOM P50 | 859 / 932 ms | Strictly below 923 / 1120 ms |
| Successful warm show P50/P95 | 969 / 1051 ms | ≤1037.3 / 1191.4 ms |
| Successful warm DOM P50/P95 | 1046 / 1117 ms | ≤1107.45 / 1269.6 ms |
| All-attempt warm show P50/P95 | 969 / 1051 ms | ≤1038.45 / 2040.1 ms |
| Cold / warm copy timeouts | 0 / 0 | ≤1 / ≤2 |
| Capture/result/empty/history/clipboard/ledger | All observed invariants and 38/38 fixture restores | Exact correlations, empty suppression, latest history and all attempts |
| Idle normalized CPU, before / after | 0.02449% / 0.15099% | ≤1% |
| After-use private P50 | 246.3203125 MiB | ≤315.7828125 MiB |
| Windows and retained processes | Two windows per run; before/after process P50/P95/final=5 | Two windows, no retained process growth after 30 warm |
| Natural quit | 7/7 quit events and native exit0 | All seven natural exit0 |

Both idle intervals exclude their first two seconds: the retained windows are **27.914 s / 257 samples** before and **27.811 s / 256 samples** after.

| Full-tree resource | Before use | After use |
| --- | --- | --- |
| Normalized CPU | 0.02449% | 0.15099% |
| Private MiB P50 / P95; range | 148.699 / 150.180; 146.898–150.191 | 246.320 / 265.801; 246.320–281.402 |
| Summed working-set MiB P50 / P95; range | 387.926 / 389.117; 386.867–389.180 | 449.855 / 458.215; 449.465–564.156 |
| Processes P50 / P95 / final | 5 / 5 / 5 | 5 / 5 / 5 |
| Live / visible windows P50 | 2 / 0 | 2 / 1 |

The within-cohort before/after private P50 change is 97.621 MiB; that measures different hidden/used/visible states and is not an isolated preheat estimate. The historical baseline after-use P50 was 274.594 MiB, which defines the unchanged final limit. Its older PID-only ancestry cannot be proved retrospectively, and sampling overhead/interactive conditions differ, so resource attribution should retain those limits.

The long run's 1136 samples show transient maximum **seven processes**, peak **348.273 MiB private** and **564.156 MiB summed working set**. After-idle maximum briefly reached six processes while P50/P95/final remained five; this transient is retained. All 32 long-run helper PIDs and each of the six other helpers were sampled. Sampling work P50/P95 was **52/72 ms**, range 26–100 ms. Long-run observed cumulative process CPU was **34.40625 s**; interval-normalized CPU P95/max was **9.766%/20.345%**, with newly discovered child lifetime CPU charged on discovery. These short deltas are not hardware peaks. Working-set sums can double-count shared pages. The steady-private gate applies to after-idle P50, not the larger transient peak.

## Restoration, preserved failures and checks

All 38 captures restored their text/HTML/RTF fixtures. The outer STA DataObject snapshot remained in memory and its final check reports **seven formats restored=true**, with no payload logged. This establishes format presence, not arbitrary opaque-object byte equality. All seven app processes quit naturally with code 0, and a later exact owned executable/source-command metadata check found **zero remaining processes**.

Earlier Windows functional attempts 1–8 lacked the outer clipboard snapshot and overwrote the initial clipboard with synthetic content; the original could not be restored. That incident remains disclosed and is not repaired by this final success. The prior failed performance cohort, its four timeouts and interrupted resource series are also preserved and must not be blended into this controlled-condition distribution.

An 8-byte PowerShell module-analysis cache again appeared under the owned source-form working directory. Its contents were not read; after exact-path/no-reparse checks it was moved unchanged to this run's `runner-side-effects/`. This side effect remained within the owned checkout/archive, while preventing a claim that all source-form cache files stayed inside the profile.

Raw observations, fixture profiles and logs remain under `E:\EasyTranslate-implementation-notes-20261020\benchmark\runs-final-production-2e97ef0-20261022-2`; the JSON records original observation SHA256 hashes for all seven runs. The sibling `final-production-2e97ef0-20261022` retains the shared frozen manifest and both cohorts' derived reports. The original failed raw directory and all older cohorts were not rewritten.

Reporting-only completeness qualification prevents partial samples from passing formal gates. **7/7 isolated light Node/VM tests** pass, including the RED→GREEN incomplete-report case and six safety cases. Historical full #8 still reports PASS; the historical 329.7265625 MiB cohort still fails solely against the same 315.7828125 MiB gate. No product source, paid service, build, timing code or extra native run was used to validate post-processing.
