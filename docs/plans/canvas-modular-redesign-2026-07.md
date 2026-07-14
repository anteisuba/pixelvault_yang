# Task Packet: 画布模块化重构总计划

> 状态：**现状调查完成，模块边界与最优施工顺序已拟定；待 owner 目验模块概念稿后启动 W0**（2026-07-13）。
> 本包是 `/studio/node` 的画布总计划；`canvas-image-edit-convergence-2026-07.md`、视频引用/合成计划、音频域计划是纵向子计划。当前只授权文档、概念与切片定义，不授权删除 `/studio/edit`、修改 provider/计费/权限契约或直接大改产品代码。

> **Execution status supersedes the planning header (2026-07-14):** I3, E1, V2, A1, AS1, and R1 are implemented on `codex/canvas-modular-redesign`; E2 remains partial and S6 awaits owner visual QA.

## Goal

- 把用户可见的“节点编辑”升级为 **画布**，让 `/studio/node` 成为图片、视频、声音和剧本编排的高级创作工作区。
- 按“横向可见模块 + 纵向功能线路”重构，先建立稳定的工作区边界，再逐条迁入图片编辑、视频生成/合成和声音绑定能力。
- 学习 Haivis 的空间纪律、低 chrome、对象近场工具和助手分栏；保留 PixelVault 的暖炭制片桌、纸卡、石绿选择、卡匣/吞噬和导演工作流，不复制通用白板外观。

## Product Position

- **Studio Image / Video / Audio**：轻量、默认、单次生成入口；适合快速得到一个结果。
- **画布**：高级编排与连续制作入口；适合复用资产、编辑派生、跨模态绑定、镜头序列和长流程。
- **独立编辑页**：能力迁移期间继续作为回归参照；六项真实图片编辑能力全部进入画布并验收后，再撤下导航和兼容跳转。
- 视频产品分工继续成立：Studio Video 是轻量短视频入口；画布承接导演台与长流程，不把两边合成一套拥挤表单。

## Why This Must Be Modular

当前 `StudioNodeWorkbench.tsx` 同时持有工作区布局、React Flow、项目切换、节点生成、上传/吞噬、结果回填、助手避让、Cast、minimap 与所有浮层。继续按功能往里面加按钮，会形成三类冲突：

1. **几何冲突**：助手可在 320–720px 之间拖宽，但顶栏不避让助手，底部控件仍按固定 448/820px 计算；每个浮层都在重复算安全区。
2. **行为冲突**：数据边仍存在且全部隐藏，底部却仍显示“连接/剪线”；连接模式没有独立行为，剪线又无法命中隐藏边。
3. **结果冲突**：现有生成多为更新当前节点的 output slot，图片编辑却必须派生新对象；没有显式结果落点策略时，业务回调会继续分叉。

因此不能按“背景改完 → 图片按钮塞进节点 → 再补视频/声音”的方式推进。先建立模块 seam，之后图片、视频、声音才能安全并行。

## Five Intake Answers

1. **精确结果**：形成一个模块边界清晰、能逐块施工的画布；最终承接图片编辑、视频导演链和必要的声音资产绑定。
2. **事实源**：`StudioNodeWorkbench`、`use-node-workflow`、React Flow store、`node-workflow` 类型/连接矩阵、各模态 generation hooks 与现有 `/studio/edit` 能力。
3. **必须不变**：旧项目可加载/保存；数据层节点与边不丢；吞噬/卡匣合法性矩阵不变；生成/计费/BYOK/provider 契约不变；Studio 轻量入口继续存在。
4. **完成证据**：每个模块有独立视觉与行为验收；三条功能线路有端到端回归；刷新、撤销、失败、三语、键盘与多视口通过。
5. **文档同步**：本总计划维护模块、依赖和状态；长期可见契约回写 `references/pages/node-canvas.md`；活跃状态只覆盖 `docs/status.md`；完成子包归档或删除。

## Read First

