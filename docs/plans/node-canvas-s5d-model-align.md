# Task Packet: 画布间改版 S5d — 业务模型 v3.1 对齐修正（六条）

> 权威依据：`docs/references/pages/node-canvas.md` **§6.0 业务模型 v3.1**（owner 逐节拍板，优先级高于 §6 其余小节与实现现状的冲突处）。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。工作区含 S5a/S5b/S5c/「暂无引用」修复未提交改动（本片后合并 commit，执行方不 commit）。

## Goal（六条修正，§6.0 末清单）

1. **卡匣回横匣**：CastDock 浮层 tabs 废弃，回横匣形态——四分区一字排开、始终展开可见、**溢出左右滑动**（整条或分区内横向滚动，实测选顺手者）、折叠把手保留（收起=零占用）；minimap 避让沿用；CastCard 组件与徽章不动。
2. **隐藏条件修正**：身份节点隐藏从「类型一律隐藏」改「**有下游引用边才隐藏**」——零引用的角色/背景/音色/参考视频卡显示在画布上；拆出到零引用时回画布（S5c 的 fusedIntoNodeId/un-hide 逻辑对齐到同一规则）。⚠ 仍然只准 hidden 标志，禁空数组。
3. **图片 upload-first + 分类系统**：
   - ImageNode 空态废「这张图做什么用（镜头/关键帧）」role picker → 直接三来源起步（上传 dropzone / 素材库 / AI 生成，全部已有组件）；图进来后可设 **名字 + 分类**。
   - 分类清单（预设 + 自定义）：在 `NODE_STUDIO_REFERENCE_ROLES`（identity/pose/style/composition/background）基础上扩充为约十类（角色参考/面部特写/服装造型/姿势/背景场景/风格/构图/道具/关键帧首/关键帧尾）+ **用户自定义标签**（schema 向后兼容：enum 扩值 + 可选 customLabel 字段，旧存档 parse 不炸）。
   - **分类进图例**：`buildShotReferenceLegend`（纯函数，允许改）把分类语义注入 @token 图例——「图N = <名字>（<分类>）」，让视频 API 理解素材用途（§6.0 拍板的分类核心目的）。
   - 原 frame role 退役为「关键帧首/尾」分类（enum 保留兼容旧存档）；seedance 收割对关键帧槽的装配改为识别分类（侦察 harvest 对 frame 的现有处理后兼容迁移）。镜头图卡（中鱼，吃卡产静帧的生成实体）保留原样，添加菜单更名区分「图片（素材）/ 镜头图（生成）」。
4. **卡片收集器 UI**：画布上可见的角色/背景卡用**档案卡面**（图集缩略网格 + ♪ 徽章 + 名字 + 词条摘要），与图片容器卡面明显两套；**空卡起步**：卡匣分区「＋新建」→ 设名 → 空收集器落画布（不再要求先有图）。
5. **融合目标改画布**：拖画布图片 → 画布上的角色/背景卡 = 融合入图集（S5b ingest 引擎命中画布节点的路径本来就有，收编 S5c 的浮层命中逻辑）；三拍动画照旧。
6. **卡匣再喂**：从横匣拖本体 → 画布目标卡 = 建引用（S5b beginDrag 起点保留），本体不动、出演计数 +1。

## 红线（同 S1–S5c 全套）

- 数据层零破坏：schema 只许向后兼容增量；收割/装配只许 `buildShotReferenceLegend` 与 frame 分类兼容处两处点名改动；渲染退场只准 hidden 标志。
- owner dev server 在 3000（不 kill/不 build/不另起）；lint + 全量 tsc（后台+exit code）+ 全量 vitest；Edit/Write only；不 commit；禁任意值；禁 Math.random；不碰 assistant-ux 批文件；messages 只动画布相关 ns（分类清单三语）。
- 上下文吃紧按 1→6 顺序交付已完成部分并中期报告，不压缩验证。

## Allowed File Scope

- `CastDock/CastCard/IngestDragLayer/use-cast-ingest/StudioNodeWorkbench/ImageNode/ImageRolePicker/LooseImageCard/NodeMediaPreview/CanvasAddMenu`（+tests）
- `node-detail/` 与 `inspector/` 画布域文件（档案卡面/分类编辑）
- `src/constants/{node-studio,node-types}.ts` · `src/types/node-workflow.ts`（兼容增量）· `src/lib/node-workflow-prompt.ts`（图例）· `globals.css` · messages 三语
- 施工图 §9 S5d 行 ✅ + §6.0 偏差回写

## Acceptance / Validation

- 六条各自可演示：横匣左右滑动不截断 / 零引用卡在画布上被吃即消失拆零即回 / 图片先上传后归类（含自定义）且图例带分类 / 空卡起步收集 / 画布融合 / 卡匣再喂计数。
- 旧存档（含 frame role 与旧 role picker 产物）加载不炸；F5 一致性。
- 三件套全绿 + chrome 实跑取证（六条各一证）+ 手动验证步骤 + 偏离事项。

## Documentation Sync

- 施工图回写；status.md 与归档由 Fable 收尾。
