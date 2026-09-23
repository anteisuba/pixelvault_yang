# Cards 域 — 可复用创作上下文（现状事实）

> 职责：把「同一个角色 / 同一处场景 / 同一种画风 / 同一副嗓子」固化成可复用实体，供图片、视频、语音、画布四条生成链引用。**不负责**：执行生成，也不负责 `Recipe`（那是 prompts 域的 owner-scoped 模板，与本域的 `CardRecipe` 是两个模型）。

⚠ **记忆 ≠ 卡，两者之间没有桥**（56a，owner 2026-09-19）：卡是用户**亲手经营**的实体（正文 · 图 · 硬否定 · 常挂范围 · `@` 点名）；`AssistantMemory` 的一条是助手**观察到**的一行字，由每轮结账自动写、用户在 `/settings/assistant` 里改删。⛔ 不做「把这条记忆存成卡」、⛔ 也不把卡自动降级成记忆——助手能自己写的东西和用户亲手放进去的东西混成一摊，是这一层最贵的那种错。记忆的形状见 [`references/database.md`](../database.md) 与 [`pages/assistant-shell-v2.md`](../pages/assistant-shell-v2.md) §7.8。

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

**v3 已定**：`referenceImages` · `referenceRoles` · `sourceImages` · `sourceImageEntries` 四列并成一列 `referenceSlots`，形状与迁移步骤见下方「卡片总线 v3 契约」。⛔ v2 的 `referenceRoles` 是过渡形状，不是长期形状，不要在它上面再叠新语义。

## v3 方向（owner 2026-09-19 拍板，随 D6 卡片设计落地）

来源：`docs/design/roadmap-canvas/research/sillytavern-cards.md` §9–§12（逐条取舍 · v3 字段草案 · owner 拍板 · 语气/情感/关系的实现机制）。这一节只记**已拍板的方向**，字段级落点以那份调研的 §10 表为准，实现时代码赢。

- **`description` 现在就拆**：`description` 收窄成**只写视觉**（外观 / 体态 / 服饰基调）并进编译器；新增 `summary` 给人看，**⛔ 不进 prompt**。迁移随 D6 一起做：现有文字默认归视觉，简介留空待补。拆的理由是语义混淆只会越来越贵，不是美观。
- **`loreEntries` 做最小版**：纯文本 `keys[]` + `slot`（positive 前缀 / 后缀 / negative / 参考图选择）+ `order` + `enabled`。⛔ 不做正则、递归、概率、装饰器。先进 `extensions` 观察，出现第二个消费方再提成正式表。价值是**用 prompt 预算换表达力**；裁剪按 block 砍而不按句子砍，且必须是确定性的。
- **`handle`**：prompt 里 `@名字` 的**稳定锚点**，短、user 作用域内唯一、与展示名解耦。展示名会变（「林夏（雨夜版）」），prompt 锚点不能变，否则跨次生成的一致性断掉。⚠ `@角色` 的匹配⛔ 不用整词边界（`\b\w+\b`），中文会直接失效。
- **`relations[]` 结构化，注入时降解**：存成 `{ targetCardId, relation, note }` 作事实层（可双向展示 · 可在剧本节点按 `@角色` 投影 · 可回答「这两个角色同框过几次」）；**注入时降解成 lore 条目**（`keys = [对方 handle / 展示名]`），只在对方真的出场时才花预算。**存储形态 ≠ 注入形态**；按视角裁剪（这个角色不知道的事不注入）。▶ 酒馆没有关系字段是为了保住「一张 PNG 自包含可交换」，**那个约束对我们不成立**（卡活在自己库里、有 `cardId`、本就有变体树与反向关联），放弃结构化是白丢已有优势。
- **`persona` 补 `examples[]`**（示例对白）——这是酒馆全套字段里**唯一真正传递「嘴音」的那一个**；`behavior` / `speech` / `catchphrases` 都是描述性的，模型读完只会写出「一个被描述成这样的人」。形态要抄对：**按场景切成多个独立 block**，喂模型时**按真实轮次渲染**，⛔ 不拼成散文；用可区分的角色标记让示例既与真实输入同构、又不被误认为真实发生过。
- **台词生成直接出 `{ line, emotion, delivery }`**，⛔ 不做酒馆那种「生成完再回头分类一次」。酒馆选事后分类是因为它的输出是给人读的聊天正文，塞标签是污染；**我们的产物是台词稿 + 配音指令，情绪标签本来就是产物的一部分**。
- **自定一张面向表演的情绪词表**（十几个量级），⛔ 不抄 go-emotions 那 28 类（那是面向换立绘的分类标签）。一张表同时服务三处：配音情绪参数 · 台词稿表演提示 · 角色卡表情参考图的槽位命名。闭集**靠解码器兜**（JSON Schema `enum`）而不靠提示词祈祷；多级解析容错；候选标签按「这张卡**实际有的**表情参考图 / 音色情绪档」裁剪后再给模型——模型永远选不出一个我们落不了地的情绪。
- **多角色同框按槽分**，⛔ 不拼文本（酒馆 Join 模式串味是最值钱的那条负面经验，对应我们「A 的服装长到 B 身上」）：每个角色占独立的 referenceSlot 组 + 独立 `@handle` 锚。退化到单参考图路径时可以合并描述性文本，但**每个角色的 `identity` 锚点必须各自独立保留**。为单个角色写台词 / 配音时，**在最靠近生成点的位置钉一句「现在只写 @X」并保证它在任何预算压力下不被裁掉**；写台词时把其他角色名加进停止串。

