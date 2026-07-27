<template>
  <div class="page">
    <h2 class="page-title">{{ text.title }}</h2>
    <p class="page-sub">{{ text.subtitle }}</p>

    <SortableSettingList
      v-model="settingsOrder"
      class="setting-section"
      :items="generalItems"
      @reorder="saveSettingsOrder"
    >
      <template #default="{ item }">
        <div v-if="item.id === 'systemLanguage'" class="setting-row">
          <div class="setting-row-info">
            <div class="setting-row-text">
              <div class="setting-row-title">{{ text.systemLanguage }}</div>
              <div class="setting-row-desc">{{ text.systemLanguageDesc }}</div>
            </div>
          </div>
          <div class="setting-row-control">
            <BaseSelect v-model="locale" :options="languageOptions" />
          </div>
        </div>

        <div v-else-if="item.id === 'closeAction'" class="setting-row">
          <div class="setting-row-info">
            <div class="setting-row-text">
              <div class="setting-row-title">{{ text.closeWindow }}</div>
              <div class="setting-row-desc">{{ text.closeWindowDesc }}</div>
            </div>
          </div>
          <div class="setting-row-control">
            <BaseSelect v-model="closeAction" :options="closeOptions" />
          </div>
        </div>

        <div v-else-if="item.id === 'autoLaunch'" class="setting-row">
          <div class="setting-row-info">
            <div class="setting-row-text">
              <div class="setting-row-title">{{ text.autoLaunch }}</div>
              <div class="setting-row-desc">{{ text.autoLaunchDesc }}</div>
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

        <div v-else-if="item.id === 'launchToTray'" class="setting-row">
          <div class="setting-row-info">
            <div class="setting-row-text">
              <div class="setting-row-title">{{ text.launchToTray }}</div>
              <div class="setting-row-desc">{{ text.launchToTrayDesc }}</div>
            </div>
          </div>
          <div class="setting-row-control">
            <label class="switch">
              <input type="checkbox" v-model="launchToTray" />
              <span class="switch-track"></span>
            </label>
          </div>
        </div>

        <div v-else-if="item.id === 'popupSize'" class="setting-row">
          <div class="setting-row-info">
            <div class="setting-row-text">
              <div class="setting-row-title">{{ text.popupSize }}</div>
              <div class="setting-row-desc">{{ text.popupSizeDesc }}</div>
              <div v-if="popupResetDone" class="setting-success">{{ text.popupResetDone }}</div>
            </div>
          </div>
          <div class="setting-row-control">
            <button class="btn btn-sm" @click="resetPopupSize">{{ text.restoreDefault }}</button>
          </div>
        </div>

        <div v-else class="setting-row">
          <div class="setting-row-info">
            <div class="setting-row-text">
              <div class="setting-row-title">{{ text.raceMode }}</div>
              <div class="setting-row-desc">{{ text.raceModeDesc }}</div>
            </div>
          </div>
          <div class="setting-row-control">
            <label class="switch">
              <input type="checkbox" v-model="raceMode" />
              <span class="switch-track"></span>
            </label>
          </div>
        </div>
      </template>
    </SortableSettingList>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import BaseSelect from '../components/BaseSelect.vue'
import SortableSettingList from '../components/SortableSettingList.vue'
import { useLocale } from '../composables/useLocale'

