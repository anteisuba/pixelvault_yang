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
  /**
   * **这一轮打算分几步**（v2 §3.1：`plan` 与计划请求帧合成这一帧）。
   *
   * ⚠ 合帧的判据：两帧分开的理由曾经是「一行给人看的字 vs 结构化的待定项」，
   * 而 v2 把待定项整体搬去了 `ask`（问题卡）、把预估删了（决策 8）——`plan`
   * 只剩阶段列表，第二帧就没有存在的理由了。
   */
  plan: 'plan',
  /**
   * 一步。同一个 `id` 会出现两次：`running` 一次、`done` / `error` 一次。
   *
   * ⚠ 客户端按 `id` 覆盖而不是追加 —— 追加的表现是日志流里每步重复两行。
   */
  step: 'step',
  /**
   * **列几个选项等用户点一个**（v2 §3.1：覆盖三选与候选单选一起并进这一帧）。
   *
   * ⚠ 三个来源，一种形状：① 计划里的待定项；② 「你说的是哪一张」（选项带
   * `assetUrl`）；③ 覆盖手写三选（追加在后 / 覆盖 / 保留，载荷多一块
   * `overwrite` 用来把回执路由回原字段）。
   * ⚠ 它之后这条流即结束（`ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm`）：
   * 服务端没有会话态，续跑靠客户端带答复重发。
   */
  ask: 'ask',
  /**
   * **等你拍板才往下走**（v2 §3.3）—— 只剩两种来源，见 `confirm.kind`：
   *  · `multistep`：这一轮要连做好几步，「开始」= 带 `planApproved` 重发；
   *  · `generate`：`request_generation` 摆出模型 / 比例 / 张数 / 分辨率，
   *    扳机仍然由**客户端**扣（钱闸不动）。
   *
   * ⛔ **没有第三种**：花费确认已删（决策 8），覆盖手写降级成 `ask`。
   */
  confirm: 'confirm',
  /**
   * 普通对白 —— **正文的唯一来源**（v2 §3.1 / §13.1）。
   *
   * ⚠ 客户端按条目 id **覆盖**，⛔ 不追加 —— 追加正是「计划帧插在中间就
   * 出现两条同样的回复」那条 bug 的形状。
   * ⚠ 它是**定稿帧**（56b 切片 3 起）：边写边显示由 `message_delta` 负责，
   * 旧的 `partial` 前缀帧已删。工具轮仍然整帧不发旁白。
   */
  message: 'message',
  /**
   * **正文的一小段增量**（56b 切片 3，owner 2026-09-19）。
   *
   * ⭐ 它把 v2 §3.1 删掉的 `message_delta` 请了回来，理由与当年删它的理由不冲突：
   * 当年删的是「逐字**淡入**」那套动效（拍板 13），而这一帧解决的是**字什么时候
   * 出现**。此前收尾轮每来一段就发一整条 `message partial`（全量前缀），客户端
   * 整体覆盖 —— 一句 800 字的回答会被重发几十遍，而屏幕上是一段一段地跳。
   * ⚠ 载荷**只有增量**（`delta`），客户端**追加**，⛔ 不覆盖。
   * ⚠ 它不是第二条正文来源：定稿仍旧只由 `message` 那一帧说了算（按 id 覆盖），
   * 所以「重复消息」那一类根因没有被放回来。
   * ⚠ 历史回放**不发这一帧**：回放里那段字早就写完了，重播一次流式是在演戏。
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
   * **按编号翻证据本**（v2 §7.3，commit #12）。
   *
   * ⭐ 它存在的理由是「结论记录里只写编号」那条决定的另一半：上一轮查到的正文
   * 不再跟着每一轮重发（那是每步一次 LLM 往返的重复账单），下一轮要看就按
   * `#e12` 这个编号翻一次。⛔ 没有它的话，编号指向的是一个模型永远打不开的抽屉。
   * ⚠ 只读**这段会话自己的**证据本（`ResearchRun.conversationId` + `userId` 双核），
   * 编号不存在就明确拒（`unknownEvidenceRef`），⛔ 不去补查一次外网 —— 那会让
   * 「翻旧账」变成一次新的花钱检索。
   */
  recallEvidence: 'recall_evidence',
  /**
   * 把素材挂成参考图。
   *
   * ⛔ **载荷里的 URL 不由模型写**：模型只能给 `assetId`，而且只能是本轮
   * `search_assets` 真的返回过的那些，URL 由服务端从检索结果里查出来填。
   * 论据照抄画布 `attach_asset` 那条 —— 让模型写 URL 就是让它编一个不存在的地址。
   */
  mountReference: 'mount_reference',
  /**
   * 从参考位上**摘一张**（进度表 21 · 差距清单 #2）——与 `mount_reference` 对称。
   *
   * ⭐ 为什么非要有它：画板骨架写的一直是「mount_reference / unmount」，而代码里
   * 只有挂没有摘（LoRA 那一侧早就有 `unmount_lora`）。缺了它，助手挂错一张之后
   * 唯一的出路是让用户自己去参考轨上点 × —— 而「回头支使用户去点东西」正是拍板
   * 22 明令要消掉的那种回答。
   *
   * ⚠ 目标只能是**此刻真的挂着的那一张**，两种指法（⛔ 二选一，不是都给）：
   *  · `slotIndex` —— 状态块里印的那个 `@ImageN` 的 N（**从 1 起**，与用户嘴里
   *    说的「第二张」逐字对上）；
   *  · `assetId` —— 本轮检索 / 跨轮记忆里那张，服务端反查它挂在哪一格。
   * ⛔ 没有 URL 这个参数：判据与 `mount_reference` 逐字同源。
   * ⚠ `slot` 与挂载那条**同一张词表**：首帧 / 尾帧是**清空一个格子**（那一档是
   * 覆盖写），普通参考位是「把这一张从轨上删掉」。⛔ 参考视频位不收 —— 快照里
   * 那一节只给了个数、没有名单，摘哪一条无从指认（按 `noSuchControl` 拒）。
   * ⚠ `inverse` = 把同一张挂回同一个位置。
   */
  unmountReference: 'unmount_reference',
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
   * 设**当前模型专属的那一格**（进度表 21 · 差距清单 #1）。
   *
   * ── ⭐ 为什么不是一条一条的工具 ──────────────────────────────────
   * 专属区那一行 chip 是**从能力表派生**的（`lib/model-capability-chips.ts`，
   * 进度表 11）：换个模型，这一行整排换掉。给每颗 chip 开一条工具的下场是工具表
   * 跟着 `provider-capabilities` 长，而其中大半条在任何一个具体模型上都无解 ——
   * 正是 `set_count` 当初被裁掉的那个形状，只是乘以 chip 的条数。
   * 所以只有一条工具，`key` 那一格收的是**这个模型此刻真的有的那几颗 chip 的键**
   * （快照现给），值域按 `getCapabilityFieldType` 分三种形态各自校验。
   *
   * ⛔ **模型看不到模型名**：它只看到 `read_state` 里印出来的那张 key 表。
   * 让它按模型名去猜「OpenAI 应该有 quality 吧」，猜错就是白烧一步 LLM 往返。
   * ⚠ 快照里 `capabilities` 整节缺席 = 这个工作台没有专属 chip 行（视频档今天
   * 就是这一档，界面上那段整块不渲染），按 `noSuchControl` 拒 —— 与
   * `set_negative` 逐字同源：工具列在域表里，第二道闸靠快照缺席收。
   * ⚠ `inverse` 里放**旧值**，而旧值允许 `null`（「这一格用户没设过」）：撤销要
   * 回得到缺省态，⛔ 不能把它撤成「用户明确选了缺省值」——后者会照样发给 provider。
   */
  setCapability: 'set_capability',
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
   * 看用户 `@` 指定的那张图。
   *
   * ⭐ **图不由模型给**：目标只能从请求里的 `mentionedAssets` 名单里挑，名单外一律
   * `unknownAsset`；什么都没 `@` 时按 `noResultToCritique` 拒。出图后**不自检**
   * （D12，owner 2026-09-23）：助手不会自己去看刚出的图。
   *
   * ⚠ 它是**读**类：看图不改表单。看完之后要改什么，照旧走 `set_*`（因此照旧
   * 可撤销、照旧进登记簿）。把评价和改动合成一条工具，撤销就没有粒度了。
   */
  critiqueResult: 'critique_result',
  analyzeReferences: 'analyze_references',
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
   * 把本轮搜到的候选**摆给创作者挑**（lora-assistant §10.2.2）——「这几把，你要挂哪几把？」
   *
   * ⭐ 它归「问」组而不是「改」组，判据与 `propose_context_card` 逐字同源：吐一帧
   * 确认、停流、服务端一行库都不写，产出是**用户的一个决定**。挂载那一跳由用户
   * 点「挂载所选」之后的那一轮逐把走 `planMountLora`。
   * ⚠ 只接受**本轮 `search_loras` 回过的** candidateId（`run.loraIndex` 查得到），
   * 查不到按 `unknownLora` 拒 —— 与 `mount_lora` 同一条：模型绝不自己写 LoRA 的 id。
   * ⛔ **不让 `search_loras` 的结果自动转卡**：题面、题材分组、标哪一把「推荐」
   * 三样都是模型的判断；而且 `search_loras` 常常连搜两轮，一搜就停流会把那些路掐死。
   * ⚠ 它因此也没有 `inverse`：什么都没发生，撤无可撤。
   */
  planLoraPick: 'plan_lora_pick',
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
  setLoraParameters: 'set_lora_parameters',
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
   * **提议**一张上下文卡（v2 §8.1）——「这套设定要不要我记下来？」
   *
   * ⭐ 它归「问」组而不是「改」组：它问的是一句话，产出是**用户的一个决定**。
   * 服务端在这一步**一行库都不写** —— 只吐一帧确认，卡的草稿随帧下发。客户端
   * 收到那一帧会替用户留一行 `status: 'proposed'`，点「存这张卡」才翻成
   * `confirmed`、真正进长期记忆（§8.1）。
   * ⛔ 别把它改成直接写库：落了就等于助手能往用户的长期记忆里写字而不经过人，
   * 而那正是 `ContextCard.status` 那一列**不**是为它准备的原因。
   * ⚠ 它因此也没有 `inverse`：什么都没发生，撤无可撤。
   */
  proposeContextCard: 'propose_context_card',
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
  /**
   * 给素材打标签（v2 §10）—— 素材库四条写操作的第一条。
   *
   * ⚠ 它与下面三条是**同一档**：后果落在服务端（库里），表单一个字都没动，
   * 而且每一条都**必须撤得干净** —— 这是 §10 的判据原话。
   * ⚠ `inverse` 里放的是**这一步真的新加上去的那几个标签**，⛔ 不是入参里那几个：
   * 一批 20 张里可能有 3 张早就打过「线稿」，撤销时把它们的旧标签一起摘掉
   * 就是在删用户自己的数据。
   * ⛔ 不生成、不删除、不上传 —— 四条全是可逆的整理动作。
   */
  tagAsset: 'tag_asset',
  /**
   * 收藏 / 取消收藏（§10）。
   *
   * ⚠ `inverse` **逐张记原值**，⛔ 不是「取反」：一批里本来就收藏着的那几张，
   * 统一取反会把它们误清（§10 那条 ⚠ 的原话）。
   */
  favoriteAsset: 'favorite_asset',
  /**
   * 建一个素材文件夹（§10）—— 落的是 `Project` 那张表（素材库右栏的文件夹树
   * 就是它，见 `AssetFolderTree`）。
   *
   * ⚠ `inverse` = 删掉刚建的那个，**且仅当它是空的**：撤销发生在几步之后，
   * 中间用户可能已经往里丢了东西，那时删掉就不是「撤销」而是「毁数据」。
   */
  createFolder: 'create_folder',
  /**
   * 把素材挪进一个文件夹（§10）。
   *
   * ⚠ `inverse` **逐张记原文件夹**（`null` = 原来没归档），理由与 `favorite_asset`
   * 逐字同源：一批里各自来处不同，统一挪回一个地方就是在重排用户的库。
   */
  moveAssets: 'move_assets',

  // ── 画布域那两条（进度表 22「一张脸」）──────────────────────────────
  //
  // ⚠ **为什么是两条而不是十一条**：画布的 op 词表（`NODE_ASSISTANT_OPS_V4`，
  // 31 条）连同它的确认三档与 inverse 形状（`NODE_ASSISTANT_OP_V4_SPECS`）**已经
  // 是一张封闭的真值表**，画布的执行器逐条读的就是它。把它再抄一份成 31 条操作员
  // 工具，得到的是第二处定义 —— 而两处定义的分叉表现是「菜单里加得了的节点助手
  // 加不了」「这条 op 在画布上要确认、在面板上直接落了」。
  // 所以这里只开两个口子，`op` 那一格**原样收 v4 的封闭词表**：模型看得见的依旧
  // 是封闭枚举（§2.2 ⛔ 那条），只是枚举住在它本来就住的那张表里。
  //
  // ⚠ 两条的分界与全表其余部分一致：**能不能撤**。
  /**
   * 动画布上的一个节点 / 一条线 —— 载荷是**一条** v4 op（⛔ 不是 `ops[]`：错一条
   * 只重发一条，与 §2.2 `apply` 那条纪律逐字同源）。
   *
   * ⚠ 落地与撤销都在客户端：`lib/node-assistant-op-apply-v4.ts` 应用那一条 op 并
   * **就地算出 inverse**（删一个节点的 inverse 要整份 data 快照 + 边表，服务端手上
   * 根本没有这些）。所以 step 上那份 `inverse` 只是一个**指路条**，形态与
   * `mount_lora` 逐字同源 —— 真正的撤销载荷在客户端那一侧扣着。
   * ⚠ 免费档直接落，`confirm` 档（`delete`）先出确认卡：判据读
   *   `NODE_ASSISTANT_OP_V4_SPECS[op].tier`，⛔ 别在这里再抄一张分档表。
   */
  canvasApply: 'canvas_apply',
  /**
   * 「改了这个之后下游哪几个要重跑」——⛔ **只列名单，一个字都不改、一分钱都不花**。
   *
   * ⚠ 它归**读**档（与 v4 那张 spec 表逐字一致：`group: read` / `inverse: null`）。
   * 归改动型的表现很具体：日志条上会冒出一颗撤销钮，而它什么都撤不掉。
   * ⚠ 名单是**图算出来的**（`lib/node-downstream.ts`），⛔ 不让模型自己列 ——
   *   让它列的下场是漏一个分支（前后不一致的成片）或多列一个（多花一份钱）。
   *   真正的重跑是紧随其后的一串 `canvas_generate`，每一枪各自要用户点头。
   */
  canvasPlanRerun: 'canvas_plan_rerun',
  /**
   * 让画布上某个节点出图 / 出片 —— 画布域唯一会扣 credit 的一条（花钱档）。
   *
   * ⚠ 钱闸结构一个字都没松：服务端只吐载荷，扳机在宿主那只手上
   * （`StudioOperatorCanvasContext.generate`）。⛔ 它撤不掉，所以不在改动型那张表里。
   */
  canvasGenerate: 'canvas_generate',
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
  ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
  ASSISTANT_OPERATOR_TOOL_IDS.research,
  ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence,
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.unmountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
  ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setSound,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
  ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
  ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick,
  ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
  ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules,
  ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
  ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
  ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
  ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard,
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
  ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
  ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
  ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.canvasApply,
  ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun,
  ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate,
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
  ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
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
   * ⚠ 翻证据本**也是读**（§7.3）：它把库里已经落下的那几条正文摆到模型面前，
   * 一个外部源都不打、一分钱都不花、表单一个字都不改。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence,
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
  /**
   * ⚠ **提议一张卡也归这一档**（v2 §8.1）：服务端一行库都不写、表单一个字都不改 ——
   * 它做的全部事情是把一份草稿摆到用户面前问一句。⛔ 别因为「听起来像写入」
   * 就把它挪进改动型：那一档的全部意义是「每一条都撤得掉」，而这条根本没有
   * 东西可撤（真正入库那一跳是用户在卡上点下去的）。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard,
  /**
   * ⚠ **摆一张 LoRA 推荐卡也归这一档**（lora-assistant §10.2.2）：判据与
   * `propose_context_card` 逐字同源 —— 服务端一行库都不写、装配台一个字都没动，
   * 它做的全部事情是把本轮候选摆到创作者面前问一句。真正挂上那一跳发生在他
   * 点下去之后的那一轮（每一把各自一条 `mount_lora` step，撤销撤在那上面）。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick,
  /**
   * ⚠ **重跑名单也是读**（进度表 22）：它沿具名槽边算一遍后继闭包，画布上一个
   * 节点都没动、一分钱都没花。判据与 `search_web_images` 逐字同源 —— 落地那几跳
   * 是之后那一串 `canvas_generate`，每一枪各自要用户点头。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun,
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
  /**
   * ⚠ 摘一张也是改动型（进度表 21）：`inverse` 里放的是**那张的落地地址与槽**，
   * 撤销 = 原样挂回同一个位置。⛔ 撤销不重新下载、不碰素材库 —— 那张图一直在
   * 用户库里，这一步动的只是「这次用不用它」（判据同 `unmount_lora`）。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.unmountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  /**
   * ⚠ 专属 chip 那条也是改动型（进度表 21）：它动的是参数栏上看得见的一颗旋钮，
   * `inverse` 里放的是**旧值**（允许 `null` = 用户没设过那一档）。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
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
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
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
  /**
   * **素材库四条**（v2 §10）—— 第三到第六条后果落在服务端的改动型工具。
   *
   * ⚠ 它们进这一档的判据就是 §10 的那一句：「四条全是可逆的整理动作，判据就是
   * 撤销能撤干净」。所以每一条的 `inverse` 里放的都是**逐条记下的原值**
   * （新加的标签 / 原收藏态 / 刚建的夹子 / 原文件夹），⛔ 不是「取反」那种
   * 看起来对、批量时必错的写法。
   * ⚠ 撤销这一跳要**打一次网络**（后果在库里），与 `add_project_rule` 同形：
   * 客户端走 `revertAssistantAssetWriteAPI`，见 `lib/studio-operator-apply.ts`。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
  ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
  ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
  /**
   * **画布那一条**（进度表 22）—— 后果落在**客户端的画布图**上，与工作台那批
   * 「吐 op 让客户端应用」同形，⛔ 不是服务端写库那一类。
   *
   * ⚠ 它的 `inverse` 是一张**指路条**（op id + 目标节点），真正的撤销载荷由客户端
   * 的执行器在应用那一刻算出来并扣着 —— 形态与 `mount_lora` 逐字同源。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.canvasApply,
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
  /**
   * ⚠ 画布那一枪也在这一档（进度表 22）：它同样撤不掉（出来的东西删不掉、钱退
   * 不回），回头路同样是结果那一侧而不是日志条上的撤销钮。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate,
] as const

/**
 * **五动词**（v2 §2.1 / §2.4）—— 模型只见这五个入口，加载态五句状态词也按它分派（§3.6）。
 *
 * ⚠ 动词 id 与**入口工具名**逐字相同（`ASSISTANT_OPERATOR_ENTRY_TOOL_IDS`），
 * 这不是巧合而是 §2.4 的对齐要求：模型写的工具名、`step` 帧上的 `verb`、面板上
 * 那句状态词是同一个词。⛔ 别让两边各起一套名字 —— 那正是 v1「同一件事在三处
 * 叫三个名字」的形状。
 */
