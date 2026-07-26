<template>
  <div class="input-key">
    <input
      class="input"
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
      type="button"
      class="input-key-toggle icon-btn"
      @click="visible = !visible"
      :title="visible ? (isEnglish ? 'Hide' : '隐藏') : (isEnglish ? 'Show' : '显示')"
    >
      <Eye v-if="visible" :size="14" :stroke-width="1.75" />
      <EyeOff v-else :size="14" :stroke-width="1.75" />
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale'

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' }
})
defineEmits(['update:modelValue'])

const visible = ref(false)
const { isEnglish } = useLocale()
</script>

<style scoped>
.input-key {
  position: relative;
}
.input-key .input {
  padding-right: 32px;
}
.input-key-toggle {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
}
</style>