⚠ **同名异义提醒**：PixelVault 的 `persona` 与酒馆的 Persona（用户人设）**不是一回事**——我们这个是「角色的行为与说话方式」，服务对白与音色。

## 卡片总线 v3 契约（进度表 35，2026-09-24 定，未施工）

范围只有数据、编译与画布 op；装填按钮、关系编辑、summary / lore 编辑、侧栏换数据源的视觉都归 D6，走设计门。

### 定案

| 分岔                       | 定案                                                                                                                               | 理由                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 总线挂哪张表               | **只认 `CharacterCard`**；画布侧栏、`@` 名单、`image.character` 改认它，`ContextCard(CHARACTER)` 退回「助手读的文字设定」（owner） | handle / relations / persona / 音色都在角色卡上；双源会让每个编译函数分两支；合表会推翻 `ContextCard` 有意分表的理由 |
| handle 作用域              | **每行一个 handle**，变体写成 `林夏-雨夜`；**角色卡与背景卡共用一个 `@` 命名空间**（owner）                                        | 正文里 `@林夏` 与 `@雨夜街道` 各自无歧义；DB 唯一索引只管单表，跨表查重由服务端同事务做                              |
| `referenceSlots` 吞几列    | 并掉 `referenceImages` · `referenceRoles` · `sourceImages` · `sourceImageEntries` 四列；`sourceImageUrl` / `sourceStorageKey` 保留 | 三份图列表今天已经会漂（update 只写 entries 不写 sourceImages），留着就是永久多维护几个读方                          |
| `attach_card` 怎么落图     | **物化**：一张卡在一块画布上只有一个 `image.character` 锚节点，靠边接到目标；镜头空位只记指针                                      | 画布「在槽里就等于会发送」「边是事实」只认边；内联存 url 会长出第二本账                                              |
| 画布空位的 `role` 同名异义 | 画布 `referenceSlots` 的 `role`（今天存角色名）**改名 `handle`**，`role` 让给 11 类用途                                            | 「role 词表 = 11 类」是已定口径；已投影剧本里的空位没有用户内容，丢了重投影新镜会再开，⛔ 不写兼容层                 |
| 情绪词表                   | 新的 14 值**表演情绪表为上位**；配音按映射落到现有 `AUDIO_EMOTION`（9 值），`VoiceLine.emotion` 不迁移                             | 未映射的情绪落不了 Fish 标签（逐词查表铁律），由「按卡实际能力裁剪候选」挡在配音面之外，只出现在台词稿里             |
| 迁移授权                   | **owner 授权 35 例外**：migration + 临时双写 + 回填脚本，按下方三次部署走（owner）                                                 | 生产与本地共用一个库，迁移跑在生产构建里、构建期间旧部署仍在服务——只能先加后删                                       |

### 字段落点