- `AGENTS.md`
- `CLAUDE.md`
- `docs/WORKFLOW.md`
- `docs/scenes/ui-page.md`
- `docs/brand-dna.md`
- `docs/forbidden.md`
- `docs/references/pages/node-canvas.md`
- `docs/references/ui-inspiration/haivis-canvas-2026-07.md`
- `docs/plans/canvas-image-edit-convergence-2026-07.md`
- `docs/plans/audio-domain-design-2026-07.md`
- `docs/checklists/ui.md`

## Live Baseline（2026-07-13）

在 owner 正在运行的 1247×912 `/zh/studio/node` 上实测：

- 画布表面为暖炭 `#14120f`；逻辑点阵 gap 28、size 1、默认 zoom 0.8，屏幕上约为 22.4px 间距与 0.4px 半径。
- 顶栏约 1151×81px；助手默认约 448px 宽并覆盖在全宽 React Flow 上；收起助手后 React Flow 的 DOM 宽度没有发生真实分栏变化。
- 展开的 Cast 约 487×217px，minimap 约 192×128px；顶栏、助手、Cast、minimap、节点卡都使用大圆角与同一档重投影，多个浮层竞争层级。
- 节点逻辑宽 400px，在 0.8 默认缩放下约 320px；当前页面可见 8 个节点。选中工具只有展开/删除，按钮约 28px。
- Canvas Add Menu 当前只有图片、镜头图、音色、参考视频、视频生成、视频合并六项，仍是内部节点类型导向的扁平目录。
- 所有 edge 被渲染为 hidden；数据关系继续供成分 chip、Cast 与投影逻辑使用。底部仍暴露选择、手型、连接、剪线、撤销、重做，其中连接/剪线与隐藏关系表达不一致，缩放文案也未跟随真实 zoom。
- React Flow 背景类仍带 `light`，外层画布却是 dark scope；表面 token `--node-canvas` 还被端口、媒体进度与遮罩复用，不能直接只改背景色。

详细 Haivis 实测证据见 `docs/references/ui-inspiration/haivis-canvas-2026-07.md`；本页只记录 PixelVault 的对齐基线。

## Target Architecture

```text
CanvasWorkspace
├─ WorkspaceLayout                 画布列、助手列、响应策略与共享安全区
│  ├─ CanvasStage
│  │  ├─ CanvasSurface             背景色、点阵、材质；纯视觉叶模块
│  │  ├─ CanvasViewport            平移、缩放、框选、坐标转换
│  │  ├─ CanvasObjectLayer         图片/视频/音频/编排对象呈现
│  │  ├─ CanvasOverlayHost         上下文工具、菜单、详情、拖拽 ghost
│  │  └─ CanvasChrome              顶栏、底栏、Cast、minimap
│  └─ AssistantRail                默认窄列、收起与 ScriptDoc 宽态入口
├─ CanvasProjectEngine             项目、图数据、历史、持久化
├─ CanvasSelectionModel            单选、多选、对象上下文
├─ CanvasCapabilityRuntime         能力发现、校验、运行、取消、错误
├─ CanvasResultPlacement           覆盖、派生、分层、序列与 lineage
└─ Feature Adapters
   ├─ ImageAdapter
   ├─ VideoAdapter
   ├─ AudioAdapter
   ├─ BindingAdapter
   └─ AssistantCapabilityAdapter
```

`WorkspaceLayout` 统一输出几何变量，其他模块只消费，不再各自推算助手宽度：

```text
--canvas-assistant-width
--canvas-top-inset
--canvas-bottom-inset
--canvas-safe-left
--canvas-safe-right
--canvas-tray-height
--canvas-minimap-width
```

共享的是能力生命周期，不抽一个万能 JSON 工作流。图片、视频、声音保留类型化参数与 adapter；UI 只知道“当前选择可用哪些能力”和“结果应该放哪里”，不直接知道 Fal、Seedance、Fish Audio 等实现名。

## Axis A · 用户可见模块

