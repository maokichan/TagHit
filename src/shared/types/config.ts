export type Theme = 'dark' | 'light' | 'system'
export type LayoutMode = 'masonry' | 'grid' | 'list'

export interface AppConfig {
  /** ffmpeg/ffprobe 可执行文件（子进程调用，无 GPL 传染） */
  ffmpegPath: string
  thumbnailMaxWidth: number
  thumbnailQuality: number
  scanExcludePatterns: string[]
  /** 扩展名 → 媒体类别（image/video/audio/document） */
  fileFormatMap: Record<string, string>
  /** 标签名 → 描述 */
  tagDescriptions: Record<string, string>
  theme: Theme
  layoutMode: LayoutMode
  /** 网格卡片是否显示标题（可关闭，设置页与显示面板均可切换） */
  showTitles: boolean
  /** 开始界面工作区卡片是否显示封面（自动取工作区内图片或用户指定） */
  showWorkspaceCovers: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  ffmpegPath: 'ffmpeg',
  thumbnailMaxWidth: 320,
  thumbnailQuality: 85,
  scanExcludePatterns: ['.git', 'node_modules', 'Thumbs.db', '.DS_Store'],
  fileFormatMap: {
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    webp: 'image',
    bmp: 'image',
    svg: 'image',
    tiff: 'image',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video',
    webm: 'video',
    mp3: 'audio',
    wav: 'audio',
    flac: 'audio',
    aac: 'audio',
    ogg: 'audio',
    pdf: 'document'
  },
  tagDescriptions: {},
  theme: 'dark',
  layoutMode: 'masonry',
  showTitles: true,
  showWorkspaceCovers: true
}
