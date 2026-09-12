/**
 * 模板解析检查：用 Vue 官方编译器逐个解析 .vue，报出**语法级**错误。
 *
 * 为什么需要它：vue-tsc 走的是语言服务的宽容解析路径，**漏报模板标签不闭合**这类错误
 * （2026-09-12 实际踩到：批量改外壳后 PluginsPanel 多出一个 `</div>`，vue-tsc 通过、
 * vite 开发服务器直接报 Invalid end tag）。本脚本就是补这个盲区的校准项。
 *
 * 用法：node scripts/check-templates.mjs（npm run check:templates）
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileTemplate } from 'vue/compiler-sfc'

const root = fileURLToPath(new URL('../src', import.meta.url))

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.name.endsWith('.vue')) yield path
  }
}

const failures = []
let checked = 0

for await (const file of walk(root)) {
  checked++
  const source = await readFile(file, 'utf8')
  const rel = relative(root, file).replaceAll('\\', '/')
  const { descriptor, errors } = parse(source, { filename: file })
  const problems = [...errors]

  if (descriptor.template?.content != null) {
    const compiled = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: rel,
      compilerOptions: { comments: false }
    })
    problems.push(...compiled.errors)
  }

  if (problems.length > 0) {
    failures.push({ rel, problems: problems.map((e) => (typeof e === 'string' ? e : e.message)) })
  }
}

if (failures.length === 0) {
  console.log(`TEMPLATE CHECKS PASSED（解析 ${checked} 个 .vue，零语法错误）`)
} else {
  for (const f of failures) {
    console.error(`✗ ${f.rel}`)
    for (const message of f.problems) console.error(`    ${message.split('\n')[0]}`)
  }
  console.error(`\n模板解析失败：${failures.length} / ${checked} 个文件`)
  process.exit(1)
}
