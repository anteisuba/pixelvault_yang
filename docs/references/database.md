# Database 参考 — Prisma 域模型边界与迁移纪律（现状事实）

> 定位：数据库现状事实与操作纪律。栈 = Prisma 7 + PostgreSQL（Neon）。红线见 `forbidden.md` 数据库节；检查项见 `checklists/database.md`。

## 访问规则（谁能碰数据库）

- **只有 `src/services/` 层能碰 Prisma**；API route 禁止直接查询（backend.md 分层）。
- Client 从 `src/lib/db.ts` 取；查询作用域辅助在 `src/lib/db-scope.ts`。
- 生成的 client 在 `src/lib/generated/prisma/`——**永远不要手改**。
- ownership（userId 归属）与 credit 计算只在服务端。

## 域模型地图（45 模型 + 19 枚举，2026-10-15 对照 schema 重新清点（含 2026-10-15 +`AssistantTurnRecord`）；下表只列主干，没列到的直接读 schema）

| 域          | 模型                                                                                                                                                                                                                            | 备注                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份        | `User`                                                                                                                                                                                                                          | `clerkId` 映射外部身份；JIT 建档走 `ensureUser`                                                                                                                                                                                                                                                                                                                      |
| 组织        | `Project`（`parentId` 层级）· `NodeWorkflowProject`                                                                                                                                                                             | 普通 Project 与画布项目**分离**；Project 删除不删作品                                                                                                                                                                                                                                                                                                                |
| 生成核心    | **`Generation`**（全模态统一资产记录，schema 中最大模型）· `GenerationLayer`（Seedream 5.0 Pro 图层拆分的 z_index ≥ 1 图层，底图仍是 Generation 本身）· `GenerationJob` · `ExecutionOutbox` · `ApiUsageLedger` · `FreeTierSlot` | 异步执行骨架；Comfy runner 复用；`GenerationSourceSurface` 记来源面；图层与 Generation 同事务写入，migration `20260918120000_generation_layers`；`Generation.searchGrounded`（出图时开了 Google 搜索落地 → 按条款不能公开，默认 false 不回填，migration `20261007210000_generation_search_grounded`；搜到的来源 ⛔ 不落库，只在 `GenerationJob` 上暂放到发起者取走） |
| BYOK        | `UserApiKey`                                                                                                                                                                                                                    | 加密存储 + masking；显式 keyId 不 fallback                                                                                                                                                                                                                                                                                                                           |
| 卡片        | `CharacterCard` · `CharacterLook`（造型）· `GenerationCharacterCard`（join）· `VoiceCard`                                                                                                                                       | 可复用创作上下文层                                                                                                                                                                                                                                                                                                                                                   |
| 配方/提示词 | `Recipe`（`visibility` 停用待删）· `ExtractedElement` · `UserCreativePreference`                                                                                                                                                |                                                                                                                                                                                                                                                                                                                                                                      |
| 社交        | `UserLike` · `UserFollow`                                                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                      |
| 模型配置    | `ModelConfig`                                                                                                                                                                                                                   | DB-first 覆盖目录条目；竞技场三表 2026-09-17 随 Arena 整删                                                                                                                                                                                                                                                                                                           |
| 视频        | —                                                                                                                                                                                                                               | 故事板两表 2026-09-29 随故事板整删；长视频管线两表、视频脚本两表 2026-10-21 删                                                                                                                                                                                                                                                                                       |
| 助手        | `AssistantMemory`（助手记住的一行字，56a）· `AssistantTurnRecord`（每轮的过程记录，供回放）· `AssistantSkill`（你的技能，第 7b 步）                                                                                                                                     | 见下「助手记忆」「助手每轮的过程记录」两节；`AssistantMemory` 与 `ContextCard` 是两件事，⛔ 无桥；`AssistantTurnRecord` ⛔ 不进会话分享与任何导出                                                                                                                                                                                                                    |
| LoRA        | `LoraAsset` · `LoraTrainingJob`                                                                                                                                                                                                 | Civitai 来源字段 2026-06-08 迁移加入                                                                                                                                                                                                                                                                                                                                 |

核心执行枚举包括 OutputType · GenerationStatus · GenerationSourceSurface · GenerationJobStatus · ExecutionOutboxStatus；其余枚举直接以 `schema.prisma` 为准。

## 助手记忆 `AssistantMemory`（2026-09-20 · 进度表 56a）

