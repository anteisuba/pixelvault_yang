/**
 * 工作台助手操作员化的**客户端视图模型**（P2）。
 *
 * ── 为什么不是 Zod ─────────────────────────────────────────────────
 * `types/assistant-operator.ts` 那三张 schema 管的是**跨进程边界**的东西
 * （请求 / 模型输出 / 事件），必须运行时校验。这里的类型一个都不过边界：它们是
 * 客户端自己攒出来的线程条目与改动登记簿。给它们配 schema 只会多一份要同步的
 * 副本，而 `AssistantOperatorEvent` 已经在入口处校验过了。
 *
 * ⚠ 一条纪律：**线程条目一律带 `id`**。日志条的 `running` → `done` 是**同一个
 * id 的两次事件**（见 `constants/assistant-operator.ts` 的 `step` 注释），客户端
 * 按 id 覆盖；漏了 id 就变成追加，表现是每一步在日志流里出现两遍。
 */

import type { StudioOperatorResumeStep } from '@/types/studio-operator-resume'
import type { ContextCardKindId } from '@/constants/context-cards'
import type { ContextCardImage } from '@/types/context-cards'
import type {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ProjectRuleSourceId,
} from '@/constants/assistant-operator'
import type {
  StudioOperatorConfirmStatus,
  StudioOperatorField,
  StudioOperatorSystemCode,
} from '@/constants/studio-assistant-operator'
import type {
  AssistantOperatorAppliedStep,
  AssistantOperatorAskEvent,
  AssistantOperatorContextCardDraft,
  AssistantOperatorCritiqueStep,
  AssistantOperatorGenerationRequest,
  AssistantOperatorLoraPickConfirm,
  AssistantOperatorPlanAnswer,
  AssistantOperatorPlanOption,
  AssistantOperatorPlanQuestion,
  AssistantOperatorRoundSummary,
  AssistantOperatorStep,
  AssistantOperatorWorkingMemoryArtifact,
} from '@/types/assistant-operator'

/** 用户说的话（含本地附件的展示名）。 */
export interface StudioOperatorUserEntry {
  kind: 'user'
  id: string
  text: string
  attachments: readonly StudioOperatorAttachment[]
}

/**
 * 助手说的话。
 *
 * ⚠ `streaming` 为真且 `text` 为空 = **发送即回显**的那条助手占位行（§4.1），
 * 面板据此画三点脉冲。`streaming` 为真且已有字 = 收尾轮还在写，按 id 覆盖加长。
 * ⚠ 定稿帧（`message` 且非 partial）到达时按条目 id **整体覆盖**这一条，⛔ 不追加（§13.1）。
 */
export interface StudioOperatorMessageEntry {
  kind: 'message'
  id: string
  text: string
  streaming?: boolean
  /**
   * 「为什么」那一段（2026-09-06 面板轮）。
   *
   * ⭐ 正文只留两句，**解释折起来**：聊天感的一半就在这里 —— 助手把结论说完
   * 就停，想读理由的人自己点开。⛔ 别把它并进 `text`：并进去之后「两句」这条
   * 约束在结构上就没有落点了，只能靠模型自觉。
   * ⚠ 缺席 = 这一条没有可展开的解释，⛔ 不画一颗点开是空的「为什么」。
   */
  detail?: string
}

/** 计划条（一轮最多一条）。 */
export interface StudioOperatorPlanEntry {
  kind: 'plan'
  id: string
  steps: readonly string[]
  /**
   * 逐项进度（D12 S9）——这份计划在跑（有续跑记录）时才有，与 `steps` 同序。
   * ⭐ 住在条目上而不是只看续跑记录：计划跑完那份记录就清掉了，打过的勾得留着。
   */
  progress?: readonly StudioOperatorResumeStep['state'][]
}

/**
 * 一条日志。`step` 就是服务端那份契约本身 —— 不再转译一层：转译层是 P1 与 P2
 * 之间最容易漂的地方，而 `tool` 的判别联合已经把每一支该有什么字段说清楚了。
 */
