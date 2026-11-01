/**
 * 宿主自诊断快照（D45）：黑屏自诊断与反馈机制的数据面。
 *
 * 纯模块（零 electron 依赖）：快照形状、事件环形缓冲与构造逻辑在此，
 * electron 事实（窗口事件、路径、文件存在性）由 main.ts 采集后注入。
 * 动因见 D45：0.3.0 真机首例故障里，渲染层没加载时宿主是唯一活着的部分——
 * 快照就是给"外部 agent 读文件定位问题"用的唯一事实源。
 *
 * 隐私口径：只含路径与状态，**不含用户内容**（标签/条目数据零进入）。
 * 落盘 = `userData/diagnostics.json`；`TagHit.exe --diagnose` 打印同份快照。
 */

export const DIAGNOSTICS_SCHEMA_VERSION = 1

/** 事件环形缓冲容量：够回溯一次故障序列，不至于无限膨胀。 */
export const DIAGNOSTICS_EVENT_CAPACITY = 50

export interface DiagnosticsEvent {
  /** ISO 时间戳（采集侧时钟）。 */
  at: string
  /** 事件种类（'app-ready' | 'load-ok' | 'load-fail' | 'renderer-gone' …）。 */
  kind: string
  /** 一行细节（错误文案/原因码），只给人与 agent 读。 */
  detail: string
}

export interface DiagnosticsLoadState {
  mode: 'dev' | 'packaged'
  /** 本次加载目标（dev = dev server URL；打包 = renderer-dist/index.html 绝对路径）。 */
  target: string
  ok: boolean
  failCount: number
  lastError: string | null
}

export interface DiagnosticsPaths {
  appPath: string
  /** 宿主产物所在目录（asar 内 = build/）——渲染层路径错位类问题的定位锚。 */
  hostDir: string
  userData: string
  dbPath: string
  rendererTarget: string
  /** 打包态可判（目标文件在不在）；dev 态目标是 URL，无文件可判 → null。 */
  rendererTargetExists: boolean | null
}

export interface DiagnosticsSnapshot {
  schemaVersion: number
  appVersion: string
  electronVersion: string
  platform: string
  isPackaged: boolean
  paths: DiagnosticsPaths
  load: DiagnosticsLoadState
  events: DiagnosticsEvent[]
}

/** 事件环形缓冲：超容量丢最旧（O(1) 追加，无删除标记）。 */
export class DiagnosticsEventLog {
  private entries: DiagnosticsEvent[] = []
  private readonly now: () => string
  private readonly capacity: number

  constructor(now: () => string, capacity: number = DIAGNOSTICS_EVENT_CAPACITY) {
    this.now = now
    this.capacity = capacity
  }

  push(kind: string, detail: string): void {
    this.entries.push({ at: this.now(), kind, detail })
    if (this.entries.length > this.capacity) {
      this.entries = this.entries.slice(this.entries.length - this.capacity)
    }
  }

  /** 只读副本（快照构造用，防快照与后续写入共享数组）。 */
  list(): DiagnosticsEvent[] {
    return [...this.entries]
  }
}

/** 组装快照：事件按容量钳制，其余字段原样落位（采集侧负责事实的真实性）。 */
export function buildSnapshot(input: Omit<DiagnosticsSnapshot, 'schemaVersion'>): DiagnosticsSnapshot {
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    appVersion: input.appVersion,
    electronVersion: input.electronVersion,
    platform: input.platform,
    isPackaged: input.isPackaged,
    paths: input.paths,
    load: input.load,
    events: input.events.slice(Math.max(0, input.events.length - DIAGNOSTICS_EVENT_CAPACITY)),
  }
}

/** `--diagnose` 无快照可读时的静态事实兜底（应用可能从未完成一次窗口创建）。 */
export function staticFacts(input: {
  appVersion: string
  electronVersion: string
  platform: string
  isPackaged: boolean
  userData: string
  dbPath: string
}): DiagnosticsSnapshot {
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    appVersion: input.appVersion,
    electronVersion: input.electronVersion,
    platform: input.platform,
    isPackaged: input.isPackaged,
    paths: {
      appPath: '',
      hostDir: '',
      userData: input.userData,
      dbPath: input.dbPath,
      rendererTarget: '',
      rendererTargetExists: null,
    },
    load: { mode: input.isPackaged ? 'packaged' : 'dev', target: '', ok: false, failCount: 0, lastError: null },
    events: [],
  }
}
