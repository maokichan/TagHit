/**
 * 系统端口：时钟与 ID 生成。
 * 由宿主适配器注入应用层用例——创建记录的 id / createdAt 由用例经它们产生（DECISIONS D2）。
 * 本层只声明形状，不含实现；领域层不依赖本文件。
 */

/** 时钟：now() 返回 ISO-8601 UTC 字符串。领域内时间一律为字符串（见 types 的 createdAt / fileModifiedAt）。 */
export interface Clock {
  now(): string
}

/** ID 生成：产生全局唯一字符串（DECISIONS D2：UUIDv4，由适配器实现）。 */
export interface IdGen {
  newId(): string
}
