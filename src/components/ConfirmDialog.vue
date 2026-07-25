<template>
  <Teleport to="body">
    <transition name="confirm">
      <div v-if="open" class="confirm-overlay" @click.self="onCancel">
        <div class="confirm-card pop-in">
          <div class="confirm-icon" v-if="icon">
            <AlertTriangle :size="22" :stroke-width="1.75" />
          </div>
          <div class="confirm-body">
            <div class="confirm-title">{{ title }}</div>
            <div class="confirm-msg">{{ message }}</div>
          </div>
          <div class="confirm-actions">
            <button class="btn btn-sm" @click="onCancel">取消</button>
            <button class="btn btn-sm btn-danger" @click="onConfirm">确定</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { AlertTriangle } from 'lucide-vue-next'

defineProps({
  open: Boolean,
  title: { type: String, default: '确认' },
  message: { type: String, default: '' },
  icon: { type: Boolean, default: true }
})

const emit = defineEmits(['confirm', 'cancel'])

function onConfirm() { emit('confirm') }
function onCancel() { emit('cancel') }
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.confirm-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(0,0,0,0.15);
  padding: var(--space-5);
  min-width: 280px;
  max-width: 360px;
}
.confirm-icon {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-3);
  color: var(--warning);
}
.confirm-body {
  text-align: center;
  margin-bottom: var(--space-5);
}
.confirm-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-strong);
  margin-bottom: var(--space-2);
}
.confirm-msg {
  font-size: var(--fs-sm);
  color: var(--text-dim);
  line-height: 1.5;
}
.confirm-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
}
.confirm-actions .btn {
  min-width: 72px;
  justify-content: center;
}
.btn-danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.btn-danger:hover {
  opacity: 0.9;
}

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.15s ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
</style>
