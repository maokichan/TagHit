# src/ —— 后端核心子树入口

> 六边形分层，依赖只向内：[src/domain](domain)（实体与关系类型 · 纯规则 · 路径规则 · 错误码；零依赖）→
> [src/ports](ports)（端口契约，流动类型第一公民）→ [src/adapters](adapters)（memory 校准替身 · sqlite 驱动注入 · node 真文件系统）；
> [src/application](application) 用例编排（无状态）；[src/host](host) 装配与边界（typed IPC 契约单一事实源 [src/host/ipc.ts](host/ipc.ts) +
> taghit-file 字节闸门 + 窗口壳）。架构权威 = [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §一；词汇 = [docs/GLOSSARY.md](../docs/GLOSSARY.md)；
> 全局红线在根层入口文档，不在此复读。

## 验证

```bash
node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json  # 分层类型检查
npm run calibrate                        # 八份校准（memory+sqlite 双跑；场景形状见 scripts/AGENTS.md）
node scripts/plugins-selfcheck.ts        # 宿主纯模块直验（不进 CI 链；插件安装位全链）
node scripts/diagnostics-selfcheck.ts    # 诊断快照直验
```

## 增量红线与环境事实

- 依赖方向只向内：domain 零依赖不做 IO；ports 不做业务判定；存储与文件系统细节不出适配器；host 只装配与边界。
- **领域判定单一来源**：能在 JS 里判定的（标签名比较键 tagKey = trim + 小写、自环、排列、名称三大件）
  一律调领域函数，两个适配器同源；只能在存储侧判定的（唯一索引、路径段匹配进 SQL）由适配器做
  **等价译文**并在译文处注明对应领域函数。边界归一由应用层 `input.normalizeName` 承担，领域不另设。
- **路径归一化只在边界执行**：反斜杠→正斜杠、去尾分隔符、解析 `.`/`..`——更早写入的非归一形态
  是历史数据边界，不得在领域/适配器内再造第二处归一（否则同文件双身份）。
- 宿主代码改动必须 `npm run bundle:host` 重打包并重启应用（渲染层改动刷新窗口即可）；产物 = `build/main.cjs` + `build/preload.cjs`。
- node 内置模块类型走自维护 ambient 声明（[src/host/nodeGlobals.d.ts](host/nodeGlobals.d.ts) + [src/adapters/node-builtins.d.ts](adapters/node-builtins.d.ts)）——根目录不得混入 @types/node（劫持 `node:` 前缀解析；根 `.npmrc` 的 omit=optional 挡它，勿删）。
- 根 node_modules = Electron ABI（better-sqlite3/bindings/file-uri-to-path，勿让 node v24 直接加载）：
  `npm install` 必带 `--ignore-scripts`（任何 install/rebuild 都会把 better-sqlite3 打回 Node ABI）；
  恢复配方 = 在 `node_modules/better-sqlite3` 内跑 `npx prebuild-install --runtime=electron --target=<electron 版本>`
  （prebuild 缓存通常命中），再重启应用。宿主启动报 NODE_MODULE_VERSION 不匹配即此症。
- 开发态 userData 按库隔离（TAGHIT_DB 指定开发库时 userData 随行），同库双开由单实例锁拒绝。