export interface StudioOperatorStepEntry {
  kind: 'step'
  id: string
  step: AssistantOperatorStep
  /**
   * 这一条属于**哪一轮**（P3-C 的「还原这轮」按它成组）。
   *
   * ⚠ 显式存一份，⛔ 别去劈 `id`（它是 `runKey:stepId` 拼的）：那种字符串手术
   * 会在 runKey 里哪天多一个冒号时静默失效，而表现是「还原这轮什么都没还原」。
   */
  runKey: string
  /** 用户点了撤销 —— 条目划线，且**不再计入改动数**。 */
  undone: boolean
}

/**
 * 系统行 —— 「你撤销了：××（助手已知晓）」（拍板 18）。
 *
 * ⚠ 它不只是给人看的：撤销后的下一次请求会把这条也带进 `priorSteps` 的语境里，
 * 所以助手**不会下一轮又把它改回来**。只画线不通报是本条最容易漏的一半。
 */
export interface StudioOperatorSystemEntry {
  kind: 'system'
  id: string
  /**
   * i18n 键的后缀（`StudioOperator.system.*`），文案不在这里落地。
   *
   * ⚠ `urlImportFailed` 是**拍板 22 的失败面**（P3-D）：助手接下了用户递来的
   * 链接、日志条已经写着「已挂上」，而取图那一跳在几秒后失败了。没有这一行的话
   * 界面上就是「说挂上了，参考位却是空的」—— 本仓最难查的那一类。
   *
   * ⚠ 值域住在 `constants/studio-assistant-operator.ts`（`STUDIO_OPERATOR_SYSTEM_CODES`）
   * 而不是就地写一个联合：落库的历史条目要用同一张表做 `z.enum()` 校验（P4-B），
   * 两份会分叉。
   */
  code: StudioOperatorSystemCode
  /** 填进文案的那个名字（被撤销的那一步 / 字段）。 */
  subject?: string
  count?: number
  /**
   * ⭐ **这一行同时是一条 user 消息**（v2 §3.4 落账规则，2026-09-12 真机 bug）。
   *
   * 问题卡答完之后时间线上只有一行「你选了 X」，而那一行不进 `messages`；
   * `planAnswers` 又只跟着**当次**请求走 —— 于是第三轮开始，「用户已经答过」
   * 这件事对模型彻底不存在（真机：2D 手绘 vs 3D 渲染被问了三遍）。
   * 这一格写的是**自带题面的那句话**（`已选择「X」（针对问题「Y」）`），它
   * 进 `messages`、进库、刷新之后还在；渲染照旧是那一行系统行（⛔ 不画成气泡）。
   * ⚠ 缺席 = 普通系统行。
   */
  userText?: string
  /** 同一件事的结构化那一半 —— 服务端用它渲染「已经定下来的」那一段。 */
  answered?: AssistantOperatorPlanAnswer
}

/**
 * 助手引用了一条项目规则（§2.21 / §10，拍板 23）—— 时间线里那张规则薄卡。
 *
 * ⚠ 它是**线程条目**而不是钉在流末尾的那一类（计划 / 花钱 / 反问三张卡）：规则薄卡
 * 说的是「刚才那一步是照着这条规则做的」，贴在那一步下面才有意义，飘到最后就成了
 * 一句没有出处的话。
 * ⚠ 原文 / 日期由服务端填（`rule_hit` 事件），⛔ 不是模型转述的那一版。
 */
export interface StudioOperatorRuleEntry {
  kind: 'rule'
  id: string
  ruleId: string
  text: string
  source: ProjectRuleSourceId
  /** ISO 串；薄卡上只显示日期段。 */
  createdAt: string
}

/** 切域标记（拍板 8：切域换工具不断会话）。 */
export interface StudioOperatorDomainMarkEntry {
  kind: 'domainMark'
  id: string
  domain: string
}

