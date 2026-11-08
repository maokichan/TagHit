/**
 * check-i18n —— i18n 文案机检（D50/D51 随行件，check-templates / check-style 同族）。
 * 两个探针，一个脚本：
 *
 * 1. 键对账：各 locale 文件对 zh-CN 基底比对键树。回落机制会把"英文包漏了一条"
 *    静默吞掉（vue-i18n 的缺 key 告警是 dev 条件编译，打包态被剥掉）——只有机器对账
 *    才知道 en 缺什么。约定：新增文案两语言同时落（抽取批即如此）。
 * 2. 中文残留：扫渲染层 UI 源码里注释之外的中文文本段（键 = 文件::文本段，与行号无关），
 *    对照基线 frontend/scripts/i18n-residue-baseline.json 区分"基线内待抽取"与"基线外新增"
 *    ——新建的文本不会在集成时被忘记（新增即挡，除非有意识 --accept-new 收纳）。
 *
 * 用法：
 *   node scripts/check-i18n.mjs                    # 两探针警告态（exit 0，新增残留高亮）
 *   node scripts/check-i18n.mjs --strict           # 门控态：键缺失或基线外新增 → exit 1
 *   node scripts/check-i18n.mjs keys --strict      # 只跑键对账
 *   node scripts/check-i18n.mjs residue --strict   # 只跑残留
 *   node scripts/check-i18n.mjs residue --update-baseline              # 只清理基线中已消失条目
 *   node scripts/check-i18n.mjs residue --update-baseline --accept-new # 连当前新增一并收进基线
 *
 * 范围边界：跟踪面 = 渲染层 UI 源码（.vue/.ts）；**文件级豁免统一登记 ops/exemptions.json**
 * （__tests__ / i18n 语言包 / styleguide，按 guards 名取用），行级规则（注释剥离、console.*
 * 行）是本探针机制内部规则。host 侧中文 = 调试细节（D50）、docs 中文 = 政策（docGuard 管）、
 * 插件中文 = 插件资产（D51 自译）——均不在跟踪面。基线只收不涨：--update-baseline 只删已消失
 * 条目，新增必须显式 --accept-new（有意识收纳 = 抽取批的工作底稿）。
 *
 * 运行环境：零依赖 stdlib（node >= 20）；路径一律仓库相对。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = join(scriptDir, '..')
const repoRoot = join(frontendDir, '..')
const localesDir = join(frontendDir, 'src', 'renderer', 'src', 'i18n', 'locales')
const rendererSrc = join(frontendDir, 'src', 'renderer', 'src')
const baselinePath = join(scriptDir, 'i18n-residue-baseline.json')

/** 文件级豁免单点登记于 ops/exemptions.json（path + guards + reason），按守卫名取用。 */
const EXEMPT = JSON.parse(readFileSync(join(repoRoot, 'ops', 'exemptions.json'), 'utf8'))
  .exemptions.filter((e) => e.guards.includes('check-i18n')).map((e) => e.path)
const isExempt = (rel) => EXEMPT.some((pre) => (pre.endsWith('/') ? rel.startsWith(pre) : rel === pre))

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const updateBaseline = args.includes('--update-baseline')
const acceptNew = args.includes('--accept-new')
const only = args.find((a) => a === 'keys' || a === 'residue')
const CJK = /[\u4e00-\u9fff]/

let failed = false

// ---- 探针一：键对账 ----------------------------------------------------------

function flatKeys(value, prefix = '', out = []) {
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v)) flatKeys(v, p, out)
    else out.push(p)
  }
  return out.sort()
}

function checkKeys() {
  const locales = readdirSync(localesDir).filter((f) => f.endsWith('.json'))
  const baseName = 'zh-CN.json'
  const base = new Set(flatKeys(JSON.parse(readFileSync(join(localesDir, baseName), 'utf8'))))
  let missingTotal = 0
  for (const f of locales) {
    if (f === baseName) continue
    const keys = new Set(flatKeys(JSON.parse(readFileSync(join(localesDir, f), 'utf8'))))
    const missing = [...base].filter((k) => !keys.has(k))
    const extra = [...keys].filter((k) => !base.has(k))
    if (missing.length === 0 && extra.length === 0) {
      console.log(`✓ 键对账：${f} 与 ${baseName} 键树一致（${keys.size} 键）`)
      continue
    }
    missingTotal += missing.length
    const tag = strict ? '✗' : '△'
    console.log(`${tag} 键对账：${f} 缺 ${missing.length} 键${extra.length ? ` / 多 ${extra.length} 键（基键外，疑笔误）` : ''}`)
    for (const k of missing.slice(0, 15)) console.log(`    缺 ${k}`)
    if (missing.length > 15) console.log(`    … 其余 ${missing.length - 15} 键略`)
    for (const k of extra.slice(0, 15)) console.log(`    多 ${k}`)
    console.log(`    修法：新增文案两语言同时落（zh-CN 与各 locale 同批）；en 缺翻译补 ${f}`)
  }
  if (missingTotal > 0 && strict) {
    console.error('键对账门控不过（--strict）：缺键即出厂静默回落中文')
    failed = true
  }
}

