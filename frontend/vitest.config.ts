/**
 * 渲染层测试运行器：`npm --prefix frontend run test`（= 这里的 go test 等价物）。
 *
 * 只跑**纯逻辑/边界行为**断言（标签↔路由、顺序上下文、窄桥包装与入参纯化）：
 * 这些不需要 DOM，也不需要 Electron——所以它们能在提交前几秒内跑完。
 * 组件渲染、DOM 交互与 GUI 冒烟不在这里（见 TODO 的测试三件套：happy-dom 与 Playwright 押后）。
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(here, 'src/renderer/src'),
      '@shared': resolve(here, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/renderer/src/**/*.test.ts', 'src/shared/**/*.test.ts'],
  },
})
