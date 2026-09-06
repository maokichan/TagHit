/**
 * 渲染层 dev server 配置（真机接线用）：只起 vite，不进 electron-vite。
 * 宿主由根目录 build/main.cjs 承担，经 TAGHIT_RENDERER_URL 连到这里（缺省 5173）。
 */
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(here, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(here, 'src/renderer/src'),
      '@shared': resolve(here, 'src/shared'),
    },
  },
  plugins: [vue()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
})