| ID  | 模块                | 当前问题                                                    | 目标边界                                                                              | 优先级           |
| --- | ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| W0  | WorkspaceLayout     | 所有层在同一绝对坐标系，助手改变宽度不让画布真实重排        | 桌面 `minmax(0,1fr) + 360px` 真分栏；容器不足时默认收起/overlay，移动端 drawer        | P0               |
| S1  | CanvasSurface       | 背景与端口/遮罩共用 token；section 与 React Flow 重复设底色 | 只拥有表面、点阵与背景 token；不读取选择、provider、助手或节点数量                    | P0，首个视觉模块 |
| V1  | ViewportNavigation  | 固定 80% 文案；minimap 与 Cast 手算避让                     | 真实 zoom、fit view、pan、select、minimap 共用 geometry；触屏/键盘不冲突              | P0               |
| C1  | ProjectHeader       | 81px 大浮卡压住画布并与助手相叠                             | 48–52px 紧凑工作区 header，仅占画布列；项目名左、关键动作右                           | P1               |
| O1  | ObjectFrame         | 纸卡、媒体窗和内部表单耦合；展开动作重复                    | 稳定 `NodeFrame / Preview / Composer / Status`；先保持 400px 逻辑宽                   | P1               |
| O2  | SelectionToolbar    | 只有展开/删除，28px；后续能力容易硬塞 callback              | 按 selection + capability 动态生成；桌面 32/36、触屏 44；同一时刻一套工具             | P1               |
| B1  | AddCatalog          | 六个内部类型扁平列出                                        | 按创作意图分组：添加素材、生成媒体、组织流程；不显示 provider/legacy type             | P1               |
| B2  | Relationship/Ingest | 数据边隐藏但连接/剪线仍露出                                 | 延续“吞噬取代连线”canon：默认不显示线；移除无效连接/剪线，端口只在兼容拖拽/诊断时出现 | P0               |
| B3  | CastTray            | 展开后占 217px 且浮压节点；同时像第二套节点视图             | 固定高度、可折叠的素材/身份托盘；由 shell 预留空间，保留现有拖拽协议                  | P1，高交互风险   |
| D1  | DetailWorkspace     | 详情、菜单同层级；重编辑继续堆 overlay 会失控               | 轻菜单、对象任务面板、重编辑工作区三档；统一焦点、Esc、点外与恢复                     | P1               |
| A1  | AssistantRail       | 448px 浮窗覆盖画布，320–720 调宽与避让脱节                  | 默认 360px 稳定列；低 chrome、单分隔线；收起后画布真实扩宽                            | P0               |
| F1  | StateFeedback       | 同一生成同时靠节点、toast、边动效表达；toast 可落在助手后   | 进度/失败归节点，保存归 header，拖拽拒绝跟指针，系统级失败才 toast                    | P1               |

### 模块边界硬规则

- `CanvasSurface` 是视觉叶模块：空态属于 onboarding overlay，minimap 属于 viewport chrome，选择框属于 object layer，拖拽反馈属于 ingest/overlay。
- `AssistantRail` 不是属性面板；参数仍在对象近场或 `DetailWorkspace`。ScriptDoc 是独立宽态/大工作区，不把普通助手列直接拖成 820px。
- `CastTray` 保持素材复用入口，不承担另一套对象详情；卡片数据与拖拽协议第一轮不改。
- `Relationship/Ingest` 继续保留数据层 edges 与连接合法性矩阵；视觉默认通过吞噬、成分 chip 与 Cast 表达，不恢复满屏连线。
- 任何模块不得通过复制一份 `assistantWidth` 或绝对像素避让其他模块；只能消费 `WorkspaceLayout` 提供的变量。

## First Slice · 画布背景如何改

用户提出“整个画布背景作为一个模块”是正确的，但应拆成两个连续、可单独回滚的片：

### W0-A · 结构抽取，视觉不变

