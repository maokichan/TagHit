import { ipcMain } from 'electron'

/** 类型安全 IPC 处理器注册（通道名必须来自 @shared/ipc） */
export function handle<TArgs = undefined, TResult = unknown>(
  channel: string,
  handler: (args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, (_event, args: TArgs) => handler(args))
}