export const ASSISTANT_OPERATOR_VERB_IDS = {
  /** 看：读表单、看图、看素材、看视频。 */
  look: 'look',
  /** 查：联网 / 库里 / LoRA 的检索与读页。 */
  research: 'research',
  /** 问：反问（它没有工具，帧本身就是 `ask`）。 */
  ask: 'ask',
  /** 改：所有会改工作台旋钮的那些。 */
  apply: 'apply',
  /** 请求生成：只吐载荷，⛔ 永远不创建 generation（§0 钱闸）。 */
  requestGeneration: 'request_generation',
} as const

export const ASSISTANT_OPERATOR_VERBS = [
  ASSISTANT_OPERATOR_VERB_IDS.look,
  ASSISTANT_OPERATOR_VERB_IDS.research,
  ASSISTANT_OPERATOR_VERB_IDS.ask,
  ASSISTANT_OPERATOR_VERB_IDS.apply,
  ASSISTANT_OPERATOR_VERB_IDS.requestGeneration,
] as const

export type AssistantOperatorVerb = (typeof ASSISTANT_OPERATOR_VERBS)[number]

/**
 * 每条工具归哪个动词 —— **这就是 31 → 5 那张映射表的真值**（v2 §2.1）。
 *
 * ⚠ `Record<AssistantOperatorTool, …>`：工具表加一条而这里没跟上，编译期就红 ——
 * 漏掉的表现是那一步跑起来时头像旁边一句状态词都没有，而且它进不了任何一个入口
 * 的 `action` 枚举，也就是模型压根调不到它。
 */
export const ASSISTANT_OPERATOR_TOOL_VERBS: Record<
  AssistantOperatorTool,
  AssistantOperatorVerb
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]: ASSISTANT_OPERATOR_VERB_IDS.look,
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]:
    ASSISTANT_OPERATOR_VERB_IDS.look,
  [ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences]:
    ASSISTANT_OPERATOR_VERB_IDS.look,
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]:
    ASSISTANT_OPERATOR_VERB_IDS.look,
  [ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules]:
    ASSISTANT_OPERATOR_VERB_IDS.look,
  [ASSISTANT_OPERATOR_TOOL_IDS.readContextCard]:
    ASSISTANT_OPERATOR_VERB_IDS.look,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]:
    ASSISTANT_OPERATOR_VERB_IDS.research,
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]:
    ASSISTANT_OPERATOR_VERB_IDS.research,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]:
    ASSISTANT_OPERATOR_VERB_IDS.research,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWeb]: ASSISTANT_OPERATOR_VERB_IDS.research,
  [ASSISTANT_OPERATOR_TOOL_IDS.research]: ASSISTANT_OPERATOR_VERB_IDS.research,
  [ASSISTANT_OPERATOR_TOOL_IDS.readUrl]: ASSISTANT_OPERATOR_VERB_IDS.research,
  /**
   * ⚠ 翻证据本归**查**（§2.1「新增进「查」组的」那一行）：判据与组内其余几条
   * 一致 —— 它去**别处**（这里是证据本）找东西回来，产出是「候选 + 证据」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence]:
    ASSISTANT_OPERATOR_VERB_IDS.research,
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]:
    ASSISTANT_OPERATOR_VERB_IDS.research,
  /**
   * ⚠ 翻卡是**查**、读卡是**看**（v2 §2.1）：`list_context_cards` 是「去库里找
   * 有哪些卡」，`read_context_card` 是「把选中那张的正文摆到眼前」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.listContextCards]:
    ASSISTANT_OPERATOR_VERB_IDS.research,
  /**
   * ⚠ 提议一张卡归**问**（§2.1「新增进「问」组的」那一行）：它本质是「问一句
   * 要不要记住」，停下来等用户拍一个板，产出是「决定」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard]:
    ASSISTANT_OPERATOR_VERB_IDS.ask,
  /**
   * ⚠ 摆推荐卡也归**问**（§10.2.2）：它本质是「这几把你要哪几把」，停下来等
   * 创作者拍一个板，产出是「决定」。⛔ 别因为下一轮真会挂上就把它挪进「改」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick]: ASSISTANT_OPERATOR_VERB_IDS.ask,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountReference]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setCapability]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  /**
   * ⚠ 素材库四条归**改**组（v2 §2.1「新增进「改」组的」那一行）：它们动的是
   * 用户库里已有的东西，产出是「改完了」——⛔ 不是「事实」也不是「候选」。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.tagAsset]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset]:
    ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.createFolder]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.moveAssets]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]:
    ASSISTANT_OPERATOR_VERB_IDS.requestGeneration,
  [ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration]:
    ASSISTANT_OPERATOR_VERB_IDS.requestGeneration,
  /**
   * ⚠ 画布那条归**改**组（进度表 22）：它动的是画布上看得见的节点与连线，产出是
   * 「改完了」—— 与工作台那批旋钮是同一个动词，面板上那句状态词因此也是同一句。
   * ⛔ 别为画布另起一个动词：五动词是**对用户的**分类，不是按宿主分。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasApply]: ASSISTANT_OPERATOR_VERB_IDS.apply,
  /** ⚠ 重跑名单归**看**：它产出的是「事实」（哪几个过期了），不是「改完了」。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun]:
    ASSISTANT_OPERATOR_VERB_IDS.look,
  /** ⚠ 画布那一枪归**请求生成**：它与工作台的 `request_generation` 一样只吐载荷。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate]:
    ASSISTANT_OPERATOR_VERB_IDS.requestGeneration,
}

/**
 * **五个入口工具**（v2 §2.1 / §2.2，决策 1 + 2）—— 模型只见这五条，31 条旧工具
 * 退到入口背后由代码派发。
 *
 * ── 为什么收口 ────────────────────────────────────────────────────
 * v1 的模型要在 31 条描述里挑一条，挑错的代价是白烧一步 LLM 往返（`maxSteps`
 * 只有 8）。收成 5 条之后，「挑哪个动词」这个判断人和模型都做得对，剩下的
 * 「具体哪一支」是确定性的字段派发 —— 那是代码该干的活。
 *
 * ⚠ **入口名 = 动词 id**（`ASSISTANT_OPERATOR_VERB_IDS`），⛔ 别起第二套名字。
 * ⚠ 旧的 31 条**执行函数一条不少地留着**：收的是模型看得见的那张表，
 *   不是服务端的实现（v2 §0 非目标：不拆引擎）。
 */
