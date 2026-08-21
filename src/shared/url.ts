/**
 * 本地文件协议 —— 渲染进程经此 URL 安全加载本地媒体（替代 file://，受 CSP 与路径白名单约束）。
 */
export const TAGHIT_FILE_SCHEME = 'taghit-file'

/** 绝对路径 → taghit-file:/// 协议 URL */
export function taghitFileUrl(absPath: string): string {
  const segments = absPath
    .split(/[\\/]/)
    .filter(Boolean)
    .map(encodeURIComponent)
  return `${TAGHIT_FILE_SCHEME}:///${segments.join('/')}`
}