const { locale, isEnglish, setLocale } = useLocale()
const languageOptions = [
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en' }
]
const generalItems = [
  { id: 'systemLanguage', name: 'System Language' },
  { id: 'closeAction', name: 'Close Action' },
  { id: 'autoLaunch', name: 'Auto Launch' },
  { id: 'launchToTray', name: 'Launch to Tray' },
  { id: 'popupSize', name: 'Popup Size' },
  { id: 'raceMode', name: 'Race Mode' }
]
const text = computed(() => isEnglish.value ? {
  title: 'General',
  subtitle: 'Application behavior and preferences',
  systemLanguage: 'System Language',
  systemLanguageDesc: 'Language used throughout the settings center',
  closeWindow: 'When Closing the Window',
  closeWindowDesc: 'Choose what happens when the main window closes',
  autoLaunch: 'Launch at Login',
  autoLaunchDesc: 'Start EasyTranslate automatically after signing in',
  launchToTray: 'Launch to Tray',
  launchToTrayDesc: 'Keep the main window hidden until opened with a shortcut',
  popupSize: 'Popup Size',
  popupSizeDesc: 'Restore the recommended 380 × 500 portrait size',
  popupResetDone: 'Default size restored',
  restoreDefault: 'Restore Default',
  raceMode: 'Parallel Race',
  raceModeDesc: 'Query every enabled engine and show the fastest result with the top three times',
  readAutoLaunchError: 'Unable to read the system startup setting',
  autoLaunchError: 'Unable to update the startup setting'
} : {
  title: '通用',
  subtitle: '应用行为与偏好设置',
  systemLanguage: '系统语言',
  systemLanguageDesc: '切换整个设置中心的显示语言',
  closeWindow: '关闭窗口时',
  closeWindowDesc: '关闭主窗口后的行为',
  autoLaunch: '开机自启动',
  autoLaunchDesc: '登录系统后自动启动 EasyTranslate',
  launchToTray: '启动到托盘',
  launchToTrayDesc: '启动后主窗口隐藏，仅通过快捷键唤出',
  popupSize: '悬浮窗大小',
  popupSizeDesc: '恢复为推荐的 380 × 500 竖向尺寸',
  popupResetDone: '已恢复默认大小',
  restoreDefault: '恢复默认',
  raceMode: '并排竞速',
  raceModeDesc: '悬浮窗并发请求全部启用引擎，显示最快结果及前三耗时',
  readAutoLaunchError: '读取系统启动设置失败',
  autoLaunchError: '开机自启动设置失败'
})
const closeOptions = computed(() => isEnglish.value
  ? [{ label: 'Keep in Tray', value: 'tray' }, { label: 'Quit', value: 'quit' }]
  : [{ label: '保留在托盘', value: 'tray' }, { label: '退出程序', value: 'quit' }]
)

const closeAction = ref('tray')
const launchToTray = ref(false)
const raceMode = ref(true)
const autoLaunch = ref(false)
const autoLaunchBusy = ref(false)
const autoLaunchError = ref('')
const popupResetDone = ref(false)
const settingsOrder = ref([])

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
    if (cfg.uiLanguage && cfg.uiLanguage !== 'system') setLocale(cfg.uiLanguage)
    closeAction.value = cfg.closeAction || 'tray'
    launchToTray.value = !!cfg.launchToTray
    raceMode.value = cfg.raceMode !== false
    autoLaunch.value = !!systemAutoLaunch
    settingsOrder.value = cfg.settingsOrder?.general || []
  } catch (error) {
    autoLaunchError.value = error?.message || text.value.readAutoLaunchError
  } finally {
    hydrated = true
  }
}

function saveSettingsOrder(order) {
  window.api?.saveConfig?.({
    settingsOrder: { general: order }
  }).catch(() => {})
}

function scheduleSave() {
  if (!hydrated || !window.api?.saveConfig) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.api.saveConfig({
      uiLanguage: locale.value,
      closeAction: closeAction.value,
      launchToTray: launchToTray.value,
      raceMode: raceMode.value
    }).catch(() => {})
  }, 120)
}

watch(locale, () => {
  setLocale(locale.value)
  scheduleSave()
})
watch([closeAction, launchToTray, raceMode], scheduleSave)

async function changeAutoLaunch() {
  const requested = autoLaunch.value
  if (!window.api?.setAutoLaunch) return
  autoLaunchBusy.value = true
  autoLaunchError.value = ''
  try {
    autoLaunch.value = !!(await window.api.setAutoLaunch(requested))
  } catch (error) {
    autoLaunch.value = !requested
    autoLaunchError.value = error?.message || text.value.autoLaunchError
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
