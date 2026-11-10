/**
 * codefact —— 代码事实生成器（契约形状从代码 AST 直抽，注入文档标记块；挂在 git pre-commit）
 *
 * ── 为什么 ──
 * 散文文档在没有代码事实约束时自由发挥——复述代码即漂移。本生成器把**契约的形状事实**
 * （导出类型的字段、方法签名、版本常量、端点清单）从源码 AST 直接抽出，生成进文档内的
 * 标记块：事实来自代码本身，文档与代码的结构性脱钩从这里断根。散文只写判定与意图，
 * 形状一律以生成物为准——语义与约束读源码注释（块头给了源文件路径）。
 *
 * ── 机制 ──
 * 文档中以标记对声明事实位：
 *   `<!-- codefact:begin <单元id> -->` … `<!-- codefact:end -->`
 * `gen` 把两标记间的内容整体替换为该单元的生成物；`check` 在内存中重算并与工作树比对，
 * 不一致即陈旧（代码改了而文档没重新生成）→ 非零退出（hook 模式挡提交）。
 * 门禁协同：docGuard 把一个事实块**计为 1 行**（生成物不占散文行数预算）；
 * docIndex 把事实块掩出探针（块的正确性由本守卫的 check 承担，不靠路径跟踪）。
 *
 * ── 抽取边界 ──
 * 只抽**声明形状**（接口/类型/对象字面量/字面量常量），不抽行为——闸门规则、事务语义等
 * 行为事实归散文与源码注释。类型文本按源码书写形态还原（跨文件类型不展开，读者循块头
 * 源码路径下探）；`api.*` 转发成员如实报告转发目标（形状由 ipc 单元承载）。
 *
 * ── 单元注册 ──
 * 新契约面 = 在 UNITS 加一个单元（文件 + 构建函数），文档里插标记对即可。抽取源文件
 * 豁免单点登记 ops/exemptions.json（guards 含 "codefact" 的条目 = 不参与抽取，理由随行）。
 * 运行环境：Node ESM + frontend/node_modules/typescript（仓内依赖，编译器 API）。
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require2 = createRequire(import.meta.url)
const ts = require2(join(ROOT, 'frontend', 'node_modules', 'typescript', 'lib', 'typescript.js'))

/** 抽取源豁免单点登记于 ops/exemptions.json（path + guards + reason），按守卫名取用。 */
const EXEMPT = JSON.parse(readFileSync(join(ROOT, 'ops', 'exemptions.json'), 'utf8'))
  .exemptions.filter((e) => e.guards.includes('codefact')).map((e) => e.path)
const isExempt = (p) => EXEMPT.some((pre) => (pre.endsWith('/') ? p.startsWith(pre) : p === pre))

const collapse = (t) => t.replace(/\r/g, '').replace(/\s+/g, ' ').trim()
const rel = (p) => p

