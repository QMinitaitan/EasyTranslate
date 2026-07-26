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
            <div class="setting-row-title">开机自启动</div>
            <div class="setting-row-desc">登录系统后自动启动 EasyTranslate</div>
            <div v-if="autoLaunchError" class="setting-error">{{ autoLaunchError }}</div>
          </div>
        </div>
        <div class="setting-row-control">
          <label class="switch" :class="{ disabled: autoLaunchBusy }">
            <input
              type="checkbox"
              v-model="autoLaunch"
              :disabled="autoLaunchBusy"
              @change="changeAutoLaunch"
            />
            <span class="switch-track"></span>
          </label>
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
            <div class="setting-row-title">悬浮窗大小</div>
            <div class="setting-row-desc">恢复为推荐的 380 × 500 竖向尺寸</div>
            <div v-if="popupResetDone" class="setting-success">已恢复默认大小</div>
          </div>
        </div>
        <div class="setting-row-control">
          <button class="btn btn-sm" @click="resetPopupSize">恢复默认</button>
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
import { ref, onMounted, onUnmounted, watch } from 'vue'
import BaseSelect from '../components/BaseSelect.vue'

const targetLangs = ['中文(简体)', '中文(繁体)', 'English', '日本語']
const closeOptions = [
  { label: '保留在托盘', value: 'tray' },
  { label: '退出程序', value: 'quit' }
]

const targetLang = ref('中文(简体)')
const closeAction = ref('tray')
const launchToTray = ref(false)
const raceMode = ref(true)
const autoLaunch = ref(false)
const autoLaunchBusy = ref(false)
const autoLaunchError = ref('')
const popupResetDone = ref(false)

let hydrated = false
let saveTimer = null
let resetTimer = null

async function loadSettings() {
  if (!window.api?.loadConfig) {
    hydrated = true
    return
  }
  try {
    const [cfg, systemAutoLaunch] = await Promise.all([
      window.api.loadConfig(),
      window.api.getAutoLaunch()
    ])
    targetLang.value = cfg.target || '中文(简体)'
    closeAction.value = cfg.closeAction || 'tray'
    launchToTray.value = !!cfg.launchToTray
    raceMode.value = cfg.raceMode !== false
    autoLaunch.value = !!systemAutoLaunch
  } catch (error) {
    autoLaunchError.value = error?.message || '读取系统启动设置失败'
  } finally {
    hydrated = true
  }
}

function scheduleSave() {
  if (!hydrated || !window.api?.saveConfig) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.api.saveConfig({
      target: targetLang.value,
      closeAction: closeAction.value,
      launchToTray: launchToTray.value,
      raceMode: raceMode.value
    }).catch(() => {})
  }, 120)
}

watch([targetLang, closeAction, launchToTray, raceMode], scheduleSave)

async function changeAutoLaunch() {
  const requested = autoLaunch.value
  if (!window.api?.setAutoLaunch) return
  autoLaunchBusy.value = true
  autoLaunchError.value = ''
  try {
    autoLaunch.value = !!(await window.api.setAutoLaunch(requested))
  } catch (error) {
    autoLaunch.value = !requested
    autoLaunchError.value = error?.message || '开机自启动设置失败'
  } finally {
    autoLaunchBusy.value = false
  }
}

async function resetPopupSize() {
  if (!window.api?.resetPopupBounds) return
  await window.api.resetPopupBounds()
  popupResetDone.value = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => { popupResetDone.value = false }, 1800)
}

onMounted(loadSettings)
onUnmounted(() => {
  clearTimeout(saveTimer)
  clearTimeout(resetTimer)
})
</script>

<style scoped>
.switch.disabled { opacity: 0.55; cursor: wait; }
.setting-error,
.setting-success {
  margin-top: 3px;
  font-size: var(--fs-xs);
}
.setting-error { color: var(--danger); }
.setting-success { color: var(--success); }
</style>