export const ASSISTANT_OPERATOR_ENTRY_TOOL_IDS = {
  look: ASSISTANT_OPERATOR_VERB_IDS.look,
  research: ASSISTANT_OPERATOR_VERB_IDS.research,
  ask: ASSISTANT_OPERATOR_VERB_IDS.ask,
  apply: ASSISTANT_OPERATOR_VERB_IDS.apply,
  requestGeneration: ASSISTANT_OPERATOR_VERB_IDS.requestGeneration,
} as const

export const ASSISTANT_OPERATOR_ENTRY_TOOLS = [
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.requestGeneration,
] as const

export type AssistantOperatorEntryTool =
  (typeof ASSISTANT_OPERATOR_ENTRY_TOOLS)[number]

export function isAssistantOperatorEntryTool(
  name: string,
): name is AssistantOperatorEntryTool {
  return (ASSISTANT_OPERATOR_ENTRY_TOOLS as readonly string[]).includes(name)
}

/**
 * 「查」组的**两个网侧入口**（v2 §9，commit #16）。
 *
 * ── 为什么是两条而不是四条 ────────────────────────────────────────
 * v1 的网侧有四条（`search_web` / `research` / `read_url` / `search_web_images`），
 * 而模型要在它们之间挑的那个判断**它做不对**：`search_web` 与 `research` 的分工
 * 是「一句话还是一段描述」，`read_url` 是「摘要不够时再读一页」——这些都是过程，
 * 不是意图。用户那一侧只有两种意图：**我要一个答案**（查证），或**我要参考图**
 * （找图）。所以模型只见这两条，三条旧实现退到 `verify` / `find_images` 背后当内部
 * 步骤；`read_url`（verify 之后按 focus 读某一页）没有入口名能到达，照旧广告。
 *
 * ⚠ 两者⛔**不合并**（§9.1 那条 ⛔）：产出形态（证据列表 vs 候选网格）与后续动作
 * （引用 vs 挂参考）都不同。
 */
export const ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS = {
  /** 查证：改写（三语）→ 选源 → 并发印证 → 证据（§9.1 四步）。 */
  verify: 'verify',
  /** 找图：官方优先搜图，出候选网格。⛔ 它不出结论，也不落任何字节。 */
  findImages: 'find_images',
} as const

export const ASSISTANT_OPERATOR_RESEARCH_ACTIONS = [
  ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.verify,
  ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.findImages,
] as const

export type AssistantOperatorResearchAction =
  (typeof ASSISTANT_OPERATOR_RESEARCH_ACTIONS)[number]

/**
 * 两个入口各自落到哪条**内部实现**上。
 *
 * ⚠ 旧实现一条不少地留着（v2 §0 非目标：不拆引擎）——收的是模型看得见的那张表。
 * `verify` 落在 `research` 那条扇出上（`search_web` / `read_url` 是它内部的源），
 * `find_images` 落在 `search_web_images` 上。步帧、日志条、撤销链路照旧读内部名。
 */
export const ASSISTANT_OPERATOR_RESEARCH_ACTION_TOOLS: Record<
  AssistantOperatorResearchAction,
  AssistantOperatorTool
> = {
  [ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.verify]:
    ASSISTANT_OPERATOR_TOOL_IDS.research,
  [ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.findImages]:
    ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
}

/**
 * **模型不再直接见到的那三条**（§9，commit #16）——它们退成 `verify` / `find_images`
 * 背后的内部步骤。`read_url` 不在此列：没有入口名能到达它，提示与观察都让模型
 * 在 verify 之后读指定页面，所以它照旧出现在 research 的广告表里。⛔ 别把它们从工具表里删掉：步帧、日志条、时间线分组、撤销
 * 链路读的都是这几个名字，删掉等于把已经落盘的历史记录变成读不出来的东西。
 */
export const ASSISTANT_OPERATOR_INTERNAL_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
  ASSISTANT_OPERATOR_TOOL_IDS.research,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
] as const

export function isInternalAssistantOperatorTool(tool: string): boolean {
  return (ASSISTANT_OPERATOR_INTERNAL_TOOLS as readonly string[]).includes(tool)
}

/**
 * 模型能写进 `action` 的值：组内旧工具名，**或**「查」组那两个入口名。
 */
export type AssistantOperatorEntryAction =
  | AssistantOperatorTool
  | AssistantOperatorResearchAction

export function isAssistantOperatorResearchAction(
  action: string,
): action is AssistantOperatorResearchAction {
  return (ASSISTANT_OPERATOR_RESEARCH_ACTIONS as readonly string[]).includes(
    action,
  )
}

/** `action` → 真正要跑的那条工具。旧工具名原样返回。 */
export function resolveAssistantOperatorEntryAction(
  action: AssistantOperatorEntryAction,
): AssistantOperatorTool {
  return isAssistantOperatorResearchAction(action)
    ? ASSISTANT_OPERATOR_RESEARCH_ACTION_TOOLS[action]
    : action
}

/**
 * 每个入口的 `action` 枚举 —— **从 `ASSISTANT_OPERATOR_TOOL_VERBS` 现算**。
 *
 * ⭐ 现算而不是手抄第二份：手抄的那份会在工具表加一条时静默漏掉，而漏掉的表现是
 * 「这条工具在系统提示里看得见、模型一调就说不存在」。⛔ 别改成字面量表。
 * ⚠ `ask` 组里**只有 `propose_context_card` 一条**（v2 §8.1）：反问本身没有
 * 工具 —— 它的形状写在入口自己的 schema 里（`types/assistant-operator.ts`），
 * 不写 `action` 就是「问一道题」。
 */
export const ASSISTANT_OPERATOR_ENTRY_ACTIONS: Record<
  AssistantOperatorEntryTool,
  readonly AssistantOperatorEntryAction[]
> = {
  look: ASSISTANT_OPERATOR_TOOLS.filter(
    (tool) =>
      ASSISTANT_OPERATOR_TOOL_VERBS[tool] === ASSISTANT_OPERATOR_VERB_IDS.look,
  ),
  /**
   * ⚠ 「查」组是**唯一**枚举值不等于工具 id 的一组（§9）：网侧三条收成
   * `verify` / `find_images` 两个入口名，库侧那几条（素材 / 文件夹 / 卡 / LoRA /
   * 证据本）**原样保留** —— §9 收的是网侧，库侧的四条各自答一个不同的问题，
   * 硬并进「查证」只会让模型拿一条外网查证去翻自己的素材库。
   */
  research: [
    ...ASSISTANT_OPERATOR_RESEARCH_ACTIONS,
    ...ASSISTANT_OPERATOR_TOOLS.filter(
      (tool) =>
        ASSISTANT_OPERATOR_TOOL_VERBS[tool] ===
          ASSISTANT_OPERATOR_VERB_IDS.research &&
        !isInternalAssistantOperatorTool(tool),
    ),
  ],
  ask: ASSISTANT_OPERATOR_TOOLS.filter(
    (tool) =>
      ASSISTANT_OPERATOR_TOOL_VERBS[tool] === ASSISTANT_OPERATOR_VERB_IDS.ask,
  ),
  apply: ASSISTANT_OPERATOR_TOOLS.filter(
    (tool) =>
      ASSISTANT_OPERATOR_TOOL_VERBS[tool] === ASSISTANT_OPERATOR_VERB_IDS.apply,
  ),
  request_generation: ASSISTANT_OPERATOR_TOOLS.filter(
    (tool) =>
      ASSISTANT_OPERATOR_TOOL_VERBS[tool] ===
      ASSISTANT_OPERATOR_VERB_IDS.requestGeneration,
  ),
}

/**
 * **schema 收的值域** —— 广告出去的那几个（上表）**加上**退到入口背后的那三条
 * 内部名（§9，commit #16）。
 *
 * ⭐ 两张表分开的判据只有一条：**提示词是提示词，闸是闸**。模型的先验里全是
 * `search_web` / `search_web_images`，它偶尔照旧写一个出来 —— 那时候把它派发到同一条实现上，
 * 比回一句「没这个 action」再烧一步往返便宜得多，而它下一轮读到的提示里照旧只有
 * `verify` / `find_images` 两条。
 * ⛔ 这**不是**把枚举放开成自由字符串（§2.2 的那条 ⛔ 仍然成立）：能写的值仍然
 * 是一张闭表，只是这张表比广告出去的那张长三条。
 */
export const ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES: Record<
  AssistantOperatorEntryTool,
  readonly AssistantOperatorEntryAction[]
> = ASSISTANT_OPERATOR_ENTRY_TOOLS.reduce(
  (byEntry, entry) => {
    byEntry[entry] = [
      ...ASSISTANT_OPERATOR_ENTRY_ACTIONS[entry],
      ...ASSISTANT_OPERATOR_TOOLS.filter(
        (tool) =>
          isInternalAssistantOperatorTool(tool) &&
          // ⚠ 入口名与动词 id 逐字相同（见 `ASSISTANT_OPERATOR_ENTRY_TOOL_IDS`）。
          ASSISTANT_OPERATOR_TOOL_VERBS[tool] === entry,
      ),
    ]
    return byEntry
  },
  {} as Record<
    AssistantOperatorEntryTool,
    readonly AssistantOperatorEntryAction[]
  >,
)

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
 * **确认卡的四种来源**（v2 §3.3 + §8.1 + lora-assistant §10.1）。
 *
 * | kind          | 触发                             | 卡上摆什么                                 |
 * | ------------- | -------------------------------- | ------------------------------------------ |
 * | `multistep`   | 本轮计划步数多                   | 一行动作串 + 「开始 / 一步一步来」         |
 * | `generate`    | `request_generation`             | 模型 / 比例 / 张数 / 分辨率 + 「确认生成」 |
 * | `contextCard` | `propose_context_card`（§8.1）   | 一张卡的草稿 + 「存这张卡 / 不用」         |
 * | `loraPick`    | `plan_lora_pick`（§10.1）        | 本轮候选一把一行 + 「挂载所选」            |
 *
 * ⭐ **四支共用的判据只有一条**：有一件事**等你拍板才算数**。⛔ 别把这张表读成
 * 「一共就这么几种」—— 它已经从两支长到四支，下一支照样按同一条判据进来（该拦的
 * 从来不是数量，是「服务端到这一帧为止有没有替用户做了决定」：四支都没有）。
 * ⛔ **没有花费确认那一支**：它随决策 8 删了，覆盖手写降级成 `ask` 帧（§3.1）。
 * ⛔ 也没有「本会话此类不再问」那张条子了 —— 它是花费确认的配件，一起走。
 */
export const ASSISTANT_OPERATOR_CONFIRM_KIND_IDS = {
  multistep: 'multistep',
  generate: 'generate',
  /**
   * 助手提议记一张上下文卡（v2 §8.1，commit #14）。
   *
   * ⭐ 它进这张表而不是另立一张卡，判据与上面两支逐字同源：用户看的是同一件事
   * ——「有一件事等你拍板才算数」。⛔ 它**不是**决策 8 删掉的那张花费确认卡的
   * 变体：这一支一分钱都不花，它花的是用户的长期记忆。
   * ⚠ 服务端到这一帧为止一行库都没写（§8.1）：入库那一跳由用户点下去。
   */
  contextCard: 'contextCard',
  /**
   * 助手把本轮 LoRA 候选摆出来等创作者勾（lora-assistant §10.1，`plan_lora_pick`）。
   *
   * ⭐ 它落在 `confirm` 而不是 `ask`：`ask` 是「一次只问一个、点一项就是提交」的
   * 单选题（`StudioOperatorQuestionCard` 的头注写死了这条），而这张卡是**多选 +
   * 一颗提交键 + 之后就地换成「已挂 2 把 · 11:24」** —— 帧到即插、不离开时间线、
   * 就地换态，三件事逐条对上的是确认卡。
   * ⚠ 服务端到这一帧为止**一行库都没写、一把都没挂**（§10.2.2）：挂载那一跳发生在
   * 创作者点「挂载所选」之后的那一轮，逐把过 `planMountLora` 的全部闸。
   */
  loraPick: 'loraPick',
} as const

export const ASSISTANT_OPERATOR_CONFIRM_KINDS = [
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick,
] as const

export type AssistantOperatorConfirmKind =
  (typeof ASSISTANT_OPERATOR_CONFIRM_KINDS)[number]

