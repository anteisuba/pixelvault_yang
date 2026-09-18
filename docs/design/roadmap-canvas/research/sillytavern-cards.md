# SillyTavern 角色卡调研 —— 给 PixelVault「卡片」域做参考

调研日期：2026-09-19。除注明外，所有事实均取自一手来源（官方规范仓库、官方文档站、项目仓库本身），URL 逐条列在正文里。
调研目的：PixelVault 正在设计角色卡 / 风格卡 / 场景卡 / 音色绑定，owner 希望参考酒馆（SillyTavern）的角色卡设计。**PixelVault 的角色卡服务的是「生成图 / 视频时的角色一致性」，不是聊天角色扮演**，所以本文对每条机制都给出「借 / 不借」的判断，而不是照搬。

---

## 0. 一句话结论

酒馆角色卡真正值得借的**不是字段表**，而是三件结构性设计：

1. **卡是自包含的可交换文件**——元数据内嵌在头像 PNG 里，一张图就是一张卡，不依赖任何服务器。
2. **卡自带一本"按关键词触发"的私有知识库**（character_book / lorebook），而不是把所有设定塞进一段死 prompt；注入是**条件的、有预算的、有位置的**。
3. **`extensions` 是规范级的逃生舱**——所有实现方自有的东西都往这里放，且规范强制「不认识的键不许在导入导出时销毁」，这让生态能在不改规范的前提下演化。

对话导向的字段（first_mes / mes_example / post_history_instructions / talkativeness 等）对 PixelVault **不适用**，不要为了"对齐酒馆"而建这些列。

---

## 1. Character Card 规范：V1 / V2 / V3

### 1.1 V1（2023 年 5 月前的既成事实格式）

仅 6 个字段：`name` `description` `personality` `scenario` `first_mes` `mes_example`。
来源：https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md （2026-09-19 查阅）

### 1.2 V2（`spec: 'chara_card_v2'`，`spec_version: '2.0'`）

一手来源：https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md （2026-09-19 查阅）

V2 把 V1 的 6 个字段挪进 `data` 对象，并新增：

| 字段                        | 规范约束（原文语义）                                                                                                 | 是否进提示词   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| `creator_notes`             | **MUST NOT** 用于提示词；**SHOULD** 对使用者高度可见（至少显示一段）                                                 | 否             |
| `system_prompt`             | 默认行为 **MUST** 是替换用户全局 system prompt；空串时回退用户设置；**MUST** 支持 `{{original}}` 占位符插回原 prompt | 是             |
| `post_history_instructions` | 同上，替换的是 "ujb/jailbreak"（历史之后的指令）                                                                     | 是             |
| `alternate_greetings`       | 字符串数组；前端 **MUST** 把每条做成首条消息的一个 "swipe"                                                           | 是（一次一条） |
| `character_book`            | 角色私有 lorebook；前端 **MUST** 默认启用；**SHOULD** 与全局世界书叠加，且角色书优先                                 | 条件触发       |
| `tags`                      | 字符串数组；**SHOULD NOT** 进提示词；**MAY** 用于前端排序 / 筛选（**SHOULD** 大小写不敏感）                          | 否             |
| `creator`                   | **MUST NOT** 进提示词                                                                                                | 否             |
| `character_version`         | **MUST NOT** 进提示词；**MAY** 用于展示和排序                                                                        | 否             |
| `extensions`                | **MUST** 默认 `{}`；可放任意 JSON；**导入导出时 MUST NOT 销毁不认识的键**；**SHOULD** 用命名空间前缀防冲突           | 否             |

**关键设计点（对 PixelVault 有直接价值）**：规范把字段按「进不进提示词」硬性二分，并对每个字段写死 MUST/SHOULD。PixelVault 的卡也应该在字段注释里写死「这个字段进不进编译器」——项目里 `prisma/schema.prisma` 的角色卡 v2 字段注释已经在这么做（例如标注 "⛔ card-recipe-compiler 未接"），这个习惯值得保持。

### 1.3 V3（`spec: 'chara_card_v3'`，`spec_version: '3.0'`）

一手来源：https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md （2026-09-19 查阅）

V3 是 V2 的超集。新增字段：

| 字段                                  | 语义                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets[]`                            | `{ type, uri, name, ext }`。`type` 规范内置 `icon` / `background` / `user_icon` / `emotion`，自定义类型 **SHOULD** 以 `x_` 前缀。`uri` 支持 https / base64 data URL / `embeded://path`（规范拼写就是少一个 d）/ `ccdefault:`。多个 `icon` 时**必须且只能有一个** `name: 'main'` |
| `nickname`                            | 存在时，提示词里的 `{{char}}` / `<char>` / `<bot>` 用它替换 `name`                                                                                                                                                                                                              |
| `creator_notes_multilingual`          | `Record<ISO 639-1, string>`，按用户客户端语言显示                                                                                                                                                                                                                               |
| `source[]`                            | 卡的来源 ID 或 URL 数组；**SHOULD NOT** 由用户编辑；应用**只应追加不应删改**他人写入的元素                                                                                                                                                                                      |
| `group_only_greetings[]`              | 只在群聊里使用的额外开场白（必须存在，可为空数组）                                                                                                                                                                                                                              |
| `creation_date` / `modification_date` | Unix 秒时间戳，UTC；用户不可编辑；隐私考虑可填 `0`                                                                                                                                                                                                                              |

版本协商规则也写死了：`spec_version` 按 float 比较，**遇到更新的版本 SHOULD 提示用户但仍要支持导入**，不认识的字段 SHOULD 忽略但 MAY 保存以便安全导出。

### 1.4 卡的物理载体（三种）

一手来源同 V3 规范文档「Embedding Methods」节（2026-09-19 查阅）。

- **PNG / APNG 内嵌**：V2 写在名为 `chara` 的 tEXt chunk，V3 写在名为 `ccv3` 的 tEXt chunk，值都是 JSON 的 **UTF-8 → base64**。同时存在两个 chunk 时应用 **SHOULD** 用 `ccv3`。V3 允许把 V2 回填进 `chara` 做向下兼容，但回填时 **SHOULD** 在 `creator_notes` 里加一条"这张卡实际是 V3"的警告。
- **JSON**：文件本身就是一个 CharacterCardV3 对象。
- **`.charx`**：一个 zip，根目录必须有 `card.json`，其余资产按 `assets/{type}/images|audio|video|l2d|3d|ai|fonts|code|other/` 分目录；页面用 `embeded://path/to/asset.png` 引用。zip **SHOULD NOT** 加密，路径 **SHOULD** 只用 ASCII。规范明确说：新应用**不要**再用 PNG 多 tEXt chunk 塞资产，**改用 .charx**。

