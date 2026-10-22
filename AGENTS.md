# EasyTranslate agent instructions

Read `CLAUDE.md` for the repository architecture and development commands.

## Credentials and paid API use

- Development and validation have a real API budget of zero. Use synthetic keys, isolated HOME/USERPROFILE and app data, and a controlled transport. Run Node regression tests with `npm test`, which isolates the profile and blocks network sockets, HTTP(S), fetch and Node children.
- Before launching any native/Electron test, verify its isolated profile and transport interception before importing the application. Native processes are outside the Node unit-test network guard. Keep native validation paused until these conditions can be verified. Never start the daily installed app for automated validation.
- A real API check requires a new explicit user instruction specifying a request count and token ceiling. Use only `deepseek-v4-flash` for DeepSeek, including compatible endpoints. Keep requests in the foreground, stop on errors/limits, and leave no scheduled or detached API work. Do not fall back to another model or retry automatically.
- Keep keys in the user's existing credential storage or process memory. Reports, tool output, test fixtures, commits, issues and PRs may contain only synthetic values. Inspect safe model/endpoint metadata when diagnosing usage; never print credentials, authorization headers, prompts or personal translation content.
- Usage and credential incidents take priority over feature work. Stop the affected job, disable its automatic continuation and report verified scope and remaining uncertainty before resuming.

Continue under the zero-paid-API rules above and leave scheduled continuation disabled. Preserve existing work; do not merge the PR or release.
