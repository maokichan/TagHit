/**
 * 视图记忆：滚动位置 + 分页深度（已加载条目数）——「从详情页回来不丢浏览进度」。
 *
 * 为什么连深度一起记：条目 store 是全局单例"当前视图"，任何其他视图的整页 load
 * （切到另一个工作区标签页再回来、或经过别的取数面）都会覆盖已加载的深度——
 * 只记位置时，返回后容器只有一页高，还原的 scrollTop 被钳回去，深度与位置双丢。
 * 深度按"已加载条目数"记，由调用方换算回页数（页大小是 store 的事，这里不懂）。
 *
 * 放 lib 不放 store：纯键值小记忆，无订阅面、无副作用；键由调用方负责
 * （工作区标签用 `workspaceId|视图签名`——条件变了不还原旧进度），这里不懂工作区语义。
 * 容量封顶（LRU 近似：超容量淘汰最早写入的键），签名频繁变化的极端使用也不会无界增长。
 */

const CAP = 100
const mem = new Map<string, { top: number; depth: number }>()

export function rememberView(key: string, top: number, depth: number): void {
  if (mem.size >= CAP) {
    const oldest = mem.keys().next().value
    if (oldest != null) mem.delete(oldest)
  }
  mem.set(key, { top, depth })
}

export function recallView(key: string): { top: number; depth: number } | null {
  return mem.get(key) ?? null
}