/**
 * **结果卡**（v2 §6，commit #10）—— 时间线里那一张「这一批出来了」。
 *
 * ⭐ **没有审核态**（§6.1 / 决策 12）：生成一律自动入库，卡上写的是
 * `已入库` 而不是一道要人点的二元判断。⛔ 别把 `reviewState` 加回这个形状 ——
 * 那一档要求用户在「刚看到图」这个最没耐心的时刻表态，实测绝大多数人直接跳过，
 * 留着一个没人点的控件只会让「这张我否过」这条语义看上去存在、实际不可靠。
 *
 * ⚠ `items` 为空且 `total > 0` = **生成中那一态**（§6.3）：占位格数 = `total`，
 * 「正在出图 · {completed} / {total}」的分子是 `completed`。⛔ 别用第二个
 * `status` 字段说同一件事 —— 两处会分叉，而分叉的表现是「图都出来了还在转」。
 * ⚠ `request` 是「再来一组」的本钱（§6.2）：它原样变成下一张生成确认卡的载荷，
 * 缺席时那颗按钮不画（⛔ 不摆一颗点了没反应的）。
 */
export interface StudioOperatorResultEntry {
  kind: 'result'
  id: string
  /** 这一批要出几张 —— 占位格数与「1 / 3」的分母。 */
  total: number
  /** 已经落地几张 —— 「1 / 3」的分子。 */
  completed: number
  /** 跑完且入库的那些；生成中是空数组。 */
  items: readonly StudioOperatorResultItem[]
  /** 卡上那句摘要（一般是提示词头几个字 / 助手给这一枪起的名字）。 */
  summary?: string
  /** 入库时刻（ISO 串）—— 卡上「已入库 · 11:26」写它；生成中缺席。 */
  storedAt?: string
  /** 「再来一组」原样重发的那份载荷（§6.2）。 */
  request?: AssistantOperatorGenerationRequest
}

/**
 * **宿主那条在飞的结果回流**（commit #10）—— 结果卡的数据源。
 *
 * ⭐ 与 `StudioOperatorHost.results` 的分工：那一份是「@ 选择器能挑哪几张」
 * （只收跑完的），这一份还要说得出**没跑完的那几张**，否则 §6.3 的占位格数与
 * 「1 / 3」在结构上算不出来。
 * ⚠ `settled` 由宿主判（每一条都有了终局），⛔ 不由消费端拿 `completed + failed
 * === total` 再算一遍：取消掉的那些两边都不计，自己算会永远差一条。
 */
export interface StudioOperatorResultRun {
  total: number
  completed: number
  failed: number
  settled: boolean
  items: readonly StudioOperatorResultItem[]
  /** 挂掉的那几条里第一条的原因（人话，如服务商审核未通过）—— 整批没出时念给用户。 */
  failureReason?: string
}

/**
 * **本轮结论记录**（v2 §7.2 / §7.7，commit #13）—— 时间线里那条全宽分隔块。
 *
 * ⭐ 它是**一轮的收口**而不是第六类卡：服务端在 `done` 帧里把本轮压成四栏
 * （事实 / 决定 / 待办 / 证据编号）一起下发，客户端**直接渲染，不再请求一次**
 * （§7.5 ④）。所以它落进线程的时刻天然就是「该轮最后一条之后」——
 * ⛔ 别去倒着找「这一轮的最后一条」再插进去：那种位置计算会在用户于流末尾
 * 插话时把分隔块夹到下一轮里。
 *
 * ⚠ `summary.roundIndex` 是**服务端定的号**（`appendAssistantConversationRound`），
 * 编辑回写按它定位库里那一条 —— ⛔ 别拿条目 id 去回写：条目 id 是本次页面加载
 * 现造的，刷新之后对不上任何一条。
 * ⚠ **不进 `messages`**（`toOperatorHistoryEntry` 返回 null）：它住在
 * `AssistantConversation.rounds` 那一列，写两份的下场是编辑回写改了一份、
 * 刷新之后读到的是另一份。
 */
