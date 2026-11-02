# ANTEI 施工单

做事顺序与完成记录的**唯一来源**（2026-10-29 从云端 artifact 搬进仓库，artifact 停更；2026-11-01 按新定位重排：按模块分，不再按阶段）。

## 怎么用

- 开工前先看「正在做 / 下一个」，只做排到的那一项；讨论里定下的改动记到对应条目，轮到再做（不插队，见 [AGENTS.md](../AGENTS.md)「owner 工作规矩」）。
- 每条待做带「状态」：**已定** = 方向 owner 定了，可以出设计稿 / 开工；**稿已出** = 设计稿写好等 owner 看；**待调查** = 只有方向，先由线程只读调查一页，owner 看完再定做不做。
- 新模块开工前先和 owner 对齐：做什么、改什么、改完什么样、为什么。
- 每合一个 PR、每定一项：当场改这份文件——条目挪到「已完成」并写日期、PR 号 / 提交号、当时的讨论文档，顶部「正在做 / 下一个」同步。
- 条目带 `id`，提交信息和讨论里可以直接引用。
- 设计细节不写在这里：待做模块的设计稿在 [`design/`](design/)，已上线功能的现行做法在 `references/` 对应文档；对齐稿在项目文件夹 `/mnt/project-files/<模块>/`。
- 本地直推 main（无 PR 号）的改动也要记；核对时看 `git log origin/main --first-parent`，别只看 PR 列表。

## 定位（2026-11-01 owner 定，详见 [`references/product.md`](references/product.md)）

ANTEI = 一个有灵魂的 AI 助手，替你做创作，你随时能改。默认助手 + 角色是可换的灵魂；文字 / 图 / 视频 / 声音是她的手；画布是作品汇合、出视频的地方。排优先级看「助手能不能接管这件事、用户能不能改」。

## 正在做

| id                 | 事项                         | 现状                                                                                                                                                                                                |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `u-tag-studio-ui`  | 标签台交互与排版             | ④ 纯文本已合 #436；存模板 / ＋加角色在预览上做好，11-01 owner「推」。剩 ① 切换条滚轮切整体 / 角色 N ② 加角色按钮做大 ③ 负面紧挨正面                                                                 |
| `p-mcp-everywhere` | MCP 扩展到全站 + 通用接入    | 代码 10-30 已上 main（cc56396）。差 owner 去 Clerk 打开 OAuth Dynamic client registration，11-01 owner：不急，最后再做。现行做法见 [`references/mcp.md`](references/mcp.md)                         |
| 闸门三件           | 安全审计 / outbox / 错误显示 | 11-01 owner 定「朋友圈扩大前必须完成」，放手给 Opus 线程并行做；安全审计 owner 定全部做完再推。11-02：安全审计 ✓（9f49b7e）、错误显示第一轮 ✓（d8b411b）；outbox 是 `o-worker` 第 6 步，第 2 步已做 |

## 下一个

11-01 owner 定顺序：

1. **`p-platform-credits` 点数地基**（稿已出）——所有调用折点数、每人额度、用量可见。Modal 免费给所有人跑、朋友试用先给额度、助手「花钱多先问」、角色出门额度，四件都踩在这套上。
2. **`p-canvas-shotlist` 画布镜头表**（稿已出）——先框架后逐镜生成，先出图挑再出视频。
3. **各台按样件 E 细修**——标签台 → 视频 / 3D → 配音间 → 画布，每台开工前对齐。
4. 其余按下面各模块的条目往下排；手机端重设计等用的人再多些再排；要插队先问 owner。

**朋友圈扩大前的闸门**：安全审计一轮（越权 / ownership / 扣点）、`o-worker` 结果不丢（outbox）、`o-errors` 错误显示。三件没完成不扩大试用范围。（11-02：安全审计、错误显示第一、二轮已完成；outbox 未做）

**固定规矩**：每次动助手内核，跑一遍 68 题评测（约 $5，花 owner 额度），结果记 `/mnt/project-files/assistant-eval/`。

## 待做（按模块）

### 助手

