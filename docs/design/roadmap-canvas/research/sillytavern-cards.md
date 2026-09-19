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

## 11. owner 拍板（2026-09-19）

- `description` **现在拆**：`description` 只留视觉描述进编译器；新增 `summary` 给人看、⛔ 不进 prompt。随 D6 卡片设计一起做迁移（现有文字默认归视觉，简介留空待补）。
- `loreEntries` **做最小版**：纯文本 `keys[]` + `slot`（positive 前缀 / 后缀 / negative / 参考图选择）+ `order` + `enabled`；不做正则、递归、概率、装饰器。先进 `extensions` 观察。
- owner 新增两条需求（酒馆里最想要的）：
  1. **卡片给 LLM**：AI 以卡片角色的语气 / 情感回复——落在 `persona`（behavior · speech · catchphrases · examples）驱动对白生成与配音情绪标记；助手 / 配音间需要一个「以 @角色 的口吻」模式。
  2. **卡片给助手**：写剧本时助手能看到角色详细信息与**角色之间的关系** → 新增 `relations[]`（`{ targetCardId, relation, note }`，双向展示），随上下文卡注入进系统提示；剧本节点（24）投影时按 @角色 带入。

## 12. 补充：角色语气 / 情感 / 关系的实现机制

调研日期 **2026-09-19**。本节回答 owner 在第 11 节提出的两条需求背后的问题：**酒馆是不是真有这两个能力、怎么实现的**。不重复第 1~10 节的规范字段表，只讲机制——数据在哪个字段、prompt 怎么拼、代码在哪个文件。

源码取自 `SillyTavern/SillyTavern` 的 **release 分支**（快照 commit `06bde93`，`package.json` 版本 1.19.0），可按 `https://github.com/SillyTavern/SillyTavern/blob/release/<路径>` 核对。官方文档统一指 `https://docs.sillytavern.app/`。规范两份：https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md 、https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md 。以上均 2026-09-19 逐个拉取核实。

### 12.0 三句话结论

1. **语气：有，而且是整张卡的主线**。承载语气的不是某个「语气字段」，而是**示例对白 `mes_example` 以「真实轮次」的形态注入上下文**——它教模型的是句法节奏，不是形容词。
2. **情感：有，但和我们要的不是一回事**。酒馆的「情感」只服务于**换立绘**，是**事后分类**（默认本地 BERT 跑 28 类 go-emotions），**不进 prompt、不进 TTS**。TTS 里根本没有情绪通道。
3. **角色关系：没有原生字段**。规范和 UI 里都查无此物；社区有十来个第三方扩展在做，但全是旁路实现，没有一个成为事实标准。

---

### 12.1 「语气」由哪些字段承载，在 prompt 里拼在哪

酒馆有两条完全不同的装配路径，字段相同、拼法不同。公共入口是 `public/script.js` 的 `getCharacterCardFieldsLazy()`，所有字段都先过 `baseChatReplace()`（宏替换 + 折行归一）。

几个容易误解的映射先写清：

- `persona` 取的是**用户自己的** persona 描述，不是角色的；
- `system` ← `character.data.system_prompt`，**但被 `power_user.prefer_character_prompt` 开关卡着**；
- `jailbreak` ← `character.data.post_history_instructions`，被 `prefer_character_jailbreak` 卡着；
- `charDepthPrompt` ← `character.data.extensions.depth_prompt.prompt`。

**值得单独记一笔**：V2 规范说 `system_prompt` 的默认行为 **MUST** 是替换用户全局 system prompt（第 1.2 节），但**实现上酒馆给它加了一道用户开关**，卡没有无条件的覆盖权。第 9.2 节判断「让导入的卡覆盖全局系统提示词是安全问题」，酒馆自己也是这么处理的。

#### Text Completion 路径：Story String 模板

上下文由一个 Handlebars 模板一次性渲染（`public/scripts/power-user.js` 的 `renderStoryString()`）。默认模板（`default/content/presets/context/Default.json`）的变量顺序就是默认的字段优先级：

> `anchorBefore` → `system` → `wiBefore` → `description` → `personality` → `scenario` → `wiAfter` → `persona` → `anchorAfter`

每个变量都包在 `{{#if}}` 里——**空字段不占位、不留空行**。这是个很干净的设计：字段的「有无」直接决定结构，编译器不需要到处判空。`anchorBefore` / `anchorAfter` 是扩展注入的静态锚点（Author's Note、摘要、向量检索结果都落在这两个槽）。

**默认模板里没有 `{{mesExamples}}`**——示例对白不走 Story String，而是作为独立的一段拼在 story string 之后、聊天历史之前，因为它要被单独裁剪（见 12.3）。

Instruct Mode 不是插在中间的一段，而是**包在外面的一层**：`instruct-mode.js` 的 `formatInstructModeStoryString()` 用 `story_string_prefix` / `story_string_suffix` 把**整个渲染后的 story string** 包成一条 system 轮次（ChatML 预设即 `<|im_start|>system … <|im_end|>`），聊天消息再逐条各自包一层。

#### Chat Completion 路径：Prompt Manager

这条路不是渲染模板，而是**一个有序的消息列表**，用户可拖拽排序、逐条开关。默认顺序写死在 `public/scripts/PromptManager.js` 的 `promptManagerDefaultPromptOrder`：

