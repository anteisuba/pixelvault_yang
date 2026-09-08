/**
 * 工作台助手「操作员化」的**词表**：工具名、op 类型、事件类型与各自的上限。
 *
 * ── 它和 `node-assistant-ops.ts` 是什么关系 ─────────────────────────
 * 思想同源、形态不同。画布那套是「模型在正文里留 `[[canvas-ops]]` 标记 → 客户端
 * 剥出来渲染成一张提案卡」；这里是**多步工具环**：服务端一步一步地跑，每跑一步
 * 就吐一个 `step` 事件，客户端边看边应用。区别的根源是 owner 拍板 2 —— 免费动作
 * 直做，不再攒成一张要点的卡。
 * ⛔ 别去改 `node-assistant-ops.ts`：画布对齐是 P4 的事，那之前两套并存。
 *
 * ── 这个文件为什么不放 Zod ─────────────────────────────────────────
 * 全仓 `src/constants/` 零个文件 import zod（2026-08-30 清点），schema 一律住
 * `src/types/`。本词表的 schema 因此在 `src/types/assistant-operator.ts`，与
 * `constants/node-assistant-ops.ts` ↔ `types/node-assistant-ops.ts` 完全同构。
 * constants 会被客户端组件直接 import，让它拖上 zod 是白付的包体积。
 *
 * ── 钱闸（本片的宪法）────────────────────────────────────────────
 * **这张工具表里没有任何一条能创建 generation，将来也不许有。**
 * `prime_generate` 只是让客户端把生成键置成 primed 态并算价，扣扳机的永远是用户
 * （拍板 2）。加工具前先问一句：它会不会花钱？会就不是这里的工具。
 */

import {
  ASSISTANT_PROTOCOL_DOMAIN_IDS,
  type AssistantProtocolDomain,
} from '@/constants/assistant-protocol'
import { ASSISTANT_STREAM_EVENTS } from '@/constants/assistant-stream'

/**
 * 操作员流的事件名。
 *
 * ⚠ `open` **借的是传输层那一帧**（`ASSISTANT_STREAM_EVENTS.open`），不是新造的：
 * 它的职责是在模型开口前产生第一个字节把响应头顶出去（那条 504 实证见
 * `constants/assistant-stream.ts` 头注）。工具环的第一步就是一次完整的 LLM 往返，
 * 没有它这条路由和 2026-08-24 那次生产事故是同一个形状。
 * 值共用一个常量，别抄字符串 —— 抄了就是两个「open」，客户端只认其中一个。
 */
export const ASSISTANT_OPERATOR_EVENTS = {
  /** 开流握手，载荷为空。由成帧器发，service 不产。 */
  open: ASSISTANT_STREAM_EVENTS.open,
  /** 计划条，最多一次，排在第一个 `step` 之前。载荷 `{ steps: string[] }`。 */
  plan: 'plan',
  /**
   * **计划卡的素材**（§2.6 / §5，切片 2a）—— 紧跟在 `plan` 之后、第一个 `step`
   * 之前吐一次，载荷是阶段列表 + 至多三个待定项 + 预估 + 服务端观察到的理由。
   *
   * ⛔ **它不是「出卡」的命令**：出不出卡由**客户端硬判**（owner 2026-09-06），
   * 判据写在 `lib/studio-operator-plan.ts` 的 `shouldShowPlanCard` 里。服务端只
   * 负责把「这一轮打算分几步、还有什么没定、大概花多少」摆出来 —— 让模型自己
   * 决定要不要出卡既不稳定，也与「服务端零会话态」相冲。
   * ⚠ 它与 `plan` **分两帧**而不是往 `plan` 上加字段：`plan` 是一行给人看的字，
   * 早就有客户端在读；计划卡要的是结构化的待定项。合帧的代价是让一条已经在跑
   * 的帧变形。
   */
  planRequest: 'plan_request',
  /**
   * 一步。同一个 `id` 会出现两次：`running` 一次、`done` / `error` 一次。
   *
   * ⚠ 客户端按 `id` 覆盖而不是追加 —— 追加的表现是日志流里每步重复两行。
   */
  step: 'step',
  /**
   * 就地确认请求（拍板 3）。它之后这条流即结束，
   * 见 `ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm`。
   */
  confirmRequest: 'confirm_request',
  /**
   * **花钱硬确认**（§6 第三档，拍板 2 的新形态）。它之后这条流同样结束
   * （`awaitingConfirm`），用户点「生成」= 客户端带 `autoApprove` 重发。
   *
   * ── 为什么不是 `confirm_request` 上的一个 `tier` 分支 ────────────────
   * `confirm_request` 的三个字段（`field` / `have` / `proposed`）是**覆盖档专属**
   * 的，而花钱档一个都没有：它要说的是模型 / 张数 / 规格 / 预估。塞进同一帧就得把
   * 那三个字段改成可选，而客户端那张确认条（`StudioOperatorConfirm`）正是
   * `Omit<ConfirmRequestEvent,'type'>` —— 改成可选等于让覆盖三选卡去处理
   * 「没有 field 的确认」。两张卡（§11.4「覆盖三选」/「花钱确认」）本来就是两帧。
   * ⚠ 两帧都带 `tier`，第 3 轮接线时按它分派到两张卡上。
   */
  spendRequest: 'spend_request',
  /** 普通对白。**一条正文的定稿帧** —— 客户端拿它整体覆盖累积出来的那段字。 */
  message: 'message',
  /**
   * 正文的**逐字增量**（§4.1「流式与加载态」第一行）。
   *
   * ⭐ 由来（owner 2026-09-06「助手回复应该一个字一个字连续出」）：这一轮的 LLM
   * 往返本来是缓冲的 —— 模型憋完整个 JSON 才回来，正文于是一坨砸在屏幕上。现在
   * 这一轮走流式补全，服务端边收边把 turn JSON 里 `message` 字段**已经解出来的
   * 那几个字**吐成这一帧。
   *
   * ⚠ **它不是定稿**：`message` 帧才是。客户端以定稿**覆盖**累积文本，⛔ 不是
   * 追加 —— 增量是从半截 JSON 里现解的，转义没收尾 / 模型改口都会让累积值与
   * 定稿差一两个字符，而「差一两个字符」正是最查不出来的那一类。
   * ⚠ **工具轮不吐这一帧**：判据见 `lib/assistant-operator-stream.ts` 的
   * `createOperatorMessageStreamer`（`"tool"` 键先到就整轮闭嘴）。工具轮的正文是
   * 一句过程旁白，它后面紧跟着好几步，逐字吐只是让日志抖起来。
   */
  messageDelta: 'message_delta',
  /**
   * 助手**引用了一条项目规则**（§10，拍板 23）。载荷是规则 id + 原文 + 记录日期，
   * 客户端据此在动作卡下贴一张规则薄卡。
   *
   * ⚠ 它**不是**一步（没有 step id、没有 payload / inverse）：引用一条规则什么都没改，
   * 也就没有东西可撤。⛔ 别把它塞进 `step` 事件里当装饰字段 —— 一条规则可能横跨
   * 好几步，绑在某一步上就得挑一步来绑，而挑哪一步没有判据。
   * ⚠ 规则原文由**服务端**从本轮读到的规则里填，模型只给 id：让模型转述规则，
   * 转述出来的那句话就不再是用户写下的那句了。
   */
  ruleHit: 'rule_hit',
  /**
   * **歧义反问单选**（§3.3 第 5 行 / §7 四入口之四，切片 3a）。
   *
   * 用户说「把那张改一下」而候选不止一张时，助手就地列出缩略图让他点一张。
   * 它之后这条流同样结束（`awaitingConfirm`），点中 = 客户端插一枚 @chip 并带
   * 上下文重发 —— 与拍板 3 的就地确认逐字同构。
   *
   * ── 为什么不是 `confirm_request` 的第四个 tier ────────────────────
   * `confirm_request` 的三个字段（`field` / `have` / `proposed`）说的是「你手写的
   * 那段字要怎么办」；这一帧要说的是「这几张图里是哪一张」。塞进同一帧就得把那三
   * 个字段全改成可选，而客户端那张确认条正是 `Omit<ConfirmRequestEvent,'type'>`
   * —— 覆盖三选卡从此要处理「没有 field 的确认」。三档确认（§6）里也没有它的位置：
   * 它一分钱都不花，也不覆盖任何东西，它只是在问路。
   */
  choiceRequest: 'choice_request',
  /**
   * **这一轮又看了 / 又查了 / 又问了一次模型**（切片 X）。
   *
   * ⭐ 它是一条**计数帧**，不是账单：本仓这条链花的是用户自己那把 key 的额度，
   * 服务端一分钱都扣不掉（钱闸不变）。做它的理由是「看不见的开销」——一轮里
   * 看三张图、检索两轮、来回八次 LLM，用户在日志上只看得见八条 step，
   * 而真正贵的是那三张图。客户端把这些帧累加成一行小字。
   * ⚠ 它**不是一步**（没有 step id、没有 payload / inverse）：一次视觉往返可能
   * 发生在某一步的规划期（`critique_result` 的那一跳），绑在 step 上就得挑一步
   * 来绑，而挑哪一步没有判据 —— 与 `rule_hit` 逐字同源。
   * ⛔ 它也**不是闸**：读到 `cost_tick` 不会拦住任何东西，拦是三档确认的事。
   */
  costTick: 'cost_tick',
  /** 正常收尾。 */
  done: 'done',
  /** 未跑完就停了 —— 载荷带 `reason`，与 `done` 分开是为了让 UI 说得出为什么。 */
  stopped: 'stopped',
  /** 流中途失败，形态与 `AssistantStreamErrorFrame` 一致。 */
  error: 'error',
} as const

export type AssistantOperatorEventName =
  (typeof ASSISTANT_OPERATOR_EVENTS)[keyof typeof ASSISTANT_OPERATOR_EVENTS]

/**
 * P1 工具表。
 *
 * 分三类，判据是「谁承担后果」：
 *   · **读**（`read_state` / 素材检索 / 文件夹视觉检查）—— 不改任何东西，客户端只画日志条。
 *   · **写**（`set_*` / `mount_reference` / `prime_generate`）—— 吐一个 op 给客户端
 *     应用；服务端**不落任何状态**，所以这条流断在哪里都不会留下半个写入。
 *   · 花钱的 —— 一个都没有，见文件头注。
 */