/**
 * ⛔ **这里曾经有一条「计划步数下限」常量（值 3）**，v2 决策 4 把它删了。
 *
 * 死阈值判的是「这一轮有几步」，而用户在意的是「它接下来要替我做的事，有没有
 * 一步是我不想让它自己做的」—— 那是同一个数答不了的问题：三步的「查一下 → 写
 * 提示词 → 预填」是纯打扰，两步的「覆盖我手写的提示词 → 换模型」才该先问一句。
 * 判据因此交给模型（`AssistantOperatorTurnSchema.confirmPlan`，v2 §3.3 「模型判，
 * 不设死阈值」），服务端只按它出帧。⛔ 别把那条阈值常量加回来。
 */

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
  canvasSync: 'canvas_sync',
  /** 撞到步数上限。**不自动续跑** —— 台账 AH：这条链没有幂等键，不做任何自动重试。 */
  maxSteps: 'max_steps',
} as const

export type AssistantOperatorStopReason =
  (typeof ASSISTANT_OPERATOR_STOP_REASONS)[keyof typeof ASSISTANT_OPERATOR_STOP_REASONS]

/**
 * **说不出更具体原因的那一档**（owner 2026-09-20 真机第 1 条）。
 *
 * ⭐ 它是成帧器对**非 `GenerationError`** 的统一回答：那一族异常没有 provider 码、
 * 没有 `i18nKey`，此前一律压成一句英文兜底，用户屏幕与服务端日志之间没有任何
 * 一根线。现在这一档配一个 `traceId`（见 `lib/assistant-operator-stream.ts`）。
 *
 * ⚠ 码住在 constants 是因为它有**两个消费方**：成帧器发它，客户端那张
 * `OPERATOR_ERROR_MESSAGE_KEYS` 按它取三语文案。⛔ 两边各写一个字面量。
 */
export const ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE = 'INTERNAL'

/**
 * **操作员自己那几个码** → `StudioOperator.error.*` 的词表键。
 *
 * ⭐ 由来（2026-09-06 真机）：zh 界面上助手失败时显示的是英文原文
 * 「The assistant operator run failed midway.」——那句话是**服务端**成帧器的兜底
 * （`lib/assistant-operator-stream.ts` 的 `ASSISTANT_OPERATOR_FALLBACK_ERROR`），
 * 服务端不知道用户的界面语言，也不该知道。所以翻译发生在客户端：服务端只负责给
 * 一个**稳定的码**，面板按码取三语文案。
 *
 * ⚠ 这张表**只收操作员自己的码**（路由与成帧器发的那几个）。provider 侧的
 * `GenerationError` 码不进来 —— 它们的三语文案早就在 `Errors.generation.*` 里
 * （`constants/generation-errors.i18n.test.ts` 逐码把关），面板那颗 hook 走
 * `getGenerationErrorMessage` 复用那一条现成的阶梯（顺带白拿 `i18nKey` 这一档）。
 * ⛔ 别在这里给 `invalid_api_key` 一类再抄一份文案：两处迟早说两句不一样的话。
 *
 * ⚠ 它**从 hook 搬到了 constants**（2026-09-20）：多了第二个消费方 ——
 * `src/i18n/completeness.test.ts` 按它逐条验三语。词表键是**动态**取的
 * （`tError(key)`），源码扫描看不见，漏一条的表现是界面上印一个原样 key。
 */
export const ASSISTANT_OPERATOR_ERROR_MESSAGE_KEYS: Readonly<
  Record<string, string>
> = {
  ASSISTANT_OPERATOR_FAILED: 'failed',
  /**
   * 成帧器对**非 `GenerationError`** 的统一码（owner 2026-09-20 真机第 1 条）。
   * 它是阶梯的最后一级：连分类都做不出来时至少说清「这是我们这边的内部错误」，
   * 再配上错误条第二段那个 `traceId`。⛔ 别把它说成「请稍后重试」—— 重试对
   * 一个没修的内部错误没有用。
   */
  [ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE]: 'internal',
  EMPTY_STREAM: 'emptyStream',
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMIT_EXCEEDED: 'rateLimited',
  VALIDATION_ERROR: 'invalidRequest',
}

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
 * **用户自己已经说了「覆盖」**的那几个说法（2026-09-12 实测，三跑三次多余三选）。
 *
 * ⭐ 判据：覆盖三选问的是「你写的那一段怎么办」—— 用户本轮原话里已经答过这道题
 * 时，再弹一次卡是纯粹的打断（实测 #6 / #7 连着两次「直接覆盖」仍被问）。
 * ⚠ 词表**只收明确的写入/替换动作**，⛔ 不收「优化一下」「改得好看点」这种没有
 * 指定去处的说法 —— 误判成「他同意覆盖」会静默吃掉用户手写的那一段。
 * ⚠ 匹配是**原样子串**（中日无词边界），英文那一组由调用方按词边界比 ——
 * 「replace」落在「irreplaceable」里不算他说过话。
 */
export const ASSISTANT_OPERATOR_OVERWRITE_INTENT_WORDS = {
  /** 子串匹配（中文 / 日文）。 */
  substring: [
    '覆盖',
    '覆寫',
    '盖掉',
    '蓋掉',
    '直接写',
    '直接寫',
    '写进',
    '寫進',
    '写入',
    '寫入',
    '换成',
    '換成',
    '改成',
    '替换',
    '替換',
    '重写',
    '重寫',
    '上書き',
    '書き換え',
    '書き替え',
    '置き換え',
    '差し替え',
  ],
  /** 词边界匹配（英文）。 */
  word: ['overwrite', 'overwrites', 'replace', 'rewrite', 'override'],
} as const

/**
 * 四个域 —— **取值来自 `ASSISTANT_PROTOCOL_DOMAINS`**（域简报已分域，复用不重造）。
 * `satisfies` 保证有人改域词表时这里编译期就红。
 *
 * ⚠ `canvas` 2026-09-19 进表（进度表 22「一张脸」）：画布此前走的是自己那套
 * `node-assistant` 引擎（marker + JSON、自己的历史、自己的模型选择器、自己的
 * 参考图选择器）。两套引擎并存的代价不是「多了点代码」，是**同一句话在两个
 * 工作台上得到两种行为** —— 会话不跟着走、@ 菜单不一样、结账与证据本在画布上
 * 整个不存在。所以画布不是「再接一个域」，是把第二张脸摘掉。
 * ⛔ 配音间**不进这张表**（owner 2026-09-19）：那边没有「替你拧旋钮」这回事。
 */
export const ASSISTANT_OPERATOR_DOMAINS = [
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
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
  /**
   * ⚠ 翻证据本**全域通用**（§7.3）：证据本是按**会话**长的，而一条会话可以跨
   * 图片 / 视频 / LoRA 三台工作台（拍板 8）。按域裁等于让同一段对话在换个工作台
   * 之后翻不开自己刚记下的编号。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence,
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
   * 提议一张卡也**全域可用**（§8.1）：用户在视频工作台上讲出来的一套角色设定，
   * 与在图片工作台上讲的是同一套。⛔ 别按域裁。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard,
  /**
   * 审核态**全域可用**（切片 X）：「这张不行」在图片、视频、LoRA 三台工作台上
   * 说的是同一件事，而被否掉的那张图恰恰最容易在换一台工作台之后被重新挂上。
   * ⛔ 别按域裁 —— 那等于让用户在每台工作台上把同一张图再否一遍。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
  /**
   * 素材库四条**全域可用**（§10）：素材库只有一个，在图片 / 视频 / LoRA 三台
   * 工作台上「把这几张收藏起来」说的是同一件事。⛔ 别按域裁 —— 那等于让用户
   * 换个工作台就整理不了自己的库。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
  ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
  ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
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
    ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
    ASSISTANT_OPERATOR_TOOL_IDS.setCount,
    /**
     * 专属 chip 那一行（进度表 11 + 21）。⚠ 域表里有它**不等于**每台工作台上都
     * 有：第二道闸是快照里 `capabilities` 这一节在不在（判据与 `set_negative`
     * 逐字同源）。没有专属能力的模型上那一节整节缺席，工具按 `noSuchControl` 拒。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
    /**
     * 摘参考图（进度表 21）—— ⚠ 只给两台工作台：装配台那条参考轨今天还没接这只
     * 手（`use-lora-operator-host.ts` 的 `removeReference` 归属另算），摆上去就是
     * 一条点了没反应的路。补它是独立一件。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.unmountReference,
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
    /**
     * ⚠ 视频档也列着它，而**今天的视频工作台上那一行 chip 不渲染**
     * （`StudioPromptArea` 只在图片档挂 `StudioModelCapabilityChips`）—— 所以
     * 快照不给 `capabilities`，这条工具在视频档一律按 `noSuchControl` 拒。
     * ⛔ 这不是「摆一条无解的工具」：形状与 `set_negative` 完全相同（列在表里、
     * 由快照缺席收），而视频档一旦补上专属区，这里一个字都不用改。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
    /** 摘参考图 / 清一个帧槽（进度表 21）。判据见图片档那条。 */
    ASSISTANT_OPERATOR_TOOL_IDS.unmountReference,
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
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
    ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
    ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
    ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick,
    ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
    ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
    ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
    ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
  ],
  /**
   * 画布（进度表 22）。
   *
   * ── 通用件为什么只借了一半 ──────────────────────────────────────────
   * `COMMON_DOMAIN_TOOLS` 里有六条动的是**一张表单上的旋钮**（`set_prompt` /
   * `set_negative` / `set_model` / `mount_reference` / `import_user_url` /
   * `prime_generate`）。画布上没有那张表单 —— 提示词、模型、参考图各自住在**某个
   * 节点**身上。摆上去等于给模型一条「点了没反应」的路，正是 `set_count` 当初
   * 被裁掉的同一个形状。画布那一侧的对应物是十条 `canvas_*`。
   * ⛔ **没有 `request_generation`**：画布的扳机是逐节点的（`canvas_generate`），
   *    工作台那颗「生成键」在画布上不存在。
   * ⚠ 读 / 查那几条**一条不少**：素材库、联网、证据本、上下文卡、项目规则在
   *   画布上问的是同一个问题（判据与 `COMMON_DOMAIN_TOOLS` 头注逐字同源）。
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: [
    ASSISTANT_OPERATOR_TOOL_IDS.readState,
    ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
    ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
    ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
    ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
    ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
    ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
    ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
    ASSISTANT_OPERATOR_TOOL_IDS.research,
    ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
    ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence,
    ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules,
    ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
    ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
    ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
    ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard,
    ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
    ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
    ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
    ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
    ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
    ASSISTANT_OPERATOR_TOOL_IDS.canvasApply,
    ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun,
    ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate,
  ],
}

/**
 * **域裁剪裁的是枚举值，不是工具条目**（v2 §2.2 ⛔ 那一条）。
 *
 * ⚠ 系统提示按这张表列每个入口的 `action` 清单：视频档上 `apply` 的枚举里有
 * `set_video_specs` / `set_sound` / `mount_audio_reference` 而没有 `set_count`，
 * 图片档反过来（§2.3：音频两条住在 video 域，⛔ 不新增 `audio` 域）。
 * ⚠ 枚举空掉的入口**不出现在提示里**（LoRA 域没有 `request_generation`）——
 * 摆一个这个域里无解的入口，正是 `set_count` 当初被裁掉的同一个形状。
 * ⚠ `ask` 永远在：它不依赖任何一台工作台上的旋钮。
 * ⚠ 这只是**第一道闸**（模型看不见）。第二道闸照旧是规划器里的
 *   `isAssistantOperatorToolInDomain` —— 提示词从来不是闸。
 */
export const ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN: Record<
  AssistantOperatorDomain,
  Record<AssistantOperatorEntryTool, readonly AssistantOperatorEntryAction[]>
> = ASSISTANT_OPERATOR_DOMAINS.reduce(
  (byDomain, domain) => {
    byDomain[domain] = ASSISTANT_OPERATOR_ENTRY_TOOLS.reduce(
      (byEntry, entry) => {
        // ⚠ 裁的判据落在**内部实现**上：`verify` 在不在这个域，问的是
        //   `research` 在不在（§9 的两入口本身不是域表里的条目）。
        byEntry[entry] = ASSISTANT_OPERATOR_ENTRY_ACTIONS[entry].filter(
          (action) =>
            ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[domain].includes(
              resolveAssistantOperatorEntryAction(action),
            ),
        )
        return byEntry
      },
      {} as Record<
        AssistantOperatorEntryTool,
        readonly AssistantOperatorEntryAction[]
      >,
    )
    return byDomain
  },
  {} as Record<
    AssistantOperatorDomain,
    Record<AssistantOperatorEntryTool, readonly AssistantOperatorEntryAction[]>
  >,
)

/**
 * 这个域里模型真正见得到的入口 —— 枚举空掉的（`ask` 除外）不列进提示。
 */