| id                       | 事项                              | 状态   | 已定 / 备注                                                                                                                                                                                           |
| ------------------------ | --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p-user-profile`         | 「你」的档案                      | 已定   | 11-01 owner 定两层：「关于你的事实」（名字 / 语言 / 禁忌 / 常用模型）一份共享；「她对你的印象、相处方式」各记各的                                                                                     |
| `p-reverse-image-search` | 以图搜图：拿图去网上找出处 / 同款 | 待调查 | SauceNAO（用户自己的 key）+ IQDB 兜底；入口设想查看器「找出处」+ 助手。要 owner 的 SauceNAO key、定入口放哪                                                                                           |
| `p-character-chat`       | 聊天里「画这一幕」                | 已定   | 原「一个 bot」清单只剩这一项（「分支」11-01 删）；= 和角色聊天时让她直接出这一幕的图。排在自主度之后                                                                                                  |
| —                        | 助手主动提议 / 电子宠物感         | 未排期 | 自主度做完后的下一步：她看完结果自己说「这张手有问题，我重出一版？」、库里有更合适的 LoRA 主动推。10-23 / 11-01 owner 提，未排期                                                                      |
| `r-eval-fabrication`     | 查助手编造率为什么一直涨          | 待调查 | 11-02 owner 定开。68 题评测编造率三轮 18%→22%→24%（autonomy-before / after / final，`/mnt/project-files/assistant-eval/runs/`）；先只读对比三轮编造题：是评委口径、题目还是内核改动带来的，再定修不修 |

### 画布

| id                     | 事项                                          | 状态   | 已定 / 备注                                                                                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p-canvas-shotlist`    | 镜头表框架（含拉片，原 `p-canvas-breakdown`） | 稿已出 | 稿 [`/mnt/project-files/design/canvas-shotlist.md`]。11-01 owner 定：画布第三个视图；六列 + 时长 / 角色·场景两列可关（给总时长让 AI 分节奏，不每段限死）；每镜先出图挑、挑好再出视频（草稿模式）；先做助手填表、拉片放后；旧「剧本笺」代码删。原 `p-canvas-polish` 两小项（切换角色造型、参考语音）轮到时一起 |
| `p-shotlist-character` | 角色进镜头表：「角色·场景」列直接拉角色卡     | 已定   | 立绘 / LoRA / 声音都按她来；角色大项目与画布之间的线。排在镜头表之后                                                                                                                                                                                                                                          |
| `p-video-export`       | 成片出口：下载、字幕、分享链接、发到平台      | 待调查 | 11-01 owner 定加。终点是视频，终点后面要有出口；先查现在视频结果能导出什么                                                                                                                                                                                                                                    |

### 角色

| id                   | 事项                                                          | 状态   | 已定 / 备注                                                                                                                                        |
| -------------------- | ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p-lora-training`    | LoRA 训练一条路：角色图选成数据集 → Modal 训 → 自动挂到她身上 | 待调查 | 11-01 owner 定加（NAI 出的图拿去训 LoRA 也走这条，原 `p-nai-lora` 删）。角色页「用她的图训练」是入口；先查 Modal 训练脚本和 LoraTrainingJob 表现状 |
| `p-character-outing` | 出门本身的功能问题                                            | 已定   | 后台、切片 1–3、表情包已上；切片 4、5 已并进角色大项目做完。这里只剩出门功能的 bug 修                                                              |

### 各台

| id                           | 事项                                                | 状态   | 已定 / 备注                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p-tag-studio-opt`           | 标签台：补齐 NAI 缺的功能 + 交互排版（13 + 3 小项） | 待调查 | 和 `u-tag-studio-ui` 剩的三项并成一个模块；清单见 [design/tag-studio-nai.md](design/tag-studio-nai.md)、W.O.F 对照 https://claude.ai/artifact/T5EpXEmM67SsZsb5cDVDC5 。轮到时先把 16 项核一遍再排 |
| —                            | 视频 / 3D、配音间、画布按样件 E 细修                | 已定   | 规范见 `references/ui-spec.md`；每台开工前对齐                                                                                                                                                    |
| `p-voice-drama-multispeaker` | 念台词：Drama 3 多人对白一次合成整段                | 已定   | 10-23 owner 定以后做。Fish `<\|speaker:N\|>` + reference_id 数组                                                                                                                                  |
| `p-comfy-workflows`          | Comfy 工作流当资产：存、改版、助手能选能调          | 待调查 | 11-01 owner 定加（原 `o-comfy`、`r-comfyui` 并入）。随 owner 自部署 ComfyUI 一起；先定怎么存、怎么测、怎么加新模型，再接 Qwen 2.1 等                                                              |

### 库与作品

