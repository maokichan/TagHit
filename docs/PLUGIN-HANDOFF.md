# 插件开发交接（PLUGIN-HANDOFF）

> 插件生态首批实战（D42）的**进行中交接**：机制面已落库并逐层验证，真机封面提取有一条未收口的断线。
> 本文档随断线收口而销毁（内容并入 DECISIONS/CONTEXT 后删除）；裁决唯一来源仍是 DECISIONS。

## 一、状态一句话

垂直切片全链落库（宿主端点 → HostApi 0.2.0 → 激活契约 → dev 装载 → 插件四件），每层单独验证通过；**真机上端点从未被成功调用**——断点在「打开音频条目」到「`item.readAudioMeta` 触达宿主」之间，候选原因两条（§三），各有一条命令级判别。

## 二、已验证的事实（不必重查）

- **宿主解析模块正确**：`src/host/media/audioMeta.ts` 对夹具（mp3/flac/m4a 带封面、无封面、mp4 探针）与真实文件（`D:\Database\mix\HOUSE` 抽 7 首 mp3）全部正确提取封面与标签——解析不是断点。
- **dev 装载链健康**：vite dev server 对插件模块 200 转换正常；dev 日志无 `[plugins] 装载失败`；check:build 产物含插件 chunk；CI 全链绿。
- **断点的证据**：今日会话（userData = `taghit-dev-b93dd292`，键 = sha1("build/taghit-dev.db") 前 8 位）的 `thumbnails/` 最新文件停在 10-24（视频抓帧旧账）；库内**零**音频条目带 `previewUri` → 端点无任何成功副作用。
- **已排除**：`contentHash` 为空导致插件侧静默跳过（库内音频条目 hash 全部在）；JSON manifest 类型/alias/fs.allow（dev 与 build 双通）；better-sqlite3 ABI 已恢复 electron-v130（根目录 npm install 会打回 Node ABI——恢复法已记 CONTEXT §五）。

## 三、断点：两条候选假设（判别都在一分钟内）

1. **详情页渲染的仍是内置裸 `<audio>`（插件 provider 未生效）** → 端点自然从不被调。
   判别：打开音频条目看预览台——插件播放器是自绘控制（播放/进度条/音量），内置是浏览器原生 audio 控件条；一眼可辨。若仍是内置，查 devtools console 的 `[plugins]` 报错与 `main.ts` 装载时序。
2. **端点已被调用但失败，错误被插件侧 `fetchAudioMeta` 的 `catch(() => null)` 吞掉**（最可能 `NOT_FOUND`：被测条目的源文件已不在盘上——老测试库文件挪动过）→ 同样无副作用，且表象同为"无封面"。
   判别：给 `plugins/audio-cover-player/src/meta.ts` 的 catch 补 `console.error`（**下会话开工先做这个**，失败可见性本来就该有），重开一条目即见分晓。

顺手账：真机收口后按 TODO（ItemGrid 条）补网格卡片自动触发封面提取（视频 `requestThumbnail` 同款模式）。

## 四、测试材料约定（开发者指定）

- **只用 `D:\Database\mix\HOUSE`**（带封面、无隐私问题）；不碰开发库既有的其他音频。
- HOUSE 内每首 mp3 有 `.vdjstems` 伴生目录——挂根扫描时注意范围（建议挂 HOUSE 本身或拷样例到临时目录，不要挂 `D:\Database\mix` 上层）。

## 五、定位待决（开发者已点名）：插件定位等作品（Collection）落地后重估

- **专辑 = 有序作品成员**：专辑场景下"播放器"很可能是**作品级视图**（曲目表/连续播放，挂作品详情页或工作台 detailView 面），而不是单条目 detailPreview——当前"上一曲/下一曲归详情页翻页"的职责划分到时要重新想。
- 因此**播放器样式投入冻结**（开发者已指出样式未经对齐——这是对的，等定位拍板后与专辑场景一起做）；当前切片的价值 = 机制验证（装载/认领/激活契约/宿主原生能力/缩略图归属判据 D42），这些不随定位改变。
- 收口顺序建议：先修断线（§三）证明端到端通，再等 Collection 场景立裁决，后做播放器本体（含样式对齐）。

## 六、落库指针

- 代码 + 文档：`feat(plugins)` 提交（D42）与 `docs:` 提交（D42 入册）已进 main；版本号未动（未升版）。
- 裁决：DECISIONS D42；架构：ARCHITECTURE §二「三方激活契约」；进度：CONTEXT §三。