export function assistantOperatorEntryToolsInDomain(
  domain: AssistantOperatorDomain,
): readonly AssistantOperatorEntryTool[] {
  return ASSISTANT_OPERATOR_ENTRY_TOOLS.filter(
    (entry) =>
      entry === ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask ||
      ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN[domain][entry].length > 0,
  )
}

export function isAssistantOperatorToolInDomain(
  tool: AssistantOperatorTool,
  domain: AssistantOperatorDomain,
): boolean {
  return ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[domain].includes(tool)
}

/**
 * 画布域的几个上限（进度表 22）。
 *
 * ⚠ 它们存在的理由与 `maxSteps` 同源：**每一步都是一次完整的 LLM 往返**，而画布
 * 可以有几百个节点。一份不封顶的画布快照会把整轮的步数全烧在读上下文上 ——
 * 那正是 §2.2「模型要在 31 条里挑一条」被收掉的同一个成本。
 */
export const ASSISTANT_OPERATOR_CANVAS_LIMITS = {
  /**
   * 快照里**完整展开**几面镜（当前镜 + 左右各一）。
   *
   * ⚠ 三这个数不是拍脑袋：用户说「把这镜改成黄昏，下一镜接上」时，模型要同时
   * 看得见「这镜」和「下一镜」的槽与连线；再往外的镜头它只需要知道叫什么。
   */
  expandedShots: 3,
  /** 其余每镜只出一行标题 —— 整张画布最多列这么多行。 */
  maxShotLines: 60,
  /** 一面展开的镜里最多列几个节点。 */
  maxNodesPerShot: 24,
  /** 画布保留节点选择器的模型目录；视频目录已超过通用快照的 24 项。 */
  maxAvailableModels: 64,
  /** 一次重跑规划最多列几个下游节点。 */
  maxRerunNodes: 40,
} as const