| id                    | 事项                                       | 状态   | 已定 / 备注                                                                                                                                                          |
| --------------------- | ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p-auto-recipe`       | 每次生成自动留配方；保存键只是收藏         | 已定   | 11-01 owner 定加，吸收 `p-prompt-save-impl`（设计见 [design/prompt-save.md](design/prompt-save.md)，保存键改成收藏，复刻照旧）。让助手「看得见你做过的一切」真正可用 |
| `p-library-followups` | 库：「谁在用」、统一 @、「我最近用的」排序 | 待调查 | 见 [design/libraries.md](design/libraries.md)。「谁在用」依赖自动留配方，排在它后面；LoRA「使用次数」owner 要保留，也等它                                            |
| `p-gallery-recipe`    | 画廊作品自带配方（做同款）                 | 已定   | 11-01 owner：公开展示这一支保持现状、不让助手帮忙发。依赖自动留配方；公开提示词 / 模型 / 参数 / LoRA 清洗后展示                                                      |

### 地基与平台

| id                                               | 事项                                        | 状态   | 已定 / 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p-platform-credits`                             | 点数：所有调用折点、每人额度、用量可见      | 稿已出 | 稿 [design/platform-credits.md](design/platform-credits.md)（分支待合）。11-01 owner 定：1 点 = 1 美分（出门额度同一套）；朋友赠额可用 DeepSeek 走 owner key 扣点；用自己 key 的花费也折点只显示不拦；新用户送 100 点；Modal 免费给所有用户                                                                                                                                                                                                                                                                                     |
| `p-custom-relay`                                 | Key 支持自定义中转接口（所有用户都能填）    | 已定   | 见下方「自定义中转」。异步出图的几家要一个真中转站账号实测                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `o-worker`                                       | Worker 剩余步骤（含 outbox，原 `g-outbox`） | 已定   | 方向 10-21 owner 同意，见 [design/worker.md](design/worker.md)。已做：删 RunPod #312、按账号排队 #351、抽公共层（11-01 ec18d5a，`lib/app-bridge.ts`）。剩：驱动接口 + 共用契约 → 逐家迁移 → 视频音频 3D 并入 → outbox → 可观测。outbox 是扩大试用闸门                                                                                                                                                                                                                                                                           |
| `o-errors`                                       | 错误显示                                    | 进行中 | 第一轮 11-01（d8b411b）：统一出口 `useErrorText`、Runner 拒收单列、约 30 处英文改人话。第二轮 11-02（分支 `claude/project-thread-z5e1i4`，待推）：请求失败按「错在哪一层」打标（断网 / 登录过期 / 网关 / 超时，`constants/transport-errors.ts`），api-client 英文兜底句全删、5 份重复解析合一，原话不进主句（owner 定），会话过期 / 404 / 502 不再被说成服务商或 key 的错。剩：服务端关键词分类收窄（等线上样本）、中转站报错（随 `p-custom-relay`）、eslint 拦旧写法。见 [design/errors.md](design/errors.md) §6。扩大试用闸门 |
| `o-llm`                                          | LLM 层拆分                                  | 进行中 | 第一轮 11-01 完成（0ab1277）：按家拆进 `src/services/llm/`，门面不变，每次调用一行统一日志（用途 / 模型 / 耗时 / 用量）；见 [design/llm.md](design/llm.md)。剩：重试与降级、输出校验、费用记录接点数（随 `p-platform-credits`）                                                                                                                                                                                                                                                                                                 |
| `f-studio` → `f-assistant-canvas` → `f-boundary` | 按域搬进 `src/features/`（第 3 批剩余）     | 已定   | 串行做，最后加 eslint 边界规则禁止跨域直引；规矩见 [`design/features-migration.md`](design/features-migration.md)                                                                                                                                                                                                                                                                                                                                                                                                               |
| `d-mobile-redesign`                              | 手机端整体重设计（含 Telegram 对照）        | 已定   | 10-22 owner：要大改。接上整体助手（对话为主、台做抽屉）和底栏；原 `d-telegram-map` 并入；11-01 owner：等用的人再多些再排                                                                                                                                                                                                                                                                                                                                                                                                        |
| `r-modal-llm`                                    | Modal 跑开源 LLM 给赠额用户                 | 待调查 | 11-01 owner 提。默认仍走 DeepSeek API（更便宜、不用热机）；只在角色聊天不受审查 / 批量标注才值得，点数上线后实测成本再定                                                                                                                                                                                                                                                                                                                                                                                                        |

#### 自定义中转（`p-custom-relay`）

10-23 使用者反馈，owner 定所有用户都能填、全部兼容。现状：每把 key 已存 `providerConfig.baseUrl`（只许 https，出站走 `safeFetch` 防 SSRF），缺的是入口和验证。要做：

1. `QuickSetupDialog` 和 `/settings/keys` 加「自定义接口」（Base URL + key + 名字）。两种：(a) 每家 provider 的 key 都能改接口地址（原生格式转发，后台已通）；(b) 通用「OpenAI 兼容」渠道，给只提供 OpenAI 格式的中转站（LLM / 图像），选模型时手填模型名。异步出图出视频的几家（fal / Replicate / Runway / MiniMax）要实测轮询和结果地址，测不通就标「中转可能不支持」。
2. 验证：调 `/models` 探一下能通、能列模型。
3. 超时、限流、格式不规范给清楚的报错（并进 `o-errors`），失败不自动换回官方 key。
4. 安全提示：key 和提示词会经过第三方；保持 https-only 与 SSRF 防护，拦内网地址。
5. 扣不扣点数和用自己的 key 时一样。

### 调研（随时可插）

