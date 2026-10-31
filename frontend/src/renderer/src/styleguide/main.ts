/**
 * 样式基线页（`npm run style`，浏览器直开，不需要宿主）：docs/STYLE.md 的活样张。
 *
 * 结构 = 文档的镜像：Token 色板 → 字号/圆角阶梯 → 组件类名录（每个形态一段样张 + 一句用途）
 * → P6 层级语法的正反对照。本页是**开发工具**不是应用表面：允许内联 style（色板取 var()），
 * check:style 只扫 .vue，不扫这里。
 */
import '../styles/globals.css'

// 应用基线把 body 锁成应用壳（overflow hidden / 禁选中）；本页是文档页，解开。
document.body.style.overflow = 'auto'
document.body.style.userSelect = 'text'

type Block = { label: string; note?: string; body: string }

const cap = (s: string): string => `<div class="panel-label mb-1.5">${s}</div>`

function section(title: string, desc: string, blocks: Block[]): string {
  const inner = blocks
    .map(
      (b) => `<div>
        ${cap(b.label)}
        ${b.body}
        ${b.note != null ? `<p class="text-[11px] text-[var(--fg-dim)] mt-1.5">${b.note}</p>` : ''}
      </div>`
    )
    .join('')
  return `<section class="mb-10">
    <h2 class="text-[14px] font-semibold mb-1">${title}</h2>
    <p class="text-[11px] text-[var(--fg-dim)] mb-4">${desc}</p>
    <div class="space-y-5">${inner}</div>
  </section>`
}

/* ── Token 色板 ── */
const swatch = (name: string, css: string): string =>
  `<div class="w-36">
    <div class="h-10 border border-[var(--border)]" style="background:${css}"></div>
    <div class="text-[11px] mt-1">${name}</div>
    <div class="text-[11px] text-[var(--fg-dim)] font-mono" style="user-select:text">${css.replace('var(', '').replace(')', '')}</div>
  </div>`

const tokenSection = section(
  'Token · 色板',
  '唯一来源 = styles/globals.css :root。组件里禁止写死颜色（机检）——一律 var()。',
  [
    {
      label: '背景层级（P6 明度阶梯：区域层级靠这三档亮度差表达"不同的平面"）',
      body: `<div class="flex gap-3 flex-wrap">
        ${swatch('--bg', 'var(--bg)')}
        ${swatch('--bg-elev', 'var(--bg-elev)')}
        ${swatch('--bg-hover', 'var(--bg-hover)')}
      </div>`
    },
    {
      label: '边框三档（静息 / 悬浮反馈 / 发丝分隔——分节用 soft，交互用 border，反馈用 hover）',
      body: `<div class="flex gap-3 flex-wrap">
        ${swatch('--border', 'var(--border)')}
        ${swatch('--border-hover', 'var(--border-hover)')}
        ${swatch('--border-soft', 'var(--border-soft)')}
      </div>`
    },
    {
      label: '文字 / 强调 / 语义',
      body: `<div class="flex gap-3 flex-wrap">
        ${swatch('--fg', 'var(--fg)')}
        ${swatch('--fg-dim', 'var(--fg-dim)')}
        ${swatch('--accent', 'var(--accent)')}
        ${swatch('--accent-soft', 'var(--accent-soft)')}
        ${swatch('--danger', 'var(--danger)')}
        ${swatch('--warn', 'var(--warn)')}
        ${swatch('--ok', 'var(--ok)')}
      </div>`
    }
  ]
)

