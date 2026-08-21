import { IPC } from '@shared/ipc'
import type { PluginCallRequest, PluginInfo } from '@shared/types/plugin'
import type { AppContext } from '../services/context'
import { handle } from './util'

export function registerPluginIpc(ctx: AppContext): void {
  handle<undefined, PluginInfo[]>(IPC.plugin.list, () => ctx.pluginHost.list())

  handle<PluginCallRequest, unknown>(IPC.plugin.call, async (args) => ctx.pluginHost.call(args))
}