export const ASSISTANT_OPERATOR_TOOL_IDS = {
  /**
   * 读当前表单。⚠ 数据源是**请求里带上来的客户端快照**，不查库 —— 库里没有
   * 「用户此刻在输入框里打了一半的字」，而那正是覆写确认要判的东西（拍板 3）。
   */
  readState: 'read_state',
  /** 按关键词检索用户自己的素材库。 */
  searchAssets: 'search_assets',
  /** 按名称查找用户自己的素材文件夹，并返回可验证的 folder id 与完整路径。 */
  listAssetFolders: 'list_asset_folders',
  /** 实际查看一个已列举文件夹里的图片；分批走视觉模型，不修改素材或表单。 */
  inspectAssetFolder: 'inspect_asset_folder',
  /**
   * 联网搜图（P3-B）。**只出预览候选，什么都不落。**
   *
   * ⛔ 它与 `search_assets` 有一条根本区别，写在这里以免下一个人"顺手补齐"：
   * 库里的素材已经是用户的，所以 `mount_reference` 直接挂得上；**联网候选不是**，
   * 它只是一串第三方地址。转存进 R2 的动作由**用户点选**触发，走的是另一条 API
   * 路由（`STUDIO_WEB_IMAGE_IMPORT`），工具环里**没有对应的导入工具，将来也不许有**
   * —— owner 2026-08-30 原话「主要是给个预览的功能，用户确定了再落 R2」。
   * 顺带：这也是钱闸那份 import 白名单能一直守住的原因（助手够不着上传模块）。
   */
  searchWebImages: 'search_web_images',
  /**
   * 联网**查文字**（切片 3b）。⛔ 与 `search_web_images` 是两件事，判据是「要的是
   * 图还是话」：这一条回的是标题 + 摘要 + 出处，一张图都不出。
   *
   * ⭐ 它存在的理由是**准确性**（§13）：模型对具体作品的设定、官方名称、版本规则
   * 记得半对半错，而工作台上那句提示词恰恰要写对这些。以前它只能凭记忆编，
   * 现在它能去查一句。
   *
   * ⚠ 它**只搜不读**：本片没有抓正文那一跳（`readUrl`）。摘要不够就把来源摆给
   * 用户，⛔ 别让模型照着标题脑补正文。
   */
  searchWeb: 'search_web',
  /**
   * **有目标的检索**（2026-09-06）——多连接器并行 + 归并，出的是**证据条**。
   *
   * ⛔ 与 `search_web` 的分工写死在这里，别让它们互相顶替：
   *  · `search_web` = 一条查询 → 一串 Google 摘要。快、便宜、答得了「这个词怎么拼」。
   *  · `research` = 一个**目标 + 实体**（角色名 / 作品名）→ 同时打萌百 / 维基 /
   *    B站 / danbooru / 网搜，归并成带 `publisher` / `confidence` / `kind` 的证据条。
   *    答的是「这个角色官方长什么样、官方站在哪」这类**一条摘要答不完**的问题。
   *
   * ⭐ 它是**多轮**的：模型可以拿第一轮的证据缩小目标再发一次
   * （上限 `ASSISTANT_RESEARCH_LIMITS.maxRoundsPerTurn`）。这一条是 owner 那个用例
   * 的关键 —— 第一轮定「《无限大》官方站是哪个」，第二轮才问「时夜的外貌服饰」。
   * ⛔ 别把它降级成一次性：一次性检索的表现就是「搜到一句台词就放弃」。
   */
  research: 'research',
  /**
   * **读一个网页的正文**（2026-09-06）。
   *
   * ⚠ 它补的正是切片 3b 有意留下的那个洞（`search_web` 只搜不读）：摘要里那两句
   * 答不了「她穿什么」，而答案就在那一页的角色介绍段里。
   * ⛔ 它**只读文字**，一张图都不取 —— 图仍然走 `search_web_images` + 用户点选。
   * ⚠ `focus`（如「外貌与服饰」）在**服务端**截段，⛔ 不把整页六千字塞进工具环：
   * 每一步都是一次完整 LLM 往返，整页正文会让后面的步数全烧在读上下文上。
   */
  readUrl: 'read_url',
  /**
   * 把素材挂成参考图。
   *
   * ⛔ **载荷里的 URL 不由模型写**：模型只能给 `assetId`，而且只能是本轮
   * `search_assets` 真的返回过的那些，URL 由服务端从检索结果里查出来填。
   * 论据照抄画布 `attach_asset` 那条 —— 让模型写 URL 就是让它编一个不存在的地址。
   */
  mountReference: 'mount_reference',
  /** 换模型。⛔ 只能从快照的 `availableModels` 里挑，不许自己写 id。 */
  setModel: 'set_model',
  /** 写正面提示词。⚠ 目标字段已有用户手写内容时先走确认通道（拍板 3）。 */
  setPrompt: 'set_prompt',
  /**
   * 写负面提示词。
   *
   * ⚠ 快照里 `negativePrompt` **字段缺席 = 这个工作台没有负面框**，不是「有但
   * 空着」—— 这条判据是 2026-08-22 真机换来的（见 `lib/assistant-workbench-state.ts`
   * 里同一段注释），缺席时这条工具按 `noSuchControl` 拒。
   */
  setNegative: 'set_negative',
  /**
   * 设出图规格（**图片档专用**）。
   *
   * ⚠ 台账 AE/BG/BS：`aspectRatio` **只有配上 `resolution` 才是真比例**，所以这
   * 条工具的载荷两个字段一起下，一个都不能省。拆成两条工具就等于把那个坑重挖一遍。
   * ⚠ 视频档走 `set_video_specs` —— 分家的理由写在那条上。
   */
  setSpecs: 'set_specs',
  /**
   * 设视频规格：**时长 · 画幅 · 分辨率一次下齐**（P4-A）。
   *
   * ── 为什么不复用 `set_specs` ────────────────────────────────────
   * 两个域的规格**形状不同，不是同一件事换了值**：
   *  · 图片档比例与清晰度**必须同时给**（台账 AE/BG/BS：只给比例不是真比例），
   *    schema 层把两个字段都写成必填，`types/assistant-operator.test.ts` 有一条
   *    用例专门锁住「只给比例就整条不合法」；
   *  · 视频档的三个参数是 provider 的**三个独立字段**（`buildVideoInput` 里
   *    `aspectRatio` / `duration` / `resolution` 各发各的），而且**逐型号有无**：
   *    Kling V3 Pro / MiniMax H3 的契约里 `parameters.resolution === false`
   *    （`constants/video-model-send-plan.ts`），HappyHorse 连 `duration` 都没有。
   *    把它们塞进「两个必填」的载荷，结果是这些模型上 `set_specs` **永远无解** ——
   *    正是 2026-08-30 那次「三连红而表单没动」的形状。
   * 于是：一个域一条工具，各自的必填规则在各自的 schema 上写死。
   *
   * ⚠ 分家**不等于**放弃「成对下发」那条教训：这条工具的载荷与逆操作**永远带齐
   * 三格**（没有的那格是 `null`），所以撤销一定落回一个真实存在过的组合，
   * ⛔ 不会撤出「5s 配 1080p 配 21:9」这种从没有过的三元组。
   */
  setVideoSpecs: 'set_video_specs',
  /**
   * 设一次出几张。值域 = 快照给的档位表（本仓 `IMAGE_BATCH_COUNTS` 是 1/2/4）。
   *
   * ⛔ **图片档独有**：视频恒单条（工作台上压根没有这个控件，成本行传的是
   * `[selectedModel]` 而不是矩阵名单）。域工具表因此不给视频，调了就按
   * `noSuchControl` 拒 —— 台账「视频恒单条，别照搬矩阵」。
   */
  setCount: 'set_count',
  /**
   * 把视频参考位上的**音频**挂上（P4-A，台账 A 那条修好的通道）。
   *
   * ⭐ 与 `mount_reference` 分家的理由是**槽不同**：图片走
   * `imageUpload.referenceImages`，音频走 `state.videoAudioRefs`，两者的上限来自
   * 契约里两个不同的数（`slots.images` / `slots.audio`），撤销也各撤各的。
   * 合成一条工具就得在载荷里塞一个「这是图还是声」的判别位，而那正是
   * `applyOperatorStep` 最容易写漏的一支。
   *
   * ⚠ 载荷里的 `ownerName` 是**角色归属**（界面上那颗 `AudioOwnerPicker`）：
   * worker 据此生成 `{Name} (@AudioN)` 提示词 token，多角色对白片少了它就分不出
   * 谁在说话。候选来自本次已应用的角色卡，留空退化成无标签 `@AudioN`（schema 允许）。
   */
  mountAudioReference: 'mount_audio_reference',
  /**
   * 视频**出不出声**（P4-A）。
   *
   * ⚠ 它是**三态**：`null` = 用户没设过（最终吃模型目录的默认，多数模型是开），
   * `true` / `false` = 用户明确表过态。⛔ 把「没设过」发成 `false`，在目录默认为
   * 开的模型上结果**正好相反** —— 所以这条工具的 `inverse` 允许 `null`，而工具
   * 本身只写得出 `true` / `false`（用户没设过这件事助手模拟不出来，也不该模拟）。
   *
   * ⚠ 名字里**故意不出现 provider 那个字段名**：钱闸那份禁字表逐字扫工具环源码
   * （`assistant-operator.money-gate.test.ts`），那个词在表里。协议这一侧叫
   * "sound"，落到表单字段的那一跳发生在客户端 `studio-operator-apply.ts`。
   */
  setSound: 'set_sound',
  /**
   * 把生成键置成 primed 态并算价。
   *
   * ⛔ **它不是生成**。服务端在这一步什么都不做，只吐一个 op；点的人永远是用户
   * （拍板 2）。它仍算「写」类 —— 因此照样带 `inverse`（置回未 primed），
   * 不然拍板 14 的「清空全部改动」会留下一个亮着的生成键。
   */
  primeGenerate: 'prime_generate',
  /**
   * **请求生成**（§6 花钱档，切片 2a）。
   *
   * ── ⭐ 它为什么进得来，而钱闸一字未动 ──────────────────────────────
   * 服务端在这一步**只吐一个载荷**（模型 / 张数 / 规格 / 预估），一分钱不扣、
   * 一条 generation 不建、一个 provider 不调。真正扣扳机的那一跳在**客户端**：
   * `studio-operator-apply.ts` 把它交给宿主的 `triggerGeneration`，宿主按的是
   * 用户自己那颗生成键（工作台上是 `REQUEST_GENERATE`）。形状与拍板 22 的
   * `import_user_url`、P4-C 的 `mount_lora` 逐字同源 —— 服务端吐地址 / 吐候选 /
   * 吐载荷，落地永远在客户端。
   *
   * ── ⚠ 名字为什么是 `request_generation` 而不是 `start_generate` ─────
   * 钱闸那份结构性证明逐字扫工具名（`assistant-operator.money-gate.test.ts`）：
   * 「工具表里没有任何一条叫 generate 的（prime 除外）」。`generation` 里没有
   * `generate` 这个词（少了那个结尾的 e），所以这条工具**天然过闸，那条规则一个
   * 字都不用改** —— 而这不是钻空子：规则的本意是「服务端不得创建 generation」，
   * 而这条工具的服务端实现里确实没有任何一条创建 generation 的路。
   * ⛔ 下一个人「顺手统一命名」把它改成 `start_generate` / `run_generate`，
   *    钱闸当场红 —— 那时该改的是名字，不是钱闸。
   *
   * ── ⚠ 它**不可撤销** ─────────────────────────────────────────────
   * 因此它既不是「读」也不是「改动型」，而是第三档
   * （`ASSISTANT_OPERATOR_SPEND_TOOLS`）：没有 `inverse`，撤销的位置由**结果卡**
   * 顶上（生成出来的东西删不掉、钱退不回，给一颗撤销钮才是骗人）。
   */
  requestGeneration: 'request_generation',
  /**
   * 看它自己备的那张图（P3-C，拍板 4）。
   *
   * ⭐ **图不由模型给**：地址来自请求里的 `result`，而那份 `result` 只有在客户端
   * 观察到「助手 primed 的那一次生成」完成时才会带上来（归属追踪见
   * `lib/studio-operator-claim.ts`）。用户自己点的那些生成**永远不进这个字段** ——
   * 拍板 4 的后半句「用户自己发的不打扰」就是在这里成立的，不是靠模型自觉。
   * 没有 `result` 时这条工具按 `noResultToCritique` 拒。
   *
   * ⚠ 它是**读**类：看图不改表单。看完之后要改什么，照旧走 `set_*`（因此照旧
   * 可撤销、照旧进登记簿）。把评价和改动合成一条工具，撤销就没有粒度了。
   */
  critiqueResult: 'critique_result',
  /**
   * 把**用户亲手递过来的**一条 URL 取图、入库并挂上（P3-D，拍板 22）。
   *
   * ⭐ 它与 `search_web_images` 的候选是**两件事**，判据只有一条：这条地址是谁给的。
   *   · 助手自己搜出来的候选 → 仍要用户点「选用」（拍板 21，浏览零下载）；
   *   · **用户自己在消息里粘的地址 → 递过来就是确认**（owner 原话「你递的就是确认」），
   *     助手直接接手，⛔ 不再回头支使用户去点任何东西。
   *
   * ⚠ 「是用户给的」是**服务端结构校验**出来的，不靠模型自觉：那条 URL 必须逐字
   * 出现在本次请求的某条用户消息里，否则按 `urlNotFromUser` 拒。让模型自己声明
   * 「这是用户给的」等于没有闸 —— 它编一句就绕过去了。
   *
   * ⛔ **执行仍在客户端**：这一步只吐一个 op（载荷就是那条源地址），取图 / 落 R2 /
   * 落库全部发生在客户端调既有导入路由（`STUDIO_WEB_IMAGE_IMPORT`）那一跳。
   * 服务端照旧碰不到 R2 与导入模块 —— 钱闸那份 import 白名单一条不松。
   */
  importUserUrl: 'import_user_url',
  /**
   * 找 LoRA（P4-C，**LoRA 域专属**）。
   *
   * ⭐ **复用既有检索**：`services/lora/lora-candidates.service` 那条已经在跑的双源
   * 检索（Civitai + HF，单源失败不拖垮另一源，归一成一张 `LoraCandidate`）。
   * ⛔ 别在工具环里新写一套 —— 那条链上「许可如实展示、不知道就写 null」
   * 「导入门槛写在数据上不写在 UI 上」「已挂载的要标出来」三条规矩都是实证换来的，
   * 重写一次就是把它们一起丢掉。
   *
   * ⚠ 它是**只读**的：一个字节都不下载、一分钱都不扣。真正把 LoRA 收进库那一跳由
   * `mount_lora` 在**客户端**走既有导入链（`favoriteLoraAPI`）—— 与拍板 22 的
   * `import_user_url` 完全同构，服务端照旧碰不到 R2。
   */
  searchLoras: 'search_loras',
  /**
   * 把一把 LoRA 挂上装配台（P4-C）。
   *
   * ⛔ **模型只能给 `candidateId`**，而且只能是本轮 `search_loras` 真的返回过的那些
   * （论据与 `mount_reference` 逐字同源：让模型写下载地址就是让它编一个 404，而这条
   * 链后面接着的是「导入进库」）。导入载荷由服务端从本轮检索结果里查出来填。
   *
   * ⚠ **不设数量上限** —— 本仓硬事实：三个后端全不限，服务端不读 maxLoras 是故意的。
   * 所以这条工具没有 `referencesFull` 的对应物，⛔ 别顺手补一个「最多几把」的闸。
   *
   * ⚠ 撤销按 `candidateId` 反查：那把 LoRA 的**库记录 id** 是客户端导入那一跳才产生
   * 的（与 `import_user_url` 的「源地址 → 落地地址」对照表同构）。
   */
  mountLora: 'mount_lora',
  /**
   * 从装配台上摘一把 LoRA（P4-C）。
   *
   * ⚠ 目标只能是快照里列着的**已挂载项**（`loras.items[].id`），⛔ 不是候选 id：
   * 候选来自检索，挂载项来自用户的装配台，两者是不同的东西。
   * ⚠ 撤销 = 挂回去，而挂回去要的是那条**库记录**；服务端没有它，所以客户端在摘的
   * 那一刻把记录扣下来（同 `mount_lora` 的那张对照表）。
   */
  unmountLora: 'unmount_lora',
  /**
   * 调一把已挂载 LoRA 的权重（界面上那颗 `LoraScaleChip` 与整行滑杆）。
   *
   * ⚠ 值域借 `ASSISTANT_LORA_PICK_LIMITS` 的 0.1–2，**不新拍一对数**：`[[lora]]`
   * 推荐块里的 `suggestedWeight` 用的就是那一对，两处分叉的表现是「推荐卡上 1.5
   * 合法、助手直接设 1.5 被拒」。
   */
  setLoraWeight: 'set_lora_weight',
  /**
   * 读用户记下来的**项目规则**（§10，拍板 23）。
   *
   * ⭐ 为什么要一条工具，而不是把规则全量拼进系统提示：规则是会长的（每用户
   * `ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser` 条），而系统提示每一步都要重发。
   * ⚠ 但**也不是只有工具**：最近的几条仍然进系统提示（`buildProjectRulesSection`）
   * —— 一条助手从没读过的规则等于没有。工具管的是「把剩下的翻出来」。
   * ⚠ 只读：一个字都不改。
   */
  readProjectRules: 'read_project_rules',
  /**
   * 记一条项目规则（§10，拍板 23）。
   *
   * ⚠ 它是本表里**唯一一条真的往库里写**的工具 —— 写的是用户自己的一句话，
   * 不创建 generation、不扣 credit、不调 provider（钱闸的判据逐条不变）。
   * ⚠ 因此它是**改动型**：`inverse` 里放刚记下那条的 id，撤销 = 删掉它。
   * ⛔ 别让模型自己编 `source`：这条工具记下的一律是 `ASSISTANT`，用户自己写的
   * 那些走设置界面（`CREATOR`）。来源写错的表现是规则薄卡上的出处对不上。
   */
  addProjectRule: 'add_project_rule',
  /**
   * 列出用户的**上下文卡**（第三期 K1）——角色 / 风格 / 品牌，账号级持久上下文。
   *
   * ⭐ 与 `read_project_rules` 同一条论据：常挂在当前工作台上的那几张已经在
   * 系统提示里（只有**名字 + 一句话摘要**），这条工具管的是「把没常挂的那些翻
   * 出来」——用户嘴里的「用上次那个角色」指的往往是一张没挂的卡。
   * ⚠ 只读：一个字都不改。
   */
  listContextCards: 'list_context_cards',
  /**
   * 读一张上下文卡的**全文**（第三期 K1）。
   *
   * ⭐ 为什么摘要与正文分两跳：正文是四千字的设定（外貌 / 服饰 / 性格，或一整套
   * 风格规则），而系统提示每一步都要重发。全量进提示 = 每一步都重付一次这段钱。
   * 摘要每轮都在，正文按需拉 —— 与 `read_url` 的 `focus` 截段同一条判据。
   * ⚠ 回的是正文 + 硬否定串 + 参考图 URL 列表（供 `mount_reference` 直接挂）。
   */
  readContextCard: 'read_context_card',
  /**
   * 把一张产物标成 **待定 / 采用 / 判失败**（第三期 · 切片 X）。
   *
   * ⭐ 起因是 owner 的一句话：「禁止用失败的旧图」。在这之前系统里没有任何地方
   * 存着「这张不行」——助手于是每一轮都可能把同一张被否掉的图重新挂成首帧，
   * 而用户每一轮都要再说一遍。这条工具给的就是那个落点：判断由**用户或助手**
   * 在结果卡上下，落进 `Generation.snapshot.reviewState`（零迁移，缺席 = `pending`）。
   * ⚠ 它是本表**第二条后果落在服务端**的改动型工具（第一条是 `add_project_rule`）：
   * 写的是用户自己对自己产物的判断 —— 不建 generation、不扣 credit、不调 provider。
   * 所以 `inverse` 里放的是**旧值**（服务端读得到），撤销 = 写回去。
   * ⛔ 标 blocked **不删图**：它只是不再能当首帧/尾帧（见 `blockedSource`），
   * 库里那张照旧在、照旧搜得到、照旧能拿去评价。
   */
  setReviewState: 'set_review_state',
} as const

