/**
 * 应用层依赖注入点：调用方（渲染层 / CLI / 校准脚本）组装各端口实现后传入用例。
 * 用例只认这里的三个端口，不感知任何适配器。
 */

import type { Clock, IdGen, Store } from '../ports/index.ts'

export interface AppServices {
  store: Store
  clock: Clock
  idGen: IdGen
}