一条 = **一行字**：`text` 就是进系统提示的那一行。助手记的在**每轮结账**（v3 没有结账那次往返：一轮收尾后在后台单抽记忆，见 `assistant-v3.md`「上下文预算」）或 `add_project_rule` 的普通规矩时写，你写的在 `/settings/assistant` 的记忆页写；两种都能在那里改 / 删。

| 列                             | 说明                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `scope`                        | `AssistantMemoryScope`：IMAGE · TAGS · VIDEO · CANVAS · LORA · CARDS · GLOBAL                                            |
| `kind`                         | `AssistantMemoryKind`：PREFERENCE · FACT · RULE（只影响提示措辞）                                                        |
| `text`                         | `@db.Text`，收窄在 `ASSISTANT_MEMORY_LIMITS.maxTextChars`                                                                |
| `conversationId` / `messageId` | 溯源，**库里存着但界面不画**；⛔ 无 FK（会话删了记忆还在）                                                               |
| `lastUsedAt`                   | 被注入过就更新；**注入优先级与淘汰顺序都读它**                                                                           |
| `source`                       | `AssistantMemorySource`：ASSISTANT · CREATOR（记忆页「助手记的 / 你写的」，2026-09-26 加列，默认 ASSISTANT）             |
| `projectId`                    | 可空，FK → `NodeWorkflowProject`（`onDelete: Cascade`）。只属于一个画布项目的那条；空 = 不归项目（2026-10-09）           |
| `characterCardId`              | 可空，FK → `CharacterCard`（`onDelete: Cascade`）。和这个角色聊天时记下的（范围一律 CARDS）；空 = 不归角色（2026-10-16） |

- 四条索引：`(userId, scope, updatedAt desc)` 总览列表按域筛 · `(userId, updatedAt desc)` 总览「全部」· `(userId, scope, lastUsedAt desc)` 注入取前 N / 淘汰取最旧 · `(userId, projectId, lastUsedAt desc)` 画布按项目注入 · `(userId, characterCardId, updatedAt desc)` 聊天按角色注入。
- **一个项目一份记忆**（owner 2026-10-09）：画布上结账记下的（和 `add_project_rule` 记在画布范围的）一律带当前项目；画布注入 = 全局 + 不归项目的画布条（记忆页「所有画布」）+ 本项目，⛔ 别的项目一条都不带。项目号对不上这个用户时画布那条**不写**，⛔ 不退成所有画布。记忆页里换范围（含选「所有画布」）就清掉 `projectId`。迁移 `20261009150000_assistant_memory_project` 加列 + 把历史上助手在画布会话里记的那几条按会话的项目回填，2026-10-09 经 owner 授权已对共用库执行（回填 1 行）。
- **一个角色一份记忆**（附录L 第二片，owner 2026-10-16「现在上」）：和角色聊天时记下的带 `characterCardId`；聊天里只读这个角色的 + 你写的全局规矩，工作里的所有读取都排除带角色的行。角色卡对不上这个用户（或删了）就不写。迁移 `20261016100000_assistant_memory_character` 只加列 + 索引 + FK，⛔ 无回填，合 main 时由生产构建执行（owner 同意）。
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

## 助手每轮的过程记录 `AssistantTurnRecord`（2026-10-15 · owner「建表」）

owner 在卡上选的原话就是规格：「每轮存画布、过程和模型，每行不超过 256KB，留 30 天或每人最近 200 条，不进分享和导出；先过迁移检查再上线」。读写全在 `src/services/assistant-turn-record.service.ts`；数与词表在 `src/constants/assistant-turn-record.ts`，JSON 形状在 `src/types/assistant-turn-record.ts`。

