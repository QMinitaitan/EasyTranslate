<template>
  <div v-if="isPopupRoute" class="popup-only">
    <router-view />
  </div>
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="logo drag">
        <span class="logo-text">设置</span>
      </div>
      <nav class="nav no-drag">
        <router-link class="nav-item" to="/" exact-active-class="active">
          历史
        </router-link>
        <router-link class="nav-item" to="/settings/general" active-class="active">
          通用
        </router-link>
        <router-link class="nav-item" to="/settings/api" active-class="active">
          翻译接口
        </router-link>
        <router-link class="nav-item" to="/settings/shortcut" active-class="active">
          快捷键
        </router-link>
        <router-link class="nav-item" to="/settings/about" active-class="active">
          关于
        </router-link>
      </nav>
      <div class="sidebar-footer no-drag">
        <div class="theme-switch">
          <button
            class="seg-btn"
            :class="{ active: mode === 'system' }"
            @click="setMode('system')"
            title="跟随系统"
          >
            <Monitor :size="13" :stroke-width="1.75" />
          </button>
          <button
            class="seg-btn"
            :class="{ active: mode === 'light' }"
            @click="setMode('light')"
            title="浅色"
          >
            <Sun :size="13" :stroke-width="1.75" />
          </button>
          <button
            class="seg-btn"
            :class="{ active: mode === 'dark' }"
            @click="setMode('dark')"
            title="深色"
          >
            <Moon :size="13" :stroke-width="1.75" />
          </button>
        </div>
        <span class="ver">v0.0.1</span>
      </div>
    </aside>
    <main class="content">
      <router-view />
    </main>
    <CommandPalette v-model:open="paletteOpen" />
  </div>
</template>

<script setup>
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import { useTheme } from './composables/useTheme'
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import CommandPalette from './components/CommandPalette.vue'

const { mode, setMode } = useTheme()
const paletteOpen = ref(false)
const route = useRoute()
const isPopupRoute = computed(() => route.path.startsWith('/popup') && route.query.window === 'popup')
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  height: 100vh;
}
.popup-only {
  height: 100vh;
  overflow: hidden;
}
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  padding: var(--space-4) var(--space-3);
  user-select: none;
}
.logo {
  display: flex; align-items: center;
  padding: 32px var(--space-3) var(--space-5);
  font-weight: 600; font-size: var(--fs-md);
  color: var(--text-strong);
}
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-section {
  margin: var(--space-5) var(--space-3) var(--space-2);
  font-size: var(--fs-xs);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.nav-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--fs-base);
  color: var(--text);
  text-decoration: none;
  transition: background var(--transition), color var(--transition);
}
.nav-item:hover { background: var(--bg-hover); }
.nav-item.active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 600;
}
.sidebar-footer {
  margin-top: auto;
  padding: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.theme-switch {
  display: flex;
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  padding: 2px;
  gap: 1px;
}
.seg-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 22px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  transition: all var(--transition);
}
.seg-btn:hover { color: var(--text); }
.seg-btn.active {
  background: var(--bg-card);
  color: var(--brand);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.ver { font-size: var(--fs-xs); color: var(--text-dim); margin-left: auto; }
.content {
  overflow: auto;
  background: var(--bg-main);
}
</style>