**这是全篇对 PixelVault 最有价值的一条**：`.charx` = 「一张卡 + 它的全部素材」打成一个压缩包，路径语义化、资产按用途分目录。PixelVault 的角色卡天然就是「一堆参考图 + 一段设定 + 一个音色」，`.charx` 的形状几乎是现成的答案。

---

## 2. 世界书（World Info / Lorebook）

一手来源：https://docs.sillytavern.app/usage/core-concepts/worldinfo/ （2026-09-19 查阅）；数据结构定义见上述 V2 / V3 规范文档的 `CharacterBook` / `Lorebook` 类型。

### 2.1 它是什么

官方定义：一个**动态字典**，只在消息文本里出现关联关键词时，才把对应条目插进提示词。官方还特意强调：别只把它当角色背景用，它是一个**通用的提示词管理工具**。

### 2.2 条目结构（规范字段）

`keys[]` · `secondary_keys[]` · `selective` · `content` · `enabled` · `insertion_order` · `case_sensitive` · `use_regex`(V3 新增，必填) · `constant` · `position`（规范里只有 `before_char` / `after_char`）· 可选的 `name` / `id` / `comment` / `priority`。
书级：`name` · `description` · `scan_depth` · `token_budget` · `recursive_scanning` · `extensions` · `entries[]`。

### 2.3 SillyTavern 实现里比规范丰富得多的机制（官方文档）

- **触发键支持正则**：键若是合法的 JS 正则（`/.../` 带 flag）就按正则匹配。纯文本键不支持逗号（逗号是分隔符），正则里可以有。
- **可选过滤器（secondary keys）的四种逻辑**：AND ANY / AND ALL / NOT ANY / NOT ALL。
- **插入位置远多于规范的两个**：Before Char Defs / After Char Defs / Before Example Messages / After Example Messages / Top of AN / Bottom of AN / **@ D（指定深度，0 = 提示词最底部）**，且 @D 可指定以 system / user / assistant 角色注入；还有 **Outlet**（不自动注入，存进具名插槽，由 `{{outlet::Name}}` 宏在任意位置手动拉取）。
- **Insertion Order 的方向**：数字**越大越靠近上下文末尾**、影响越大。
- **触发策略三态**：🔵 常驻（无需关键词）/ 🟢 关键词触发 / 🔗 向量相似度触发。
- **Probability（Trigger %）**：命中后仍按概率决定是否真的插入。
- **Inclusion Group + Group Weight + Prioritize Inclusion + Use Group Scoring**：同组条目同时命中时只插一条；默认按权重随机，可改为按 Order 确定性选择，或按"命中键数量最多者胜"。
- **Character Filter**：按角色名或标签白名单 / 黑名单限制条目生效范围。
- **Triggers**：限制条目只在某些生成类型下生效（Normal / Continue / Impersonate / Swipe / Regenerate / Quiet）。
- **Additional matching sources**：允许条目去匹配聊天之外的文本——角色 description / personality / scenario / persona description / character's note / creator's notes。
- **Timed Effects**：`sticky`（命中后持续 N 条消息）/ `cooldown`（命中后 N 条内不能再触发）/ `delay`（聊天满 N 条才允许触发）。
- **预算与递归**：`Context % / Budget` 限制世界书总 token；预算耗尽后**即使命中也不再插入**；常驻条目先插，然后按 Order 从大到小；**直接被关键词命中的条目优先级高于被其他条目内容递归带出来的条目**。递归有三个开关：不可被递归触发 / 触发后不再往下递归 / 只在递归阶段才允许触发（还带 Recursion Level 分层）。`Max Recursion Steps` 与 `Min Activations` 互斥。
- **Match whole words** 默认开启，官方明确提示：**中文日文这类不用空格分词的语言应该关掉**。
- **来源合并策略**：Chat Lore → Persona Lore → Character Lore / Global Lore，后两者有三种排序策略（Sorted Evenly 默认 / Character Lore First / Global Lore First）。

### 2.4 V3 的「装饰器」（decorators）

V3 规范用 `content` 正文里以 `@@` 开头的行来表达这些高级行为，而不是继续加字段；不认识的装饰器应忽略；自定义装饰器也用 `@@` + snake_case；还支持 `@@@` 写"降级装饰器"。规范内置约 20 个：`@@activate_only_after` `@@activate_only_every` `@@keep_activate_after_match` `@@dont_activate_after_match` `@@depth` `@@instruct_depth` `@@reverse_depth` `@@reverse_instruct_depth` `@@role` `@@scan_depth` `@@instruct_scan_depth` `@@is_greeting` `@@position` `@@ignore_on_max_context` `@@additional_keys` `@@exclude_keys` `@@is_user_icon` `@@dont_activate` `@@activate` `@@disable_ui_prompt`。
另有花括号宏：`{{char}}` `{{user}}` `{{random:A,B,C}}` `{{pick:A,B,C}}` `{{roll:N}}` `{{// A}}` `{{hidden_key:A}}` `{{comment: A}}`。
（一手来源：V3 规范文档 Decorators 与 Curly Braced Syntaxes 两节，2026-09-19 查阅）

**对 PixelVault 的判断**：装饰器这种「把控制信息写进正文」的做法**不要借**——它是为了在既定 JSON 规范里塞新语义的妥协，PixelVault 自己定 schema，没有这个约束，写进正文只会让编译器解析变脆。但「一条设定 = 关键词 + 正文 + 位置 + 预算权重」这个条目模型值得借。

---

## 3. Persona（用户人设）与角色卡的区别

一手来源：https://docs.sillytavern.app/usage/core-concepts/personas/ （2026-09-19 查阅）

- **角色卡 = AI 扮演的那一方；Persona = 用户自己扮演的那一方**（显示名 + 头像 + 可选描述文本）。
- Persona 描述的注入位置是**每个 persona 独立保存**的：None / In Story String（默认）/ Top of AN / Bottom of AN / In Chat @ Depth（可配深度和角色）。
- Persona 有 **Title** 字段，明确「不进提示词，只在管理面板显示」。
- **Persona 锁定三态**：锁到某个聊天 / 锁到某个角色 / 全局默认 persona。可开启「允许一个角色关联多个 persona」，这时开新聊天会弹窗让你选。
- 任何角色卡可以「Convert to Persona」，但只带过去 name 和 description，scenario / personality 不带。
- Persona 也能绑一本自己的世界书（Persona Lore），只要该 persona 激活就生效，与开哪个角色无关。

