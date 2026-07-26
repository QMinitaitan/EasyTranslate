const test = require('node:test')
const assert = require('node:assert/strict')
const {
  captureWithCopy,
  createSelectionService,
  getLinuxSelection
} = require('../electron/selection.cjs')

function createClipboard(initial = {}) {
  const state = {
    text: initial.text || '',
    html: initial.html || '',
    rtf: initial.rtf || '',
    image: initial.image || { isEmpty: () => true },
    selection: initial.selection || ''
  }
  return {
    state,
    readText(type) {
      return type === 'selection' ? state.selection : state.text
    },
    readHTML() { return state.html },
    readRTF() { return state.rtf },
    readImage() { return state.image },
    writeText(text) {
      state.text = text
      state.html = ''
      state.rtf = ''
      state.image = { isEmpty: () => true }
    },
    write(data) {
      state.text = data.text || ''
      state.html = data.html || ''
      state.rtf = data.rtf || ''
      state.image = data.image || { isEmpty: () => true }
    },
    clear() {
      state.text = ''
      state.html = ''
      state.rtf = ''
      state.image = { isEmpty: () => true }
    }
  }
}

const noWait = async () => {}

test('Windows capture reads the current selection and restores clipboard formats', async () => {
  const image = { isEmpty: () => false, id: 'image' }
  const clipboardApi = createClipboard({
    text: '原剪贴板',
    html: '<b>原剪贴板</b>',
    rtf: '{\\rtf1 原剪贴板}',
    image
  })

  const result = await captureWithCopy({
    platform: 'win32',
    clipboardApi,
    wait: noWait,
    copyShortcut: async () => {
      clipboardApi.writeText('当前选中文字')
      return { err: null }
    }
  })

  assert.equal(result.text, '当前选中文字')
  assert.equal(result.source, 'win32-selection')
  assert.equal(clipboardApi.state.text, '原剪贴板')
  assert.equal(clipboardApi.state.html, '<b>原剪贴板</b>')
  assert.equal(clipboardApi.state.rtf, '{\\rtf1 原剪贴板}')
  assert.equal(clipboardApi.state.image, image)
})

test('capture succeeds when selected text equals the previous clipboard text', async () => {
  const clipboardApi = createClipboard({ text: '相同文本' })
  const result = await captureWithCopy({
    platform: 'win32',
    clipboardApi,
    wait: noWait,
    copyShortcut: async () => {
      clipboardApi.writeText('相同文本')
      return { err: null }
    }
  })

  assert.equal(result.text, '相同文本')
  assert.equal(clipboardApi.state.text, '相同文本')
})

test('no selection never falls back to stale clipboard content', async () => {
  const clipboardApi = createClipboard({ text: '不应被翻译的旧内容' })
  const result = await captureWithCopy({
    platform: 'win32',
    clipboardApi,
    wait: noWait,
    copyShortcut: async () => ({ err: null })
  })

  assert.deepEqual(result, {
    text: '',
    source: 'empty',
    reason: 'copy-timeout'
  })
  assert.equal(clipboardApi.state.text, '不应被翻译的旧内容')
})

test('copy command errors still restore the clipboard', async () => {
  const clipboardApi = createClipboard({ text: '保留内容' })
  const result = await captureWithCopy({
    platform: 'win32',
    clipboardApi,
    wait: noWait,
    copyShortcut: async () => ({ err: new Error('blocked') })
  })

  assert.equal(result.text, '')
  assert.equal(result.reason, 'copy-command-failed')
  assert.equal(clipboardApi.state.text, '保留内容')
})

test('Linux uses the primary selection and never the regular clipboard fallback', async () => {
  const direct = createClipboard({ text: '旧剪贴板', selection: '当前选区' })
  assert.deepEqual(
    await getLinuxSelection(direct, async () => ({ err: new Error('unused'), stdout: '' })),
    { text: '当前选区', source: 'electron-primary' }
  )

  const empty = createClipboard({ text: '旧剪贴板' })
  assert.deepEqual(
    await getLinuxSelection(empty, async () => ({ err: new Error('missing'), stdout: '' })),
    {
      text: '',
      source: 'empty',
      reason: 'selection-tool-unavailable'
    }
  )
})

test('selection service routes capture through the configured platform strategy', async () => {
  const clipboardApi = createClipboard({ text: '原剪贴板' })
  const service = createSelectionService({
    platform: 'win32',
    clipboardApi,
    wait: noWait,
    copyShortcut: async () => {
      clipboardApi.writeText('服务化选区')
      return { err: null }
    }
  })

  assert.deepEqual(await service.capture(), {
    text: '服务化选区',
    source: 'win32-selection'
  })
  assert.equal(clipboardApi.state.text, '原剪贴板')
})