- **一轮一行**：`(userId, turnId)` 唯一。号与第几跳随 v3 本轮记录的板子那一条（`turn: { id, hop }`）往返：开轮那一跳服务端发号、建行并存**开轮时的快照**；画布接力的后几跳按号找到同一行，只更新 `transcript` / `hops` / `outcome` / `errorCode`（`hops` 只增不减，同一跳再来一次照写），⛔ 不拿后几跳手上已落了改动的快照覆盖。第一跳没写成、由后面一跳建行时快照不存，`truncated` 带 `no_opening_snapshot`。
- **写**：v3 每一跳收尾（`runAssistantV3` 的 `finally`）服务端记一笔，`after()` 托住、⛔ 不等、不抛，写不进只记一行警告。隐身那一轮、交回旧内核的、开跑前就失败的（缺 key 等）不记。
- **列**：`workspaceKey` · `domain` · `projectId`（工作区键里解出来的）· `conversationId`（软引用，⛔ 无外键：首轮还没有会话号）· `adapterType` · `modelId` · `routeModel`（persona 里选的那一档，`auto` = 自动）· `apiKeyId`（**只存 id**）· `systemPromptHash`（系统提示的 sha256，正文 ⛔ 不落库）· `promptVersion`（`ASSISTANT_V3_PROMPT_VERSION`）· `input`（对话：模型这一轮看见的那几轮再到创作者最后那一句（开轮板子上的 `history.turns`，P2 第三片）、`@`、片子的地址与帧数、上一轮找到的东西 `#n`（开轮板子上冻着的那一份，与模型看到的同一份、最多 16 条）等回放要用的请求字段）· `snapshot`（开轮快照）· `transcript`（v3 本轮记录）· `snapshotBytes` / `sizeBytes` · `truncated` · `outcome`（done / quiet / empty / content_filter / same_failure / awaiting_confirm / max_steps / aborted / error / relay）。
- **摘掉的**：快照与请求里的 `data:` 地址一律换成 `data:,omitted`（剪贴板图、帧），视频帧只记帧数，⛔ 不存 key 本身、不存解密出来的任何东西。
- **上限 256 KB**（`input` + `snapshot` + `transcript` 三段 JSON 的 UTF-8 字节，⚠ 不是 `pg_column_size`）：按签名 → 板子正文 → 工具结果 → 对话历史 → 模型正文 → 上一轮找到的东西（`input.priorFinds`，这一轮没带就跳过）→ 快照 → 只留板子与模型回复的顺序一样一样截，截到放得下为止，截了哪几样记在 `truncated`；截完还放不下这一跳不写、只记警告。
- **保留**：建行之后顺手删这个人 30 天前的与第 200 条之后的（两刀都走 `(userId, createdAt DESC)`）；不再用助手的人由每日 sweep（`/api/internal/execution/sweep`，`pruneExpiredAssistantTurnRecords`，走 `createdAt` 索引）删 30 天前的，删不动只记警告、不拖垮 sweep。用户硬删 `onDelete: Cascade`；软删的用户 30 天内由 sweep 清掉。会话删了 ⛔ 不连带删记录（首轮没有会话号，删不全），30 天内自然过期。
- **不进分享 / 导出**：没有任何读路由；整个 `src/`（生成的 client 除外）只有上面那个服务与 sweep 碰 `db.assistantTurnRecord`，会话分享（`AssistantConversationShare`、`assistant-conversation.service.ts`）与下载 / 导出路径都不读它。回放要用时由人导出一行，交给 `src/test/assistant-replay/from-turn-record.ts`（纯函数，⛔ 不连库）。
- **迁移** `20261015120000_assistant_turn_record`：只新建这一张表 + 三个索引（`(userId, turnId)` 唯一、`(userId, createdAt DESC)`、`createdAt`）+ 指向 `User` 的外键，⛔ 不动任何已有表的列、约束与数据。SQL 由 `prisma migrate diff` 对着 PGlite 上的整套迁移回放生成。**未对共用库执行，随下一次生产构建的 `prisma migrate deploy` 执行**（push main 即生产构建）；Preview 构建不跑迁移，Preview 上写记录会失败，只记警告、助手照常。

## 迁移纪律

1. 操作流程与授权统一见 `docs/scenes/db-migration.md`；不在生产或未确认隔离的连接运行 `migrate dev`（含 create-only）。已有环境记录不是本轮连接核验；不自动生成迁移或套用兼容期方案。
2. 迁移历史 80 个（2026-10-15 点数，最新 `20261015120000_assistant_turn_record`；此前写的 50 / 41 已过期）；迁移文件是事实源，**不许手改数据库结构**。曾缺失的 `20260531090000_prompt_core_recipe_assets` 已恢复进 Git；CI 必须同时做 migration drift 检查和从空库执行 `prisma migrate deploy`，避免“当前 schema 对齐但历史不可重建”。
3. WHERE / ORDER BY 用到的字段必须加 `@@index()`。
4. 用户生成内容字段（prompt / 错误信息）用 `@db.Text`。
5. 删除关系：ownership 关系 `onDelete: Cascade`；软引用 `onDelete: SetNull`——选哪个必须说得出理由（checklist P1）。
6. 存量数据保留、约束验证和恢复方案在变更前明确；涉及 migration/兼容层例外依数据库场景取得授权。