export interface StudioOperatorRoundSummaryEntry {
  kind: 'roundSummary'
  id: string
  summary: AssistantOperatorRoundSummary
}

export type StudioOperatorThreadEntry =
  | StudioOperatorUserEntry
  | StudioOperatorMessageEntry
  | StudioOperatorPlanEntry
  | StudioOperatorStepEntry
  | StudioOperatorSystemEntry
  | StudioOperatorRuleEntry
  | StudioOperatorResultEntry
  | StudioOperatorRoundSummaryEntry
  | StudioOperatorDomainMarkEntry

/**
 * 改动登记簿的一格。
 *
 * ⭐ **按字段存，不是按步存**：同一个字段被改两次时，用户要撤的是「助手对这个
 * 字段做过的事」，一路回到他自己写的那版 —— 所以 `inverse` 始终保留**最早那次**
 * 的逆操作（`firstInverse`），而 `stepId` / `reason` 跟着最近一次走（归属标记
 * 上要显示的是「它最后为什么这么改」）。
 * 只留最近一次的 inverse，撤销会停在助手的中间版本上，用户以为撤了其实没撤干净。
 */
export interface StudioOperatorChange {
  field: StudioOperatorField
  /** 最近一次改它的那一步 —— 归属标记点进去能定位到日志条。 */
  stepId: string
  /** 最近一次的理由（hover 显示）。 */
  reason?: string
  /** 最早那次的逆操作载荷 —— 撤销的本钱。 */
  firstInverse: AssistantOperatorAppliedStep
  /** 助手改之前那个字段长什么样（hover 里显示「原值」）。 */
  previousLabel: string
  /**
   * 提示词 / 负面这两格：助手**最近一次写完之后**整格的原文。
   * ⭐ 登记簿跨「新对话」留着，这一格让新会话也认得「框里这段是助手写的」——
   * 否则开新会话第一件事就是问「你已经自己写过了，怎么办」（2026-09-24 真机）。
   */
  writtenText?: string
}

/**
 * 📎 挂在下一条消息上的附件（P2 只做素材库就地挂载，上传/粘贴是 P3）。
 *
 * ⚠ `kind` 覆盖**素材库里真实存在的四种**，不是只有图与视频：拍板 20 之后
 * 「打开完整素材库」是就地弹层而不是跳页，弹层没有按类型上锁（锁 = 不渲染，
 * 那会让 6 格里看得见的视频在完整库里消失），所以用户点得到音频与 3D。
 * 收窄到两种的下场是 `as` 一个谎进来，或者点了没反应。
 *
 * ⚠ `thumbnailUrl` 与 `url` 必须分开：视频 / 音频的 `url` 是媒体文件本身，
 * 拿它喂 `next/image` 只会得到一个碎图标（P2 半成品里就是这样）。没有缩略图时
 * 这里给 `undefined`，宿主画一枚类型字形 —— ⛔ 别回落到 `url`。
 */
export interface StudioOperatorAttachment {
  id: string
  url: string
  label: string
  kind: 'image' | 'video' | 'audio' | 'model3d'
  /** 能拿来当预览的静态图；没有就没有。 */
  thumbnailUrl?: string
  /**
   * 这一条的产物序号（`Generation.seq`，切片 N1）。
   *
   * ⚠ 正文里的 `@图_012` **只按它比**（`matchGenerationMention`），也只按它随
   * `mentionedAssets` 上服务端。缺席 = 这一行没有号（存量行 / 上传来的行），
   * 于是永远不会被 `@序号` 命中 —— ⛔ 不从 id 派生一个：算出来的号会去撞别人的
   * 真号。用户照旧能从选择器点它上来，那条路不经过名字。
   */
  seq?: number | null
}

