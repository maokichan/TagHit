/**
 * docIndex —— 路径即跟踪 + 提及既引用（挂在 git pre-commit，见 .githooks/）
 *
 * ── 机制 ──
 * **有路径就算跟踪**（字面落法）：文档内任何路径形 token——md 链接目标、反引号路径、裸路径——
 * 都是对该文件/目录的跟踪边，无需任何显式语法。被引用文件进了暂存区而引用它的文档没动，
 * commit 时提醒漂移（目录边按前缀命中）。目标须实际存在（对「文档所在目录 → 各级祖先 →
 * 仓库根」依次解析，取首个存在者）；解析失败的 token 忽略，但以已知根段开头而解析失败的
 * 视为**疑似失效路径引用**，给 notice（不拦截）——文档与现实的脱钩从这里显形。
 * **提及既引用**（引用治理操典 §1 法条）：凡解析到仓库实物的提及，一律 md `[]()` 链接形态；
 * 反引号壳、裸路径、裸文档名都是违规形态（豁免：围栏代码块、链接目标本身、模板/占位符、
 * glob、gitignored）。门控形态分两步：check 模式先 notice 全量报出，转换批清零后 hook 翻为拦截。
 * **点前缀兜底**：TOKEN_RE 首字符类不含 `.`，`.agents/`、`.githooks/` 开头的提及 token 化时
 * 丢点（md 链接里的 `../.agents/...` 即此形态），解析必然失败且不匹配带点的已知根段 → 静默
 * 漏检；故解析失败且匹配位置前一字符是 `.` 时并入重试。
 * **引用方向纪律只管 md 链接**（引用治理操典 §1.2 口径）：**向上一概非法**——目标解析到引用
 * 文档的祖先目录（含仓库根与根层单件）即拦；竖直导航由入口链承担，下层不回指上层，改写为
 * 不含路径 token 的中文替称。跨子树（兄弟目录）链接合法。机制不保证同步、不校验语义；
 * 它只让"该看一眼"无处遁形。
 * 用法：`node ops/scripts/docIndex.mjs check`（全量体检）| `hook`（pre-commit 调用）。
 * 运行环境：零依赖 Node ESM（node >= 20）；路径一律 / 分隔（git ls-files 口径）。
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 文件级豁免单点登记于 ops/exemptions.json（path + guards + reason），按守卫名取用。 */
const EXEMPT = JSON.parse(readFileSync(join(ROOT, 'ops', 'exemptions.json'), 'utf8'))
  .exemptions.filter((e) => e.guards.includes('docIndex')).map((e) => e.path)
const isExempt = (p) => EXEMPT.some((pre) => (pre.endsWith('/') ? p.startsWith(pre) : p === pre))

/** 提及既引用：check 模式 notice（观测期）；转换批清零后把 MENTIONS_BLOCKING 翻 true，hook 拦截。 */
const MENTIONS_BLOCKING = true

const isTTY = process.stdout.isTTY
const paint = (s, c) => (isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
const red = (s) => paint(s, '31')
const green = (s) => paint(s, '32')
const yellow = (s) => paint(s, '33')

const trackedMd = () =>
  execSync('git ls-files -- "*.md"', { encoding: 'utf8' })
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.endsWith('.md') && p !== '' && !isExempt(p))

const dirOf = (rel) => {
  const d = dirname(rel).split(sep).join('/')
  return d === '.' ? '' : d
}

/** md 链接方向的比较基准：目录目标取目录本身，文件目标取其所在目录 */
const effectiveTargetDir = (rel) => {
  try {
    if (statSync(join(ROOT, rel)).isDirectory()) return rel
  } catch {
    // 不存在的路径按文件处理
  }
  return dirOf(rel)
}

/** 引用方向：目标目录在引用文档祖先链上（含仓库根本身）= 向上，非法；跨子树兄弟合法（操典口径） */
const isAboveDoc = (effDir, docRel) => {
  const d = dirOf(docRel)
  if (effDir === '') return d !== '' // 根层单件（AGENTS/README/TODO）对所有子树都是祖先；根层文档互链是平级，合法
  if (effDir === d) return false // 平级
  return d.startsWith(effDir + '/')
}

/** 路径形 token：含 `/` 或以 1–4 位扩展名结尾；剥尾部标点。
 *  字符集含 CJK 统一表意文字（\u4e00-\u9fff）——中文项目里路径提及可能是中英混写
 *  （如 `src/领域规则`），纯 ASCII 正则会在首个汉字处截断 token，失效探针静默漏检。 */
const TOKEN_RE = /[A-Za-z0-9_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff./\\-]*/g
const isPathLike = (tok) => tok.includes('/') || /\.[A-Za-z0-9]{1,4}$/.test(tok)
const stripEdgePunct = (tok) => tok.replace(/[.,;:。，、；）)」』】\]]+$/, '')

