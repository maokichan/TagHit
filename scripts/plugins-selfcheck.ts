/**
 * 插件安装位自检（node 直验）：zip 安装 / 覆盖 / manifest 校验 / 路径穿越拒绝 / 卸载 / 清单
 * 全链断言——与 scripts/diagnostics-selfcheck.ts 同款纪律（宿主纯模块直验，不进 CI 链）。
 * 运行：node scripts/plugins-selfcheck.ts
 *
 * zip 夹具现做（最小 stored 条目写入器，无压缩）：crc32/本地头/中央目录/EOCD 手拼，
 * 只为给 installZip 喂真 zip；路径穿越夹具用 `../evil.txt` 条目（yauzl 文件名校验应拒）。
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  apiVersionAtMost,
  installZip,
  listInstalls,
  peekZip,
  uninstallPlugin,
  type PluginManifestFile,
} from '../src/host/plugins.ts'

// ---- 断言小件（手写 assert 累计，与校准场景同款） ----
let passed = 0
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error(`✗ ${label}`)
    process.exit(1)
  }
  passed++
  console.log(`✓ ${label}`)
}

async function assertThrows(label: string, fn: () => Promise<unknown>, fragment: string): Promise<void> {
  try {
    await fn()
    console.error(`✗ ${label}（没有抛错）`)
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(fragment)) {
      console.error(`✗ ${label}\n  实际错误：${message}\n  预期含「${fragment}」`)
      process.exit(1)
    }
    passed++
    console.log(`✓ ${label}（含「${fragment}」）`)
  }
}

// ---- 最小 zip 写入器（stored 条目） ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff]
}
function u32(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]
}

function buildZip(entries: Array<{ name: string; data: string }>): Uint8Array {
  const locals: number[] = []
  const centrals: number[] = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = [...Buffer.from(name, 'utf8')]
    const dataBytes = [...Buffer.from(data, 'utf8')]
    const crc = crc32(Buffer.from(data, 'utf8'))
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...dataBytes,
    ]
    locals.push(...local)
    centrals.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...nameBytes
    )
    offset += local.length
  }
  const cdSize = centrals.length
  const out = [
    ...locals, ...centrals,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]
  return new Uint8Array(out)
}

async function writeFixtureZip(path: string, entries: Array<{ name: string; data: string }>): Promise<void> {
  await writeFile(path, buildZip(entries))
}

const manifestJson = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    id: 'selfcheckPlugin',
    title: '自检插件',
    version: '1.0.0',
    author: 'selfcheck',
    apiVersion: '0.2.4',
    mounts: ['contentTab'],
    surfaces: ['toast'],
    main: 'index.js',
    ...over,
  })

// ---- 场景 ----
const root = await mkdtemp(join(tmpdir(), 'taghit-plugins-selfcheck-'))
const installsRoot = join(root, 'plugins')
const zip = (name: string): string => join(root, name)

try {
  assert(apiVersionAtMost('0.2.4', '0.2.4') && apiVersionAtMost('0.2.3', '0.2.4') && !apiVersionAtMost('0.2.5', '0.2.4'),
    'apiVersion 段比较：等/低过/超版')
  assert(apiVersionAtMost('0.2', '0.2.4') && !apiVersionAtMost('0.2.x', '0.2.4'), 'apiVersion 短段补 0 与非法段拒绝')

  // ① 合法安装
  const zipPath = zip('good.zip')
  await writeFixtureZip(zipPath, [
    { name: 'manifest.json', data: manifestJson() },
    { name: 'index.js', data: 'export const activate = () => () => {}\n' },
  ])
  const r1: { manifest: PluginManifestFile; replaced: boolean } = await installZip(zipPath, installsRoot)
  assert(r1.replaced === false && r1.manifest.id === 'selfcheckPlugin' && r1.manifest.version === '1.0.0',
    '安装：manifest 落位且 replaced=false')
  const onDisk = JSON.parse(await readFile(join(installsRoot, 'selfcheckPlugin', 'manifest.json'), 'utf8'))
  assert(onDisk.title === '自检插件', '安装：目录 = manifest.id，文件落盘')

  // ② 覆盖安装（同 id 升版本）
  await writeFixtureZip(zipPath, [
    { name: 'manifest.json', data: manifestJson({ version: '2.0.0' }) },
    { name: 'index.js', data: 'export const activate = () => () => {}\n' },
  ])
  const r2 = await installZip(zipPath, installsRoot)
  assert(r2.replaced === true && r2.manifest.version === '2.0.0', '覆盖安装：replaced=true 且版本更新')

  // ③ zip 根套一层目录也能定位包根
  const nested = zip('nested.zip')
  await writeFixtureZip(nested, [
    { name: 'selfcheckPlugin/manifest.json', data: manifestJson({ version: '3.0.0' }) },
    { name: 'selfcheckPlugin/index.js', data: 'export const activate = () => () => {}\n' },
  ])
  const r3 = await installZip(nested, installsRoot)
  assert(r3.replaced === true && r3.manifest.version === '3.0.0', '单层目录包根定位')

  // ③b peek：读包不落位（conflict 判定 + 不留目录）
  const peekA = await peekZip(zipPath, installsRoot)
  assert(peekA.conflict === true && peekA.manifest.version === '2.0.0', 'peek：同 id 冲突判定')
  const otherZip = zip('other.zip')
  await writeFixtureZip(otherZip, [
    { name: 'manifest.json', data: manifestJson({ id: 'otherPlugin', version: '1.0.0' }) },
    { name: 'index.js', data: '' },
  ])
  const peekB = await peekZip(otherZip, installsRoot)
  assert(peekB.conflict === false, 'peek：新 id 无冲突')
  const noLeak = await readFile(join(installsRoot, 'otherPlugin', 'manifest.json')).then(() => false).catch(() => true)
  assert(noLeak, 'peek：不落位')

  // ④ 缺 version（zip 分发必填）
  const noVersion = zip('no-version.zip')
  await writeFixtureZip(noVersion, [
    { name: 'manifest.json', data: manifestJson({ version: undefined }) },
    { name: 'index.js', data: '' },
  ])
  await assertThrows('缺 version 拒绝', () => installZip(noVersion, installsRoot), 'version 缺失')

  // ⑤ apiVersion 超出宿主现值
  const futureApi = zip('future-api.zip')
  await writeFixtureZip(futureApi, [
    { name: 'manifest.json', data: manifestJson({ apiVersion: '9.9.9' }) },
    { name: 'index.js', data: '' },
  ])
  await assertThrows('apiVersion 超版拒绝', () => installZip(futureApi, installsRoot), '请升级 TagHit')

  // ⑥ 非法 id（下划线开头 = 保留命名空间）
  const badId = zip('bad-id.zip')
  await writeFixtureZip(badId, [
    { name: 'manifest.json', data: manifestJson({ id: '__vendor' }) },
    { name: 'index.js', data: '' },
  ])
  await assertThrows('保留 id 拒绝', () => installZip(badId, installsRoot), '非法字符')

  // ⑦ 路径穿越条目（yauzl 文件名校验）
  const evil = zip('evil.zip')
  await writeFixtureZip(evil, [
    { name: '../evil.txt', data: 'nope' },
  ])
  await assertThrows('路径穿越拒绝', () => installZip(evil, installsRoot), '不安全')

  // ⑧ 包根缺 manifest
  const noManifest = zip('no-manifest.zip')
  await writeFixtureZip(noManifest, [{ name: 'index.js', data: '' }])
  await assertThrows('缺 manifest 拒绝', () => installZip(noManifest, installsRoot), 'manifest.json')

  // ⑨ 入口缺失（manifest 说有 index.js，包里没有）
  const noEntry = zip('no-entry.zip')
  await writeFixtureZip(noEntry, [{ name: 'manifest.json', data: manifestJson() }])
  await assertThrows('入口缺失拒绝', () => installZip(noEntry, installsRoot), '入口模块缺失')

  // ⑩ 卸载：存在 → 删除；不存在 → 报错
  await uninstallPlugin('selfcheckPlugin', installsRoot)
  const gone = await readFile(join(installsRoot, 'selfcheckPlugin', 'manifest.json')).then(() => false).catch(() => true)
  assert(gone, '卸载：目录已删除')
  await assertThrows('卸载未知插件报错', () => uninstallPlugin('selfcheckPlugin', installsRoot), '未安装')
  await assertThrows('卸载非法 id 报错', () => uninstallPlugin('../escape', installsRoot), '非法插件 id')

  // ⑪ 清单：bundle 错误条目如实呈现 + dev-source 宽松校验
  await mkdir(join(installsRoot, 'broken'), { recursive: true })
  const devRoot = join(root, 'dev-plugins')
  await mkdir(join(devRoot, 'devPlugin', 'src'), { recursive: true })
  await writeFile(join(devRoot, 'devPlugin', 'manifest.json'), JSON.stringify({ id: 'devPlugin', title: '开发插件' }))
  await writeFile(join(devRoot, 'devPlugin', 'src', 'index.ts'), 'export const activate = () => () => {}\n')
  const entries = await listInstalls([
    { root: devRoot, form: 'dev-source' },
    { root: installsRoot, form: 'bundle' },
  ])
  const dev = entries.find((e) => e.id === 'devPlugin')
  assert(dev != null && dev.form === 'dev-source' && dev.manifest?.title === '开发插件' && dev.error == null,
    '清单：dev-source 宽松校验（version 可缺）')
  const broken = entries.find((e) => e.id === 'broken')
  assert(broken != null && broken.manifest == null && broken.error != null, '清单：错误条目如实呈现不静默吞')

  console.log(`\n—— 插件安装位自检：${passed} 断言全绿 ——`)
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {})
}