/**
 * 一件**还没变成附件**的上传（P3-A，拍板 16 的上传三通道）。
 *
 * ⭐ **它与 `StudioOperatorAttachment` 是两个类型，不是一个类型的两个状态** ——
 * 这是本片最重要的一条结构约束：附件必须有 `url`，而在飞的上传只有一个
 * `blob:` 的本地预览。把两者合成一个「带 `status` 的附件」，那个 blob URL 就会
 * 跟着 `send()` 进消息体，助手拿到一个它永远取不到的地址（台账 BG 那条 413 的
 * 近亲：区别只是这次它连 4.5MB 都不到，就是纯粹的错）。
 * 分开之后这件事**在类型上不可能发生**：只有拿到 https URL 的那一刻，它才被
 * 转成 `StudioOperatorAttachment` 进入附件数组 —— 与素材库挑的那些同一条链。
 *
 * ⚠ 没有 `done` 这一档：成功即出列（变成附件）。留一个 `done` 只会制造
 * 「chip 出现了两次」这种要靠去重来修的问题。
 */
export interface StudioOperatorUpload {
  id: string
  /** chip 上写的名字 —— 上传阶段只有文件名可写。 */
  fileName: string
  kind: 'image' | 'video' | 'audio'
  /**
   * 本地 `URL.createObjectURL()` 的预览图（只有图片有）。
   * ⛔ 它**只用于渲染**，绝不进消息体 —— 见上面那段。
   */
  previewUrl?: string
  /** 0–100，来自 R2 直传的 XHR 真进度（不是假动画）。 */
  progress: number
  status: 'uploading' | 'error'
  /** 失败原因 —— 大声说出来，⛔ 不静默丢掉。 */
  error?: string
}

/**
 * 排在队里、**还没发出去**的那一句（§3.1 ㉒–㉔，本片）。
 *
 * ⭐ 它与 `StudioOperatorUserEntry` 是两个类型，理由与上传/附件那一对同源：
 * 进了线程的那条是「已经说出去的话」（助手的上下文里有它），排队的这条**还没有**
 * 任何人看见。合成一个「带 pending 旗标的用户条目」的下场是它会被 `buildMessages`
 * 一起送进请求 —— 用户看着排队条还挂在那儿，助手却已经在回答它了。
 * ⚠ 附件跟着排队一起等：排的时候挂了三张图，接住时得连图一起进那条消息。
 */
export interface StudioOperatorQueuedMessage {
  id: string
  text: string
  attachments: readonly StudioOperatorAttachment[]
}

/**
 * 结果行卡里的一格（§11.4「结果行卡」）。
 *
 * ⚠ 只留渲染要用的那几样，⛔ 不把 `RunItem` 整条塞进来：那条身上挂着
 * `generation` 全量记录（含 snapshot / observability），而这张卡只画缩略图与序号。
 * ⚠ `thumbnailUrl` 与 `url` 分开，理由同 `StudioOperatorAttachment`：视频的 `url`
 * 是媒体文件本身，喂给 `next/image` 得到一个碎图标。
 */
export interface StudioOperatorResultItem {
  id: string
  url: string
  thumbnailUrl?: string
  /** chip 与灯箱标题上写的那句（一般是提示词头几个字）。 */
  label?: string
  /**
   * 产物序号（`Generation.seq`，切片 N1）—— 格子左上角那枚角标写的就是它。
   * ⚠ 缺席 = 这一格没有号，于是**不画角标**（⛔ 不编一个：编出来的号与真号
   * 长得一模一样，而用户照着它打的 `@` 会落到别人头上）。
   */
  seq?: number | null
  /** 角标前缀按它分（`图_` / `视频_`）。缺席按图算。 */
  outputType?: string | null
}

