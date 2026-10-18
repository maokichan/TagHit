#!/usr/bin/env node
/**
 * 样式基线机检（docs/STYLE.md §6 禁区）——grep 级断言，扫渲染层全部 .vue：
 *   1. 写死颜色（#hex / rgb( / rgba(）——颜色唯一来源是 styles/globals.css
 *   2. bg-black/*（遮罩黑度走 --overlay-* token）
 *   3. 白名单外字号 text-[10px]（阶梯：11/12/13，14+ 仅空态主句）
 *   4. uppercase / tracking-*（中文界面不做大写与拉距；字距只允许 styles.css 定义）
 *   5. 静态内联 style="（:style 几何绑定是数据不是样式词汇，放行）
 * 命中即非零退出，列明文件与行。新增禁区先改 STYLE.md 再来这里加一条。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src')

const RULES = [
  { name: '写死 hex 颜色', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: '写死 rgb/rgba', re: /\brgba?\(/ },
  { name: 'bg-black/*（用 --overlay-* token）', re: /bg-black\// },
  { name: '白名单外字号（10px）', re: /text-\[10px\]/ },
  { name: 'uppercase（中文界面不做大写）', re: /class="[^"]*\buppercase\b/ },
  { name: 'tracking-*（字距归 styles.css）', re: /class="[^"]*\btracking-/ },
  { name: '静态内联 style（几何 :style 除外）', re: /\sstyle="/ },
]

const violations = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.vue')) {
      const lines = readFileSync(p, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const { name: rule, re } of RULES) {
          if (re.test(line)) violations.push(`${p}:${i + 1}  [${rule}]  ${line.trim().slice(0, 90)}`)
        }
      })
    }
  }
}
walk(root)

if (violations.length > 0) {
  console.error(`STYLE CHECKS FAILED（${violations.length} 处）:`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('STYLE CHECKS PASSED（禁区零命中）')