**对 PixelVault 的判断**：PixelVault 没有"用户扮演的一方"，Persona 这个概念**整体不适用**。但**「同一个实体可以携带自己的一本知识库 / 一组默认注入」这个正交性**值得借：PixelVault 里能携带注入的实体有角色卡、风格卡、场景卡、项目（Project）四类，它们的注入合并顺序需要像酒馆的 Lore Insertion Strategy 一样**明确写死并可配**，否则三卡融合会出现谁盖谁的歧义（项目里 `card-recipe-compiler.service.ts` 正是这个合并点）。

---

## 4. 作者注释（Author's Note）与深度注入

一手来源：https://docs.sillytavern.app/usage/core-concepts/authors-note/ 和 https://docs.sillytavern.app/usage/core-concepts/characterdesign/ （2026-09-19 查阅）

- **Author's Note**：一段可插到提示词任意位置、任意频率的文本。位置二选一：After Scenario（靠上下文顶部）或 In-chat @ Depth（Depth 0 = 聊天历史最末尾）。官方原话的要点是：**越靠提示词底部，对下一次生成的影响越大**。频率 N 表示每 N 次用户输入插一次，0 = 从不插入。分「当前聊天的 AN」和「新聊天默认 AN」两格。
- **Character's Note（角色自带的深度注入）**：角色卡编辑器 Advanced Definitions 里的字段，按 `@ Depth` + `Role`（User / System / Assistant）**固定钉在聊天历史的某个深度**，不随对话推进而漂走，用来反复强化某个特征。
- 注意联动：**如果 Author's Note 的频率设为 0，世界书里所有 Top of AN / Bottom of AN 位置的条目会被直接忽略**——这是一个典型的"位置依赖另一个开关"的坑。

**对 PixelVault 的判断**：「深度注入」在对话里的意义是"抗遗忘"；在图像 / 视频生成里没有聊天历史，所以**深度机制不适用**。但它背后的诉求——**「有些约束必须每次生成都在场，且要放在提示词里最有分量的位置」**——完全适用，对应到 PixelVault 就是「角色卡的身份锚点（identity）必须无条件进每一条编译产物，且放在 provider 最吃的那个槽位」。

---

## 5. 群聊：多角色如何组织

一手来源：https://docs.sillytavern.app/usage/core-concepts/groupchats/ （2026-09-19 查阅）

- **回复顺序策略四选一**：Manual（手动指定 / `/trigger`）、Natural Order、List Order、Pooled Order（随机挑一个本轮还没说过话的）。
- **Natural Order 的算法**（官方列明三步）：① 从最后一条消息里抽取被提到的成员名——**只认整词**，"Misaka Mikoto" 只会被 "Misaka" 或 "Mikoto" 激活，不会被 "Misa" 激活；② 按 **Talkativeness**（0%~100%，默认 50%）概率激活未被点名的角色；③ 若前两步谁都没激活，随机选一个。
- **群里角色卡信息的两种处理模式**：
  - **Swap character cards（默认）**：每次生成只把**当前发言者**的卡放进上下文。
  - **Join character cards**：把所有成员的卡合并成一段联合 prompt，合并的字段是 description / scenario / personality / message examples / character notes。可选包含或排除被静音的成员；可配 Join Prefix / Suffix 给每段加分隔（支持 `{{char}}` 和 `<FIELDNAME>` 宏）。官方**明确警告**这种模式会导致角色互相串味、人格融合、特征不确定。
- 无论哪种模式，**聊天历史始终是全体共享的**。
- 成员可被 Mute。
- V3 的 `group_only_greetings` 就是为群聊准备的额外开场白。

**对 PixelVault 的判断**：这一段的价值在于那句警告。**「把多张卡的文本拼成一段 prompt 会让角色互相串味」正是多角色同框生成最典型的失败模式**（A 的服装长到 B 身上）。酒馆的解法是默认 swap（一次只放一个），PixelVault 做多角色同框时对应的解法应该是：**按角色分槽而不是拼文本**——每个角色占据独立的 referenceSlot 组 + 独立的 `@名字` 锚，而不是把两段 characterPrompt 串起来交给 LLM 融合。Join 模式的 Prefix/Suffix 分隔思路，可以作为退化路径（provider 不支持多参考图时）的兜底。

---

## 6. 导入 / 导出 / 分享生态

一手来源：

- 卡的载体格式：V3 规范 Embedding Methods 节（同上）
- 角色绑定世界书的导出行为：https://docs.sillytavern.app/usage/core-concepts/worldinfo/ —— 「When exporting the character, this file will also get embedded in the character card data」，但**只有主世界书会随卡导出**，附加挂的不会。
- 标签生态：https://docs.sillytavern.app/usage/core-concepts/tags/ （2026-09-19 查阅）
- 表情素材包：https://docs.sillytavern.app/extensions/expression-images/ （2026-09-19 查阅）
- Data Bank（RAG 附件）：https://docs.sillytavern.app/usage/core-concepts/data-bank/ （2026-09-19 查阅）

要点：

- **一张 PNG 就是一张卡**，可以在任何聊天工具、图床、论坛里当普通图片传播，落地即可用。这是整个生态得以成立的根。
- **标签是导入时的一等公民**：卡里有 `tags`（编辑器里叫 "Tags to Embed"），导入时**不默认接受**，而是弹一个「Existing tags / New tags」两栏的确认框，可逐条裁剪，也可一键 Import All / Import Existing / Import none。标签还能整体备份还原（含颜色、文件夹设置），并能把某个标签变成「虚拟文件夹」（打开 / 关闭两态）来组织卡库。筛选是三态点击：有此标签 → 无此标签 → 不筛选。
- **批量操作**：Bulk edit 选中多张卡后右键批量打标签，支持"移除全部标签"和"移除这批卡的公共标签"。
- **表情素材包（sprite pack）以 ZIP 导入**：一个角色的多张表情图按约定文件名平铺在 zip 里，一次导入全部落到该角色目录。注意——**这些 sprite 是本地资产，不随角色卡导出**（V3 的 `assets` + `.charx` 就是为了修掉这个缺口）。
- **Data Bank 附件同样不随角色卡导出**（官方明确写了）。

### 6.1 卡库界面（Character Management Panel）

一手来源：https://docs.sillytavern.app/usage/characters/ （2026-09-19 查阅）