/**
 * 反问卡的三样东西 —— **契约住在 `types/assistant-operator.ts`**（2026-09-06 面板轮）。
 *
 * ⭐ 这里只留三个别名：那一份是 Zod（跨进程边界要运行时校验），面板这一侧要的
 * 只是同一个形状的静态类型。⛔ 不在这里再抄一份 interface —— 两份形状迟早会分叉，
 * 而分叉的表现是「服务端明明发了 `description`，卡上就是不显示」。
 */
export type StudioOperatorQuestionOption = AssistantOperatorPlanOption
export type StudioOperatorQuestion = AssistantOperatorPlanQuestion
export type StudioOperatorQuestionAnswer = AssistantOperatorPlanAnswer

/**
 * **问题卡**（v2 §3.2 / §3.4）—— 五类卡里唯一**不进时间线**的那一张。
 *
 * ⭐ 它钉在**输入框上方**：未答的问题是当下唯一挡路的东西，滚走了就等于问了个
 * 寂寞。答完之后卡消失，时间线里落一行「问题 · 你选了 X」（系统行）。
 * ⚠ 一次只有一张（§3.4「一次只问一个」）：模型想问两件事就分两轮。
 * ⚠ `overwrite` 是**覆盖手写那一支的回执路由**（`ask` 帧上那一块）：三选答完之后
 * 要按 `field` 原样带回服务端（`confirmations`），而问句本身说不出「改的是哪一格」。
 * 缺席 = 这道题不是覆盖三选。
 * ⚠ `resolved` 住在 store 不住在卡里：收放法则（拍板 7）随时会把面板卸载。
 */
export interface StudioOperatorQuestionPrompt {
  id: string
  /**
   * 这一组题（1–4 道，56b 切片 4）。⚠ 顺序即提问顺序，⛔ 不重排。
   *
   * ⭐ 「一次一题」现在是**界面的事**而不是帧的事：问题块一次只画一道，带
   * 「1 / 3」进度，答完自动进下一题。帧带整组的理由见
   * `AssistantOperatorAskEventSchema` 的头注。
   */
  questions: readonly StudioOperatorQuestion[]
  /**
   * 已经答完的那几道（按题序）。
   *
   * ⭐ **当前是第几题 = `answers.length`**，⛔ 不另存一个 `index`：两份会分叉，
   * 而分叉的表现是「上一题」点下去回到了一道已经答过的题的下一道。
   * ⚠ 它们**还没进时间线**：进时间线是整组答完那一刻的事（见
   * `answerQuestion`）。这样「← 上一题」只要 pop 一格，⛔ 不用从线程里删条目。
   */
  answers: readonly StudioOperatorQuestionAnswered[]
  /** 「为什么问这一句」—— 一行小字，缺席就不画。 */
  why?: string
  overwrite?: NonNullable<AssistantOperatorAskEvent['overwrite']>
}

/**
 * 问题块里**已经答完的一道**（56b 切片 4）。
 *
 * ⚠ `label` 是小标签上写的那句（「6 镜」/「6 镜 · 前 3 镜慢一点」），
 * `answer` 是要原样上服务端的那一份 —— 两者分开是因为前者是给人读的、后者是
 * 契约，⛔ 别让渲染去从契约里拼一句话。
 */
export interface StudioOperatorQuestionAnswered {
  /** 题头那几个字 —— 小标签左边那半截。 */
  header: string
  label: string
  answer: AssistantOperatorPlanAnswer
}

/**
 * **确认卡**（v2 §3.3）—— 两种来源，一张卡。
 *
 * ⛔ **没有第三种**：花费确认删除（决策 8），覆盖手写降级成问题卡（§3.1）。
 * ⚠ `multistep` 带 `steps`、`generate` 带 `request`：两支的必填字段互不相容，
 * 所以走判别联合而不是把两边都做成可选 —— 可选的下场是卡要去处理「既没有步
 * 也没有载荷的确认」。
 * ⚠ `status` 住在 store（见 `STUDIO_OPERATOR_CONFIRM_STATUS_IDS` 的头注）。
 */