| id                  | 事项                            | 状态   | 备注                                                                                                                                                                                         |
| ------------------- | ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `r-model-coverage`  | 模型与功能对应核对 + 新版本升级 | 进行中 | 11-01 全量盘点 https://claude.ai/artifact/9t4pjjNMdkXWqTbuod3itx ：Gemini 4 Argon、GPT-6.1 Terra 已加（11-01 直推）；剩 Kling 4.0、FLUX 3 及可选项待 owner 定；NAI 部分完成，Qwen 2.1 等未核 |
| `r-moss-hires-lora` | MOSS-Image 底模 + 高分辨率 LoHa | 待调查 | 10-25 口头结论：不替代 NAI / Illustrious；走 Runner 配 8 步蒸馏；独有价值是带字海报 / JSON 版式。轮到时和 Illustrious 并排出几张                                                             |
| `r-minimax-swap`    | MiniMax-H3 换角 LoRA            | 待调查 | 视频转视频，许可证要核能否商用                                                                                                                                                               |
| —                   | Suno 生成音乐                   | 暂定   | 11-01 owner：Suno 还没开放 API；开放了再排                                                                                                                                                   |

### 等 owner 的小事

- 「从图读串」导入后三个角色没了：代码未复现，等 owner 给复现步骤。
- 标签台负向页签的数字：现在只数当前这一位，要不要改回加总。
- owner 手动：删 Vercel / Worker 里的 `RUNPOD_KEY` 和 RunPod 端点、Volume；Clerk 打开 OAuth 动态注册（不急）。
- 助手反推画风（#427）、SDXL 系来源图底模（#409）线上端到端待 owner 实测。

## 已完成

按模块列；每行：事项（日期，PR / 提交）→ 当时的讨论文档。细节看 PR 和 `docs/status.md`。

### 方向与规范

- 全仓体检与 5 批路线图（10-21）→ 报告 https://claude.ai/artifact/1xgHtxrsYJYVHAhgGtpMws
- 产品定位重定为「助手为核」，施工单按模块重排（11-01，b6a3a88 / 4037a48）→ [`references/product.md`](references/product.md) 决策登记
- UI 规范文档 + 样件 E 定稿（10-25，#387）→ [`references/ui-spec.md`](references/ui-spec.md)、规范页 https://claude.ai/artifact/JwpTLS2kmP69GA5piJPwW1 、样件 E https://claude.ai/artifact/9Y9G5i7XueWrKiiDGTo1Di 、39 问答页 https://claude.ai/artifact/KeFJZVQT5dCDwkboNv8ZQV 、`/mnt/project-files/ui-spec/plan.md`
- 共享组件清点（10-24）→ https://claude.ai/artifact/Rkkkb7R3o83jCrH6yGhx5U 、现状截图 https://claude.ai/artifact/Vu43zVM6g12dEfkTbJYQQ5
- 保存提示词设计定稿 `d-prompt-save`（10-21）→ [design/prompt-save.md](design/prompt-save.md)、https://claude.ai/artifact/7NzJhCcGHjX6kWGCDKekeW
- 三个库与数据库体检（10-21）→ https://claude.ai/artifact/HyA2qGMCS95EapfzEUQHyX 、[design/libraries.md](design/libraries.md)
- Worker 整体设计（10-21，方向已同意）→ [design/worker.md](design/worker.md)、https://claude.ai/artifact/1mifXpHSb2GK7Cj8jemoNW
- 放手范围（11-01，A / B / C 三类 + Watchdog）→ `/mnt/project-files/autonomy/handoff-scope.md`

### 助手

