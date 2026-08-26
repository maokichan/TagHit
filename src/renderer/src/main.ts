import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useUiStore } from './stores/ui'
import { registerBuiltinFeatures, setupFeatureBehaviors } from './features/registry'
import './styles/globals.css'

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.mount('#app')

  // 注册官方功能组件（宿主按声明渲染；插件贡献点未来走同一条路）
  registerBuiltinFeatures()
  // 执行功能组件的行为钩子（键鼠交互快捷键等）
  setupFeatureBehaviors()

  // 初始化主题（读 config.json，异步但不阻塞渲染）
  const ui = useUiStore(pinia)
  await ui.init()
}

void bootstrap()
