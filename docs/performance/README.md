# Windows performance verification

[The 2026-10-20 baseline](2026-10-20-baseline.md) and [frozen comparison protocol](2026-10-20-protocol.md) were acquired before optimization. [Typed/source and bundled-ASAR smokes](2026-10-20-typed-packaged-smoke.md) separately validate the first TypeScript build. Their JSON files retain every attempted capture, including failed capture outcomes. Raw synthetic logs remain in the local handoff notes directory named in the report.

Run from a Windows interactive desktop after `npm run build`, with no other benchmark/automation competing for the foreground. The runner temporarily opens a native synthetic source form and invokes the actual global shortcut. It restores supported clipboard data and isolates application HOME, USERPROFILE, userData, fake credentials and history. The adapter's HTTPS transport is deterministically replaced in-process; these results measure local latency rather than external service speed.

```powershell
powershell -NoProfile -Sta -File scripts/performance/run.ps1 -Label comparison
node scripts/performance/analyze.cjs .runtime/performance/runs-comparison
```

Defaults retain the frozen sample sizes: 7 new-process/profile launches, 30 warm invocations, one empty selection and 30 seconds idle before/after. Results go under the ignored `.runtime/performance/` directory. `-Repo`, `-ElectronPath` and `-OutputRoot` allow a different source checkout or bundled ASAR without touching the installed app. `-ColdCount 1 -WarmCount 1 -IdleSeconds 1` is only a functional smoke, not a performance comparison. `-Label` must name a fresh run to avoid mixing old event logs with new samples.

For the unpacked archive, pass `-Repo` as the absolute `release/win-unpacked/resources/app.asar` path and `-ElectronPath` as the original Electron distribution executable. This validates bundled path resolution and compiled preload compatibility; launching the built product and installing NSIS require separate checks.

The portable runner preserves frozen sampling cadence, shortcuts, waits and transport behavior. It adds explicit paths, recorded environment metadata and a guard against reusing a nonempty output directory. The analyzer uses the recorded logical CPU count; for older raw archives without `environment.json`, pass the historical count explicitly, such as `node scripts/performance/analyze.cjs <folder> 16` for the archived baseline. Compare both successful-path quantiles and all failed capture outcomes. Keep the original thresholds when explaining any measured regression.

[The Windows helper comparison](2026-10-21-selection-comparison.md) records a separate twenty-pair original/Forms experiment and its four-format clipboard/focus checks. Reproduce it with `scripts/performance/selection-comparison/run.ps1`; this paired comparison isolates the copy helper and does not measure popup-preheat gains.

An audit found invalid transient attribution in one later PID-only sample. Future runners share `scripts/performance/process-sampler.cs`, which validates process creation times and records per-process identity/counters. Run `powershell.exe -NoProfile -File scripts/performance/verify-process-sampler.ps1` for the ancestry fixtures. The approximately 100 ms cadence, resource units and frozen acceptance thresholds are unchanged; old raw files remain immutable. Their PID-only ancestry cannot be proven retrospectively, and the flagged helper-run resource totals must not be used as improvement evidence. The report describes the audit and separate creation-aware resource confirmation.

[The popup lifecycle report](2026-10-21-popup-prewarm.md) records the final seven-launch/30-warm integrated comparison, original-helper window-only results, retained failed cohorts, hidden-paint controls and native focus/readiness/quit checks. [Exact final gates and source hashes](2026-10-21-popup-gates.json) accompany the [complete final attempt ledger](2026-10-21-popup-final.json). Three copy timeouts remain in that cohort, matching baseline counts; every nonempty capture produced a visible DOM result. This report distinguishes window-local work from the integrated Forms-helper gain and does not equate DOM availability with physical presentation.
