<template>
  <div class="page">
    <h2 class="page-title">通用</h2>
    <p class="page-sub">翻译行为、应用偏好</p>

    <div class="setting-section">
      <div class="setting-row">
        <div class="setting-row-info">
          <div class="setting-row-text">
            <div class="setting-row-title">默认目标语言</div>
            <div class="setting-row-desc">翻译未明确指定时的目标语言</div>
          </div>
        </div>
        <div class="setting-row-control">
          <BaseSelect v-model="targetLang" :options="targetLangs" />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-row-info">
          <div class="setting-row-text">
            <div class="setting-row-title">关闭窗口时</div>
            <div class="setting-row-desc">关闭主窗口后的行为</div>
          </div>
        </div>
        <div class="setting-row-control">
          <BaseSelect v-model="closeAction" :options="closeOptions" />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-row-info">
          <div class="setting-row-text">
            <div class="setting-row-title">启动到托盘</div>
            <div class="setting-row-desc">启动后主窗口隐藏，仅通过快捷键唤出</div>
          </div>
        </div>
        <div class="setting-row-control">
          <label class="switch">
            <input type="checkbox" v-model="launchToTray" />
            <span class="switch-track"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-row-info">
          <div class="setting-row-text">
            <div class="setting-row-title">并排竞速</div>
            <div class="setting-row-desc">悬浮窗并发请求全部启用引擎，按首结果展示，底部显示前三耗时</div>
          </div>
        </div>
        <div class="setting-row-control">
          <label class="switch">
            <input type="checkbox" v-model="raceMode" />
            <span class="switch-track"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BaseSelect from '../components/BaseSelect.vue'

const targetLangs = ['中文(简体)', '中文(繁体)', 'English', '日本語']
const closeOptions = [
  { label: '保留在托盘', value: 'tray' },
  { label: '退出程序', value: 'quit' }
]

const targetLang = ref('中文(简体)')
const closeAction = ref('tray')
const launchToTray = ref(true)
const raceMode = ref(true)
</script>
