# Task Packet: 画布间改版 S5b — 吞噬手势（含卡匣形态 v2 前置重构）

> 上游施工图：`docs/references/pages/node-canvas.md` §6.2（形态 v2）/ §6.3（含增强三件套与 pointer 拖拽决定）/ §8（三拍动画规格）/ §9-S5b。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。S1–S4 已 commit；S5a 完成未 commit（与本片合并提交，等 owner 点头）。
> 战役最大片，分 **B0 / B1 / B2 三阶段**，每阶段可独立验收；若上下文/限额吃紧，完成 B0+B1 即交中期报告，B2 二次会话续。

## Goal

- B0 卡匣形态 v2（把手+浮层 tabs，修横向截断与双层 chrome）→ B1 吞噬核心（拖拽入腹三拍 + 咬不动 + 胃取出 + 身份节点/连线渲染退场 + 添加菜单收敛）→ B2 增强三件套（磁吸/快投/张口预览）。

## Non-goals

- 不动数据层：节点/边模型、`node-connection-rules.ts`、收割装配、autospawn、存档解析一律不改（吞噬=渲染折叠，§6.3 实现要点）。
- 不删 composer/agent 死类型（S6）；不做反向投喂/批量投喂（backlog）；不碰 assistant-ux 批文件（StudioNodeAssistantDock / AssistantConversation）。

## Read First

- 施工图 §6.2 / §6.3 / §8（动画曲线与幅度是 owner demo 手感定稿，照抄数值）/ §10；forbidden UI + CI/CD

## Source of Truth（侦察指针）

- S5a 产物：`CastDock.tsx` / `CastCard.tsx`（复用卡组件，重构容器）· `NODE_STUDIO_CAST_DOCK` 常量
- 合法性：`src/lib/node-connection-rules.ts` `canConnectNodeTypes`（吞噬合法性 = 连线合法性，1:1）
- 建边路径：workbench 的 `onConnect`/addEdge 现有实现
- 动画常量：`src/constants/motion.ts` + `globals.css @theme`（新增具名曲线放这里）
- 添加菜单：`CanvasAddMenu.tsx` + `ImageRolePicker.tsx`（role 收窄）
- 胃：`node-detail/` 各 DetailBody 的参考素材分区（取出按钮挂这里）

## B0 · 卡匣形态 v2（先做，是手势地基）

1. 把手「▤ Cast · N」并入 `CanvasBottomDock` 同一行（工具条右段，分隔线隔开；或紧贴工具条右侧同底座——按现有 dock 结构选实现小者，报告说明）。
2. 展开 = 浮层（absolute 于画布底部上方，深炭 chrome，点外收回、Esc 收回）：分区 tabs 行（角色 N/背景 N/音色 N/参考 N）+ 当前分区**网格换行**（`grid` auto-fill，永不横向截断）+ 每分区新建位；tab 记忆上次选择（内存 state 即可）。
3. 拖卡出浮层：浮层 `opacity` 降至让路档（拖拽中），投放完成/取消自动收回把手。
4. 移动端（<md）：浮层改抽屉形态（复用 ResponsiveOverlay 原语，工程量大则同浮层全宽底部呈现，报告说明）。
5. CastCard 组件本体不动（照片窗/微倾/出演 N 镜保留）；点卡=聚焦行为保留。

## B1 · 吞噬核心

1. **自定义 pointer 拖拽**（§6.3 已拍板，不用 HTML5 DnD）：pointerdown 在 CastCard 上超过阈值（~6px 位移）进入拖拽 —— portal 渲染卡片副本跟随指针（副本可施加 transform 动画）；pointerup 命中检测目标节点（elementFromPoint / ReactFlow `screenToFlowPosition` + 节点包围盒）。
2. **合法性**：`canConnectNodeTypes(sourceType, targetType, targetRole, sourceRole)` 判定；合法目标进入「可吃」集合。
3. **三拍动画**（§8 数值照抄，曲线进 `motion.ts`/`@theme` 具名常量 `--ease-ingest` / `--ease-soft-return`，禁 inline 魔法值；`prefers-reduced-motion` 降级淡入淡出）：
   - 张口：拖拽物进入目标热区 → 目标 `scale 1.08` + 石绿 outline + 倾身 1.5°（180ms）
   - 吸入：pointerup → 副本沿弧线 620ms `--ease-ingest` 飞入，飞行中 scaleX 1.18/scaleY 0.90，终点 scale 0.16 rotate 12°
   - 落定：目标 gulp 480ms overshoot + 成分栏 chip pop（340ms，0.3→1.2→1）
