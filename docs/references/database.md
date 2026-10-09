# Database 参考 — Prisma 域模型边界与迁移纪律（现状事实）

> 定位：数据库现状事实与操作纪律。栈 = Prisma 7 + PostgreSQL（Neon）。红线见 `forbidden.md` 数据库节；检查项见 `checklists/database.md`。

## 访问规则（谁能碰数据库）

- **只有 `src/services/` 层能碰 Prisma**；API route 禁止直接查询（backend.md 分层）。
- Client 从 `src/lib/db.ts` 取；查询作用域辅助在 `src/lib/db-scope.ts`。
- 生成的 client 在 `src/lib/generated/prisma/`——**永远不要手改**。
- ownership（userId 归属）与 credit 计算只在服务端。

## 域模型地图（40 模型 + 14 枚举，2026-07-23 对照 schema 清点；2026-09-18 +`GenerationLayer`；2026-09-20 +`AssistantMemory` 与它的两个枚举）

| 域          | 模型                                                                                                                                                                                                                            | 备注                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份        | `User`                                                                                                                                                                                                                          | `clerkId` 映射外部身份；JIT 建档走 `ensureUser`                                                                                                                                                                                                                                                                                                                      |
| 组织        | `Project`（`parentId` 层级）· `NodeWorkflowProject` · `Collection` / `CollectionItem`                                                                                                                                           | 普通 Project 与画布项目**分离**；Project 删除不删作品                                                                                                                                                                                                                                                                                                                |
| 生成核心    | **`Generation`**（全模态统一资产记录，schema 中最大模型）· `GenerationLayer`（Seedream 5.0 Pro 图层拆分的 z_index ≥ 1 图层，底图仍是 Generation 本身）· `GenerationJob` · `ExecutionOutbox` · `ApiUsageLedger` · `FreeTierSlot` | 异步执行骨架；Comfy runner 复用；`GenerationSourceSurface` 记来源面；图层与 Generation 同事务写入，migration `20260918120000_generation_layers`；`Generation.searchGrounded`（出图时开了 Google 搜索落地 → 按条款不能公开，默认 false 不回填，migration `20261007210000_generation_search_grounded`；搜到的来源 ⛔ 不落库，只在 `GenerationJob` 上暂放到发起者取走） |
| BYOK        | `UserApiKey`                                                                                                                                                                                                                    | 加密存储 + masking；显式 keyId 不 fallback                                                                                                                                                                                                                                                                                                                           |
| 卡片        | `CharacterCard` · `GenerationCharacterCard`（join）· `BackgroundCard` · `StyleCard` · `CardRecipe` · `VoiceCard`                                                                                                                | 可复用创作上下文层                                                                                                                                                                                                                                                                                                                                                   |
| 配方/提示词 | `Recipe`（`visibility=PUBLIC` 即共享库）· `InspirationPrompt` · `ExtractedElement` · `ImageAnalysis` · `UserCreativePreference`                                                                                                 |                                                                                                                                                                                                                                                                                                                                                                      |
| 社交        | `UserLike` · `UserFollow`                                                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                      |
| 模型配置    | `ModelConfig`                                                                                                                                                                                                                   | DB-first 覆盖目录条目；竞技场三表 2026-09-17 随 Arena 整删                                                                                                                                                                                                                                                                                                           |
| 视频        | `VideoPipeline` / `VideoPipelineClip` · `VideoScript` / `VideoScriptScene`                                                                                                                                                      | 两代视频系统并存（收敛中；旧 archive 路线图已删 2026-08-07，见 git 历史）；故事板两表 2026-09-29 随故事板整删                                                                                                                                                                                                                                                        |
| 助手        | `AssistantMemory`（助手记住的一行字，56a）                                                                                                                                                                                      | 见下「助手记忆」一节；与 `ContextCard` 是两件事，⛔ 无桥                                                                                                                                                                                                                                                                                                             |
| LoRA        | `LoraAsset` · `LoraTrainingJob`                                                                                                                                                                                                 | Civitai 来源字段 2026-06-08 迁移加入                                                                                                                                                                                                                                                                                                                                 |

核心执行枚举包括 OutputType · GenerationStatus · GenerationSourceSurface · GenerationJobStatus · ExecutionOutboxStatus；其余枚举直接以 `schema.prisma` 为准。

## 助手记忆 `AssistantMemory`（2026-09-20 · 进度表 56a）

