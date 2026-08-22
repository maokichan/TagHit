/**
 * 路径工具 —— 纯函数，供 workspace/item 等域共用（消除 DAO 间交叉依赖）。
 */

/** 规范化路径（Windows 大小写不敏感 + 统一分隔符 + 去尾部斜杠） */
export function normPath(p: string): string {
  const lower = process.platform === 'win32' ? p.toLowerCase() : p
  return lower.replace(/\//g, '\\').replace(/[\\]+$/, '')
}

/** sourceUri 是否位于某扫描路径下（含路径自身） */
export function isUnderPath(sourceUri: string, root: string): boolean {
  const s = normPath(sourceUri)
  const r = normPath(root)
  return s === r || s.startsWith(r + '\\')
}