- **列表操作四件**：Create New Character / Import Character（本地文件）/ **External Import（按 URL 直接拉卡）** / Create Group。
- **排序下拉五组**：字母（A-Z / Z-A）· 时间（最新 / 最旧）· **使用度（最近使用 / 聊天最多 / 最少）**· **体量（token 最多 / 最少）**· 特殊（收藏 / 随机）。
- **筛选**：收藏过滤 / 只看群组 / **标签当文件夹（tag hierarchy）** / 管理标签 / 清除全部筛选；搜索框按名称或属性过滤。
- **卡详情页的快捷动作**：收藏 · 高级定义 · 角色世界书 · 聊天世界书 · **导出** · **复制（Duplicate）** · 删除。
- **扩展菜单**：世界书关联 · **卡内世界书导入（Card lore import）** · 场景覆盖 · 转为 Persona · 重命名 · **Source linking** · **Replace/Update（用新卡替换旧卡但保留聊天）** · 标签导入 · **Gallery view**。
- 卡详情页显示 **Token Count** 和使用统计（聊过多少次）。

**对 PixelVault 的价值**：这是一个"卡越来越多之后必须长出来的"完整功能集。其中三条特别值得抄：**按使用度排序**（归档产品里"最近用过的角色"比"最近创建的角色"有用得多）、**Duplicate**（做变体的最短路径，PixelVault 的变体树需要这个入口）、**Replace/Update**（用新版卡替换旧卡但保留下游关联——对应 PixelVault 的"重新建卡但保留 `GenerationCharacterCard` 关联"）。

- 角色卡分享站：社区主要在 chub.ai / characterhub 这类站点流通 PNG 与 JSON；SillyTavern 提供「Import content from external URL」按钮直接按 URL 拉卡。（该按钮见上述 tags 文档中对导入流程的描述；卡站本身属于第三方社区，未在官方文档中背书。）

---

## 7. sillytaverncn.com（中文站）

一手来源：https://sillytaverncn.com/ 及其子页（2026-09-19 查阅，静态站 Retype 4.6.0，可直接抓）。

### 7.1 站点性质：不是官方中文镜像，是 API 中间商的引流文档站

首页自称「酒馆 SillyTavern 中文官方文档」，但 SillyTavern 官方无此授权说法。内容由两部分拼成：

- **主体**：`docs.sillytavern.app` 的中文译文，目录结构（`installation/` `usage/` `extensions/` `for-contributors/` `administration/`）与官方一一对应，图片也是官方原图同名搬运。
- **自有页面**：`/siltytavern-intro/` `/install/` `/api-setup/` `/faq/` `/character-cards/` `/tts/` `/simple-tavern/`，全部导向自家商业产品——`deepseektavern.com`（卖 API Key）、`launch.deepseektavern.com`（一键启动器，实为第 8 节那个 `leigegehaha/sillytavernlauncher` v2.0.2 经 ghfast.top 加速）、`chat.deepseektavern.com`（在线版「简易酒馆」）、`cards.deepseektavern.com`（自家卡站）。

抓取小技巧（备查）：导航树在 `https://sillytaverncn.com/resources/js/config.js` 的 `__DOCS_CONFIG__.sidebar`；每页都有 Markdown 原文（`<link rel="alternate" type="text/markdown">`，如 `https://sillytaverncn.com/character-cards.md`）；**404 返回 HTTP 200**，探测要看 `<title>`。

### 7.2 对「了解角色卡」的增量价值：接近于零

- 自有的《角色卡指南》 https://sillytaverncn.com/character-cards/ **全文约 490 字节**，只有三段：角色卡是什么（一句话）、去 `cards.deepseektavern.com` 下载（分类：RPG 跑团 / 男性向 / 正常向 / 整活类 / 抽象卡 / 工具卡）、导入四步。**没有字段说明，没有创建教程。**
- 真正有信息量的两页是官方译文：https://sillytaverncn.com/usage/characters/ （角色管理面板全解）和 https://sillytaverncn.com/usage/core-concepts/characterdesign/ （字段中文解释最全）。读官方英文原页会得到同样甚至更新的内容。
- **全站没有 PNG 内嵌元数据（tEXt / base64 `chara` chunk）的任何说明**，也**没有角色卡规范版本 V1/V2/V3 的说明页**。全站唯一一处规范引用在开发者页 https://sillytaverncn.com/for-contributors/writing-extensions/ ，指向 `character-card-spec-v2` 的 `extensions` 字段，用来教扩展作者读写卡片扩展数据。
- 规律：**站方自己重写过的页面都被压成几百字节的要点卡片，原样搬运官方译文的页面才完整**。世界书 https://sillytaverncn.com/usage/core-concepts/worldinfo/ 只有约 990 字节且是**孤儿页**（不在侧边栏、不在 sitemap）；Persona 约 355 字节；群聊约 300 字节残页。正则 `/extensions/regex/`（约 9.6KB）和 Prompt Manager（约 9.4KB）反而完整，因为是直译。

### 7.3 中文分享生态（本站口径）

- **只推自家一个卡站** `https://cards.deepseektavern.com`（宣称上千张免费角色卡，六个分类同上）。
- **全站没有提到 chub.ai / characterhub / Janitor AI / Venus / Backyard，也没有 QQ 群、Discord 或其他国内卡站**。
- 提到的导入路径只有两条：本地 PNG 导入；从其他前端迁移聊天记录（https://sillytaverncn.com/usage/core-concepts/chatfilemanagement/ ，可互导的生态列了 TavernAI、oobabooga、Agnai、KoboldAI Lite、RisuAI）。

### 7.4 截图

**站内不存在角色卡编辑器、世界书编辑器、角色列表的界面截图**——`/character-cards/`、`/usage/characters/`、`/usage/core-concepts/characterdesign/`、`/worldinfo/`、`/personas/`、`/groupchats/` 这几页一张图都没有。站上 108 张非 logo 图全部是官方文档搬运，与角色卡最接近的几张是首次使用流程和聊天界面：

- https://sillytaverncn.com/static/quick-start/1_name.png 、`2_api_conn.png`、`4_horde_models.png`、`5_msg.png`、`6_success.png` —— 首次使用流程
- https://sillytaverncn.com/static/chatbox.png 、`chatmessage.png`、`input_spec.png` —— 聊天界面
- https://sillytaverncn.com/static/extensions/regex-editor.png 、`regex-listview.png` —— 正则扩展编辑器
- https://sillytaverncn.com/static/extensions/note-panel.png 、`note-menu.png` —— 作者注释面板
- https://sillytaverncn.com/static/extensions/expression-drawer.png —— 表情素材抽屉（多姿态素材管理界面，对 PixelVault 的三视图管理最有参考价值的一张）

（均未下载，仅做可达性校验。这几张官方站同样提供，路径相同。）

### 7.5 结论