一条 = **一行字**：`text` 就是进系统提示的那一行。助手记的在**每轮结账**（或 `add_project_rule` 的普通规矩）时写，你写的在 `/settings/assistant` 的记忆页写；两种都能在那里改 / 删。

| 列                             | 说明                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `scope`                        | `AssistantMemoryScope`：IMAGE · TAGS · VIDEO · CANVAS · LORA · CARDS · GLOBAL                                  |
| `kind`                         | `AssistantMemoryKind`：PREFERENCE · FACT · RULE（只影响提示措辞）                                              |
| `text`                         | `@db.Text`，收窄在 `ASSISTANT_MEMORY_LIMITS.maxTextChars`                                                      |
| `conversationId` / `messageId` | 溯源，**库里存着但界面不画**；⛔ 无 FK（会话删了记忆还在）                                                     |
| `lastUsedAt`                   | 被注入过就更新；**注入优先级与淘汰顺序都读它**                                                                 |
| `source`                       | `AssistantMemorySource`：ASSISTANT · CREATOR（记忆页「助手记的 / 你写的」，2026-09-26 加列，默认 ASSISTANT）   |
| `projectId`                    | 可空，FK → `NodeWorkflowProject`（`onDelete: Cascade`）。只属于一个画布项目的那条；空 = 不归项目（2026-10-09） |

- 四条索引：`(userId, scope, updatedAt desc)` 总览列表按域筛 · `(userId, updatedAt desc)` 总览「全部」· `(userId, scope, lastUsedAt desc)` 注入取前 N / 淘汰取最旧 · `(userId, projectId, lastUsedAt desc)` 画布按项目注入。
- **一个项目一份记忆**（owner 2026-10-09）：画布上结账记下的（和 `add_project_rule` 记在画布范围的）一律带当前项目；画布注入 = 全局 + 不归项目的画布条（记忆页「所有画布」）+ 本项目，⛔ 别的项目一条都不带。项目号对不上这个用户时画布那条**不写**，⛔ 不退成所有画布。记忆页里换范围（含选「所有画布」）就清掉 `projectId`。迁移 `20261009150000_assistant_memory_project` 加列 + 把历史上助手在画布会话里记的那几条按会话的项目回填，2026-10-09 经 owner 授权已对共用库执行（回填 1 行）。
- **每域上限 200（只数助手记的）**，超了按 `lastUsedAt` 最旧的静默删（服务端 `evictOldestAssistantMemories`）；**你写的**最多 50 条、⛔ 不淘汰，满了拒。
- 旧「项目规则」的普通规则（`ProjectRule.kind = NOTE`）由 `20260926210000_rules_into_memory` 搬进这张表（原 id / 原时间，类别 RULE，来源照搬，`scope` 为空或不在词表里的进 GLOBAL，超 200 字截断），随下一次生产构建执行。之后 `ProjectRule` 只装来源白 / 黑名单（`SOURCE_ALLOW` / `SOURCE_DENY`）；`NOTE` 这一枚举值暂留、无读写方。
- 删除即真删，⛔ 无软删。`onDelete: Cascade` 挂在 `User` 上。
- ⚠ 迁移 `20260920120000_assistant_memory` 只写了文件，**owner 自己跑**——仓里另有两条未应用的迁移，一并留给 push。

## 助手工作区归属（2026-10-04，无结构变更）

工作区（`image-natural` / `image-tags` / `video` / `lora` / `cards` / `canvas:<projectId>`）是**请求字段与客户端线程范围**，⛔ 不是库里的列：不加 `workspaceKey`、不加枚举值、不需要迁移。历史上 `20260920`—`20261001` 那一版曾把它做成三表各一列，从未应用到任何库，运行时报 `column "workspaceKey" does not exist`，已整体撤回。

- **会话**：`surface` + `projectId` 已能圈出视频 / LoRA / 角色页 / 画布（`NODE_CANVAS` 带项目号）。只有图片台一个 `IMAGE_STUDIO` 装两台工作台，那一台靠**首条消息上的 `workspaceKey` 戳**（服务端在保存时盖，列表用 `messages->0->>'workspaceKey'` 过滤）：戳着 `image-tags` 的归标签台，其余（含两台分开之前没有戳的旧会话）一律归自然语言台（owner 2026-10-04）。没有项目号的画布会话归不到任何一块画布，不进任何列表。派生规则只有一处：`assistantWorkspaceKeyOfRow`（`src/lib/assistant-workspace.ts`）。
- **记忆 / 规矩**：按域存（`AssistantMemoryScope` = `IMAGE` / `VIDEO` / `CANVAS` / `LORA` / `GLOBAL`；`ProjectRule.scope` 同理）。自然语言台与标签台同属 `image`、共用一份；角色页没有自己的域，落 `GLOBAL`。
- 存量一行不动：不回填、不删行。

