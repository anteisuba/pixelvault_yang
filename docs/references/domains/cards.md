# Cards 域 — 可复用创作上下文（现状事实）

> 职责：把「同一个角色 / 同一处场景 / 同一种画风 / 同一副嗓子」固化成可复用实体，供图片、视频、语音、画布四条生成链引用。**不负责**：执行生成，也不负责 `Recipe`（那是 prompts 域的 owner-scoped 模板，与本域的 `CardRecipe` 是两个模型）。

## 数据模型

`CharacterCard`（含 `parentId` 变体树）· `GenerationCharacterCard`（生成↔角色卡 join）· `BackgroundCard` · `StyleCard` · `CardRecipe`（character + background + style + freePrompt 的组合）· `VoiceCard`（声音资产，2026-09-17 前与 `CharacterCard` 零关联）。

## Service / API

- `src/services/cards/character-card.service.ts`（CRUD + 属性抽取 + 精修 + 一致性打分）· `character-card.mapper.ts`（行 → `CharacterCardRecord`）· `card-recipe-compiler.service.ts`（三卡 LLM 融合成单条 prompt）。
- API：`/api/character-cards`（GET/POST）· `/api/character-cards/[id]`（GET/PATCH/DELETE）· `/api/character-cards/[id]/refine` · `/api/character-cards/[id]/score`。
- Hooks：`src/hooks/cards/`。

## 角色卡字段 v2（2026-09-17）

目的：把角色卡从「一堆图 + 一段视觉描述」补齐成**命名实体**——图片、视频、语音、画布四条链都能引用同一张卡。方向依据见 `docs/design/roadmap-canvas/research/cards.md`（Kling 元素库 / Vidu `subjects[].voice_id` / Runway `{uri, tag}` / Gemini 分槽配额 / SillyTavern V2 / weavai）。

**本轮只落数据层**：字段全部可空、不回填、不加业务约束，写入路径是角色卡 create / update 的透传。⛔ `card-recipe-compiler.service.ts` 本轮不改——编译期怎么用这些字段是下一片的事，在那一片之前它们没有读方。

| 字段                | 类型（Prisma / Zod）                                                                                   | 语义                                                                                                   | 谁写                                                       | 谁读                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `voiceCardId`       | `String?` → `VoiceCard`，`onDelete: SetNull`，带 `@@index`                                             | 这个角色默认用哪副嗓子。软引用：删音色卡只把绑定清空，不删角色卡                                       | 角色卡 create / update                                     | 待接：视频 subject 编译（Vidu `voice_id`）、配音间 `VoiceRoom.cast`、画布角色节点        |
| `voiceProfile`      | `Json?` — `{ emotions: [{ label, params }], sampleLines: string[] }`                                   | 该角色的情绪档与示例台词。`params` 是 provider 无关的参数袋（语速/音高等），不在这一层收敛到某家 API   | 角色卡 create / update                                     | 待接：配音间试听与情绪切换                                                               |
| `persona`           | `Json?` — `{ behavior, speech, catchphrases[], scenario, opening, examples: [{ user, reply }] }`       | 人设（**写具体行为，不写形容词**：「紧张时搓手指」优于「温柔体贴」）。与 `description`（视觉描述）分开 | 角色卡 create / update                                     | 待接：对话/剧本链的 system prompt 注入                                                   |
| `referenceRoles`    | `Json?` — `Record<url, role>`，`role` ∈ 画布 11 类词表                                                 | 给已有参考图标用途槽位。**键是图片 URL**，值取 `NODE_STUDIO_REFERENCE_ROLES`                           | 角色卡 update                                              | 待接：各 adapter 的分槽映射（MJ `--oref`/`--sref`、Gemini 角色/物体/风格槽、Runway tag） |
| `allowedStyleRange` | `Json?` — `{ allowStyleCardIds: string[], denyTags: string[] }`                                        | 这张卡允许搭配的画风白名单与禁用标签。空数组 = 不限制                                                  | 角色卡 create / update                                     | 待接：`CardRecipe` 组卡时的可选性过滤                                                    |
| `provenance`        | `Json?` — `{ sourceGenerationIds: string[], loraJobId?, derivedFromCardId?, derivedFromCardVersion? }` | 这张卡的素材从哪来：哪几次生成、哪个 LoRA 训练 job、从哪张卡的哪个版本派生                             | 角色卡 create / update（精修落好图时由服务端补，属下一片） | 待接：卡片详情的血缘展示                                                                 |
| `version`           | `Int @default(1)`，非空                                                                                | 卡内容的单调版本号，供 `provenance.derivedFromCardVersion` 指认「派生自哪一版」                        | 角色卡 create（默认 1）；递增时机属下一片                  | `provenance` 的读方                                                                      |

### 与画布 11 类参考角色词表的对齐

`referenceRoles` 的值域**直接复用** `NODE_STUDIO_REFERENCE_ROLES`（`src/constants/node-studio.ts`）的 11 个：`identity` · `pose` · `style` · `composition` · `background` · `faceCloseup` · `costume` · `prop` · `frameStart` · `frameEnd` · `custom`。

- ⛔ 不在卡片层另造一套同义词表。画布节点与角色卡说同一种「用途」语言，是「卡片补齐到画布语义」这个方向的具体含义——画布的表达力目前强于卡片，补齐方向是单向的。
- `role`（用途槽位）与 `sourceImageEntries[].viewType`（拍摄角度：front / side / back / top / three_quarter / detail / other）是**两个正交维度**，并存不合并。
- 类型上 `referenceRoles` 用 `z.enum(NODE_STUDIO_REFERENCE_ROLES)` 收窄，与画布 `NodeWorkflowReferenceRoleSchema` 同源；助手写入路径上那种「有意留成自由字符串」的放宽不适用于这里——本字段没有「一条写错把整批带崩」的批量语义。

### 为什么这一轮不动 `referenceImages`

`referenceImages` 现在是扁平 `string[]`，读写方遍布编译器、精修、画布与 UI。把 role 挂进去等于同一轮改掉全部调用方，而 role 的消费方（adapter 分槽）本轮根本不存在。所以 v2 用旁挂的 `referenceRoles: Record<url, role>` 记角色，形状不动。

**v3 的方向已定**：`referenceImages` 与 `referenceRoles` 合并成 `referenceSlots: { role, url, cardId, cardName }[]`，与编译器输出的 `referenceSlots` 同形，在编译器改造那一片一次性完成并删掉旁挂表。⛔ v2 的 `referenceRoles` 是过渡形状，不是长期形状，不要在它上面再叠新语义。

## 不能破坏

`Recipe` 与 `CardRecipe` 的模型分离 · 角色卡 owner-scoped 查询与 ownership 服务端校验 · 变体树 `parentId` 的级联语义（变体随父卡删）· `VoiceCard` 的软引用语义（删音色不删角色）· `referenceRoles` 值域与画布词表同源。

## Source of Truth

`prisma/schema.prisma`（`CharacterCard` / `VoiceCard`）· `src/types/index.ts`（Character Card 段）· `src/constants/cards/character-card.ts` · `src/constants/node-studio.ts` · 调研证据 `docs/design/roadmap-canvas/research/cards.md`。
