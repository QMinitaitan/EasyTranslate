# Latest artifact: interrupted before the first shortcut

The `final-review-15c32a5-20261022-1` attempt is **incomplete**. It launched the isolated production ASAR, reached main/popup readiness and measured the before-idle interval, but failed the first foreground precondition. **No Alt+Q, selection call, native copy helper, provider/transport request, DOM result or history write occurred.** It provides no final performance PASS and no translation/session regression evidence.

[The machine-readable report](2026-10-23-review-production-incomplete.json) retains all 22 gate assessments, original observation hashes, foreground segments, the non-GUI probe summary and the ranked hypotheses. This documentation checkpoint was prepared from integration `8df29a9537a33a345b2f84f23cd6e19f6f9e2df8`; it adds no runtime or harness change.

Source commit: `15c32a52148399d6ff383d80874f60931954ee77`. The Git diff from that commit to this checkpoint's integration base `8df29a9537a33a345b2f84f23cd6e19f6f9e2df8` contains only `AGENTS.md` and `docs/validation` changes, with no runtime/build-input change. Independently verified ASAR SHA256: `F0D9E094FCB66A662F7120420CC31D0263C5E594204D82D23554E2ED70BD03CE`; stock Electron 43.2.0 SHA256: `8593DB40C0C6E5E3C4B6B0A225B1DC9A549ECDF10F6CF2010CF5B6CE869CE07F`.

## Observed failure and preserved scope

At epoch **1792681592516** (`2026-10-22T15:06:32.516Z`), the driver recorded foreground HWND **12125828**, expected source HWND **4462316** (source PID 42652, product PID 8676), and rejected `cold-1-invoke-1` before issuing its key. The actual synthetic `source-command.json` remained present; `source-ready.json` was absent. The source was initially foreground for 126 resource samples, approximately 13.646 seconds, then foreground samples visited other HWNDs. Owner identities, the cause of these transitions and source message-pump/lifetime state at the failure were not recorded. Later live HWND mappings cannot establish historical ownership.

This is therefore more than an observed foreground-promotion failure: the source's command acknowledgment also failed. It is not proof of a swallowed file exception, closed window, stalled GUI pump, user action or product defect.

The completed before-idle interval retained **27.868 seconds / 256 samples** after its initial two-second exclusion. It observed CPU **0.073589%**, private P50 **151.86328125 MiB**, five processes and two hidden windows. No after-use interval exists. First/warm latency, after-use steady private memory, no growth after 30 warm uses and universal natural-exit evidence are **unavailable**. The qualified postprocessor reports `cohortComplete=false`, `allPassed=false`, **two failures and twenty unavailable gates**. Zero invocations must not be presented as zero-timeout acceptance or vacuous restoration/history success.

Outer STA clipboard metadata reports **eight saved formats, final format presence restored=true, payloadLogged=false**. No normal quit/run-end event was recorded; the driver used exception cleanup. Root's later owned-process check was zero. This is cleanup evidence, not natural exit 0. The 8,246-byte PowerShell `ModuleAnalysisCache` side effect was moved unchanged from the owned source-form working directory to the raw run's `runner-side-effects/` after absolute path and no-reparse checks; its content was not read.

Raw observations remain unchanged under `E:\EasyTranslate-implementation-notes-20261020\benchmark\runs-final-review-15c32a5-20261022-1`. The committed JSON records the original observation hashes and foreground segments. Earlier `2e97ef0 / 52059FFA…18E0` success and failure reports remain prior-artifact evidence, not acceptance of this new bundle.

## Bounded non-GUI command-protocol experiment

Root explicitly authorized a non-GUI probe of the **actual frozen `add_Tick` callback**, extracted from its PowerShell AST and executed without changing that source. Ten fresh allowlisted HOME/USERPROFILE/app-data profiles each received ten synthetic commands through the same `ConvertTo-Json | Set-Content -Encoding UTF8` file protocol. Fake Form/Box methods performed only in-memory operations; there was no WinForms assembly/application, Electron, real Activate/Focus, keyboard, clipboard, model API or network call. Each receiver first ran four idle callback ticks; the probe used 50 ms polling rather than a GUI Timer/message pump. It stopped on the first caught operation error or acknowledgment over five seconds instead of retrying for a favorable result.

**100/100 acknowledgments passed**, all ten receiver processes exited normally and no callback catch error appeared. Acknowledgment P50/P95 was **58.4596/185.9575 ms**, range **43.0607–261.2531 ms**. The first data acknowledgment in each fresh process had P50/P95 **185.9575/261.2531 ms**, range **169.7642–261.2531 ms**. Private synthetic-only tick traces preserve error ID/type/message fields; all error counts were zero. The scripts, per-process traces and full 100-exchange summary remain under `E:\EasyTranslate-implementation-notes-20261020\benchmark\final-review-15c32a5-20261023\file-ipc-probe-1`; the compact `file-ipc-probe-summary.json` is in its parent directory. The committed report records script and summary hashes for these external reproducibility artifacts.

This does **not** reproduce the native failure. It narrows the file/JSON/cmdlet path under the fake-object conditions but cannot prove real GUI message pumping, native source lifetime, OS activation grants or keyboard behavior.

Ranked hypotheses, all unconfirmed:

1. **GUI source availability/message pumping or source lifetime.** The command was not consumed despite the initially observed window. This remains outside the non-GUI experiment.
2. **First-read, module autoload or transient file-sharing/JSON read behavior.** The actual callback has an empty catch, so such an error could conceal an acknowledgment failure. No such error reproduced in the 100-exchange experiment; this lowers its support without excluding a native-only condition.
3. **Foreground-promotion grant by itself.** It explains a failed HWND check but does not alone explain the unconsumed command. Real activation is deliberately absent from the protocol proof.
4. **Product translation/session behavior.** This attempt invoked none of it, so it supplies no positive defect evidence there.

## Prepared comparison, not authorization

`E:\EasyTranslate-implementation-notes-20261020\benchmark\final-review-15c32a5-20261023\frozen-manifest.json` is prepared for the unused label **`final-review-15c32a5-20261023-2`**. Five timed component hashes remain identical to `4f03129`; the separately versioned analysis hash remains `AB2D256793B2584DB5B1A88A89C4AC963291B8DC45A9E4E9DAAD2167AEA903BB`. The same ASAR, Electron bytes, 7 first / 30 warm / 1 empty / two 30-second idle intervals, fixed 50 ms transport, 22 gates and **315.7828125 MiB** limit remain binding.

Only a **fresh explicit root grant and fresh user idle interval** can start the proposed one comparison: the user clicks the visible owned `EasyTranslate isolated benchmark source` once before the first key, then leaves keyboard and mouse idle. This changes an external activation condition; it changes no timed file, wait, transport, sampler or gate. The old five-minute interval expired and cannot be reused. Any guard failure stops the run with all raw records retained; there is no automatic retry. No GUI/cohort has started under this new label.

At this checkpoint, the later three-minute availability question also has no answer; no availability is inferred from a general request to continue. Scheduled continuation remains disabled. This documentation-only curation launched no application, accessed no clipboard or personal profile, made no model request and ran no build or new benchmark. It leaves the latest artifact's final performance acceptance open.