## 助手人设 `AssistantPersona`（助手设置 B · 2026-09-26 增列）

一个用户一行（缺行 = 默认值，⛔ 不自动建行）。本轮新增四列，全部可空或带默认值，迁移 `20260926200000_assistant_settings_b` 经 owner 授权已对共用库执行：

| 列                  | 说明                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `avatarChoice`      | 头像单选表：character / upload / mark / monogram；NULL = 老行，读时按「传过图用图，否则用预设」回推 |
| `nameFromCharacter` | 名字跟着角色走；开着时服务端不写 `name`（自己的名字一直留在库里）                                   |
| `toneFromCharacter` | 语气跟着角色设定里的 `persona.speech` 走；角色没写说话方式时不生效                                  |
| `memoryCapture`     | 「让助手记住」（默认开）；关 = 不再记新的（每轮结账与 `add_project_rule` 的普通规矩都不写）         |

`reasoningEffort`（默认 `medium`，Low / Medium / High 三档）由 `20261010120000_assistant_reasoning_effort` 加入，owner 授权后已对共用库执行；读时不在名单里的值按默认处理。

`characterCardId`（→ `CharacterCard`，`onDelete: SetNull`）由 `20260926120000_card_assistant` 加入；卡删了只清绑定，读的那一跳当没用角色。

## 迁移纪律

1. 操作流程与授权统一见 `docs/scenes/db-migration.md`；不在生产或未确认隔离的连接运行 `migrate dev`（含 create-only）。已有环境记录不是本轮连接核验；不自动生成迁移或套用兼容期方案。
2. 迁移历史 50 个（2026-08-23 点数；此前写的 41 已过期）；迁移文件是事实源，**不许手改数据库结构**。曾缺失的 `20260531090000_prompt_core_recipe_assets` 已恢复进 Git；CI 必须同时做 migration drift 检查和从空库执行 `prisma migrate deploy`，避免“当前 schema 对齐但历史不可重建”。
3. WHERE / ORDER BY 用到的字段必须加 `@@index()`。
4. 用户生成内容字段（prompt / 错误信息）用 `@db.Text`。
5. 删除关系：ownership 关系 `onDelete: Cascade`；软引用 `onDelete: SetNull`——选哪个必须说得出理由（checklist P1）。
6. 存量数据保留、约束验证和恢复方案在变更前明确；涉及 migration/兼容层例外依数据库场景取得授权。

## 命名约定

Model = PascalCase（`UserApiKey`）· 字段 = camelCase（`createdAt`）· 枚举 = PascalCase + SCREAMING_SNAKE 值（`GenerationStatus.COMPLETED`）。

## 高风险提示

- `Generation` 与 `User` 引用面广，改字段先搜索全部调用方并同步修改。数据库变更须核对当前构建脚本和新旧部署并存的影响；不因历史文档建议 expand-contract 就覆盖 AGENTS 的 owner 原则。
- `Generation` 承载全模态（图/视频/音频/3D）+ 卡片/配方/runGroup 元数据，往里加字段前先确认不是该拆去 `GenerationJob` / 专属表的东西（长期建模优先）。
- 视频三套系统（Story / VideoPipeline / VideoScript 族）是收敛中的并存现状——新视频功能先看 对话中的已确认范围再选挂靠点，别随手再开第四套。

## Source of Truth

- `prisma/schema.prisma` · `prisma/migrations/`（41 个）· `prisma/CLAUDE.md`
- `src/lib/db.ts` · `src/lib/db-scope.ts`
- 历史架构上下文：`git show cddc4384:docs/architecture/{overview,storage,credits}.md`

## Last Verified

- Date: 2026-09-20 · Method: 56a 新表 `AssistantMemory` 与两个枚举对照 `prisma/schema.prisma` 与 migration 文件逐列核验；模型数 39 → 40、枚举 12 → 14。⚠ 该迁移**尚未对任何数据库执行**。
- Date: 2026-07-23 · Method: schema 模型/枚举与迁移目录重新清点；`prisma validate` 通过，历史迁移恢复状态与 CI fresh-database replay 已核验。字段级细节未逐一审计——动具体模型前直接读 schema 对应段。
