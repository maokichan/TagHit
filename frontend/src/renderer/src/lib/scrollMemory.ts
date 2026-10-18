/**
 * 视图滚动位置记忆：离开视图时存、回到视图时还原——「从详情页回来不丢浏览位置」。
 *
 * 放 lib 不放 store：纯键值小记忆，无订阅面、无副作用；键由调用方负责
 * （工作区标签用 `workspaceId|视图签名`——条件变了不还原旧位置），这里不懂工作区语义。
 * 容量封顶（LRU 近似：超容量淘汰最早写入的键），签名频繁变化的极端使用也不会无界增长。
 */

const CAP = 100
const mem = new Map<string, number>()

export function rememberScroll(key: string, top: number): void {
  if (mem.size >= CAP) {
    const oldest = mem.keys().next().value
    if (oldest != null) mem.delete(oldest)
  }
  mem.set(key, top)
}

export function recallScroll(key: string): number | null {
  const v = mem.get(key)
  return v ?? null
}
