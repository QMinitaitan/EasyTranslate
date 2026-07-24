<template>
  <div class="page">
    <h2 class="page-title">关于</h2>
    <p class="page-sub">版本与许可信息</p>

    <div class="setting-section">
      <div class="setting-row">
        <div class="setting-row-info">
          <div class="setting-row-icon">
            <span class="prov-dot" style="background: linear-gradient(135deg, var(--brand), #38bdf8); width: 10px; height: 10px; border-radius: 3px;"></span>
          </div>
          <div class="setting-row-text">
            <div class="setting-row-title">Translate</div>
            <div class="setting-row-desc">v0.0.1 (dev) · Electron 31 · Vue 3.4 · Vite 5.4 · {{ platform }}</div>
          </div>
        </div>
        <div class="setting-row-control">
          <a class="btn btn-sm" href="#">项目主页</a>
          <a class="btn btn-sm" href="#">检查更新</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const platform = typeof window !== 'undefined' && window.api ? window.api.platform : navigator.platform
</script>