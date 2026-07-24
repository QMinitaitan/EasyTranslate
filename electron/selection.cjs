const { exec } = require('child_process')
const { clipboard } = require('electron')

function execCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 800 }, (err, stdout, stderr) => {
      resolve({ err, stdout: (stdout || '').toString().trim() })
    })
  })
}

async function getSelection() {
  // 优先用 xsel 读 primary selection(选中文本即写入)
  const { stdout: primary } = await execCmd('xsel --primary --output 2>/dev/null')
  if (primary) return { text: primary, source: 'xsel-primary' }

  // fallback:xclip primary
  const { stdout: xc } = await execCmd('xclip -o -selection primary 2>/dev/null')
  if (xc) return { text: xc, source: 'xclip-primary' }

  // 最后 fallback:剪贴板
  const cb = clipboard.readText()
  if (cb) return { text: cb, source: 'clipboard' }

  return { text: '', source: 'empty' }
}

module.exports = { getSelection }
