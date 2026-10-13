/**
 * 详情页图片缩放的纯几何（渲染层视图状态，不落库、不进命令注册表——滚轮手势
 * 不是 KeyboardEvent，硬塞快捷键注册表得改注册表形状；交互本身自明，不加引导文案）。
 *
 * 交互基线：Ctrl+滚轮以**光标为锚**缩放（钳制 [MIN_SCALE, MAX_SCALE]），放大后
 * 拖拽平移，双击回适应窗口；**缩回 1 即平移归零**——缩小方向的终点永远是适应窗口，
 * 画面不会丢在容器外（平移因此可以不钳制）。翻页复位由调用方（详情页）负责。
 *
 * 变换模型：CSS `translate(t) scale(s)` + transform-origin 0 0，内容点 p 渲染于 t + p·s。
 */

export interface ZoomState {
  scale: number
  tx: number
  ty: number
}

/** scale 相对"适配窗口"的尺寸而言：下界 1 = 适应窗口（更小只是空白），上界 8 = 800%。 */
export const MIN_SCALE = 1
export const MAX_SCALE = 8

/** 适应窗口（恒等变换）。 */
export const FIT: ZoomState = { scale: 1, tx: 0, ty: 0 }

/**
 * 锚点缩放。anchorX/anchorY = 光标相对**渲染后**元素左上角的偏移（含当前变换，
 * 调用方用 getBoundingClientRect 取），factor = 本次增量（>1 放大，<1 缩小）。
 * 锚点下的内容点 p = (anchor − t)/s 在变换后不动：t' = t + anchor·(s − s')/s。
 * scale 钳到 [1, MAX]；落到 1（含从上方缩过头）→ 回 FIT。
 */
export function anchorZoom(prev: ZoomState, anchorX: number, anchorY: number, factor: number): ZoomState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
  if (scale === 1) return { ...FIT }
  const k = (prev.scale - scale) / prev.scale
  return { scale, tx: prev.tx + anchorX * k, ty: prev.ty + anchorY * k }
}

/** 平移（拖拽跟手）：位移叠加，scale 不变。 */
export function pan(prev: ZoomState, dx: number, dy: number): ZoomState {
  return { scale: prev.scale, tx: prev.tx + dx, ty: prev.ty + dy }
}

/** 滚轮增量 → 缩放因子：一格刻度（deltaY≈±100）≈ ×1.2，trackpad 连续增量平滑。 */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0018)
}
