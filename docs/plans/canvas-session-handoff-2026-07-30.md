# Task Packet：画布交接给 Claude（2026-07-30）

## Goal

- 在不推翻已稳定业务链路的前提下，先完成节点详情页的详细设计，再继续视频资产卡、片盒与
  最终 UI 收尾。

## Task Scene / Type

- UI redesign + canvas product workflow + QA。
- 下一阶段由 Claude 负责设计与前端落地；provider/service 变更必须单独拆任务。

## Read First

- `AGENTS.md`
- `docs/WORKFLOW.md`
- `docs/scenes/ui-page.md`
- `docs/forbidden.md`
- `docs/status.md`
- `docs/references/pages/canvas-workbench.md`
- `docs/references/pages/canvas-video-card.md`
- `docs/references/pages/canvas-node-locator.md`
- `docs/references/pages/canvas-node-detail.md`
- canvas-node-detail-redesign-2026-07.md（已删，见 git 历史）

## Source of Truth

- 画布壳与选择状态：`src/components/business/node/StudioNodeWorkbench.tsx`
- 紧凑视频编排：`src/components/business/node/composer/VideoComposer.tsx`
- 视频发送计划：`src/constants/video-model-send-plan.ts`
- 发送预览：`src/lib/node-video-send-preview.ts`
- 节点详情路由：`src/components/business/node/node-detail/NodeDetailPanel.tsx`
- 九类节点分发：`src/components/business/node/node-detail/registry.ts`
- 节点定位器：`src/components/business/node/CastDock.tsx`
- 样式：`src/app/canvas.css`

## Current Product Baseline

### 已完成，可继续沿用

1. 视频节点默认只显示名称、真实媒体和状态；固定右侧紧凑编排器负责本次生成。
2. 只有显式扩大按钮打开中央详情；双击节点和侧栏内部交互均不打开详情。
3. 「从画布选择」只连接合法现有节点；「＋」创建对应素材节点并连线。
4. 图片、视频、声音会按真实图关系进入同一发送预览；声音可经其绑定图片进入视频引用。
5. Seedance、Kling、HappyHorse、Gemini 的 UI 槽位和参数由模型能力驱动，
   不是一套通用表单硬套全部模型。
6. `fusedIntoNodeId` 只保留旧 JSON 解析兼容，运行时迁移后不再隐藏节点。
7. 左侧卡匣是所有真实节点的定位器：分组、搜索、点击定位与选中；不编辑、不新建、不删除。

### 仅为施工基线，不是最终设计

- A「对象工作室」的大尺寸半透明弹层已经有本地实现，用于装入真实内容验证结构。
- owner 只确认了方向和“外框一致、内容不同、透明、宽松、尺寸可更大”等原则。
- 九类节点的最终详情信息层级、默认态、状态反馈和操作区尚未逐项确认。
- 不得把当前 `NodeDetailPanel` 截图直接写成最终页面规范，也不得仅靠改 CSS 宣称设计完成。

## Design Intent

1. **共享框架，不共享内容**
   - 统一：标题/状态/关闭、媒体区、任务区、主操作、滚动与可访问性。
   - 专属：图片、镜头、帧、角色、背景、声音、生成视频、参考视频、视频合并各自的工作内容。
2. **紧凑态与展开态职责分离**
   - 右侧紧凑侧栏只处理一次快速生成。
   - 展开详情承担完整媒体审阅、引用诊断、模型参数、历史/复用入口。
   - 详情不维护第二份与紧凑侧栏重复的状态。
3. **透明但不虚**
   - 浅色画布上的半透明材质只服务层级；文字、边界、焦点和状态对比度必须可靠。
   - 减少小 pill、小卡片套卡片和密集分割线，优先用比例、留白和排版建立层级。
4. **尺寸宁可大，不要挤**
   - 桌面充分使用画布宽度；媒体与任务双轨之间保持固定空隙。
   - 在控件变窄前切换单列；375px 为近全屏 sheet，不照搬桌面弹窗。
5. **能力决定 UI**
   - 模型、模式、素材槽、时长、比例、分辨率、音频和 seed 均来自 capability/send plan。
   - UI 预览、禁用原因和实际 payload 必须消费同一结果。
