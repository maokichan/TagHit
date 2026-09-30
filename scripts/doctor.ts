/**
 * 库自检（只读）：`npm run doctor [库路径]`
 *
 * 解决"界面里工作区不见了"这类问题的第一问：**数据还在不在**。
 * 只读打开（不跑迁移、不写任何东西），所以可以对着正在用的库跑，也绝不会改变它。
 * 默认路径 = 开发库 build/taghit-dev.db；可用参数或 TAGHIT_DB 覆盖。
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

type Row = Record<string, unknown>

const path = resolve(process.argv[2] ?? process.env.TAGHIT_DB ?? 'build/taghit-dev.db')

if (!existsSync(path)) {
  console.error(`✗ 库文件不存在：${path}`)
  process.exit(1)
}

const st = statSync(path)
console.log(`库文件：${path}`)
console.log(`大小：${(st.size / 1024 / 1024).toFixed(2)} MiB · 最后修改：${st.mtime.toISOString()}`)

let db: DatabaseSync
try {
  db = new DatabaseSync(path, { readOnly: true })
} catch (e) {
  console.error(`✗ 打开失败（${e instanceof Error ? e.message : String(e)}）`)
  console.error('  可能原因：路径不对 / 文件被占用 / 权限不足。这个命令不会修改库，放心重试。')
  process.exit(1)
}
const all = (sql: string): Row[] => db.prepare(sql).all() as Row[]
const one = (sql: string): Row | undefined => db.prepare(sql).get() as Row | undefined
const count = (t: string): number => {
  try {
    return Number(one(`SELECT COUNT(*) AS n FROM ${t}`)?.['n'] ?? 0)
  } catch {
    return -1 // 表不存在（0.1 时代的老库）
  }
}

const version = Number(one('PRAGMA user_version')?.['user_version'] ?? 0)
console.log(`schema 版本位：${version}${version === 0 ? '（旧库：应用下次打开时补写）' : ''}`)

const tables = ['workspaces', 'workspaceRoots', 'pathNodes', 'retiredRoots', 'items', 'tags', 'attachments', 'declarations', 'collections', 'groups']
console.log('表计数：' + tables.map((t) => `${t}=${(() => { const n = count(t); return n < 0 ? '无此表' : n })()}`).join(' · '))

if (count('workspaces') < 0) {
  console.error('\n✗ 这不是 0.2 的库（没有 workspaces 表）——应用打开的很可能不是这个文件。')
  db.close()
  process.exit(2)
}

/** 父目录（与领域 parentDir 同解）：用于把条目归到路径节点上，只在本自检里用。 */
const parentDir = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

const workspaces = all('SELECT id, name, createdAt FROM workspaces ORDER BY name')
console.log(`\n工作区 ${workspaces.length} 个：`)
for (const w of workspaces) {
  const id = String(w['id'])
  const roots = (db.prepare('SELECT path FROM workspaceRoots WHERE workspaceId = ?').all(id) as Row[]).map(
    (r) => String(r['path'])
  )
  const nodes = db.prepare('SELECT dirPath, state FROM pathNodes WHERE workspaceId = ?').all(id) as Row[]
  const included = new Set(nodes.filter((n) => n['state'] === 'included').map((n) => String(n['dirPath'])))
  const files = all("SELECT sourceUri FROM items WHERE kind = 'file'") as Row[]
  let members = 0
  for (const f of files) {
    if (included.has(parentDir(String(f['sourceUri'])))) members++
  }
  console.log(`  · ${String(w['name'])}  [${id}]  建库 ${String(w['createdAt'])}`)
  console.log(`      来源根 ${roots.length} 个：${roots.join(' , ') || '（无）'}`)
  console.log(`      路径节点 ${nodes.length} 个（included ${included.size}）→ 当前可见成员 ${members} 条`)
}

const missing = Number(one("SELECT COUNT(*) AS n FROM items WHERE kind = 'file' AND status = 'missing'")?.['n'] ?? 0)
console.log(`\n条目：${count('items')} 条（其中 missing ${missing} 条）· 标签 ${count('tags')} 个 · 挂载 ${count('attachments')} 条 · 声明 ${count('declarations')} 条`)
console.log('\n✓ 数据可读。若这里一切正常而界面里工作区为空，那是"渲染层 ↔ 宿主"的调用出了问题，不是数据丢了。')
db.close()
