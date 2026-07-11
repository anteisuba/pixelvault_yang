# Task Packet: 视频引用 V-2 主图 + V-3 管理素材面板（分两阶段）

> 上游设计：`docs/plans/node-video-reference-seedance-design.md`（§2 卡片/主图 · §3 发送规则 · §4 面板 UI · §5 改动面）。owner 拍板：主图 1 张用户指定 / token @Image1 / UI 改管理素材面板取代五分区。V-1 已 commit（`1d4384f8`，发送翻译层）。
> 分工：Fable 出包（2026-07-11），Sonnet 执行。**分两阶段，每阶段独立全绿可验收**；上下文吃紧则交付 V-2 + 中期报告，V-3 二次会话续。

## 背景（V-1 已确立，勿重复）

- Seedance 只认位置 token @Image1（V-1 发送翻译已落 `lib/node-video-prompt-translation.ts`）。
- Seedance 无风格/道具专门参数（联网核验）——一切靠 image_urls（@ImageN）+ prompt 描述。
- 卡片 = Seedance 身份槽；每身份 ≤2 图（best practice），本片主图 MVP **只送 1 张**。
- 视频详情面板 = `VideoComposer`（density='detail'）；要取代的「五分区（角色/场景/镜头/动作/旁白）」在 VideoComposer 内（DepartmentStrip / 参考槽）。

## 阶段 V-2 · 主图（primaryAssetId + 指定 UI + 发送只取主图）

1. **数据**：`NodeWorkflowReferenceAssetSchema`（types/node-workflow.ts L89）或节点 data 加**可选** `primaryAssetId?: string`（向后兼容；旧存档无此字段 = 默认取首图为主图，不炸）。定 SoT：主图是「卡/身份节点的哪张 referenceAsset 是送 Seedance 的那张」。
   - ⚠ 当前身份卡数据模型：一张身份节点只有一个 `mediaUrl`（V-1 报告 §决策3 确认）。**多图收藏是否已存在**要先侦察：若 referenceAssets 已支持一卡多图（S5c/S5d 引入），主图 = referenceAssets 里被 ★ 标记那张；若仍是一卡一图，V-2 的「指定」退化为空操作，则 V-2 缩为「加字段 + 发送读它（默认首图）」并报告，把 picker UI 留到多图真正存在时。**先侦察再定 V-2 实际改动面，别假设多图存在。**
2. **指定 UI**：若多图存在——收集器档案面板（CharacterImageReferenceControls / IdentityCollectorCard）图集项加 ★「设为主图」；主图角标常显。
3. **发送**：`StudioNodeWorkbench` 收割处（V-1 装配点附近）每身份取**主图 1 张**入 referenceImages（现状本就每身份一图，若多图则按 primaryAssetId 选）。
4. i18n 三语（★主图/设为主图）。

## 阶段 V-3 · 管理素材面板（取代五分区）+ 只送已引用

按设计 §4 逐条实现（owner 截图为准）：

1. **左侧引用条**：已引用素材横排（缩略图+名字+@token+类型+强调线+「＋」插入）。
2. **右侧「管理素材」抽屉**：`已连接 N` 全量列 + `全部/角色/场景/镜头/声音` 类型 tab + 搜索（名称或 token）+ 每行（缩略图+名字+类型+@token+状态 已引用/插入+⋮）。用现有覆层原语（ResponsivePopover/Drawer，先 grep 复用别重造）。
3. **创意指令区**：MentionInput 保留 + 底部计数「已引用 N / 已连接 N · 字数/2000」。
4. **五分区退场**：DepartmentStrip / 参考槽 由引用条 + 管理素材抽屉取代（先 grep DepartmentStrip 全部引用面，确认退场不破坏其他消费者）。
5. **只送已引用**（发送模型变更，与面板 UI 同片才不困惑用户）：parse prompt 的 @token（复用 `parseMentions`）→ 只把被 @ 引用的素材入 payload；已连接未引用 = 可选盘不发。**容量护栏**：已引用图 > 9 提示。⚠ 这是行为变更（从「送全部已连接」→「只送已引用」），需保证：无 @ 引用但有连线的老项目不静默丢——迁移策略/提示报告说明。

## 红线（同全项目）

- schema 只 additive（primaryAssetId 可选）；旧存档 parse 不炸。
- 复用大于重造：档案卡面/覆层原语/parseMentions/收割全复用。
- owner dev server 在 3000（不 kill/build/另起）；lint + 全量 tsc（后台+exit code）+ 全量 vitest；Edit/Write only；不 commit；禁任意值；禁 Math.random；i18n 三语同步。
- ⚠ 工作区有并行改动：音色封面批（inspector/VoiceDetailBody/messages）+ `@视频N` chip 会话（独立 worktree，碰 use-video-composer/video-request-builders）——**不碰音色批文件**；改 VideoComposer/use-video-composer 时注意与 @视频N 会话未来合并（不冲突处放心改，报告标注碰了哪些视频文件）。
- 首页视觉基线 fail 已知（Satoshi），与你无关。

## Allowed File Scope

- V-2：`types/node-workflow.ts`（primaryAssetId 可选字段）· `CharacterImageReferenceControls`/`IdentityCollectorCard`/`node-detail` 档案卡面（★ UI）· `StudioNodeWorkbench`（收割取主图）· messages 三语 · 相关 test
- V-3：`VideoComposer.tsx` + `DepartmentStrip.tsx`（五分区退场）+ 新管理素材面板组件 · `use-video-composer.ts`（引用集/已引用计算）· `StudioNodeWorkbench`（只送已引用）· `lib/node-video-prompt-translation.ts`（复用）· messages 三语 · test
- 两阶段：设计稿 §4/§5 回写 + §9 追加 V-2/V-3 实现记录

## Forbidden

- services/api/prisma 契约 · connection-rules · 音色封面批文件 · 吞噬/卡匣交互组件（已 commit，不回改）

## Acceptance / Validation

- V-2：primaryAssetId 加字段旧存档兼容；（多图存在则）★ 指定可用；发送每身份取主图。
- V-3：管理素材面板对齐 owner 截图（引用条+抽屉+类型tab+搜索+已引用/已连接）；五分区退场无残留；只送已引用 + 容量护栏；老项目不静默丢引用（迁移/提示）。
- 每阶段：lint / 全量 tsc / 全量 vitest 绿 + chrome 实跑取证（V-3 面板截图 / 已引用计数 / 发送请求体只含已引用）+ 手动验证步骤。
- 上下文吃紧按 V-2→V-3 交付，不压缩验证。

## Documentation Sync

- 设计稿回写；status.md 与归档由 Fable 收尾。
