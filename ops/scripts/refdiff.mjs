/**
 * refdiff —— 引用对账（引用治理操典 §4.2 的本仓落法；操典跨项目、存仓库外）
 *
 * ── 机制 ──
 * 每文件统计 markdown 链接目标的**出现次数**，报「基线有而工作树变少」的条目。
 * 用途：链接形态转换批（提及 → `[]()`）完成后的**完整性证明**——转换脚本出错时
 * 门禁照样全绿（掩码/错挂门控验不出），链接集合不变式只有这道对账在看。
 * 它是钓竿不是证明：同数错挂（某合法目标的重复出现）计数不亏、扫描器看不见，
 * 完整性的最后一环是入口面人工目检（操典 §6）。
 * ── 与操典原文的两处偏差 ──
 * 1. 仓库根取脚本位置推断，不收参数（用法：`node ops/scripts/refdiff.mjs <基线commit>`）。
 * 2. 工作树已删除的文件不逐条列出（退役 = 有意消除，整文件缺链是预期），打一行 notice 跳过。
 * ── 坑位（操典 §5，都已规避）──
 * 文件清单用 `git diff <base>`（未见提交的改动对 `<base>..HEAD` 隐形）；对比侧必须
 * readFileSync 工作树（读 git 对象会让未提交修复"纹丝不动"）；新文件对基线 `git show`
 * 必 fatal，属预期噪音，catch 跳过。
 * 运行环境：零依赖 Node ESM（node >= 20）。
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const base = process.argv[2]
if (!base) {
  console.error('用法: node ops/scripts/refdiff.mjs <基线commit>')
  process.exit(2)
}

const SRC_EXT = /\.(md|txt|mjs|ts|tsx|js|cjs|json|toml|html|css|go|yml|yaml)$/

// ⚠ 坑1：文件清单也用「基线 vs 工作树」（git diff <base>），不要用 <base>..HEAD——
//   后者只见已提交内容，未提交的修复改动会整体隐形。
const files = execSync(`git diff --name-only ${base} --`, { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

const linkRe = /\[[^\]]*\]\(([^()]*)\)/g
const links = (t) => {
  const out = []
  let m
  linkRe.lastIndex = 0
  while ((m = linkRe.exec(t))) out.push(m[1].trim())
  return out
}
const counts = (a) => a.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map())

let total = 0
for (const f of files) {
  if (!SRC_EXT.test(f)) continue
  let baseTxt
  try {
    // stderr 静音：新文件对基线 git show 的 fatal 是预期噪音（坑4），不进对账输出
    baseTxt = execSync(`git show ${base}:${f}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 50e6,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  } catch {
    continue // ⚠ 坑4：新文件基线不存在，git show 会 fatal——预期噪音，catch 跳过
  }
  let headTxt = ''
  try {
    headTxt = readFileSync(join(ROOT, f), 'utf8') // ⚠ 坑1（主）：对比侧必须读工作树文件系统
  } catch {
    // 工作树已删除该文件：退役 = 有意消除，整文件缺链不逐条列出
    console.log(`\n## ${f}\n  (工作树已删除——退役文件，整文件缺失不逐条列出)`)
    continue
  }
  const b = counts(links(baseTxt))
  const h = counts(links(headTxt))
  const missing = []
  for (const [t, c] of b) {
    const r = h.get(t) || 0
    if (r < c) missing.push(`[${c - r}/${c}] ${t}`)
  }
  if (missing.length) {
    console.log(`\n## ${f}`)
    for (const m of missing) console.log('  ' + m)
    total += missing.length
  }
}
console.log(`\n=== 基线有而工作树缺失的链接条目合计：${total} ===`)
