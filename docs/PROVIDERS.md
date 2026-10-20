# Provider capability and real probes

`electron/provider-service.cts` owns actual adapter support, required configuration, eligibility, execution and probing. Settings obtains capabilities for its current draft; the popup and main-process selection obtain them for persisted configuration. All use `inspectProvider` through this same module. Responses contain status/reason/protocol, never credentials.

OpenAI-compatible chat completions and DeepL are implemented. OpenAI now uses its own default host; DeepSeek retains its metadata defaults. DeepL keeps `/v2/translate`, `DeepL-Auth-Key` authentication and its target-language mapping. Explicit compatible `/v1` bases avoid a duplicated `/v1` segment.

Bing and Google entries are compatibility aliases: they require an explicit HTTPS Endpoint and model, and are labeled as not implementing the official translation protocol. Saved credentials/configuration are retained; the entries no longer silently fall through to DeepSeek. Youdao, Tencent, Caiyun and Baidu official adapters remain unsupported. A configured but disabled engine is also excluded from execution/probing.

The settings Test button sends a fixed `Hello` through the actual configured adapter. It reports only that attempt: success, missing configuration, unsupported, disabled, HTTP/network failure, malformed/empty response, or timeout. Testing a draft does not persist it or write translation history. Editing a draft invalidates an older test's displayed status. Probe/translation errors do not return platform response bodies, raw network exception text, endpoint credentials or keys.

Requests have a 20-second total deadline. AbortSignal cancellation destroys the active native request; pre-aborted work never reaches transport. Completion, failure, timeout and cancellation release the deadline and AbortSignal subscription. Session ownership remains the translation-session module's responsibility, including correctness when a transport finishes too late.

Validation:

```powershell
npm run check
npm run build
node scripts/provider-ui-smoke.cjs
```

The unit/integration seams inject HTTPS only: assertions cover actual OpenAI and DeepL payload/response handling, capabilities, safe failure categories, timeout and cancellation. IPC checks verify the compiled sandbox preload and runtime validation of untyped drafts.

The UI smoke launches a real Electron/Vue/main/preload application with isolated synthetic config/history/userData. Only HTTPS is controlled. It clicks actual settings buttons, checks one successful adapter probe, missing Bing configuration and unsupported Youdao without transport requests, then checks that the popup offers only the available OpenAI entry plus Race. It verifies that hydration/probing preserve the original synthetic configuration byte-for-byte, captures a result PNG and exits. Evidence is saved under the ignored `.runtime/provider-ui-smoke-*` directory. This is a Windows source-build integration check, not a real paid service call, installed-product or performance result.

During migration, existing `electron/providers.cjs` and `electron/translate.cjs` imports forward to these compiled typed implementations. #10 removes compatibility entries after all runtime callers have migrated.