/* ── 阶梯 ── */
const ladderSection = section('阶梯 · 字号与轮廓', '字号白名单机检（≤10px 禁止）；全直角（D44：rounded-* 是禁区）。', [
  {
    label: '字号：11 说明与次要 · 12 正文与控件 · 13 输入与强调 · 14 空态主句 · 16 阅读面标题',
    body: `<div class="space-y-1.5">
      <div class="text-[11px] text-[var(--fg-dim)]">11 —— 说明与次要文本</div>
      <div class="text-[12px]">12 —— 正文与控件的默认字号</div>
      <div class="text-[13px] font-medium">13 —— 输入与强调</div>
      <div class="text-[14px]">14 —— 空态主句</div>
      <div class="text-[16px] font-semibold">16 —— 阅读面页题（标签主页）</div>
      <div class="wordmark text-[34px]">TagHit</div>
    </div>`
  },
  {
    label: '直角：全界面不用圆角——轮廓感来自边框与明度差，不靠圆角软化',
    body: `<div class="flex gap-3 items-end">
      <div class="w-16 h-10 bg-[var(--bg-hover)] flex items-center justify-center text-[11px] text-[var(--fg-dim)]">chip</div>
      <div class="w-16 h-10 bg-[var(--bg-hover)] border border-[var(--border)] flex items-center justify-center text-[11px] text-[var(--fg-dim)]">输入</div>
      <div class="w-16 h-10 bg-[var(--bg-elev)] border border-[var(--border)] flex items-center justify-center text-[11px] text-[var(--fg-dim)]">卡片</div>
    </div>`
  }
])