> `main`（主系统提示词）→ `worldInfoBefore` → `personaDescription` → `charDescription` → `charPersonality` → `scenario` → `enhanceDefinitions`（默认关）→ `nsfw`（Auxiliary Prompt）→ `worldInfoAfter` → `dialogueExamples` → `chatHistory` → `jailbreak`（Post-History Instructions）

对照 Story String 会发现**两条路径的字段顺序是刻意对齐的**（描述 → 性格 → 场景 → 世界书后半 → 示例 → 历史）。`jailbreak` 永远在最后，紧贴生成点。

其中 `charDescription` / `charPersonality` / `scenario` / `worldInfo*` / `dialogueExamples` / `chatHistory` / `personaDescription` 都是 **marker**（占位条目，内容运行时填）。摘要、作者注释、向量检索结果同样各占一个具名 identifier（`summary` / `authorsNote` / `vectorsMemory` / `vectorsDataBank` / `smartContext`），**与角色卡字段平起平坐、可拖拽排序**。

还有一条架构细节值得抄：**条目的最终位置由用户的 `prompt_order` 决定，而装配代码里的添加顺序只决定「谁先抢 token 预算」**。位置和优先级是两个正交的维度。

> **对 PixelVault 的直接启发**：这两条路径的差别是「模板渲染」vs「有序条目列表」。前者产出一整块文本、适合一次喂满；后者每一项独立可开关、可预算、可重排。`card-recipe-compiler` 现在更像前者；一旦引入第 11 节已拍板的 `loreEntries` 条件注入 + 预算裁剪，它必须变成后者——**先建有序条目列表，最后才 join 成 prompt**，并且把「位置」和「预算优先级」拆成两个字段。

#### 这些字段里，真正承载「语气」的是哪个

- `description` / `personality` / `scenario`：**描述性**——告诉模型角色「是什么样的人」。让模型知道该扮演谁，但不决定句子长什么样。
- `mes_example`：**示范性**——直接给模型看几轮「这个角色会怎么说话」。这是酒馆里唯一能传递**句法节奏、口头禅密度、标点习惯、段落长度**的字段。社区公认「卡写得好不好看 example」，原因就在这里。
- `system_prompt` / `post_history_instructions`：**指令性**——「用第三人称写」「不要替用户发言」这类元规则，不是角色的嗓音。
- Author's Note / Character's Note（`depth_prompt`）：**抗遗忘**——把一句「她说话永远带刺」钉在历史末尾附近反复提醒，对抗长对话里的人格漂移。

**结论：语气 = 示例对白（示范）+ 深度注入（抗遗忘）。描述性字段只是底座。**

补一条 `{{original}}` 的实现细节（`script.js`）：这个宏**只在显式传入原内容的调用点存在，且一段文本里只生效第一次**，第二次返回空串。这是防止用户在覆盖模板里反复展开原 prompt 把上下文撑爆。

---

### 12.2 `mes_example` 的注入形态：它是「轮次」不是「段落」

这一条是本节最有借鉴价值的机制细节。

`script.js` 的 `parseMesExamples()`：用 `<START>` 把整段示例**切成多个独立 block**（不以 `<START>` 开头的会被自动补上），每块前加块首分隔符。

关键在于**每块之后怎么渲染**，三条路径都指向同一个答案——**示例要和真实对话同构**：

| 路径                           | 渲染形态                                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text Completion（非 instruct） | 纯字符串拼接，`<START>` 变成 `example_separator`（默认 `***`），无角色包装                                                                                                             |
| Text Completion + Instruct     | `formatInstructModeExamples()` 把 `<START>` 换成 `{Example Dialogue:}`，再把块**切成一条条独立轮次**，逐条套上和真实对话**完全相同的** `input_sequence` / `output_sequence` 前后缀     |
| Chat Completion                | `setOpenAIMessageExamples()` 把块拆成真正的 message 对象；**角色统一是 `system`，靠 `name` 字段区分 `example_user` / `example_assistant`**，每块前再插一条 "New Example Chat" 分隔消息 |

也就是说，在 Instruct 和 CC 路径下，示例对白在模型眼里**和真实的历史轮次长得一模一样**——它不是「一段关于对话的描述」，而是「几轮假的真对话」。

（CC 路径用 `system` + `name` 而不是直接 `user`/`assistant`，是为了不让示例被模型误当成真实发生过的事——**既要同构、又要可区分**，这个折中值得注意。）

多个 block 的意义也在这：`<START>` 分隔的每一段是**一个独立的对话场景**，不是同一段对话的续写。一张卡可以给「日常」「被激怒」「示弱」三个场景各一段例子。

---

### 12.3 上下文吃紧时，示例对白怎么被裁掉

三档策略（User Settings 的 **Example Messages Behavior**）：

| 选项                         | 内部开关         | 行为                       |
| ---------------------------- | ---------------- | -------------------------- |
| **Gradual push-out**（默认） | 两个开关都 false | 示例被逐 block 挤出去      |
| Always include examples      | `pin_examples`   | 永远全量带上，不参与递减   |
| Never include examples       | `strip_examples` | 渲染完 story string 即清空 |

Gradual push-out 在 TC 路径上是**两段式**的：