export type StudioOperatorConfirmPrompt = {
  id: string
  status: StudioOperatorConfirmStatus
  /** 已确认 / 已取消那一态的时刻（ISO 串）—— 卡上「已确认 · 11:24」写它。 */
  decidedAt?: string
  /**
   * 这一张是**自动生成开关**替你按下的（D12 S-C）—— 收起那一行写「已自动生成」。
   * ⚠ 扳机仍在客户端：服务端没有任何工具能建 generation。
   */
  auto?: boolean
} & (
  | {
      kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
      steps: readonly { id: string; label: string }[]
    }
  | {
      kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
      request: AssistantOperatorGenerationRequest
    }
  /**
   * 助手提议记一张上下文卡（v2 §8.1）—— 卡上摆的是**草稿本身**（档 / 名字 /
   * 一句话 / 正文），两颗按钮是「存这张卡 / 不用」。
   * ⚠ 服务端那一侧一行库都不写；**客户端**收到这一帧就把它写成一行
   * `status: 'proposed'`（owner 2026-09-11：没当场点的提议要能在设置里补点）。
   */
  | {
      kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
      card: AssistantOperatorContextCardDraft
      /**
       * 那一行 `proposed` 的 id（§8.1）。
       *
       * ⚠ **可以缺席**：写 proposed 那一跳失败了卡照旧可存可弃 —— 缺席时
       * 「存这张卡」回落成 `create confirmed`，「不用」什么都不用删。
       */
      cardId?: string
    }
  /**
   * 助手把本轮 LoRA 候选摆出来等创作者勾（lora-assistant §10.1）—— 卡上摆的是
   * **候选本体**（一把一行：封面 / 名字 / 家族圆点 / 默认权重 / 触发词），
   * 一颗主按钮是「挂载所选」。
   * ⚠ 与 `contextCard` 那支同构：服务端到这一帧为止一把都没挂，挂载发生在带
   * `loraPicks` 重发的下一轮。
   * ⚠ 勾中的是哪几把由**卡自己的组件态**持有，⛔ 不进这份 prompt：这份是
   * 「帧带来的东西 + 已决没决」，而勾选是一次还没提交的编辑（与生成确认卡
   * 那四颗旋钮不存自己的参数同一条判据）。
   */
  | {
      kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick
      pick: AssistantOperatorLoraPickConfirm
    }
)

/**
 * **一个模型能给的那三串可选值**（v2 §5.1「取值来源」那一列）。
 *
 * ⭐ 名单是**客户端从模型表现算**的（`constants/models` / `provider-capabilities`
 * / `video-model-send-plan` 那三张表），⛔ 不由服务端随 `confirm` 帧下发：卡上
 * 换一次模型要立刻换出另一串可选值，而那一刻没有任何一次网络往返。
 * 这也是 `confirm` 的载荷**只带当前值**、不带候选表的理由（§5.1 + 台账：载荷里
 * 多一张随模型变的表，只会与工作台上那张随时漂开）。
 * ⚠ 空数组 = 这个模型**没有这颗旋钮**（视频档大量如此），卡上那一颗就不画 ——
 * ⛔ 别回落成一串写死的全集，那会让人选一个这条线路根本不吃的值。
 */
export interface StudioOperatorGenerationChoices {
  aspectRatios: readonly string[]
  resolutions: readonly string[]
  counts: readonly number[]
}

/**
 * **生成确认卡四颗旋钮的真值视图**（v2 §5.2「工作台是真值，卡是它的一个可编辑
 * 视图」）。
 *
 * ⭐ 它由**宿主**现算（`use-studio-workbench-operator-host.ts`），随表单一起变 ——
 * 这正是 §5.2 第三行「卡未确认时用户改工作台，卡上对应项跟着变」的落点：卡不存
 * 任何一份自己的参数，⛔ 没有 `useState`。
 * ⚠ `choicesByModel` 的键与 `models[].id` 逐字同源：图片档是 `modelId`，视频档是
 * `optionId`（型号 × 渠道，K-3）—— 与快照 `availableModels` 那条判据同一份。
 * ⚠ 缺席（宿主不给）= 这个宿主上的卡还是只读读数（LoRA 装配台就是这一档）。
 */
