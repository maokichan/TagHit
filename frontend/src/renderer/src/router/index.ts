import { createRouter, createWebHashHistory } from 'vue-router'
import StartScreen from '../views/StartScreen.vue'
import WorkspaceTab from '../views/WorkspaceTab.vue'
import Settings from '../views/Settings.vue'
import ItemDetail from '../views/ItemDetail.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 开始界面：选择/新建工作区 + 全局搜索（唯一创建入口）
    { path: '/', name: 'start', component: StartScreen },
    // 工作区标签页：仅当对应标签打开时可达（App.vue 守卫）
    { path: '/workspace/:id', name: 'workspace', component: WorkspaceTab, props: true },
    // 设置（全屏）：全局控制，含工作区管理与统一标签管理
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/item/:id', name: 'item', component: ItemDetail, props: true }
  ]
})

export default router