## 命名约定

Model = PascalCase（`UserApiKey`）· 字段 = camelCase（`createdAt`）· 枚举 = PascalCase + SCREAMING_SNAKE 值（`GenerationStatus.COMPLETED`）。

## 高风险提示

- `Generation` 与 `User` 引用面广，改字段先搜索全部调用方并同步修改。数据库变更须核对当前构建脚本和新旧部署并存的影响；不因历史文档建议 expand-contract 就覆盖 AGENTS 的 owner 原则。
- `Generation` 承载全模态（图/视频/音频/3D）+ 卡片/配方/runGroup 元数据，往里加字段前先确认不是该拆去 `GenerationJob` / 专属表的东西（长期建模优先）。
- 2026-10-21 删掉没有入口的表：合集（`Collection` / `CollectionItem`）、图片分析（`ImageAnalysis`）、卡片配方（`CardRecipe`）、长视频管线（`VideoPipeline` / `VideoPipelineClip`），删前整表备份在 R2 `backups/2026-10-21-dropped-tables-*.json`。同日又删风格卡 / 背景卡（`StyleCard` / `BackgroundCard`，9 张）与视频脚本（`VideoScript` / `VideoScriptScene`），备份 `backups/2026-10-21-dropped-cards-scripts-*.json`。`Generation.cardRecipeId` 当时只摘外键，2026-10-22 单独迁移删列（0 行有值，未备份）。
- 2026-10-22 角色外观收口（expand 段，`20261022150000_character_card_merge_appearance`）：`characterPrompt` 并进 `description`（提示词在前、外观在后），三列 NOT NULL 旧列补默认值。代码已停读停写 `CharacterCard` 的旧图列（`sourceImageUrl` · `sourceStorageKey` · `sourceImages` · `sourceImageEntries` · `referenceImages` · `referenceRoles`）与死列（`characterPrompt` · `modelPrompts` · `attributes` · `status` · `stabilityScore` · `allowedStyleRange` · `provenance` · `projectId`），以及 `Generation.characterCardId`；同日 contract 段 `20261022160000_character_card_drop_retired_columns` 删掉这些列、两条相关索引、`CharacterCard.projectId` 外键与枚举 `CharacterCardStatus`。删前整表备份 R2 `backups/2026-10-22-character-cards-*.json`。
- 2026-10-22 角色收的 LoRA（角色③，`20261022170000_character_card_lora`）：新表 `CharacterCardLora`（`characterCardId` + `loraAssetId` 联合主键，两头 `ON DELETE CASCADE`，`loraAssetId` 单独一条索引）。旧列 `CharacterCard.loras`（当时 0 行有值）代码已停读停写、从默认查询里拿掉（`lib/db.ts` 的 `RETIRED_COLUMNS`），下一次部署删列。同日 contract 段 `20261022180000_character_lora_contract` 删掉 `CharacterCard.loras`、清掉 `extensions.pv.tags.loraTrigger`（删前 0 行有值 / 0 行非空，未备份），并给 `LoraAsset` 加 `inLibrary`（默认 true；false = 没收藏、只被角色收着，不进库列表，见 `domains/cards.md`「角色 ↔ LoRA」）。
- 2026-10-23 角色造型（角色④，expand 段 `20261023090000_character_looks`）：新表 `CharacterLook`（`characterCardId` 级联、`label` 可空、`isDefault`、`description`、`tags[]`、`referenceSlots` Json、`sortOrder`，索引 `(characterCardId, sortOrder)`）；`GenerationCharacterCard` · `CharacterCardLora` · `LoraTrainingJob` 各加可空 `lookId`（`ON DELETE SET NULL`）。数据：每张根卡建默认造型（搬 `description` / `referenceSlots` / `pv.tags` 两组标签），变体卡转成父卡的造型（id 沿用），关联改指父卡后删变体卡；删前整表备份 R2 `backups/character-cards-2026-10-23-290fd4698f48e24441df4e53610b4755.json`。`CharacterCard` 的 `description` · `referenceSlots` · `parentId` · `variantLabel` 停读停写、从默认查询拿掉，下一次部署删列（见 `domains/cards.md`「造型」）。
- 2026-10-23 数据库收尾（`20261023120000_db_cleanup`）：删 `CharacterCard` 的 `description` · `referenceSlots` · `parentId`（连外键与索引）· `variantLabel`，清 `extensions.pv.tags`（10 行）；`Generation.loraLineage`（0 行有值、无读方）停用、从默认查询拿掉（`lib/db.ts` 的 `RETIRED_COLUMNS`），下一次部署删列；5 条 5 月的已完成 3D 任务从 `externalRequestId` 里去掉内嵌的 base64 多视图（约 24 MB），多视图入参此后只收 http(s) 地址；`LoraAsset.baseModelFamily` 的 slug 写法（`sdxl` / `anima-dit` / `flux` …）统一成 Civitai 显示名（`SDXL 1.0` / `Anima` / `Flux.1 D` …），写入时经 `canonicalLoraBaseModelLabel` 归一。删前备份 R2 `backups/2026-10-22-db-cleanup-5dab655032821164fcfb1dd996762304.json`（3D 任务 + LoRA 底模原值）；卡表见角色④那份备份。
- 2026-10-23 标签堆进库（`20261023140000_prompt_tag_stack`）：新表 `PromptTagStack`（`userId` 主键、级联删，`positive` / `negative` 两列 `PromptTagSelection[]`），LoRA 台的标签堆从浏览器 `pv.prompt-tag-stack.v1.<clerkId>` 搬进账号、跨设备同步；账号里还没有那一份时客户端把浏览器旧份传一次，之后不再读写浏览器。同一迁移删掉已停用的 `Generation.loraLineage`。