export interface StudioOperatorGenerationControls {
  model: { id: string; label: string } | null
  models: readonly { id: string; label: string }[]
  aspectRatio: string
  resolution: string | null
  count: number
  choicesByModel: Readonly<Record<string, StudioOperatorGenerationChoices>>
}

export type StudioOperatorStatus =
  /** 没在跑。 */
  | 'idle'
  /** 流开着。 */
  | 'working'
  /**
   * 流停在**计划卡**上，等用户按「开始 / 修改」（§4.1 新增态，切片 3a）。
   *
   * ⚠ 与 `awaitingConfirm` **分开**：那一档说的是「有一件事等你拍板才能继续」，
   * 这一档说的是「一整轮还没开始跑」。合成一档的表现是图标轨上「待确认」与
   * 「待你定」永远只剩一种说法，而两者的下一步动作完全不同（§4.1 图标轨那一行）。
   * ⚠ 输入框在这一档**仍可打字**（§4.1）：用户可以不理那张卡，直接改口。
   */
  | 'awaitingPlan'
  /** 流停在就地确认 / 花钱确认 / 歧义反问上，等用户选（拍板 3 / §6 / §7）。 */
  | 'awaitingConfirm'
  /** 这一轮失败了 —— 线程里已经有一条错误消息。 */
  | 'error'

/**
 * 错误条第二、三段要的那两样（owner 2026-09-20 真机第 1 条）。
 *
 * ⭐ 与 `errorText`（第一段，那句人话）**分开存**：人话是按 `errorCode` 取的三语
 * 文案，这两样是服务端给的诊断数据，两者的来源和寿命都不同。合成一个字符串的
 * 下场是「复制详情」只能把已经翻译过的那句话再抄一遍。
 * ⚠ `detail` **只有非生产环境才有**（成帧器那一侧判，见事件 schema 头注）——
 * 客户端 ⛔ 不自己判环境，有就画、没有就不画。
 */
export interface StudioOperatorErrorTrace {
  traceId: string
  detail?: string
}

/**
 * ─── 视频域评审卡：两支载荷的分岔（第二期）───────────────────────────
 *
 * 契约那边 `critique_result` 的 payload 与 result 都是 **union**（图片档 /
 * 视频档，见 `types/assistant-operator.ts`）。卡片需要的只是「这条是哪一支」，
 * 而 TS 的 `in` 收窄一步就够 —— ⛔ 不再抄一份结构读取器：那会让同一件事有两个
 * 判据，而其中一个（结构读取）看不见 schema 的变化。
 */

/** 视频档的结果那一支 —— `frames` 是它独有的必填字段。 */
export function isVideoCritiqueResult(
  result: NonNullable<AssistantOperatorCritiqueStep['result']>,
): result is Extract<
  NonNullable<AssistantOperatorCritiqueStep['result']>,
  { frames: unknown }
> {
  return 'frames' in result
}

/** 视频档的载荷那一支 —— `videoUrl` 是它独有的必填字段。 */
export function isVideoCritiquePayload(
  payload: AssistantOperatorCritiqueStep['payload'],
): payload is Extract<
  AssistantOperatorCritiqueStep['payload'],
  { videoUrl: string }
> {
  return 'videoUrl' in payload
}

/**
 * 工作记忆里那一件 —— **契约那份的别名**（同反问卡三个别名的判据）。
 *
 * ⛔ 不在这里抄一份 interface：这一份是要**原样进请求**的，抄一份的下场是
 * 客户端攒出一个服务端 schema 拒收的形状，而拒收发生在运行时。
 */
export type StudioOperatorMemoryArtifact =
  AssistantOperatorWorkingMemoryArtifact