/**
 * 一张产物的**审核态**（切片 X）。
 *
 * ── 为什么住在 `snapshot` 里而不是一列 ────────────────────────────
 * 零迁移，判据与产物名（`withGenerationDisplayName`）逐字同源：snapshot 是**已经
 * 在写**的那份 JSON，而一条可空列换不到这里没有的东西。
 * ⚠ **缺席 = `pending`**，⛔ 不是「没审过所以不能用」：存量的每一行都缺席，
 * 把缺席当成禁用等于一次性禁掉用户的整个素材库。
 * ⚠ 与画布域的 `NODE_REVIEW_STATE_IDS` **是两张表**：那张标的是画布上某个 URL
 * 在**这张画布里**的去留（收集器里那一格），这张标的是**素材本身**的判断，
 * 跟着 generation 走、跨工作台成立。合成一张的代价是「在画布上否掉一格」会
 * 悄悄让那张图在图片工作台上也挂不了首帧。
 */
export const GENERATION_REVIEW_STATE_IDS = {
  /** 还没判过 —— 缺席时的语义。 */
  pending: 'pending',
  /** 用户/助手认可的那些。今天不改变任何行为，是给「只用采用过的」留的位置。 */
  approved: 'approved',
  /** 判失败：⛔ 不得再作首帧 / 尾帧。其余用途照旧。 */
  blocked: 'blocked',
} as const

export const GENERATION_REVIEW_STATES = [
  GENERATION_REVIEW_STATE_IDS.pending,
  GENERATION_REVIEW_STATE_IDS.approved,
  GENERATION_REVIEW_STATE_IDS.blocked,
] as const

export type GenerationReviewState = (typeof GENERATION_REVIEW_STATES)[number]

export const ASSISTANT_OPERATOR_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
  ASSISTANT_OPERATOR_TOOL_IDS.research,
  ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setSound,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
  ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
  ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules,
  ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
  ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
  ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
] as const

export type AssistantOperatorTool = (typeof ASSISTANT_OPERATOR_TOOLS)[number]

/**
 * 只读工具 —— 不产生 op，客户端没有东西可撤销。
 *
 * ⚠ `search_web_images` 在这一档**不是勉强归类**：它连一条候选都不落，日志条上
 * 那几张图是纯预览。用户点选之后发生的转存不是这一步的后果，是用户自己的动作
 * （它有自己的界面反馈与失败态），所以这一步照样没有东西可撤。
 */
export const ASSISTANT_OPERATOR_READ_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  /**
   * ⚠ 联网**查文字**也是读（切片 3b）：它回的是标题 + 摘要 + 出处，不落任何东西、
   * 也不改表单。真要照查到的内容改提示词，那是之后那条 `set_*` 的事——撤销也撤在
   * 那一条上（与 `search_web_images` 逐字同构）。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
  /**
   * ⚠ **有目标的检索也是读**（2026-09-06）：它并行打几个源、归并出证据条，
   * 一个字节都不落、表单一个字都不改。要照证据改提示词是之后那条 `set_*` 的事，
   * 撤销也撤在那一条上 —— 与 `search_web` 逐字同构。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.research,
  /**
   * ⚠ 读正文也是读：Jina 把一页渲染成 markdown，服务端按 `focus` 截一段给模型看。
   * ⛔ 它不下载图片、不落 R2、不碰素材库 —— 那条腿仍然只由用户点「选用」触发。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
  /**
   * ⚠ 看图**也是读**：这一步只产生一段评价，表单一个字都没动。所以它没有
   * `inverse`，日志条上也不该出现「撤销」（撤一条评价什么都撤不掉）。
   * 真正要撤的是它之后那几条 `set_*` —— 那正是评价卡上「还原这轮」在做的事。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  /**
   * ⚠ 找 LoRA **也是读**（P4-C）：它出的是一串候选，一个字节都没下载、一把都没挂上。
   * 与 `search_web_images` 同一档 —— 落地那一跳（导入 + 挂载）是 `mount_lora` 的事，
   * 撤销也撤在那一条上。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
  /** 读规则就是读：翻出用户写下的几句话，表单一个字都没动。 */
  ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules,
  /**
   * 上下文卡两条也是读（K1）：翻卡与读全文都只把文本摆到模型面前，表单一个字
   * 都没动。⛔ 别因为「卡上有参考图 URL」就以为它挂了图 —— 真挂上那一跳是之后
   * 那条 `mount_reference`，撤销也撤在那一条上（与 `search_web_images` 同源）。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
  ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
] as const

/**
 * 改动型工具 —— **每一条的 step 都必须带 `inverse`**，那是撤销的本钱（拍板 18）。
 *
 * ⚠ 这不是靠自觉：schema 层把改动型 step 的 `inverse` 写成必填，缺了就校验失败
 * （`types/assistant-operator.ts` + 那边的单测）。新加一条改动型工具而忘了想清楚
 * 「怎么撤」，在编译/测试期就会被拦下来，而不是等到用户点撤销时发现没反应。
 */
export const ASSISTANT_OPERATOR_MUTATING_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setSound,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  /**
   * ⚠ 拍板 22 那条是**改动型**：它让参考位上多出一张图，撤销就是把那张摘掉
   * （`inverse` 里放的是**源地址**，客户端按「源地址 → 落地地址」的对照表反查 ——
   * 落地地址在服务端还不存在，那一跳发生在客户端）。
   * ⛔ 撤销**不删素材**：用户亲手递的那条地址是他自己的决定，摘掉挂载就够了；
   * 拍板 21 的「零残留」管的是助手搜出来的候选，不是这一条。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  /**
   * LoRA 域那三条改动型（P4-C）。
   *
   * ⚠ `mount_lora` 的 `inverse` 里放的是 **candidateId** 而不是库记录 id —— 后者在
   * 服务端还不存在（导入那一跳在客户端）。形态与 `import_user_url` 逐字同源。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  /**
   * ⚠ 全表唯一一条后果落在**服务端**的改动型工具（其余都是吐一个 op 让客户端应用）。
   * 所以它的 `inverse` 里放的是**库记录 id**（服务端刚写出来的那条），
   * 而不是像 `mount_lora` 那样放一个客户端要自己反查的候选 id。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
  /**
   * ⚠ 第二条后果落在**服务端**的改动型工具（切片 X）：`inverse` 里放的是那张图
   * **原来的审核态**（服务端读得到），撤销 = 写回去。⛔ 不像 `mount_lora` 那样
   * 放一个客户端要自己反查的候选 id —— 这里没有「落地值在客户端才产生」那回事。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
] as const

/**
 * **花钱档工具**（§6 第三档，切片 2a）—— 读 / 改动型之外的第三张表。
 *
 * ── 为什么要第三张表，而不是塞进改动型 ────────────────────────────
 * 改动型那张表的全部意义是「每一条都必须带 `inverse`」（拍板 18）。这一档带不出
 * `inverse` 来 —— 生成出来的东西删不掉、钱退不回。硬给它一个空 `inverse` 的下场
 * 很具体：日志条上出现一颗撤销钮，点了什么都不会发生。撤销的位置由**结果卡**
 * 顶上（§11.4「结果行卡」），那才是这一档真正的回头路。
 *
 * ⚠ 服务端在这一档里照样**一分钱都花不掉**：它只吐载荷，扣扳机在客户端
 * （见 `requestGeneration` 的头注）。这张表分的是「能不能撤」，不是「谁花钱」。
 */
export const ASSISTANT_OPERATOR_SPEND_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
] as const

export function isMutatingAssistantOperatorTool(
  tool: AssistantOperatorTool,
): boolean {
  return (ASSISTANT_OPERATOR_MUTATING_TOOLS as readonly string[]).includes(tool)
}

export function isSpendAssistantOperatorTool(tool: string): boolean {
  return (ASSISTANT_OPERATOR_SPEND_TOOLS as readonly string[]).includes(tool)
}

/**
 * 这一步**撤得掉吗**。
 *
 * ⚠ 判据从「不是读类」改成「是改动型」——两者在花钱档出现之前是同一件事，
 * 之后不是了。`use-studio-operator-revert.ts` / `StudioOperatorLogItem.tsx` 现在
 * 还在用 `!READ_TOOLS.includes(...)`，第 3 轮接线时换成这条（那之前 UI 够不着
 * `request_generation`，因为它要等 2b 的面板接上才会被渲染）。
 */
export function isRevertibleAssistantOperatorTool(tool: string): boolean {
  return (ASSISTANT_OPERATOR_MUTATING_TOOLS as readonly string[]).includes(tool)
}

/**
 * **确认三档**（§6，切片 2a 明确成常量）。
 *
 * | 档          | 触发                          | 载体                                        |
 * | ----------- | ----------------------------- | ------------------------------------------- |
 * | `free`      | 改提示词 / 参数 / 挂 LoRA     | **没有事件** —— 直落，留 checkpoint 薄卡     |
 * | `overwrite` | 目标字段已有用户手写内容      | `confirm_request`（追加 / 覆盖 / 保留三选） |
 * | `spend`     | 请求生成                      | `spend_request` + 硬确认卡，客户端扣扳机    |
 *
 * ⚠ `free` 在表里**不是凑数**：它是「什么时候什么都不问」这条判据的名字，没有它
 * 就只能靠「另外两档都不匹配」来表达 —— 而那是一句读不出意图的话。
 */
export const ASSISTANT_OPERATOR_CONFIRM_TIER_IDS = {
  free: 'free',
  overwrite: 'overwrite',
  spend: 'spend',
} as const

export const ASSISTANT_OPERATOR_CONFIRM_TIERS = [
  ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.free,
  ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.overwrite,
  ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.spend,
] as const

export type AssistantOperatorConfirmTier =
  (typeof ASSISTANT_OPERATOR_CONFIRM_TIERS)[number]

/**
 * 服务端**观察到**的出卡理由（`plan_request.reason`）。
 *
 * ⛔ 它不是判定 —— 判定在客户端（`shouldShowPlanCard`）。它是证据：这一轮的工具
 * 是花钱档（`spend`）/ 这一轮分了好几步（`multiStep`）/ 用户开了「先问我」
 * （`userRequested`）。⚠ 三者不是互斥的优先级链，服务端按这个顺序取第一条命中的。
 */
export const ASSISTANT_PLAN_REQUEST_REASON_IDS = {
  spend: 'spend',
  multiStep: 'multi-step',
  userRequested: 'user-requested',
} as const

export const ASSISTANT_PLAN_REQUEST_REASONS = [
  ASSISTANT_PLAN_REQUEST_REASON_IDS.spend,
  ASSISTANT_PLAN_REQUEST_REASON_IDS.multiStep,
  ASSISTANT_PLAN_REQUEST_REASON_IDS.userRequested,
] as const

export type AssistantPlanRequestReason =
  (typeof ASSISTANT_PLAN_REQUEST_REASONS)[number]

/**
 * 步数到几就值得先出一张计划卡（§5 客户端硬判的第二条判据）。
 *
 * ⚠ 3 不是随手拍的：一步（改个提示词）和两步（改提示词 + 换模型）出卡是纯打扰 ——
 * 用户看着一张卡上写着一句他刚说过的话。三步起才是「它要替我做一串事」，那时
 * 「开始 / 修改」才有得选。⛔ 调这个数之前先想清楚：调小 = 每次说话都先弹一张卡。
 */
export const ASSISTANT_PLAN_CARD_MIN_STEPS = 3