/** 解析一个 TS 源文件（豁免文件返回 null） */
const parse = (file) => {
  if (isExempt(file)) return null
  const fp = join(ROOT, file)
  if (!existsSync(fp)) throw new Error(`codefact：抽取源不存在 —— ${file}`)
  return ts.createSourceFile(file, readFileSync(fp, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** 按名字找顶层声明（interface / type alias / 变量） */
const findDecl = (sf, name, kinds) => {
  let hit = null
  sf.forEachChild((n) => {
    if (hit) return
    if (kinds.includes(n.kind) && n.name && n.name.getText() === name) hit = n
  })
  return hit
}
const findInterface = (sf, name) => findDecl(sf, name, [ts.SyntaxKind.InterfaceDeclaration])
const findTypeAlias = (sf, name) => findDecl(sf, name, [ts.SyntaxKind.TypeAliasDeclaration])
const findVariable = (sf, name) => {
  let hit = null
  sf.forEachChild((n) => {
    if (hit || !ts.isVariableStatement(n)) return
    for (const d of n.declarationList.declarations) {
      if (d.name.getText() === name) hit = d
    }
  })
  return hit
}

/** 接口/类型字面量成员 → 单行事实（`name?: type`）；成员文本折叠为单行 */
const memberLines = (members, indent = '  ') =>
  members.map((m) => {
    const sig = collapse(m.getText())
    return `${indent}- \`${sig}\``
  })

/** 对象字面量成员的形状事实：转发成员报目标，带实现成员报签名 */
const objectMemberLines = (obj, indent = '  ') => {
  const out = []
  for (const p of obj.properties) {
    const name = p.name ? p.name.getText() : '?'
    if (ts.isObjectLiteralExpression(p.initializer ?? {})) {
      out.push(`${indent}- \`${name}\`：`)
      out.push(...objectMemberLines(p.initializer, indent + '  '))
    } else if ((p.initializer && ts.isPropertyAccessExpression(p.initializer)) ||
               (p.initializer && ts.isIdentifier(p.initializer))) {
      out.push(`${indent}- \`${name}\` → \`${collapse(p.initializer.getText())}\`（窄桥/内部转发）`)
    } else if (ts.isMethodDeclaration(p) || (p.initializer && ts.isArrowFunction(p.initializer)) ||
               (p.initializer && ts.isFunctionExpression(p.initializer))) {
      const fn = ts.isMethodDeclaration(p) ? p : p.initializer
      const params = fn.parameters ? collapse(fn.parameters.map((x) => x.getText()).join(', ')) : ''
      const ret = fn.type ? `: ${collapse(fn.type.getText())}` : ''
      out.push(`${indent}- \`${name}(${params})${ret}\``)
    } else if (p.initializer) {
      out.push(`${indent}- \`${name}\` = \`${collapse(p.initializer.getText())}\``)
    }
  }
  return out
}

const line = (s) => s

/* ── 单元构建 ── */

const buildHostApi = () => {
  const sf = parse('frontend/src/renderer/src/features/hostApi.ts')
  const out = []
  const ver = findVariable(sf, 'HOST_API_VERSION')
  out.push(line(`- 版本：\`HOST_API_VERSION = ${ver.initializer.getText()}\`（additive 也要升版本号，破坏性变更升 major）`))
  const obj = findVariable(sf, 'hostApi')
  const lit = ts.isAsExpression(obj.initializer) || ts.isTypeAssertionExpression(obj.initializer)
    ? obj.initializer.expression
    : obj.initializer
  out.push(line('- `hostApi` 域与方法：'))
  for (const p of lit.properties) {
    const name = p.name.getText()
    if (name === 'version') continue
    if (ts.isObjectLiteralExpression(p.initializer)) {
      out.push(line(`  - \`${name}\`：`))
      out.push(...objectMemberLines(p.initializer, '    '))
    }
  }
  return out
}

const buildCtx = () => {
  const sf = parse('frontend/src/renderer/src/features/contribution.ts')
  const out = []
  for (const name of ['ContributionPreviews', 'ContributionCommands', 'ContributionContext']) {
    const it = findInterface(sf, name)
    out.push(line(`- \`interface ${name}\`：`))
    out.push(...memberLines(it.members, '  '))
  }
  const act = findTypeAlias(sf, 'PluginActivate')
  out.push(line(`- \`${collapse(act.getText())}\``))
  return out
}

const buildManifest = () => {
  const sf = parse('frontend/src/shared/types/feature.ts')
  const out = []
  for (const name of ['MountPoint', 'FeatureSource']) {
    const t = findTypeAlias(sf, name)
    out.push(line(`- \`${collapse(t.getText())}\``))
  }
  for (const name of ['SettingOption', 'SettingSchema', 'FeatureManifest']) {
    const it = findInterface(sf, name)
    out.push(line(`- \`interface ${name}\`：`))
    out.push(...memberLines(it.members, '  '))
  }
  return out
}

const buildIpc = () => {
  const sf = parse('src/host/ipc.ts')
  const out = []
  const contracts = findInterface(sf, 'IpcContracts')
  out.push(line('- 请求/响应端点（`kind ← args → result`；信封 = `Result<T>` = Ok | Err）：'))
  for (const m of contracts.members) {
    const kind = m.name.getText()
    const args = m.type.getText().match(/args:\s*([\s\S]*?);\s*result:/)
    const result = m.type.getText().match(/result:\s*([\s\S]*)$/)
    const resText = collapse(result ? result[1] : '?').replace(/\}\s*$/, '').trim()
    out.push(line(`  - \`${kind}\` ← (${collapse(args ? args[1] : '?')}) → \`${resText}\``))
  }
  const send = findInterface(sf, 'IpcSendContracts')
  out.push(line('- 单向端点（无回程，调用前渲染层预检）：'))
  for (const m of send.members) {
    const kind = m.name.getText()
    const args = m.type.getText().match(/args:\s*([\s\S]*?);\s*result:/)
    out.push(line(`  - \`${kind}\` ← (${collapse(args ? args[1] : '?')})`))
  }
  return out
}

const buildStore = () => {
  const sf = parse('src/ports/store.ts')
  const out = []
  for (const name of ['TagsQuery', 'ItemsQuery', 'ItemWindowQuery']) {
    const it = findInterface(sf, name)
    out.push(line(`- \`interface ${name}\`（查询条件对象）：`))
    out.push(...memberLines(it.members, '  '))
  }
  for (const name of ['NewTag', 'NewWorkspace', 'NewCollection', 'NewGroup']) {
    const it = findInterface(sf, name)
    out.push(line(`- \`interface ${name}\`：`))
    out.push(...memberLines(it.members, '  '))
  }
  const store = findInterface(sf, 'Store')
  out.push(line('- `interface Store`（端口动词清单；全局约定 = 异步、实体写严格/关系写幂等/读宽松、事务不嵌套）：'))
  for (const m of store.members) out.push(line(`  - \`${collapse(m.getText())}\``))
  return out
}

const buildEntities = () => {
  const sfE = parse('src/domain/errors.ts')
  const sfT = parse('src/domain/types.ts')
  const out = []
  const code = findTypeAlias(sfE, 'DomainErrorCode')
  out.push(line(`- \`${collapse(code.getText())}\``))
  for (const name of ['Id', 'ItemStatus', 'Item', 'Workspace', 'Tag', 'Collection', 'Group', 'PathNode']) {
    const it = findInterface(sfT, name) ?? findTypeAlias(sfT, name)
    if (it.kind === ts.SyntaxKind.InterfaceDeclaration) {
      out.push(line(`- \`interface ${name}\`：`))
      out.push(...memberLines(it.members, '  '))
    } else {
      out.push(line(`- \`${collapse(it.getText())}\``))
    }
  }
  return out
}

/** 单元注册表：id → { files, build }。新契约面 = 在此登记 + 文档插标记对。 */
const UNITS = {
  hostapi: { files: ['frontend/src/renderer/src/features/hostApi.ts'], build: buildHostApi },
  ctx: { files: ['frontend/src/renderer/src/features/contribution.ts'], build: buildCtx },
  manifest: { files: ['frontend/src/shared/types/feature.ts'], build: buildManifest },
  ipc: { files: ['src/host/ipc.ts'], build: buildIpc },
  store: { files: ['src/ports/store.ts'], build: buildStore },
  entities: { files: ['src/domain/errors.ts', 'src/domain/types.ts'], build: buildEntities }
}

const unitHeader = (id) => {
  const u = UNITS[id]
  return `<!-- 生成物（codefact:${id}）：勿手改 · 源 = ${u.files.join(' , ')} · 语义与约束读源码注释 · 重生成 npm run gen:codefact -->`
}

const BEGIN_RE = /^<!--\s*codefact:begin\s+([A-Za-z0-9_-]+)\s*-->\s*$/
const END_RE = /^<!--\s*codefact:end\s*-->\s*$/

/** 对一份文档文本重算：返回 { text, stale }（stale = 与磁盘不同） */
const processDoc = (file, text) => {
  const lines = text.split('\n')
  const out = []
  let i = 0
  let stale = false
  while (i < lines.length) {
    const m = lines[i].match(BEGIN_RE)
    if (!m) {
      out.push(lines[i])
      i++
      continue
    }
    const id = m[1]
    if (!UNITS[id]) throw new Error(`codefact：未知单元 —— ${file} 声明了 codefact:${id}`)
    let j = i + 1
    while (j < lines.length && !END_RE.test(lines[j])) j++
    if (j >= lines.length) throw new Error(`codefact：事实块未闭合 —— ${file} 的 codefact:${id}`)
    const body = ['', unitHeader(id), ...UNITS[id].build(), ''].join('\n').split('\n')
    const replaced = [lines[i], ...body, lines[j]]
    const original = lines.slice(i, j + 1)
    if (original.join('\n') !== replaced.join('\n')) stale = true
    out.push(...replaced)
    i = j + 1
  }
  return { text: out.join('\n'), stale }
}

const trackedMd = () =>
  require2('node:child_process')
    .execSync('git -c core.quotepath=false ls-files -- "*.md"', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => f.endsWith('.md') && !f.startsWith('trash/'))

const docs = trackedMd().filter((f) => {
  const t = readFileSync(join(ROOT, f), 'utf8')
  return t.includes('codefact:begin')
})

const cmd = process.argv[2]

if (cmd === 'gen') {
  if (docs.length === 0) console.log('codefact gen：仓内暂无事实块标记。')
  for (const f of docs) {
    const fp = join(ROOT, f)
    const { text, stale } = processDoc(f, readFileSync(fp, 'utf8'))
    if (stale) {
      writeFileSync(fp, text)
      console.log(`codefact gen：已更新 ${f}`)
    } else {
      console.log(`codefact gen：已是最新 ${f}`)
    }
  }
  process.exit(0)
}

if (cmd === 'check' || cmd === 'hook') {
  const staleDocs = []
  for (const f of docs) {
    const { stale } = processDoc(f, readFileSync(join(ROOT, f), 'utf8'))
    if (stale) staleDocs.push(f)
  }
  if (staleDocs.length > 0) {
    console.error('codefact：以下文档的代码事实块与代码不同步（陈旧），提交被挡。\n')
    for (const f of staleDocs) console.error(`  ${f}`)
    console.error(
      `\n修法：跑 \`npm run gen:codefact\` 重新生成后随本批提交；若事实块内容需人工补充，` +
        `写进块外散文（块内是机器产物）。`
    )
    process.exit(1)
  }
  console.log(`codefact：${docs.length} 个文档的代码事实块全部与代码同步。`)
  process.exit(0)
}

console.log('用法：node ops/scripts/codefact.mjs gen|check|hook')
process.exit(2)
