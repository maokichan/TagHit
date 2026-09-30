/**
 * 文件系统端口。
 * 应用层的收录扫描经此访问宿主文件系统（见 src/application/scan.ts）；
 * 领域层不依赖本文件，应用层也不直接接触宿主 fs API。
 * 路径一律宿主绝对路径、正斜杠归一（由适配器保证）。
 */

/** 遍历产出的条目。 */
export interface FsEntry {
  path: string
  /**
   * `file`/`dir` = 正常条目；`error` = **该路径本身不可读**（权限/IO/不存在）——
   * 遍历跳过其子树并继续，由调用方计入摘要：**单点故障不得使整次扫描失败**
   * （否则一个拒绝访问的子目录会让整次扫描回滚，用户看到"什么都没扫到"）。
   */
  kind: 'file' | 'dir' | 'error'
  /** kind='error' 时的原因（日志与摘要用）。 */
  message?: string
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
   * root 不存在或不可读、或某个子目录不可读 → **产出 kind='error' 条目**（跳过该子树），
   * 不 reject：调用方据此统计并把不可读子树排除在"消失判定"之外（防误删/误标 missing）。
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
   *
   * 签名有三处用途：扫描变更判定、**移动认领键**（D18：新路径与 missing 条目同签名、
   * 且旧路径确已消失 → 原条目改写来源，标签随行）、派生元数据共享键（D16 缩略图按内容共享一份）。
   * **不承诺对整文件全局唯一**：头/中/尾三段各 64 KiB 全同的两个不同文件会被当作同一内容
   * （认领可能错位、缩略图串用）——这是与"全文件哈希成本"的折中，已知并接受（D18）。
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
