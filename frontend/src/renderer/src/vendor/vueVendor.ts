/**
 * 宿主 vue 共享模块（vendor，D48 插件分发的 vue 同实例机制）：
 * 插件 bundle 构建时把 `import 'vue'` 重写到 `taghit-plugin:///__vendor/vue`，
 * 协议侧 dev 经本文件（vite 编译，与壳同一 vue 实例）、打包态直出 vue-vendor chunk
 * （vite.renderer.config.ts manualChunks 确定性命名）——三方组件与壳共享一个 Vue，
 * 反应式/上下文不分裂（D42④"vue 钉到同一份运行时"的分发版）。
 * 本文件只做转发：插件面用到的 vue 导出全部经此中转，无壳内部实现外泄。
 */
export * from 'vue'
