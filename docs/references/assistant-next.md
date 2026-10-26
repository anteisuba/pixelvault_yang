# 助手重设计内核（next）— 施工基准

> 状态：**第 9e 步「开台」（2026-10-23）**；第 9c 步（同日）起所有人切新内核。代码在 `src/features/assistant/`，所有人、所有台都走新内核（路由不再看开关，浏览器本地开关 `antei:assistant-kernel` 已删）。v2 / v3 的主循环与老提示词助手（`StudioAssistantDock` / `/api/prompt/assistant`）已删；v3 的执行函数、板子、`prepareOperatorTurn` 等仍被新内核借用，留着。新内核接不了的请求（脸 / 型号 / 台子快照没对上）直接回错误事件，⛔ 没有退路。总设计与各步顺序见施工单 a-redesign。

## 1. 为什么另起

v3 的问题不在某一条规矩，而在外壳替模型做了太多事（审计：工具失败 20%，编造多为参数校验失败后仍声称改好）。新内核按「薄外壳、厚模型」：

- **四个通用工具**：`look`（读台子 + 把图摆到眼前）/ `edit`（一次改多格，按顺序落）/ `ask`（问题卡）/ `generate`（确认卡）。
- **入参宽进**（`tools.ts`）：给模型看的 schema 是严格形状，交给 SDK 的不校验；自己解析时可空字段缺了当 null、单个对象当数组、数字字符串也认，读不懂才回「哪一格不对」。⛔ 不按模型家族判死。
- **各家自带联网直接挂主循环**（`models.ts`）：Claude `web_search_20260209` + `web_fetch`、OpenAI / Grok Responses `web_search`、Gemini `google_search` + `url_context`、DeepSeek 走 Anthropic 兼容入口的 `web_search`。搜不搜、搜几次模型自己定。
- **思考跨步接上**：每一步把模型的完整回复（思考、签名、联网结果）原样接回去；OpenAI / Grok 带回加密思考（`store: false`）；DeepSeek 改走 Anthropic 兼容入口（OpenAI 兼容那条 SDK 不回传 `reasoning_content`）。
- **思考档整轮用创作者选的那一档**，⛔ 不按步降档。
- **看过的图一直留在眼前**，超过 16 张才把最早的换成一行字。
- ⛔ 没有步数上限、⛔ 没有「同一错 N 次就停」：停只有创作者按停（owner 2026-10-22）。

## 2. 结构