**owner 想参考酒馆角色卡设计的话，中文站不是有效入口**。有效入口是三个：`character-card-spec-v2` / `character-card-spec-v3` 两个规范仓库（字段权威），`docs.sillytavern.app` 的 World Info / Character Design / Group Chats 三页（机制权威），以及第 8 节那个启动器（交互参考）。

---

## 8. sillytavernlauncher（启动器 / 管理器）

一手来源：https://github.com/leigegehaha/sillytavernlauncher 及其 GitHub API / raw 源码（2026-09-19 查阅）。

### 8.1 它是什么

**Tavern Deepseek Launcher**——SillyTavern 的**中文向一键安装 + 启动 + 资源管理桌面客户端**，Tauri v2（Rust）+ Vue 3 + Vite + Tailwind，产物覆盖 macOS DMG（x64/aarch64）、Windows NSIS、Linux deb/AppImage/rpm。README 自述基于上游 `al01cn/sillyTavern-launcher` 开发（上游 https://github.com/al01cn/sillyTavern-launcher ）。

活跃度（2026-09-19 GitHub API 读数）：star 25 · fork 2 · open issues 0 · MIT · 默认分支 `master` · created 2026-06-09 · **last push 2026-06-12，近三个月无提交**。最新 release **v2.0.2（2026-06-12）**，Windows `x64-setup.exe` 下载 18,205 次、Apple Silicon DMG 2,841 次，安装包 178–322MB（内置了 SillyTavern 本体 + Node.js + 105 张中文角色卡）。

**这是一个小众、停更、但下载量不低的中文社区工具**——它的价值不在代码质量，在于它替中文用户做过的那套「资源库」交互取舍。

### 8.2 资源管理页的组织方式（最值得看的一页）

`src/views/Resources.vue` 实测：

- **七个 tab 统一收纳异构资产**：角色卡 / 世界书 / 对话历史 / 预设 / 正则 / 内置角色卡 / 内置预设。五种完全不同的文件类型不开五个入口，收进一页。
- **卡片网格**：角色卡 2:3 竖版缩略图，`grid-cols-2 → xl:grid-cols-5`，懒加载；世界书用 1→4 列信息卡。
- **分页**：角色卡每页 10、其余每页 20，按修改时间倒序。
- **"选择模式"而非常驻复选框**：默认 hover 才出删除按钮；点"批量操作"进入多选态，出现「本页全选 / 已选 N 项 / 删除选中 / 退出选择」。
- **导入是逐文件状态机 + 导入前预览**：点击或拖拽、可多选（.png / .json / .js），每个文件走 验证中 → 有效或无效 → 待导入 → 导入中 → 成功或失败；**并且在导入前就解析出角色卡详情**（作者、简介、标签、创建日期、规范版本、内嵌世界书的条目及其 position / 深度 / 关键词 / 内容）让用户确认。
- **内置卡库按 11 个中文分类分 tab**（正常向 / 同人 / 修仙 / 古风 / 校园 / 欧美 / 纯爱 / English Cards / 单人 / 双人 / 整活），每类带 emoji + 一句话说明 + 数量，单卡「导入」+ 分类级「**一键导入全部**」。
- **资源迁移向导（三步）**：① 多选来源实例 + 按分类排除（角色卡 / 扩展 / 聊天历史 / 世界书 / 主题 / 备份）+ 给某个来源标「优先」（最后写入，冲突以它为准）；② 冲突文件逐个覆盖 / 跳过，带「全部覆盖 / 全部跳过」批量键和实时「覆盖 X · 跳过 Y」汇总，`settings.json` 这类可安全合并的结构化文件自动深度合并不打扰用户；③ 迁移进度与结果。

其余功能（不是重点，列以备查）：断点续装 checkpoint（`START / GIT_DONE / NODE_DONE / ST_DOWNLOADED / DONE`）、版本管理（在线版本列表 + 全盘扫描已有实例 + **"解绑"与"删除"分开**）、GitHub 加速节点测速、npm 源切换、config.yaml 全量可视化配置、扩展的 Git URL / zip 安装与版本兼容性检查、局域网/公网启动模式（公网模式列出四条具体风险 + 建议先开 Basic Auth + 「不再提醒」）。

### 8.3 截图（公开 URL，未下载）

| URL                                                                                                  | 界面                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------- |
| https://raw.githubusercontent.com/leigegehaha/sillytavernlauncher/master/assets/media/启动页.png     | 一键启动首页           |
| https://raw.githubusercontent.com/leigegehaha/sillytavernlauncher/master/assets/media/角色卡资源.png | 资源管理页的角色卡网格 |
| https://raw.githubusercontent.com/leigegehaha/sillytavernlauncher/master/assets/media/教程.png       | 小工具 / 教程页        |
| https://raw.githubusercontent.com/leigegehaha/sillytavernlauncher/master/assets/media/demo视频.mp4   | README 内嵌演示视频    |

（界面归属取自 README 中图片上方的中文小标题，未逐像素核对。）

### 8.4 值得借 / 不值得借

**值得借**（按可借鉴度）：

1. **导入前先解析元数据并展示，再让用户确认落库**——不是黑箱进度条。PixelVault 导入外部图片建卡时应同样：先抽出角色属性 / 生成参数 / 来源，展示，再写。
2. **冲突合并向导**：多来源 + 分类排除 + 「优先来源」+ 逐项覆盖/跳过 + 批量键 + 实时汇总 + 结构化文件自动深合。PixelVault 的对应场景是「同一个角色被建了两张卡」「导入他人卡与自有卡重名」。
3. **一个页面 tab 化收纳异构资产**：角色卡 / 风格卡 / 场景卡 / 音色卡本质是四种卡，应该同页切 tab，不是四个路由。
4. **"内置库 / 我的库"分栏**：官方精选素材与用户归档并列但不混流。
5. **"选择模式"而非常驻复选框**：保持画廊纯净又能批量操作。
6. **"移出列表"与"永久删除"是两个动作、两种文案**（它的"解绑"vs"删除"）——对一个以永久归档为卖点的产品尤其重要。
7. **能力缺失不禁用 UI 而是给直达安装入口**——与 PixelVault 现有 Hard Rule 8（缺 API key 路由到 `QuickSetupDialog`）是同一条原则的独立佐证。
8. **风险操作给具体后果清单而非泛泛警告**（公网模式那四条）。

**明确不要抄的**：

- 105 张内置卡**只有分类 tab，没有搜索、没有标签筛选、没有排序**，每页仅 10 张——库一大就只能靠翻页硬找。更刺眼的是：**标签数据已经从卡里解析出来了，却只在详情弹窗里做只读展示，没接成筛选器**。归档类产品必须把已解析出的元数据直接变成可点的筛选维度。
- **只有导入没有导出**，备份完全甩给 SillyTavern 自身的 config.yaml 策略。以"永久归档"为卖点的产品不能这样。