1. **预估**：先把聊天历史的 token 算完，再拿剩下的预算逐个 block 累加示例，超了就停，实际带上的数量记在 `count_exm_add`；
2. **收缩**（`checkPromptSize()`，递归）：整条 prompt 仍然超限时，**先 `count_exm_add--`（一次丢一个完整示例块）；示例全部丢光之后，才开始丢最老的聊天消息**。

CC 路径同理：`populateDialogueExamples()` 用 `canAffordAll()` 判断，装不下就 `break`，**整块丢弃**。

三条结论：

1. **聊天历史的优先级高于示例对白**——对话越长，角色的「原始嗓音样本」越少。这正是长对话人格漂移的机制性原因，也是 `depth_prompt` 存在的理由。
2. **裁剪单位是 block，不是句子**。`<START>` 的分隔在这里第二次发挥作用：被砍掉的永远是完整的一个示例场景，不会砍出半段残缺对话。
3. **裁剪是确定性的、按顺序的**——不掷骰子、不交给 LLM 判断。

对照第 9.1 节已写下的「编译器的 prompt 预算裁剪策略必须确定、可解释」——酒馆这段代码就是那条原则的最小实现，而且额外给出一条：**裁剪的最小单位必须是一个语义完整的块**。

---

### 12.4 「情感」在酒馆里到底怎么落：事后分类，只为换立绘

#### Character Expressions 扩展（`public/scripts/extensions/expressions/index.js`）

分类后端五种（源码 `EXPRESSION_API` 枚举）：

