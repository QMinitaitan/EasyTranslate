# Final review resolution, 2026-10-22

The independent Standards and Spec reviews were pinned to
`5c5fd98e2bb761809a7440ab64393eb913ff0652`, against base
`75516d68fe745dfdb8d90fb29a8976e758fbb033`. They reported **2 Standards findings
(P1, P2)** and **1 Spec finding (P2)**. All three are addressed by implementation
commit `793e3d9bce7c85665ced9e9fc7cc46ab3976e7c1`; this report is documentation only.
The original read-only reports remain outside Git in
`E:/EasyTranslate-implementation-notes-20261020/final-standards-review.md`,
`final-standards-native-inventory.md` and `final-spec-review.md`.

## Standards

1. **Original P1: incomplete pre-import containment in nine retained native
   entrypaths, including unchecked selected text before logging/delivery.**
   Resolved by disabling all nine JavaScript entries before their first import
   or side effect and all six mapped PowerShell launchers immediately after
   their parameter blocks. They have no bypass. This prevents inherited
   credentials, Node/Electron/renderer transport, children, clipboard/input,
   output and product import from being reached. Old bodies/raw observations
   remain intact. Fifteen offline regressions verify each JS refusal in a VM
   with forbidden external boundaries and each PS first executable statement.
   No PowerShell or Electron process runs in these tests. The entry inventory,
   safe offline reproduction and separate current production validators are in
   [native validation policy](NATIVE-VALIDATION.md).

2. **Original P2: the session fixture used model `fast`, which current provider
   policy rejects, and race/history presentation coupled labels to models.**
   Resolved by the shared synthetic `session-fixture.json` with
   `deepseek-v4-flash` and the independent fast/slow role mapper. The retained
   race/history transports use that mapper. Four offline provider/session
   integrations cover single/race/history/flow, including flow's later settings
   enable and race, successful text and exactly one history admission. Two
   additional tests execute the actual race/history HTTPS replacement at the
   controlled transport boundary and verify independent role labels and delays.
   Historical native launchers stay disabled despite corrected compatibility.

**Standards: 2 original findings; 2 addressed.** No new native run is claimed.

## Spec

1. **Original P2: a surviving pinned popup did not refresh its engine choices
   after committed settings changes (#5).** Popup now subscribes before its
   initial refresh, coalesces synchronous notification bursts, admits only the
   latest async refresh (including failures), and releases/invalidate work on
   unmount. A separate session presentation mode keeps existing single/race
   result provenance and edits while settings choose the next request. Engine
   fallback updates the selector without relabeling an existing result. Settings
   notification itself starts no translation and creates no history.
   Seven tests compile/evaluate the actual Vue script with real Vue reactivity
   and synthetic IPC boundaries: disable/enable/invalid capability transitions,
   preserved pin/source draft/result edits/engine, stale success, stale failure,
   in-flight teardown, burst coalescing, race provenance and queued teardown.

**Spec: 1 original finding; 1 addressed.** These are renderer behavior tests,
not a native or packaged validation claim.

## Validation and evidence boundaries

One final `npm run check` passed: strict Electron/Vue types, **132/132 guarded
offline tests** (104 existing + 28 added), zero failures, and production build.
The existing dependency junction was reused unchanged; no dependency install,
application launch, native input, clipboard operation, remote mutation or paid
request occurred in this fix task. `CLAUDE.md` routes tests through `npm test`;
`AGENTS.md` retains zero-paid-API, disabled scheduled continuation and no PR
merge/release constraints without the obsolete draft-PR state.

Logs are outside Git at
`E:/EasyTranslate-implementation-notes-20261020/final-review-fixes/`:

| Regression | Red evidence | Green evidence |
| --- | --- | --- |
| Nine JS + six PS historical refusals | `01-native-red.log`: 15 failures | `03-native-green.log`: 119/119 |
| Four provider/session fixture scenarios | `04-fixture-red.log`: 4 unavailable providers | `05-fixture-green.log`: 123/123 |
| Popup settings/provenance | `06-popup-red.log`: no config subscription | `07-popup-green.log`: 124/124 |
| Latest refresh, disposal and notification burst | `08-popup-lifecycle-red.log`: 4 lifecycle failures | `09-popup-lifecycle-green.log`: 128/128 |
| Final strict types + all regressions + build | — | `10-final-check.log`: 132/132, exit 0 |

Intermediate logs are retained: `02-native-green.log` still failed before the
refusal was moved to the start; `08` also exposed a timing-sensitive fixture
ranking assertion, subsequently made deterministic with controlled microtasks
and order-independent comparison. The final check log SHA256 is
`a4625320ee6e71442d686a752bee7c1c026dcd6a17c078e8aa620ebaa63e7ffb`.

The prior Windows/performance reports measured source
`2e97ef06d5b91de1ba929ad87425a083006039ce`, with Windows ASAR SHA256
`52059ffab86fb8ec1900fdcc30e720ed481798e10f9957d63fb14d75bee618e0`.
Those reports, earlier failures and Linux artifact identities remain unchanged.
Their runtime-equivalence statement applies to their reviewed source scope;
the Popup change here changes the production bundle and requires a fresh
packaged artifact for any later native/performance claim. This fix has only the
targeted offline and build evidence above. The five frozen timed performance
components (`run.ps1`, `launcher.cjs`, `process-sampler.cs`, `analyze.cjs`,
`source-form.ps1`) are byte-identical in Git to the review baseline. No new
performance result or relaxation of a gate is claimed.

## Credential incident scope

The root's redacted local verification found an exact historical credential
match at `50d908939e9281ee72b84f43184d7eac1cfb3071` in
`electron/providers.cjs`. This is committed/remote history predating the review
baseline, including ancestry of the actual PR base. The later `a5b6f1a` revision
had no present exact match and may represent removal, not another credential.
The user confirmed the credential was already revoked. No value, fragment,
credential hash or authorization header is reproduced here. This establishes
historical credential presence; the cause of prior billed usage and any third
party use remain unresolved. The root's local note is
`E:/EasyTranslate-implementation-notes-20261020/credential-history-verification-20261022.md`.
Only the controlled validation described above has a verified zero-real-API
scope; no blanket claim is made about all historical development traffic.
