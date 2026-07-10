# Task Packet: 画布间改版 S5c — 浮层修缮 + 角色档案卡 + 散图融合循环

> 上游施工图：`docs/references/pages/node-canvas.md` §6（吞噬 v2）；owner 三条反馈拍板（2026-07-10）：浮层观感回退 / 角色卡要装下全部身份信息 / 散图挂画布↔入卡融合可拆分。
> 分工：Fable 出包，Sonnet 执行。S5a+S5b(B0/B1)+「暂无引用」修复均在工作区未提交（本片完成后合并 commit，执行方仍不 commit）。
> ⚠ 渲染退场架构规矩（前一修复确立）：**只准 `hidden` 标志，禁止喂 ReactFlow 空数组/过滤数组** —— `useEdges/useNodes` 消费者读渲染层 store。

## Goal

三件：① 卡匣浮层视觉修缮 ② 角色卡档案化（紧凑卡肚子徽章 + 档案面板聚合）③ 散图一等公民 + 融合/拆分循环（含本地文件拖入落散图）。

## Non-goals

- B2 增强三件套（磁吸/快投/张口预览）另片；背景卡档案化若与角色不同构则只做角色（报告说明）；不碰 assistant-ux 批文件；不动 services/api/prisma（文件上传走现有客户端直传链路）。

## Source of Truth（侦察指针）

- 数据层已齐（勿新造）：`NodeWorkflowReferenceAssetSchema`（id/url/role[identity/pose/style/composition/background]/weight/source[upload/asset/paste]，types/node-workflow.ts L89 起）· `CharacterImageReferenceControls.tsx`（图集管理 UI）· voice→character / closeup→character 边机制 · `node-detail/CharacterDetailBody.tsx`
- 上传链路：`use-image-upload.ts`（R2 直传）
- 手势引擎：`use-cast-ingest.ts` / `IngestDragLayer.tsx`（S5b 产物，融合复用同一套三拍/咬不动）
- 退场规则：StudioNodeWorkbench 的 renderedNodes（hidden 标志版）

## 一 · 浮层修缮（owner 截图四伤）

1. 卡间距恢复呼吸（gap ≥12px + 容器内边距）；2. 微倾卡不被浮层裁切（overflow/padding 放宽）；3. 高度自适应内容（仅超 `flyoutMaxHeightPx` 才滚动，消灭大片空黑）；4. 「＋新建」并入卡行末尾（同格尺寸虚线卡，不再孤行）。目标观感 = S5a 横匣时期的拍立得陈列感回归。

## 二 · 角色档案卡

1. **紧凑卡肚子徽章**：CastCard 名字下加一行「📷N ♪N」（N=referenceAssets 数 + closeup 边数；♪=voice 边有无）；零内容不显示。
2. **档案面板**：点卡打开的 CharacterDetailBody 升级为档案形态（**聚合现有能力，复用大于重造**）：
   - 视觉身份区：主图 + 参考图集网格（`CharacterImageReferenceControls` 的加/删/权重/分类能力聚合进来；吃进的 closeup 图并入陈列，标来源）；每图 hover：拆出↗ / 删除 / 权重；
   - 听觉身份区：已绑音色 chip（× 解绑，S5b 已有）+「＋绑定」（打开卡匣音色分区或 VoiceSelector 复用）；
   - 身份词条区：prompt/visualSeed 现有编辑；
   - 出演区：下游边计数 chips（S1/S3/S7），点击聚焦对应画布节点。
3. 背景卡若同构（场景图集+氛围）顺带，否则留后并说明。

## 三 · 散图与融合循环

1. **散图 = 合法稳态**：image 节点「有图、未定身份 role」不再被强制走 role picker，作为画布自由散件存在且**不参与 S5b 退场**（退场清单精确为：role=character/background 的 image[含 legacy]、voice、videoReference）。散图卡样式=简化纸卡（深窗图+文件名，无片头徽章）。
2. **本地文件拖入**：拖图片文件到画布空白处 = R2 直传（复用 use-image-upload）+ 落散图节点于落点坐标；上传中占位态、失败大声报错（现有 errors.upload i18n）。
3. **融合（散图→角色卡）**：拖散图节点、松手命中卡匣把手/浮层内角色卡（onNodeDragStop 包围盒命中检测）= 图收进该角色 referenceAssets（记 `sourceNodeId` 以便无损拆出）+ 散图节点 hidden；三拍动画/咬不动复用 ingest 引擎（把手作为热区时自动展开浮层让位）。
4. **拆出（对称无损）**：档案面板图集项「拆出↗」—— 来自散图的：移出 referenceAssets + un-hide 原节点（回画布原位）；来自上传/素材库的：移出 + 新建散图节点落画布视口中心。统一心智「拆出=落画布」。
5. referenceAssets 的 source 枚举若需新值（canvas），走 schema 默认值向后兼容（旧存档 parse 不破坏），并回写施工图。

## Allowed File Scope

- `CastDock/CastCard/IngestDragLayer/use-cast-ingest/StudioNodeWorkbench`（+tests）· `node-detail/CharacterDetailBody`（及背景同构时 BackgroundDetailBody）· `CharacterImageReferenceControls` · `nodes/ImageNode.tsx`/`ImageRolePicker`（散图稳态）· `use-image-upload` 的画布侧接线（新 hook 可建）
- `src/constants/{node-studio,node-types}.ts` · `src/types/node-workflow.ts`（仅 source 枚举增值/可选字段，向后兼容）· `globals.css` · messages 三语（castDock/ingest/dossier ns）
- 施工图 §6 回写 + §9 S5c 行新增 ✅

## Forbidden

- services/api/prisma · connection-rules · assistant-ux 批文件；⚠ 不 kill 3000、不 build、Edit/Write only、不 commit、禁任意值、禁 Math.random、**禁空数组退场**

## Acceptance / Validation

- 浮层四伤修复（截图对比）；紧凑卡徽章与档案面板聚合可用；散图可拖文件落画布、拖入卡融合三拍、档案拆出回画布、F5 后数据/隐藏态一致；旧存档加载不炸（schema 兼容）。
- 三件套全绿（lint / 全量 tsc / 全量 vitest，红线同前不 build）+ chrome 实跑取证（浮层新观感 / 档案面板 / 融合-拆出全循环帧 / 文件拖入）。
- 报告：改动清单 / 侦察结论 / 三件套 exit code / 取证 / 测试点名 / 手动验证步骤 / 偏离。上下文吃紧则按 一→二→三 顺序交付已完成部分并中期报告。

## Documentation Sync

- 施工图回写；status.md 与归档由 Fable 收尾。