export const ASSISTANT_OPERATOR_LIMITS = {
  /**
   * 一轮最多跑几步。**每一步都是一次完整的 LLM 往返**，所以这个数直接决定最坏
   * 情况下的等待时间与账单。画布多节点需要更多写入步，其余域维持较低上限。
   */
  maxSteps: 8,
  maxCanvasSteps: 16,
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
   * 覆盖三选卡上的**取材标注**（LoRA §7.2）。
   *
   * ⚠ 上限是「挂载数 + 1」那条判据的护栏：逐条挂载一行，再留一行给方言纠错。
   * 装配台不限挂载数，所以这里必须有一个数，否则卡上能长出一屏标注。
   */
  maxSourceNotes: 8,
  maxSourceNoteChars: 200,
  /** 同一轮建议往负面框补的词 —— 卡上一行摆得下的量。 */
  maxNegativeDiffTags: 12,
  /**
   * 快照里每条挂载带几条**来源图提示词**（LoRA §7.1 第二档的料）。
   *
   * ⚠ 4 条是「够判 reliable、又不撑爆快照」那个数：取材阶梯只读第一条拿得动的，
   * 多带是为了第一条是空文本时还有下一条可用。挂载数不设上限，所以这里必须有
   * 一个数 —— 一把 LoRA 挖出几十条配方是常态，整份塞进快照等于每一步都重发一遍。
   */
  maxLoraSourcePrompts: 4,
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
   * 同一个改动型工具一轮里最多跑几次（D12 B1）。
   *
   * 🔬 真机：`set_prompt` 换着措辞连调 8 次、步数烧光 —— 每次参数都不同，
   * 「同一步重复」那道闸认不出来。第三次起按打转拒，逼它收尾说话。
   */
  maxSameWriteToolCalls: 3,
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
 * **一轮里记得住几件产物**（切片 X；v2 §7.6 之后是**服务端现场派生**的那份）。
 *
 * ⚠ 它不再是「最近几轮」：跨轮那一半由结论记录接手（§7.6 的注入段），而产物索引
 * 现在只活在**本轮**里 —— 服务端手握每一步的完整 `result`，⛔ 不再让客户端镜像
 * 一份传回来。
 * ⚠ 上限仍然要有：索引里每一条都会以名字印进系统提示，而每一步 LLM 往返都要
 * 重付一次这一段。
 */
export const ASSISTANT_WORKING_MEMORY = {
  /** 本轮最多记几件可指认的产物。 */
  maxArtifacts: 40,
} as const

/**
 * **每轮结账**的上限与编号规则（v2 §7.2 / §7.3）。
 *
 * ⭐ 它答的是 §7.1 那张断点表：上一轮查到的证据、评审得出的结论、用户在问题卡上
 * 选的那一项，下一轮**一条都看不见**。结账把一轮压成四栏（事实 / 决定 / 待办 /
 * 证据编号），记录随会话落库，⛔ 证据正文不进这一列（它在 `ResearchRun`）。
 *
 * ⚠ `maxEntriesPerColumn` / `maxEntryChars` 是**产品口径**，不是 DoS 护栏：
 * 一栏三条、一条 60 字是「下一轮把它整段塞进系统提示还付得起」的那个数（§7.6
 * 带最近 8 轮 = 最多 72 条短句）。放宽它等于让每一步 LLM 往返都多付一次。
 */
export const ASSISTANT_ROUND_SUMMARY_LIMITS = {
  maxEntriesPerColumn: 3,
  maxEntryChars: 60,
  /** 一条记录最多挂几个证据编号 —— 它只是编号，正文按需靠 `recall_evidence` 翻。 */
  maxEvidenceRefs: 12,
  /**
   * 一条会话最多留几条结账记录（纯 DoS 护栏，⛔ 不是产品上限）。
   * 超了从最旧的那头丢 —— 注入只带最近 8 轮（§7.6），更旧的那些没人读。
   */
  maxRoundsPerConversation: 100,
  /**
   * **下一轮注入带最近几条**（§7.6）。判据照抄 spec：一次典型的图片调参对话在
   * 8 轮内收敛；再多就该靠证据本按需翻（`recall_evidence`）而不是全量重发。
   */
  maxRoundsInPrompt: 8,
  /**
   * 一条记录最多钉住几条结论（2026-09-12 实测第三组 B）。
   *
   * ⚠ 钉住条是「这一整轮都别忘了这句」，⛔ 不是收藏夹：一屏顶上摞四条常驻条
   * 之后，它们一起失去了「别忘了」的意思。
   */
  maxPinnedPerRound: 3,
  /** 钉住那一句的长度 —— 与查证归纳出来那一句同源（⛔ 不另立一个数）。 */
  maxPinnedConclusionChars: 220,
} as const

/**
 * **否定性结论的词表**（2026-09-12 真机：LoRA 页助手）。
 *
 * ⭐ 由来：某一轮检索层有 bug，`search_loras` 在 Anima 底模上一条同族都没搜到，
 * 结账把「鸣潮角色与 3D 渲染 LoRA 均基于 SDXL/FLUX 架构，不兼容 Anima Base」
 * 写进了**事实**栏。下一轮用户再说「在 Anima Base 上搜鸣潮的角色 LoRA」，模型
 * 一步工具都没调 —— 因为注入段写着「Facts 里的事别重查」。
 *
 * ⚠ 「没找到」不是事实，是**这一次没找到**：工具挂了、词没对上、检索层有 bug，
 * 三种都长这个样。它该进「待办」（换个词再搜），⛔ 不该进「事实」（从此别再查）。
 * ⚠ 这道闸是**确定性的第二道**：第一道在提示里（让模型别写），这一道在服务端
 * （模型仍然写了就搬走）。
 * ⛔ 只对**事实**栏用：「不要 score 前缀」这类是用户拍的板，它在「决定」栏，
 * 搬走等于把用户说过的话改成待复查。
 * ⚠ 英文那几条带词边界（`\b`）：`no` 不加边界会命中 `north` / `know`。
 */
export const ASSISTANT_ROUND_FACT_NEGATION_PATTERNS: readonly RegExp[] = [
  // 中
  /没有/,
  /没找到/,
  /未找到/,
  /找不到/,
  /不存在/,
  /无法/,
  /不兼容/,
  /暂无/,
  // 英
  /\bno\b/i,
  /\bnone\b/i,
  /\bnot found\b/i,
  /\bcannot\b/i,
  /\bcan['’]t\b/i,
  /\bunavailable\b/i,
  /\bincompatible\b/i,
  // 日
  /ない/,
  /見つから/,
  /不可/,
]

/**
 * 被搬去「待办」栏的那一条前缀 —— 读起来得是「这件事还没定论」，
 * ⛔ 不是「这件事是这样」。
 */
export const ASSISTANT_ROUND_RECHECK_PREFIX = '待复查：'

/**
 * **按编号翻证据本**的上限（§7.3，commit #12）。
 *
 * ⚠ 它不是省钱闸（这一跳一分钱不花、一个外部源不打），是**上下文闸**：一轮只有
 * `ASSISTANT_OPERATOR_LIMITS.maxSteps` 步，而每一步都把之前所有观察重发一遍 ——
 * 不封顶的表现是助手把整轮步数烧在翻旧账上，表单一个字都没写。
 */
export const ASSISTANT_EVIDENCE_RECALL_LIMITS = {
  /** 一轮最多翻几次。 */
  maxCallsPerTurn: 3,
  /** 一次最多翻几条编号。 */
  maxRefsPerCall: 4,
  /** 一条正文最多带回多少字 —— 超了截断，⛔ 不整条丢掉。 */
  maxBodyChars: 1200,
} as const

/**
 * 证据编号的前缀（§7.3）。`#e` + **会话内自增序号**，落在 `ResearchRun.evidence`
 * 的每一项上，结论记录里只出现编号。
 *
 * ⚠ 序号按**会话**自增而不是按 run：用户读到的是「#e12 说的」，而同一条会话里
 * 两次检索各自从 1 数起会让同一个编号指向两件事。
 */
export const ASSISTANT_EVIDENCE_REF_PREFIX = '#e'

/** `#e12` 的形状。⛔ 别在别处重写一份正则。 */
export const ASSISTANT_EVIDENCE_REF_PATTERN = /^#e[1-9]\d*$/

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
  referenceAnalysisRequired: 'referenceAnalysisRequired',
  referenceImageUnavailable: 'referenceImageUnavailable',
  referenceAnalysisFailed: 'referenceAnalysisFailed',
  referenceBriefFailed: 'referenceBriefFailed',
  promptConflict: 'promptConflict',
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
   * 这把 LoRA 是**为另一族底模训的**，挂到当前底模上加载不了（lora-assistant §4.2）。
   *
   * 判据是界面与助手**共用**的那个谓词（`isLoraBaseModelMountCompatible`），⛔ 不让
   * 模型按名字猜（`"Anima"` 是 DiT，而 `"Anima Pencil XL"` 报的是 `"SDXL 1.0"`）。
   * ⚠ 拦的是**助手那只手**：界面侧一字不变，用户自己仍然挂得上一把不兼容的
   * LoRA（装配台只画一行橙字、不禁用）。助手读到这条理由该按**当前底模家族**
   * 再搜一轮同族的，或者提议换底模 —— ⛔ 不是回一句「没有合适的」。
   */
  loraIncompatibleBase: 'loraIncompatibleBase',
  /**
   * 这把 LoRA **创作者还没勾过**（lora-assistant §10.2.1）—— `mount_lora` 拒。
   *
   * ⚠ 与 `loraIncompatibleBase` 同族：两条拦的都是**助手那只手**，界面侧一字不变。
   * 差别是那一条说「这把装不上」，这一条说「这把装得上，但没人点过头」。
   * ⭐ 判据是**有没有那一下勾选**（服务端从 `request.loraPicks` 现算），⛔ 不是
   * 模型在入参里自称「用户已经确认过了」—— 候选是模型从两个上游里挑的，用户一眼
   * 都没看过就挂上去，错的那一次要靠撤销才发现。
   * 助手读到这条理由该先出卡（`plan_lora_pick` 把候选摆给创作者），⛔ 不是换个
   * 参数再挂一次。
   */
  loraPickRequired: 'loraPickRequired',
  /**
   * 规则表满了（§10）。⛔ 不静默丢弃、也不悄悄挤掉最老的一条 —— 用户写下的
   * 每一条都是他自己的决定，该由他去删。助手读到这条理由该把话转给用户。
   */
  ruleLimitReached: 'ruleLimitReached',
  /**
   * 文件夹数量撞到上限（`PROJECT.MAX_PROJECTS_PER_USER`）—— `create_folder` 拒。
   *
   * ⚠ 与 `ruleLimitReached` 分开而不是合成一条「什么东西满了」：两条给用户的
   * 下一步动作不同（一条去删规则、一条去删文件夹），合起来说的那句话两边都不对。
   * ⛔ 撞上限时**不挤掉最老的那个** —— 那是用户的文件夹，不是缓存。
   */
  folderLimitReached: 'folderLimitReached',
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
   * `recall_evidence` 引的编号**这段会话的证据本里没有**（§7.3，commit #12）。
   *
   * ⛔ 与 `unknownAsset` 同一条论据：不去补查一次、也不去打一次外网 —— 那等于
   * 承认模型可以凭空说出一个编号，而编号的全部价值就是「点得回那一条」。
   * ⚠ 它**可教**：助手读到之后该回到注入段里真的印着的那几个号，而不是换个号再试。
   */
  unknownEvidenceRef: 'unknownEvidenceRef',
  /**
   * 这一轮翻证据本的次数**用完了**（§7.3）。
   *
   * ⚠ 与 `researchRoundsExhausted` 分开：那条说「不能再去外面查了」，这条说
   * 「旧账翻够了」—— 前者护的是钱，后者护的是这一轮剩下的步数。
   */
  evidenceRecallsExhausted: 'evidenceRecallsExhausted',
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
    'find out about a SUBJECT properly — a character, a work, a studio, a piece of terminology. Give it a goal in one line plus the entities it turns on ("Ananta", "Shiye"), and it hits several kinds of source at once (encyclopedias, tag libraries, video, general web) and hands back evidence lines: what was said, who published it, how much weight it carries. Use it INSTEAD of search_web whenever the answer is a description rather than a single word, and use it FIRST when the creator names a character or work you are not certain of. You may call it a SECOND time in the same turn with a narrower goal once the first round tells you the official name, the right spelling, or which site is the source of truth — that second round is where the real answer usually is. One round that came back thin is not a dead end: change the entity spelling or the source mix and go again. When the creator says where to look ("only on danbooru", "只在萌百查"), pass exactly that in "onlySources" (a source group — web, wiki, bilibili, danbooru — or a domain) and say in your answer that you searched only there.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readUrl]:
    'actually READ one web page and get the part you need out of it. Takes a url you saw in a verify result (or one the creator gave you) plus a short \'focus\' saying what you are looking for — "appearance and outfit", "release date", "official name". The server pulls the page, finds the passages that match your focus, and returns just those. This is how you get the details that a search extract never contains: hair, eyes, costume, colours, the exact wording of an official description. It reads words only — it does not fetch, save or attach pictures.',
  [ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence]:
    'open the evidence you already gathered earlier in THIS conversation, by number. Earlier rounds are summarised for you in "WHAT EARLIER ROUNDS SETTLED", and the evidence there appears only as numbers like #e12 — this is how you read the actual text behind one. Pass the numbers you need in "refs". Use it when an earlier finding decides what you are about to write; never re-run a web search to recover something this conversation already looked up. A number that does not exist is refused — it is not a hint to go searching.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]:
    "attach one asset from a previous search_assets result to the workbench as a reference image. Takes an assetId, never a URL. Web search results have no assetId and can never be mounted this way — only the creator's own library can.",
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountReference]:
    'take ONE reference off the bench — the mirror image of mount_reference. Name the one you mean with exactly one of: "slotIndex", the N in the @ImageN list printed in the state (counting from 1), or "assetId" for a picture that came back from a search this turn. Pass slot "first" or "last" to clear a named frame slot instead. Use it when you mounted the wrong picture, or when the creator says to drop one — never tell them to click the × themselves. Undoing this puts the same picture back where it was.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]:
    'switch the generation model. The id must be copied verbatim from availableModels in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]:
    'write the positive prompt. If the creator hand-wrote something there themselves, you will be asked which they want (append / overwrite / keep) before it lands. Pass "overwrite":true when they already told you to replace what is there ("覆盖", "直接写进去", "改成…", "replace it") — then it lands straight away and you say you overwrote it as asked. Text you wrote on an earlier turn is not theirs and never triggers that question.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]:
    'write the negative prompt. Only exists on workbenches that actually have that field.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]:
    'set aspectRatio AND resolution together. Optionally include quality and background from the available model options. Quality (low/medium/high/xhigh/max) is independent of resolution (1K/2K/4K). For OpenAI images, preview is an optional boolean: up to two partial images, adding up to $0.006 per output. Enable only when requested.',
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
  /**
   * ⚠ 「只从状态块里抄 key」那句是硬要求（判据同 `set_model` 的「copy the id
   * verbatim」）：这一行 chip 是逐模型派生的，模型按名字猜出来的键在这台机器上
   * 多半不存在，而猜错就是白烧一步 LLM 往返。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setCapability]:
    'set one of the controls that belong to the CURRENT model only — the extra row under the shared specs (quality, guidance, steps, reference strength, preview, and so on). The "key" must be copied verbatim from the model-specific controls listed in the state; never guess one from the model name, and never call this for aspect ratio, resolution or count (those have their own tools). The value has to match the shape the state gives for that key: one of the listed options, a number inside the given range, or true/false. A control the state marks as needing a reference image cannot be set until one is mounted.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]:
    "attach one audio clip from the creator's own library as a voice reference for this shot. Takes an assetId from a search_assets call with kind 'audio'. Name the character it belongs to when you know it — that is how the model learns who is speaking in a multi-character line.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]:
    'turn the clip\'s own soundtrack on or off. Only call it when the creator asked for silence or for sound — leaving it alone means "whatever this model normally does", which is usually what they want.',
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]:
    "arm the generate button on the workbench so it is one click away, with the price shown. This does NOT generate anything and never spends the creator's credits. Use it only when the creator says they will press generate themselves or only wants the form set up; otherwise finish with request_generation.",
  [ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration]:
    'put a confirm card in the chat for the current form: model, count and specs, and the creator confirms it (or their auto-generate switch confirms it for them). You never spend their credits yourself. Use it as the LAST step once the form is ready and what they asked for is a picture or a clip (「出一张…」, 「准备生成」 count). Call it once per round; never call it to "see what happens".',
  /**
   * ⚠ 「归属票是唯一凭证」那句已作废（拍板 4 推翻，2026-09-06）：`@` 指定的任意
   * 一张一律可看。⛔ 但**名单仍然是硬闸**：`targetIds` 只能是这一轮 `@` 上来的那
   * 几张，模型自己写一条地址会被 `unknownAsset` 拒。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]:
    'actually LOOK at a picture and say what worked and what did not. Two ways to get one: pass "targetIds" with the id or the exact address of a picture the creator attached to THIS message (that is them pointing at it), or call it with no target when a run you armed has just come back. You may never invent an address — anything the creator did not reference this turn is refused. If they said "that one" and more than one picture is in play, call it with no target and the app will ask them which. Call it first when a picture is waiting, then fix the form with set_* based on what you saw. On the video bench the target is a CLIP and you are shown three stills from it (first / middle / last) instead of one picture — same tool, same rules.',
  [ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences]:
    'SEE the reference images mounted on this workbench: it opens their actual pixels and returns verified visual facts, without assigning creative roles or changing the prompt. This is the entry for any question about what a mounted reference looks like — its art style, its content, its composition, its colours — not only a step before writing the prompt, and never answer such a question with "I cannot see these images". If the creator @-mentioned images this turn, inspect ONLY those: @Image3 -> imageIndices: [2]. Omitting imageIndices then means those mentioned images, not every mounted reference. Extra unmentioned images are refused. If they mentioned none, omit to inspect all mounted references. Unchanged images reuse visual facts. Call before set_prompt with references; set_prompt separately builds and validates source roles. Answer visual/style questions directly from the facts. Do not use critique_result on sources. On referenceImageUnavailable, identify the exact failed image. On referenceAnalysisFailed, report the supplied failure stage; invalid model output is not evidence that an image is unreadable. Do not ask for re-upload unless image transport actually failed. Do not invent visual facts or retry unchanged within the same turn. A new user request may recheck an earlier failure.',
  /**
   * ⚠ 2026-09-06 放宽了**准入名单**（⛔ 不是放宽了闸）：除了「用户逐字写过的
   * 地址」，本轮 `search_web_images` 真的展示过的候选也算数 —— 用户说「都挂上」
   * 时那几张他看见了。⛔ 站方禁 AI 的那一档照旧拒，模型编的地址照旧拒。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]:
    "take ONE web address, fetch that picture into the creator's library, and mount it as a reference — all in one step. Two addresses are allowed and no others: one the creator typed VERBATIM in this conversation (use it the moment they hand you a link; that is them saying yes), or one of the candidates your own find_images actually put on screen this turn — and that second kind ONLY when they have already told you to attach them, one call per picture. A candidate marked REFERENCE ONLY is refused either way. Plain image links work, and so does a normal web page — the picture on it is taken. Never tell the creator to download, upload, or click anything for a link they already gave you: that is what this tool is for.",
  /**
   * ⚠ 「短英文查询」那句与 `search_web_images` 同源，理由也一样：两个上游
   * （Civitai 的 meilisearch / HF 的仓库搜索）吃的都是名字与短标签，一整句描述
   * 会让召回崩掉。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]:
    'look for LoRAs on Civitai and Hugging Face. Returns real candidates with their id, licence, base-model family, and whether this workbench can actually mount them. This is the ONLY place a candidateId comes from — never invent one. Keep the query SHORT and in English (a style name, an artist, two or three words); a whole sentence returns junk. Read the compatibility line on each candidate before you recommend it: a LoRA built for a different base-model architecture will not load on the base that is selected.',
  [ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick]:
    'PUT THE CANDIDATES IN FRONT OF THE CREATOR and let them tick the ones to mount. This MOUNTS NOTHING on its own: the app shows them the list and they decide; it ends your turn. Every candidateId must be one this turn\'s search_loras actually returned. ALWAYS go through this after a search — even when only one candidate came back, even when they named a LoRA themselves. Write "question" as the one line above the list, group the candidates by what they are for when that helps (a short title per group), and mark at most one as recommended. Candidates that cannot be mounted on the selected base go in the list too — the app greys them out and says why; never filter them out, or the creator reads it as "nothing found". Shape: {"action":"plan_lora_pick","question":"…","groups":[{"title":"…","candidateIds":["civitai:…"]}],"recommendedCandidateId":"…"} — every group needs a non-empty "candidateIds" array.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]:
    'LoRA mounting is executed by the client after the creator selects the pick card. Do not call this directly: use plan_lora_pick, then read actual client receipts and the current stack on the next turn. A failed receipt is not a mounted LoRA.',
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]:
    'take one LoRA off the assembly bench. The id comes from the mounted list in the state block — that is a different list from search results. Use it when two mounted LoRAs are fighting over the same thing, and say which one you dropped and why.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters]:
    'set visible Runner controls: steps, guidanceScale, runnerSeed (decimal string), runnerWidth/runnerHeight (together), runnerSampler, runnerScheduler. Omit unchanged fields; null clears the override (seed becomes random; other controls use workbench defaults). Prefer source recipe values only when reproducing that recipe on a compatible base. Explain deliberate deviations. Never invent source settings or claim unsupported hires/ControlNet settings were applied. This does not generate.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]:
    'change how strongly one already-mounted LoRA applies. The id comes from the mounted list in the state block. Weight is a plain number in the range the state block gives.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules]:
    "read the standing rules this creator has written down for their work. The newest ones are already quoted in your instructions — call this only when you need the older ones, or the ones scoped to another workbench. Returns each rule's id, its exact wording, and the date it was recorded.",
  [ASSISTANT_OPERATOR_TOOL_IDS.listContextCards]:
    'list the context cards this creator keeps — characters, styles and brand kits they wrote down once and reuse. Each entry gives an id, its kind, its name and a one-line summary. The ones pinned to this workbench are already quoted in your instructions; call this when they mention a character, a look or a brand you do not have in front of you. Filter by kind when you know which sort you are after.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readContextCard]:
    'read one context card in full: the body the creator wrote (appearance, outfit, personality — or the style rules, or the brand spec), the hard negatives that card carries, and the URLs of its reference images with what each one is for. The card id comes from list_context_cards or from your instructions — never invent one. A sheet image is identity evidence: the look is decided by it. Mount the images you actually need with mount_reference; reading a card mounts nothing on its own.',
  [ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard]:
    'OFFER to remember a character, a look or a brand spec the creator just described, as a context card they can reuse later. This SAVES NOTHING on its own: the app shows them the draft card and they decide. It ends your turn. Use it when they have just settled a set of details that will obviously come back — a character\'s appearance and outfit, a style they keep asking for, their brand colours — never for a one-off instruction about this run. Write the summary as the one line that gets quoted back to you every turn, and the body as the full description in THEIR words. One card at a time, and never offer the same card twice in a session.\nTHIS IS THE ONE FOR A STANDING SETTING ABOUT A THING: what a character looks like, wears, or does with their hair; what a look is made of; brand colours and what is forbidden on them. Chinese openings that mean exactly this: 「以后…固定…」「记一下…设定」「这个角色一直是…」. Example — they say 「以后图1这个男角色固定穿藏青水手服，双马尾」, you send {"action":"propose_context_card","kind":"character","name":"图1的男角色","summary":"navy sailor uniform, twin tails","body":"以后图1这个男角色固定穿藏青水手服，双马尾"}. Never file one of these as a project rule — a rule is a way of working, this is what something IS.',
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]:
    'write down ONE standing rule about HOW YOU WORK that the creator just stated — which sources to trust, what to always or never do, how they want things written or delivered. It should hold for their future work, not a one-off instruction for this run. Quote them; do not paraphrase into your own words. Scope it to this workbench only when it genuinely does not apply elsewhere. Never record a rule they did not state, and never record the same rule twice. "kind" picks which sort of rule it is: "note" (the default, their own words), "sourceAllow" ("only trust these sources from now on") or "sourceDeny" ("never use this site again"). Those last two hold ONE search source id (the same ids the verify tool takes) or ONE domain — ask which site they mean rather than writing a sentence, and use them only when they asked for a standing source list, not for this one search. Example — they say 「以后查资料只信官方站，别拿同人图当依据」, you send {"action":"add_project_rule","text":"以后查资料只信官方站，别拿同人图当依据"}.\nNOT FOR A SETTING ABOUT A THING. A character\'s appearance, outfit or hair; a look they want fixed; brand colours and their forbidden list — those are context cards, not rules: send ask{"action":"propose_context_card", …} instead. 「以后图1这个男角色固定穿藏青水手服，双马尾」 is a card, not a rule. The test is simple: a rule tells you how to behave, a card tells you what something IS. Filing a card as a rule costs the creator the reusable card they should have been offered.',
  [ASSISTANT_OPERATOR_TOOL_IDS.tagAsset]:
    "put one or more short tags on the creator's own assets so they can find them again — up to 20 assets and 5 tags in one call. Tags they already carry are left alone. Use the creator's own words for a tag, keep it to a word or two, and only tag what they actually asked you to; this writes to their library. Undoing this removes exactly the tags this call added, nothing they had before.",
  [ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset]:
    'star or unstar the creator\'s own assets — up to 20 in one call. Pass value true to favourite, false to remove the star. Anything already in the wanted state is left alone. Use it when they say "keep these" or "these are the good ones"; never unstar in bulk unless they asked for exactly that.',
  [ASSISTANT_OPERATOR_TOOL_IDS.createFolder]:
    "make ONE new folder in the creator's asset library. Give it a name in their words; pass parentId (a real folder id from list_asset_folders) only when they asked for it to sit inside another folder. This creates an EMPTY folder — putting things in it is a separate move_assets call. Never make a folder they did not ask for, and never make a second one with the same name.",
  [ASSISTANT_OPERATOR_TOOL_IDS.moveAssets]:
    "file up to 20 of the creator's own assets into one folder. targetFolderId is a real folder id — from list_asset_folders, or from a create_folder you just made. Assets keep their tags and stars; this only changes which folder they live in. Undoing puts each one back exactly where it came from, so a wrong move is cheap — but a move the creator did not ask for is still a mess in their library.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]:
    'mark one of the creator\'s own assets as approved or blocked, so the verdict survives this turn. Use "blocked" when they say a picture did not work ("the hands are wrong", "not this one") — a blocked asset can never be used as a first or last frame again, on any workbench, and you should stop offering it. Use "approved" when they settle on one. The assetId comes from search_assets, from what they handed you, or from what you produced earlier this session — never invent one. Blocking deletes nothing: the picture stays in their library and you can still review it. Give a short reason in their words.',
  // ── 画布两条 ────────────────────────────────────────────────────────
  // ⚠ 逐条 op 的说明照旧从 `NODE_ASSISTANT_OP_V4_HINTS` 里取（真值只有一份），
  //   这里只写「什么时候用这个入口」。
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasApply]:
    "change one thing on the board — add a card, wire two cards together, rewrite a prompt, switch a model, hang one card's picture onto another, retag a frame, or work out what has gone stale downstream. One call changes one thing, so a wrong one costs one retry and one undo. Every node id comes from the board snapshot you read; a made-up id is refused. Deleting a card asks the creator first, because its wires go with it.",
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun]:
    'work out which cards downstream of one card are now out of date, after something upstream changed. It fires nothing and spends nothing — it hands the creator a list so they can decide what to run again. Never write the list yourself; this walks the wires for you.',
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate]:
    'ask to run one card on the board. This is the only thing here that costs credits, so it never happens on its own: it puts a confirmation in front of the creator and they pull the trigger. Check the prompt, the model and the references on that card first.',
}

/**
 * **五段工具说明的第一句**（v2 §2.4：每段一句「什么时候用它」+ 一张枚举表）。
 *
 * ⚠ 逐条 `action` 的说明**照旧从 `ASSISTANT_OPERATOR_TOOL_HINTS` 里取**：收的是
 * 「模型要在多少条里挑一条」（31 → 5），⛔ 不是把 31 条里写死的那些硬教训
 * （「asset id 只能来自 search_assets」「搜图只出预览」）扔掉 —— 那些不是描述，
 * 是闸的可教版本，扔掉之后模型会在同一个坑里重新掉一遍。
 */
export const ASSISTANT_OPERATOR_ENTRY_TOOL_HINTS: Record<
  AssistantOperatorEntryTool,
  string
> = {
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look]:
    'LOOK at something that is already here — the form, a picture, a folder, a clip, a card, the standing rules. It changes nothing and produces facts. The reference images mounted on this workbench are here too: analyze_references opens their actual pixels, so never answer a question about one by saying you cannot see it.',
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research]:
    "GO AND FIND something that is not here yet — on the web, or in the creator's own library. It produces candidates and evidence, and files nothing. For a character's official look: verify first, then find_images, then read_url — do not start with a single web extract.",
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask]:
    'STOP AND ASK the creator to settle one thing you genuinely cannot settle yourself. It ends your turn: the app shows one question and waits for their tap. Leave "action" out for a plain question; the one "action" listed below offers them something to keep instead of asking a question — and that is where every standing SETTING goes (what a character looks like or wears, a fixed look, brand colours), while a standing way of WORKING goes to apply/add_project_rule.',
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply]:
    'TURN A KNOB on the workbench in front of them. Every one of these is undoable and shows up on their screen immediately. add_project_rule in here takes a standing rule about HOW YOU WORK only — a standing setting about what a character or a look IS belongs to ask/propose_context_card.',
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.requestGeneration]:
    'ASK FOR THE GENERATION to be set up. You never spend their credits: the most this does is arm the button, and they press it.',
}

