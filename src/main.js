import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles/global.css'

import Home from './views/Home.vue'
import Popup from './views/Popup.vue'
import SettingsGeneral from './views/SettingsGeneral.vue'
import SettingsShortcut from './views/SettingsShortcut.vue'
import SettingsApi from './views/SettingsApi.vue'
import SettingsAbout from './views/SettingsAbout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/popup', name: 'popup', component: Popup },
    { path: '/settings/general', name: 'settings-general', component: SettingsGeneral },
    { path: '/settings/shortcut', name: 'settings-shortcut', component: SettingsShortcut },
    { path: '/settings/api', name: 'settings-api', component: SettingsApi },
    { path: '/settings/about', name: 'settings-about', component: SettingsAbout }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')
