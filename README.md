# TagHit

多源内容标记与管理系统：把本地文件等来源的内容收进统一标签体系，按工作区组织，通过标签与检索发现内容。

## 结构（0.2，领域先行 + 六边形）

- `src/domain/` — 领域层（纯 TS）：实体类型与规则，无存储、无 IO
- 应用层 / 端口 / 适配器 — 规划中
- 渲染层 — 旧版 Vue 前端经改造后复用（存档：`../freeze/TagHit-Electron-0.1.2`）

## 文档

- `docs/GLOSSARY.md` — 业务词汇
- `docs/DECISIONS.md` — 分层与裁决

## 开发

```bash
npm run typecheck:domain
```
