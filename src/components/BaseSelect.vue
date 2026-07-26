<template>
  <div class="base-select" ref="wrapper" @click="toggle">
    <button
      type="button"
      class="base-select-trigger"
      :class="{ placeholder: !modelValue, disabled }"
      :disabled="disabled"
    >
      <span>{{ displayText }}</span>
      <ChevronDown :size="13" :stroke-width="1.75" class="arrow" :class="{ open }" />
    </button>
    <transition name="pop">
      <div v-if="open" class="base-select-dropdown">
        <div
          v-for="(opt, i) in normalizedOptions"
          :key="opt.value"
          class="base-select-option"
          :class="{ selected: opt.value === modelValue }"
          @click.stop="select(opt)"
        >
          <span>{{ opt.label }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale'

const { isEnglish } = useLocale()

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: '请选择' },
  disabled: Boolean
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const wrapper = ref(null)

const normalizedOptions = computed(() =>
  props.options.map(o => typeof o === 'string' || typeof o === 'number'
    ? { label: String(o), value: o }
    : { label: String(o.label ?? o.value ?? ''), value: o.value ?? o.label }
  )
)

const displayText = computed(() => {
  const found = normalizedOptions.value.find(o => o.value === props.modelValue)
  const placeholder = props.placeholder === '请选择' && isEnglish.value ? 'Select' : props.placeholder
  return found ? found.label : placeholder
})

function toggle(e) {
  if (props.disabled) return
  e.stopPropagation()
  open.value = !open.value
  if (open.value) {
    document.addEventListener('click', closeExternal, true)
  }
}

function closeExternal() {
  open.value = false
  document.removeEventListener('click', closeExternal, true)
}

function select(opt) {
  emit('update:modelValue', opt.value)
  open.value = false
}
</script>

<style scoped>
.base-select {
  position: relative;
  display: inline-flex;
  cursor: pointer;
  user-select: none;
}
.base-select-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px 6px 3px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  font-size: var(--fs-sm);
  font-family: inherit;
  color: var(--text-strong);
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
  white-space: nowrap;
  min-height: 26px;
}
.base-select-trigger:hover {
  border-color: var(--text-dim);
}
.base-select-trigger.placeholder {
  color: var(--text-dim);
  font-weight: 400;
}
.base-select-trigger.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.base-select-trigger:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
  outline: none;
}
.arrow {
  color: var(--text-dim);
  transition: transform 0.15s ease;
  flex-shrink: 0;
}
.arrow.open {
  transform: rotate(180deg);
}
.base-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popup);
  padding: var(--space-1);
  z-index: 100;
  overflow: hidden;
}
.base-select-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  color: var(--text);
  cursor: pointer;
  transition: background 0.1s;
  white-space: nowrap;
}
.base-select-option:hover {
  background: var(--bg-hover);
  color: var(--text-strong);
}
.base-select-option.selected {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 500;
}
.pop-enter-active {
  transition: opacity 0.12s ease, transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
}
.pop-leave-active {
  transition: opacity 0.08s ease;
}
.pop-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}
.pop-leave-to {
  opacity: 0;
}
</style>
