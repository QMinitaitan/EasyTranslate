# History persistence validation (#7)

The typed history module owns the cached JSON state, serialization queue, retention, durable mutation results and notifications. The existing `electron/history.cjs` path forwards to its compiled implementation. The main process initializes history once at startup; translations do not reread history or synchronously write it. All favorites remain, along with the newest twenty nonfavorites. Legacy string/numeric IDs and unknown entry fields survive mutations.

Automatic history receives the session's `isCurrent` predicate. The queue checks it before admission and the file adapter checks it again after the temporary write, immediately before atomic replacement. Superseded work waiting in the queue or temporary-file stage is skipped without notifying subscribers or publishing an ID. A previously completed durable entry is retained when the next session starts. The rename is the commit boundary: a replacement already submitted to the filesystem can finish, and represents a commit admitted while that session was current.

The write path uses a unique sibling temporary file and asynchronous rename. Failed writes retain the prior durable cache and file, reject the requesting mutation, and publish a safe history error to all existing windows. Malformed/unreadable existing data blocks mutations rather than overwriting the original file. A later successful write can recover from a transient write error. Home displays mutation/read failures and keeps its last successfully loaded list; list changes come from the central durable notification. Popup receives single progress before the history Promise completes, so a save failure retains the successful, editable/copyable translation. Quit cancels session work before awaiting the history/configuration queues; subscription cleanup occurs on shutdown.

## Automated evidence

`tests/history.test.cjs` exercises the public history/storage and actual high-level session interfaces: legacy compatibility, retention and unfavorite eviction, overlapping serialized updates, multiple subscribers, unreadable old files, safe write failure and retry, queued stale admission, stale temporary writes, one automatic race save, separate save failure, and flushes that include jobs appended during completion. IPC tests exercise durable history mutations/notifications and preload subscription cleanup. The existing session suite covers single/race overlaps and network cancellation.

Final `npm run check` passed: TypeScript checks, 78 tests, and production build. The final history fixture also exited successfully through the actual asynchronous history/configuration quit drain.

## Controlled hidden Electron evidence

Run after `npm run build` with PowerShell 7:

```powershell
./scripts/testing/run-session-ui-smoke.ps1 -Scenario history
./scripts/testing/run-session-ui-smoke.ps1 -Scenario race
```

The history fixture runs the actual built Vue views, compiled preload, main IPC and history file adapter in an isolated HOME/USERPROFILE/userData directory. Only synthetic transport responses and controlled file-write gates/failures are injected. Every BrowserWindow's show/focus operation is suppressed. Clipboard writes are intercepted before the physical clipboard. These are DOM/IPC/storage assertions, not native latency or rendered screenshot measurements.

The recorded history run verified:

- A single translation reached Popup's DOM while its durable history write and invoke response were still pending.
- Atomic replacement failure left the legacy JSON unchanged; the invoke response had `historyError` and no `historyId`. Popup and main received failure feedback, and Popup's real copy button successfully invoked the intercepted copy IPC with the translation.
- A retry reached both existing Home subscribers after persistence, retaining the legacy string ID and custom field.
- Favorite, failed unfavorite, successful unfavorite, delete and clear reflected their actual durable outcome. Both Home instances updated centrally on success; a failed mutation preserved the favorite in both disk and UI.
- Temporary files were removed and all windows stayed hidden.

`2026-10-21-history-persistence.json` records the machine-readable result. The race regression again showed first success before the slow engine/history, exactly one saved winner, preserved comparison edits, and current-only history across both mode switches.

The native desktop/helper performance cohorts are coordinated separately under #8/#9. This ticket uses no paid API calls or new storage product.
