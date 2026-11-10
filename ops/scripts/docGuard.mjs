/**
 * docGuard —— 文档门控（全项目 Markdown 行数上限 + 单行可见宽度上限；挂在 git pre-commit，见 .githooks/）
 *
 * ── 命名规范 ──
 * `ops/scripts/<域><动作>.mjs`：域 = 治理对象（小写单词），动作 = 对它做什么（驼峰，首字母大写）。
 * 动作词分两族：**Guard = 门控**（不合规 → 非零退出、挡提交）；**Probe = 探针**（只观测不挡）。
 * 本目录（ops/scripts/）只放**仓库治理**脚本（守卫链见 ops/AGENTS.md）；业务与校准在 scripts/
 * （校准场景、dev 一键、自验），二者分治。本脚本 = 域 `doc`（文档治理）+ 动作 `Guard`。
 *
 * ── 用途 ──
 * 扫描 git 追踪的全部 Markdown（文件级豁免统一登记 ops/exemptions.json），两道门：
 * ① 行数 vs 上限表（入口族硬上限，其余默认 300；代码事实块 codefact 计 1 行——机器产物
 *    不占散文预算，块的正确性由 codefact check 守卫）；② 单行可见宽度 vs 200 字符。
 * 任一超限即挡。`node ops/scripts/docGuard.mjs` = 门控（hook 调的就是它）；`--report` = 体检报告，只打印不挡。
 *
 * ── 目的 ──
 * 本项目的文档体系是 agent 的**按需加载结构**（渐进式披露，见 AGENTS.md §四）：入口文档必须
 * 保持"只有指针、不复读细节"，专项文档按小节承载细节。任何文档的无限膨胀都会让指针失灵、
 * 让"按需加载"退化成"全量阅读"。行数上限防"页数膨胀"；**单行宽度上限防"压缩进一行"**——
 * 把整节事实压进一个 4000 字符的段落墙，行数门控看不见它，宽度门控就是为它立的（开发者裁决：
 * 单行字数仍要有上限）。超限 = 挡，直到把细节拆分到该在的小节（这正是期望的维护动作）。
 *
 * ── 宽度口径 ──
 * 只数**可见文本**：链接只数显示文本（目标路径不算——URL 长度不是内容密度）、HTML 注释不算、
 * 围栏代码块整块不算（代码不是散文；行内反引号内容照数）。**不设行级豁免**：超限 = 拆行/拆节，
 * 一条超长行永远可以拆成多条；拆不动就是内容该下沉了。
 *
 * ── 上限表口径 ──
 * 只登记入口/索引类（AGENTS/README 族）的硬上限——渐进式披露的命脉，短是结构性的，没有商量；
 * 其余文档统一默认 300（guardrail 非削减目标）：超限 = 洗——按纪律结合程序事实（对照代码现状），
 * 去没必要的形容词与不必要的推演过程，只留判定、事实与接口形状。
 * 运行环境：零依赖 Node ESM（node >= 20）；路径一律 / 分隔（git ls-files 口径）。
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 文件级豁免单点登记于 ops/exemptions.json（path + guards + reason），按守卫名取用。 */
const EXEMPT = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'exemptions.json'), 'utf8')
).exemptions.filter((e) => e.guards.includes('docGuard')).map((e) => e.path)
const isExempt = (p) => EXEMPT.some((pre) => (pre.endsWith('/') ? p.startsWith(pre) : p === pre))

/** 上限表：路径（/ 分隔）→ 行数上限。只登记入口/索引类硬上限——其余文档一律默认 300。 */
const DOC_LIMITS = {
  'AGENTS.md': 80, // agent 全局入口（每次会话强制注入）
  'README.md': 80, // 人类入口
  'docs/AGENTS.md': 80, // 项目级文档子树入口（维护法）
  'src/AGENTS.md': 80, // 后端核心子树入口
  'frontend/AGENTS.md': 80, // 渲染层子树入口
  'scripts/AGENTS.md': 80, // 校准与开发工具子树入口
  'ops/AGENTS.md': 80, // 治理子树入口
  'plugins/AGENTS.md': 80, // 插件子树入口
  '.agents/notes/README.md': 80, // 决策日志机制
  '.agents/notes/AGENTS.md': 80 // 决策日志 agent 规则
}

/** 未登记文档的默认上限 */
const DEFAULT_LIMIT = 300

/** 单行可见宽度上限（开发者裁决）：段落墙从行数上限的眼皮底下漏掉，这里堵住。 */
const LINE_WIDTH_LIMIT = 200

/** git 追踪的全部 .md（含暂存区新文件；豁免口径见 ops/exemptions.json） */
const tracked = execSync('git ls-files -- "*.md"', { encoding: 'utf8' })
  .split('\n')
  .map((p) => p.trim())
  .filter((p) => p.endsWith('.md') && p !== '' && !isExempt(p))