---

## 9. 对 PixelVault 的逐条取舍

PixelVault 的现状（读自 `prisma/schema.prisma` 与 `docs/references/domains/cards.md`，2026-09-19）：`CharacterCard` 已有 `name` / `description` / `characterPrompt` / `modelPrompts` / `attributes` / `referenceImages` / `referenceRoles` / `loras` / `tags[]` / `stabilityScore` / `voiceCardId` / `voiceProfile` / `persona` / `allowedStyleRange` / `provenance` / `version` / 变体树 `parentId`；v3 方向已定为把 `referenceImages` + `referenceRoles` 合并成 `referenceSlots{role,url,cardId,cardName}[]`。下面的取舍以这个现状为基准。

### 9.1 可直接借（附借的理由和落点）

| 酒馆机制                                                                                                                                                                               | 借成 PixelVault 的什么                                                                                                                                           | 为什么值得借                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions` + "导入导出不许销毁不认识的键" + 键要带命名空间                                                                                                                           | 卡上加一个 `extensions Json` 逃生舱，并把这条规则写进 `docs/references/domains/cards.md`                                                                         | 卡片域还在长，每加一个想法就加一列会把 schema 拖死。酒馆用这一个字段撑住了整个第三方生态三年                                              |
| 字段按"进不进提示词"硬性二分（`creator_notes` **MUST NOT**，`system_prompt` **MUST**）                                                                                                 | 每个卡字段的 Prisma 注释里写死"进不进 `card-recipe-compiler`"                                                                                                    | 项目里已经在这么写（角色卡 v2 字段注释标了 "⛔ compiler 未接"），继续保持；这是防止"字段悄悄进了 prompt"的唯一办法                        |
| `character_book` / lorebook：关键词触发的条目注入                                                                                                                                      | **条件提示词条目**：`{ keys[], content, slot, order, enabled }`。例：keys=["雨","雨夜"] → content="撑一把黑伞，发梢湿"；keys=["战斗"] → content="左颊疤痕更明显" | 现在一张卡只有一段死的 `characterPrompt`，要么全塞（撑爆 prompt、稀释重点）要么不塞。条件注入是**用 prompt 预算换表达力**的唯一正解       |
| lorebook 的 `token_budget` + "预算耗尽即使命中也不插" + 常驻优先、Order 大者优先                                                                                                       | 编译器的 prompt 预算裁剪策略                                                                                                                                     | 各 provider 的 prompt 长度上限差异很大（这是 PixelVault 真实存在的问题），裁剪必须是**确定性的、可解释的**，不能让 LLM 随机丢             |
| `constant`（无需关键词、永远在场）                                                                                                                                                     | 角色卡的**身份锚点**永远无条件进每一条编译产物                                                                                                                   | 对应 Author's Note 那条原则："必须每次都在场的约束，要放在最有分量的位置"                                                                 |
| "Match whole words 默认开，但中日文必须关"（官方明确警示）                                                                                                                             | 若做关键词触发，**中文默认 `matchWholeWords=false`**                                                                                                             | 直接避坑，不用自己踩                                                                                                                      |
| `alternate_greetings`（一张卡携带多个可切换的起手）                                                                                                                                    | **多个默认起手镜头 / 姿态预设**：一张卡带 3~5 个预置构图，生成时切换                                                                                             | 借的是"一张卡携带多个可切换的默认值"这个**形状**，不是对话语义                                                                            |
| V3 `assets[]` 的 `{type, uri, name, ext}`，且"多个 icon 时必须**恰有一个** `name:'main'`"                                                                                              | `referenceSlots[]` 的形状，并给 `identity` 槽加**恰有一个 primary** 的硬约束                                                                                     | 这是酒馆已经踩过的坑：一个角色有多张图时，下游必须能无歧义地拿到"主图"。PixelVault 的 `identity` 槽同理，没有这个约束，编译器只能靠顺序猜 |
| V3 `source[]` 的"只追加、不删改他人写入的元素"                                                                                                                                         | `provenance` 的写入语义定为**追加**，不覆盖                                                                                                                      | 归档产品的血缘链一旦可被覆盖就失去价值                                                                                                    |
| V3 `nickname`（提示词里替换 `{{char}}` 的短名）                                                                                                                                        | **`handle`**：prompt 里 `@名字` 的稳定锚点，与展示名分开                                                                                                         | 展示名会变（"林夏（雨夜版）"），prompt 锚点不能变，否则跨次生成的一致性断掉。owner 提的"代表角色说话"就落在这个字段上                     |
| `creator_notes`（给人看，**不给模型看**）                                                                                                                                              | 卡上单独一个"简介"字段                                                                                                                                           | 现在 `description` 语义混淆：既像给人看的简介，又被当视觉描述编译。必须拆开                                                               |
| `tags` 的整套生态：导入时弹「Existing / New」两栏确认框可逐条裁剪、三态筛选（有 → 无 → 不筛）、标签当虚拟文件夹（开 / 关两态）、批量打标（含"移除这批卡的公共标签"）、标签整体备份还原 | 卡库的组织方式                                                                                                                                                   | 这套交互是被几万用户的卡库验证过的。PixelVault 已有 `tags[]` 但没有这套 UI                                                                |
| 表情素材包 **ZIP 批量导入**（平铺 + 约定文件名 → 落到该角色目录）                                                                                                                      | 三视图 / 多姿态参考图的批量导入                                                                                                                                  | 建卡向导"补三视图"那一步的现成交互                                                                                                        |
| Lore Insertion Strategy 三种排序（Sorted Evenly / Character First / Global First）                                                                                                     | **三卡 + 项目级设定的合并顺序必须显式定义并可配**                                                                                                                | 角色卡 / 风格卡 / 场景卡融合时谁盖谁，现在靠 `card-recipe-compiler` 的 LLM 隐式决定。酒馆的做法是把它变成一个明确的、用户可见的策略       |
| 群聊 Join 模式的官方警告："合并多张卡会导致角色串味、人格融合"                                                                                                                         | **多角色同框时按槽分，不拼文本**                                                                                                                                 | 这是最值钱的一条负面经验，见下                                                                                                            |

另外三条来自卡库界面（第 6.1 节），单独点名：**按使用度排序**（归档产品里"最近用过的角色"远比"最近创建的角色"有用）、**Duplicate**（做变体的最短路径，PixelVault 的变体树正缺这个入口）、**Replace/Update**（用新版卡替换旧卡但保留下游关联——对应 PixelVault 的"重新建卡但保留 `GenerationCharacterCard` 关联与 provenance"）。

**关于多角色同框，展开说**：酒馆默认用 Swap（一次只把当前发言者的卡放进上下文），而不是 Join，就是因为 Join 会串味。映射到 PixelVault，「A 的服装长到 B 身上」正是同一个失败模式。所以多角色同框的正确形状是：**每个角色占据独立的 referenceSlot 组 + 独立的 `@handle` 锚**，而不是把两段 `characterPrompt` 串起来交给 LLM 融合。酒馆 Join 模式的 Prefix/Suffix 分隔思路，只能当 provider 不支持多参考图时的退化兜底。

### 9.2 明确不适用（不要为了"对齐酒馆"而建这些列）

| 酒馆字段 / 机制                                                                | 不适用的理由                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first_mes` · `mes_example`（含 `<START>` 分隔） · `post_history_instructions` | 纯对话导向。PixelVault 的生成没有"第一条消息"和"对话样例"                                                                                                                                                      |
| `system_prompt`（默认**替换**用户全局 system prompt）                          | 让一张用户导入的卡有权覆盖全局系统提示词，在一个有 credit 扣减和内容合规要求的产品里是安全问题，不是特性                                                                                                       |
| `talkativeness` · 群聊四种回复顺序策略                                         | 依赖"轮流发言"这个时间轴，图像 / 视频生成没有                                                                                                                                                                  |
| Persona（用户人设）                                                            | PixelVault 没有"用户扮演的一方"。⚠ **PixelVault 现有的 `persona` JSON 字段与酒馆的 Persona 同名异义**（PixelVault 的是"角色的行为与说话方式"，服务于对白和音色），文档里必须写清，否则每个读过酒馆的人都会误解 |
| Author's Note / Character's Note 的 `@Depth` 深度注入                          | 深度是"距离聊天历史末尾第几条"，没有聊天历史就没有深度。诉求（"必须每次在场的强约束"）用 `constant` 条目承接即可                                                                                               |
| Timed Effects：`sticky` / `cooldown` / `delay`                                 | 时间轴单位是"消息条数"                                                                                                                                                                                         |
| 递归触发（recursive scanning）                                                 | 在图像 prompt 场景里价值低、风险高：容易把 prompt 递归撑爆且结果不可预测。真要做也应该是显式的"条目引用条目"，不是靠正文里恰好出现关键词                                                                       |
| `probability`（Trigger %）随机插入                                             | 生成要可复现（同 seed 同结果）。随机性交给 seed，不要交给 prompt 装配                                                                                                                                          |
| V3 的 `@@` 装饰器（把控制信息写进 content 正文）                               | 那是为了在既定 JSON 规范里塞新语义的妥协。PixelVault 自己定 schema，没有这个约束，写进正文只会让编译器解析变脆                                                                                                 |
| PNG tEXt chunk 塞多个资产                                                      | **V3 规范自己都说新应用不要这么做，改用 `.charx`**。PixelVault 一张角色卡有 3~10 张参考图，塞 PNG 更不现实                                                                                                     |

