# 决策：插件分发 v1——本地导入 · zip 包 · 宿主插件协议

Status: implemented

## Problem

首插件起，装载一直是 dev 接线（硬编码清单）：三方形态被验证了，但"一个陌生人拿到一个插件怎么装上"没有答案——发现、分发、安装、卸载、装载校验全部缺席；dev 与用户走两条装载路意味着分发链路从未被真实走过，机制的欠账只在 dev 一侧被偿还；HostApi additive 演进没有兼容策略——旧插件遇新宿主会发生什么无人定义。分发 v1 要把这条链补上。整套裁决在 `docs/DECISIONS.md` D48 行压成了一行结论，论证层由本篇承载。

## Decision

开发者四项拍板：**① 分发 v1 = 本地导入先行**——管理页「安装插件」选 zip 包（远程插件源/签名后置）；**② 插件包 = 单文件 zip**（manifest.json 在包根 + 代码）；**③ 权限面 v1 = 只展示不执行**——安装确认与详情页如实呈现声明（mounts/surfaces），执行层仍是远期项；**④ 运行时装载 = 宿主开插件协议**（仿 taghit-file 先例：宿主把插件安装目录映射为渲染层可动态 import 的模块地址）——DEV_PLUGINS 手工清单退役，dev 与用户安装同一条装载路（dev 经环境变量指向仓库 `plugins/`，打包缺省 userData）。

装卸语义：安装 = 宿主收 zip 路径 → 解包校验（manifest 在场且形状合法；id 字符集门拒 `__vendor`、mounts/surfaces 白名单、zip 分发必填 version+apiVersion）→ 落位 `{userData}/plugins/<manifest.id>/`（**应用级安装位**：插件随应用走、内容数据随库走，与库文件无关）；更新 = 同 id 覆盖安装（版本对比归 UI 呈现，重装安全 = 先完整摘除 unregisterFeature 再注册）；卸载 = 删安装目录（可重装，不做回收站）+ 贡献清扫（复用停用语义）+ 清启用态。

装载链路：启动期读安装位清单 → 声明注册（面板可见、停用态保底，D43 语义不变）→ 启用者激活；装载前校验 manifest 声明的**最低 HostApi 版本**（apiVersion 段比较，超版拒绝激活并明示）。manifest additive 扩面：+version / +author / +apiVersion——zip 分发没有仓库上下文，身份事实必须自带（安装确认页与详情页展示）。

实现形状：zip 解包 = extract-zip（纯 JS，`--ignore-scripts` 防 ABI 打回；其 optionalDependencies 连带劫持 node: 前缀解析，根 `.npmrc` omit=optional 根治），红线 = 根 node_modules 不新增原生依赖；模块获取按形态分派（dev-source 走 vite 编译、bundle 走 taghit-plugin:// 协议，CSP 为该 scheme 开口）；插件共享壳 vue 运行时 = vueVendor 转发模块 + vite manualChunks 确定性命名（打包态协议直出，插件构建时重写 vue import）。

## Alternatives considered

- **保留 DEV_PLUGINS 手工清单**：输在两条装载路让分发链路永远测不到——dev 永远走不到用户安装路径，发现/安装/卸载/校验的欠账只在 dev 一侧被偿还；退役后 dev 是用户装载路的一个入口形态，一条管线，重装安全与贡献摘除也只需实现一次。
- **import map 共享 vue 运行时**：输在两处硬伤——内联 importmap script 被 CSP 拦，且当时的 Chromium 130 不支持外链 importmap；改 vueVendor 转发模块 + manualChunks 确定性命名，打包态由协议直出、插件构建期重写 import，同一目标殊途同归。
- **根 node_modules 新增原生 zip 依赖**：触红线——原生依赖要重编 Electron ABI，安装/升级即碎；取纯 JS extract-zip 并以 `.npmrc` omit=optional 防其 optionalDependencies 连带污染（@types/node 劫持 node: 前缀解析，打破宿主 ambient 声明策略）。
- **卸载进系统回收站**：输在插件是应用级可重装资源——删安装目录即可重装恢复，回收站的保护价值抵不过目录残留的脏状态；卸载的实质是贡献清扫与启用态清理，不是给目录留退路。
- **插件安装位随库走**：输在插件是应用能力不是库数据——随库走会让换库/拷库带上不属于数据的可执行内容；应用级安装位（userData）与内容数据（库文件）分属两端，与"数据层产物跟宿主走、呈现层跟插件走"判据同族的两分法。

## Consequences

所得：分发链路（导入→校验→落位→装载→卸载）第一次真实可用，dev 与用户同一条路；HostApi 兼容门（apiVersion 段比较）补上 additive 演进无兼容策略的欠账；manifest 身份事实自带，安装确认页与详情页有据可呈；装载失败有响应式错误卡如实呈现（清单/激活/超版三类）。

代价：远程插件源/签名后置（TODO 主线后续增量），zip 来源信任完全依赖用户判断；权限面只展示不执行，越权声明在 v1 无强制力；根依赖 extract-zip 带 optionalDependencies 污染史（`.npmrc` 常驻约束）；CSP 为 taghit-plugin: 开口（script-src/connect-src），模块导入受 script-src 管辖是协议方案的常驻前提。
