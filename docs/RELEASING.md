# EasyTranslate 发布清单

## 发布前条件

- 使用 Node.js 22 或更高版本执行干净安装：`npm ci`
- `npm run check` 全部通过
- Windows x64 安装包和 Debian x64 安装包均能完成安装、启动和卸载
- 至少配置一个真实翻译服务，验证划词、竞速、复制、朗读和历史记录
- 检查托盘图标、任务栏图标、开机启动和两个全局快捷键
- 确认仓库与安装包中不包含 API Key、Secret、证书或本地配置
- 更新 `package.json` 版本号、应用内版本号和 `CHANGELOG.md`
- 创建与版本一致的 Git 标签，例如 `v0.0.1`

## 构建

```bash
npm ci
npm run check
npm run dist:linux
npm run dist:win
```

产物默认输出到 `release/`：

- `EasyTranslate-<版本>-amd64.deb`
- `EasyTranslate-Setup-<版本>-x64.exe`

Linux 主机交叉构建 Windows 安装包通常需要 Wine。更稳定的方式是将 `docs/build-installers.workflow.yml` 复制到 `.github/workflows/build-installers.yml`，让 `.deb` 在 Ubuntu 构建，让 `.exe` 在 Windows 构建。提交该工作流需要 GitHub Token 具有 `workflow` 权限。

## 签名

### Windows

未签名的 NSIS 安装程序可以安装，但可能触发 SmartScreen。正式发布应配置 Windows 代码签名，并将证书和密码保存为 GitHub Actions Secrets，严禁提交到仓库。

### Debian

直接下载的 `.deb` 可以使用 `apt install ./文件名.deb` 安装。若要进入 APT 软件源，还需要维护软件源、生成仓库元数据并使用 GPG 签名。

## GitHub Release

1. 合并并推送发布提交。
2. 创建版本标签：`git tag -a v0.0.1 -m "EasyTranslate v0.0.1"`。
3. 推送标签：`git push origin v0.0.1`。
4. 等待 GitHub Actions 构建两个平台的安装包。
5. 在 GitHub Releases 创建发行版，粘贴 `CHANGELOG.md` 对应版本内容。
6. 上传 `.exe`、`.deb` 及 SHA-256 校验文件。
7. 在干净的 Windows 和 Debian/Ubuntu 环境中进行一次最终安装验证。