/**
 * **反问卡**的协议护栏（2026-09-06 改写，替换旧的三格待定项）。
 *
 * ── 换掉了什么 ────────────────────────────────────────────────────
 * 旧形状是 `pending[]`：一行 `label` + 一排只有名字的 chip。它问出来的东西长得
 * 像图钉墙 —— 用户看着「3D 游戏渲染 / 风格化 3D」两颗 chip，**答不上来它俩差在
 * 哪**，因为差别根本没写在卡上。新形状逐条对着这件事修：
 *  · `question` 是**一个问句**，`header` 是收起态那一行只写得下的几个字；
 *  · 每个选项带**一句说明** —— 「这条路会发生什么」就是差别本身；
 *  · **推荐项排第一**：用户多数时候要的是「你觉得呢」，不是一道选择题；
 *  · `multiSelect` **显式**：⛔ 不许「看选项个数猜」，猜错的表现是用户点了第二项、
 *    第一项自己没了。
 *
 * ⚠ 上限 4 题是**设计**不是护栏：一次问五件事就不是反问，是问卷。
 * ⚠ 每题 2–4 项同理：一个选项的「单选」不是问题，是通知（`message` 那条路）；
 *   五个以上说明问题问错了，该先缩小范围。
 */
export const ASSISTANT_PLAN_CARD_LIMITS = {
  maxQuestions: 4,
  minOptions: 2,
  maxOptions: 4,
  /** chip 上那几个字（≤12 字）。⛔ 别拿它装问句。 */
  maxHeaderChars: 12,
  /** 问句本身。 */
  maxQuestionChars: 80,
  /** 选项标题。 */
  maxOptionLabelChars: 40,
  /** 选项那一句说明 —— 没有它，这张卡就退回图钉墙。 */
  maxOptionDescriptionChars: 80,
  /** 「其他」里用户自己写的那一句。 */
  maxOtherTextChars: 200,
} as const

/**
 * 歧义反问单选卡（`choice_request`）的护栏。
 *
 * ⚠ `maxOptions` 是 8 而不是「不设上限」：卡是 `grid-cols-4`（§11.4），两行封顶。
 * 候选比这还多说明问题问错了 —— 该先缩小范围，而不是铺一屏缩略图。
 * ⚠ `minOptions` 2：一个候选的「单选」不是问题，是通知（同计划卡待定项那条）。
 */
export const ASSISTANT_CHOICE_REQUEST_LIMITS = {
  minOptions: 2,
  maxOptions: 8,
  maxQuestionChars: 160,
} as const

/**
 * `search_assets` 能检索的媒体类型。
 *
 * ⚠ 判据一直是同一条：**工作台上有没有把它挂上去的槽**（拍板 19）。3D 至今
 * 没有，所以至今不在表里；音频在 P4-A 进来，因为视频工作台的音频参考面板
 * （`StudioVideoAudioPanel`，台账 A）就是那个槽 —— 它挂的是素材库里的音频。
 * ⛔ 「有这个类型」不等于「哪个域都能挂」：`audio` 只在视频域挂得上，图片域调
 * `mount_audio_reference` 会被域工具表挡掉（见 `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN`）。
 * 值域与 `OUTPUT_TYPE_VALUES` 的从属关系由 `types/assistant-operator.ts` 的
 * `satisfies` 锁住。
 */
export const ASSISTANT_OPERATOR_SEARCH_KINDS = [
  'image',
  'video',
  'audio',
] as const

export type AssistantOperatorSearchKind =
  (typeof ASSISTANT_OPERATOR_SEARCH_KINDS)[number]

/** 文件夹视觉检查对每张图的相关度结论；不用虚假的百分比分数。 */
export const ASSISTANT_FOLDER_VISION_RELEVANCE_IDS = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: 'unknown',
} as const

export const ASSISTANT_FOLDER_VISION_RELEVANCES = Object.values(
  ASSISTANT_FOLDER_VISION_RELEVANCE_IDS,
)

export const ASSISTANT_FOLDER_VISION_DEFAULT_INSTRUCTION =
  'Describe each image accurately, identify the strongest recurring patterns, and call out important differences.'

/**
 * `search_assets` **不指定类型时**默认搜什么。
 *
 * ⚠ 不是 `ASSISTANT_OPERATOR_SEARCH_KINDS` 全集：音频进表之后，一次泛搜会把
 * 一堆挂不到参考图位上的音频混进候选里（图片域尤其荒唐）。要音频就明写
 * `kind:'audio'` —— 那是一次有意的动作，而不是泛搜的副产物。
 */
export const ASSISTANT_OPERATOR_DEFAULT_SEARCH_KINDS = [
  'image',
  'video',
] as const satisfies readonly AssistantOperatorSearchKind[]

/** 一步的三态。同一个 step id 先 `running` 后 `done` / `error`。 */
export const ASSISTANT_OPERATOR_STEP_STATUS_IDS = {
  running: 'running',
  done: 'done',
  /** ⚠ 只用于**被规划器拒掉**的那一步 —— 它没有 payload / inverse，什么都没应用。 */
  error: 'error',
} as const

export const ASSISTANT_OPERATOR_STEP_STATUSES = [
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
] as const

export type AssistantOperatorStepStatus =
  (typeof ASSISTANT_OPERATOR_STEP_STATUSES)[number]

/**
 * 没跑完就停下来的理由。
 *
 * ⚠ `awaitingConfirm` 与 `aborted` **走的是同一条机制**（流结束 + 客户端带上下文
 * 重发），只是触发方不同 —— 前者是助手要问一句，后者是用户插话。合成一个理由会
 * 让 UI 分不出「等你选」和「你打断了」。
 */
export const ASSISTANT_OPERATOR_STOP_REASONS = {
  /** 客户端 abort 了（插话 / ⏹，拍板 13）。 */
  aborted: 'aborted',
  /** 等就地确认（拍板 3）。客户端带 `confirmations` 重发即可续跑。 */
  awaitingConfirm: 'awaiting_confirm',
  /** 撞到步数上限。**不自动续跑** —— 台账 AH：这条链没有幂等键，不做任何自动重试。 */
  maxSteps: 'max_steps',
} as const

export type AssistantOperatorStopReason =
  (typeof ASSISTANT_OPERATOR_STOP_REASONS)[keyof typeof ASSISTANT_OPERATOR_STOP_REASONS]

/** 会触发就地确认的字段 —— 只有这两个是「用户手写的自由文本」。 */
export const ASSISTANT_OPERATOR_CONFIRM_FIELDS = {
  prompt: 'prompt',
  negative: 'negative',
} as const

export type AssistantOperatorConfirmField =
  (typeof ASSISTANT_OPERATOR_CONFIRM_FIELDS)[keyof typeof ASSISTANT_OPERATOR_CONFIRM_FIELDS]

/** 就地确认小条上的三个选择（拍板 3，逐字对应切片 v4 的「追加在后 / 覆盖 / 保留」）。 */
export const ASSISTANT_OPERATOR_CONFIRM_CHOICES = {
  append: 'append',
  overwrite: 'overwrite',
  keep: 'keep',
} as const

export type AssistantOperatorConfirmChoice =
  (typeof ASSISTANT_OPERATOR_CONFIRM_CHOICES)[keyof typeof ASSISTANT_OPERATOR_CONFIRM_CHOICES]

/**
 * 文本写入方式。`append` 时客户端把新值接在旧值后面（用 `appendSeparator`），
 * `replace` 时整段换掉 —— 而 `inverse` 两种情况下都是**改前的完整原文**，
 * 撤销因此只有一种实现。
 */
export const ASSISTANT_OPERATOR_WRITE_MODES = {
  replace: 'replace',
  append: 'append',
} as const

export type AssistantOperatorWriteMode =
  (typeof ASSISTANT_OPERATOR_WRITE_MODES)[keyof typeof ASSISTANT_OPERATOR_WRITE_MODES]

/** 追加时插在旧文本与新文本之间的分隔符。放常量是因为撤销/预览两处都要用它算长度。 */
export const ASSISTANT_OPERATOR_APPEND_SEPARATOR = ', '

/**
 * P1 的域 —— 工作台三域，**取值来自 `ASSISTANT_PROTOCOL_DOMAINS`**（域简报已分域，
 * 复用不重造）。`canvas` 有意不在这里：画布对齐是 P4，那之前它走自己的 ops。
 * `satisfies` 保证有人改域词表时这里编译期就红。
 */
export const ASSISTANT_OPERATOR_DOMAINS = [
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
] as const satisfies readonly AssistantProtocolDomain[]

export type AssistantOperatorDomain =
  (typeof ASSISTANT_OPERATOR_DOMAINS)[number]

/**
 * **跨域通用**的那几条 —— 换个工作台它们做的还是同一件事。
 *
 * 判据：这条工具动的东西在每个域里都长着同一个样子（读快照 / 搜库 / 搜网 /
 * 收下用户递的链接 / 挂参考图 / 把生成键点亮）。⛔ 一旦某个域的形状不同
 * （比如视频的规格是三格、图片是两格），那就不是通用件，得各自一条。
 */
const COMMON_DOMAIN_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  /**
   * ⚠ 联网查文字**全域通用**（切片 3b）：「这个角色官方名怎么写」在图片、视频、
   * LoRA 三台工作台上是同一个问题，⛔ 别按域裁。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
  /**
   * ⚠ 检索与读正文**全域通用**（2026-09-06）：「这个角色官方长什么样」在图片、
   * 视频、LoRA 三台工作台上是同一个问题，⛔ 别按域裁。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.research,
  ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  /**
   * 规则两条**全域可用**（§10）：一条「负面词永远带 worst quality」的规则在图片、
   * 视频、LoRA 三台工作台上说的是同一件事。⛔ 别按域裁 —— 那等于让用户在每个
   * 工作台上把同一条规则再写一遍。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules,
  ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
  /**
   * 上下文卡两条**全域可用**（K1）：一张角色卡在图片、视频、LoRA 三台工作台上
   * 说的是同一个人。⛔ 别按域裁 —— 那等于让用户在每个工作台上把同一份设定再写
   * 一遍，而这张表存在的全部意义就是不必再写一遍。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
  ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
  /**
   * 审核态**全域可用**（切片 X）：「这张不行」在图片、视频、LoRA 三台工作台上
   * 说的是同一件事，而被否掉的那张图恰恰最容易在换一台工作台之后被重新挂上。
   * ⛔ 别按域裁 —— 那等于让用户在每台工作台上把同一张图再否一遍。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
] as const satisfies readonly AssistantOperatorTool[]

/**
 * **一个域有哪些工具**（拍板 8 的另一半：切域换工具，不断会话）。
 *
 * ── 为什么工具表要按域裁，而不是靠快照缺席去拒 ────────────────────
 * 快照缺席那条闸仍然在（`noSuchControl`），但它是**事后**的：模型先花一步调，
 * 再读到一句「这台机器上没这回事」。而每一步都是一次完整的 LLM 往返，
 * `maxSteps` 只有 8 —— 在视频档上白烧一步去试 `set_count` 是真的会发生的事
 * （它在系统提示的工具表里看得见）。裁掉之后它压根看不见那条工具。
 * ⚠ 两道闸都要留：模型仍可能写出一个不在自己域里的工具名（提示词不是闸），
 * 那时规划器按 `noSuchControl` 拒并说清楚「这条工具不在这个工作台上」。
 *
 * ⚠ 写成 `Record<域, …>`：域词表加一个而这里没跟上，编译期就红。
 */
/**
 * **参考位的具名槽**（第二期 · 视频域）。
 *
 * ── 为什么现在才有名字 ────────────────────────────────────────────
 * 首尾帧的语义今天**靠位置承载**：`reference-image-capabilities.ts` 的头注写得很
 * 清楚 —— 那边曾经预留过一个 `slotted` 变体来表达首尾帧，零个模型声明、唯一用例
 * 在测试里，2026-08-08 补首尾帧时删掉了；真正生效的是 `buildWan30` 这类 builder
 * 里的「[0] 首帧、[1] 尾帧」。位置对**人**够用（界面上两个格子挨着摆），对**模型**
 * 不够：它写不出「第 0 个」，它只会说「首帧」。
 *
 * ⚠ 所以这张表是**协议层的名字**，不是新的一套能力声明：它落地那一跳仍然回到
 * 位置（客户端 `studio-operator-apply.ts` 把 `first` 写进 0 槽、`last` 写进 1 槽），
 * ⛔ 不在 `reference-image-capabilities.ts` 里把那个死变体复活 —— 同一件事留两套
 * 并行概念，比没有更糟（那正是它当初被删的理由）。
 *
 * ⚠ `reference` 是**默认档**（没写 slot 就是它），也就是「一张无语义的参考图」——
 * 图片域全部落在这一档，视频域的多图参考 / 全能参考档也是。
 */
export const ASSISTANT_OPERATOR_REFERENCE_SLOT_IDS = {
  /** 首帧（`keyframe` 档的 [0] 槽）。 */
  first: 'first',
  /** 尾帧（`keyframe` 档的 [1] 槽）。⚠ 只有 `keyframeSlots === 2` 的模型有。 */
  last: 'last',
  /** 无语义的参考图 —— 默认档。 */
  reference: 'reference',
  /** 参考**视频**（Seedance 2.x 全能参考那一档的 `slots.videos`）。 */
  video: 'video',
} as const

export const ASSISTANT_OPERATOR_REFERENCE_SLOTS = [
  ASSISTANT_OPERATOR_REFERENCE_SLOT_IDS.first,
  ASSISTANT_OPERATOR_REFERENCE_SLOT_IDS.last,
  ASSISTANT_OPERATOR_REFERENCE_SLOT_IDS.reference,
  ASSISTANT_OPERATOR_REFERENCE_SLOT_IDS.video,
] as const

export type AssistantOperatorReferenceSlot =
  (typeof ASSISTANT_OPERATOR_REFERENCE_SLOTS)[number]

/**
 * 视频评审卡那三帧各自**站在哪儿**（第二期）。
 *
 * ⚠ 是位置名不是时间戳：`t` 那个秒数照样带在载荷里，但卡上写的、模型读的都是这
 * 三个词 —— 「末帧没到 endState」比「7.94 秒那张没到 endState」可读得多。
 */
export const ASSISTANT_OPERATOR_CRITIQUE_FRAME_LABELS = [
  'start',
  'mid',
  'end',
] as const

export type AssistantOperatorCritiqueFrameLabel =
  (typeof ASSISTANT_OPERATOR_CRITIQUE_FRAME_LABELS)[number]

export const ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN: Record<
  AssistantOperatorDomain,
  readonly AssistantOperatorTool[]
> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
    ASSISTANT_OPERATOR_TOOL_IDS.setCount,
    /**
     * 花钱档（§6）**只给两台工作台**。⛔ 装配台没有：它的出图键住在
     * `GenerateBranch` 的局部 state 里，宿主契约上还没有那只手
     * （`triggerGeneration` 在 LoRA 宿主上有意缺席）。摆一条这个域里无解的工具，
     * 正是 `set_count` / `set_specs` 当初被裁掉的同一个形状。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
    /**
     * ⭐ 看图闭环。借来的那条视觉线吃的是一张**静态图**（`imageData: result.url`）
     * —— 这条约束一个字都没松；视频档能进表，靠的是先把片子抽成三张静态图
     * （见下面视频档那条注释），⛔ 不是把 mp4 地址直接喂给它。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  ],
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
    ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
    ASSISTANT_OPERATOR_TOOL_IDS.setSound,
    ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
    /**
     * ⭐ 看片评审（第二期）。**这里曾经写着「看图闭环只在图片域」并把视频档排除**
     * —— 那条判据没错，错的是它当时被写成了永久结论：把一条 mp4 地址喂给静态图
     * 视觉线，得到的是一份格式完整、内容全编的评价（`vision-route.service.ts` 头注）。
     *
     * 第二期给的正是那句「视频要能被看，得先有一条真的能读视频的路」的答案，而且
     * 走的**不是**原生读视频那条：客户端按确定性计划抽 **0 / 中 / 末三帧**
     * （`lib/video-frame-capture.ts`，浏览器里 `<video>` + canvas），服务端复算计划
     * 逐帧核对时间戳、转存 R2，然后**三张静态图**照旧走同一条视觉线。喂进去的
     * 从头到尾都是 png/webp，那条「全编」的风险因此在结构上就不存在。
     * ⚠ 抽不出帧时按 `videoFramesMissing` 拒，⛔ 不回落成拿视频地址去猜。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  ],
  /**
   * LoRA 装配台（P4-C）。
   *
   * ── 通用件为什么是这九条，以及**缺的那两条为什么缺** ──────────────────
   * `/studio/lora` 的界面上真有：提示词框、负面框（可折叠）、底模选择器、参考图卡
   * （逐底模按能力开关）、装配台挂载栈、出图键。所以九条通用件一条不少。
   * ⛔ **没有 `set_count`**：装配台是单次出图，界面上压根没有张数控件
   *    （`LoraWorkbench` 里那句「本域是单次出图，压根没有张数字段」）。
   * ⛔ **没有 `set_specs`**：装配台有比例（`LoraAspectRatioChip`）却**没有清晰度**
   *    —— 而 `set_specs` 的两个字段都是必填（台账 AE/BG/BS：只给比例不是真比例）。
   *    摆一条这里永远无解的工具，正是 2026-08-30「三连红而表单没动」那个形状。
   *    比例这颗旋钮因此在本片**够不着**（如实记在任务包里，补它是独立一件：
   *    要么给 LoRA 域一条单字段的比例工具，要么等装配台补上清晰度控件）。
   * ⛔ **没有 `critique_result`**：看图闭环的归属追踪（`studio-operator-claim`）
   *    盯的是工作台的 `activeRun`，而装配台走自己那条结果列（`resultHistory`）。
   *    在闭环接上之前给这条工具，只会让它每次都撞 `noResultToCritique`。
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
    ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
    ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
    ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  ],
}

export function isAssistantOperatorToolInDomain(
  tool: AssistantOperatorTool,
  domain: AssistantOperatorDomain,
): boolean {
  return ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[domain].includes(tool)
}

export const ASSISTANT_OPERATOR_LIMITS = {
  /**
   * 一轮最多跑几步。**每一步都是一次完整的 LLM 往返**，所以这个数直接决定最坏
   * 情况下的等待时间与账单，不是防御性的大数。撞到上限按 `maxSteps` 停下并说出来。
   */
  maxSteps: 8,
  /** 计划条最多几项 / 每项多长。它是给人看的一句话，不是可执行清单。 */
  maxPlanItems: 6,
  maxPlanItemChars: 120,
  /** 日志条的标题与理由（拍板 18 的「候选与放弃理由」写在 reason 里）。 */
  maxTitleChars: 80,
  maxReasonChars: 300,
  /** 一轮对白的长度上限。 */
  maxMessageChars: 4000,
  /**
   * 提示词 / 负面提示词载荷的长度上限。
   *
   * ⚠ 这**不是**产品上限（表单里人手输入不受此限），只是「一条 op 能有多大」的
   * DoS 护栏 —— 与 `NODE_ASSISTANT_OP_LIMITS.maxPromptLength` 同性质，别把它当成
   * 能力承诺印到 UI 上。
   */
  maxPromptChars: 4000,
  /** 模型 id / 档位值 / 标签这类短字符串。 */
  maxIdChars: 200,
  maxLabelChars: 120,
  maxParamValueChars: 40,
  /** 快照里能列多少个可选模型 —— 与 `ASSISTANT_WORKBENCH_STATE_LIMITS.maxCatalogModels` 同量级。 */
  maxAvailableModels: 24,
  /** 一个档位（比例 / 清晰度）最多列几个可选值。 */
  maxSpecOptions: 24,
  /** 快照里已挂的参考图条数上限（纯载荷护栏，真上限由 `references.limit` 说了算）。 */
  maxSnapshotReferences: 16,
  /**
   * `search_assets` 一次最多返回几条。
   *
   * 附件面板一屏就摆 6 格（拍板 16），这里给 12 是留出「模型从中挑一张」的余地 ——
   * 日志详情要展示候选与放弃理由（拍板 18），只给 6 条就没什么可挑的。再往上翻倍
   * 只会让每一步的 token 变贵而候选质量不变。
   */
  maxSearchResults: 12,
  /** `search_assets` 的查询词长度，与 `GallerySearchSchema.search` 的 200 对齐。 */
  maxSearchQueryChars: 200,
  /** 一次最多把多少个同名/近名文件夹交给模型消歧。 */
  maxFolderMatches: 12,
  /** 文件夹名称查询沿用 Project.name 的短字符串尺度。 */
  maxFolderQueryChars: 120,
  /** 一次文件夹视觉检查最多真的送进模型多少张图。 */
  maxFolderVisionImages: 24,
  /** 每次视觉补全的图片数；必须与 `VISION_LIMITS.maxMedia` 保持一致。 */
  maxFolderVisionBatchImages: 8,
  /** 模型转述给视觉线的本轮目标，例如“挑三张角色参考”。 */
  maxFolderVisionInstructionChars: 600,
  /** 逐图观察与理由的协议护栏，避免 24 张时事件体无界增长。 */
  maxFolderVisionObservationChars: 400,
  maxFolderVisionReasonChars: 300,
  maxFolderVisionTags: 6,
  maxFolderVisionTagChars: 40,
  maxFolderVisionBatchSummaryChars: 800,
  maxFolderVisionUncertainties: 8,
  /**
   * `search_web_images` 一次最多返回几张候选。
   *
   * ⚠ 与 `maxSearchResults`（12）分开：那是库内检索，一个 credit 都不花；这一条
   * **每调一次就是一个 Serper credit**（免费池 2500）。8 张已经够日志条摆两行，
   * 再多只是让每一步的 token 更贵。真正的上限在 `WEB_IMAGE_SEARCH.maxNumResults`，
   * 这里是协议侧的护栏，两边取小。
   */
  maxWebImageResults: 8,
  /**
   * 联网查询词的长度。**比库内检索短得多是故意的** —— 图搜引擎吃的是短查询，
   * 一段两百字的描述只会让召回崩掉（系统提示里也这么告诉模型）。
   */
  maxWebImageQueryChars: 120,
  /**
   * `search_web`（文字）一次最多回几条来源（切片 3b）。
   *
   * ⚠ 与 `maxWebImageResults` 分开是因为它们的成本形状不同吗——不是，两条都是一个
   * Serper credit。分开是因为**读的人不同**：图那条是给用户挑的，8 张摆两行；
   * 这条是给模型读的，每条都带一段摘要，6 条已经是一屏 token。真上限在
   * `WEB_SEARCH.maxNumResults`（10），两边取小。
   */
  maxWebSearchResults: 6,
  /**
   * 文字查询词的长度。
   *
   * ⚠ **比图搜那条（120）宽**是有理由的：图搜引擎吃短查询，一整句会让召回崩掉；
   * 文字搜索恰恰相反，「鸣潮 忌炎 官方设定 配色」这种带限定词的长查询才查得准。
   * 与库内检索的 200 对齐。
   */
  maxWebSearchQueryChars: 200,
  /**
   * 一条来源的摘要长度。
   *
   * ⚠ 上游给到 600（`WEB_SEARCH.maxSnippetLength`），这里砍到 300：6 条 × 600
   * 字塞进工具环的观察里，等于每一步都多花一次长上下文的钱，而摘要后半段基本是
   * 页脚。要更多内容得去读正文，而本片没有那一跳。
   */
  maxWebSearchSnippetChars: 300,
  /**
   * 重发时能带回来的「前情 steps」条数。
   *
   * ⚠ 这条链**没有服务端会话态**（拍板 13 的打断语义就靠这个成立），所以上一轮
   * 做过什么全靠客户端带回来。给得太少 = 助手在插话后忘了自己刚改过什么，
   * 于是重复改一遍。
   */
  maxPriorSteps: 24,
  maxPriorStepSummaryChars: 200,
  /** 就地确认里「你已经写了什么」的摘要长度 —— 小条上放不下一整段。 */
  maxConfirmHaveChars: 200,
  /**
   * 一张评价卡最多列几条（P3-C，拍板 6）。
   *
   * ⚠ 4 条是**版式上限不是模型的礼貌**：卡片左边是那张图（h-28），右边放得下
   * 四行；给 8 条只会让图和结论错位半屏。真要说更多，让它写进 `advice`。
   */
  maxCritiqueFindings: 4,
  /** 一条结论一句话 —— 卡片一行放得下的长度。 */
  maxCritiqueFindingChars: 120,
  /** 「下一轮建议」那一行。 */
  maxCritiqueAdviceChars: 300,
  /** 评价那一步能带的目标描述（模型自己写的「这一轮想要什么」）。 */
  maxCritiqueGoalChars: 300,
  /**
   * 视频域评审卡上**恒定三帧**（第二期，owner 2026-09-06 定 0 / 中 / 末）。
   *
   * ⚠ 它是**契约上的常数**而不是一个可调档位：卡片版式按三格排（`start` / `mid` /
   * `end` 各一格），而三个位置各自回答一个固定的问题 —— 起手对不对、中段动作有没有
   * 冻住、末帧到没到 `endState`。给 5 帧只会让「末帧」这个语义在卡上找不到位置。
   * ⛔ 别把它接成一个用户可调的数：那时抽帧计划、卡片版式、系统提示里那三句话
   *    要一起改，而它们分散在三个文件里。
   */
  videoCritiqueFrameCount: 3,
  /**
   * `import_user_url` 收的地址长度（P3-D，拍板 22）。
   *
   * ⚠ 比 `maxIdChars`(200) 宽：真实的图片直链常带一长串签名参数
   * （wikimedia 的 `thumb/…/1280px-….jpg`、CDN 的 `?token=`），200 会把正常地址
   * 截在半路，而截断过的地址**永远过不了「逐字出现在用户消息里」那道闸** ——
   * 表现是「我明明把链接给它了，它说那不是我给的」。
   */
  maxUserUrlChars: 2000,
  /**
   * 连着几次撞上「同一步重复」就强制收尾（P3-D 卡死护栏）。
   *
   * ⚠ 2 是「一次是抖动、两次是打转」：第一次拒掉时模型读得到理由，还有一次
   * 换策略的机会；第二次说明它没读进去，再放它跑下去只会把剩下的步数（每一步
   * 都是一次完整 LLM 往返）全烧在同一个坑里 —— 那正是 owner 撞到的三连搜。
   */
  maxRepeatedStepStrikes: 2,
  /**
   * `search_loras` 一次最多回几张候选（P4-C）。
   *
   * ⚠ 真上限在 `LORA_CANDIDATE_LIMITS.maxCandidates`（检索层自己的），两边取小 ——
   * 这里是协议侧的护栏。⛔ 别在这里抄一份检索层的数：那两个数分叉的表现是
   * 「日志里说找到 8 条，候选行只画得出 6 条」。
   * 6 是候选行一屏摆得下、又够挑的量；`[[lora]]` 推荐块的 `maxPicks` 是 3，
   * 检索给 6、推 3，中间那一层「挑」正是助手的活。
   */
  maxLoraResults: 6,
  /** LoRA 检索词长度 —— 与库内检索同量级（上游吃的是短查询）。 */
  maxLoraQueryChars: 120,
  /**
   * `set_review_state` 的理由长度（切片 X）。
   *
   * ⚠ 与 `maxReasonChars`(300) 分开而不是复用：那条是日志条上那行「为什么做这一步」，
   * 这条要**落进 snapshot 跟着素材走**，会被下一轮、下一台工作台读回来。短一点是
   * 有意的 —— 一句「手指糊了」够用，一段三百字的评价该写进评价卡。
   */
  maxReviewReasonChars: 120,
  /**
   * `prime_generate` / `request_generation` 上那个 `label` 的长度（切片 X）。
   *
   * ⚠ 24 是**产物名摘要那一段**的尺度而不是随手拍的数：它最终落到
   * `图_012·主视觉` 里点号后面那截（`GENERATION_NAME.maxLength` 40 减去身份段
   * 与分隔符还剩下的余量）。给得更长只会让名字在结果行卡上被截断，
   * 而截断过的名字用户读不出来自己当时说的是哪一张。
   */
  maxGenerationLabelChars: 24,
} as const

/**
 * **跨轮工作记忆**的上限（切片 X）。
 *
 * ── 它解决的是什么 ────────────────────────────────────────────────
 * 服务端零会话态（拍板 13）的代价一直很具体：上一轮搜到的候选、上一轮生成的那张
 * 图，这一轮的准入名单里**一个都不在** —— 于是用户说「把刚才那张挂上」时助手只能
 * 重新搜一遍，或者干脆按 `unknownAsset` 拒。`priorSteps` 带回来的是「做过什么」
 * （一行摘要），带不回「产出了什么」（可指认的东西）。
 * ⚠ 它仍然**不是服务端状态**：整份记忆由客户端在每次请求里带上来，服务端读完就
 * 丢。⛔ 别把它做成服务端的一张表 —— 那正是打断语义要躲开的东西。
 * ⚠ 它也**不放宽任何实体闸**：blocked 照旧拒、参考位上限照旧、站点判定照旧。
 * 它只是让「这一轮之前产出过的东西」进得了准入名单。
 */
