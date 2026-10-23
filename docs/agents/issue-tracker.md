# Issue tracker: GitHub

本仓库的规格和任务以 GitHub Issues 为正式记录。

## Repository

- Repository: `QMinitaitan/EasyTranslate`
- Issues: https://github.com/QMinitaitan/EasyTranslate/issues
- 每次操作明确指定目标仓库，避免依赖当前目录推断。

## Operations

使用可用且已认证的 `gh` CLI；如果当前环境没有 `gh`，
使用已连接的 GitHub 工具执行相同操作。

gh 命令显式添加 `--repo QMinitaitan/EasyTranslate`：

- 创建：`gh issue create --repo QMinitaitan/EasyTranslate --title "..." --body-file <正文文件>`
- 读取：`gh issue view <number> --repo QMinitaitan/EasyTranslate --comments`
- 列表：`gh issue list --repo QMinitaitan/EasyTranslate --state open --json number,title,body,labels,comments`
- 评论：`gh issue comment <number> --repo QMinitaitan/EasyTranslate --body-file <正文文件>`
- 加标签：`gh issue edit <number> --repo QMinitaitan/EasyTranslate --add-label "..."`
- 去标签：`gh issue edit <number> --repo QMinitaitan/EasyTranslate --remove-label "..."`
- 关闭：`gh issue close <number> --repo QMinitaitan/EasyTranslate --comment "..."`

多行正文先写入临时文件，再使用 `--body-file`，保留实际换行。
使用连接工具时，通过结构化参数传递正文及目标仓库。

当技能要求“publish to the issue tracker”时，创建 GitHub Issue。
只有取得返回的 Issue 编号和链接后，才报告发布成功。
本地草稿和聊天中的任务列表属于准备材料。

当技能要求“fetch the relevant ticket”时，读取 Issue 正文、
标签、状态、评论以及父子任务和阻塞关系。

## Parent issues and dependencies

优先使用 GitHub 原生 sub-issues 表达父子任务关系。
不支持时，在子任务正文开头写 `Part of #<parent>`，
并在父任务中维护带链接的任务清单。

优先使用 GitHub 原生 issue dependencies 表达阻塞关系。
依赖 API 所需的 issue_id 是数据库 ID，不是 Issue 编号。
不支持时，在正文开头写 `Blocked by: #<number>`。
所有阻塞任务关闭后，任务才视为解除阻塞。

## Wayfinding operations

- Map：一个带 `wayfinder:map` 标签的父 Issue，
  保存 Notes、Decisions-so-far 和 Fog。
- Child ticket：关联到 Map 的子 Issue，使用
  `wayfinder:research`、`wayfinder:prototype`、
  `wayfinder:grilling` 或 `wayfinder:task`。
- Frontier：按 Map 顺序选择未关闭、无未解决阻塞且无人认领的子任务。
- Claim：将任务指派给执行者。
- Resolve：在任务中记录结果，关闭任务，并在 Map 中补充结论及链接。

## Pull requests as a triage surface

**PRs as a request surface: no.**
