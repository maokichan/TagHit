/**
 * 文件系统端口。
 * 应用层的收录扫描（路径遍历 + 条目级扫描，规划中）经此访问宿主文件系统；
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
}
