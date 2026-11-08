import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useUiStore } from './stores/ui'
import { registerBuiltinFeatures, setupFeatureBehaviors } from './features/registry'
import { registerBuiltinDetailPreviews } from './features/preview/builtinPreviews'
import { reloadPlugins } from './features/contributedPlugins'
import { registerBuiltinDetailViews } from './features/detailWorkbench/views'
import { registerBuiltinCommands } from './features/officialCommands'
import './styles/globals.css'

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  // 界面文案 i18n（D50）：先于功能组件注册——组件 setup 可能用 $t
  app.use(i18n)
  // 官方功能组件先注册再挂载：App.vue 的活动栏在 setup 时读取注册表
  registerBuiltinFeatures()
  // 官方命令（右键菜单/未来命令面板的贡献者）与功能组件同表机制
  registerBuiltinCommands()
  // 内置详情页预览提供方（detailPreview 槽的默认提供者，D37）
  registerBuiltinDetailPreviews()
  // 三方插件装载（D48：宿主清单端点驱动，zip 安装与 dev 源码同一条管线）：必须在内置
  // 预览**之后**——后注册覆盖先注册，插件对同类条目的认领替换内置默认（D37 ②）
  void reloadPlugins()
  // 内置详情页工作台视图（detailView 面的出厂分配：中心/右/底，D39）
  registerBuiltinDetailViews()
  app.mount('#app')

  // 执行功能组件的行为钩子（键鼠交互快捷键等）
  setupFeatureBehaviors()

  // 初始化主题（读 config.json，异步但不阻塞渲染）
  const ui = useUiStore(pinia)
  await ui.init()
}

void bootstrap()