/** 可见文本：链接只数显示文本、HTML 注释剥离（宽度口径见头注） */
const visibleText = (l) =>
  l
    .replace(/\[[^\]]*\]\([^()]*\)/g, (m) => m.slice(1, m.indexOf('](')))
    .replace(/<!--[^>]*-->/g, '')

const scan = (p) => {
  const raw = readFileSync(p, 'utf8').split('\n')
  let inFence = false
  let inFact = false
  let lines = 0
  const wide = []
  raw.forEach((l, i) => {
    const t = l.trim()
    // 代码事实块（codefact 生成物）计 1 行：机器产物不占散文行数预算（口径见头注）
    if (t.startsWith('<!--') && t.includes('codefact:begin')) {
      inFact = true
      lines += 1
      return
    }
    if (inFact) {
      if (t.startsWith('<!--') && t.includes('codefact:end')) inFact = false
      return
    }
    if (!(i === raw.length - 1 && l === '')) lines += 1 // wc -l 口径
    if (t.startsWith('```')) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const w = visibleText(l).length
    if (w > LINE_WIDTH_LIMIT) wide.push({ n: i + 1, w })
  })
  return { lines, wide }
}

const report = process.argv.includes('--report')
const rows = tracked
  .map((p) => {
    const limit = DOC_LIMITS[p] ?? DEFAULT_LIMIT
    const { lines, wide } = scan(p)
    return { p, lines, wide, limit, unregistered: !(p in DOC_LIMITS) }
  })
  .sort((a, b) => b.lines / b.limit - a.lines / a.limit)

const isTTY = process.stdout.isTTY
const paint = (s, c) => (isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
const red = (s) => paint(s, '31')
const yellow = (s) => paint(s, '33')
const green = (s) => paint(s, '32')
const dim = (s) => paint(s, '2')

if (report) {
  console.log('docGuard --report：全量文档体检（行数/上限/占用率）\n')
  for (const r of rows) {
    const pct = Math.round((r.lines / r.limit) * 100)
    const mark = r.lines > r.limit || r.wide.length > 0 ? red('✗') : pct >= 90 ? yellow('△') : green('✓')
    console.log(
      `${mark} ${String(r.lines).padStart(5)} / ${String(r.limit).padStart(5)}  ${String(pct).padStart(3)}%  ${r.p}${
        r.unregistered ? dim('  （未登记，按默认上限）') : ''
      }${r.wide.length ? red(`  超宽行×${r.wide.length}`) : ''}`
    )
  }
  const wideFiles = rows.filter((r) => r.wide.length > 0)
  if (wideFiles.length) {
    console.log('\n超宽行明细（> ' + LINE_WIDTH_LIMIT + ' 可见字符）：')
    for (const r of wideFiles) {
      console.log(`  ${r.p}: ${r.wide.map((w) => `L${w.n}(${w.w})`).join(' ')}`)
    }
  }
  console.log(
    `\n${rows.length} 个文档。✓ 达标  △ 行数≥90%（只许降）  ✗ 超限（行数或单行宽度）。` +
      `上限表与口径见本脚本头注。`
  )
  process.exit(0)
}

const over = rows.filter((r) => r.lines > r.limit)
const wide = rows.filter((r) => r.wide.length > 0)
if (over.length > 0 || wide.length > 0) {
  console.error(red('docGuard：以下文档超限，提交被挡。\n'))
  for (const r of over) {
    console.error(`  ${r.p}  ${r.lines} 行 / 上限 ${r.limit} 行（超 ${r.lines - r.limit} 行）`)
  }
  for (const r of wide) {
    console.error(
      `  ${r.p}  超宽行（> ${LINE_WIDTH_LIMIT} 可见字符）：${r.wide.map((w) => `L${w.n}(${w.w})`).join(' ')}`
    )
  }
  console.error(
    `\n修法（渐进式披露口径）：行数超限 = 细节下沉到该在的小节或权威文档` +
      `（架构入 ARCHITECTURE、组件行为入所属 feature 文档），过时段落退役进 git 历史，不堆旧版注记；` +
      `宽度超限 = 在句界拆行/拆列表项（可见文本口径：链接目标与代码块不计），拆不动即内容该下沉。` +
      `\n上限表与口径见 ops/scripts/docGuard.mjs 头注。` +
      `\n（--no-verify 是人类的绕行特权，agent 不可以——AGENTS.md）`
  )
  process.exit(1)
}

console.log(
  green(`docGuard：${rows.length} 个文档全部达标（行数 + 单行宽度；含 ${rows.filter((r) => r.unregistered).length} 个未登记项按默认上限）。`)
)
