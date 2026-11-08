# src/ —— 后端核心子树入口

> 六边形分层，依赖只向内：`src/domain`（实体与关系类型 · 纯规则 · 路径规则 · 错误码；零依赖）→
> `src/ports`（端口契约，流动类型第一公民）→ `src/adapters`（memory 校准替身 · sqlite 驱动注入 · node 真文件系统）；
> `src/application` 用例编排（无状态）；`src/host` 装配与边界（typed IPC 契约单一事实源 `src/host/ipc.ts` +
> taghit-file 字节闸门 + 窗口壳）。架构权威 = [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §一；词汇 = [`docs/GLOSSARY.md`](../docs/GLOSSARY.md)；
> 全局红线在根 [`AGENTS.md`](../AGENTS.md)，不在此复读。

## 验证

```bash
node frontend/node_modules/typescript/bin/tsc -p tsconfig.<domain|ports|adapters|application|host>.json  # 分层类型检查
npm run calibrate                        # 八份校准（memory+sqlite 双跑；场景形状见 scripts/AGENTS.md）
node scripts/plugins-selfcheck.ts        # 宿主纯模块直验（不进 CI 链；插件安装位全链）
node scripts/diagnostics-selfcheck.ts    # 诊断快照直验
```

## 增量红线与环境事实

- 依赖方向只向内：domain 零依赖不做 IO；ports 不做业务判定；存储与文件系统细节不出适配器；host 只装配与边界。
- 宿主代码改动必须 `npm run bundle:host` 重打包并重启应用（渲染层改动刷新窗口即可）；产物 = `build/main.cjs` + `build/preload.cjs`。
- node 内置模块类型走自维护 ambient 声明（`src/host/nodeGlobals.d.ts` + `src/adapters/node-builtins.d.ts`）——根目录不得混入 @types/node（劫持 `node:` 前缀解析；根 `.npmrc` 的 omit=optional 挡它，勿删）。
- 根 node_modules = Electron ABI（better-sqlite3/bindings/file-uri-to-path，勿让 node v24 直接加载）：`npm install` 必带 `--ignore-scripts`；ABI 打回的恢复配方在 [`docs/CONTEXT.md`](../docs/CONTEXT.md) §五。