6. **资产归档与画布编辑分开**
   - 画布负责编排和生成；片盒负责结果归档、筛选、复用、定位和进入下一轮。

## Required Detail Families

| 节点族             | 详情页必须有的独特内容                                        |
| ------------------ | ------------------------------------------------------------- |
| 散图 / 帧图 / 镜头 | 大图、来源与引用、提示词/构图/运镜、替换或生成图片            |
| 角色               | 身份图集、角色档案、声音绑定、演出引用、LoRA、生成图片        |
| 背景               | 场景图集、地点档案、镜头引用、LoRA、生成图片                  |
| 声音               | 当前声音/试听、来源、模型、音色/情绪参数、生成声音            |
| 生成视频           | 当前影片、实际发送素材、提示词、模型专属参数、诊断、生成/重试 |
| 参考视频           | 当前参考视频、来源、替换/清除和被引用关系                     |
| 视频合并           | 有序片段、合并预览、过渡/音频规则和合并动作                   |

## Recommended Serial Order

1. **详情页设计收口**
   - 先列九类节点真实字段与状态矩阵。
   - 用同一真实项目内容做 HTML 设计稿；至少桌面主态、空/失败态、375px。
   - 重点先做「生成视频」「角色」「声音」三个风险最高切片。
   - owner 逐项确认后更新 `docs/references/pages/canvas-node-detail.md`，再改 `src/**`。
2. **视频资产卡**
   - 定义完成、生成中、失败、取消、版本、来源模型和引用关系。
3. **片盒**
   - 定义归档、搜索/筛选、预览、定位原节点、加入新编排和版本链。
4. **真实 provider 验证**
   - 先最小费用验证 Seedance 参考端点，再验证 Kling 单首帧/元素能力。
5. **UI polish**
   - hover/focus/active、按钮过渡、overlay 色彩、loading/failure/cancel、
     reduced-motion、375px 和触屏键盘。

## Non-goals

- 不重新引入吞器或 `fusedIntoNodeId` 写入。
- 不让详情页承担项目导航、全节点搜索或片盒职责。
- 不在 UI 设计任务里猜 provider 参数、价格、计费或持久化契约。
- 不用重复模型图、Fal 页面截图或假进度填补未完成素材。
- 不 push `main`；push 会触发生产部署，需 owner 单独授权并过 release P0。

## Known Gaps / Risks

- ElevenLabs Music v2 已采用 ElevenLabs 官方独立品牌标识并保持 catalog 可用；
  不得回退成通用 ElevenLabs 或 provider 截图。
- 全量 typecheck 首次 184 秒超时；修复图片编辑任务图标映射缺项后，后台重跑
  exit code 0。
- 真视频请求未做扣费 smoke；没有已配置 Fal key。
- 工作区外还有 `.claude/skills/`、`scratchpad/` 与散落粘贴图片，不属于本任务，
  不得顺手入库或删除。

## Acceptance Criteria

- 详情页 page 文档明确标记 owner 已确认的每个切片和仍未决项。
- 九类节点外框一致但内容结构明显不同，图片与声音均保留生成按钮。
- 只有扩大按钮进入详情，关闭后焦点回到原节点。
- 桌面、窄桌面、375px 无横向溢出和嵌套滚动冲突。
- UI 展示的模型能力、引用数量和发送 payload 一致。
- 完整 typecheck、lint、Vitest 与相关 Playwright 有真实 exit code；未跑的检查不得写“通过”。

## Validation / Evidence So Far

- 画布核心定向 Vitest：7 files / 101 tests passed。
- provider/校验/工作流定向 Vitest：7 files / 158 tests passed。
- 相关 ESLint：0 errors / 4 existing warnings。
- 首页/LoRA/proxy/音频目录与服务定向组：9 files / 121 tests passed。
- 全量 TypeScript：`npx tsc --noEmit --pretty false` passed。
- 真实 provider smoke：未执行。

## Documentation Sync

- 每轮只更新事实归属文档。
- `docs/status.md` 覆盖更新。
- 详情设计确认后更新 `docs/references/pages/canvas-node-detail.md`。
- 本任务完成后归档或沉淀本 task packet，不能永久留在 active `plans/`。