- **新列**：`handle`（expand 期可空，contract 后非空，`(userId, handle)` 唯一）· `summary`（给人看，⛔ 任何面都不进 prompt，含助手）· `referenceSlots`（`{id, role∈11 类, url, isPrimary, customLabel?, viewType?, emotion?, origin?, generationId?}[]`）· `relations`（`{targetCardId, relation, note, strength?}[]`）· `extensions`（按命名空间的键袋）。背景卡加 `handle` 与 `extensions`，变体先进 `extensions['pv.variants']`。
- **进 `extensions`**：`pv.lore`（最小版 lore）· `pv.negative`（角色硬否定）。未知键原样透传：已知键逐键解析、坏键编译时当缺席但磁盘上保留；PATCH 按键合并、`null` 才删；任何服务端路径都不得重写或丢弃不认识的键；新键必须带命名空间，`pv.` 归本产品。
- **语义收窄**：`description` 只写视觉并**开始进编译器**（今天不读，属行为变化）；`persona.examples` 改成按场景分块的真实轮次（`{id, scene, turns:[{speaker: other|self, otherHandle?, text}]}`），旧 `{user, reply}` 不再接受。
- **不进 prompt**：`summary` · `tags`。出现在任何 provider 请求体里 = bug，编译器快照测试兜。
- **版本**：改 prompt 相关字段（`characterPrompt` · `description` · `referenceSlots` · `relations` · `persona` · `extensions` 已知键）才 `version + 1`；编译缓存键与生成快照都带 `(cardId, version)`——今天缓存键不含版本，改了卡一小时内仍出旧 prompt。

**不变量**（服务端每次写都校验，编译器每次读都假定成立）：至少一个 `identity` 槽，且恰有一个 `isPrimary`、它必须是 `identity`；槽 url 去重，`custom` 必带 `customLabel`；`relations` 只能指向同一用户的角色卡，目标软删后读时过滤、⛔ 不写库清理。

### 编译层

- **一个中间形态，N 个出口**：新增 `card-bus.service.ts` 作为唯一从库里读卡的编译入口，产出「每个角色一组」的中间形态（视觉文字 · 角色负面 · 排好序的槽 · 命中的 lore · 音色），⛔ 不合并文本。图片、视频、画布、台词各有一个出口函数负责压平；`compileRecipe` 保留名字与 LLM 融合，改成消费这份中间形态，不再自己查库。
- **图片 provider 只收扁平 URL 数组**：所以角色信息写进 prompt 图例（「Image 1 = @林夏 identity（主图）」）；Gemini 改成图与说明交错（全 spec 唯一动 worker 的一片，缺标注 = 旧行为）；单图端点只送焦点角色主图，其余角色退到文字，但**每个角色的身份锚句各自保留**；NovelAI 用原生多角色 `characterPrompts`，精准参考只挂焦点角色主图。超配额从每个角色尾部轮流砍，⛔ 不许一个角色吃光配额。
- **视频**：支持位置 token 的家族（Seedance / MiniMax / Kling O3 edit）每角色 ≤3 张压平，`@林夏` 翻成 `@Image1（林夏）`，音色走 `audioBindings`；其余家族只送焦点角色主图，其他角色进文字；Vidu `subjects` 与 Kling `elements` 只在契约里预留、本轮不接。工作台视频停止拼 `characterPrompt`，改由服务端出口产出。
- **`@handle` 一处定义**：已知名字表**最长匹配**（先 NFKC + ASCII 小写），⛔ 不用 `\b\w+\b`；剧本投影照旧抓原串，**装填时**再按已知 handle 最长前缀匹配（`@林夏走进来` → 林夏）。工作台里 `@` 只做位置标注，⛔ 不因正文提到就隐式选卡。
- **lore 确定性**：候选 = 在场角色的 `pv.lore` + 关系降解条目（对方在场才进，只注入本角色视角那一条）；子串命中、⛔ 无正则无递归；按 `order` 排序、按字符预算累计，**第一条放不下即停**；身份锚、角色负面、台词聚焦钉永不裁。
- **顺序**：风格**前置**改写（删掉今天模板回退里「风格追加在最后」）；负面按「模型默认 → 风格 → lore → 角色」排，角色硬约束离生成点最近。
- **文本面**：LLM 文本层今天只有 `systemPrompt + userPrompt`，要先加示例轮次通道；台词直接产出 `{line, emotion, delivery}`，`emotion` 的候选 = 这张卡实际能落地的情绪，非 Anthropic 路靠多级容错解析兜，⛔ 永不作废整条台词。

### 画布 op：`attach_card` / `detach_card`

`content` 档 · `free` · 自动落 · 互为 inverse（画布 op 总数 32 → 34）。模型侧参数收 `cardHandle`，服务端解析成卡 id（画布快照有意不暴露卡 id，与 `mount_lora` 同一套路），不存在或不属于本人即拒。执行器找 / 建该卡的锚节点并连边：镜头上还会物化表情特写与音色节点、把名字匹配的空位写上卡 id；同卡同节点再 attach = 无变更成功；撤销载荷由执行器当场记下「本次新建的节点 / 边 + 被改字段旧值」。`project_script` 照旧只开空位，投影确认后宿主做 handle 匹配，唯一命中由助手同轮 attach，多命中或没命中留空并交给「问」。

