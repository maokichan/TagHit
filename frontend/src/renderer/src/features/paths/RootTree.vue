<script setup lang="ts">
/**
 * 来源根树（共用块）：停靠面板与全页呈现共用同一套行与动作，只有外层布局不同。
 * 行内动作：眼 = 可见性（Shift = 子树批量）· Focus = 只看此节点 · 垃圾桶 = 卸载来源根。
 * refs 在此解构成顶层绑定（模板自动解包）；动作一律走 pm。
 */
import { ChevronRight, Eye, EyeOff, Focus, FolderOpen, Plus, Trash2 } from 'lucide-vue-next'
import { usePathManagement } from './usePathManagement'

const pm = usePathManagement()
const { roots, expanded, scopeDirPath } = pm
</script>

<template>
  <div>
    <!-- 来源根之间用分割线分离（不用圆角容器包目录树） -->
    <div v-if="roots.length" class="divide-y divide-[var(--border)]">
      <div v-for="r in roots" :key="r.path" class="text-[12px] py-1">
        <!-- 容器头：根目录（可见性同样可切换） -->
        <div class="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[var(--bg-hover)]">
          <button
            class="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)]"
            :title="expanded.has(r.path) ? '折叠' : '展开'"
            @click="pm.toggleExpand(r.path)"
          >
            <ChevronRight :size="12" class="transition-transform" :class="{ 'rotate-90': expanded.has(r.path) }" />
          </button>
          <button
            class="shrink-0 cursor-pointer transition-colors"
            :class="pm.rootState(r.path) === 'included' ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] opacity-50'"
            :title="pm.rootState(r.path) === 'included'
              ? '已包含：根目录直接条目可见（点击排除；Shift+点击 = 含全部子目录）'
              : '已排除：根目录直接条目退出视图（点击包含；Shift+点击 = 含全部子目录）'"
            @click="pm.setState({ dirPath: r.path, state: pm.rootState(r.path) }, pm.rootState(r.path) === 'included' ? 'excluded' : 'included', $event.shiftKey)"
          >
            <Eye v-if="pm.rootState(r.path) === 'included'" :size="12" />
            <EyeOff v-else :size="12" />
          </button>
          <FolderOpen :size="13" class="shrink-0 text-[var(--accent)]" />
          <span class="truncate flex-1 font-medium cursor-pointer" :title="r.path" @click="pm.toggleExpand(r.path)">
            {{ r.path }}
          </span>
          <button
            class="shrink-0 cursor-pointer transition-colors"
            :class="pm.isScope(r.path) ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] hover:text-[var(--accent)]'"
            :title="pm.isScope(r.path) ? '退出范围（回到全部可见条目）' : '只看此节点（含其子目录；不改可见性）'"
            @click.stop="pm.toggleScope(r.path)"
          >
            <Focus :size="12" />
          </button>
          <button
            class="text-[var(--fg-dim)] hover:text-[var(--danger)] cursor-pointer shrink-0"
            title="移除来源根（条目保留，可在「已卸载」里处置）"
            @click.stop="pm.removePath(r)"
          >
            <Trash2 :size="12" />
          </button>
        </div>

        <!-- 子目录树：逐级展开；行内 = 可见性眼 + 目录名 + 只看 -->
        <div v-if="expanded.has(r.path)" class="pb-1.5">
          <div
            v-for="row in pm.rowsFor(r.path)"
            :key="row.node.dirPath"
            class="group flex items-center gap-1.5 pr-2 py-1 hover:bg-[var(--bg-hover)]"
            :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
          >
            <button
              v-if="row.node.children.length"
              class="shrink-0 flex items-center justify-center w-3.5 h-3.5 cursor-pointer text-[var(--fg-dim)] hover:text-[var(--fg)]"
              :title="expanded.has(row.node.dirPath) ? '折叠' : '展开'"
              @click="pm.toggleExpand(row.node.dirPath)"
            >
              <ChevronRight
                :size="11"
                class="transition-transform"
                :class="{ 'rotate-90': expanded.has(row.node.dirPath) }"
              />
            </button>
            <span v-else class="w-3.5 shrink-0" />
            <button
              class="shrink-0 cursor-pointer transition-colors"
              :class="row.node.state === 'included' ? 'text-[var(--accent)]' : 'text-[var(--fg-dim)] opacity-50'"
              :title="row.node.state === 'included'
                ? '已包含：直接条目可见（点击排除；Shift+点击 = 含全部子目录）'
                : '已排除：直接条目退出视图（点击包含；Shift+点击 = 含全部子目录）'"
              @click="pm.setState(row.node, row.node.state === 'included' ? 'excluded' : 'included', $event.shiftKey)"
            >
              <Eye v-if="row.node.state === 'included'" :size="12" />
              <EyeOff v-else :size="12" />
            </button>
            <span
              class="truncate flex-1"
              :class="[
                row.node.children.length ? 'cursor-pointer' : '',
                row.node.state === 'included' ? '' : 'text-[var(--fg-dim)] opacity-60 line-through'
              ]"
              :title="row.node.dirPath"
              @click="row.node.children.length && pm.toggleExpand(row.node.dirPath)"
            >
              {{ row.node.name }}
            </span>
            <button
              class="shrink-0 cursor-pointer transition-colors"
              :class="scopeDirPath === row.node.dirPath
                ? 'text-[var(--accent)]'
                : 'text-[var(--fg-dim)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)]'"
              :title="scopeDirPath === row.node.dirPath ? '退出范围（回到全部可见条目）' : '只看此节点（含其子目录；不改可见性）'"
              @click.stop="pm.toggleScope(row.node.dirPath)"
            >
              <Focus :size="11" />
            </button>
          </div>
          <div v-if="!pm.rowsFor(r.path).length" class="pl-6 pr-2 py-1 text-[11px] text-[var(--fg-dim)] opacity-70">
            无子目录（重新扫描后出现）
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-[12px] text-[var(--fg-dim)] px-1 mb-1">尚未挂载来源根</div>

    <button class="btn text-[12px] w-full justify-center mt-2" title="打开系统目录选择器" @click="pm.pickRoot">
      <Plus :size="13" />
      选择目录…
    </button>
  </div>
</template>
