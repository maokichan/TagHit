/**
 * 文件系统端口。
 * 应用层的收录扫描经此访问宿主文件系统（见 src/application/scan.ts）；
 * 领域层不依赖本文件，应用层也不直接接触宿主 fs API。
 * 路径一律宿主绝对路径、正斜杠归一（由适配器保证）。
 */

/** 遍历产出的条目。 */
export interface FsEntry {
  path: string
  kind: 'file' | 'dir'
}

/** 元数据查询结果；不存在时 exists=false，其余字段缺省。 */
export interface FsStat {
  exists: boolean
  kind?: 'file' | 'dir'
  /** 字节数（文件）；目录或不存在时缺省。 */
  size?: number
  /** 文件修改时间，ISO-8601（供条目 fileModifiedAt 用）。 */
  modifiedAt?: string
}

export interface FileSystem {
  /**
   * 递归遍历 root 之下全部条目（不含 root 自身）。顺序不承诺稳定。
   * root 不存在或不可读 → reject。
   */
  walk(root: string): AsyncIterable<FsEntry>

  /** 单路径元数据；路径不存在 → { exists: false }，不抛错。 */
  stat(path: string): Promise<FsStat>

  /**
   * 读文件开头至多 maxBytes 字节（类型嗅探/内容抽样用；不承诺全文读取）。
   * 路径不存在或不是文件 → reject。
   */
  readHead(path: string, maxBytes: number): Promise<Uint8Array>

  /**
   * 内容签名（hex）。同内容必同签名（sha256）；真实文件系统实现用
   * 头部/中部/尾部三采样点抽样（媒体同格式头部常相同，中尾才有区分度）。
   * 签名供扫描变更判定与内容去重用，不承诺对整文件全局唯一。
   * 路径不存在或不可读 → reject。
   */
  hash(path: string): Promise<string>

  /**
   * 改名/移动（同文件系统内原子操作；目录亦可）。真实实现要求 to 不存在；
   * from 不存在、to 已存在、目录移入自身子树 → reject。
   */
  rename(from: string, to: string): Promise<void>
}

/** 移除能力（真实实现尽力进系统回收站；不可恢复性由实现决定）。 */
export interface Trash {
  /** 路径不存在 → reject。 */
  trash(path: string): Promise<void>
}
