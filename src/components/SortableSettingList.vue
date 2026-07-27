<template>
  <div class="sortable-settings">
    <div class="sort-toolbar">
      <template v-if="sorting">
        <button class="btn btn-sm btn-ghost" type="button" @click="resetOrder">
          {{ labels.reset }}
        </button>
        <button class="btn btn-sm" type="button" @click="sorting = false">
          {{ labels.done }}
        </button>
      </template>
      <button v-else class="btn btn-sm btn-ghost" type="button" @click="sorting = true">
        <ListRestart :size="13" :stroke-width="1.75" />
        {{ labels.reorder }}
      </button>
    </div>

    <div class="sortable-list" :class="{ 'is-sorting': sorting }">
      <div
        v-for="(item, index) in orderedItems"
        :key="item[itemKey]"
        class="sortable-item"
        :class="{ dragging: draggingId === item[itemKey] }"
        @dragover.prevent="moveDraggedTo(index)"
        @drop.prevent="finishDrag"
      >
        <button
          v-if="sorting"
          class="sort-handle"
          type="button"
          draggable="true"
          :title="labels.handle"
          :aria-label="`${labels.handle}: ${itemLabel(item)}`"
          @dragstart="startDrag(item[itemKey], $event)"
          @dragend="finishDrag"
          @keydown.alt.up.prevent="moveBy(item[itemKey], -1)"
          @keydown.alt.down.prevent="moveBy(item[itemKey], 1)"
        >
          <GripVertical :size="15" :stroke-width="1.75" />
        </button>
        <div class="sortable-content">
          <slot :item="item" :sorting="sorting" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { GripVertical, ListRestart } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale'

const props = defineProps({
  items: { type: Array, required: true },
  modelValue: { type: Array, default: () => [] },
  itemKey: { type: String, default: 'id' },
  labelKey: { type: String, default: 'name' }
})

const emit = defineEmits(['update:modelValue', 'reorder'])
const { isEnglish } = useLocale()
const sorting = ref(false)
const draggingId = ref(null)

const labels = computed(() => isEnglish.value ? {
  reorder: 'Reorder',
  reset: 'Reset order',
  done: 'Done',
  handle: 'Move setting'
} : {
  reorder: '调整顺序',
  reset: '恢复默认顺序',
  done: '完成',
  handle: '移动设置项'
})

const defaultIds = computed(() => props.items.map(item => item[props.itemKey]))
const normalizedIds = computed(() => {
  const available = new Set(defaultIds.value)
  const saved = props.modelValue.filter(id => available.has(id))
  const missing = defaultIds.value.filter(id => !saved.includes(id))
  return [...saved, ...missing]
})
const orderedItems = computed(() => {
  const byId = new Map(props.items.map(item => [item[props.itemKey], item]))
  return normalizedIds.value.map(id => byId.get(id)).filter(Boolean)
})

function itemLabel(item) {
  return item[props.labelKey] || item[props.itemKey]
}

function updateOrder(next, persist = true) {
  emit('update:modelValue', next)
  if (persist) emit('reorder', next)
}

function startDrag(id, event) {
  draggingId.value = id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(id))
}

function moveDraggedTo(targetIndex) {
  if (draggingId.value === null) return
  const order = [...normalizedIds.value]
  const fromIndex = order.indexOf(draggingId.value)
  if (fromIndex < 0 || fromIndex === targetIndex) return
  const [moved] = order.splice(fromIndex, 1)
  order.splice(targetIndex, 0, moved)
  updateOrder(order, false)
}

function moveBy(id, offset) {
  const order = [...normalizedIds.value]
  const fromIndex = order.indexOf(id)
  const targetIndex = Math.max(0, Math.min(order.length - 1, fromIndex + offset))
  if (fromIndex < 0 || fromIndex === targetIndex) return
  const [moved] = order.splice(fromIndex, 1)
  order.splice(targetIndex, 0, moved)
  updateOrder(order)
}

function finishDrag() {
  if (draggingId.value !== null) {
    emit('reorder', [...normalizedIds.value])
  }
  draggingId.value = null
}

function resetOrder() {
  updateOrder([...defaultIds.value])
}
</script>

<style scoped>
.sortable-settings {
  position: relative;
}

.sort-toolbar {
  position: absolute;
  right: 0;
  top: -38px;
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  z-index: 1;
}

.sortable-item {
  display: flex;
  align-items: stretch;
  min-width: 0;
  transition: opacity var(--transition), background var(--transition);
}

.sortable-item.dragging {
  opacity: 0.42;
}

.sort-handle {
  width: 32px;
  flex: 0 0 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-dim);
  cursor: grab;
}

.sort-handle:active {
  cursor: grabbing;
}

.sort-handle:hover,
.sort-handle:focus-visible {
  color: var(--text);
  background: var(--bg-hover);
  outline: none;
}

.sortable-content {
  flex: 1;
  min-width: 0;
}

.is-sorting .sortable-content {
  pointer-events: none;
  user-select: none;
}

.sortable-item :deep(.setting-row),
.sortable-item :deep(.sc-row) {
  border-top: 0;
}

.sortable-item:first-child :deep(.setting-row),
.sortable-item:first-child :deep(.sc-row) {
  border-top: 1px solid var(--border);
}

.is-sorting .sortable-item:hover {
  background: var(--bg-subtle);
}

@media (max-width: 760px) {
  .sort-toolbar {
    position: static;
    min-height: 28px;
    margin: calc(-1 * var(--space-2)) 0 var(--space-2);
  }
}
</style>
