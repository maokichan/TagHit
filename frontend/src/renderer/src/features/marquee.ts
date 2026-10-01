/**
 * 框选（拖拽多选）—— 纯几何 + 一次 DOM 读，**规则与渲染分家**：
 * 本文件不含手势状态、不碰 store，故能被 Vitest 直接跑（D30：渲染层的纯规则必须可测）。
 *
 * 坐标系是**视口坐标**（`clientX/clientY` 与 `getBoundingClientRect`），不是内容坐标：
 * 网格有滚动、有虚拟化、三种布局的定位算法各不相同（瀑布流是 JS 绝对定位，网格/列表是行），
 * 而"这一下框住了哪几张"只取决于**屏幕上此刻真在哪儿**。取内容坐标就得把三套布局的
 * 内边距/滚动/虚拟化偏差全部重算一遍——那是把布局算法抄第二份，必然漂移。
 *
 * 已知边界：只命中**已渲染**的卡片（虚拟化之外的按定义不在屏幕上），且本切片不做
 * 拖到边缘自动滚动——两者都在 TODO 里记着。
 */

/** 矩形（视口坐标，w/h 恒非负）。 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 卡片在屏幕上的位置：id 来自 `data-ctx-id`（与右键菜单/拖拽同一份 DOM 契约）。 */
export interface CardRect {
  id: string
  rect: Rect
}

/** 两点之间归一化成矩形（反向拖也得到正矩形）。 */
export function rectBetween(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0)
  }
}

/** 两矩形是否相交（边贴边算相交——用户看到"框住了"就是框住了）。 */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

/** 命中集合：与框选矩形相交的卡片 id（按传入顺序，调用方据此保持视图顺序）。 */
export function hitIds(marquee: Rect, cards: readonly CardRect[]): string[] {
  return cards.filter((c) => intersects(marquee, c.rect)).map((c) => c.id)
}

/**
 * 是否已构成一次拖拽（超过阈值才算框选）。
 * 阈值存在的理由：裸点击要仍是"点空白清空选择"，手抖 1~2px 不该变成一次框选。
 */
export function isDragGesture(dx: number, dy: number, threshold = 4): boolean {
  return Math.abs(dx) >= threshold || Math.abs(dy) >= threshold
}

/**
 * 读取容器内全部卡片的位置（唯一碰 DOM 的函数，其余都是纯函数）。
 * 只认声明了 `data-ctx-id` 的元素：与右键菜单共享同一份上下文契约，
 * 于是"哪些东西是可框选对象"永远不会两处各写一份。
 */
export function collectCardRects(container: ParentNode): CardRect[] {
  const out: CardRect[] = []
  for (const el of container.querySelectorAll<HTMLElement>('[data-ctx-id]')) {
    const id = el.dataset.ctxId
    if (id == null || id === '') continue
    const r = el.getBoundingClientRect()
    out.push({ id, rect: { x: r.left, y: r.top, w: r.width, h: r.height } })
  }
  return out
}
