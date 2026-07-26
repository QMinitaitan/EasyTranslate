<template>
  <div class="engine-select" ref="root">
    <button class="es-trigger" :style="{ color: currentColor }" @click="open = !open">
      <span v-if="!isRace" class="dot" :style="{ background: currentColor }"></span>
      <Zap v-else :size="12" :stroke-width="2.4" />
      <span class="label">{{ isRace ? 'Race' : current?.name }}</span>
      <ChevronDown :size="12" :stroke-width="2" class="caret" :class="{ flip: open }" />
    </button>

    <transition name="pop">
      <div v-if="open" class="es-panel">
        <button
          v-for="e in engines"
          :key="e.name"
          class="es-item"
          :class="{ active: !isRace && current?.name === e.name }"
          @click="pickEngine(e)"
        >
          <span class="dot" :style="{ background: e.color }"></span>
          <span class="name">{{ e.name }}</span>
          <Check v-if="!isRace && current?.name === e.name" :size="12" :stroke-width="2.4" class="tick" />
        </button>

        <div class="es-sep"></div>

        <button
          class="es-item"
          :class="{ active: isRace }"
          @click="pickRace"
        >
          <Zap :size="12" :stroke-width="2.4" />
          <span class="name">Race</span>
          <span class="race-hint">Run all engines</span>
          <Check v-if="isRace" :size="12" :stroke-width="2.4" class="tick" />
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Zap, Check } from 'lucide-vue-next'

const props = defineProps({
  engines: { type: Array, required: true },
  modelValue: { type: String, required: true },
  raceMode: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'update:raceMode', 'change'])

const open = ref(false)
const root = ref(null)

const current = computed(() => props.engines.find(e => e.name === props.modelValue))
const isRace = computed(() => props.raceMode)
const currentColor = computed(() => isRace.value ? '#7c3aed' : (current.value?.color || 'var(--brand)'))

function pickEngine(e) {
  emit('update:raceMode', false)
  emit('update:modelValue', e.name)
  emit('change', e)
  open.value = false
}
function pickRace() {
  emit('update:raceMode', true)
  emit('change', { race: true })
  open.value = false
}

function onClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.engine-select { position: relative; }
.es-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px var(--space-2);
  border: none; background: transparent;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm); font-weight: 600;
  color: var(--brand);
  cursor: pointer;
  transition: background var(--transition);
}
.es-trigger:hover { background: var(--bg-hover); }
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  flex-shrink: 0;
}
.caret { opacity: 0.6; transition: transform 0.15s; }
.caret.flip { transform: rotate(180deg); }

.es-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popup);
  padding: var(--space-1);
  z-index: 20;
}
.es-item {
  display: flex; align-items: center; gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none; background: transparent;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition);
}
.es-item:hover { background: var(--bg-hover); }
.es-item.active {
  background: var(--brand-soft);
  color: var(--brand);
}
.es-item .name { flex: 1; }
.es-item .tick { color: var(--brand); }

.es-sep {
  height: 1px;
  background: var(--border);
  margin: var(--space-1) 0;
}

.race-hint {
  font-size: 10px;
  color: var(--text-dim);
  margin-left: var(--space-1);
}

.pop-enter-active, .pop-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}
.pop-enter-from, .pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
