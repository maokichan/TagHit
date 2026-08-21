import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useUiStore } from './stores/ui'
import './styles/globals.css'

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.mount('#app')

  // 初始化主题（读 config.json，异步但不阻塞渲染）
  const ui = useUiStore(pinia)
  await ui.init()
}

void bootstrap()