| 模式            | 机制                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`（默认） | 打到**酒馆自己的后端** `/api/extra/classify`，由 transformers.js 跑本地模型。模型名写在 `default/config.yaml`：**`Cohee/distilbert-base-uncased-go-emotions-onnx`**——一个 DistilBERT 文本分类器 |
| `extras`        | 打到独立的 Extras 服务器 `/api/classify`                                                                                                                                                        |
| `llm`           | **额外问一次 LLM**                                                                                                                                                                              |
| `webllm`        | 浏览器内跑小模型                                                                                                                                                                                |
| `none`          | 不分类                                                                                                                                                                                          |

**标签集**：`DEFAULT_EXPRESSIONS` 共 **28 个**，就是 go-emotions 的 28 类（admiration / amusement / anger / annoyance / approval / caring / confusion / curiosity / desire / disappointment / disapproval / disgust / embarrassment / excitement / fear / gratitude / grief / joy / love / nervousness / optimism / pride / realization / relief / remorse / sadness / surprise / neutral）。

但这个数组只是**离线兜底**：运行时会先向分类器要真实标签（读模型自己的 `label2id`），拿不到才用硬编码副本。换个模型（例如 6 类的 emotion 模型）标签集就跟着变。

**所以标签集不是产品设计出来的，是跟着分类模型走的**——立绘文件名必须按标签命名，sprite pack 才能对上。这是一个典型的「实现细节泄漏成产品语义」的例子。（用户可另加 Custom Expressions，但自定义标签没有内置兜底图。）

**`llm` 模式的提示词**（源码常量 `DEFAULT_LLM_PROMPT`，用户可改）：

> `Ignore previous instructions. Classify the emotion of the last message. Output just one word, e.g. "joy" or "anger". Choose only one of the following labels: {{labels}}`

注意这个形状：**额外一次独立调用，只输出一个词，标签表由 `{{labels}}` 宏注入**。它**不是**让模型在正文回复里带情绪标签——回复是回复，分类是分类，两件事分开做。

`llm` 模式周边还有三个很成熟的工程细节，**这三条是本节最值得抄的部分**：

1. **JSON Schema 强约束**：后端支持时直接下发 `{ emotion: { type: 'string', enum: [...标签] } }` 并设 `top_k: 1`——**把闭集约束交给解码器，而不是只靠提示词祈祷**。
2. **多级解析容错**：先 `JSON.parse` 取字段 → 失败则剥离 reasoning → **模糊搜索**匹配最近标签 → 子串包含匹配 → 全失败才 fallback。
3. **`filterAvailable`**：只把「这个角色**实际有图**的那些标签」喂给 LLM 做候选。**这是把标签集和素材现状对齐的官方机制**——模型不会选出一个没有对应素材的情绪。

另有流式节流：`llm` 模式下若流式输出未结束就直接 return，避免重复请求。

#### 这里最要紧的一条：情绪**不进 prompt**

分类结果的唯一去向是**换立绘**。它不回流进上下文，不影响下一次生成，也**不传给 TTS**。酒馆的「情感」是一个**纯展示侧的旁路**。

#### TTS 里有没有情绪：**没有逐句通道**

要说准确：**TTS 主链路里一滴情绪都没有，但少数 provider 有全局的风格旋钮。**

- **主链路零情绪**：`public/scripts/extensions/tts/index.js` 全文 0 处 `emotion`，也**不 import expressions 扩展**。唯一的 provider 调用点是 `generateTts(text, voiceId, voiceMapKey)`——**三个参数，没有情绪位**。两个扩展各跑各的，互不通信。
- **provider 级全局旋钮（有，但不是逐句）**：ElevenLabs 有 `style`（0–1 全局滑条）、VITS 有 `emotion` / `style_text`、SBVits2 有 `style`、Chatterbox 有 `exaggeration`、OpenAI 有 `instructions` 文本框。**它们都是「设置面板里配一次、整场都用同一个值」**，不随句子变。
- Azure 甚至**不构造 SSML**，没用它的 `express-as`；MiniMax 的 API 本身有 emotion 字段但 ST 没接。

TTS 实际有的是另一套东西：

- **voice map**：`{ 角色名 → voiceId }`，按**说话人**选嗓子（每个 provider 各存一份）；
- **段落限定符**：voiceMap 的 key 可以带后缀——`{char} ("Quotes")` / `{char} (*Text inside asterisks*)` / `{char} (Other text)`，靠一个正则把文本切成 `dialogue` / `action` / `other` 三类，**「引号内的台词」和「星号内的动作描写」可以用不同音色**。

**这是按文本形态分轨，不是按情绪分轨。** 酒馆没有「这句用生气的语气念」这个能力。

> 而且分段语义**只传到第三个参数，且只有 OpenAI 那个 provider 真的接收它**——其余 provider 的签名都还是 `(text, voiceId)`。**分段信息在接口层就被丢掉了。** 这是酒馆「念得平」的结构性根因：情绪只停在 provider 全局滑条层，没有 per-utterance 注入。

#### 对「让模型输出情绪标签」的官方态度

没有官方的「回复里带 `[emotion]` 前缀」做法。官方给的就是上面那个**独立分类调用**（并通过 `/classify` slash command 暴露给脚本）。

但官方把**搭这条链路的零件备齐了**：宏 `{{availableExpressions}}`（把可用标签注入正文提示词）、`{{lastExpression}}`（读回上一轮表情）、内置 Regex 扩展的 **"Only Format Display"**（把标签从显示中隐去而不改写聊天文件）、以及 `/expression-set` 强制设定立绘。

社区的常见拼法就是：正文里让模型输出 `[joy]` → Regex 隐藏标签 → 脚本调 `/expression-set`。**零件是官方的，链路是用户自己拼的。**（属社区实践，未在官方文档中作为推荐方案出现。）

> **对 PixelVault 的意义（重要）**：酒馆之所以选「事后分类」，是因为它的输出是**要念给人听的聊天正文**——在正文里塞标签会污染阅读。PixelVault 不一样：**我们要的是台词稿和配音指令，标签本来就是产物的一部分，不是污染。** 所以这一点**不该照抄**，详见 12.8 第 3 条。

---

### 12.5 群聊里多个角色怎么各自保持口吻

`public/scripts/group-chats.js`，`group_generation_mode` 三档：`SWAP: 0`（默认）/ `APPEND: 1` / `APPEND_DISABLED: 2`。

#### 最根本的一条：酒馆**不靠提示词工程让一个 LLM 同时扮多角色**

`generateGroupWrapper()` 的做法是：算出本轮激活的成员列表，然后**逐个循环**——每次把全局「当前角色」切到这个成员，跑一次**完整的单人生成**，跑完切下一个。

**一次生成 = 一个角色 = 一次单人生成。** 这是所有「口吻不串」机制的地基，其余都是补强。

#### Swap（默认）：身份独占，历史共享

`getGroupCharacterCardsLazy()` 在 SWAP 下直接返回 null，装配流程回落到普通单人卡路径——上下文里只有当前发言者一张卡。`getGroupDepthPrompts()` 同样在 SWAP 下返回空数组。

**其他角色的发言以什么形态存在**（这才是口吻不串的主力）：

- 历史是共享的扁平数组，每条带 `name`；
- **Text Completion**：每条渲染成 `名字: 内容`，全员一视同仁，没有 role 概念；
- **Chat Completion**：所有非用户消息**一律标成 `role: 'assistant'`**，角色区分靠 `names_behavior` 四档——把 `名字: ` 拼进 content，或改用 API 级的 `name` 字段，或干脆不区分（此时模型基本分不清谁说的）。

还有三道很实用的隔离，第 5 节完全没提：

1. **停止串**：群聊生成时把**其他成员的「名字 +冒号」全部加进 stopping strings**，防止模型替别人续写。这是「一次只写一个人」的硬闸。
2. **推理隔离**：非当前发言者的 reasoning 内容不入上下文。
3. **发言引导**：TC 非 instruct 下末尾强制追加 `当前角色名:`。

#### Group Nudge：钉在生成点的第二道闸

Chat Completion 路径上（`public/scripts/openai.js`）额外插一条提示词，默认内容：

> `[Write the next reply only as {{char}}.]`

它被 `insertAtEnd(..., 'chatHistory')` **插在聊天历史的最末尾**，而且是**预留预算的**（先 `reserveBudget` 再 `freeBudget`，保证永远不会被裁掉）。

这印证了第 4 节那条原则的实现形态：**必须每次在场的强约束 = 钉在最靠近生成点的位置 + 预算上优先保障**。

#### Join：把多张卡的同名字段拼起来

`collectField()` 逐字段收集全体成员，源码明确只合并**四个**字段：`description` / `personality` / `scenario` / `mesExamples`。

- 每段用 Join Prefix / Suffix 包裹，宏支持 `{{char}}`（解析为**这一段所属的成员**）和 **`<FIELDNAME>`**（替换为 `Description` / `Personality` / `Scenario` / `Example Messages`）——**分隔符里能带字段名**，这是让模型区分「这段是谁的什么」的唯一手段。
- `mes_example` 合并时自动给每段补 `<START>`，保证 block 边界不串。
- `scenario` 和 `mes_example` 都可被聊天级的 override **整体替换**（不再合并）。
- Mute 处理：`APPEND` 排除静音成员，`APPEND_DISABLED` 保留；**当前发言者即使被静音也一定包含**。

**Character's Note 不走这条合并路**：`getGroupDepthPrompts()` 单独逐成员收集 `data.extensions.depth_prompt` 并**并列注入各自的深度**，而不是拼成一段。

> 这一点很值得琢磨：**即使在「被迫合并」的模式下，最强的那条身份约束也坚持每角色独立。** 描述性文本可以糊在一起，锚点不行。

官方文档对 Join 的警告原文要点：由于典型角色卡的写法，此模式可能导致**角色自我混淆、人格融合、特质不确定**。文档还说明 Join 的正当用途其实是**避免大块上下文被改动**（利于 KV cache 命中），而不是为了表达「多人同框」。

#### 激活策略

四档，默认 Natural。被静音成员在策略层就被剔除。

`activateNaturalOrder()` 的精确算法：

1. **防连说**：非用户输入触发时，上一条消息的发言者被禁止（除非允许自我回复）；
2. **点名激活**：把输入和角色名都分词，做**整词**交集；
3. **`talkativeness` 掷骰**：成员先 shuffle，每人 `Math.random()` 掷一次，`talkativeness >= rollValue` 则激活；
4. **兜底**：若无人激活，从 `talkativeness > 0` 的池子里随机抽一个；
5. 去重。**可一次激活多人，按入列顺序依次生成。**

`talkativeness` 取值 0–1、步长 0.05、默认 0.5，**不在 V2/V3 规范里**（两份规范全文 0 处），它是酒馆放进 `data.extensions.talkativeness` 的私有键（服务端读写时与顶层字段双写）。`depth_prompt` 同理。

> **这正是第 1.2 节说的 `extensions` 逃生舱在真实运转的样子**：两个被所有人使用的核心功能，规范里一个字都没有。这条印证了第 9.1 节「卡上加一个 `extensions` 逃生舱」的价值判断。

#### 一个已知陷阱：整词匹配对中文很可能失效

点名匹配用的是 `\b\w+\b` 分词后求交集。`\w` **不含 CJK**，所以中文 / 日文角色名基本切不出词——「@林夏」这种点名在中文场景下大概率不生效。

（源码可推出，但**未实跑验证**，标注为待验证。）这与第 2.3 节世界书那条官方警示「中日文应关掉 Match whole words」是同一个根因。**PixelVault 做 `@角色` 锚点时必须避开基于 `\b\w+\b` 的整词匹配。**

---

### 12.6 角色关系：**没有原生字段**（已核实）

#### 核实过程与结论

| 检查对象                                                                                             | 结果                                                     |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Character Card V2 规范全文                                                                           | `relation` / `relationship` / `affinity` **0 处**        |
| Character Card V3 规范全文（含 `extensions`、`character_book`/`Lorebook` 条目结构、20 个装饰器全表） | **0 处**；装饰器里也**没有**任何「限定某角色在场」的语义 |
| 酒馆前端 `public/index.html`（全量 UI 约 735KB，含角色卡编辑器 Advanced Definitions、群聊设置面板）  | `relationship` / `relations` **0 处**                    |

**答案：没有。** 规范层没有，实现层的 UI 也没有。第 11 节的判断成立。

角色卡编辑器 Advanced Definitions 的实际字段是：Prompt Overrides（`system_prompt` / `post_history_instructions`）、Creator's Metadata、`personality`、`scenario`、Character's Note（`depth_prompt` + depth + role）、`talkativeness`、`mes_example`——**全是「这一个角色自己的属性」，没有任何字段指向另一张卡**。群聊设置里唯一的成员间参数是 `talkativeness`（发言概率）。

**更根本的原因**：酒馆的卡是**自包含的可交换文件**（第 0 节第 1 条）。一张 PNG 落到任何人机器上都要能用——**卡之间的硬引用会破坏这个性质**（引用的卡不在对方库里怎么办）。所以「没有关系字段」不是疏忽，是**自包含性的必然代价**。

#### 社区怎么表达关系（官方文档支持的做法）

1. **写进 `description` / `scenario`**：最常见，纯文本、零机制。代价是关系描述**无条件占用 prompt 预算**，且天然单向（A 的卡里写了 B，B 的卡里不一定写 A）。
2. **世界书条目，关键词 = 对方名字**：`keys: ["林夏"]` → `content: "他对林夏始终有愧"`。**这是唯一有机制支撑的做法**——关系变成条件注入，只在对方被提到时才花预算。需要注意：**官方文档并没有直接推荐这条具体技巧**，只在世界书页写了一句泛化鼓励（大意是别把世界书只当角色背景用，尽管试）。这是社区的既成实践，不是官方方案。
3. **Character's Note（`depth_prompt`）**：把关键关系钉在历史末尾，抗遗忘。
4. **Persona 描述 + Persona Lorebook**：表达「用户这一方」与角色的关系。
5. **群聊 Join 模式**：让模型同时看到所有人的卡，关系靠模型自己从文本里推。串味风险见上。

#### 两个反直觉的坑（都是源码核实、文档没写）

**坑一：World Info 的 Character Filter 在群聊里按「当前发言者」过滤。**

条目上有 `characterFilter: { isExclude, names[], tags[] }`，UI 文案在「Filter to Character(s)」和「Exclude Character(s)」之间切换。但扫描时的判定取的是「当前角色」，而群聊每轮都会把当前角色切到本轮发言者。

所以它的真实语义是「**这条设定只在这个角色说话的回合生效**」，**不是**「这个角色在场时生效」。想表达「A 和 B 同框时的关系」，Character Filter 帮不上忙。

（附带一条：Character Filter 是**酒馆的私有实现**，V3 装饰器里没有对应物——又一个 `extensions` 逃生舱的例子。）

**坑二：群聊里只加载当前发言者那一张卡的 `character_book`。**

世界书的角色书来源只读「当前角色」的绑定，整个世界书模块里没有任何群组分支。**Swap 和 Join 模式都是如此——Join 合并卡字段，但不合并角色书。**

后果：在群聊里想让模型同时知道所有角色的私有设定，**角色专属世界书这条路是走不通的**，只能把共享设定放全局世界书或聊天级世界书。这对「多角色剧本」是个实打实的结构性限制。

#### 一条对关系有用的机制：世界书能匹配聊天之外的文本

条目上有一组开关：匹配 **角色 description / personality / scenario / persona 描述 / Character's Note / creator notes**。

也就是说，**一条关系条目可以靠「对方的名字出现在当前角色的 description 里」被激活**，而不必等对方在对话里被提到。这是酒馆生态里最接近「结构化关系」的机制——但它本质仍是**字符串匹配**，不是引用。

#### 第三方扩展：有很多尝试，没有事实标准

GitHub 实地核查（star 数为 2026-09-19 当日值）。**全部走同一条路：LLM 逐条抽取 → 存自己的 chat_metadata 或 lorebook → 自己拼 prompt 注入。没有任何一个往卡里加字段。**

专门做关系的：

| 仓库                             | Star  | 最近推送   | 机制                                                                                                                                                                                                                   |
| -------------------------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `senjinthedragon/Smart-Memory`   | 54    | 2026-07-02 | 多层记忆，其中一层是**关系对**：只注入「名字出现在最近消息窗口内」的 pair。另有一层知识图，记录每个角色「知道 / 怀疑 / 误信 / 对谁隐瞒」，**只把当前发言者的知识块私下注入他自己的 prompt**                            |
| `ghostd93/BetterSimTracker`      | 37    | 2026-05-24 | 逐消息抽取 Affection / Trust / Desire 等数值、存快照画折线图，可选把当前状态注入 prompt                                                                                                                                |
| `xenofei/SillyTavern-ScenePulse` | 21    | 2026-04-27 | 用 interceptor 注入 tracker prompt，抽取 characters / relationships / quests 的结构化 JSON                                                                                                                             |
| `freir1337/bluemoon`             | 4     | 2026-02-19 | 关系类型枚举 + 0–100% 强度滑块，按角色持久化并自动注入                                                                                                                                                                 |
| `wsgy6/st-dynamic-relationships` | **0** | 2026-08-02 | 设计最完整：**有向关系图**（`A→B` 与 `B→A` 独立，22 个维度），生成前注入精简关系上下文（**隐藏数值、不泄露角色未目击的信息**），生成后用独立结构化调用抽事件 → Schema 校验 → 确定性引擎更新。**但 0 star，等于没人用** |

泛 tracker（关系只是其中一栏）：`SpicyMarinara/rpg-companion-sillytavern`（312★，**README 已标 DEPRECATED**）、`Coneja-Chibi/TunnelVision`（122★，不做数值做检索：给模型 lorebook 目录 + tool call，让 AI 自己决定调哪条）、`kaldigo/SillyTavern-Tracker`（101★，已一年无更新）、`prolix-oc/SillyTavern-SimTracker`（63★，只渲染不抽取）。

记忆类（中文生态主力）：`muyoou/st-memory-enhancement`（**1471★**，2026-09-15，结构化**表格**长期记忆，关系可自建成表格的一列）、`aikohanasaki/SillyTavern-MemoryBooks`（309★，**把记忆写回 lorebook 条目**，复用原生 World Info 当存储层）。

> **三条可读的信号**：① 最高 star 的通用 tracker 已废弃、设计最完整的关系图 0 star——**说明这个需求真实但没人做对**；② 活得最好的两个是「结构化表格」和「写回 lorebook」，都**贴着原生机制走**而不是另起炉灶；③ `st-dynamic-relationships` 那条「注入时隐藏数值、不泄露角色未目击的信息」的设计，是整批扩展里最值得记住的一个判断——**关系数据的存储形态和注入形态应该不同**。

---

### 12.7 多角色剧本场景：三层世界书 + 记忆类扩展

#### 三个来源的合并

Lore Insertion Strategy：顺序固定为 **Chat Lore → Persona Lore →（Character Lore 与 Global Lore 按策略合并）**，策略三选一：Sorted Evenly（默认，两者当一个大文件按 Insertion Order 排）/ Character Lore First / Global Lore First。

映射到剧本场景的标准配法：

- **全局世界书** = 世界观、时代、地理、通用规则（所有角色共享）；
- **角色专属 `character_book`** = 这个角色自己的秘密、口头禅、与他人的关系条目；
- **Chat Lore** = 这一场戏的临时设定。

**但注意 12.6 的坑二**：群聊里角色专属世界书只有当前发言者的生效。所以「让模型同时知道所有角色」在酒馆里**只有三条可行路径**：共享设定放全局 / 聊天级世界书；切 Join 模式（接受串味风险）；用群聊 Scenario Override 统一场景文本。

> **对 PixelVault 的直接启发**：分层的语义划分本身是对的——**世界级 / 角色级 / 本场级**，我们对应的是**项目 / 卡 / 本次生成**，形状完全一致。第 3 节已记下「合并顺序必须显式写死并可配」；这里补充两条：一是**分层的语义边界要提前定死**（什么设定该放哪一层），二是**不要复刻酒馆那个「只加载当前角色的书」的限制**——多角色同框时，所有在场角色的卡级设定都该在场。

#### 记忆与结构类扩展（官方内置或官方组织维护）

| 扩展                           | 机制一句话                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Summarize（内置 Memory）**   | 定期把历史压成摘要，存在聊天 metadata（挂在生成时的最后一条消息上，删该消息即回滚），通过 `{{summary}}` 宏 + 可配位置注入                                              |
| **Objective**                  | 用户给一个总目标，AI 自动拆成**可分支的任务树**，按间隔检查完成状态，把「当前任务」作为指令持续注入——**区别于静态 prompt 的地方是它会自己推进**                        |
| **Vector Storage / Data Bank** | 消息或文档切块做向量检索，把相关旧内容**临时挪到聊天历史的首尾**（RAG）；也可替代世界书的关键词匹配，但 trigger% / character filter / inclusion group 等其他检查仍要过 |
| **Author's Note**              | 任意位置 / 任意频率的一段文本，存在 chat_metadata，可叠加角色专属 Note（替换 / 前置 / 后置三档）                                                                       |
| **Quick Reply**                | 把 STscript 绑成按钮或自动触发器（**官方文档站没有独立页**，语法在 STscript 参考页）                                                                                   |
| **Timelines**                  | 官方组织下的第三方扩展，聊天分支的时间线可视化。123★，**最后推送 2025-06-24，已一年多无更新**                                                                          |

**这个架构值得看**：酒馆没有为「摘要」「向量」「作者注」各开一条特殊通道，而是把它们都做成**上下文里的一个具名条目**，在 Prompt Manager 里与卡字段平起平坐。PixelVault 的编译器要接第三方注入源（项目设定、剧本节点、助手上下文）时，应该用同一个形状——**统一的有序条目列表，而不是一堆 if 分支**。

「Objective」的形状对我们的剧本节点（24）尤其对口：**把一个长目标拆成可推进的任务树，每次生成只注入当前这一步**——这正是「排剧本」需要的结构，比一次性把整个大纲塞进 prompt 更省预算也更可控。

---

### 12.8 映射到 PixelVault

我们不是陪聊，是**写台词 / 配音 / 排剧本 / 生成一致的画面**。逐条给结论。

1. **`persona` 要补 `examples[]`（示例对白），这是最该补的一件事。** 酒馆全套字段里唯一真正传递「嗓音」的就是示例对白；`behavior` / `speech` / `catchphrases` 都是描述性的，模型读完只会写出「一个被描述成这样的人」。形态要抄对：**按场景切成多个独立 block**（对应 `<START>`），每块是完整的一小段对白；喂 LLM 时按**真实轮次**渲染，不要拼成散文。可借 CC 路径那个折中——**用可区分的角色标记（如 system + name）让示例既与真实输入同构、又不被误认为真实发生过**。
2. **预算裁剪按 block 砍，不按句子砍。** 抄 gradual push-out 的两段式确定性流程（预估 → 超限时逐块回退），并抄它的最小单位约定。这条同样适用于第 11 节拍板的 `loreEntries` 最小版。同时把「位置」和「预算优先级」拆成两个正交字段。
3. **情绪标签走「模型输出」，不走「事后分类」。** 酒馆选事后分类是因为输出是给人读的聊天正文，塞标签是污染；我们的输出是**台词稿 + 配音指令**，情绪标签本来就是产物的一部分。让台词生成直接产出 `{ line, emotion, delivery }` 的结构化结果，一次调用拿到，而不是生成完再回头问一次模型。
4. **要有情绪词表，但不要抄那 28 类；闭集要靠解码器兜，不靠提示词祈祷。** 酒馆的 28 类是跟着 go-emotions 模型走的、面向立绘的分类标签，含大量对配音无意义的细分（admiration / approval / realization）。PixelVault 应自定一个**面向表演**的小词表（十几个量级），同时服务三处：配音的情绪参数、台词稿的表演提示、角色卡表情参考图的槽位命名。三条实现纪律直接抄它的 `llm` 模式：
   - **把可选值写进 prompt**（`{{labels}}` 那个做法）**并且下发 JSON Schema `enum` 约束**——双保险；
   - **多级解析容错**（严格解析 → 模糊匹配 → 兜底），不要一次解析失败就整条生成作废；
   - **抄 `filterAvailable`**：候选标签按「这张卡**实际有的**表情参考图 / 音色情绪档」裁剪后再给模型。这样模型永远不会选出一个我们无法落地的情绪——对「情绪标签要驱动画面和音色」的我们，这条比酒馆更刚需。
5. **TTS 侧要抄 voice map 的两个形状，并且从一开始就修掉酒馆那个结构缺陷。** 借：一是 `{ 角色 → 音色 }` 映射（对应 `voiceCardId` + `VoiceRoom.cast`）；二是**按文本形态分轨**（引号内台词 / 星号内动作用不同音色）——这对「旁白 + 对白」混排的剧本是现成解法。修：酒馆把分段语义塞进一个字符串 key、只传到第三个参数、且只有一个 provider 接收，情绪因此在接口层就丢了。**我们的配音单元从第一天起就该是 `{ text, speakerCardId, emotion, delivery }` 的结构化对象，由各 adapter 自己决定映射到哪个 provider 参数（或降级忽略）**，而不是先拍平成字符串再想办法塞回去。
6. **`relations[]` 要结构化字段，不要只借 lorebook 的关键词机制——两者都要。** 酒馆没有关系字段是为了保住「一张 PNG 自包含可交换」；**PixelVault 的卡活在自己的库里、有 `cardId`、本就有变体树和 `GenerationCharacterCard` 反向关联，那个约束对我们不成立**，放弃结构化是白白丢掉已有优势。所以：
   - **`relations[]: { targetCardId, relation, note }` 作为事实层**——可双向展示、可在剧本节点里按 `@角色` 投影、可回答「这两个角色一起出现过几次」。这是酒馆给不了的。
   - **注入时降解成 lorebook 式条目**（`keys = [对方 handle / 展示名]`），只在对方真的出场时才花预算。这是酒馆验证过的、用预算换表达力的正解。
   - 借 `st-dynamic-relationships` 那条判断：**存储形态 ≠ 注入形态**——结构化存（含双向、含强度），注入时降解成自然语言、并按视角裁剪（这个角色不知道的事不要注入）。
   - 避开两个坑：**不要照抄 Character Filter 的语义**（它按「当前发言者」而非「在场」过滤，我们要的是在场，而这个判据我们自己的槽位结构能直接回答）；**不要照抄「只加载当前角色的卡级设定」**——多角色同框时所有在场角色的卡级设定都该在场。
   - `@角色` 锚点的匹配**不要用 `\b\w+\b` 整词**，中文会直接失效。
7. **多角色同框：我们已定的「按槽分」对应酒馆的 Swap，方向正确。** 补三条实现细节：
   - **Join 模式只合并四个描述性字段，而 `depth_prompt` 坚持逐角色并列注入**——即使在被迫合并的模式下，最强的身份约束也保持每角色独立。对应我们：退化到单参考图路径时可以合并描述性文本，但**每个角色的 `identity` 锚点必须各自独立保留**。
   - **Group Nudge**（`[Write the next reply only as {{char}}.]`，钉在历史末尾 + 预留预算不被裁）。对应我们：为单个角色生成台词 / 配音时，都要在最靠近生成点的位置钉一句「现在只写 @X」，并保证它在任何预算压力下不被裁掉。
   - **停止串隔离**（把其他角色名加进 stop sequences，防模型替别人续写）。写台词时直接可用。

---

### 12.9 需要对前文做的三处修正

1. **第 5 节**写 Join 模式合并「description / scenario / personality / message examples / character notes」——源码里 **character notes（`depth_prompt`）不参与文本合并**，它由 `getGroupDepthPrompts()` 逐角色收集、**并列注入各自的深度**。文档的说法不算错（Join 模式下全体成员的 note 确实都生效），但形态不同，而这个差别正是有价值的那部分。
2. **第 5 节未提到 Group Nudge、停止串隔离、推理隔离**——这三条才是群聊口吻不串的实际主力。
3. **第 1.3 节**列了 V3 的 `group_only_greetings` 字段——**酒馆 release 分支全仓搜不到这个标识符，当前版本未实现**。群聊开场白的实际逻辑是从 `first_mes` + `alternate_greetings` 里随机挑一条。这是一条「规范有、实现没有」的例子，对第 9.1 节「借 `alternate_greetings` 的形状做 `posePresets`」没有影响，但说明**规范字段不等于可用能力**，引用规范时要分清。

---

### 12.10 本节未核实项

- 中文 / 日文角色名在群聊 Natural Order 点名匹配中能否命中（源码推断会失效，未实跑）。
- 「把 `{{lastExpression}}` 写进 OpenAI provider 的 Voice Instructions 框，从而把上一轮表情喂进 TTS」——机制上成立（该框也走宏替换），但这是宏替换的副作用而非设计，未实跑验证。
- Join Prefix/Suffix 里 `<FIELDNAME>` 最终渲染的大小写（源码传入的是 `Description` 等首字母大写形式，官方文档示例写的是小写）。
- 全部结论来自 release 分支源码静态阅读 + 官方文档交叉印证，**未实跑 SillyTavern 验证最终 prompt 输出**。
