/**
 * 路径规则（领域层纯函数，无 IO）。
 *
 * 为什么在领域层：路径是**跨层共用的规则**——应用层用它做目录归属与来源根闸门，
 * 存储适配器用它把「可见性派生」翻译成查询条件（memory 直接调用；sqlite 用等价的
 * SQL 表达式，见 adapters/sqlite/store.ts 的 PARENT_DIR_EXPR）。两份独立实现必然漂移，
 * 故规则只写一次，SQL 译文由校准（scripts/s35）与纯函数逐一致比对。
 *
 * 路径约定：归一化绝对路径、正斜杠分隔（由 FS 适配器/用例边界保证）。
 * 条目-路径节点归属即以 sourceUri 父目录 == 节点 dirPath 派生（DECISIONS D18）。
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

/**
 * 目录范围判定：path 等于 dir，或紧随分隔符之下。
 * **路径段匹配**（非文本前缀）——防同前缀兄弟目录越权/误命中（D15 字节闸门同规则）。
 */
export function isUnderDir(dir: string, path: string): boolean {
  return path === dir || path.startsWith(`${dir}/`)
}

/** 任一根之下的路径段匹配（来源根闸门：字节闸门 D15、文件操作 D18 共用）。 */
export function isUnderRoot(roots: string[], path: string): boolean {
  return roots.some((root) => isUnderDir(root, path))
}

/**
 * 归一化：反斜杠 → 正斜杠、去尾部分隔符（保留 'X:/' 盘根）、**词汇解析 `.`/`..` 段**。
 * 域约定"路径为归一化绝对路径"的执行点：一切**外部进入**的路径（用户输入、
 * 原生选择器返回）必须先过这里。`..` 解析是安全项：来源根闸门按路径段匹配，
 * 不解析相对段则 `D:/库/../其他` 可穿透闸门。
 * 盘符/绝对路径越出根的 `..` 钳到根（Windows 语义）；相对路径顶部的 `..` 保留。
 */
export function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  const trimmed = slashed.length > 3 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
  // 无相对段则原样返回（绝大多数输入走这条快路）
  if (!/(?:^|\/)\.{1,2}(?:\/|$)/.test(trimmed)) return trimmed
  const drive = /^[A-Za-z]:/.exec(trimmed)?.[0] ?? null
  const body = drive != null ? trimmed.slice(drive.length) : trimmed
  const absolute = body.startsWith('/')
  const segs: string[] = []
  for (const seg of body.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (segs.length > 0 && segs[segs.length - 1] !== '..') segs.pop()
      else if (drive == null && !absolute) segs.push('..')
    } else {
      segs.push(seg)
    }
  }
  if (drive != null) return `${drive}/${segs.join('/')}`
  return (absolute ? '/' : '') + segs.join('/')
}