4. **落卡 = 建边**：复用现有 addEdge/onConnect 数据路径（幂等：同源同靶已有边则不重复建，改走「已含」提示）。
5. **咬不动**：非法/超限 → 目标红 outline + 摇头 ±4–5px ×2 + 副本软弹回（950ms `--ease-soft-return`）+ 原因气泡（i18n：类型不合 / 已含该卡 / 参考位已满 n/m——上限从模型能力契约可得则显示，不可得则只说「参考位已满」）。
6. **渲染退场**（一步到位，git revert 即回退，不加开关）：
   - 身份节点（image role=character/background 含 legacy、voice、videoReference）设 `hidden: true` 渲染折叠 —— 卡匣派生逻辑不受影响（nodes 数组仍在）；
   - 连线渲染退场：全部 edges 不渲染（ReactFlow edges hidden / 空 edgeTypes 渲染——选对存档与 autospawn 零影响的方式）；
   - 绑定的可见性由成分栏（S2）+ 卡匣「出演 N 镜」承担；
   - ⚠ 镜头图卡（image role=shot/frame）是中鱼**留在画布**，别误隐藏。
7. **胃取出**：详情面板参考素材分区每项加「取出」（删对应边 + 成分栏 chip 消失 + 卡匣计数更新）；紧凑卡成分栏 chip 点 × 同效（S2 只读升级为可解绑）。
8. **添加菜单收敛**：`CanvasAddMenu` 删 音色/参考视频 入口；`ImageRolePicker` role 收窄为 镜头/关键帧（角色/背景/特写新建走卡匣与角色卡详情）；菜单剩：图片（镜头/关键帧）/ 视频生成 / 视频合并。i18n 同步。
9. **autospawn 兼容**：助手 spawn 的身份节点出生即 hidden、绑定即成分栏（验证一次 autospawn 流程或说明验证路径）。

## B2 · 增强三件套（§6.3 拍板）

1. **磁吸**：拖拽中合法目标全部微亮（石绿 outline 弱档）；指针半径阈值内的最近目标张口加强（1.08 满档）+ 副本朝目标轻微偏移（吸附指示）。
2. **快投模式**：CastCard hover 浮出投放钮（石绿小丸；触屏长按等效）→ 进入模式：合法目标全亮 + 序号角标、已含该卡目标 ⊘ 半透明、点目标 = 该卡直投（吸入动画从卡匣把手方向起飞）、可连续点多个、Esc/点空白退出；模式中顶部浮一行提示（「投放 dania — 点击目标镜头，Esc 退出」i18n）。
3. **张口预览**：张口时目标上方浮一行迷你清单「图集×N · 音色 · @名字（参考位 n/m）」；超限整行红 + 咬不动联动。数据 = 按卡内容清点（参考图数/是否带音色/@token），目标现有成分数从边计数；契约上限可得才显示 n/m。

## Allowed File Scope

- `CastDock.tsx` / `CastCard.tsx` / `CanvasBottomDock.tsx` / `StudioNodeWorkbench.tsx` / `CanvasAddMenu.tsx` / `ImageRolePicker.tsx`（+ 各 test）
- 新建吞噬手势 hook/组件（如 `use-cast-ingest.ts` / `IngestDragLayer.tsx`，放画布域目录，遵循 hooks/ 判层）
- `node-detail/` 各 DetailBody（仅加「取出」行为）· `nodes/NodeShell.tsx`（成分栏 chip × 解绑）
- `src/constants/{node-studio,motion}.ts` · `globals.css`（具名曲线/浮层样式）· `src/messages/{zh,en,ja}.json`（castDock/ingest ns）
- 施工图 §9 S5b ✅ + 实现偏差回写

## Forbidden File Scope

- `src/lib/node-connection-rules.ts` · services/api/prisma · assistant-ux 批文件
- ⚠ 不 kill 3000、不 build、源码只用 Edit/Write、不 commit、禁 Tailwind 任意值、禁 Math.random（微倾/序号全确定性）

## Acceptance Criteria

- B0：常态底部单层 chrome（把手在工具条行）；展开浮层 tabs+网格换行，40+ 卡不截断；拖卡浮层让路。
- B1：拖卡到视频/镜头卡 = 三拍入腹 + 成分栏 chip；非法/重复 = 咬不动 + 原因气泡；身份节点与连线不再渲染（数据层完好：刷新/存档/撤销不丢）；胃与成分栏可取出；添加菜单只剩三项。
- B2：磁吸可感、快投可连点多镜、张口预览显示清单（超限红）。
- lint / 全量 tsc / 全量 vitest 绿；`prefers-reduced-motion` 降级验证。

## Validation / Evidence

- 三件套（红线同前，不 build）+ chrome 实跑取证：吞噬三拍连续截图（或帧序列）/ 咬不动 / 快投模式全亮态 / 浮层 tabs / 渲染退场前后对比（同项目连线消失、成分栏承担关系）/ 刷新后数据完好证明。
- autospawn 兼容验证或验证路径说明。
- 报告含手动验证步骤与偏离事项；B0+B1 中期报告亦可。

## Documentation Sync

- 施工图 §9 S5b ✅ + §6.2/§6.3 偏差回写；status.md 与归档由 Fable 收尾。
