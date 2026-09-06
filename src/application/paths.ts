/**
 * 路径小工具（应用层内部，纯字符串；不做 IO）。
 * 路径约定：归一化绝对路径、正斜杠分隔（由 FS 适配器/调用方保证）。
 * 供浏览可见性派生与扫描使用——条目-节点归属即以 sourceUri 父目录 == 节点 dirPath 派生。
 */

/** 父目录：去掉最后一个 '/' 之后的部分；无 '/' 时返回 ''（不在任何目录下）。 */
export function parentDir(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? '' : path.slice(0, idx)
}

/** 末段名（文件名或目录名）。 */
export function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? path : path.slice(idx + 1)
}
