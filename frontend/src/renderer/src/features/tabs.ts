import router from '../router'
import { useTabStore } from '../stores/tab'

/**
 * 打开功能组件的全页呈现（壳能力，单一实现）。
 *
 * 两件事必须一起做：**标签项**（单实例）与**路由**（路由是标签的投影）。
 * 工作区上下文在**打开瞬间固化**到标签项上——切到本标签后 `activeWorkspaceId` 会变成 null
 * （活动标签不是工作区标签），全页组件若运行时去推断上下文必然拿不到
 * （2026-09-12 修的实际缺陷：从工作区打开来源根全页，却提示"先打开一个工作区"）。
 */
export function openFeatureTab(
  featureId: string,
  title: string,
  workspaceId: string | null = null
): void {
  useTabStore().openFeature(featureId, title, workspaceId)
  void router.push(`/feature/${featureId}`)
}