- 建立 `CanvasWorkspaceShell`、`CanvasStage`、`CanvasSurface` 挂载点。
- 新增纯表面 token：`--canvas-surface`、`--canvas-grid-dot`、`--canvas-grid-gap`；旧 `--node-canvas` 暂保留给端口、进度、遮罩，避免联动换色。
- section 只负责工作区壳；React Flow `<Background>` 只消费表面 token；移除重复底色来源。
- 建立共享安全区变量，但本片不搬助手、不改生成、不改节点、不改 Cast 拖拽。
- 验收：截图逐像素允许只出现不可见 DOM/结构差异；平移、缩放、框选、拖拽、保存与刷新行为不变。

### S1-A · 背景视觉收敛

- 保留 PixelVault 暖炭基底，不改成 Haivis 纯白，也不引入蓝紫渐变、噪声纹理或发光。
- 点阵降低存在感，并在 30%–200% zoom 下保持“可定位但不抢节点”；先用同屏方案比较，再锁定 gap/contrast token。
- 背景保持一个连续平面；层级感由轻分隔线和对象状态承担，不再给背景增加 vignette 或装饰阴影。
- 本片严禁同时改纸卡、助手、Cast、minimap 和顶栏，避免无法判断视觉收益来自哪里。
- 验收：背景不接管 pointer；无摩尔纹/闪烁；深色对比不吞掉节点边界；截图覆盖空画布、稀疏、密集、30/80/100/200% zoom。

这两个片完成后，“背景”才是可长期独立治理的模块；直接在 `StudioNodeWorkbench` 或 `globals.css` 里换 `--node-canvas` 不算完成。

## Axis B · 功能线路

### I · 图片线路

```text
上传/粘贴/素材/已有结果
  → 选择单图片对象
  → 快动作（超分、去背景）
  → Prompt 动作（元素提取）
  → 重编辑（局部重绘、扩图、图层分解）
  → 新图片对象 + lineage + 进入视野
```

- 只迁六项真实能力；对象替换、风格迁移、文字/海报占位不渲染。
- 编辑是图片对象 capability，不新增“超分节点/去背景节点”。
- 所有编辑结果默认 `derive-right`，不覆盖源图；图层分解先预览选择，再 `derive-layers` 批量铺开，并作为一次 undo。
- 详细参数与迁移验收归 `canvas-image-edit-convergence-2026-07.md`。

### V · 视频线路

```text
Script → Scene → Shot
  → Character / Voice Profile / Image / Reference Video / Audio Clip
  → Video（生成对象）
  → Clip（版本/裁剪）
  → Merge（排序与长片输出）
```

- 用户只看到“视频生成/视频合成”和可理解的输入角色；`seedance` 是当前兼容实现名，不应成为长期产品类型。
- “已连接素材”和“prompt 实际引用素材”继续分开；发送时保持创作名 → `@ImageN` 的翻译、容量校验与最终模型可追溯。
- 视频重新生成使用 `update-output-slot`；生成新版本时显式建立 revision；视频合成使用 `append-sequence`，不能套用图片编辑的 `derive-right`。
- Reference Video 长期是媒体输入/资产角色，legacy node type 仅为迁移兼容；AddCatalog 不暴露内部类型名。
- 在 Workspace/Capability seam 建立前，只做现有 V1–V3 回归，不重写视频逻辑。

### A · 声音线路

- 产品语义拆成：
  - **Voice Profile**：音色身份、克隆 donor、角色听觉身份。
  - **Audio Clip**：可试听、可进入视频的语音/音效/音乐资产。
- 长期采用统一 audio object + `role`（`speech / voice-profile / sfx / music / ambience`），不为每种声音新增 node type；旧 `voice` 保持兼容迁移。
- 第一阶段只做音色选择/上传、台词 TTS、音频对象、视频绑定、波形/试听/失败/重生成。音效、音乐、播客按后续 adapter 接入。
- 不把完整 `/studio/audio` 页面搬进画布；画布消费音频服务与资产契约，Studio Audio 继续是主生成入口。

### AS · 助手线路

