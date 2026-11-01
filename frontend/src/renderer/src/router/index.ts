import { createRouter, createWebHashHistory } from 'vue-router'
import StartScreen from '../views/StartScreen.vue'
import WorkspaceTab from '../views/WorkspaceTab.vue'
import Settings from '../views/Settings.vue'
import ItemDetail from '../views/ItemDetail.vue'
import TagProfilePage from '../views/TagProfilePage.vue'
import FeatureTabView from '../views/FeatureTabView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 开始界面：选择/新建工作区 + 全局搜索（唯一创建入口）
    { path: '/', name: 'start', component: StartScreen },
    // 工作区标签页：仅当对应标签打开时可达（App.vue 守卫）
    { path: '/workspace/:id', name: 'workspace', component: WorkspaceTab, props: true },
    // 设置（全屏）：全局控制，含工作区管理与统一标签管理
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/item/:id', name: 'item', component: ItemDetail, props: true },
    // 标签主页：tag 的阅读面（词条式；路由是标签的投影，App.vue 守卫同一套）
    { path: '/tag/:id', name: 'tag', component: TagProfilePage, props: true },
    // 功能组件内容标签页（contentTab 贡献点；三方插件自开页同走此机制，D47）：路由是标签的投影
    { path: '/feature/:featureId', name: 'feature', component: FeatureTabView, props: true }
  ]
})

export default router
