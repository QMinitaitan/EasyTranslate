# Windows performance verification

[The 2026-10-20 baseline](2026-10-20-baseline.md) and [frozen comparison protocol](2026-10-20-protocol.md) were acquired before optimization. [Typed/source and bundled-ASAR smokes](2026-10-20-typed-packaged-smoke.md) separately validate the first TypeScript build. Their JSON files retain every attempted capture, including failed capture outcomes. Raw synthetic logs remain in the local handoff notes directory named in the report.

Run from a Windows interactive desktop after `npm run build`, with no other benchmark/automation competing for the foreground. The runner temporarily opens a native synthetic source form and invokes the actual global shortcut. It restores supported clipboard data and isolates application HOME, USERPROFILE, userData, fake credentials and history. The adapter's HTTPS transport is deterministically replaced in-process; these results measure local latency rather than external service speed.

```powershell
powershell -NoProfile -Sta -File scripts/performance/run.ps1 -Label comparison
node scripts/performance/analyze.cjs .runtime/performance/runs-comparison
```

Defaults retain the frozen sample sizes: 7 new-process/profile launches, 30 warm invocations, one empty selection and 30 seconds idle before/after. Results go under the ignored `.runtime/performance/` directory. `-Repo`, `-ElectronPath` and `-OutputRoot` allow a different source checkout or bundled ASAR without touching the installed app. `-ColdCount 1 -WarmCount 1 -IdleSeconds 1` is only a functional smoke, not a performance comparison. `-Label` must name a fresh run to avoid mixing old event logs with new samples.

For the unpacked archive, pass `-Repo` as the absolute `release/win-unpacked/resources/app.asar` path and `-ElectronPath` as the original Electron distribution executable. This validates bundled path resolution and compiled preload compatibility; launching the built product and installing NSIS require separate checks.

The portable runner preserves frozen sampling, shortcuts, waits and transport behavior. It adds explicit paths, recorded environment metadata and a guard against reusing a nonempty output directory. The analyzer uses the recorded logical CPU count; for older raw archives without `environment.json`, pass the historical count explicitly, such as `node scripts/performance/analyze.cjs <folder> 16` for the archived baseline. Compare both successful-path quantiles and all failed capture outcomes. Keep the original thresholds when explaining any measured regression.