// ---- 探针二：中文残留（基线对照） ---------------------------------------------

/** fs 剪枝（node_modules/dist 不入 git，非豁免）；语义豁免走 ops/exemptions.json。 */
const SKIP_DIRS = new Set(['node_modules', 'dist'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out)
    } else if ((name.endsWith('.ts') && !name.endsWith('.d.ts')) || name.endsWith('.vue')) {
      const rel = relative(repoRoot, p).split(sep).join('/')
      if (!isExempt(rel)) out.push(p)
    }
  }
  return out
}

/** 单行提取中文文本段：剥离行注释与 console 行，字符串字面量与模板文本各取中文连续段。 */
function extractRuns(line) {
  const t = line.trim()
  if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--')) return []
  if (line.includes('console.')) return []
  const code = line.replace(/(^|[^:])\/\/.*$/, '$1') // 剥行尾 // 注释（放行 https:// 形态）
  const runs = []
  const push = (s) => {
    for (const m of s.matchAll(/[\u4e00-\u9fff][^"'`<>{}]*[\u4e00-\u9fff]|[\u4e00-\u9fff]/g)) {
      runs.push(m[0].replace(/\s+/g, ' ').trim())
    }
  }
  push(code)
  return [...new Set(runs)]
}

function scanResidue() {
  const entries = new Map() // key: relFile::text → { file, line, text }
  for (const file of walk(rendererSrc)) {
    const rel = relative(frontendDir, file).split(sep).join('/')
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const run of extractRuns(lines[i])) {
        const key = `${rel}::${run}`
        if (!entries.has(key)) entries.set(key, { file: rel, line: i + 1, text: run })
      }
    }
  }
  return entries
}

function loadBaseline() {
  if (!exists(baselinePath)) return null
  return new Set(JSON.parse(readFileSync(baselinePath, 'utf8')).entries)
}

function exists(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

function checkResidue() {
  const current = scanResidue()
  const baseline = loadBaseline()
  if (baseline == null) {
    // 首次建档：写基线 = 把当前全部残留收为"待抽取"工作底稿（须显式 --accept-new）
    if (updateBaseline) {
      if (!acceptNew) {
        console.error('✗ 首次建档拒绝：建档 = 把当前全部残留收进基线，须显式 --accept-new 确认')
        process.exit(1)
      }
      writeBaseline([...current.keys()])
      console.log(`✓ 基线建档：${current.size} 条（全部记为待抽取）`)
      return
    }
    console.log(`△ 中文残留：基线缺失——${current.size} 处全部按"新增"报告`)
    console.log('    修法：node scripts/check-i18n.mjs residue --update-baseline --accept-new（首次建档）')
    if (strict) failed = true
    return
  }
  const currentKeys = [...current.keys()]
  const newHits = currentKeys.filter((k) => !baseline.has(k))
  const gone = [...baseline].filter((k) => !current.has(k))
  const pending = currentKeys.length - newHits.length

  if (updateBaseline) {
    if (newHits.length > 0 && !acceptNew) {
      console.error(`✗ 基线更新拒绝：存在 ${newHits.length} 处基线外新增——先抽取进语言包，或 --accept-new 有意识收纳：`)
      for (const k of newHits.slice(0, 20)) console.error(`    ${k}`)
      process.exit(1)
    }
    const next = acceptNew ? currentKeys : [...baseline].filter((k) => current.has(k))
    writeBaseline(next)
    console.log(`✓ 基线更新：${next.length} 条（清掉已消失 ${gone.length}${acceptNew ? `，收纳新增 ${newHits.length}` : ''}）`)
    return
  }

  console.log(`中文残留：待抽取 ${pending} 处（基线内）· 新增 ${newHits.length} 处（基线外）`)
  for (const k of newHits.slice(0, 20)) {
    const e = current.get(k)
    console.log(`  [!] ${e.file}:${e.line}  ${e.text}`)
  }
  if (newHits.length > 20) console.log(`  … 其余 ${newHits.length - 20} 处略`)
  if (newHits.length > 0) {
    const tag = strict ? '✗' : '△'
    console.log(`${tag} 修法：抽取进语言包（zh-CN 与各 locale 同批）；确需延后 = node scripts/check-i18n.mjs residue --update-baseline --accept-new`)
    if (strict) {
      console.error('残留门控不过（--strict）：基线外新增即"集成时忘记"的情形')
      failed = true
    }
  } else {
    console.log('✓ 中文残留：无基线外新增')
  }
}

function writeBaseline(entries) {
  writeFileSync(baselinePath, `${JSON.stringify({ entries: [...entries].sort() }, null, 2)}\n`)
}

// ---- 装配 --------------------------------------------------------------------

if (only !== 'residue') checkKeys()
if (only !== 'keys') checkResidue()
if (failed) {
  console.error('—— check-i18n 门控不过 ——')
  process.exit(1)
}
console.log('—— i18n 文案机检通过 ——')
