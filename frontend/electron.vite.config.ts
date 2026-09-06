import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // main / preload 不再由此构建：宿主在仓库根 src/host（Electron 主进程装配点）。
  // 本配置仅服务渲染层 dev server / 构建产物。
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [vue()]
  }
})
