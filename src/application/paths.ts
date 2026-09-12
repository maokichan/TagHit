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

/** 拼接子路径（目录 + 名称）；目录带尾分隔符亦可。 */
export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`
}

/** 路径段匹配：path == root 或紧随分隔符（防同前缀兄弟目录越权，与字节闸门 D15 同规则）。 */
export function isUnderRoot(roots: string[], path: string): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root}/`))
}
