/**
 * Electron 宿主最小声明（零依赖类型检查用；真实安装 electron 后可删）。
 * 仅覆盖宿主骨架用到的 API，未覆盖者按需补充。
 */

declare module 'electron' {
  export interface BrowserWindowConstructorOptions {
    width?: number
    height?: number
    webPreferences?: {
      preload?: string
      contextIsolation?: boolean
      nodeIntegration?: boolean
    }
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions)
    loadURL(url: string): Promise<void>
    loadFile(filePath: string): Promise<void>
  }

  export const app: {
    whenReady(): Promise<void>
    quit(): void
    on(event: 'window-all-closed' | 'activate', listener: () => void): void
    getAppPath(): string
    getPath(name: string): string
  }

  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, ...args: any[]) => any): void
  }

  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void
  }

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
  }
}

declare const process: {
  env: Record<string, string | undefined>
  platform: string
}

declare interface Window {
  taghit: import('./ipc.ts').TaghitRendererApi
}