/* ── 组件词汇 ── */
const componentsSection = section(
  '组件类 · 名录样张',
  '新组件从这里拼装；样式表里没有的形态，先加类再用（P1）。',
  [
    {
      label: '.btn / .btn-primary / .icon-btn（按压 0.97 / 0.95——按住任意一个感受；reduced-motion 下取消缩放）',
      body: `<div class="flex gap-2 items-center flex-wrap">
        <button class="btn">普通按钮</button>
        <button class="btn btn-primary">主按钮</button>
        <button class="btn" disabled>禁用</button>
        <button class="icon-btn h-7 w-7" title="纯图标按钮"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>`
    },
    {
      label: '.input（focus 琥珀边；禁用降透明度）',
      body: `<div class="flex gap-2 flex-wrap max-w-lg">
        <input class="input flex-1 min-w-0" placeholder="默认（点进来看 focus）" />
        <input class="input w-40" value="带值" readonly />
        <input class="input w-40" placeholder="禁用" disabled />
      </div>`
    },
    {
      label: '.kbd 键位帽',
      body: `<div class="flex gap-1.5 items-center text-[12px]">按 <span class="kbd">Ctrl+E</span> 切换编辑模式，<span class="kbd">Ctrl+Shift+P</span> 打开命令面板</div>`
    },
    {
      label: '.chip 家族（形态即状态：四种词元形态对应四种语义）',
      body: `<div class="flex gap-1.5 flex-wrap items-center">
        <span class="chip">静态只读</span>
        <button class="chip chip--action">可点（未挂载）</button>
        <button class="chip chip--on">挂载态（琥珀 soft）</button>
        <button class="chip chip--text">去框词元（阅读态）</button>
      </div>
      <p class="text-[11px] text-[var(--fg-dim)] mt-1.5">筛选与排除以搜索框词元的形态存在，不走 chip。</p>`
    },
    {
      label: '.panel / .panel-label / .divider / .section-head（点节头看折叠）',
      body: `<div class="panel max-w-md" id="fold-demo">
        <div class="p-3">
          <div class="flex items-center justify-between mb-1">
            <div class="panel-label">连续表面上的分节：节头 → 内容 → 发丝线，不盒中盒</div>
          </div>
          <dl class="space-y-1 text-[12px]">
            <div class="flex gap-2"><dt class="w-14 shrink-0 text-[var(--fg-dim)]">常显事实</dt><dd>骨架信息永远在场</dd></div>
          </dl>
          <button class="section-head mt-2 w-full" data-open="true" id="fold-head">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
            长尾信息（可折叠）
          </button>
          <div id="fold-body" class="text-[12px] text-[var(--fg-dim)] mt-1">这一节默认收起——常显骨架，按需展开（P6 节拍折叠）。VS Code 的 OUTLINE/TIMELINE 就是这个节奏。</div>
          <div class="divider my-2.5"></div>
          <div class="text-[12px] text-[var(--fg-dim)]">发丝线分隔的下一节（.divider = --border-soft，比交互边框低一档）</div>
        </div>
      </div>`
    },
    {
      label: '.data-row / .row-actions / .cell-edit（管理表三件：悬停行显形操作；描述列点入即编辑）',
      body: `<table class="w-full max-w-lg text-[12px]"><tbody>
        <tr class="data-row"><td class="px-3 py-2 w-28">风景</td><td class="px-3 py-2"><button class="cell-edit">自然景物为主体的素材——悬停有虚线，点入编辑</button></td><td class="px-3 py-2 text-right w-24"><div class="row-actions justify-end"><button class="btn h-6 w-6 justify-center px-0" title="编辑">✎</button><button class="btn h-6 w-6 justify-center px-0" title="删除">🗑</button></div></td></tr>
        <tr class="data-row"><td class="px-3 py-2">人物</td><td class="px-3 py-2"><button class="cell-edit">—</button></td><td class="px-3 py-2 text-right"><div class="row-actions justify-end"><button class="btn h-6 w-6 justify-center px-0" title="编辑">✎</button><button class="btn h-6 w-6 justify-center px-0" title="删除">🗑</button></div></td></tr>
      </tbody></table>`
    },
    {
      label: '.segmented / .segment / .bar-track / .bar-fill（统计的分段与条带；宽度是数据走 :style）',
      body: `<div class="max-w-md space-y-3">
        <div class="segmented" role="group">
          <button class="segment segment--on">经常一起出现 <span class="tabular-nums opacity-70">12</span></button>
          <button class="segment">从未一起出现 <span class="tabular-nums opacity-70">7</span></button>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:72%"></div></div>
        <div class="flex gap-1"><div class="bar-track flex-1"><div class="bar-fill bar-fill--dim" style="width:40%"></div></div><div class="bar-track flex-1"><div class="bar-fill bar-fill--dim" style="width:85%"></div></div></div>
      </div>`
    },
    {
      label: '.error-note（唯一失败形态；✕ 钮由组件自带）',
      body: `<div class="error-note max-w-md" role="alert"><span class="min-w-0 flex-1 break-words">扫描进行中：3 个文件不可读，已跳过并计入摘要。</span><button class="icon-btn h-4 w-4 shrink-0 text-[var(--danger)]" title="关闭">✕</button></div>`
    },
    {
      label: '.wb-tabstrip / .wb-tab / .wb-tab--on / .wb-seam / .wb-edge[data-on]（工作台：槽位 tab 栈 + 槽间接缝 + 缘落点）',
      body: `<div class="max-w-md border border-[var(--border)] overflow-hidden flex">
        <div class="flex-1 min-w-0">
          <div class="wb-tabstrip">
            <div class="wb-tab wb-tab--on">预览</div>
            <div class="wb-tab">信息</div>
          </div>
          <div class="h-20 flex items-center justify-center text-[12px] text-[var(--fg-dim)]">视图填满槽位</div>
        </div>
        <div class="wb-seam w-px self-stretch"></div>
        <div class="w-28 shrink-0 relative">
          <div class="wb-edge absolute inset-2" data-on="true"></div>
          <div class="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--fg-dim)]">缘落点</div>
        </div>
      </div>`
    },
    {
      label: '.doc（渲染文档：标签主页正文的形态族——markdown-it 输出，html 关闭即转义）',
      body: `<div class="doc max-w-lg">
        <h1>风景</h1>
        <p>以自然景物为主体的素材。相关：<a href="javascript:void 0">夜景</a>、<a href="javascript:void 0">海边</a>。</p>
        <h2>收录口径</h2>
        <ul><li>主体是自然地貌</li><li>人物仅作点缀</li></ul>
        <blockquote>参考：<a href="javascript:void 0">构图手册</a></blockquote>
        <p>代码内联 <code>contentHash</code> 与代码块都走同一底色。</p>
        <pre><code>SELECT * FROM tags</code></pre>
      </div>`
    }
  ]
)

