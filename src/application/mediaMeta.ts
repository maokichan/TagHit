/**
 * 媒体元数据提取（纯函数，零依赖）。
 *
 * 老版用 image-size 库在扫描时取图片尺寸；0.2 用 FileSystem.readHead(64KiB)
 * 读文件头后在此解析，避免第三方依赖。只覆盖常见格式，解析不出 → null
 * （条目照常入库，宽高缺省，前端回退估计比例）。
 */

export interface MediaSize {
  width: number
  height: number
}

/** 图片类扩展名（决定扫描时是否读头解析） */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])

export function isImageExt(ext: string | null | undefined): boolean {
  return ext != null && IMAGE_EXTS.has(ext)
}

function extOf(title: string): string {
  const dot = title.lastIndexOf('.')
  return dot <= 0 || dot === title.length - 1 ? '' : title.slice(dot + 1).toLowerCase()
}

export function isImageFile(title: string): boolean {
  return isImageExt(extOf(title))
}

const u16be = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1]
const u16le = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8)
const u24le = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u32le = (b: Uint8Array, o: number): number => u24le(b, o) + b[o + 3] * 0x1000000

function pngSize(b: Uint8Array): MediaSize | null {
  // \x89PNG\r\n\x1a\n + IHDR 长度(4) + 'IHDR' + W(4) H(4)
  if (b.length < 24) return null
  return { width: b[16] * 0x1000000 + b[17] * 0x10000 + b[18] * 0x100 + b[19], height: b[20] * 0x1000000 + b[21] * 0x10000 + b[22] * 0x100 + b[23] }
}

function gifSize(b: Uint8Array): MediaSize | null {
  if (b.length < 10) return null
  return { width: u16le(b, 6), height: u16le(b, 8) }
}

function bmpSize(b: Uint8Array): MediaSize | null {
  // BITMAPINFOHEADER 起始（DIB 头偏移 14）：W/H 各 int32 LE，H 可为负（顶行在前）
  if (b.length < 26) return null
  const w = u32le(b, 18)
  const h = u32le(b, 22)
  if (w === 0 || h === 0) return null
  return { width: w, height: Math.abs(h) | 0 }
}

function webpSize(b: Uint8Array): MediaSize | null {
  // RIFF....WEBP + chunk: 'VP8 '/'VP8L'/'VP8X'
  if (b.length < 30) return null
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15])
  if (fourcc === 'VP8X') {
    // 24bit-1 LE：canvas width/height at 24/27
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  }
  if (fourcc === 'VP8L') {
    // 位流：14bit 宽-1 / 14bit 高-1，从 b[21] 起共 28bit
    if (b[20] !== 0x2f) return null // 失配即放弃（不逐位容错）
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (fourcc === 'VP8 ') {
    // lossy：frame tag(3) + sync 0x9d012a + W(14bit) H(14bit) at 26
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  return null
}

function jpegSize(b: Uint8Array): MediaSize | null {
  // 段扫描：FFD8 起，逐 marker 找 SOF0/1/2（C0/C1/C2）
  let o = 2
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o++
      continue
    }
    const marker = b[o + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      o += 2
      continue
    }
    const len = u16be(b, o + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (o + 9 > b.length) return null
      return { height: u16be(b, o + 5), width: u16be(b, o + 7) }
    }
    o += 2 + len
  }
  return null
}

/** 从文件头字节解析图片固有尺寸；格式不识别或头不完整 → null。 */
export function parseImageSize(head: Uint8Array): MediaSize | null {
  try {
    if (head.length < 10) return null
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return pngSize(head)
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return gifSize(head)
    if (head[0] === 0x42 && head[1] === 0x4d) return bmpSize(head)
    if (
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    ) {
      return webpSize(head)
    }
    if (head[0] === 0xff && head[1] === 0xd8) return jpegSize(head)
    return null
  } catch {
    return null
  }
}
