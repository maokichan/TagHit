import { IPC } from '@shared/ipc'
import type { AppContext } from '../services/context'
import { handle } from './util'

/** 缩略图 IPC：渲染进程懒生成的 JPEG（base64）落盘 + 回写 preview_uri */
export function registerThumbnailIpc(ctx: AppContext): void {
  handle<{ contentHash: string; base64: string }, string | null>(
    IPC.thumbnail.save,
    (args) => {
      if (!args.contentHash || !args.base64) return null
      const data = Buffer.from(args.base64, 'base64')
      if (data.length === 0) return null
      const target = ctx.thumbnail.save(args.contentHash, data)
      // 同哈希条目共用同一缩略图；替换原图直出/空 preview_uri
      ctx.db.write
        .prepare(
          'UPDATE item SET preview_uri = ? WHERE content_hash = ? AND preview_uri IS NOT ?'
        )
        .run(target, args.contentHash, target)
      return target
    }
  )
}
