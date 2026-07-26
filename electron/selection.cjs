const { execFile } = require('child_process')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function runFile(file, args, timeout = 2500) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        err,
        stdout: (stdout || '').toString().trim(),
        stderr: (stderr || '').toString().trim()
      })
    })
  })
}

function emptySelection(reason) {
  return { text: '', source: 'empty', reason }
}

function snapshotClipboard(clipboardApi) {
  return {
    text: clipboardApi.readText(),
    html: clipboardApi.readHTML?.() || '',
    rtf: clipboardApi.readRTF?.() || '',
    image: clipboardApi.readImage?.()
  }
}

function restoreClipboard(clipboardApi, snapshot) {
  const data = {}
  if (snapshot.text) data.text = snapshot.text
  if (snapshot.html) data.html = snapshot.html
  if (snapshot.rtf) data.rtf = snapshot.rtf
  if (snapshot.image && !snapshot.image.isEmpty?.()) data.image = snapshot.image

  if (Object.keys(data).length) clipboardApi.write(data)
  else clipboardApi.clear()
}

async function sendCopyShortcut(platform, runCommand = runFile) {
  if (platform === 'win32') {
    const memberDefinition =
      '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'
    const script = [
      `Add-Type -MemberDefinition '${memberDefinition}' -Name NativeKeyboard -Namespace EasyTranslate`,
      '[EasyTranslate.NativeKeyboard]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)',
      '[EasyTranslate.NativeKeyboard]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)',
      '[EasyTranslate.NativeKeyboard]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)',
      '[EasyTranslate.NativeKeyboard]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)'
    ].join('; ')
    return runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Sta',
      '-Command',
      script
    ])
  }

  if (platform === 'darwin') {
    return runCommand('/usr/bin/osascript', [
      '-e',
      'tell application "System Events" to keystroke "c" using command down'
    ])
  }

  return { err: new Error(`Unsupported platform: ${platform}`), stdout: '' }
}

async function captureWithCopy({
  platform,
  clipboardApi,
  runCommand = runFile,
  copyShortcut = sendCopyShortcut,
  wait = delay
}) {
  const original = snapshotClipboard(clipboardApi)
  const sentinel = `__easytranslate_selection_${Date.now()}_${Math.random()}__`
  let result = emptySelection('copy-timeout')
  let restoreFailed = false

  try {
    clipboardApi.writeText(sentinel)
    // Give the global-shortcut keys time to be released before sending Ctrl/Cmd+C.
    await wait(120)
    const copyResult = await copyShortcut(platform, runCommand)
    if (copyResult?.err) {
      result = emptySelection('copy-command-failed')
    } else {
      for (let elapsed = 0; elapsed < 700; elapsed += 25) {
        const text = clipboardApi.readText()?.trim()
        if (text && text !== sentinel) {
          result = { text, source: `${platform}-selection` }
          break
        }
        await wait(25)
      }
    }
  } finally {
    // Restore the user's clipboard so translating a selection is non-destructive.
    try {
      restoreClipboard(clipboardApi, original)
    } catch (_) {
      restoreFailed = true
    }
  }

  return restoreFailed
    ? { ...result, warning: 'clipboard-restore-failed' }
    : result
}

async function getLinuxSelection(clipboardApi, runCommand = runFile) {
  const electronSelection = clipboardApi.readText('selection')?.trim()
  if (electronSelection) {
    return { text: electronSelection, source: 'electron-primary' }
  }

  const commands = [
    ['wl-paste', ['--primary', '--no-newline']],
    ['xsel', ['--primary', '--output']],
    ['xclip', ['-o', '-selection', 'primary']]
  ]
  for (const [file, args] of commands) {
    const { stdout } = await runCommand(file, args)
    if (stdout) return { text: stdout, source: `${file}-primary` }
  }
  return emptySelection('selection-tool-unavailable')
}

function createSelectionService({
  platform = process.platform,
  clipboardApi,
  runCommand = runFile,
  copyShortcut = sendCopyShortcut,
  wait = delay
}) {
  if (!clipboardApi) throw new TypeError('clipboardApi is required')

  return {
    capture() {
      if (platform === 'win32' || platform === 'darwin') {
        return captureWithCopy({
          platform,
          clipboardApi,
          runCommand,
          copyShortcut,
          wait
        })
      }
      if (platform === 'linux') {
        return getLinuxSelection(clipboardApi, runCommand)
      }
      return Promise.resolve(emptySelection('unsupported-platform'))
    }
  }
}

async function getSelection(options = {}) {
  const clipboardApi = options.clipboardApi || require('electron').clipboard
  if (!clipboardApi) return emptySelection('clipboard-unavailable')

  return createSelectionService({
    platform: options.platform,
    clipboardApi,
    runCommand: options.runCommand,
    copyShortcut: options.copyShortcut,
    wait: options.wait
  }).capture()
}

module.exports = {
  getSelection,
  createSelectionService,
  captureWithCopy,
  getLinuxSelection,
  snapshotClipboard,
  restoreClipboard,
  sendCopyShortcut
}
