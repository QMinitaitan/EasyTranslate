# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

EasyTranslate 是一个跨平台划词翻译桌面应用：Electron 主进程 + Vue 3 渲染进程。用户选中任意应用的文字后按全局快捷键，悬浮窗就近弹出并翻译；支持多引擎并发竞速、翻译历史、收藏与中英文设置。发布物有 Windows NSIS 与 Debian `.deb` 两种，通过 GitHub Releases 分发。

## 命令

```bash
npm run dev          # concurrently 启动 Vite (:5173) 与 Electron 窗口
npm run dev:web      # 仅浏览器预览 UI（无 Electron）
npm run build        # Vite 生产构建 → dist/
npm test             # node --test tests/*.test.cjs
npm run check        # npm test && npm run build
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
全局快捷键 → selection.cjs 取选中文字 → 创建/复用悬浮窗(BrowserWindow) → 渲染进程 Popup.vue → IPC → translate.cjs → 翻译引擎 → 结果回渲染层 + 写历史
```

### 进程与目录

- **`electron/`（主进程，CommonJS `.cjs`）**，入口 `main.cjs` 管理两个窗口：
  - `mainWin`：设置主窗口（加载 Vite 或 `dist/index.html`）。
  - `popupWin`：无边框悬浮窗（frameless、`alwaysOnTop`、`skipTaskbar`），经 `?window=popup` 哈希标记独立渲染。首次在光标附近定位，之后记忆位置与尺寸。
  - 所有翻译逻辑与全局快捷键、系统托盘、socket 服务器（Linux 用 `~/.translate-app.sock` 的 `trigger` 命令）都在这层。
- **`src/`（Vue 3 + Vue Router，哈希路由）**：路由 `/` 主窗口、`/popup` 悬浮窗、`/settings/*` 设置页。`src/views/Popup.vue` 是最复杂的视图。
- **IPC 桥**：`electron/preload.cjs` 用 `contextBridge` 暴露 `window.api`（同步 channel 用 `invoke`，事件流如 `translate:race:progress` 用 `on` + 返回退订函数）。

### 翻译子系统（核心设计）

- `providers.cjs`：**所有翻译引擎元数据的单一事实来源**（id/name/color/adapter/enabled/…）。新增引擎在这里加条目。内置 DeepSeek/Bing/OpenAI/Google/DeepL/有道/腾讯/彩云/百度。
- `translate.cjs`：`adapters` 注册表按 `meta.adapter` 分发到具体实现。目前只有 `openai-compat`（覆盖 DeepSeek/OpenAI/Bing/Google）与 `deepl` 两个真实现；**有道/腾讯/彩云/百度是拒绝 stub（未实现）**。新适配器在这里加。
- `race.cjs`：`runTranslationRace` 并发跑所有启用的引擎，按耗时排序，取第一个成功结果；`onFirstSuccess` 只写一次历史。纯逻辑、可注入 `execute`/`now`，测试友好。
- `selection.cjs`：跨平台取词。Win/mac 用哨兵写入剪贴板 + 模拟 Ctrl/Cmd+C，**结束后恢复用户原剪贴板**；Linux 直接读 PRIMARY Selection（`wl-paste`/`xsel`/`xclip` 依次尝试）。
- `config.cjs` / `history.cjs`：JSON 文件持久化于用户主目录 `~/.translate-app.config.json` 与 `~/.translate-app.history.json`（**不在仓库内**，勿提交真实 API Key）。配置默认值由 `providers.cjs` 元数据生成。
- `autostart.cjs`、`popup-auto-hide.cjs`、`popup-bounds.cjs`：开机启动、悬浮窗失焦自动隐藏、位置尺寸记忆，各自独立可测。

### 配置与历史

- 配置结构：`providers[引擎id] = { enabled, apiKey, endpoint?, region?, model?, prompt?, secret? }`，加上 `target`(默认"中文(简体)")、`uiLanguage`、`closeAction`、`shortcuts.{translate,show}`、`raceMode` 等。
- 历史条目 `{ id, src, dst, engine, color, lang, ts, favorite }`，收藏优先且不限量，非收藏最多保留 20 条。
- 翻译引擎默认禁用，需在设置中启用并填 API Key（引擎元数据里 `enabled: true` 的 DeepSeek/Bing/OpenAI 默认开启）。

### 渲染进程要点

- `src/App.vue` 用 `isPopupRoute`（`/popup` + `window=popup`）区分悬浮窗与主窗口两种外壳。
- 多语言：`composables/useLocale.js` 提供 `t()`；主题：`useTheme.js`（明/暗/跟随系统）。
- 图标来自 `lucide-vue-next`；品牌资产在 `assets/icon-v3/`。

## 开发工作流

- 设计与实施计划以日期命名存于 `docs/superpowers/`：`specs/`（如 `2026-07-28-popup-pinned-topmost-design.md`）与 `plans/`。改动相关功能前先读对应文档。
- 主分支 `main` 是发布线，Git 标签 `v0.0.x` 对应 GitHub Release。
- 若需在浏览器调试 UI 而无 Electron API，用 `npm run dev:web`，但 `window.api` 相关的功能不可用。
