<div align="center">
  <img src="assets/icon-v3/easytranslate-mark.svg" width="96" height="96" alt="EasyTranslate">
  <h1>EasyTranslate</h1>
  <p>轻量、快速、跨平台的划词翻译工具。</p>
</div>

EasyTranslate 是一个基于 Electron 和 Vue 3 的桌面翻译应用。选中任意应用中的文字后按下全局快捷键，即可在悬浮窗中查看译文，并在多个翻译服务之间快速比较结果。

## 功能

- 全局划词翻译快捷键，默认 `Alt + Q`
- 可调整大小、置顶和拖动的翻译悬浮窗
- 多引擎并发竞速与结果切换
- 支持 DeepSeek、Bing、OpenAI、DeepL、有道、腾讯、彩云、百度和 Google
- 原文和译文均可编辑，支持复制与朗读
- 翻译历史、收藏、搜索和引擎筛选
- 明亮、深色和跟随系统三种主题模式
- 中英文设置界面
- 托盘运行、开机启动与自定义全局快捷键
- 设置项拖拽排序

## 下载与安装

从项目的 [Releases](https://github.com/QMinitaitan/EasyTranslate/releases) 页面下载适合系统的安装包。

### Windows

下载 `EasyTranslate-Setup-<版本>-x64.exe` 并运行安装程序。

当前预览版本如果未进行代码签名，Windows SmartScreen 可能显示未知发布者警告。正式公开发布建议使用可信代码签名证书。

### Debian / Ubuntu

下载 `EasyTranslate-<版本>-amd64.deb`，然后运行：

```bash
sudo apt install ./EasyTranslate-<版本>-amd64.deb
```

在部分 Linux 桌面环境中，划词读取需要系统提供 PRIMARY Selection。若无法获取选中文字，可安装以下任一工具：

```bash
sudo apt install wl-clipboard
# 或
sudo apt install xsel
# 或
sudo apt install xclip
```

## 快速开始

1. 打开“翻译接口”，填写至少一个翻译服务的 API 凭据并启用该服务。
2. 在任意应用中选中一段文字。
3. 按 `Alt + Q` 打开翻译悬浮窗。
4. 按 `Alt + E` 显示或隐藏主窗口。

API 凭据由用户自行申请。EasyTranslate 不附带任何服务商密钥，也不会将密钥上传到本项目维护者的服务器。

## 本地开发

需要 Node.js 22 或更高版本和 npm。

```bash
git clone https://github.com/QMinitaitan/EasyTranslate.git
cd EasyTranslate
npm ci
npm run dev
```

常用命令：

```bash
npm test          # 运行 Node.js 测试
npm run build     # 构建前端
npm run check     # 测试并构建
npm run dist:win  # 生成 Windows x64 NSIS 安装包
npm run dist:linux # 生成 Linux x64 deb 安装包
```

安装包输出至 `release/`。

## 隐私与安全

- 翻译文本会直接发送给用户启用的第三方翻译服务，请遵守对应服务的隐私政策。
- API 凭据当前保存在用户目录下的本地配置文件中，尚未接入系统密钥链。不要在共享账户中保存敏感密钥。
- 应用会读取当前选中文字；Windows 上会临时使用剪贴板并在读取后恢复原内容。
- 仓库中的默认配置不包含任何 API Key 或 Secret。

## 发布

维护者发布新版本前请阅读 [发布清单](docs/RELEASING.md)。仓库提供一份 [GitHub Actions 工作流模板](docs/build-installers.workflow.yml)，可在 Windows 和 Ubuntu 环境中分别构建安装包。

## 许可证

[MIT](LICENSE)
