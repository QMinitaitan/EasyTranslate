<template>
  <div class="page">
    <h2 class="page-title">{{ isEnglish ? 'Prompt presets' : '提示词预设' }}</h2>
    <p class="page-sub">{{ isEnglish ? 'Switch in the popup. Saved edits are shared by all compatible engines.' : '在翻译弹窗中快速切换；保存后的修改由所有支持提示词的引擎共享。' }}</p>
    <p class="prompt-hint">{{ promptHint }}</p>
    <p v-if="saveError" class="setting-error" role="alert">{{ saveError }}</p>
    <p v-if="!hydrated && !saveError" role="status">{{ isEnglish ? 'Loading…' : '加载中…' }}</p>
    <section v-for="(preset, id) in drafts" :key="id" class="preset-card">
      <div class="preset-title">
        <h3>{{ isEnglish ? (preset.nameEn || preset.name) : preset.name }}</h3>
        <button v-if="defaults[id]" class="btn btn-sm" type="button" @click="restore(String(id))">{{ isEnglish ? 'Restore built-in text' : '恢复内置文本' }}</button>
      </div>
      <label :for="`prompt-${id}`">{{ isEnglish ? 'System prompt' : '系统提示词' }}</label>
      <textarea :id="`prompt-${id}`" v-model="preset.prompt" class="input" rows="8" spellcheck="false"></textarea>
    </section>
    <div v-if="hydrated" class="preset-save">
      <span role="status">{{ saving ? (isEnglish ? 'Saving…' : '保存中…') : (isEnglish ? 'Edits are saved automatically' : '修改自动保存') }}</span>
      <button class="btn btn-sm" :disabled="saving" type="button" @click="saveNow">{{ isEnglish ? 'Save now / retry' : '立即保存／重试' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import type { PromptPreset } from '../../electron/shared/ipc-contract.cjs'
import { useLocale } from '../composables/useLocale'
import { createSettingsMutation, getPendingSettingsDraft, registerSettingsFlush, trackSettingsSave } from '../composables/usePendingSettings'

const { isEnglish } = useLocale()
const promptHint = computed(() => isEnglish.value
  ? 'Use {{target}} for the target language. Results use plain text; copy, speech and history include the complete result.'
  : '用 {{target}} 表示目标语言。结果使用纯文本，复制、朗读和历史均包含完整结果。')
const drafts = reactive<Record<string, PromptPreset>>({})
const defaults = ref<Record<string, PromptPreset>>({})
const hydrated = ref(false)
const saveError = ref('')
const saving = ref(false)
let disposed = false
let timer: number | undefined
let version = 0
const mutation = createSettingsMutation('prompt-presets', async (value: Record<string, PromptPreset>) => {
  const savingVersion = version
  saving.value = true
  try {
    if (!window.api) throw new Error()
    await trackSettingsSave(window.api.saveConfig({ promptPresets: value }))
    if (version === savingVersion) saveError.value = ''
    return true
  } catch {
    saveError.value = isEnglish.value ? 'Unable to save prompts. Your edits are retained; translations still use the last saved text.' : '提示词保存失败，修改已保留；翻译仍使用上次已保存的文本。'
    return false
  } finally { saving.value = false }
})

onMounted(async () => {
  try {
    if (!window.api) throw new Error()
    const [cfg, builtin] = await Promise.all([window.api.loadConfig(), window.api.listPromptDefaults()])
    if (disposed) return
    const retained = getPendingSettingsDraft<Record<string, PromptPreset>>('prompt-presets')
    Object.assign(drafts, cfg.promptPresets, retained ? JSON.parse(JSON.stringify(retained)) : {})
    defaults.value = builtin
    await nextTick()
    if (!disposed) {
      if (retained) {
        mutation.update(JSON.parse(JSON.stringify(drafts)))
        saveError.value = isEnglish.value ? 'Unsaved prompt edits were restored. Save or retry to apply them.' : '已恢复未保存的提示词修改，请保存或重试。'
      }
      hydrated.value = true
    }
  } catch {
    saveError.value = isEnglish.value ? 'Unable to load prompt presets' : '无法读取提示词预设'
  }
})

watch(drafts, () => {
  if (!hydrated.value || disposed) return
  ++version
  mutation.update(JSON.parse(JSON.stringify(drafts)))
  clearTimeout(timer)
  timer = window.setTimeout(() => { timer = undefined; void mutation.save() }, 800)
})

function restore(id: string) {
  if (defaults.value[id]) drafts[id].prompt = defaults.value[id].prompt
}
async function saveNow() {
  await nextTick()
  clearTimeout(timer)
  await mutation.save()
}
const unregisterFlush = registerSettingsFlush(() => { clearTimeout(timer); timer = undefined })
onUnmounted(() => {
  disposed = true
  clearTimeout(timer)
  unregisterFlush()
  void mutation.save()
  mutation.release()
})
</script>

<style scoped>
.setting-error { color: var(--danger); font-size: var(--fs-sm); margin-bottom: var(--space-4); }
.prompt-hint { color: var(--text-dim); font-size: var(--fs-sm); margin-bottom: var(--space-4); }
.preset-card { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-4); }
.preset-title { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); justify-content: space-between; margin-bottom: var(--space-3); }
.preset-title h3 { font-size: var(--fs-base); margin: 0; }
.preset-card label { display: block; margin-bottom: var(--space-2); color: var(--text-dim); font-size: var(--fs-sm); }
.preset-card textarea { width: 100%; resize: vertical; line-height: 1.6; }
.preset-save { display: flex; align-items: center; gap: var(--space-3); color: var(--text-dim); font-size: var(--fs-sm); }
</style>