### 迁移（四步 · 三次部署）

1. **expand（D1）**：只加列 + 唯一索引（登记 ACK：索引列是同迁移新加的可空列，全表 NULL 时建）；写方**双写**，读方一行不改。
2. **backfill（D1 上线后 owner 手动）**：回填脚本默认只出报告，`--apply` 每次都要 owner 当次授权；只动新列仍是初始值的行，重跑安全；按用户 → 根卡 → 变体的确定性顺序分配 handle，冲突加 `-2`、`-3`；persona 旧形改写前先把原值导出到本机。
3. **switch（D2）**：读方切到新列，Prisma 省略旧列，**仍双写**以保 D2 可回滚到 D1。
4. **contract（D3，D2 稳定后）**：`SET NOT NULL` + 删四列旧图片列表；登记 ACK 时贴 owner 连库执行的只读核查 SQL 结果（handle 为空计数 = 0、精修图全部进槽、主图不变量 = 0）。**D3 前 owner 先建 Neon 快照**——删列是唯一不可逆的一步。

共享库的顺序约束：D1 推上去、生产构建跑完迁移后本地才能跑 D1 代码；Preview 不迁移，带 D1 的分支在 Preview 上碰卡片会报缺列，属预期；D3 后停在旧代码的本地 checkout 会在卡片查询上报错。`preflight:migrations` 目前缺 Neon key 跑不通，约束只能靠 owner 执行只读 SQL 验证。

### 施工顺序（每片一个 commit）

① 常量与全部 v3 Zod 形状 → ② 纯函数（旧数据转槽 · handle 分配 · `@` 解析 · lore 选择 · 关系降解 · 情绪裁剪与容错）→ ③ expand 迁移 + 双写 → ④ 回填脚本 → ⑤ 编译总线 + 图片出口 → ⑥ worker 的 Gemini 交错标注 → ⑦ 视频出口 → ⑧ 读方切换（含核实并修 quick 出图时 `characterCardIds` 被 `StudioGenerateSchema` 剥掉、不落 join 表）→ ⑨ `attach_card` / `detach_card` → ⑩ 剧本空位装填 + 画布 `@` 名单真正接线 → ⑪ 文本面示例轮次与台词产出 → ⑫ contract 迁移 → ⑬ 文档随各片同步。①② 不碰库；③ 起按上面的部署节奏走，push main 仍要 owner 点头并过发布清单。

## 不能破坏

`Recipe` 与 `CardRecipe` 的模型分离 · 卡与 `AssistantMemory` 的分界（⛔ 不许长出互相转换的路） · 角色卡 owner-scoped 查询与 ownership 服务端校验 · 变体树 `parentId` 的级联语义（变体随父卡删）· `VoiceCard` 的软引用语义（删音色不删角色）· `referenceRoles` 值域与画布词表同源。

## Source of Truth

调研与 v3 方向：`docs/design/roadmap-canvas/research/sillytavern-cards.md`（§9 逐条取舍 · §10 字段草案 · §11 owner 拍板 · §12 语气/情感/关系的实现机制，2026-09-19）。

`prisma/schema.prisma`（`CharacterCard` / `VoiceCard`）· `src/types/index.ts`（Character Card 段）· `src/constants/cards/character-card.ts` · `src/constants/node-studio.ts` · 调研证据 `docs/design/roadmap-canvas/research/cards.md`。

## Last Verified

- Date: 2026-09-20 · Method: 只核了**记忆 vs 卡**那条分界（56a 落地时补写），对照 `src/constants/assistant-memory.ts` 与 `src/services/assistant-memory.service.ts` 确认两边确实没有互转的代码路径。本文其余各节未在本轮复核。
- Date: 2026-09-24 · Method: 写「卡片总线 v3 契约」时对照代码复核了：v2 七个字段只有 mapper 在写、`CharacterCardRecord` 不带任何一个；画布侧栏读 `ContextCard`（`useContextCards`）；画布镜头空位 `role` 存的是角色名；画布视频载荷不读空位；LLM 文本层只有系统提示 + 用户提示；`StudioGenerateSchema` 没有 `characterCardIds`（quick 出图丢 id 未实跑）。