- 2026-10-23 你的技能（`20261023200000_assistant_skills`）：新表 `AssistantSkill`（`userId` 级联删；`name` / `description` / `body` 可空 / `references` JSON / `builtinSlug` 可空 / `enabled`；`(userId, name)` 与 `(userId, builtinSlug)` 各唯一）。自己写的 `builtinSlug` 为空；「改成我的版本」或只关掉一份内置带 `builtinSlug`，只关时 `body` 为空。见 `assistant-next.md` 第 7b 步。

## Source of Truth

- `prisma/schema.prisma` · `prisma/migrations/`（80 个，2026-10-15）· `prisma/CLAUDE.md`
- `src/lib/db.ts` · `src/lib/db-scope.ts`
- 历史架构上下文：`git show cddc4384:docs/architecture/{overview,storage,credits}.md`

## Last Verified

- Date: 2026-10-16 · Method: `AssistantMemory.characterCardId` 对照 `prisma/schema.prisma` 与迁移 `20261016100000_assistant_memory_character` 核验；全部 83 个迁移在 PGlite 上从空库回放，`prisma migrate diff` 对 schema 为空；`prisma/migration-safety.test.ts` 通过（新 FK 登记在 ACKNOWLEDGED：可空新列、无存量行引用）。
- Date: 2026-10-15 · Method: 新表 `AssistantTurnRecord` 对照 `prisma/schema.prisma` 与迁移 `20261015120000_assistant_turn_record` 逐列核验；全部 80 个迁移在 PGlite（`@electric-sql/pglite` 0.4.1 内存库 + `pg_trgm`，经 `pglite-socket` 暴露在 127.0.0.1）上从空库按序回放成功，回放后 `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` 为空（配置文件只写死那个本机 PGlite 地址，⛔ 不读任何 env）；`prisma/migration-safety.test.ts` 通过（新表不算已有表的约束，⛔ 未进 ACKNOWLEDGED）。模型 45、枚举 19、迁移 80 为重新清点。⚠ 该迁移**只在 PGlite 上回放过，未对任何共用数据库执行**。
- Date: 2026-09-20 · Method: 56a 新表 `AssistantMemory` 与两个枚举对照 `prisma/schema.prisma` 与 migration 文件逐列核验；模型数 39 → 40、枚举 12 → 14。⚠ 该迁移**尚未对任何数据库执行**。
- Date: 2026-07-23 · Method: schema 模型/枚举与迁移目录重新清点；`prisma validate` 通过，历史迁移恢复状态与 CI fresh-database replay 已核验。字段级细节未逐一审计——动具体模型前直接读 schema 对应段。