export const ASSISTANT_WORKING_MEMORY = {
  /**
   * 记得最近几轮。
   *
   * ⚠ 5 是「够用户说得出『刚才那张』」与「每一步系统提示都要重发这一段」之间的
   * 那个数：每一轮至多 `maxArtifactsPerRound` 条名字，5 轮就是一屏 token，而
   * 每一步 LLM 往返都要重付一次。⛔ 别调大成「整条会话」：那是把上下文窗口的钱
   * 花在用户十分钟前就不再提的东西上。
   */
  maxRounds: 5,
  /** 一轮里最多记几件产物。 */
  maxArtifactsPerRound: 20,
} as const

/**
 * **断点续跑**的载荷上限（第三期）。
 *
 * ⭐ 它在协议侧而不是面板侧：`resumeFrom` 是客户端发上来、服务端 zod 要卡住的
 * 那一份，两边必须读同一个数。⛔ 面板那份词表里只留 localStorage 的键与保质期。
 *
 * ⚠ `maxSteps` 与 `ASSISTANT_OPERATOR_LIMITS.maxSteps`（一轮跑几步）**不是一回事**：
 * 一份计划可以横跨好几轮（失败、续跑、再失败），所以这个数比它大一档。
 */
export const ASSISTANT_OPERATOR_RESUME_LIMITS = {
  maxSteps: 12,
  /** 一步最多带回几件产物 id —— 续跑提示里只念名字，⛔ 不搬内容。 */
  maxArtifactsPerStep: 8,
} as const

/**
 * 计划里**一步的三态**（第三期 · 断点续跑）。
 *
 * ⚠ 只有三档，⛔ 没有「running」：续跑记录是**落地在 localStorage 上的事实**，
 * 而「正在跑」在下一次刷新之后一定不再成立。跑到一半被打断的那一步按 `pending`
 * 记 —— 它没做完，续跑时就该重做一次。
 */
export const ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS = {
  pending: 'pending',
  done: 'done',
  failed: 'failed',
} as const

export const ASSISTANT_OPERATOR_RESUME_STEP_STATES = [
  ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.pending,
  ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done,
  ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.failed,
] as const

export type AssistantOperatorResumeStepState =
  (typeof ASSISTANT_OPERATOR_RESUME_STEP_STATES)[number]

/**
 * `cost_tick` 的三档（切片 X）—— **按「贵在哪」分，不按工具名分**。
 *
 * ⚠ 一条工具可能同时属于两档（`critique_result` 借一条视觉线看图 = `vision`，
 * 而它自己那次 JSON 往返 = `llm`），所以这张表分的是**这一帧在数什么**。
 */
export const ASSISTANT_COST_TICK_KIND_IDS = {
  /** 看了一次图（含视频抽出来的帧）—— `units` = 这一次真的送进模型的图片张数。 */
  vision: 'vision',
  /** 打了一次外部源（检索 / 搜网 / 读正文）—— `units` = 这一次真的打出去的次数。 */
  research: 'research',
  /** 一次完整的 LLM 往返 —— `units` 恒 1。 */
  llm: 'llm',
} as const

export const ASSISTANT_COST_TICK_KINDS = [
  ASSISTANT_COST_TICK_KIND_IDS.vision,
  ASSISTANT_COST_TICK_KIND_IDS.research,
  ASSISTANT_COST_TICK_KIND_IDS.llm,
] as const

export type AssistantCostTickKind = (typeof ASSISTANT_COST_TICK_KINDS)[number]

/**
 * 每一档在界面上怎么念 —— **服务端只发 i18n key**，⛔ 不发人话。
 *
 * ⚠ 判据与 `error.i18nKey` 那条同源：服务端不知道用户此刻的界面语言（
 * `responseLanguage` 说的是**助手说话**用哪种语言，与界面语言不是一回事），
 * 发一句中文过去的表现是英文界面上蹦出一行中文。
 * ⚠ 写成 `Record<档, …>`：加一档而这里没跟上，编译期就红。
 */
export const ASSISTANT_COST_TICK_LABEL_KEYS: Record<
  AssistantCostTickKind,
  string
> = {
  [ASSISTANT_COST_TICK_KIND_IDS.vision]: 'StudioOperator.cost.vision',
  [ASSISTANT_COST_TICK_KIND_IDS.research]: 'StudioOperator.cost.research',
  [ASSISTANT_COST_TICK_KIND_IDS.llm]: 'StudioOperator.cost.llm',
}

/**
 * 工具被规划器拒绝的理由。
 *
 * ⚠ 与画布同一条论据：**值域校验一律留在规划器，不收进 schema 的 enum**。
 * schema 拒 = 模型这一轮的输出整个解析失败，用户看到一句笼统的「读不出来」；
 * 规划器拒 = 那一条日志显示「这个工作台没有负面框」，助手还能据此改口。
 * 同一个禁令，后者可教。
 */
export const ASSISTANT_OPERATOR_REJECT_REASON_IDS = {
  /**
   * 这个工作台上**根本没有这个控件**（拍板 19：助手只动用户看得见的旋钮）。
   * 判据是快照里对应的那一节缺席 —— 比如图片台没有负面框、音频台没有比例。
   * ⚠ 台账 BJ 那条（参考强度）就是靠这一条兜住：控件没补上之前，工具压根不存在。
   */
  noSuchControl: 'noSuchControl',
  /** 模型 id 不在快照的 `availableModels` 里 —— 十有八九是它自己编的。 */
  unknownModel: 'unknownModel',
  /** 档位值不在快照给的那张表里。⛔ 不做就近匹配。 */
  unknownValue: 'unknownValue',
  /**
   * `mount_reference` 引的 asset 本轮 `search_assets` 从没返回过。
   * ⛔ 不去补查一次：那等于承认模型可以凭空说出一个 id。
   */
  unknownAsset: 'unknownAsset',
  /** `inspect_asset_folder` 引的 folder id 本轮从未由 `list_asset_folders` 返回。 */
  unknownFolder: 'unknownFolder',
  /** 参考图位已满（上限由快照的 `references.limit` 给）。 */
  referencesFull: 'referencesFull',
  /** 写了个空字符串 —— 清空字段不是助手该干的事，要清用户自己清。 */
  emptyValue: 'emptyValue',
  /**
   * 就地确认里用户选了「保留」（拍板 3）。
   *
   * ⚠ 它是**用户的决定**，不是助手的错 —— 与其余几条分开，UI 上的语气也该不同。
   * 留在拒绝词表里而不是静默跳过，是因为线程里必须看得见「这一步没做，因为你说别动」。
   */
  userDeclined: 'userDeclined',
  /**
   * 还没选模型。
   *
   * 两处用它：`prime_generate`（与人手点生成键时的拦法一致），以及 **`set_specs`
   * —— 清晰度档位表由已选模型算出来，没模型就一个值都没有**（2026-08-30 真机：
   * 那时它是被 args schema 抓成 `malformedArgs` 的，用户连着吃三条红字而表单没动）。
   * ⚠ 与 `noSuchControl` 分开：这条是「还差一步」，那条是「这台机器上没这回事」。
   */
  noModelSelected: 'noModelSelected',
  /** `prime_generate` 时提示词还是空的。 */
  emptyPrompt: 'emptyPrompt',
  /** 模型写的参数形状不对（缺字段 / 类型错），已经过一次 schema。 */
  malformedArgs: 'malformedArgs',
  /**
   * 联网搜图这条路当下用不了（平台没配 `SERPER_API_KEY`）。
   *
   * ⚠ 与 `noSuchControl` 分开：那条说的是「这台工作台上没这回事」（拍板 19），
   * 这条说的是「这个能力在，但后端没接通」。合成一条会让日志说谎 —— 用户会以为
   * 是自己的工作台不支持，然后去别的模态再试一遍。
   * ⚠ 它不是用户的 key（那类缺 key 要路由到 `QuickSetupDialog`，Hard Rule 8），
   * 是平台侧的一条线路，用户这边**没有任何可配置的东西**，所以只说明、不引导。
   */
  searchUnavailable: 'searchUnavailable',
  /**
   * 这一轮**没有结果图可看**（P3-C）。
   *
   * ⚠ 与 `noSuchControl` 分开：那条说「这台工作台上没这回事」，这条说
   * 「有这回事，但此刻没有它自己备的那一张」。用户自己点的生成不会带 `result`
   * 进来（拍板 4「用户自己发的不打扰」），所以这条**是常态而不是故障** ——
   * 模型读到它就该明白「等它备的那次跑完再说」。
   */
  noResultToCritique: 'noResultToCritique',
  /**
   * 一条能看图的路都借不到（P3-C）。
   *
   * ⛔ **不降级成「凭提示词猜」** —— 让一个看不见图的模型评价一张图，产出的是
   * 一份格式完整、内容全编的评价，比说不出话坏得多（论据与
   * `services/vision/vision-route.service.ts` 头注同源）。
   */
  visionUnavailable: 'visionUnavailable',
  /**
   * 看了，但那条视觉线没给出读得懂的评价（P3-C）。
   *
   * ⚠ 它是一条**被规划器拒掉的步**而不是一次抛错，这是有意的：抛错会让整轮以
   * 一句笼统的「跑到一半失败了」结束、日志停在半截（`clamp` 那段头注记的就是
   * 这种失败的样子）。做成拒绝之后，助手读得到理由，还能接着改表单。
   */
  critiqueFailed: 'critiqueFailed',
  /**
   * `import_user_url` 引的那条地址**不是用户自己给的**（P3-D，拍板 22）。
   *
   * ⭐ 判据是结构性的：那条 URL 必须**逐字**出现在本次请求的某条用户消息里。
   * 「你递的就是确认」的另一半就是这条 —— 用户没递过的地址，助手不能替他确认。
   * ⛔ 不放宽成「同域名就算」：那等于让模型把用户给的一条链接扩写成整个站。
   * 助手自己搜来的候选走另一条路（用户点「选用」，拍板 21）。
   */
  urlNotFromUser: 'urlNotFromUser',
  /**
   * 这一步与本轮**已经跑过的某一步一模一样**（P3-D 卡死护栏）。
   *
   * 🔬 owner 2026-08-31 真机：用户递了三条链接，而当时没有任何工具能接 URL ——
   * 助手于是连着跑了三次**同参**的「查找已保存的参考图」，把步数烧光，最后回头
   * 支使用户自己去点图。原地打转在事后一目了然，在当时对模型却是「再试一次
   * 说不定就有了」，靠提示词劝不住，只能在环上拦。
   * ⚠ 只比对**真的执行过**的步，不比对被拒的步：被拒之后条件可能已经变了
   * （`set_specs` 被 `noModelSelected` 拒 → 选完模型再来一次是**对的**行为），
   * 拿被拒的步去堵会把那条唯一的出路一起堵上。
   */
  repeatedStep: 'repeatedStep',
  /**
   * `mount_lora` 引的候选**本轮 `search_loras` 从没返回过**（P4-C）。
   *
   * ⛔ 与 `unknownAsset` 同一条论据，而且代价更大：这条链后面接着的是「导入进库」，
   * 一个编出来的 id 换来的是一次 404 或者别人的模型。⛔ 不去补搜一次。
   */
  unknownLora: 'unknownLora',
  /**
   * `unmount_lora` / `set_lora_weight` 指的那把**不在装配台上**（P4-C）。
   *
   * ⚠ 与 `unknownLora` 分开：那条是「你编了一个候选」，这条是「那把 LoRA 你没挂着」
   * —— 后者常常只是助手把候选 id 当成了挂载项 id，说清楚它就改得过来。
   */
  loraNotMounted: 'loraNotMounted',
  /**
   * 这把 LoRA **导入不了**（P4-C）。
   *
   * 判据来自检索层写在数据上的那一位（`LoraCandidate.importable`，门槛 = 定得出
   * 底模家族 + 有权重文件）。⛔ 不阻断展示 —— 不可导入的候选照样出现在候选行里
   * （策略 C：如实说明），只是挂不上；助手读到这条理由该改口说「这把只能去它的
   * 来源页看」，而不是换个参数再挂一次。
   */
  loraNotImportable: 'loraNotImportable',
  /**
   * 规则表满了（§10）。⛔ 不静默丢弃、也不悄悄挤掉最老的一条 —— 用户写下的
   * 每一条都是他自己的决定，该由他去删。助手读到这条理由该把话转给用户。
   */
  ruleLimitReached: 'ruleLimitReached',
  /**
   * 这条地址的来源站**不能当生成输入**（切片 3b）。
   *
   * 判据是域名判定表（`constants/web-image-sources.ts`）里的 `blocked` 一档：
   * 站方明令禁 AI，或整站是溯源不到原作者的转载聚合。
   * ⚠ 它**不是版权判断**（那张表的头注写着这条），是一句「这个站我们不替你按」。
   * ⛔ 不静默换一张：助手读到这条理由该把话转给用户——换个来源，或者他自己去
   * 原页确认之后把地址递过来（那条路仍然通，判据是「地址是谁给的」）。
   */
  sourceNotUsable: 'sourceNotUsable',
  /**
   * 这一轮的 `research` **轮次用完了**（2026-09-06）。
   *
   * ⚠ 与 `repeatedStep` 分开：那条说「你刚跑过一模一样的一步」，这条说
   * 「换了目标也不能再查了」。多轮检索的价值在于「拿上一轮的证据缩小目标」，
   * 但它每一轮都在打真实的外部源（还带着 Serper credit），没有硬上限的表现是
   * 一个查不到答案的问题把整轮步数全烧在检索上，表单一个字都没写。
   * ⛔ 读到这条理由该去写它已经知道的那些，⛔ 不是换个词再查一遍。
   */
  researchRoundsExhausted: 'researchRoundsExhausted',
  /**
   * `read_url` 拿到的地址**不能读**（2026-09-06）。
   *
   * 判据两条，都在服务端：非 http(s)，或指向本站自己（助手去读自己的页面
   * 拿不到任何新信息，却能把内部地址喂进模型上下文）。
   * ⚠ 与 `sourceNotUsable` 分开：那条说的是版权/来源，这条说的是「这条地址
   * 本来就不该走这条工具」。
   */
  urlNotReadable: 'urlNotReadable',
  /**
   * 读了，但那一页**没取回正文**（2026-09-06）。
   *
   * 站点挡了、超时了、或者整页是 JS 空壳 —— 三种在这一层长得一样，而下一步
   * 该做的事是同一件：换一个来源，⛔ 不是把标题当正文脑补。
   * ⚠ 做成拒绝而不是抛错（同 `critiqueFailed`）：抛错会让整轮以一句笼统的
   * 「跑到一半失败了」结束，做成拒绝之后助手读得到理由、还能接着改口。
   */
  urlUnreadable: 'urlUnreadable',
  /**
   * **选了首帧图，宽高比就只剩自适应**（第二期，owner 2026-09-06 定）。
   *
   * 判据来自发送契约里那条 `imageAspectRatioLock`（`video-model-send-plan.ts`）：
   * 火山对 Seedance 2.5 的硬约束是「首帧 / 首尾帧 / 视频编辑 / 视频延长这些**有图**
   * 的场景 `ratio` 只接受 `adaptive`，传具体宽高比直接 400」（官方「视频生成教程」
   * 使用限制段）。
   * ⚠ 与 `unknownValue` 分开：那条说「这个值不在档位表里」，这条说「这个值本来在表里，
   * 是**你自己挂的那张首帧**把它锁掉了」—— 后者可教，模型读到就知道该去摘首帧
   * 还是该改成自适应。
   * ⛔ 服务端**不替用户自动改比例**：比例是用户看得见的旋钮（拍板 19），
   * 助手要改就得自己调一次 `set_video_specs`，那样日志上才留得下这一步。
   */
  aspectLockedByFirstFrame: 'aspectLockedByFirstFrame',
  /**
   * 视频域 `critique_result` **手上没有帧**（第二期）。
   *
   * ⭐ 抽帧发生在**浏览器里**（`lib/video-frame-capture.ts` 的选型头注：worker 跑不了
   * 原生二进制、服务端塞不下 ffmpeg），所以服务端能不能看这段片子，取决于客户端
   * 这一轮有没有把三帧一起送上来。送不上来的成因有具体的几种（跨域画布被污染、
   * 容器读不出时长、平台链接根本解不了），而下一步该做的事是同一件：**说实话**。
   * ⛔ 绝不降级成「拿视频地址喂静态图视觉线」—— 那得到的是一份格式完整、内容全编
   * 的评价（论据与 `visionUnavailable` 逐字同源）。
   */
  videoFramesMissing: 'videoFramesMissing',
  /**
   * 这张素材**被判过失败**，不能再作首帧 / 尾帧（切片 X）。
   *
   * ⭐ owner 的原话是「禁止用失败的旧图」。判据是素材自己身上那一位
   * （`Generation.snapshot.reviewState === 'blocked'`，由用户或助手在结果卡上标），
   * ⛔ 不是模型的判断 —— 让模型自己决定「哪张算失败」，它下一轮就会改口。
   * ⚠ 只拦**首帧 / 尾帧**两个槽：那两格决定整段片子长什么样，用一张已经被否掉的
   * 图开头，后面每一步都是白跑。⛔ 不拦评价（`critique_result`）—— 恰恰相反，
   * 「这张为什么不行」正是它要回答的问题；也不拦普通参考位。
   * ⚠ 与 `unknownAsset` 分开：那条是「你编了一个 id」，这条是「这张确实是你的，
   * 但你自己把它否了」—— 后者可教，助手读到就该去换一张，而不是换个参数再挂一次。
   */
  blockedSource: 'blockedSource',
} as const

