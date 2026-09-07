/**
 * 缩略图 / 媒体尺寸回写（应用层用例）。
 *
 * 抓帧与写盘是主进程能力（渲染层 base64 上传，宿主落盘 {userData}/thumbnails），
 * 本用例只负责把派生元数据**按内容为单位**回写数据库：同一 contentHash 的全部条目
 * 共享同一份缩略图与同一组固有尺寸（contentHash 语义：同内容必同文件）。
 *
 * 输入校验：文件名写入键为 contentHash，防止路径注入（宿主侧也按哈希拼文件名）。
 */

import type { AppServices } from './services.ts'

export interface ThumbnailInput {
  contentHash: string
  previewUri: string
  width?: number | null
  height?: number | null
}

/** 按 contentHash 回写缩略图路径与尺寸；无命中条目 → no-op（幂等，读宽松）。 */
export async function recordThumbnail(svc: AppServices, input: ThumbnailInput): Promise<{ updated: number }> {
  let updated = 0
  await svc.store.transaction(async (tx) => {
    const hits = await tx.queryItems({ contentHash: input.contentHash, kinds: ['file'] })
    for (const { item } of hits) {
      await tx.updateItem(item.id, {
        previewUri: input.previewUri,
        width: input.width ?? null,
        height: input.height ?? null,
      })
      updated++
    }
  })
  return { updated }
}
