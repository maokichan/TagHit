/// <reference types="vite/client" />
import type { TaghitRendererApi } from '@shared/contract'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare global {
  interface Window {
    /** 0.2 typed 窄桥：由根 src/host/preload.ts 注入。 */
    taghit: TaghitRendererApi | undefined
  }
  /** 应用版本：构建时由 vite.renderer.config 从仓库根 package.json 注入（版本唯一归口在根）。 */
  interface ImportMetaEnv {
    readonly APP_VERSION: string
  }
}