const gitIgnoredMemo = new Map()
const gitIgnored = (rel, dirForm = false) => {
  const key = rel + (dirForm ? '/' : '')
  if (gitIgnoredMemo.has(key)) return gitIgnoredMemo.get(key)
  let result = false
  try {
    execSync(`git check-ignore -q "${rel}${dirForm ? '/' : ''}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore']
    })
    result = true
  } catch {
    result = false
  }
  gitIgnoredMemo.set(key, result)
  return result
}

/** 已知仓库根段：这些开头而解析失败的引用，大概率是文档与现实的脱钩 */
const KNOWN_ROOTS = ['src/', 'frontend/', 'docs/', 'ops/', 'scripts/', 'plugins/', '.agents/', '.githooks/']

/** 无扩展名的 token 依次补这些扩展名再试（人写路径常省 .md/.ts） */
const GUESS_EXTS = ['.md', '.ts', '.mjs']

/**
 * 对 token 依次按「文档目录 → 各级祖先 → 仓库根」解析，取首个存在者；
 * 无扩展名再按 GUESS_EXTS 补全一试。
 */
const resolveToken = (doc, raw) => {
  const tok = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(tok) || tok.startsWith('//')) return null
  const bases = []
  let cur = dirname(join(ROOT, doc))
  while (true) {
    bases.push(cur)
    if (cur === ROOT) break
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  const tryRel = (t) => {
    for (const base of bases) {
      const abs = resolve(base, t)
      const rel = relative(ROOT, abs).split(sep).join('/')
      if (!rel.startsWith('..') && existsSync(abs)) return rel
    }
    return null
  }
  const direct = tryRel(tok)
  if (direct) return direct
  if (!/\.[A-Za-z0-9]{1,4}$/.test(tok)) {
    for (const ext of GUESS_EXTS) {
      const hit = tryRel(tok + ext)
      if (hit) return hit
    }
  }
  return null
}

/** 代码事实块区域掩码：codefact 生成物整块移出一切探针——块的正确性由 codefact check
 *  守卫（重新生成比对），路径跟踪与提及探针都不看它（跟踪边会随生成刷新成漂移噪声）。 */
const maskFactBlocks = (text) => {
  const chars = new Array(text.length).fill(true)
  let pos = 0
  let inFact = false
  for (const l of text.split('\n')) {
    const t = l.trim()
    if (t.startsWith('<!--') && t.includes('codefact:begin')) inFact = true
    if (inFact) for (let i = pos; i < pos + l.length; i++) chars[i] = false
    if (inFact && t.startsWith('<!--') && t.includes('codefact:end')) inFact = false
    pos += l.length + 1
  }
  return chars
}

/** 探针散文掩码：事实块、围栏、既有链接整体、多词行内码（命令串/示例）→ 非散文；
 *  单 token 行内码保留——反引号壳里的实质引用正是要抓的对象（豁免口径见 ops/AGENTS.md）。 */
const proseMask = (text) => {
  const chars = maskFactBlocks(text)
  let pos = 0
  let inFence = false
  for (const l of text.split('\n')) {
    if (l.trim().startsWith('```')) inFence = !inFence
    if (inFence) for (let i = pos; i < pos + l.length; i++) chars[i] = false
    pos += l.length + 1
  }
  const maskSpan = (m) => {
    for (let i = m.index; i < m.index + m[0].length; i++) chars[i] = false
  }
  for (const m of text.matchAll(/\[[^\]]*\]\([^()]*\)/g)) maskSpan(m)
  for (const m of text.matchAll(/`[^`\n]+`/g)) {
    if (/\s/.test(m[0].slice(1, -1))) maskSpan(m)
  }
  return chars
}

/**
 * 全量扫描。返回 { errors, notices, violations, edges: Map<文档, Set<路径>> }
 * edges = 路径即跟踪的边集（含 md 链接目标——超集，无需单列）；
 * violations = 提及既引用违规（可解析的非链接形态提及）。
 */
const inspect = () => {
  const errors = []
  const notices = []
  const violations = []
  const edges = new Map()
  const docs = trackedMd()

  for (const doc of docs) {
    let text
    try {
      text = readFileSync(join(ROOT, doc), 'utf8')
    } catch {
      continue
    }
    const docSet = new Set()
    edges.set(doc, docSet)
    const fact = maskFactBlocks(text)
    // md 链接：方向纪律（导航语义；事实块内不查——生成物由 codefact check 承担）
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (!fact[m.index]) continue
      const target = m[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const rel = relative(ROOT, resolve(ROOT, dirOf(doc), target.split('#')[0])).split(sep).join('/')
      if (rel.startsWith('..')) errors.push(`${doc}：引用越出仓库 —— ${target}`)
      else if (isAboveDoc(effectiveTargetDir(rel), doc))
        errors.push(`${doc}：引用方向向上（祖先）—— ${target}（下层不回指上层，改中文替称；跨子树兄弟合法）`)
    }
    // 路径 token（含链接目标与代码块；事实块除外）：引用即跟踪
    for (const m of text.matchAll(TOKEN_RE)) {
      if (!fact[m.index]) continue
      const tok = stripEdgePunct(m[0])
      if (!isPathLike(tok) || /^(https?:|mailto:)/i.test(tok) || tok.includes('://')) continue
      if (tok.includes('*')) continue // glob 模式（如 scripts/s3x-*-scenario.ts）不作为单一引用
      if (text[m.index + m[0].length] === '<' || text[m.index + m[0].length] === '*') continue // 模板/glob 截断
      // 点前缀兜底：首字符类不含 `.`，点前缀路径 token 化时丢点；解析失败且前一字符是 `.` 则并入重试
      let probe = tok
      let rel = resolveToken(doc, tok)
      if (rel === null && text[m.index - 1] === '.') {
        probe = '.' + tok
        rel = resolveToken(doc, probe)
      }
      if (rel && rel.includes('/')) {
        docSet.add(rel) // 单段路径（根层的 package.json、AGENTS.md 等泛指）不作边——不可行动的漂移面
      } else if (rel === null && KNOWN_ROOTS.some((r) => probe.startsWith(r))) {
        if (gitIgnored(probe) || gitIgnored(probe, true)) continue // gitignored 运行时路径（如 build/ 产物）非失效
        const key = `${doc}：疑似失效路径引用 —— ${probe}`
        if (!notices.includes(key)) notices.push(key)
      }
    }
    // 提及既引用探针：只在散文（掩码后）上找"解析到实物却不是链接"的提及
    const mask = proseMask(text)
    for (const m of text.matchAll(TOKEN_RE)) {
      if (!mask[m.index]) continue
      const end = m.index + m[0].length
      const tok = stripEdgePunct(m[0])
      if (!isPathLike(tok) || /^(https?:|mailto:)/i.test(tok) || tok.includes('://')) continue
      if (tok.includes('*')) continue
      if (text[end] === '<' || text[end] === '*') continue
      let probe = tok
      let rel = resolveToken(doc, tok)
      if (rel === null && text[m.index - 1] === '.') {
        probe = '.' + tok
        rel = resolveToken(doc, probe)
      }
      if (rel && rel.includes('/')) {
        if (gitIgnored(rel) || gitIgnored(rel, true)) continue // gitignored 运行时路径不是仓库实物引用
        const key = `${doc}：提及未成链接 —— ${probe}（→ ${rel}；写 []() 链接，向上则改中文替称）`
        if (!violations.includes(key)) violations.push(key)
      }
    }
    // 码内链接探针：反引号壳里的链接按码跨度渲染、不可点（码优先于链接语法），是违规形态——
    // 整壳包裹与命令串内嵌链接都算（命令串本身是引用豁免对象，其中的路径不该被转换）
    let inFence = false
    let pos = 0
    for (const l of text.split('\n')) {
      if (l.trim().startsWith('```')) {
        inFence = !inFence
        pos += l.length + 1
        continue
      }
      if (inFence) {
        pos += l.length + 1
        continue
      }
      for (const m of l.matchAll(/`[^`\n]+`/g)) {
        if (!fact[pos + m.index]) continue
        if (/\]\([^()]*\)/.test(m[0].slice(1, -1))) {
          const key = `${doc}：码内链接（反引号壳须剥；命令串整体豁免不转换）—— ${m[0]}`
          if (!violations.includes(key)) violations.push(key)
        }
      }
      pos += l.length + 1
    }
  }
  return { errors, notices, violations, edges }
}

const cmd = process.argv[2]

if (cmd === 'check') {
  const { errors, notices, violations, edges } = inspect()
  for (const v of violations) console.log(yellow(`▣ ${v}`))
  for (const n of notices) console.log(yellow(`△ ${n}`))
  if (errors.length > 0) {
    console.error(red('doc-index check：存在错误。\n'))
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(
    green(
      `doc-index check：${edges.size} 个文档的路径引用全部合规。` +
        (violations.length > 0 ? `（另有 ${violations.length} 条「提及未成链接」违规待转换批清零）` : '')
    )
  )
  process.exit(0)
}

if (cmd === 'hook') {
  const { errors, violations, edges } = inspect()
  const blocking = MENTIONS_BLOCKING ? errors.concat(violations) : errors
  if (blocking.length > 0) {
    console.error(red('doc-index 拦截\n'))
    for (const e of blocking) console.error(`  ${e}`)
    console.error(`\n（修正引用或更新对应文档后重试；--no-verify 是人类的绕行特权——AGENTS.md）`)
    process.exit(1)
  }
  const staged = new Set(
    execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '')
  )
  const drifts = []
  for (const [doc, targets] of edges) {
    if (staged.has(doc)) continue // 文档自己在动，视为知情
    for (const rel of targets) {
      const hit = staged.has(rel) || [...staged].some((s) => s.startsWith(rel + '/'))
      if (hit) drifts.push(`${rel} 在本批提交里变了，引用它的 ${doc} 没动`)
    }
  }
  if (drifts.length > 0) {
    for (const d of drifts) console.log(yellow(`⚠ doc-index 漂移提醒（不拦截）—— ${d}`))
  } else {
    console.log('doc-index：引用与变更无漂移。')
  }
  process.exit(0)
}

console.log('用法：node ops/scripts/docIndex.mjs check|hook')
process.exit(2)
