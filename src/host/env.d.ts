/**
 * Electron 宿主最小声明（零依赖类型检查用；真实安装 electron 后可删）。
 * 仅覆盖宿主骨架用到的 API，未覆盖者按需补充。
 */

declare module 'electron' {
  export interface BrowserWindowConstructorOptions {
    width?: number
    height?: number
    frame?: boolean
    backgroundColor?: string
    webPreferences?: {
      preload?: string
      contextIsolation?: boolean
      nodeIntegration?: boolean
    }
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions)
    static fromWebContents(webContents: WebContents): BrowserWindow | null
    loadURL(url: string): Promise<void>
    loadFile(filePath: string): Promise<void>
    minimize(): void
    maximize(): void
    unmaximize(): void
    isMaximized(): boolean
    close(): void
    isDestroyed(): boolean
    readonly webContents: {
      on(
        event: 'console-message',
        listener: (event: unknown, level: number, message: string, line: number, sourceId: string) => void
      ): void
      on(event: 'render-process-gone', listener: (event: unknown, details: { reason: string; exitCode: number }) => void): void
      /** 渲染层加载完成（自诊断 load-ok 事实源，D45）。 */
      on(event: 'did-finish-load', listener: (event: unknown) => void): void
      /** 渲染层加载失败：主帧失败 = 界面没加载出来（黑屏的实锤，D45）。 */
      on(
        event: 'did-fail-load',
        listener: (
          event: unknown,
          errorCode: number,
          errorDesc: string,
          validatedURL: string,
          isMainFrame: boolean
        ) => void
      ): void
      /** 窗口打开拦截：应用内不弹新窗口，http(s) 外链交系统浏览器（返回 deny）。 */
      setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void
    }
  }

  export interface WebContents {
    send(channel: string, ...args: unknown[]): void
    /** 原生文件拖动（拖出应用）：由主进程发起，必须在 dragstart 手势内调用（D34）。 */
    startDrag(item: DragItem): void
  }

  /**
   * 拖动的负载（Electron `webContents.startDrag(item)`）。
   * `files` 覆盖 `file`（多文件交付用前者）；`icon` 在 macOS 上必须非空，故类型上必填。
   */
  export interface DragItem {
    file: string
    files?: string[]
    icon: NativeImage | string
  }

  /** 拖动预览图（原生图片）。 */
  export interface NativeImage {
    isEmpty(): boolean
  }

  export const nativeImage: {
    createFromBuffer(buffer: Uint8Array): NativeImage
    createFromPath(path: string): NativeImage
  }

  export const Menu: {
    setApplicationMenu(menu: null): void
  }

  export const shell: {
    trashItem(path: string): Promise<void>
    /** 系统默认程序打开外链（标签主页链接等；仅 http(s)，由调用方把关）。 */
    openExternal(url: string): Promise<void>
  }

  export const dialog: {
    showOpenDialog(
      window: BrowserWindow,
      options: { properties: string[] }
    ): Promise<{ canceled: boolean; filePaths: string[] }>
    /** 原生错误框（无 GUI 会话时宿主自行吞异常）：用于"已在运行"这类必须看见的启动失败。 */
    showErrorBox(title: string, content: string): void
  }

  export const app: {
    whenReady(): Promise<void>
    quit(): void
    /** 立即退出（不经 ready/窗口生命周期）：--diagnose 打印快照后用（D45）。 */
    exit(code?: number): void
    on(event: 'window-all-closed' | 'activate', listener: () => void): void
    /** 宿主子进程（GPU/utility 等）退出：黑屏/渲染异常的宿主侧旁证（D45）。 */
    on(
      event: 'child-process-gone',
      listener: (event: unknown, details: { type: string; reason: string; exitCode: number }) => void
    ): void
    /** 打包态（electron-builder 产物）为 true：渲染层走随包静态产物而非 dev server。 */
    isPackaged: boolean
    getAppPath(): string
    getPath(name: string): string
    setPath(name: string, path: string): void
    requestSingleInstanceLock(): boolean
  }

  export const ipcMain: {
    handle(channel: string, listener: (event: { sender: WebContents }, ...args: any[]) => any): void
    /** 单向端点（无回程）：仅"手势内必须同步发起"的宿主动作用（见 ipc.ts 的 IpcSendContracts）。 */
    on(channel: string, listener: (event: { sender: WebContents }, input: any) => void): void
  }

  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void
  }

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    send(channel: string, ...args: unknown[]): void
  }

  export const net: {
    fetch(url: string): Promise<Response>
  }

  export const protocol: {
    registerSchemesAsPrivileged(schemes: {
      scheme: string
      privileges: { secure?: boolean; supportFetchAPI?: boolean; stream?: boolean; corsEnabled?: boolean }
    }[]): void
    handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void
  }
}

declare const process: {
  env: Record<string, string | undefined>
  platform: string
  argv: string[]
  versions: { electron?: string }
  exit(code?: number): never
}

declare interface Window {
  taghit: import('./ipc.ts').TaghitRendererApi
}