### 9.3 PixelVault 独有、酒馆完全没有的（这些是不能靠抄解决的）

1. **参考图槽（referenceSlots）带生成语义**。酒馆 V3 的 `assets` 只有 `icon` / `background` / `user_icon` / `emotion` 四种，全是**展示用途**。PixelVault 的 11 类 role（`identity` / `pose` / `style` / `composition` / `background` / `faceCloseup` / `costume` / `prop` / `frameStart` / `frameEnd` / `custom`，见 `src/constants/node-studio.ts`）是**给生成器用的功能语义**——"这张图在这次生成里承担什么职责"。酒馆没有任何对应概念。
2. **音色绑定是一等公民**。酒馆的 TTS 是第三方扩展，规范层面没有 voice 字段（V3 `assets` 允许 audio 但没有语义）。PixelVault 的 `voiceCardId`（软引用）+ `voiceProfile{emotions, sampleLines}` 要参与**视频编译**（例如 Vidu 的 `voice_id`）和配音间 `VoiceRoom.cast`。
3. **一致性检查闭环（stabilityScore + 精修）**。聊天没有客观的"像不像"，图像有。PixelVault 有 `stabilityScore` 和 `character-refine.service.ts`——**卡能自我评估、能被修**。酒馆整个生态里没有任何等价物。
4. **跨 provider 编译**。酒馆的 prompt 是纯文本，所有 LLM 接口同构，所以规范只需要定义文本字段。PixelVault 面对的是形状各异的 API：有的吃一张参考图、有的吃多张带 role、有的只吃文本、有的吃 LoRA 权重。**「一张卡 → N 个 provider 的参考槽」这个编译是 PixelVault 的核心难题，酒馆完全没有对应物**，`modelPrompts: Record<adapterType, prompt>` 已经是这条路的雏形。
5. **LoRA 绑定与训练血缘**。卡可以携带为它训练出来的 LoRA（`loras` + `LoraTrainingJob` 关系）。酒馆没有。
6. **变体树**（`parentId` / `variantLabel`）。同一角色的"动画版 / 3D 版 / Q 版"是父子关系且变体随父卡删。酒馆只有扁平卡列表 + 一个 `character_version` 字符串。
7. **生成物反向关联**（`GenerationCharacterCard`）。归档产品必须能回答"这张卡生成过哪些图 / 哪些视频"。酒馆的卡与聊天记录是弱关联。

---

## 10. PixelVault 角色卡 v3 字段草案

**落 Prisma 还是 JSON `extensions` 的判据**（先写死，再填表）：

- **进 Prisma 列**：需要被查询 / 排序 / 索引 / 外键约束，或已经被 `card-recipe-compiler` 读取的字段。
- **进 `extensions`（或先进 `extensions` 观察）**：形状还没定、只被单一消费者读写、不参与查询的字段。等它稳定且出现第二个消费者，再提成正式列。
- 表中「现有」= 已在 `prisma/schema.prisma` 的 `CharacterCard` 上。

### 身份与展示

