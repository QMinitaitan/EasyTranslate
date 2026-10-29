throw new Error('Historical native validation is disabled; see docs/validation/NATIVE-VALIDATION.md')
// Real Electron/Vue/IPC smoke with synthetic isolated storage and a controlled network boundary.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')

if (!process.versions.electron) {
  const output = path.join(root, '.runtime', 'provider-ui-smoke-' + Date.now())
  fs.mkdirSync(output, { recursive: true })
  const child = spawn(process.env.EASY_SMOKE_ELECTRON || require('electron'), [__filename], {
    env: { ...process.env, HOME: output, USERPROFILE: output, EASY_PROVIDER_SMOKE_OUTPUT: output },
    windowsHide: true,
    stdio: ['ignore', fs.openSync(path.join(output, 'stdout.txt'), 'w'), fs.openSync(path.join(output, 'stderr.txt'), 'w')]
  })
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', (code, signal) => {
    console.log(`Provider UI smoke exited ${code}${signal ? ` (${signal})` : ''}; evidence: ${output}`)
    process.exitCode = code === 0 ? 0 : 1
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const assert = require('node:assert/strict')
  const { EventEmitter } = require('node:events')
  const { PassThrough } = require('node:stream')
  const output = process.env.EASY_PROVIDER_SMOKE_OUTPUT
  const configPath = path.join(output, '.translate-app.config.json')
  const initial = JSON.stringify({ uiLanguage: 'zh-CN', raceMode: false, providers: {
    openai: { enabled: true, apiKey: 'synthetic-fixture-key' },
    bing: { enabled: true, apiKey: 'synthetic-fixture-key' },
    youdao: { enabled: true, apiKey: 'synthetic-fixture-key', secret: 'synthetic-secret' }
  } })
  fs.writeFileSync(configPath, initial)
  app.setPath('userData', path.join(output, 'profile'))
  let requests = 0
  require('node:https').request = (_url, _options, callback) => {
    requests += 1
    const req = new EventEmitter()
    req.write = () => {}
    req.destroy = () => {}
    req.end = () => setTimeout(() => {
      const response = new PassThrough()
      response.statusCode = 200
      callback(response)
      response.end(JSON.stringify({ choices: [{ message: { content: '你好' } }] }))
    }, 50)
    return req
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function until(win, script) {
    for (let i = 0; i < 150; i++) {
      const result = await win.webContents.executeJavaScript(script)
      if (result) return result
      await wait(30)
    }
    throw new Error('UI fixture timeout')
  }
  async function select(win, name) {
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.setting-row-title')).find(el => el.textContent.trim().startsWith(${JSON.stringify(name)})).closest('.setting-row').click()`)
    await wait(50)
  }
  async function probe(win) {
    await win.webContents.executeJavaScript(`document.querySelector('.setting-expand .btn.btn-sm').click()`)
    return until(win, `document.querySelector('.provider-result')?.textContent?.trim()`)
  }
  let once = false
  const deadline = setTimeout(() => {
    fs.writeFileSync(path.join(output, 'error.txt'), 'UI fixture deadline')
    app.isQuiting = true
    app.exit(1)
  }, 20000)
  app.on('browser-window-created', (_event, win) => {
    if (once) return
    once = true
    win.webContents.once('did-finish-load', async () => {
      try {
        await win.webContents.executeJavaScript(`location.hash = '#/settings/api'`)
        await until(win, `document.querySelectorAll('.setting-row-title').length === 9`)
        await select(win, 'OpenAI')
        const success = await probe(win)
        assert.match(success, /本次实际探测成功/)
        assert.equal(requests, 1)
        await wait(100)
        fs.writeFileSync(path.join(output, 'provider-success.png'), (await win.webContents.capturePage()).toPNG())
        await select(win, 'Bing')
        const missing = await probe(win)
        assert.match(missing, /缺少 OpenAI-compatible Endpoint/)
        assert.equal(requests, 1)
        await select(win, '有道')
        const unsupported = await probe(win)
        assert.match(unsupported, /尚未实现/)
        assert.equal(requests, 1)
        await win.webContents.executeJavaScript(`location.hash = '#/popup'`)
        await until(win, `document.querySelector('.es-trigger')?.textContent?.includes('OpenAI')`)
        await win.webContents.executeJavaScript(`document.querySelector('.es-trigger').click()`)
        const available = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.es-item .name')).map(el => el.textContent.trim())`)
        assert.deepEqual(available, ['OpenAI', 'Race'])
        assert.equal(fs.readFileSync(configPath, 'utf8'), initial, 'hydration and probing must not rewrite persisted settings')
        fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success, missing, unsupported, available, requests, configUnchanged: true, windows: BrowserWindow.getAllWindows().length }, null, 2))
        clearTimeout(deadline)
        app.isQuiting = true
        app.quit()
      } catch (error) {
        fs.writeFileSync(path.join(output, 'error.txt'), error.stack)
        clearTimeout(deadline)
        app.isQuiting = true
        app.exit(1)
      }
    })
  })
  require(path.join(root, require(path.join(root, 'package.json')).main))
}