- 四层分离：`AssistantShell`、conversation、context resolver、capability invocation。
- Node 与 Studio Assistant 可共享 header/message/composer/reference chip 的视觉原语，但不共享 hook、消息 schema、system prompt、ScriptDoc 或写回动作。
- 助手执行图片/视频/声音动作时必须调用同一个 `CanvasCapabilityRuntime`，不能另写生成实现。
- 历史与分享只有在真实持久化、权限和只读链接契约落地后才显示；不放空按钮。

### OR · 编排线路

- Cast、吞噬、ScriptDoc、autospawn、片段排序与合成属于编排，不归属某一媒体 adapter。
- 保留 canonical 导演流：`Script → Scene → Shot → Character/Voice/Reference → Video → Clip → Merge`。
- 编排层引用媒体对象和 binding，不拥有 Fal/Seedance/Fish Audio 的调用细节。

### 已确认的契约缺口（对应线路施工前必须处理）

- **图层分解**：现有 decompose 会把图层与 PSD 落 R2，但没有统一 Generation/lineage；I3 前必须定义批量结果记录、源图关系与一次 undo 的边界。
- **视频合成**：现有 merge 会把成片落 R2，但没有统一创建 Generation；V2/导演闭环前必须补可恢复状态、最终输出记录与 lineage。
- **台词到音频**：ScriptDoc 当前会创建 voice 身份节点，但不会把每条台词文本投影为成品音频对象；A1 前必须先定义 `Dialogue → Voice Profile → Audio Clip` 契约。
- **声音消费**：当前视频图只消费 `voiceReferenceAudioUrl`，不能把 Voice Profile 的示例音频误当成已生成对白；Audio Clip 未落地前不得宣称声音导演闭环已完成。
- **音频模型筛选**：当前 voice 表面可能拿到 SFX 等不符合 Voice Profile 语义的音频模型；新增 Audio Clip 前先按角色/能力过滤，而不是扩大 voice 节点职责。
- **卡片 hydration**：`cardId` 目前主要是 schema 能力，画布里没有完整 CharacterCard hydration 工作区；模块图不得把“卡片管理已整体进入画布”写成现状。

## Capability Runtime / Result Placement

外部 UI 接口先收敛为：

```text
listFor(selection, projectContext)
open(capabilityId, target)
run(capabilityId, target, typedInput)
```

统一 runtime 处理可用性、API key、额度、重复点击、job reconcile、错误归一化、结果落点、lineage 与 undo 边界；各 adapter 自己负责类型化输入与远程调用。

能力 descriptor 必须显式声明结果策略：

| 策略                 | 用途                             |
| -------------------- | -------------------------------- |
| `update-output-slot` | 图片/视频/声音生成对象的重新生成 |
| `derive-right`       | 单图片编辑结果                   |
| `derive-layers`      | 图层分解选择后的批量对象         |
| `append-sequence`    | 视频片段与合成结果               |
| `bind-only`          | 吞噬、引用、音频绑定，不生成媒体 |

`NodeWorkflowActionsContext` 不继续加入每个图片/视频/声音动作的 callback；对象工具条只消费 capability 列表与统一 run/open。

## Delivery Order

### Implementation status (2026-07-14)

The execution slice is now in progress on `codex/canvas-modular-redesign`:

- **I3 complete**: layer decomposition returns `batchId`/`sourceGenerationId`; the canvas previews and selects layers before one-undo placement.
- **E1 complete; E2 partial**: `CanvasCapabilityRuntime` owns capability descriptors, execution, and image result placement. Image editing is migrated; some video/audio generation orchestration remains in `StudioNodeWorkbench`.
- **V2 complete**: video merge/compose persists `Generation` and returns `generationId` plus `lineage`; generated video nodes retain upstream media lineage.
- **A1 minimum contract complete**: generated speech is stored as an `Audio Clip`; video graph binding prefers the clip and only falls back to legacy Voice Profile audio.
- **AS1 first slice complete**: assistant can attach canvas image/video references and run controlled upscale/remove-background capability markers through the runtime; Studio and Canvas share the assistant shell.
- **R1 complete**: legacy edit task shells and context are deleted while `/studio/edit` remains a compatibility redirect with query migration.
- **S6 pending owner visual QA**: history is aligned inside the assistant rail; empty-state illustration, real Fish provider request, and final canvas visual acceptance remain.

