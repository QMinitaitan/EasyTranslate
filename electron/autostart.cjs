const fs = require('fs')
const path = require('path')

const AUTOSTART_FILE = 'easytranslate.desktop'

function getLaunchSpec(app) {
  const executable = app.getPath('exe')
  const args = app.isPackaged ? [] : [app.getAppPath()]
  return { executable, args }
}

function quoteDesktopArg(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function getLinuxDesktopPath(app) {
  return path.join(app.getPath('appData'), 'autostart', AUTOSTART_FILE)
}

function buildLinuxDesktopEntry(app) {
  const { executable, args } = getLaunchSpec(app)
  const exec = [executable, ...args].map(quoteDesktopArg).join(' ')
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=EasyTranslate',
    'Comment=Start EasyTranslate when you sign in',
    `Exec=${exec}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

function isEnabled(app) {
  if (process.platform === 'linux') {
    const desktopPath = getLinuxDesktopPath(app)
    try {
      const content = fs.readFileSync(desktopPath, 'utf8')
      return /X-GNOME-Autostart-enabled\s*=\s*true/i.test(content) &&
        !/Hidden\s*=\s*true/i.test(content)
    } catch (_) {
      return false
    }
  }

  const { executable, args } = getLaunchSpec(app)
  return app.getLoginItemSettings({ path: executable, args }).openAtLogin
}

function setEnabled(app, enabled) {
  const requested = !!enabled

  if (process.platform === 'linux') {
    const desktopPath = getLinuxDesktopPath(app)
    if (requested) {
      fs.mkdirSync(path.dirname(desktopPath), { recursive: true })
      const tempPath = `${desktopPath}.tmp`
      fs.writeFileSync(tempPath, buildLinuxDesktopEntry(app), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(tempPath, desktopPath)
    } else {
      try { fs.unlinkSync(desktopPath) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  } else {
    const { executable, args } = getLaunchSpec(app)
    app.setLoginItemSettings({
      openAtLogin: requested,
      path: executable,
      args
    })
  }

  const actual = isEnabled(app)
  if (actual !== requested) {
    throw new Error(requested ? '系统未能启用开机自启动' : '系统未能关闭开机自启动')
  }
  return actual
}

module.exports = {
  getLaunchSpec,
  getLinuxDesktopPath,
  buildLinuxDesktopEntry,
  isEnabled,
  setEnabled
}
