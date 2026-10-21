# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

EasyTranslate 是一个跨平台划词翻译桌面应用：Electron 主进程 + Vue 3 渲染进程。用户选中任意应用的文字后按全局快捷键，悬浮窗就近弹出并翻译；支持多引擎并发竞速、翻译历史、收藏与中英文设置。发布物有 Windows NSIS 与 Debian `.deb` 两种，通过 GitHub Releases 分发。

## 命令

```bash
npm run dev          # 编译 Electron TypeScript，再启动 Vite (:5173)、类型编译监听与 Electron
npm run dev:web      # 仅浏览器预览 UI（无 Electron）
npm run build        # Electron TypeScript → dist-electron/，Vite → dist/
npm run typecheck    # 严格检查 Electron TypeScript 和 Vue SFC（vue-tsc）
npm test             # node --test tests/*.test.cjs
npm run check        # 类型检查、回归测试与生产构建
npm run dist:linux   # vite build + electron-builder 打包 .deb
npm run dist:win     # vite build + electron-builder 打包 Windows NSIS
npm run trigger      # bash electron/trigger.sh，通过本地 socket 触发现用应用划词翻译
```

- 需 Node.js ≥ 22.12。
- Linux 划词依赖系统 PRIMARY Selection：`sudo apt install xsel`（或 `xclip`、`wl-clipboard`）。
- 无 linter 配置。

### 测试

单测在 `tests/*.test.cjs`，直接 `require` Electron 模块并注入 mock 依赖，因此大部分可以脱离 Electron 运行：

```bash
node --test tests/race.test.cjs        # 单个文件
npm test
```

### 发布

发布流程见 `docs/RELEASING.md`：`npm ci && npm run check`，然后 `npm run dist:linux` / `dist:win`（产物在 `release/`）。打包与发布配置在 `electron-builder.yml`（`.deb` 由 Ubuntu 构建、`.exe` 由 Windows 构建，可走 `docs/build-installers.workflow.yml` 的 CI）。发布前更新 `package.json` 版本、应用内版本号和 `CHANGELOG.md`，打 `v0.0.x` 标签。

## 架构

划词翻译链路：

```text
全局快捷键 → selection.cjs 取词 → desktop-runtime 就绪投递 → Popup.vue → typed IPC → translation-session → provider-service → 结果进度 + 当前会话历史
```

### 进程与目录

- **`electron/`（主进程，TypeScript `.cts` 编译为 `.cjs`）**，实际入口为 `dist-electron/main.cjs`，源文件 `main.cts` 负责依赖组装、主窗口、托盘、快捷键、IPC 和退出协调：
  - `mainWin`：设置主窗口（加载 Vite 或 `dist/index.html`）。
  - `desktop-runtime.cts`：拥有单个无边框悬浮窗、隐藏预热、应用就绪、最新触发、固定、失焦与几何信息。保持预热不抢焦点，取词结束后再显示。
  - Linux socket 服务器用 `~/.translate-app.sock` 的 `trigger` 命令触发同一条快捷键链路。
- **`src/`（Vue 3 + Vue Router，哈希路由）**：路由 `/` 主窗口、`/popup` 悬浮窗、`/settings/*` 设置页。`src/views/Popup.vue` 是最复杂的视图。
- **IPC 桥**：`electron/preload.cts` 编译为 `dist-electron/preload.cjs`，由窗口直接加载，用 `contextBridge` 暴露 `window.api`。共享约定在 `electron/shared/ipc-contract.cts`；翻译操作使用明确的请求对象，主进程对跨进程输入做运行时校验。修改入口、编译或声明接口时读取 `docs/TYPESCRIPT.md`。

### 翻译子系统（核心设计）

- `providers.cts`：**翻译引擎元数据的单一事实来源**（id/name/color/adapter/enabled/…）。
- `provider-service.cts`：集中可用性判断、受控探测、真实 OpenAI-compatible/DeepL 协议、取消与超时。Bing/Google 仅支持明确配置的兼容端点；其他未实现官方 adapter 返回准确原因。
- `translation-session.cts`：单引擎和竞速共享当前会话归属、替代、取消、首个成功与自动历史资格；迟到的过期结果不更新展示或新增历史。
- `race.cts`：保留排序策略 `rankRaceResults`，调度与生命周期由会话拥有。
- `selection.cjs`：跨平台取词。Win/mac 用哨兵写入剪贴板 + 模拟 Ctrl/Cmd+C，**结束后恢复用户原剪贴板**；Linux 直接读 PRIMARY Selection（`wl-paste`/`xsel`/`xclip` 依次尝试）。
- `config-store.cts` / `history-store.cts`：集中缓存、兼容、异步串行原子写入与持久结果通知；JSON 路径保持用户主目录 `~/.translate-app.config.json` 与 `~/.translate-app.history.json`（勿提交真实凭据）。
- `autostart.cjs`、`popup-auto-hide.cjs`、`popup-bounds.cjs`：开机启动、悬浮窗失焦自动隐藏、位置尺寸记忆，各自独立可测。

### 配置与历史

- 配置结构：`providers[引擎id] = { enabled, apiKey, endpoint?, region?, model?, prompt?, secret? }`，加上 `target`(默认"中文(简体)")、`uiLanguage`、`closeAction`、`shortcuts.{translate,show}`、`raceMode` 等。
- 历史条目 `{ id, src, dst, engine, color, lang, ts, favorite }`，收藏优先且不限量，非收藏最多保留 20 条。
- 默认开关由引擎元数据生成；实际可用性还须满足已实现 adapter 与有效配置，由 provider-service 统一判断。

### 渲染进程要点

- `src/App.vue` 用 `isPopupRoute`（`/popup` + `window=popup`）区分悬浮窗与主窗口两种外壳。
- 多语言和主题由 typed composables 提供；相关视图、组件和模板由 `vue-tsc` 检查。
- `usePendingSettings.ts` 拥有界面尚未保存的设置和在途请求；原生退出先确认界面提交，再等待取词清理、桌面几何与存储队列。保存失败保留修改并中止退出，可修复后重试。
- 图标来自 `lucide-vue-next`；品牌资产在 `assets/icon-v3/`。

## 开发工作流

- 设计与实施计划以日期命名存于 `docs/superpowers/`：`specs/`（如 `2026-07-28-popup-pinned-topmost-design.md`）与 `plans/`。改动相关功能前先读对应文档。
- 主分支 `main` 是发布线，Git 标签 `v0.0.x` 对应 GitHub Release。
- 若需在浏览器调试 UI 而无 Electron API，用 `npm run dev:web`，但 `window.api` 相关的功能不可用。

## Agent skills

### Issue tracker

需要读取、发布或更新规格和任务时，使用本仓库的 GitHub Issues。
操作前读取 `docs/agents/issue-tracker.md`。

### Triage labels

需要分类或更新任务状态标签时，读取 `docs/agents/triage-labels.md`，
使用其中定义的五个默认标签。

### Domain docs

本仓库采用 single-context 布局。
探索领域概念或架构决策前，读取 `docs/agents/domain.md`。
