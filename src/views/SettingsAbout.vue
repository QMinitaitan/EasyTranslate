<template>
  <div class="page">
    <h2 class="page-title">{{ isEnglish ? 'About' : '关于' }}</h2>
    <p class="page-sub">{{ isEnglish ? 'Version and license information' : '版本与许可信息' }}</p>

    <div class="setting-section">
      <div class="setting-row" style="padding: var(--space-4); flex-direction: column; align-items: flex-start; gap: var(--space-1);">
        <div class="setting-row-title" style="font-size: var(--fs-lg); font-weight: 600; color: var(--text-strong);">EasyTranslate</div>
        <div class="setting-row-desc" style="font-size: var(--fs-sm);">v0.0.1 (dev)</div>
        <div class="setting-row-desc" style="font-size: var(--fs-sm);">Electron {{ platform }} · Vue 3.4 · Vite 5.4</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '../composables/useLocale'

const { isEnglish } = useLocale()
const platform = typeof window !== 'undefined' && window.api ? window.api.platform : navigator.platform
</script>