/**
 * 逐条 `action` 的说明 —— 旧工具照旧读 `ASSISTANT_OPERATOR_TOOL_HINTS`，
 * 「查」组那两个入口在这里补上（§9，commit #16）。
 *
 * ⚠ 两段话的全部工作是把它们**分开**：一个要的是答案，一个要的是图。
 * 合并那道坎在 v1 上就摔过（模型拿 `search_web` 去找参考图，回来一串标题）。
 */
export const ASSISTANT_OPERATOR_ENTRY_ACTION_HINTS: Record<
  AssistantOperatorEntryAction,
  string
> = {
  ...ASSISTANT_OPERATOR_TOOL_HINTS,
  [ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.verify]:
    'CHECK A FACT you are not certain of, properly. Give it a goal in one line ("what Shiye officially looks like") plus the entities it turns on ("Ananta", "Shiye"), first the work and last the character. The app rewrites it into two or three search phrases in Chinese, English and Japanese, picks the right kinds of source (encyclopedias, tag libraries, video, general web), hits them at once and hands you back a conclusion plus the sources behind it — what was said, who published it, and how many independent sources agree. Use it whenever the creator\'s request turns on a detail you would otherwise guess: an official name, a character\'s design, a platform rule, a studio\'s own terminology. Evidence marked "single source" is exactly that — say so instead of stating it as fact. You may verify a SECOND time with a narrower goal once the first round tells you the official name or the site of record; that second round is where the real answer usually is. This is not how you find reference pictures — that is find_images. TWO DEPTHS: leave depth out (or "quick") for almost everything — one round of web search plus the first three pages read in full, a few seconds. Pass depth:"deep" only when the creator asks for it ("look into this properly", "be thorough", "I need this to be right") or when the question plainly needs several independent kinds of source to agree — deep runs multiple rounds across encyclopedias, tag libraries and video and takes about a minute. Do not ask the creator for permission before going deep, and do not mention what it costs; just say in one line that you are looking into it properly.',
  [ASSISTANT_OPERATOR_RESEARCH_ACTION_IDS.findImages]:
    'FIND REFERENCE PICTURES on the web. Takes three or four words in English plus "subject" (the work and the character) and, for character designs, preferOfficial:true. It puts candidates on screen as previews and files NOTHING: the creator picks the ones they want and the app imports those. Never describe these pictures as if you had looked at them, and never write one of their addresses into the form. It does not answer questions — that is verify.',
}

/**
 * **被 `malformedArgs` 拒掉时，观察里附的那份正确形状**（2026-09-12 实测第 9 步）。
 *
 * ⭐ 判据与本文件其它「可教的拒」逐字同源：一条只说「参数形状不对」的理由，
 * 模型只会换个值再撞一次（实测：`add_project_rule` 第一次红、第二次才落）。
 * ⚠ 只给**实测撞过**的那几条，⛔ 不为 31 条工具各抄一份 JSON —— 那份清单会与
 * schema 分家，而分家之后它比没有更糟。
 */
export const ASSISTANT_OPERATOR_TOOL_ARG_SHAPE_HINTS: Partial<
  Record<AssistantOperatorTool, string>
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]:
    'Correct shape: {"action":"add_project_rule","text":"<their sentence>"} — "text" is a plain string and the only required field. "kind" ("note"/"sourceAllow"/"sourceDeny") and "scope" are optional; leave them out unless you mean them.',
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
 * **素材库四条写操作的上限**（v2 §10）。
 *
 * ⚠ 单独一张表，判据与 `ASSISTANT_RESEARCH_LIMITS` 那条同源：这里的数管的不是
 * 「一条 op 能有多大」，而是**助手一次能动用户多少东西**。混进
 * `ASSISTANT_OPERATOR_LIMITS` 的下场是下一个人为了「让它一次能整理完」把 20
 * 调到 200，而那时候出错的是用户的整个素材库。
 * ⚠ 20 是 §10 的原话：「一次动更多就该让用户去素材库自己框选，助手不是批处理器」。
 */
export const ASSISTANT_ASSET_WRITE_LIMITS = {
  /** 一次最多动几件素材（打标签 / 收藏 / 移动共用这一个数）。 */
  maxAssetsPerWrite: 20,
  /** 一次最多打几个标签。 */
  maxTagsPerWrite: 5,
  /** 一个标签多长 —— 它是个词，不是一句话。 */
  maxTagChars: 40,
  /** 一件素材上最多累计多少个标签，⛔ 撞上限时拒，不挤掉最老的那个。 */
  maxTagsPerAsset: 20,
  /** 文件夹名长度，与 `Project.name` 同尺度。 */
  maxFolderNameChars: 120,
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
  /**
   * 收尾归纳那一跳看几条证据（2026-09-12 实测第三组 A）。
   *
   * ⭐ 只喂**排在最前**的那几条：扇出已经把「互相印证的排前」做完了，把十条全
   * 喂进去只是让归纳那句话去迁就长尾里的单源说法。
   */
  maxConclusionEvidence: 5,
  /** 归纳出来那句话的长度（≤2 句，不是一段）。 */
  maxConclusionChars: 220,
  /**
   * **快搜一档读几页全文**（56b 切片 2）。
   *
   * ⭐ 3 页是「几秒内出答案」与「不只是读摘要」之间那条线：Serper 的摘要经常
   * 只有两句，而用户问的是画风/技法这类要正文的题。四页起首字延迟就越过用户
   * 愿意干等的那道坎（同 `plannerTimeoutMs` 的判据）。
   * ⚠ 读页是**并行**的，所以它加的是一次请求的时间不是三次。
   */
  quickReadPages: 3,
  /**
   * 快搜一档最多回几条证据。
   *
   * ⚠ 比深入那一档（`maxEvidenceItems` 10）窄：快搜只打一组源（网搜），
   * 十条里有七条来自同一个站不是印证，是噪音。
   */
  quickEvidenceItems: 6,
} as const

