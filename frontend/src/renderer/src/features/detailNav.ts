/**
 * 条目详情页的翻页动作桥（渲染层内部）。
 *
 * 为什么需要它：翻页必须是**命令**（"快捷键是命令注册表的视图"，D23）——命令在启动时
 * 统一注册、可被发现/被重新绑定；而"上一张 / 下一张"的实现在详情页里（它持有顺序窗口）。
 * 于是详情页在挂载期把两个动作登记到本桥，卸载即清空；命令处理器只调桥——
 * 没挂详情页时是空操作（这也就是它的"生效范围"判定，无需给命令加路由谓词）。
 */

export interface DetailNav {
  prev: () => void
  next: () => void
}

let current: DetailNav | null = null

/** 详情页挂载时登记；返回值 = 卸载时调用（只在自己仍是当前登记时清空）。 */
export function registerDetailNav(nav: DetailNav): () => void {
  current = nav
  return () => {
    if (current === nav) current = null
  }
}

export function detailPrev(): void {
  current?.prev()
}

export function detailNext(): void {
  current?.next()
}
