/**
 * 渲染层 dev server 配置（真机接线用）：只起 vite，不进 electron-vite。
 * 宿主由根目录 build/main.cjs 承担，经 TAGHIT_RENDERER_URL 连到这里（缺省 5173）。
 */
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = dirname(fileURLToPath(import.meta.url))
// 应用版本唯一归口 = 仓库根 package.json（frontend 双身份收敛前的诚实读法）
const rootVersion = (JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as { version: string }).version

export default defineConfig({
  root: resolve(here, 'src/renderer'),
  // 相对资源路径：打包态 loadFile（file://）要求 base './'；dev server 不受影响
  base: './',
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(rootVersion),
  },
  resolve: {
    alias: {
      '@renderer': resolve(here, 'src/renderer/src'),
      '@shared': resolve(here, 'src/shared'),
      // 三方插件目录（仓库根 plugins/，在 frontend 之外）：dev 装载与构建产物都需要它能解析
      '@plugins': resolve(here, '../plugins'),
      // 插件目录向上找不到 frontend/node_modules（仓库根 node_modules 只有 ABI 依赖）——
      // 把 vue 钉到壳的同一份运行时（插件与壳共享一个 Vue 实例，SFC 编译产物才能落地）
      'vue': resolve(here, 'node_modules/vue'),
    },
  },
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // fs.strict 默认只放行 frontend/——插件源码在仓库根 plugins/，不显式放行 dev server 会 403
    fs: { allow: [resolve(here, 'src/renderer'), resolve(here, 'src/shared'), resolve(here, '../plugins')] },
  },
})