/* ── P6 层级语法：正反对照 ── */
const p6Section = section(
  'P6 层级语法 · 正反对照',
  '同样的信息，两种语法：左边盒中盒（反例），右边明度分平面 + 发丝分节（正例）。盯住"视线先落在哪、次一级信息退到哪"。',
  [
    {
      label: '反例：.panel 套 .panel，两套语法说同一层级 → 扁平',
      body: `<div class="panel max-w-md p-3">
        <div class="panel-label mb-2">右栏</div>
        <div class="panel p-2.5 mb-2"><div class="panel-label mb-1">媒体信息</div><div class="text-[12px]">8 行事实全量常驻，每行同重</div></div>
        <div class="panel p-2.5"><div class="panel-label mb-1">标签</div><div class="text-[12px]">一摊同重盒子，和主图抢戏</div></div>
      </div>
      <p class="text-[11px] text-[var(--fg-dim)] mt-1.5">每个框都在喊"我是结构"，于是没有一个框被听见。</p>`
    },
    {
      label: '正例：一整块连续表面，节头 + 发丝线分节，常显骨架 + 折叠长尾',
      body: `<div class="max-w-md border border-[var(--border)] bg-[var(--bg-elev)]">
        <div class="px-3 py-2.5">
          <div class="flex items-baseline gap-2 mb-1.5">
            <span class="text-[13px] font-medium">海边日落.jpg</span>
            <span class="text-[11px] text-[var(--fg-dim)] ml-auto">第 3 / 128 张</span>
          </div>
          <dl class="space-y-1 text-[12px]">
            <div class="flex gap-2"><dt class="w-12 shrink-0 text-[var(--fg-dim)]">类型</dt><dd>图片 · 4032×3024 · 4.2 MB</dd></div>
          </dl>
          <button class="section-head mt-2" data-open="false" onclick="this.dataset.open = this.dataset.open === 'true' ? 'false' : 'true'; const b = this.nextElementSibling as HTMLElement; b.style.display = this.dataset.open === 'true' ? 'block' : 'none'">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
            文件事实
          </button>
          <div style="display:none" class="text-[12px] text-[var(--fg-dim)] mt-1">路径 · 修改时间 · 收录时间 · 状态（长尾收进节里）</div>
          <div class="divider my-2.5"></div>
          <div class="panel-label mb-1.5">标签</div>
          <div class="flex flex-wrap gap-x-2 gap-y-1 text-[12px]">
            <span class="chip chip--text">风景</span>
            <span class="chip chip--text">海边</span>
            <span class="chip chip--text">日落</span>
            <span class="text-[11px] text-[var(--fg-dim)]">——阅读态去框化：重心让给媒体主图</span>
          </div>
        </div>
      </div>`
    }
  ]
)

document.getElementById('styleguide')!.innerHTML = `
<div class="max-w-4xl mx-auto px-8 py-10">
  <div class="flex items-center gap-3 mb-1">
    <h1 class="text-[16px] font-semibold">TagHit 样式基线</h1>
    <span class="text-[11px] text-[var(--fg-dim)]">docs/STYLE.md 的活样张 · npm run style</span>
    <button class="btn h-7 px-2 text-[11px] ml-auto" id="theme-toggle">亮 / 暗切换</button>
  </div>
  <p class="text-[12px] text-[var(--fg-dim)] mb-8">组件只挂类名（P1）；本页每个样张旁的说明即文档。改样式先改 globals.css 与 STYLE.md，本页随之更新。</p>
  ${tokenSection}
  ${ladderSection}
  ${componentsSection}
  ${p6Section}
</div>`

/* 主题切换：token 全部派生自 data-theme，切一个属性整页换装——CSS 变量驱动的现场证明 */
document.getElementById('theme-toggle')!.addEventListener('click', () => {
  const root = document.documentElement
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
})

/* 折叠演示：.section-head[data-open] 是样式表的形态契约，这里只翻属性 */
const head = document.getElementById('fold-head')
const body = document.getElementById('fold-body')
if (head != null && body != null) {
  head.addEventListener('click', () => {
    const open = head.dataset.open === 'true'
    head.dataset.open = open ? 'false' : 'true'
    body.style.display = open ? 'none' : 'block'
  })
}