| 字段                      | 来源                         | 用途                                                                                                      | 落点                                               |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `id` `userId` `projectId` | 自有                         | 归属与 owner-scoped 查询                                                                                  | Prisma（现有）                                     |
| `name`                    | 借（V1 `name`）              | 展示名，可变                                                                                              | Prisma（现有）                                     |
| `handle`                  | **借（V3 `nickname`）**      | prompt 里 `@名字` 的稳定锚点，短、user 作用域内唯一、与展示名解耦。owner 说的「卡片代表角色说话」落在这里 | **Prisma 新列**（需查询 + 唯一约束）               |
| `description`             | 借（V1），但**收窄语义**     | **只放视觉描述**（外观 / 体态 / 服饰基调），进编译器                                                      | Prisma（现有，需在注释里写死"只写视觉，不写简介"） |
| `summary`                 | **借（V2 `creator_notes`）** | 给人看、**⛔ 不进 prompt** 的简介，卡库列表与详情页显示                                                   | **Prisma 新列**（列表要读）                        |
| `tags[]`                  | 借（V2 `tags`）              | 筛选 / 虚拟文件夹 / 批量打标，**⛔ 不进 prompt**                                                          | Prisma（现有）                                     |
| `status`                  | 自有                         | `DRAFT` / `READY`，建卡向导的进度                                                                         | Prisma（现有）                                     |

### 视觉与编译

| 字段                | 来源                                    | 用途                                                        | 落点                |
| ------------------- | --------------------------------------- | ----------------------------------------------------------- | ------------------- |
| `characterPrompt`   | 自有                                    | 编译器主文本                                                | Prisma（现有）      |
| `attributes`        | 自有                                    | 结构化外观，**一致性检查的比对基准**                        | Prisma（现有 JSON） |
| `modelPrompts`      | **自有（酒馆没有）**                    | `Record<adapterType, prompt>`，跨 provider 编译产物         | Prisma（现有 JSON） |
| `negativePrompt`    | 自有                                    | 一致性护栏（"不要多手指 / 不要改瞳色"）                     | `extensions` 起步   |
| `loras[]`           | **自有（酒馆没有）**                    | 角色专属 LoRA `{url, scale}`                                | Prisma（现有 JSON） |
| `allowedStyleRange` | 自有（受 ST **Character Filter** 启发） | `{allowStyleCardIds[], denyTags[]}`，限制这张卡可搭配的风格 | Prisma（现有 JSON） |

### 参考图（卡片总线）

| 字段                   | 来源                                         | 用途                                                                                                                                                                                        | 落点                                                                                                       |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `referenceSlots[]`     | **借 V3 `assets[]` 的形状 + 自有 role 词表** | `{ role, url, cardId, cardName, isPrimary }`。role 取 `NODE_STUDIO_REFERENCE_ROLES` 11 类；**`identity` 槽必须恰有一个 `isPrimary`**（抄 V3 "多个 icon 时 `name:'main'` 必须且只能有一个"） | Prisma JSON——v3 合并 `referenceImages` + `referenceRoles`，方向已定，⛔ 不要在 `referenceRoles` 上再叠语义 |
| `sourceImageEntries[]` | 自有                                         | 建卡来源图 + `viewType`（三视图）                                                                                                                                                           | Prisma（现有 JSON）                                                                                        |
| `posePresets[]`        | **借 V2 `alternate_greetings` 的形状**       | 这张卡的 3~5 个"默认起手"（姿态 / 构图），生成时可切换                                                                                                                                      | `extensions` 起步                                                                                          |

### 音色

| 字段           | 来源                                   | 用途                                                                                                                           | 落点                         |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `voiceCardId`  | **自有（酒馆没有）**                   | 默认嗓子，软引用（删音色卡只清绑定）                                                                                           | Prisma（现有，带 `@@index`） |
| `voiceProfile` | **自有**                               | `{ emotions[{label,params}], sampleLines[] }`                                                                                  | Prisma（现有 JSON）          |
| `persona`      | **自有** ⚠ 与酒馆 Persona **同名异义** | `{behavior, speech, catchphrases[], scenario, opening, examples[]}`——写行为不写形容词，驱动对白与音色情绪，**不进图像 prompt** | Prisma（现有 JSON）          |

### 条件注入（这一块是主要的新借鉴）

| 字段            | 来源                    | 用途                                                                                                                                                                                                  | 落点                                                                                          |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `loreEntries[]` | **借 `character_book`** | `{ keys[], useRegex, content, slot, order, enabled, comment }`。`slot` 是 **PixelVault 的编译槽**（positive 前缀 / positive 后缀 / negative / 参考图选择），**不是**酒馆的 `before_char`/`after_char` | **先进 `extensions` 观察；验证后提成独立表 `CharacterLoreEntry`**（会有按 cardId 查询的需求） |
| `loreConfig`    | 借                      | `{ caseSensitive, matchWholeWords, tokenBudget }`，**中文默认 `matchWholeWords: false`**                                                                                                              | 同上                                                                                          |

### 归档元数据

| 字段                        | 来源                                           | 用途                                                                            | 落点                |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------- |
| `version`                   | 借（V2 `character_version`，改为单调整数）     | 供 `provenance.derivedFromCardVersion` 指认派生自哪一版                         | Prisma（现有）      |
| `provenance`                | 自有 + **借 V3 `source[]` 的"只追加"语义**     | `{sourceGenerationIds[], loraJobId, derivedFromCardId, derivedFromCardVersion}` | Prisma（现有 JSON） |
| `createdAt` / `updatedAt`   | 借（V3 `creation_date` / `modification_date`） | 排序与归档                                                                      | Prisma（现有）      |
| `parentId` / `variantLabel` | **自有（酒馆没有）**                           | 变体树，变体随父卡删                                                            | Prisma（现有）      |
| `stabilityScore`            | **自有（酒馆没有）**                           | 一致性检查总分                                                                  | Prisma（现有）      |
| `consistencyReport`         | **自有**                                       | 逐槽比对结果（哪一项漂了、漂了多少）                                            | `extensions` 起步   |

### 逃生舱与导出契约

| 字段               | 来源                   | 用途                                                                                    | 落点                                  |
| ------------------ | ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| `extensions`       | **借 V2 `extensions`** | 一切未定型字段。规则照抄规范：**导入导出不许销毁不认识的键；键必须带命名空间前缀**      | **Prisma 新列 `Json @default("{}")`** |
| `.pvcard` 导出格式 | **借 `.charx`**        | zip：根 `card.json` + `assets/{role}/…`；引用用相对路径。**不是数据库字段，是导出契约** | 不入库                                |

### 需要 owner 拍板的两处

1. **`loreEntries` 这一层要不要做**。它是本次调研里最大的新增机制，价值是"用 prompt 预算换表达力"，成本是编译器要多一个匹配 + 裁剪阶段。可以只做最小版（纯文本 keys + 一个 slot + order，无正则、无递归、无概率）先验证。
2. **`description` 拆成 `description`（视觉）+ `summary`（给人看）是否现在就做**。这是一个语义收窄 + 数据迁移，越晚做越贵。