| id                                                                    | 事项                                                                                                                               | 完成         | PR / 提交                          | 讨论文档                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a-redesign`                                                          | 助手整体重设计：定位 → 新内核 → 一次切换（第 1–7 步、9a–9g）                                                                       | 10-22～10-24 | #340 #344–#357 #360–#366 #373–#384 | `/mnt/project-files/assistant-reliability/`（positioning / design / research / step1–9g 各对齐稿）、方案 https://claude.ai/artifact/VK4ikjhWUib5rth3cHxBUw 、[`references/assistant-next.md`](references/assistant-next.md) |
| `p-assistant-autonomy` `p-assistant-undo`                             | 助手自主度：出图按钱算（一句话 $1 内直接出，上限做成设置）、去「交给 AI 出图」开关与继续问句、三档与先出计划删掉、角色页收下也能撤 | 11-02        | f82925e…b845ca9                    | [design/assistant-autonomy.md](design/assistant-autonomy.md)                                                                                                                                                                |
| `a-v2-remove`                                                         | 删 v2 / v3 旧内核                                                                                                                  | 10-23        | #363                               | 同上 step9e2-plan.md                                                                                                                                                                                                        |
| `bug-assistant-fail` / `bug-assistant-images` / `bug-assistant-steps` | 助手失败、跨轮丢图、步数用完                                                                                                       | 并入上面     | —                                  | —                                                                                                                                                                                                                           |
| `p-global-assistant`                                                  | 整体助手外壳（方向 E 分层、开台、首页大输入框、动效）                                                                              | 10-24        | #373–#382                          | 设计 https://claude.ai/artifact/4ZWqsN62NkbvB5waynamZk 、样件 https://claude.ai/artifact/MQfB4LiSXGCK2qheCZqE9y 、`/mnt/project-files/assistant-reliability/step9f-e.md`                                                    |
| `d-dark-theme`                                                        | 白 / 黑背景切换（素 / 暗房）                                                                                                       | 10-24        | #383                               | `/mnt/project-files/dark-theme/plan.md`                                                                                                                                                                                     |
| `bug-assistant-stage-results`                                         | 助手看不到台上的结果图                                                                                                             | 10-25        | #421                               | —                                                                                                                                                                                                                           |
| `bug-assistant-library-access`                                        | 助手读不到各个库（统一查库）                                                                                                       | 10-25        | #422 #426                          | `/mnt/project-files/assistant-style-reverse/library-access-plan.md`                                                                                                                                                         |
| `p-assistant-style-reverse`                                           | 助手反推画风（PixAI Tagger）                                                                                                       | 10-25        | #422 #427                          | `/mnt/project-files/assistant-style-reverse/plan.md`、PixAI 调研 https://claude.ai/artifact/D3PQyuPax7gnT4Js5DryvN                                                                                                          |
| `p-semantic-search`                                                   | 语义检索（标签 / LoRA / 自己的库 / 网上找出处）                                                                                    | 10-26        | #429 #434 #439 #443 #445 #447      | `/mnt/project-files/rag/`（plan、step2–4、cost）、[`references/semantic-search.md`](references/semantic-search.md)                                                                                                          |
| `p-shell-ops`                                                         | 理顺聊天与工作台：提速、外壳、配音台、动效                                                                                         | 10-27        | #449–#462 #467–#470                | 样件 https://claude.ai/artifact/P2KuKDdQxTLap5xrBbwCK3 、`/mnt/project-files/shell-ops/`                                                                                                                                    |
| `p-assistant-polish-1028`                                             | 助手打磨：思考足迹、AI 起标题、历史右键菜单、报错点名                                                                              | 10-28        | 直推 main                          | —                                                                                                                                                                                                                           |
| `p-assistant-taste`                                                   | 助手学口味、记住搜到的、先想再画、接着上次                                                                                         | 10-28        | 直推 main                          | —                                                                                                                                                                                                                           |
| `p-assistant-bench-ux`                                                | 助手工作台体验：联网 400、出完图自动看图再改                                                                                       | 10-29        | #479 #480                          | —                                                                                                                                                                                                                           |
| `p-workbench-persona-voice`                                           | 工作台带角色：去掉固定三段式，只要求口吻像她                                                                                       | 10-29        | #485                               | https://claude.ai/artifact/KvNR2xjrK4GMwRTuFrV6kv                                                                                                                                                                           |
| `p-persona-natural`                                                   | 带角色去扮演味：动作描写兜底不显示不念不进历史                                                                                     | 10-30        | 直推 main                          | —                                                                                                                                                                                                                           |
| `p-assistant-see-screen`                                              | 助手看见当前页面：库页报屏 + 「看屏」小样图 + 画廊·编号                                                                            | 10-30        | 直推 main                          | —                                                                                                                                                                                                                           |
| —                                                                     | 助手过程三行合成一行「想了 N 秒」                                                                                                  | 10-31        | 4d401d7                            | `/mnt/project-files/assistant-one-row/`                                                                                                                                                                                     |
| `p-mcp-everywhere`（代码部分）                                        | MCP 全站 find / look / edit / undo / generate 确认 / OAuth                                                                         | 10-30        | cc56396                            | [`references/mcp.md`](references/mcp.md)                                                                                                                                                                                    |

### 角色与聊天

| id                               | 事项                                                                                                                                                              | 完成         | PR / 提交                          | 讨论文档                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ch-1-cleanup` ～ `ch-4-looks`   | 角色①–④：删卡片模式与旧抽屉、外观收口、角色连 LoRA、变体改「造型」                                                                                                | 10-22        | #326 #328 #329 #330 #332 #333      | 拆分设计 https://claude.ai/artifact/XAj3L24ygYDGN2vQH8h5xU 、拆分地图 https://claude.ai/artifact/RKtX2Eh3ThjEpdYV7cFzU1 、③ 对齐稿 https://claude.ai/artifact/FTTAHbuCwHmnMcProcJ2WL 、④ 对齐稿 https://claude.ai/artifact/JwhJdzReiFh8VHRhLLR32K                                                                                                                |
| `p-voice-upgrade`                | 「声音」模块：音色库、配音间聊天、Drama 3                                                                                                                         | 10-23        | #367 #368 #369 #371                | 设计 https://claude.ai/artifact/EzE8UDhuj4kWzHmQwwb9eg                                                                                                                                                                                                                                                                                                           |
| `p-chat-voiceroom-merge`         | 和角色聊 = 配音间（去聊天模式、对话列表重设计）                                                                                                                   | 10-25        | #415 #417 #418 #420 #424           | https://claude.ai/artifact/AVmu298SjxhRXQwa9nBw1K 、`/mnt/project-files/chat-list/`                                                                                                                                                                                                                                                                              |
| `p-persona-chat-split`           | 分开工作台对话与「聊天」（头像 = 切换人设）                                                                                                                       | 10-25        | #428                               | `/mnt/project-files/persona-chat-split/`                                                                                                                                                                                                                                                                                                                         |
| `p-persona-humanlike`            | 角色更像真人（A+B → F → E → C；G 不做）                                                                                                                           | 10-27        | #446 #448 #453 #456 #458 #460 #471 | 调研 https://claude.ai/artifact/T5A4x1iB6SvAgB3apuSWBq 、F 设计 https://claude.ai/artifact/242A7RMRL916QotBje8jgC 、C 对齐稿 https://claude.ai/artifact/5TfWj8VTYaVGviRea1bQWr 、`/mnt/project-files/persona-c/`                                                                                                                                                 |
| `p-voice-tone-menu`              | 配音台「语气」菜单（68 个 Fish 标记）                                                                                                                             | 10-29        | #473                               | —                                                                                                                                                                                                                                                                                                                                                                |
| `p-character-outing`（切片 1–3） | 角色会「出门」+ 角色页方向 B + 表情包                                                                                                                             | 10-28～10-29 | #478 #480 #481 + 直推              | 并入下面角色大项目的稿                                                                                                                                                                                                                                                                                                                                           |
| `p-character-redesign`           | 角色大项目 ①–⑪：骨架、人物页、最近、在意的东西、出门弹框 + 记点、出门多模态、记忆 + 有效期 / 沉睡、图片 + LoRA、表情包 + 去重、角色页助手、酒馆导入 + 重说 / 改写 | 10-30～11-01 | 直推 main（末 f15c7ef）            | [design/character-redesign.md](design/character-redesign.md)、盘点 https://claude.ai/artifact/EWX1quhnSghWLaWS3qtS1B 、方案稿 https://claude.ai/artifact/DHYiacSBZCYQA91rPHoyHe 、可点样件 https://claude.ai/artifact/QRhLcqAzUpnBicYAXrLdjE 、AstrBot 六件工具评估 https://claude.ai/artifact/D515jfVCtJA4wFgtgApyx2 、`/mnt/project-files/character-redesign/` |
| —                                | 聊天三层（心情 / 先想一步 / 立场）                                                                                                                                | 10-31        | ffd0815                            | `/mnt/project-files/chat-three-layers/plan.md`、对比 `compare/compare.md`                                                                                                                                                                                                                                                                                        |
| —                                | 出门只绕人设词修复                                                                                                                                                | 10-30        | 7b69d22                            | —                                                                                                                                                                                                                                                                                                                                                                |