```text
G0  总计划、现状基线、旧计划冲突标记
 ↓
W0  WorkspaceShell + CanvasStage + CanvasSurface seam（视觉不变）
 ↓
S1  画布背景视觉收敛
 ↓
W1  统一 geometry + 助手真分栏 + ScriptDoc 响应式宽态
 ↓
V1  Viewport/minimap/底部工具真实化；移除无效连接/剪线
 ↓
O1  NodeFrame + SelectionModel + 上下文工具条
 ↓
E1  CapabilityRuntime + ResultPlacement
 ↓
E2  把现有 image/video/audio generation 编排移出 Workbench，行为不变
 ↓
I1  超分 + 去背景
I2  元素提取
I3  局部重绘 + 扩图 + 图层分解
 ↓
V2  视频线路模块化与 V1–V3 回归
 ↓
A1  Voice Profile / Audio Clip 语义分离与最小声音线路
 ↓
AS1 助手调用 capability
 ↓
R1  撤下 /studio/edit 导航、兼容跳转、legacy type 清理、旧计划归档
```

### 并行纪律

- W0、W1、E2 完成前，图片、视频、声音三个执行者不得并行修改 `StudioNodeWorkbench.tsx`。
- seam 建立后可并行开发 adapter、详情 body 与测试，但由单一 owner 合并 selection、placement 与 Workbench 装配。
- `CastDock` 拖拽、`use-node-workflow` 持久化、连接矩阵和 ScriptDoc/autospawn 均为高风险边界；每片先核对 import 影响面并保持向后兼容。

## Concept Board Before Code

Claude/Fable 先出一张同屏模块板，不做五张孤立漂亮图。至少包含：

1. 当前态标注：顶栏、背景、节点、Cast、minimap、助手、底栏的占用与冲突。
2. W0/S1：只改工作区壳和背景后的默认态。
3. W1：助手展开/收起、ScriptDoc 宽态、Cast 展开/折叠的安全区。
4. O1：图片、视频、声音对象各自选中态，以及工具条能力如何变化。
5. I/V/A 三条线路在同一画布上的最小端到端示例。

owner 先目验空间、密度与信息优先级；未通过前不进入 W0 产品代码。

功能选择与 task packet 拆分统一使用 `docs/plans/canvas-module-function-catalog-2026-07.md` 的稳定 ID；例如首片为 `CAN-L01/L02 + CAN-S01/S02`，不再用含混的“优化画布背景”。

## Acceptance Matrix

| 模块/线路           | 必须证明                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| CanvasSurface       | 30–200% zoom 可读、不接管 pointer；换背景不影响任何生成逻辑                  |
| WorkspaceLayout     | 助手展开/收起后 React Flow 获取真实宽度；Top/Cast/Bottom/minimap 不互压      |
| Viewport            | 中键、空格、滚轮、框选、触屏按 canon；显示真实 zoom；输入框不冒泡            |
| Relationship/Ingest | 默认无连线但关系仍持久化；吞噬、成分 chip、Cast 计数与旧项目不变；无无效工具 |
| OverlayHost         | 同类临时层最多一个；Esc/点外/focus restore；重编辑不被画布裁切               |
| CapabilityRuntime   | 双击幂等；pending 可恢复；额度/API key/错误准确落在目标对象                  |
| ResultPlacement     | 图片编辑不覆盖源；图层批量一次 undo；生成对象仍按 output slot 语义           |
| 图片                | 六项真实能力逐项实跑；lineage、刷新、失败态正确                              |
| 视频                | 只送已引用；token 与实发位置一致；模型重映射、合成顺序和裁剪正确             |
| 声音                | Voice Profile 与 Audio Clip 不混；试听、TTS、视频绑定、刷新和失败恢复正确    |
| 助手                | 项目隔离、retry 不重复、上下文窗口不 400；执行走共享 capability              |
| 迁移                | en/ja/zh 旧 edit 深链不 404；源图可导入；旧项目与 `generationId` 不丢        |

