import { IPC } from '@shared/ipc'
import type { AppConfig } from '@shared/types/config'
import type { AppContext } from '../services/context'
import { handle } from './util'

export function registerConfigIpc(ctx: AppContext): void {
  handle<undefined, AppConfig>(IPC.config.get, () => ctx.config.get())

  handle<Partial<AppConfig>, AppConfig>(IPC.config.update, (args) => ctx.config.update(args))
}