### 各台

| id                           | 事项                                      | 完成  | PR / 提交      | 讨论文档                                                                                                                                                      |
| ---------------------------- | ----------------------------------------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f-runner-source-checkpoint` | SDXL 系底模跟随示例图 + RIN Flanime v5.0  | 10-25 | #409           | —                                                                                                                                                             |
| `p-image-recipe-import`      | 台上「从图读串」                          | 10-25 | #435 #438      | `/mnt/project-files/img-recipe-import/`                                                                                                                       |
| `bug-lora-name-search`       | LoRA 搜索优化（写法规整、结果分段、纠错） | 10-27 | #318 #472 #474 | 原因与方案 https://claude.ai/artifact/Hj52Rw8DbgaESzcXqjWGLf 、整体设计 https://claude.ai/artifact/5aRpvHts54pNERXUXoU4Uu 、`/mnt/project-files/lora-search/` |
| `p-library-assistant-link`   | 库与助手互通、LoRA 台存模板               | 10-28 | 直推 main      | —                                                                                                                                                             |
| `u-tag-studio-ui` ④          | 标签台纯文本                              | 10-30 | #436           | `/mnt/project-files/tag-studio-ui/`                                                                                                                           |
| `p-tablet-shell`             | 平板（768–1023）也用电脑外壳              | 10-28 | 直推 main      | —                                                                                                                                                             |

### 库

| id                                               | 事项                                                                            | 完成  | PR             | 讨论文档                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ----- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `c-inspiration-delete`                           | 共享提示词搬到画廊、删灵感数据                                                  | 10-22 | #336           | `/mnt/project-files/gallery-prompts/`                                                                       |
| `d-library-shell` / `u-library` / `u-media-tile` | 库整页 + 共用骨架 + 媒体格 + 各库（素材、角色、声音、提示词、LoRA、标签、画廊） | 10-25 | #395–#402      | 三个库方向稿 https://claude.ai/artifact/HyA2qGMCS95EapfzEUQHyX 、[design/libraries.md](design/libraries.md) |
| —                                                | 挑选框（参考图、LoRA、音色）                                                    | 10-25 | #403 #404 #405 | 规范页 ㊱ ㊳                                                                                                |
| `bug-library-speed`                              | 库页切换卡 + LoRA 加载失败（缓存 + TanStack Query）                             | 10-27 | #461 #463      | —                                                                                                           |
| —                                                | 库里助手看不到你正在看的那一样（9f-2a detach）                                  | 10-26 | #440 #441 #444 | —                                                                                                           |

### UI 地基与外壳

| id             | 事项                                                                                                                                                                                                                        | 完成  | PR / 提交                     | 讨论文档                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------- | -------------------------------------------------------------- |
| `u-menu`       | 菜单 / 弹层统一                                                                                                                                                                                                             | 10-25 | #389                          | 规范页 + `/mnt/project-files/ui-spec/plan.md`                  |
| `u-composer`   | 统一输入框 + 药丸                                                                                                                                                                                                           | 10-25 | #390                          | 同上                                                           |
| —              | 拖放浮层                                                                                                                                                                                                                    | 10-25 | #391                          | 同上                                                           |
| `u-viewer`     | 统一查看器                                                                                                                                                                                                                  | 10-25 | #392                          | 同上                                                           |
| —              | 外壳（白板合一、64 图标左栏、竖台条）+ 板头 + 外壳修正                                                                                                                                                                      | 10-25 | #393 #394 #401                | 同上                                                           |
| —              | LoRA 台、库与外壳补丁、生成中摆法 B、头像换人、图片台台面                                                                                                                                                                   | 10-25 | #406 #408 #410 #411 #412 #416 | 同上                                                           |
| `u-dnd`        | 拖拽统一（页面内排序 dnd-kit；跨区域带文件用原生），删 atlaskit                                                                                                                                                             | 11-01 | c56e2c7                       | 说明见 `references/frontend.md`                                |
| `u-css-split`  | 域样式搬出 globals.css（3906 → 1574 行，九个域文件）+ 删 60 条死样式                                                                                                                                                        | 11-01 | eae86e8                       | `references/frontend.md`「CSS 与 token 现状」                  |
| `u-resize`     | 面板拉伸：核过不换（外壳那根线的吸附 / 过头收台库给不了），owner 定                                                                                                                                                         | 11-01 | —                             | —                                                              |
| —              | 手机端点击区补到 44（约 40 处，从底层组件一起补）                                                                                                                                                                           | 11-01 | 8248195                       | 待 owner 真机试手感                                            |
| —              | 小清理：删死代码 `card-tile-base` / `MediaCardTile`（含测试）、删停用旧列 `Recipe.visibility` 与 `CharacterCard.browse*` 五列（迁移 `20261101170000_drop_retired_columns`）、偶发红测试改 `vitest.setup.ts` 等 Radix 定时器 | 11-01 | ea0e301                       | `/mnt/project-files/dead-code/plan.md`                         |
| `f-small`      | 四个小域搬进 `src/features/<域>/`：提示词库 c6c3d7e、画廊 19b7d27、素材 b01be1d、设置 f5b6ffd；每域 `index.ts` / `server.ts` 两个入口，调用方同提交改完不留垫片，跨域的（API key、拖拽 MIME、网格排版）留共享层             | 11-01 | 直推 main                     | [`design/features-migration.md`](design/features-migration.md) |
| `f-cards-lora` | 角色卡 a665a53、LoRA edb93fe：角色卡进 `features/cards/`，LoRA 工作台 / 库 / 训练 / civitai / huggingface 进 `features/lora/`；新加第三个入口 `core.ts`（纯函数与常量）                                                     | 11-01 | 直推 main                     | 同上                                                           |

### 清场与数据库（第 1 批）

| id                | 事项                                                  | 完成  | PR             | 讨论文档                                                                                                          |
| ----------------- | ----------------------------------------------------- | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `c-runpod-remove` | 删掉 RunPod 旧分支                                    | 10-21 | #312           | Worker 设计第 1 步                                                                                                |
| `c-rename-antei`  | 产品名统一成 ANTEI                                    | 10-22 | #316           | —                                                                                                                 |
| `c-db-cleanup`    | 数据库清场（base64 转 R2、3D 大字段、死列、底模写法） | 10-22 | #313 #326 #334 | 数据库体检 https://claude.ai/artifact/HyA2qGMCS95EapfzEUQHyX 、[`references/database.md`](references/database.md) |
| `c-lib-refs`      | 库的引用修正（标签堆进账号、删 loraLineage）          | 10-22 | #313 #330 #335 | 同上                                                                                                              |
| `c-civitai-auth`  | LoRA 公开接口必须登录（查实本来就拦着）               | 10-22 | —              | —                                                                                                                 |
| `c-dead-code`     | 删死代码（53 文件 + 2 依赖，-7000 行）                | 10-22 | #337           | `/mnt/project-files/dead-code/plan.md`                                                                            |
| `c-i18n-split`    | 三语文案按模块拆文件                                  | 10-22 | #339           | `/mnt/project-files/i18n-split/plan.md`                                                                           |

### 插队修 bug

| id                        | 事项                                                                                             | 完成  | PR        |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ----- | --------- |
| `bug-lora-refresh`        | LoRA 库经常刷新不出来（冷查询数总数慢）                                                          | 10-22 | #318      |
| `bug-asset-picker-scroll` | 助手里打开素材库滑不下去                                                                         | 10-22 | #320      |
| `bug-tag-seed`            | 助手在标签台锁不了种子                                                                           | 10-22 | #321      |
| `bug-style-tab`           | 画风页搜不到 blender\_(medium)                                                                   | 10-22 | #323      |
| `bug-generate-oom`        | 出图接口内存爆掉 / 60 秒超时                                                                     | 10-22 | #324      |
| `bug-runner-worker-400`   | Runner 出图全部被 Worker 拒收                                                                    | 10-23 | #348      |
| `bug-nai-concurrency`     | NAI 同时发多张被拒 → 按账号排队                                                                  | 10-23 | #351      |
| `bug-nai-small-fixes`     | NAI 请求体对齐网页端 + 助手 NAI 写法                                                             | 10-23 | #358 #359 |
| `bug-build-fonts`         | 构建挂在拉 Google 字体 → 本地字体                                                                | 10-27 | #475      |
| `bug-session-expired-404` | 出图报「Failed with status 404」= 会话过期被门口拦（401 + apiFetch 续会话重发，api-client 全迁） | 10-29 | #486      |

### 调研

| id                    | 事项                                    | 完成  | 结论在哪                                                                                                                                                                                 |
| --------------------- | --------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `r-nai5-prompting`    | NAI5 提示词、图片反推、自然语言作图     | 10-22 | [design/tag-studio-nai.md](design/tag-studio-nai.md)、https://claude.ai/artifact/UmxGU2pkiCrZ7RkWY6KSR4 、请求体对齐 https://claude.ai/artifact/F2EdTFRkhevoVwzBCgDGpz                   |
| `r-pixai-tagger`      | PixAI Tagger 任意图反推                 | 10-25 | https://claude.ai/artifact/D3PQyuPax7gnT4Js5DryvN 、`references/assistant-next.md`、#427                                                                                                 |
| `r-security-audit`    | 安全审计一轮（越权 / ownership / 扣点） | 11-01 | 9f49b7e；规则沉淀在 `references/backend.md`「认证与边界」「安全红线」                                                                                                                    |
| `r-nai-lock-check`    | NAI 并发锁报错是否归零                  | 11-02 | Vercel 近 7 天错误聚合 0 条 `Concurrent generation is locked`                                                                                                                            |
| `r-nai5-skill`        | 参考 NAI5 写法补助手内置 NAI 技能       | 11-01 | 13974aa：对照 Miint-Sunny/nai5-prompting（GPL-3，只借思路不抄文本），补多人左→右与互动、版权角色只写改动、V5 关系句、漫画读序与四格；改 `tag-model-prompts`、`tag-bench-people-and-text` |
| `r-persona-humanlike` | AI 人设卡怎么更像真人                   | 10-26 | https://claude.ai/artifact/T5A4x1iB6SvAgB3apuSWBq ，已落进 `p-persona-humanlike`                                                                                                         |
| —                     | AstrBot 六件工具评估                    | 10-29 | https://claude.ai/artifact/D515jfVCtJA4wFgtgApyx2 ，可用的归进角色大项目                                                                                                                 |
| —                     | 库页切换卡 + LoRA 加载失败原因          | 10-27 | 已落进 `bug-library-speed`                                                                                                                                                               |

### 删掉的条目（11-01 owner 同意）

`d-nova-sample`、`d-motion-samples`（动效已按 ui-spec 做）、`d-telegram-map`（并入手机端）、`d-danbooru-page`（标签库整页已上）、`p-personal-ai`（被「你」的档案 + 口味学习覆盖）、`p-nai-lora`（NAI 挂不了 LoRA，并进 LoRA 训练）、`p-canvas-polish`（并进镜头表）、`g-outbox`（= `o-worker` 第 6 步）、`o-comfy` / `r-comfyui`（并进 Comfy 工作流资产）、`p-character-chat` 里的「分支」。