/**
 * 评审卡上一条结论的**严重度**（owner 2026-09-07 定的评审三段：否定 / 异常 / 建议）。
 *
 * ⭐ 它**取代了原来那个 `ok: boolean`**，⛔ 不是在它旁边多一格（工程原则 1）：
 * 两套并存的下场是「`ok:true` 且 `severity:'fail'`」这种谁也说不清的行，而卡片
 * 只能挑一个信。
 *
 * 三档各说一件不同的事，混起来就是这张卡最容易骗人的地方：
 *  · `fail`（否定）—— **没做到**。要求的东西不在画面里。
 *  · `warn`（异常）—— **做到了，但有瑕疵**。方向对，代价看得见（手指糊了、
 *    末帧提前了半拍）。⛔ 这一档此前没有通道，于是它要么被写成 `ok:false`
 *    （把一次基本成功说成失败），要么被写成 `ok:true`（把瑕疵抹掉）。
 *  · `pass`（达成）—— 这一条落地了，卡上那个 ✓。
 *
 * ⚠ 图片域与视频域**共用同一张表**：同一颗卡片组件渲染两种载荷，两边各一套词
 * 意味着卡片要按域分岔着读严重度。
 */
export const ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS = {
  fail: 'fail',
  warn: 'warn',
  pass: 'pass',
} as const

export const ASSISTANT_OPERATOR_VERDICT_SEVERITIES = [
  ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS.fail,
  ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS.warn,
  ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS.pass,
] as const

export type AssistantOperatorVerdictSeverity =
  (typeof ASSISTANT_OPERATOR_VERDICT_SEVERITIES)[number]

export type AssistantOperatorRejectReason =
  (typeof ASSISTANT_OPERATOR_REJECT_REASON_IDS)[keyof typeof ASSISTANT_OPERATOR_REJECT_REASON_IDS]

/**
 * 每个工具**是什么**，给模型看的一句话。
 *
 * ⚠ 写成 `Record<AssistantOperatorTool, …>`：工具表加一条而这里没跟上，编译期就红。
 * 论据同画布 `NODE_ASSISTANT_ADD_INTENT_HINTS` —— 只把 id 列给模型，它会按英文词
 * 的字面意思猜，而 `read_state`（读谁的状态）/`prime_generate`（这算不算生成）
 * 这两个词在通用语义里都太宽。
 */
export const ASSISTANT_OPERATOR_TOOL_HINTS: Record<
  AssistantOperatorTool,
  string
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]:
    'read the workbench form the creator is looking at right now — every field, plus the values each one accepts. Costs nothing; call it first when you are unsure what is already filled in.',
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]:
    "search the creator's OWN asset library (images / videos they already made or uploaded). Returns real asset ids you may then mount. This is the only way to obtain an asset id — never invent one.",
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]:
    "find folders in the creator's OWN asset library by name. Returns real folder ids, full paths, and image counts. Call this before inspect_asset_folder, even when the creator gives an exact name; duplicate folder names can exist at different paths.",
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]:
    'actually LOOK at the images in one folder returned by list_asset_folders. Takes that real folderId plus a short instruction that preserves what the creator wants you to judge or select. It checks this folder only, never child folders; images only; newest first; at most 24 images in batches of 8. Read inspectedImages / totalImages / truncated before answering and never describe images that were not inspected.',
  /**
   * ⚠ 这段话在 P3-D 改过口径（拍板 21 + 22）：原文写着「there is no import tool
   * and never will be」，而 `import_user_url` 现在就在表里 —— 一条说谎的工具说明
   * 会让模型在用户递了链接时仍然去搜一遍库。两条路的区别只有一条：**地址是谁给的**。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]:
    "search the open web for reference pictures the creator does NOT already own. Returns PREVIEWS ONLY — thumbnails plus their source pages, and nothing is downloaded by this call. Each candidate is shown to the creator with a 'use this' button; they press it and the app files that one into their library and attaches it. So: never claim you saved, imported, or mounted a web result of your own search, and never paste one of these URLs into a prompt or a reference. Short English queries work far better than long descriptions. Use it only when the creator's own library has nothing suitable. ⚠ A URL the creator typed themselves is NOT this tool's business — use import_user_url for that.",
  /**
   * ⚠ 这段话的全部工作是**把它和搜图分开**：两条工具的名字只差一个词，而模型
   * 在「找一张参考图」和「查一句设定」之间选错的代价是一整步（每一步都是一次
   * 完整 LLM 往返）。所以第一句就写清楚它不出图。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWeb]:
    "look something UP on the web — words, not pictures. Returns page titles, short extracts and where each came from. Use it when the creator's request turns on a fact you are not certain of: how an official name is spelled, what a character or product actually looks like per its source, a game's own terminology, current rules of a platform. Prefer it over guessing: a confidently wrong detail in a prompt is worse than a search step. You get the extract only, not the full page — if the extracts disagree or do not cover it, say so and cite what you saw instead of filling the gap yourself. Long, specific queries work well here (unlike search_web_images, which wants three or four words). ⚠ This is NOT how you find reference pictures — that is search_web_images.",
  /**
   * ⚠ 这段话的全部工作是把它与 `search_web` 分开：一个是「查一句」，一个是
   * 「弄清一件事」。写不清楚的代价是模型永远只用便宜那条，然后在第一条摘要
   * 之后放弃 —— owner 打回的就是这个行为。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.research]:
    'find out about a SUBJECT properly — a character, a work, a studio, a piece of terminology. Give it a goal in one line plus the entities it turns on ("Ananta", "Shiye"), and it hits several kinds of source at once (encyclopedias, tag libraries, video, general web) and hands back evidence lines: what was said, who published it, how much weight it carries. Use it INSTEAD of search_web whenever the answer is a description rather than a single word, and use it FIRST when the creator names a character or work you are not certain of. You may call it a SECOND time in the same turn with a narrower goal once the first round tells you the official name, the right spelling, or which site is the source of truth — that second round is where the real answer usually is. One round that came back thin is not a dead end: change the entity spelling or the source mix and go again.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readUrl]:
    'actually READ one web page and get the part you need out of it. Takes a url you saw in a research or search_web result (or one the creator gave you) plus a short \'focus\' saying what you are looking for — "appearance and outfit", "release date", "official name". The server pulls the page, finds the passages that match your focus, and returns just those. This is how you get the details that a search extract never contains: hair, eyes, costume, colours, the exact wording of an official description. ⛔ It reads words only — it does not fetch, save or attach pictures.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]:
    "attach one asset from a previous search_assets result to the workbench as a reference image. Takes an assetId, never a URL. ⚠ Web search results have no assetId and can never be mounted this way — only the creator's own library can.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]:
    'switch the generation model. The id must be copied verbatim from availableModels in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]:
    'write the positive prompt. If the creator already hand-wrote something there, you will be asked which they want (append / overwrite / keep) before it lands.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]:
    'write the negative prompt. Only exists on workbenches that actually have that field.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]:
    'set aspect ratio AND resolution together — one without the other does not produce a real aspect ratio in this app.',
  /**
   * ⚠ 参数名**逐字写出来**（真机 2026-08-31：模型第一次写的是 `duration` /
   * `aspect_ratio`，一条都没认出来，白烧一步换回一条 `emptyValue`）。
   * 「a plain number」那句同理 —— 状态块里的档位印成 `4s, 5s` 时它会照抄成
   * `"10s"`，而那是个字符串。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]:
    'set the clip specs in ONE call. The argument names are exactly: durationSeconds (a plain number, no unit), aspectRatio, resolution. Send every one the state block lists options for; omit only the ones it says this model does not expose.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]:
    'set how many outputs one send produces. Pick from the options in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]:
    "attach one audio clip from the creator's own library as a voice reference for this shot. Takes an assetId from a search_assets call with kind 'audio'. Name the character it belongs to when you know it — that is how the model learns who is speaking in a multi-character line.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]:
    'turn the clip\'s own soundtrack on or off. Only call it when the creator asked for silence or for sound — leaving it alone means "whatever this model normally does", which is usually what they want.',
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]:
    "arm the generate button so it is one click away, with the price shown. This does NOT generate anything and never spends the creator's credits — they press it themselves. Use it as the LAST step once the form is ready.",
  [ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration]:
    'ask the creator to send the current form. This does NOT generate anything and never spends their credits — the app shows them the model, the count and the price, and THEY press send. Use it only when they asked you to run it, and only once the form is ready; the plain prime_generate is the right call when they have not asked. It cannot be undone once they confirm, so never call it to "see what happens".',
  /**
   * ⚠ 「归属票是唯一凭证」那句已作废（拍板 4 推翻，2026-09-06）：`@` 指定的任意
   * 一张一律可看。⛔ 但**名单仍然是硬闸**：`targetIds` 只能是这一轮 `@` 上来的那
   * 几张，模型自己写一条地址会被 `unknownAsset` 拒。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]:
    'actually LOOK at a picture and say what worked and what did not. Two ways to get one: pass "targetIds" with the id or the exact address of a picture the creator attached to THIS message (that is them pointing at it), or call it with no target when a run you armed has just come back. You may never invent an address — anything the creator did not reference this turn is refused. If they said "that one" and more than one picture is in play, call it with no target and the app will ask them which. Call it first when a picture is waiting, then fix the form with set_* based on what you saw. On the video bench the target is a CLIP and you are shown three stills from it (first / middle / last) instead of one picture — same tool, same rules.',
  /**
   * ⚠ 2026-09-06 放宽了**准入名单**（⛔ 不是放宽了闸）：除了「用户逐字写过的
   * 地址」，本轮 `search_web_images` 真的展示过的候选也算数 —— 用户说「都挂上」
   * 时那几张他看见了。⛔ 站方禁 AI 的那一档照旧拒，模型编的地址照旧拒。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]:
    "take ONE web address, fetch that picture into the creator's library, and mount it as a reference — all in one step. Two addresses are allowed and no others: one the creator typed VERBATIM in this conversation (use it the moment they hand you a link; that is them saying yes), or one of the candidates your own search_web_images actually put on screen this turn — and that second kind ONLY when they have already told you to attach them, one call per picture. A candidate marked REFERENCE ONLY is refused either way. Plain image links work, and so does a normal web page — the picture on it is taken. ⛔ Never tell the creator to download, upload, or click anything for a link they already gave you: that is what this tool is for.",
  /**
   * ⚠ 「短英文查询」那句与 `search_web_images` 同源，理由也一样：两个上游
   * （Civitai 的 meilisearch / HF 的仓库搜索）吃的都是名字与短标签，一整句描述
   * 会让召回崩掉。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]:
    'look for LoRAs on Civitai and Hugging Face. Returns real candidates with their id, licence, base-model family, and whether this workbench can actually mount them. This is the ONLY place a candidateId comes from — never invent one. Keep the query SHORT and in English (a style name, an artist, two or three words); a whole sentence returns junk. Read the compatibility line on each candidate before you recommend it: a LoRA built for a different base-model architecture will not load on the base that is selected.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]:
    "mount one LoRA from a previous search_loras result onto the assembly bench, with a weight. Takes a candidateId, never a name or a URL. The app files it into the creator's library and mounts it in one go. There is NO limit on how many LoRAs can be stacked — never tell the creator they have to remove one first. If a candidate is marked as not importable, this is refused; say plainly that it can only be opened on its source page.",
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]:
    'take one LoRA off the assembly bench. The id comes from the mounted list in the state block — that is a different list from search results. Use it when two mounted LoRAs are fighting over the same thing, and say which one you dropped and why.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]:
    'change how strongly one already-mounted LoRA applies. The id comes from the mounted list in the state block. Weight is a plain number in the range the state block gives.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules]:
    "read the standing rules this creator has written down for their work. The newest ones are already quoted in your instructions — call this only when you need the older ones, or the ones scoped to another workbench. Returns each rule's id, its exact wording, and the date it was recorded.",
  [ASSISTANT_OPERATOR_TOOL_IDS.listContextCards]:
    'list the context cards this creator keeps — characters, styles and brand kits they wrote down once and reuse. Each entry gives an id, its kind, its name and a one-line summary. The ones pinned to this workbench are already quoted in your instructions; call this when they mention a character, a look or a brand you do not have in front of you. Filter by kind when you know which sort you are after.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readContextCard]:
    'read one context card in full: the body the creator wrote (appearance, outfit, personality — or the style rules, or the brand spec), the hard negatives that card carries, and the URLs of its reference images with what each one is for. The card id comes from list_context_cards or from your instructions — never invent one. A sheet image is identity evidence: the look is decided by it. Mount the images you actually need with mount_reference; reading a card mounts nothing on its own.',
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]:
    'write down ONE standing rule the creator just stated — something that should hold for their future work, not a one-off instruction for this run. Quote them; do not paraphrase into your own words. Scope it to this workbench only when it genuinely does not apply elsewhere. Never record a rule they did not state, and never record the same rule twice.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]:
    'mark one of the creator\'s own assets as approved or blocked, so the verdict survives this turn. Use "blocked" when they say a picture did not work ("the hands are wrong", "not this one") — a blocked asset can never be used as a first or last frame again, on any workbench, and you should stop offering it. Use "approved" when they settle on one. The assetId comes from search_assets, from what they handed you, or from what you produced earlier this session — never invent one. Blocking deletes nothing: the picture stays in their library and you can still review it. Give a short reason in their words.',
}

/**
 * 项目规则的上限与形状（§10，拍板 23）。
 *
 * ⚠ `maxPerUser` 是一条**真的会拒**的闸（`project-rule.service.ts`），不是装饰：
 * 规则会全量拼进系统提示的一部分，没有上限的规则表等于一条会无限长的系统提示。
 * ⚠ `maxInPrompt` 与它分开：库里可以存 `maxPerUser` 条，每一轮只有最近
 * `maxInPrompt` 条进系统提示，剩下的靠 `read_project_rules` 翻。
 */