| 文件                   | 管什么                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel.ts`            | 主循环：调模型 → 执行工具 → 结果接回 → 再调；软线前存状态、交接力条                                                                                                                         |
| `models.ts`            | 五家接法 + 自带联网；每家带 `fallback`（v3 那条跑通的接法），被厂商 4xx 拒掉时整轮换过去                                                                                                    |
| `tools.ts`             | 五个工具（find / look / edit / ask / generate）的入参与宽进解析；只有 OpenAI 官方 strict 用「每格必填」形状，别家给自然形状                                                                 |
| `bench.ts`             | 新工具 → v3 执行函数的入参（台上每一格怎么改是「线上协议」，借 v3 已磨过的；第 8 步把这些执行函数搬进来，⛔ 不是跟着删）                                                                    |
| `prompt.ts`            | 短系统提示（两段：不变的 + 这位创作者的）                                                                                                                                                   |
| `messages.ts`          | 图的存取（存地址、发前现下字节）、换保守接法时剥掉原接法专属的块、之前几轮的对白                                                                                                            |
| `state.ts`             | 一轮跑到一半的样子存 Redis（gzip，1 小时；没配 Redis 时进程内存）                                                                                                                           |
| `workspace.service.ts` | 工作区编号与「查 / 看」（第 3 步）：图 `图_N`（库里每人递增序号）、`角色·名/造型`、`LoRA·名`、`提示词·名`、`对话·id 前 8 位`、`设置`；只读、按 userId 收敛，设置只取渠道名（⛔ 密文、掩码） |

**接力**：面板协议不变。软线（120 秒）到了，服务端把整段消息存进 Redis，发一条 `transcript` 事件，里面只有板子那一条、只带 `turn {id, hop}`；浏览器收到 `time_budget` 就带着它接着发下一次（新内核所有台都接、不设上限）。存不下（压缩后 > 900KB）或取不回来就照常收尾 / 从这一句重新开一轮。

**编号**（第 3 步，owner 10-23）：编号只给模型用，界面换缩略图是第 9 步。板子末尾写出 `ref-N` / `result-N` 各是哪个 `图_N`；`edit add_reference` 认 `图_N`（查到 / 打开过的图记进本轮准入名单 `run.searchIndex`，旧执行器只认名单里的）。`find` 的对话覆盖所有台、每条标台与日期；隐身时对话与记忆都不翻。「套用某张图的配方」是第 4 步。

**查库**（owner 10-25）：`find` 一套搜法（`rank.ts`：查词按空白 / 逗号拆，任意一个词命中就算、命中多的排前；图与对话在 SQL 里算同一个分）；她自己的库全量查（LoRA 不再截在最新 100 把）；角色连设定 / 简介 / 造型说明一起搜。外面的库各一个接头（`library-sources.service.ts`），**点名才查**：`tags` = Danbooru 标签（与标签库 / 查资料同一条接口 + 她的标签收藏，`look 标签·name` 读详情与全年龄样图）、`lora_library` = Civitai LoRA 大库（`look LoRA·name` 她库里没有就去大库找）；另有 `voices`（音色卡）。自带联网不设每步上限（owner 10-25「全放开」），提示词要求标签 / LoRA 先查项目的库。

**台上结果**（10-25 修）：图片台与 LoRA 台的快照 `results` 同一个函数出（`toOperatorSnapshotResults`），舞台上选中 / 放大的那张标 `selected`（舞台写 `lib/studio-stage-focus.ts`，快照现读），板子上写「这张」= 它；没有这一批时交舞台上的上一张。⚠ 记录里类型是大写 `IMAGE`：10-16 版比小写，10-25 前台上的图一张都没交给过助手。

**第 4a 步**（owner 10-23：拆 4a 台 / 4b 库 / 4c 设置）：

- 接上的台：图片、LoRA、视频、角色页、画布（`ASSISTANT_NEXT_DOMAINS`）。⚠ 没有配音：第 9b 步接过工作台音频档，9e2（owner 10-23）随音频档一起删了；配音间（`/studio/audio`）单独做，助手不负责。
- 画布（第 9a 步，`features/assistant/canvas.ts`）：板子、改法翻译、落地结果借 v3 画布那一套。一步里的画布改动（`add_card` / `set_card` / `connect` / `disconnect` / `delete_card` / `move_to_shot` / `reorder_shot` / `project_script`，写卡用带 `card` 的 `prompt`）合成一批 `canvas_batch` 交给浏览器落；这一跳把「还没交回的工具结果」存进接力状态（`NextTurnState.pending`），停在 `canvas_sync`，下一跳按 `priorSteps` 里落没落与新快照补上结果（新卡 `ref → 句柄`）再接着跑。同一步里 edit 之后的别的工具不跑。`generate` 在画布上带 `cards`（`upscale: true` 是放大）；「交给 AI 出图」在画布上不限张（owner 10-23），一张确认卡最多 `maxCanvasGenerateCards` 张。台间交接 9e 起换成 `open`（见下）。
- 每台能用哪些改法在 `bench.ts` 的 `OPS_BY_FACE`；不在单子上的改法直接退回并列出这台有的。角色页没有出图；助手自己拟的设定 / 挑的图照旧出提议卡（4b 起创作者明说要改的直接写）。
- 「只改那一处」：`edit` 模式的提示词改动随步骤带 `edits`，浏览器在台上**现在的文字**上重换一遍（`src/lib/prompt-find-replace.ts`，两边同一份），对不上才整段覆盖。
- 两道旧闸（`run.nextKernel`）：NAI 标签核对不再退回整段重写；中文 / 整句这类真写不进去的照旧报，但只要模型改那一处；视频「挂了参考图须先问分辨率」跳过。
- `add_lora`：按名字查 LoRA 库并挂上（旧执行器 `search_loras` → `mount_lora`，新内核才放行）。
- `apply_recipe`：读 `图_N` 的配方（`readPictureRecipe`），展开成本台能用的普通改动；套不上的写进结果里的 `not applied`。

**第 4b 步**（owner 10-23：明说要改的设定直接写、删除和公开不做、标签库先不接）：

- `edit` 多了一组改库的改法，**任何台上都能用**（`library.ts` 的 `LIBRARY_OPS`，`bench.ts` 先分给它）。
- 素材五种（`tag_pictures` / `favorite_pictures` / `new_folder` / `put_in_folder` / `verdict`）交给旧执行器现成的那五条；`run.nextKernel` 时任何台都放行（`NEXT_KERNEL_LIBRARY_TOOLS`）。
- 角色 / 造型 / LoRA / 提示词库走新工具 `library_write`（只由新内核发，旧 `planTool` 拒）：`services/assistant-library-write.service.ts`，每条记原值做 `inverse`（按 `kind` 区分），撤销走同一条 `asset-writes/revert`。
  - 新建角色 / 造型的撤销只在它还没被用过（没有出图、LoRA 关联）时删；LoRA 取消收藏只是移出收藏、不删行；LoRA 只认自己库里的。
  - 角色页写完刷新名册（`use-cards-operator-host` 的 `libraryChanged`）。
- 没有删除、公开的工具：提示里叫助手告诉创作者去哪里点。

**第 4c 步**（owner 10-23：浏览器里那四项偏好不做、不加「默认模型」、从来源名单拿掉一项算普通修改）：

- `edit` 再加三种改设置的改法，同样任何台都能用、带撤销，走同一条 `library_write`（`kind` = channel / assistant / source_add / source_remove）：
  - `model_channel`：渠道开关与改名。⛔ key 不读不写（查渠道的 select 从不带密文与掩码）、不删渠道。
  - `assistant_setting`：助手设置一格（`ASSISTANT_SETTINGS_WRITE_KEYS`）。读整份 → 改一格 → 走 `upsertAssistantPersona`（三档、语气、角色那几条不变量由它守）；撤销把原来整份写回。头像只在已有几种之间切。浏览器收到后重读 persona（`reloadAssistantPersonaEverywhere`），输入区模型 chip 跟上；从下一句话起生效。
  - `search_source`：搜图来源白 / 黑名单加一项（全部台）或拿掉一项；撤销删掉刚加的 / 按原样记回去。
- `look 设置` 现在列出渠道、助手设置每一格的当前值、两张来源名单。

**第 5 步**（owner 10-23）：

- 5a 按账号排队在 Worker 里（见 `backend.md`「按账号排队」）：同一账号同时几张见 `IMAGE_ACCOUNT_CONCURRENCY`，429 退回去等。
- 5b 面板开关改名「交给 AI 出图」。开着时浏览器替创作者按出图卡（一句话最多 4 张，超了照旧摆卡），关着时创作者自己按；台面末尾多一行 `LET AI GENERATE: on` 告诉模型。
  - 不管开不开，图落地后 ⛔ 不自动看图，钉一张「按这个方向继续吗？」（继续 / 换个方向，`use-assistant-operator` 的 `then: 'ask'`）。点了或直接打字，助手才看 `result-N`、接着改。
  - 「先问我」（`planMode`）新内核本来就不读，不管出图。

**第 6 步**（owner 10-23：照 Claude 的项目记忆做；要「关于你」这一层；先清后摘要；一份 PR）：

- 记忆分份、互不干扰：「关于你」= global 那一份，各处都用；角色各自一份（cards 范围、挂 `characterCardId`）；画布一个项目一份（第 9a 步接上：画布上 `remember` 不给角色就记进这个项目，系统提示里单列「About this canvas project」）。工作台对话里的事 ⛔ 不往外记，只留在那段对话里（靠下面的压缩）。
- 注入（`listNextAssistantMemoriesForPrompt`）：「关于你」+ 角色页上开着的那位自己那份，各带编号 `记忆·<id 前 8 位>`，最多 `maxMemoriesInPrompt` 条。各台旧记忆不再注入，`find` 照样翻得到。隐身不读。
- 写：`edit` 的 `remember`（任何台，走 `library_write`，kind = new_memory / memory / forget_memory，带撤销）。只记创作者明说「以后都 / 记住」或确定长期有用的；给 `character` 就进那个角色。敏感句不记；同一句不记第二行；创作者自己写的那几条不改不忘。「让助手记住」关着不记新的、不改，忘掉照样行；隐身一条都不碰。
- 之前几轮：用 v3 那套开窗 + 摘要（`lib/assistant-v3-history`，窗口参数化：新内核 40 条 / 6 万字 / 8 轮一块）。滑出去的那几轮后台补摘要（这一轮的型号与 key、`low` 档，回完才跑），接在系统提示末尾；接力那几跳照第一跳定下的窗口（`NextTurnState.history`）。平常几轮的对话碰不到线，一次都不写。
- 一轮里清旧工具结果（`clearOldToolResults`，不花钱）：还没清的工具结果超 8 万字，就把最近 3 步之前、长于 600 字的换成一行；一次清到底，之后前缀不动。看过的旧图照旧由 `hydratePictures` 换成一行。

**第 7a 步**（owner 10-23：拆 7a / 7b；型号长规则进技能、提示只留一行；系统自带几份、用户导入放 7b；「/」叫技能放 7b）：

- 内置技能 `skills.ts`：11 份（标签写法、查 Danbooru 标签、参考图分工、复刻与反推、标签台多人、比例与档位、安全过滤、视频分镜、Seedance、LoRA 搭配、角色设定），正文从 v3 各台 CRAFT 与型号写法改写；视频写法 / 镜头语法 / Seedance 规则直接引原常量。
- 系统提示只列 `技能·名字: 什么时候用`（进稳定段）；模型 `look 技能·名字` 读全文。读过的全文前后有记号，`clearOldToolResults` 清那一步时原样留着。
- 型号写法：图片 / 视频台只留这个型号的一句 hint +「该读哪份技能」一行（`modelSection`），⛔ 别把标签规则、视频写法整段拼回系统提示。LoRA 台底模写法只有当前一族，照旧常驻。
- 人设：干活时角色只管语气和称呼，⛔ 动作描写、⛔「每一句都从角色出」。
- 和角色聊天（`chatCharacterOf`：persona 带 `roleplay` + `characterCardId`）：owner 10-23 定「聊天只说话自然」，两种模式都 ⛔ 动作描写。
  - 系统提示换 `CHAT_STABLE`（干活说明缩成几行，工具都在），角色卡打头进 `creator` 段。
  - 每轮第一条消息末尾一句「别出戏」（`chatReminder`，⛔ 进系统提示）。
  - 记忆读写她那份 +「关于你」；`remember` 不给角色时默认记到她身上（补第 6 步漏的）。
  - 长聊天摘要同一副四栏按故事写（`kind: 'story'`：发生了什么 / 关系 / 约定与伏笔 / 出场的人和东西）。
- 以后（owner 10-23，未排期）：表情包、语音、上网找资料，往「电子宠物」的感觉做。

**第 7b 步**（owner 10-23：照标准 SKILL.md 做、能导出；⛔ GitHub 安装、⛔「让助手写」、导入先不做；每人隔离）：

- 内置技能是标准文件夹：`skills/builtin/<name>/SKILL.md`（`name` / `description` / `metadata.title` 中文名）+ `references/`。改了跑 `npm run skills:generate` 打成 `builtin.generated.ts`（服务端 ⛔ 运行时读盘）；`skills.test.ts` 守两边一致。读写 SKILL.md 走 `lib/skill-md.ts`（只认这个格式那一小块 YAML，⛔ 引 YAML 库）。
- 参考文件按需读：`look 技能·名字/references/x.md`，一次一份；正文末尾列出能读的。
- 「你的技能」表 `AssistantSkill`（每人一份，按 `userId` 收敛）：自己写的一行；「改成我的版本」/ 只关掉一份内置 = 带 `builtinSlug` 的一行（`body` 空 = 只关）。删那一行 = 回到内置原样。上限见 `constants/assistant-skills.ts`（每人 200 份、正文 1.2 万字）。
- 谁能读：内置的（含改版）助手用到自己读，系统提示稳定段只列内置名单；你关掉的在「你的设置」点名（`skillsSettingsNote`），名单不变吃得到缓存。你自己写的 ⛔ 进名单、`look` 打不开，只能「/名字」叫。
- 「/」：服务端从这条消息原文认 `/名字`（前面是开头或空白；长名字先认；关掉的不算），全文进这一轮第一条消息（`renderCalledSkills`），一条最多 3 份、合计 3 万字，多的回一句让模型告诉创作者。输入框「/」菜单只帮着写名字（普通文字，⛔ 胶囊）。
- 设置第三页「技能」：内置 / 我的两组、开关、看全文和参考文件、改成我的版本、改、删、导出 zip（`lib/skill-export.ts`，`<name>/SKILL.md` + `references/`）。

**第 9d 步：一段对话跨台**（owner 10-23）：

- 对话按人存、⛔ 不再按台分：在哪个台打开面板都是同一段，换台接着聊。客户端线程范围 `assistantThreadScope(userId)`（`<uid>:assistant`）；服务端读 / 写 / 锁会话只核 `userId`（`findOwnConversation`），这一轮所在台的权限（画布项目归属）照旧由 `assertAssistantWorkspaceAccess` 核。
- 换台落一条 `domainMark`（细线「切到 X」，会存；模型那边是一句 workspace event，`describeDomainSwitch`）；空对话换台不落，连着换只留最后一条。这一轮能改哪个台看的是现在所在的台。
- 会话的「家」= 开头那个台：新会话盖当时的台，之后保存保留首条上的戳（⛔ 跟着换台改）。历史下拉列这个人全部会话，每条标起始的台（`assistantWorkspaceKeyOfRow`）。以前按台分开的旧会话照列、不合并、不搬数据。画布记忆照旧按项目记。隐身仍是整段一个开关。
- 输入框草稿与附件跟着人走，换台不丢；交接草稿（`takeOperatorDraft`）按账号 + 目标台认。
- 回复正文与过程行里的 `图_N` / `视频_N` 换缩略图（`use-picture-number-references.ts`）：按编号向 `/api/assistant/mentions/lookup` 的 `seqs` 查他自己的那张（一次最多 32 个，查过的记在模块里），查不到照原样留字。编号照旧只给模型用。
- 只做功能、用现有组件拼；样式统一留到施工单后面的「UI 统一」（owner 10-23）。

**第 9e 步：开台**（owner 10-23：直接开不先问；改到一半也不拦；画布默认最近那块，说「新的」才新建）：

- 第六个工具 `open`（`features/assistant/open.ts`）：`bench` = image / tags / video / lora / canvas（`canvas: recent|new`）；角色页 10-26 去掉（见下「库开着时」节）。去哪由服务端认（最近那块画布 `listRecentNodeWorkflowProjectsForUser`），⛔ 不收模型写的 id；已经在那个台上就直说，不白跳。⚠ 没有配音间：那边单独做、助手不负责（owner 10-23）。
- 一步里 `open` 最后跑（之后的调用回「没跑」）：存好这一步（`NextTurnState.pending.open`，结果待补）、交接力条，停在 `bench_open`（帧上带 `open` 目标）。浏览器记进 store 的 `benchOpen`、`router.push(assistantBenchPath)`；新台的面板轮询到「到了」（`assistantBenchReached`：画布要那块真打开，`?project=new` 由 `useCanvasOpenProjectV4` 建好后把项目号补回；角色页要打开那一位）就带着接力条接着发；30 秒没到作废，落一行 `benchOpenMissed`。到了那一跳，`open` 的结果 = 新台的板子，模型用那个台的 `edit` 接着摆（每项照样可撤），花钱照旧走确认卡 /「交给 AI 出图」。换台那一行就是 9d 的 `domainMark`。
- 删掉三种交接卡：角色页「交给图片助手」（`imageHandoff`）、自然语言 ↔ 标签「换台」（`workbenchHandoff`）、工作台 ↔ 画布（`moveWork`）连同 `lib/bench-canvas-handoff.ts`、`use-bench-handoff-arrival-v4.ts`、宿主那几只手和旧工具 `hand_off_to_image_assistant` / `switch_workbench`。旧历史里的那几种系统行码留着，照旧画得出来。

**第 9g 步：首页对话里直接出图**（owner 10-24：只在没开台的首页；卡上只放提示词 / 模型 / 比例 / 张数 / 参考图；默认图片台上次那个模型，NAI 也行；图留在对话里、⛔ 不自动开台）：

- 首页挂一份隐藏的 `StudioProvider`（`shell/HomeDraftBench.tsx`，只在外壳 kind = home 时挂）：宿主 `useHomeDraftOperatorHost` = `useStudioWorkbenchOperatorHost({ home: true })`（两种方言的图片模型都列，表单方言跟着选中的型号走）+ 一颗 `useStudioGenerateAction()`（`REQUEST_GENERATE` 执行端）。出图与图片台那颗键是同一条路，⛔ 没有第二条。
- 快照是一份完整的图片快照（带 specs / count，`isHomeDraftSnapshot`）。服务端见到它把 `request.domain` 改成 image、`workspaceKey` 仍是 home（`prepareOperatorTurn({ homeDraft })` 核对时按 home），系统提示用首页那一面；板子 = 「THE DRAFT」+ 图片板，改法只开 `HOME_DRAFT_OPS`（prompt / model / specs / count / 参考图 / apply_recipe；配方里不在这几样的部分回一句「开图片台」）。
- 起手型号：图片台上次用的（先自然语言台、再标签台）→ 有 key 里最便宜的 → 第一个。换一段对话清掉提示词与参考图。
- 确认卡（`generationDraft`）：提示词可改、参考图可拿掉、「去图片台接着改」（`writeStudioDraft` 写那一台的草稿 + 记上次型号，再开台，台挂上照草稿恢复）。型号没 key：按「出图」就地弹 `QuickSetupDialog`，配好选上那把 key（`key:<id>`）再出。
- 台开着时一切照旧。只做功能、用现有组件拼，样式留「UI 统一」。

**反推画风（owner 10-25：A 读元数据 + B PixAI Tagger，C 反查出处先不做）**：

- A 上传 / 网图导入时读文件自带的配方（`services/image-embedded-recipe.service.ts`）：NovelAI 的 `Comment` / `Source` 文字块与藏在透明通道最低位的那份（stealth），A1111 / Forge 的 `parameters`。读出来写进提示词 / 负面 / seed 列与 `snapshot.advancedParams`，来源与模型名记 `snapshot.embeddedRecipe`；`model` 列照旧 `user-upload`。截图 / JPG 读不出，照旧当没配方。
- B 认图：`look` 多一个 `tagger: true`（不加第七个工具），对 names 里的图跑 PixAI Tagger v1.0，回画师 / 角色 / 作品 / 内容标签与置信度（`features/assistant/tagger.ts`）。链路 app → execution Worker `/tag-image`（签名）→ Modal `pixelvault-runner` 的 `/tag`（`Tagger` 类，CPU 8 核，权重烤进镜像），token 只在 Worker。库里的图认原图、结果存 `snapshot.tagger`（带模型版本，换版才重认）；库外的地址照认不存。
- 技能「复刻与反推」：没配方的图先 `tagger: true` 再写；报画师带把握程度，认不出不报名字。

**库开着时助手认得出你在看什么**（owner 10-26 选「A + 先查再回答」）：

- 库叠层里的页面不当宿主（`StudioOperatorDetachedScope`，⛔ 一打开库就掐掉台上那一轮），助手仍是底下那个台的身份。库改为往 `hooks/use-library-view.ts` 报一句：叠层挂上时报开着哪个库（`setLibraryViewCategory`），各页点开某一样时报那一样（`useReportLibraryItem`：角色、LoRA（收藏 / Civitai 抽屉）、标签详情、素材详情图、提示词）。发请求时带 `libraryView`，服务端在任何一张脸的板子底下接一句 `LIBRARY ON SCREEN …, looking at 角色·Denia`（`renderLibraryView`），「这个」就是它，先 `look`。音色 / 酒馆 / 画廊只报开着哪个库。
- `open` 不再有 `character`（10-26）：角色页进了库、桌面上不当宿主，开过去永远「没到」（线上「没能打开那个台」）。角色的设定 / 造型用 edit 的库改法在哪个台都能改，首页两块板子也写明。
- 系统提示加一条：没在这段对话里 `find` 过、结果为空之前，不许说「库里没有 / 你没有」。

**聊天并回对话（owner 10-26，样件 v5 / 气泡出场样件 F）**：

- 没开台 = 和现在这位聊：首页这一轮请求没带 `chatCharacterId` 时，内核按设置里那张角色卡补上（`getHomeChatCharacterId`），走聊天口吻；学说法（`learnCreatorPhrases`）挪进内核，聊天轮结束后 `after()` 跑。
- 她说的那几段带记号：`message` / `message_delta` 上 `chat`（在聊天 → 一行一个气泡）、`spoken`（用着角色 → 🔊 开着时念）。条目上的 `chat` 落库，翻历史照样是气泡；`voice` 念读状态不落库。
- 气泡（`StudioOperatorChatBubbles`）：一行写完才整条弹出（往上 6px 淡入 220ms），后一条等 500ms + 每字 70ms，等的时候三点「正在输入」；⛔ 逐字打、⛔ 光标。翻历史直接整段摆出。
- 🔊（`StudioOperatorVoice.tsx`）：对话头一颗键（只有用着角色才有，开着拉长成「语音」胶囊）+ 头下面一条（嗓子▾ = 换角色卡绑的音色卡 · 免费 / Pro / Drama 3）。开关与型号记在这台设备（`use-operator-voice.ts`）。开着时每段说完 `POST /api/assistant/speak`（`speakAsPersona` → `speakWithVoiceCard` → `submitAudioGeneration`，和配音间同一条），等 `checkAudioStatusAPI` 好了自动放；聊天整段念，开着台只念首尾段（`splitSpokenSegments`）。请求带 `chatVoice`（Drama 3 = 语气标签）。没绑嗓子就地挑、缺 key 就地 `QuickSetupDialog`、念不出来可再念。
- 旧聊天房间删了（②c-3，owner 10-26「直接删掉吧」）：配音间 `/studio/audio`、对话头「聊天」键、`VoiceRoom` / `VoiceLine` 两张表一起删，不迁移。气泡 / 念的纯函数搬到 `lib/chat-voice.ts`、常量 `constants/chat-voice.ts`；换人走 `usePersonaSwitch`（`hooks/use-chat-persona.ts`），以前的聊天（只读）那一条「和她聊天」= 换人设 + 开新对话。

**过程记录**：照写 `AssistantTurnRecord`，`promptVersion = next-YYYY-MM-DD`；本轮记录投成 v3 形状（自带联网记成 `search_web`、`find` 记成 `search_library`），评测工具照用。

## 3. 没验证的（2026-10-23）

- DeepSeek Anthropic 兼容入口跑主循环、Grok Responses、Claude adaptive 思考、OpenAI `store:false` 下联网结果的回传，都只在单测里用假模型跑过；被拒会自动退回 v3 接法，但要用真 key 跑一次评测才算数。
- 评测（`ASSISTANT_EVAL_KERNEL=next`，2026-10-23 新 72% / 旧 69%）用的是假库：`find` / 按编号打开在评测里查不到东西，第 3 步的效果要在 owner 账号上实跑验证。

## Source of Truth

- `src/features/assistant/`（全部）· 路由 `src/app/api/studio/assistant-operator/route.ts` · 浏览器接力 `src/hooks/use-assistant-operator.ts`
- 接口与搜索调研：项目文件 `assistant-reliability/model-interfaces.md`

## Last Verified

- 2026-10-26 · ②c-3 删旧聊天房间：`tsc` 0 error、相关 vitest 全绿（含 i18n 齐全 / 键覆盖）；迁移漂移交 CI 检查。
- 2026-10-26 · 聊天并回对话 ②c-1 / ②c-2：`tsc` 0 error、相关 vitest 全绿（首页补角色卡、事件记号、气泡出场时序、历史落库、念读接口与状态）。🔊 真念要在 preview 上用有 Fish key 的账号点一次。

- 2026-10-25 · 反推画风（A + B）：本地 CPU 跑 Tagger 实测 wlop 图 → `wlop 0.28`、初音图 → `hatsune_miku 1.00`（一张约 5 秒）；元数据解析用合成的 NAI / A1111 / stealth PNG 测；`tsc` 0 error、相关 vitest 全绿。Modal 部署后线上实跑见 PR。

- 2026-10-24 · 第 9g 步（首页对话里直接出图）：`tsc` 0 error、相关 vitest 全绿（内核首页配方改走图片面 + 核对按 home、板子与改法限定、确认卡改提示词 / 拿参考图 / 去图片台 / 没 key 先配再出、草稿交接）。未在浏览器里实跑，未跑评测（等第 9 步全做完再统一跑）。
- 2026-10-23 · 第 9e2 步（删音频档 + 删 9b）：工作台音频档残留与 9b 配音台助手整块删（`set_audio`、快照 `audio`、域 `audio`、对话 `workspaceKey: 'audio'` 的戳）。`tsc` 0 error、相关 vitest 见 PR。未在浏览器里实跑，未跑评测。
- 2026-10-23 · 第 9e 步（开台）：`tsc` 0 error、改动文件 eslint 0 error、相关 vitest 477 个文件全绿（内核开台停流 → 到了接着跑 / 没到如实说 / 同步之后不跑、`planOpen` 画布与角色、地址与到达判定、store 换页不收 idle、hook 换页与轮询接上 / 超时作废）。未在浏览器里实跑，未跑评测（等第 9 步全做完再统一跑）。
- 2026-10-23 · 第 9d 步（对话跨台 + 缩略图）：`tsc` 0 error、改动相关 vitest 246 个文件全绿（换台同一段对话 + 落标记、列全部会话、起始台的戳不变、按编号查图）。未在浏览器里实跑，未跑评测（等第 9 步全做完再统一跑）。
- 2026-10-23 · 第 9c 步（切换 + 删旧）：`tsc` 0 error、改动相关 vitest 全绿（路由六个台一律新内核、hook 接力与出完停下问一句）。删掉的覆盖：v2 / v3 主循环的用例、v3 回放基线。未在浏览器里实跑，未跑评测（等第 9 步全做完再统一跑）。

- 2026-10-23 · 第 9b 步（配音台）：`tsc` 0 error、改动文件 eslint 0 error、相关定向 vitest 全绿（改法翻译 / 板子、`set_audio` 落 → 撤、快照与表单 action、路由 403）。未在浏览器里实跑，未跑评测（等第 9 步全做完再统一跑）。

- 2026-10-23 · 第 7b 步：`tsc` 0 error、定向 vitest 全绿（内置文件与生成模块一致、改版 / 关掉 / 自己写的读法、「/」注入、路由与服务按人隔离、迁移安全检查）。未跑评测（等全部改完再统一跑）。

- 2026-10-23 · 第 7a 步：`tsc` 0 error、`src/features/assistant` 定向 vitest 全绿（技能点名都找得到、清旧结果留技能、聊天模式提示 / 记忆 / 故事摘要）。未跑评测（等全部改完再统一跑）。

- 2026-10-23 · 第 4c 步：`tsc` 0 error、相关定向 vitest 6096 条全绿（含改设置做 → 撤 → 回原状、查渠道不取密文）。未跑评测（等全部改完再统一跑）。

- 2026-10-23 · 第 4b 步：`tsc` 0 error、相关定向 vitest 4951 条全绿（含改库做 → 撤 → 回原状）。未跑评测（owner 10-23：等全部改完再统一跑）。

- 2026-10-23 · 第 4a 步：`tsc` 0 error、`src/features/assistant` + v3 内核 + operator 服务 / hook 定向全绿。

- 2026-10-23 · 第 3 步：`tsc` 0 error、eslint 0 problem、`src/features/assistant` 43 条全绿。

- 2026-10-22 · 第 2 步骨架：`tsc` 0 error、改动文件 eslint 0 problem、定向 vitest（`src/features/assistant` 21 条 + 路由 / hook / 过程记录，相关共 194 条全绿）。⚠ 没对真模型跑过。
