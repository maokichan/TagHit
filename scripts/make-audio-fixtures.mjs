/**
 * 生成带内嵌封面的音频夹具（插件首批实战的真机验证材料，宿主端点 audioMeta 的探针）。
 *
 * 依赖 ffmpeg（PATH 上可得）；输出目录默认 build/fixtures/audio（gitignore 内）。
 * 夹具清单：mp3/flac/m4a 各带一张 PNG 封面与基本标签；一个无封面 mp3；一个 mp4 视频
 * （闸门探针：宿主端点不得把视频当音频解析出封面）。
 *
 * 用法：node scripts/make-audio-fixtures.mjs [输出目录]
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const outDir = resolve(process.argv[2] ?? 'build/fixtures/audio')
mkdirSync(outDir, { recursive: true })

function run(args, what) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (r.status !== 0) {
    console.error(`[fixtures] ${what} 失败（ffmpeg exit ${r.status}）`)
    process.exit(1)
  }
}

const dur = 2
const cover = join(outDir, 'cover.png')
run(['-f', 'lavfi', '-i', `color=c=0x336699:s=300x300:d=1`, '-frames:v', '1', cover], 'cover.png')

const meta = ['-metadata', 'title=夹具曲目', '-metadata', 'artist=夹具艺术家', '-metadata', 'album=夹具专辑']

// mp3（带封面，ID3v2.3 APIC）
run(
  ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`, '-i', cover,
   '-map', '0:a', '-map', '1:v', '-c:a', 'libmp3lame', '-c:v', 'copy',
   '-id3v2_version', '3', '-disposition:v', 'attached_pic', ...meta,
   join(outDir, 'with-cover.mp3')],
  'mp3'
)
// flac（带封面 PICTURE 块）
run(
  ['-f', 'lavfi', '-i', `sine=frequency=550:duration=${dur}`, '-i', cover,
   '-map', '0:a', '-map', '1:v', '-c:a', 'flac', '-c:v', 'copy',
   '-disposition:v', 'attached_pic', ...meta,
   join(outDir, 'with-cover.flac')],
  'flac'
)
// m4a（带封面 covr atom）
run(
  ['-f', 'lavfi', '-i', `sine=frequency=660:duration=${dur}`, '-i', cover,
   '-map', '0:a', '-map', '1:v', '-c:a', 'aac', '-c:v', 'copy',
   '-disposition:v', 'attached_pic', '-f', 'ipod', ...meta,
   join(outDir, 'with-cover.m4a')],
  'm4a'
)
// 无封面 mp3
run(
  ['-f', 'lavfi', '-i', `sine=frequency=330:duration=${dur}`, '-c:a', 'libmp3lame',
   '-id3v2_version', '3', ...meta,
   join(outDir, 'no-cover.mp3')],
  'mp3(无封面)'
)
// mp4 视频（闸门探针）
run(
  ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=10',
   '-f', 'lavfi', '-i', `sine=frequency=440:duration=1`,
   '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
   join(outDir, 'video.mp4')],
  'mp4视频'
)

console.log(`[fixtures] 夹具已生成：${outDir}`)
