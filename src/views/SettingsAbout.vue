<template>
  <div class="page">
    <h2 class="page-title">{{ isEnglish ? 'About' : '关于' }}</h2>
    <p class="page-sub">{{ isEnglish ? 'Version and license information' : '版本与许可信息' }}</p>

    <div class="setting-section">
      <div class="setting-row about-brand">
        <img class="about-brand-mark" :src="appMarkUrl" alt="" />
        <div class="about-brand-copy">
          <div class="setting-row-title">EasyTranslate</div>
          <div class="setting-row-desc">v0.0.1 (dev)</div>
          <div class="setting-row-desc">Electron {{ platform }} · Vue 3.4 · Vite 5.4</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '../composables/useLocale'
import appMarkUrl from '../../assets/icon-v3/easytranslate-mark.svg'

const { isEnglish } = useLocale()
const platform = typeof window !== 'undefined' && window.api ? window.api.platform : navigator.platform
</script>

<style scoped>
.about-brand {
  justify-content: flex-start;
  gap: var(--space-5);
  padding: var(--space-5);
}

.about-brand-mark {
  width: 56px;
  height: 56px;
  display: block;
  flex: 0 0 auto;
}

.about-brand-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.about-brand-copy .setting-row-title {
  color: var(--text-strong);
  font-size: var(--fs-lg);
  font-weight: 600;
}

.about-brand-copy .setting-row-desc {
  font-size: var(--fs-sm);
}
</style>