## Ownership Split

- **Claude / Fable → Sonnet**：概念板、Workspace/Surface/Chrome/NodeFrame/Assistant/响应式与所有 UI 重构；按现行规则画布域由 Claude 端到端负责。
- **Codex**：CapabilityRuntime、结果落点/lineage、generation 业务抽取、路由兼容、服务/API 契约与测试；不单独改画布视觉。
- 混合片必须从本总计划再拆 task packet，写清允许文件与并行冲突。

## Non-goals

- 不在第一轮改数据库 schema、provider、模型能力、计费、权限、BYOK 或 credit。
- 不把画布改成全线可见的 ComfyUI；默认关系表达继续使用吞噬、成分 chip 与 Cast。
- 不把 Studio Image/Video/Audio 删除或合并进画布。
- 不为了统一而把图片、视频、声音压成无类型的万能节点或万能表单。
- 不在没有真实后端契约时添加历史、分享、自动模型、推理模式或占位编辑能力。
- 不在本调查轮修改 `src/**`、`prisma/**`、`.claude/**`、CI 或 git hooks。

## Allowed File Scope（本轮调查与规划）

- `docs/plans/canvas-modular-redesign-2026-07.md`
- `docs/plans/canvas-module-function-catalog-2026-07.md`
- `docs/plans/canvas-image-edit-convergence-2026-07.md`
- `docs/templates/module-function-catalog.md`
- `docs/templates/README.md`
- `docs/references/pages/node-canvas.md`
- `docs/status.md`

## Validation / Evidence

- 只读源码盘点：Workbench、NodeShell、CanvasTopBar、CanvasBottomDock、CastDock、AssistantDock、NodeDetailPanel、AddMenu、generation hooks、图类型/连接规则与图片编辑实现。
- 浏览器：复用 owner 的 3000 实例，实测 `/zh/studio/node` 布局矩形、computed color/shadow/grid、助手/顶栏/Cast 可逆收展和语义控件。
- 文档：Markdown fence 平衡、相对链接存在、`git diff --check`；本轮无产品代码，所以不运行 lint/tsc/Vitest。

## Documentation Sync

- 本文件成为画布改造的总任务包；图片编辑计划降为 I 线子包。
- `docs/references/pages/node-canvas.md` 只保留长期可见行为与不变量，并指向本包读取当前顺序。
- `docs/status.md` 覆盖为“模块调查完成、下一步先概念板与 W0/S1”，不把所有模块明细复制进去。
- W0 启动后，每完成一个片只更新状态矩阵；任务全部完成后删除/归档本包并把稳定结论沉淀到 reference。

## Source of Truth

- 当前代码：`src/components/business/node/StudioNodeWorkbench.tsx`、`src/hooks/use-node-workflow.ts`、`src/components/business/node/**`、`src/types/node-workflow.ts`、`src/constants/node-*`。
- 画布长期契约：`docs/references/pages/node-canvas.md`。
- 模块/功能选项表：`docs/plans/canvas-module-function-catalog-2026-07.md`。
- Haivis 调查证据：`docs/references/ui-inspiration/haivis-canvas-2026-07.md`。
- 图片子计划：`docs/plans/canvas-image-edit-convergence-2026-07.md`。
- 音频域事实源：`docs/plans/audio-domain-design-2026-07.md`。

## Last Verified

- Date: 2026-07-13
- Method: 对当前 `/zh/studio/node` 做 live DOM/computed-style/可逆交互核对；只读审查画布表面、助手、节点/边、Cast/ingest、图片编辑、视频引用/合成和声音域代码/计划；未发送助手消息、未触发生成、未改产品代码。
