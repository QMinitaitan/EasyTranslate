# Native validation entry policy

The retained historical native launchers are disabled. Each JavaScript entry
throws before its first import, profile/environment access, log, timer, child
process or product import. Each PowerShell launcher throws immediately after
its declarative parameter block, before filesystem, clipboard, form, process
or desktop operations. There is no environment-variable bypass.

| Disabled JavaScript entry | Disabled invoking launcher |
| --- | --- |
| `scripts/provider-ui-smoke.cjs` | Self-launching entry |
| `scripts/testing/desktop-quit.cjs` | `scripts/testing/run-desktop-quit.ps1` |
| `scripts/testing/desktop-startup.cjs` | `scripts/testing/run-desktop-startup.ps1` |
| `scripts/testing/quit-durability.cjs` | `scripts/testing/run-quit-durability.ps1` |
| `scripts/testing/prewarm-native.cjs` | `scripts/testing/run-prewarm-native.ps1` |
| `scripts/testing/session-ui-smoke.cjs` | `scripts/testing/run-session-ui-smoke.ps1` (single) |
| `scripts/testing/race-ui-smoke.cjs` | Same launcher (race) |
| `scripts/testing/history-ui-smoke.cjs` | Same launcher (history/flow) |
| `scripts/performance/selection-comparison/launcher.cjs` | `scripts/performance/selection-comparison/run.ps1` |

The old code and raw observations remain for provenance. Its HTTPS-only patches
and partial profile isolation do not satisfy the current zero-paid-API policy.
In particular, prewarm and selection-comparison could forward or log an unchecked
selection. Disabling them before input prevents that route; their later fixture
assertions were insufficient containment. Historical failure artifacts are not
rewritten as successful current runs.

Use `npm test` for current offline compatibility and behavior regressions. It
isolates HOME/USERPROFILE and app data and blocks sockets, HTTP(S), fetch and
unapproved children. `tests/historical-native.test.cjs` evaluates every disabled
JS entry in a VM with all imports/environment/log/input boundaries forbidden and
checks each PowerShell first executable statement. It never launches Electron
or PowerShell. `tests/session-fixture.test.cjs` exercises the real provider and
session services for single/race/history/flow with a synthetic transport. The
shared `scripts/testing/session-fixture.json` specifies the allowed DeepSeek
model `deepseek-v4-flash`; `session-fixture.cjs` maps protocol models to independent
fast/slow fixture roles. Corrected fixture compatibility does not enable a
historical launcher.

Current native production validators are separate: the inspector-paused installed
product controller (`scripts/testing/run-installed-product.ps1` and
`installed-product-injection.cjs`), `scripts/testing/linux-run-packaged.sh`, and
the frozen performance entry `scripts/performance/run.ps1`. Follow their current
validation reports and preconditions. Before any native launch, verify all
isolated profile/app-data paths, synthetic credential inputs, startup-hook
sanitization, Node/Electron/renderer transport interception and approved child
boundaries before importing product code. Native tests remain paused until those
conditions are verified. Never automate the daily installed app. This document
does not authorize a native run or a paid request.