export const ASSISTANT_PROJECT_RULE_LIMITS = {
  /** 每用户最多几条。撞上限时 `add_project_rule` 按 `ruleLimitReached` 拒。 */
  maxPerUser: 50,
  /** 一条规则最长多少字。 */
  maxTextChars: 280,
  /** 每一轮拼进系统提示的条数（最近的在前）。 */
  maxInPrompt: 12,
  /** 一次 `read_project_rules` 最多返回几条。 */
  maxReadResults: 50,
} as const

/**
 * **有目标检索**与**读正文**这两条的上限（2026-09-06）。
 *
 * ⚠ 与 `ASSISTANT_OPERATOR_LIMITS` 分开一张表，判据是**成本形状不同**：那张表里
 * 的数管的是「一条 op 能有多大」，这里的每一个数背后都是**真实的外部请求**
 * （Serper credit / 萌百 / danbooru / Jina 的一次抓取）。混在一张表里的下场是
 * 下一个人为了让日志好看一点把 `maxRoundsPerTurn` 调大，而账单在别处。
 */
export const ASSISTANT_RESEARCH_LIMITS = {
  /**
   * 一轮对话里最多发几次 `research`。
   *
   * ⭐ 2 不是保守，是**这条工具存在的理由**：第一轮定「作品的官方站在哪、角色
   * 官方名怎么写」，第二轮拿着那个答案问「她的外貌与服饰」。给 1 就退回成
   * 「搜一次就放弃」（owner 打回的那个行为）；给 4 则是一整轮步数全烧在检索上，
   * 而 `maxSteps` 只有 8。
   * ⚠ 撞上限按 `researchRoundsExhausted` 拒，⛔ 不静默降级成空结果。
   */
  maxRoundsPerTurn: 2,
  /** 一次检索最多带几个实体（角色名 / 作品名）。 */
  maxEntities: 4,
  maxEntityChars: 80,
  /** 「这一轮想查什么」——一句话，不是一段。 */
  maxGoalChars: 200,
  /**
   * 一次检索最多回几条证据。
   *
   * ⚠ 比 `maxWebSearchResults`（6）宽：那条只有一个源，这条是几个源归并之后的
   * 结果——按 6 截会让「萌百 + danbooru 两条一起说」这种最有价值的形态被砍掉一半。
   */
  maxEvidenceItems: 10,
  /** 一条证据在工具环里的摘要长度（同 `maxWebSearchSnippetChars` 的量级）。 */
  maxEvidenceSnippetChars: 300,
  /** 一条证据的标题 / 出处。 */
  maxEvidenceTitleChars: 200,
  maxEvidencePublisherChars: 80,
  /**
   * `read_url` 截给模型看的正文长度。
   *
   * ⚠ 上游 Jina 给到 `URL_READER.maxContentLength`（6000），这里砍到 1600：
   * 整页正文进工具环 = 之后每一步都要重付一次这段上下文的钱，而模型真正要的是
   * 「外貌与服饰」那两三段。截段由 `focus` 在服务端做，⛔ 不指望模型自己跳读。
   */
  maxReadUrlExcerptChars: 1600,
  /** `focus` 那句话（如「外貌与服饰」）的长度。 */
  maxFocusChars: 120,
  /**
   * 带 `subject` 搜图时最多铺几条查询变体。
   *
   * ⚠ **每条一个 Serper credit**（免费池 2500），所以 3 是钱不是防御性大数。
   * 变体表在 `constants/web-search.ts`，两边取小。
   */
  maxImageQueryVariants: 3,
  /** `search_web_images` 的 `subject`（作品名 + 角色名）长度。 */
  maxSubjectChars: 120,
} as const

/**
 * `research` 能打哪几组源。
 *
 * ⚠ 这是**给模型看的粗粒度分组**，不是 `RESEARCH_SOURCE_IDS` 那张真源表：
 * 让模型去挑「moegirl 还是 wikipedia_zh」是让它猜一件它不可能知道的事
 * （哪个站收录了这个角色）。它只说「查 wiki」，服务端把该打的都打了。
 */
export const ASSISTANT_RESEARCH_SOURCE_IDS = {
  /** 通用网搜（Serper）。 */
  web: 'web',
  /** 百科族：萌百 + 中文维基 + Fandom。 */
  wiki: 'wiki',
  /** B站——中文圈的一手实机与解说。 */
  bilibili: 'bilibili',
  /** danbooru——**已结构化的外观标签**（发色 / 瞳色 / 服饰），提示词直接吃得下。 */
  danbooru: 'danbooru',
} as const

export const ASSISTANT_RESEARCH_SOURCES = [
  ASSISTANT_RESEARCH_SOURCE_IDS.web,
  ASSISTANT_RESEARCH_SOURCE_IDS.wiki,
  ASSISTANT_RESEARCH_SOURCE_IDS.bilibili,
  ASSISTANT_RESEARCH_SOURCE_IDS.danbooru,
] as const

export type AssistantResearchSource =
  (typeof ASSISTANT_RESEARCH_SOURCES)[number]

/**
 * 一条证据有多可信 —— 由**源的层级**算出来，⛔ 不由模型写。
 *
 * ⚠ 三档对应 `EVIDENCE_SOURCE_TIERS`：官方 → high、百科/图库 → medium、
 * 社区视频 → low。它印在证据卡上，用户据此决定信不信那句「她穿黑色长衫」。
 */
export const ASSISTANT_RESEARCH_CONFIDENCE_IDS = {
  high: 'high',
  medium: 'medium',
  low: 'low',
} as const

export const ASSISTANT_RESEARCH_CONFIDENCES = [
  ASSISTANT_RESEARCH_CONFIDENCE_IDS.high,
  ASSISTANT_RESEARCH_CONFIDENCE_IDS.medium,
  ASSISTANT_RESEARCH_CONFIDENCE_IDS.low,
] as const

export type AssistantResearchConfidence =
  (typeof ASSISTANT_RESEARCH_CONFIDENCES)[number]

/**
 * 一条证据**答的是作品还是人**（2026-09-07）。
 *
 * 🔬 owner 真机：问「《无限大》里时夜的外貌服饰」，回来的 10 条**全是游戏本身**
 * （官网首页 / 维基条目 / 预约页 / danbooru 的 game tag 统计）—— 每一条都「相关」，
 * 没有一条答了问题。助手于是把话停在「正在检索……」。
 *
 * ⚠ 所以「有没有证据」不是判据，「有没有**角色级**证据」才是：
 *  · `character` —— 标题 / 摘要 / URL 里出现了角色名，这一条真的在说这个人；
 *  · `work` —— 只说得出作品；
 *  · `unknown` —— 没给角色名时不判（⛔ 不拿一条空判据去标签所有证据）。
 *
 * ⚠ 它由**服务端算**（`research-fanout` 的 `scopeOfEvidence`），⛔ 不由模型写。
 */
export const ASSISTANT_RESEARCH_SCOPE_IDS = {
  character: 'character',
  work: 'work',
  unknown: 'unknown',
} as const

export const ASSISTANT_RESEARCH_SCOPES = [
  ASSISTANT_RESEARCH_SCOPE_IDS.character,
  ASSISTANT_RESEARCH_SCOPE_IDS.work,
  ASSISTANT_RESEARCH_SCOPE_IDS.unknown,
] as const

export type AssistantResearchScope = (typeof ASSISTANT_RESEARCH_SCOPES)[number]

/**
 * **收尾那句话不许停在进行时**（2026-09-07）。
 *
 * 🔬 owner 真机：问「《无限大》时夜的外貌服饰」，助手最后留在线程里的一整句是
 * 「正在检索……的角色立绘与外貌描述。」——**没有结论，也没有说这个角色查不到**。
 * 系统提示里早写着「ONE EMPTY SEARCH IS NOT AN ANSWER」与「Never fill a gap with
 * invention」，但那是两句请求，挡不住模型把话停在半句上。这张表是闸。
 *
 * ⚠ 判据是**开头的进行时/将来时**，⛔ 不是「有没有句号」：一句
 * 「我这就去查」写得再完整也仍然不是结论。
 * ⚠ 只在**收尾那一轮**判（还要调工具的轮次说「接下来我去查」是对的）。
 * ⚠ 命中不作废整轮：服务端把它退回给模型再要一次结论（只退一次），
 * ⛔ 不静默收尾、⛔ 不替模型编一句结论。
 */
export const OPERATOR_UNFINISHED_CLOSING_PATTERNS: readonly RegExp[] = [
  // 中文：正在… / 我将… / 我会… / 接下来我… / 让我… / 稍等…
  /^(正在|我正在|我这就|我先去|我将|我会|我来|接下来我|下面我|让我|稍等|请稍)/,
  // 日文：ただいま… / これから… / 今から… / 探しています。
  /^(ただいま|只今|これから|今から|まず|少々お待ち)/,
  /(しています|していきます|します)[。.…]*$/,
  // 英文：I'm searching… / Let me… / I will… / Currently…
  /^(i['’]?m\s|i am\s|let me\s|i['’]?ll\s|i will\s|currently\s|now\s+(searching|looking|checking))/i,
  // 任何语言：以省略号收尾的半句。
  /(\.\.\.|…)\s*$/,
]

/**
 * 收尾那句话是不是「话说了一半」。
 * ⚠ **空正文也算**：一个什么都不说就结束的助手，是本仓最难查的那种失败。
 */
export function isUnfinishedClosingMessage(message: string): boolean {
  const text = message.trim()
  if (text.length === 0) return true
  return OPERATOR_UNFINISHED_CLOSING_PATTERNS.some((pattern) =>
    pattern.test(text),
  )
}

/** 证据条的形状 —— 与 `EvidenceItem.kind` 逐字同名（文字 / 标签 / 图）。 */
export const ASSISTANT_RESEARCH_EVIDENCE_KINDS = [
  'text',
  'tags',
  'image',
] as const

export type AssistantResearchEvidenceKind =
  (typeof ASSISTANT_RESEARCH_EVIDENCE_KINDS)[number]

/**
 * 一条规则是谁记下来的。⚠ 值逐字对应 `prisma/schema.prisma` 的
 * `enum ProjectRuleSource`（那边是 SCREAMING_SNAKE，这里是协议侧的小写形态）。
 */
export const PROJECT_RULE_SOURCE_IDS = {
  /** 助手在对话里通过 `add_project_rule` 记的。 */
  assistant: 'assistant',
  /** 用户自己在设置里写的。 */
  creator: 'creator',
} as const

export const PROJECT_RULE_SOURCES = [
  PROJECT_RULE_SOURCE_IDS.assistant,
  PROJECT_RULE_SOURCE_IDS.creator,
] as const

export type ProjectRuleSourceId = (typeof PROJECT_RULE_SOURCES)[number]