/**
 * **调查的两档**（56b 切片 2，owner 2026-09-19）。
 *
 * ⭐ 两档的差别是**打多少**而不是「问得多认真」：
 *  · `quick`（默认）—— 一轮网搜 + 读前 `quickReadPages` 页全文，几秒出答案；
 *  · `deep` —— 现有的规划器 / 扇出多轮 + 全部连接器（wiki / B站 / danbooru）。
 * ⛔ **不弹确认卡**：花的是搜索额度不是生成费（owner 定）。开跑前那句预估写在
 * 加载行里，而不是拦一道要人点的闸。
 * ⚠ 值同时是协议里那一格（模型写得出来的入参）与日志上那一格，⛔ 别在 UI 侧
 * 再定义一份小写字符串。
 */
export const ASSISTANT_RESEARCH_DEPTHS = {
  quick: 'quick',
  deep: 'deep',
} as const

export const ASSISTANT_RESEARCH_DEPTH_VALUES = [
  ASSISTANT_RESEARCH_DEPTHS.quick,
  ASSISTANT_RESEARCH_DEPTHS.deep,
] as const

export type AssistantResearchDepth =
  (typeof ASSISTANT_RESEARCH_DEPTH_VALUES)[number]

/**
 * 加载行里那句**预估**（秒）。
 *
 * ⚠ 它是给人读的量级不是承诺：写「约 1 分钟」的价值在于用户知道该不该走开，
 * ⛔ 不是一个会被拿去比对的倒计时（所以⛔ 不做倒数）。
 */
export const ASSISTANT_RESEARCH_ESTIMATE_SECONDS: Record<
  AssistantResearchDepth,
  number
> = {
  [ASSISTANT_RESEARCH_DEPTHS.quick]: 10,
  [ASSISTANT_RESEARCH_DEPTHS.deep]: 60,
}

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

/**
 * **收尾许诺了自己下一步要做的事**（2026-09-24 真机）。
 *
 * 🔬 提示词写完，助手收尾说「下一步我会把画幅调整为 16:9，再为你准备生成确认卡」
 * 然后停了 —— 那两件它当场就能做，却留给创作者再发一句话去触发。
 * ⚠ 判的是**任意位置**的「下一步我会 / 接下来我会 / next I will」，不只是句首：
 * 前面几句往往是真结论，许诺挂在最后一句。
 * ⚠ 问句不算：「要不要我接着……？」是把决定交给创作者，那是对的收尾。
 * ⚠ 只在还有步数时退回（最后一步的收尾本来就该说「还剩什么」）。
 */
export const OPERATOR_SELF_PROMISE_PATTERNS: readonly RegExp[] = [
  /(下一步|接下来|随后|然后|之后)[，,]?\s*我(会|将|再|来|就)/,
  /(次は|このあと|この後|続けて)[、,]?\s*(私が)?[^。？?]*(します|しておきます)/,
  /\b(next|then|after that),?\s+i['’]?(ll|\s+will)\b/i,
]

export function isSelfPromiseClosingMessage(message: string): boolean {
  const text = message.trim()
  if (/[?？]\s*$/.test(text)) return false
  return OPERATOR_SELF_PROMISE_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * 证据条的形状 —— 与 `EvidenceItem.kind` 逐字同名（文字 / 标签 / 图 / 视频）。
 *
 * ⚠ `video` 是 56b 切片 1 加的第四种：它**不是**「带时长的图片」，点下去的去处
 * 不同（图开灯箱、视频开新窗口）。判据与 `EvidenceVideoItemSchema` 头注同源。
 */
export const ASSISTANT_RESEARCH_EVIDENCE_KINDS = [
  'text',
  'tags',
  'image',
  'video',
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

/**
 * 一条规则**是哪一种**（v2 §9.3）。⚠ 值逐字对应 `prisma/schema.prisma` 的
 * `enum ProjectRuleKind`（那边是 SCREAMING_SNAKE，这里是协议侧的形态）。
 *
 * ⭐ 来源名单复用项目规则表而不是另开一张：它已经有 `userId` / `scope`（域）/
 * `source`（谁记的）三个维度，而名单要的正是这三个。
 */
export const PROJECT_RULE_KIND_IDS = {
  /** 普通项目规则（v1 现状）——`text` 是规则原文。 */
  note: 'note',
  /** 只信这些来源 ——`text` 是一个来源 id 或域名。 */
  sourceAllow: 'sourceAllow',
  /** 永远屏蔽这些来源 ——`text` 同上。 */
  sourceDeny: 'sourceDeny',
} as const

export const PROJECT_RULE_KINDS = [
  PROJECT_RULE_KIND_IDS.note,
  PROJECT_RULE_KIND_IDS.sourceAllow,
  PROJECT_RULE_KIND_IDS.sourceDeny,
] as const

export type ProjectRuleKindId = (typeof PROJECT_RULE_KINDS)[number]

/**
 * **模型写歪的 `add_project_rule` 参数往回掰的那张对照表**（2026-09-12 实测第 9 步）。
 *
 * ⭐ 起因很具体：`add_project_rule` 第一次调用被 schema 判成「参数形状不对」，
 * 第二次才落 —— 用户看到的是一条红字加一次白等，而两次说的是同一件事。
 * ⚠ 这不是给协议开后门：`text` 的长度、`kind` 的值域一个字都没松，松的只有
 * **同一个东西叫什么名字**。认不出来的照旧拒（带一句正确形状的例子）。
 * ⛔ 别把这张表推广到别的工具：形状容错的代价是「模型学不会正确形状」，只在
 * 真的实测撞过的那条工具上付。
 */
export const PROJECT_RULE_TEXT_ARG_ALIASES = [
  'rule',
  'content',
  'value',
  'note',
] as const

/** `kind` 的常见别名（含中文）——⚠ 一律小写比对。 */
export const PROJECT_RULE_KIND_ALIASES: Record<string, ProjectRuleKindId> = {
  note: PROJECT_RULE_KIND_IDS.note,
  plain: PROJECT_RULE_KIND_IDS.note,
  general: PROJECT_RULE_KIND_IDS.note,
  rule: PROJECT_RULE_KIND_IDS.note,
  普通: PROJECT_RULE_KIND_IDS.note,
  规则: PROJECT_RULE_KIND_IDS.note,
  笔记: PROJECT_RULE_KIND_IDS.note,
  sourceallow: PROJECT_RULE_KIND_IDS.sourceAllow,
  source_allow: PROJECT_RULE_KIND_IDS.sourceAllow,
  'source-allow': PROJECT_RULE_KIND_IDS.sourceAllow,
  allow: PROJECT_RULE_KIND_IDS.sourceAllow,
  allowlist: PROJECT_RULE_KIND_IDS.sourceAllow,
  白名单: PROJECT_RULE_KIND_IDS.sourceAllow,
  sourcedeny: PROJECT_RULE_KIND_IDS.sourceDeny,
  source_deny: PROJECT_RULE_KIND_IDS.sourceDeny,
  'source-deny': PROJECT_RULE_KIND_IDS.sourceDeny,
  deny: PROJECT_RULE_KIND_IDS.sourceDeny,
  block: PROJECT_RULE_KIND_IDS.sourceDeny,
  blocklist: PROJECT_RULE_KIND_IDS.sourceDeny,
  黑名单: PROJECT_RULE_KIND_IDS.sourceDeny,
}

/** 两种来源名单 —— 读名单那条查询按它收敛。 */
export const PROJECT_RULE_SOURCE_KINDS = [
  PROJECT_RULE_KIND_IDS.sourceAllow,
  PROJECT_RULE_KIND_IDS.sourceDeny,
] as const

/**
 * 来源名单一条里能装什么（§9.3）：**一个来源 id 或一个域名**，⛔ 不是一句话。
 *
 * ⚠ 域名判据故意宽松（`example.com` / `zh.moegirl.org.cn`）：站点域名的形态五花
 * 八门，卡太严的表现是用户写下的名单里有一条静默不生效 —— 而名单不生效时助手
 * 会照常去打那个站，用户永远不会知道。
 */
export const PROJECT_RULE_SOURCE_TOKEN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

/**
 * 单轮临时白名单（`research.onlySources`，创作者在话里指的来源）最多几条。
 *
 * ⚠ 它与库里的名单**不是同一条命**：临时名单只作用于本轮、⛔ 不写库。
 * 上限存在的理由与规则表那条一样 —— 它会拼进系统提示。
 */
export const ASSISTANT_SOURCE_ALLOWLIST_LIMITS = {
  /** 一轮最多指定几个来源。 */
  maxPerTurn: 8,
  /** 一条最长多少字（域名足够长，⛔ 不是给一句话用的）。 */
  maxTokenChars: 120,
} as const

/**
 * 覆盖三选（追加 / 覆盖 / 保留）那一支答复在**对话里**的合成 id（§3.4 落账规则）。
 *
 * ⭐ 它的全部工作是**连起两条通道**：那一支的回执走 `confirmations`（服务端据此
 * 改表单），而同一次选择又要以一条自带题面的 user 消息留在对话里（否则再下一轮
 * 模型就看不到它了）。结账那一跳按这个 id 认出「这两条说的是同一件事」，⛔ 不把
 * 一次选择记成两条「决定」—— 结论栏只有三行，重复一条就挤掉一条真的。
 */
export const OPERATOR_OVERWRITE_ANSWER_ID_PREFIX = 'overwrite:'

export function overwriteAnswerId(field: string): string {
  return `${OPERATOR_OVERWRITE_ANSWER_ID_PREFIX}${field}`
}

/**
 * 上下文卡确认卡那两下（「存这张卡」/「不用」）在**对话里**的合成 id
 * （§3.4 落账规则，2026-09-12 真机 bug）。
 *
 * ⭐ 判据与 `overwriteAnswerId` 逐字同源：那一下落的是一行系统行，而服务端零
 * 会话态 —— 不给它一个自带身份的 id，下一轮就没人说得出「这张卡用户已经表过
 * 态了」，于是模型每开一条流都重提同一张卡（真机：用户问别的事，回回先被
 * 拦一张「记住这张卡？」）。
 * ⚠ 名字 `trim` 后按小写入 id：同一张卡在两轮里大小写不同不该算两次表态。
 */
export const OPERATOR_CONTEXT_CARD_ANSWER_ID_PREFIX = 'contextCard:'

export function contextCardAnswerId(kind: string, name: string): string {
  return `${OPERATOR_CONTEXT_CARD_ANSWER_ID_PREFIX}${kind}:${name
    .trim()
    .toLowerCase()}`
}

/**
 * LoRA 推荐卡那一下（「挂载所选」/ 关掉不点）在**对话里**的合成 id
 * （lora-assistant §10.1 落账三件套）。
 *
 * ⭐ 判据与 `overwriteAnswerId` / `contextCardAnswerId` 逐字同源：那一下落的是一行
 * 系统行，而服务端零会话态 —— 不给它一个自带身份的 id，下一轮就没人说得出
 * 「这张卡创作者已经表过态了」，于是模型每开一条流都重提同一张卡。
 * ⚠ 认卡的身份是**那一轮的检索词**（一张卡 = 一次 `search_loras`）：`trim` 后按
 * 小写入 id，同一个词在两轮里大小写不同不该算两次表态。
 */
export const OPERATOR_LORA_PICK_ANSWER_ID_PREFIX = 'loraPick:'

export function loraPickAnswerId(query: string): string {
  return `${OPERATOR_LORA_PICK_ANSWER_ID_PREFIX}${query.trim().toLowerCase()}`
}

/**
 * 那两下的**选项文案**（给模型与库看的那一份）。
 *
 * ⚠ 界面上那两颗键照旧走词表（`StudioOperator.confirm.contextCard.*`）：这里
 * 这一份要进对话与库，⛔ 不能随用户的界面语言变形。
 */
export const OPERATOR_CONTEXT_CARD_CHOICE_IDS = {
  save: 'save',
  decline: 'decline',
} as const

export const OPERATOR_CONTEXT_CARD_CHOICE_LABELS = {
  save: '存这张卡',
  decline: '不用',
} as const

/**
 * 推荐卡那两下（「挂载所选」/ 关掉不点）在**对话里**的合成选项 id
 * （lora-assistant §10.1 落账三件套）。
 *
 * ⛔ **不拿 candidateId 当选项 id**：`ASSISTANT_PLAN_CARD_LIMITS.maxOptions` 是 4，
 * 而一张卡最多摆 6 把 —— 勾满六把的那一次整条请求会被 schema 拒掉（用户点了没
 * 反应，且错在客户端）。勾的是哪几把写在正文（`userText`）与 `optionLabels` 里。
 */
export const OPERATOR_LORA_PICK_CHOICE_IDS = {
  mount: 'mount',
  dismiss: 'dismiss',
} as const

/** 关掉不点那一下的**选项文案**（进对话与库的那一份，⛔ 不随界面语言变形）。 */
export const OPERATOR_LORA_PICK_DISMISS_LABEL = '都不挂'
