'use client'

/**
 * 操作员面板的**模块级状态**（`useSyncExternalStore` 背书）。
 *
 * ── 为什么不是 context ─────────────────────────────────────────────
 * 这份状态有**两棵组件树的消费者**：右边的覆盖层（线程 / 日志 / 胶囊）和左边
 * 参数栏里的归属标记（✦ 与就地确认条，长在提示词框底下）。用 context 就得在
 * `StudioWorkspaceUI` 之上再套一个 Provider，而那正是 `studio-context.tsx`
 * （47 个文件的高危件）所在的层 —— 本片的护栏是「能不动它就不动」。
 * 模块 store 是本仓既有的同类做法（`use-studio-assistant-controls.ts` /
 * `StudioAssistantDock` 的宽度记忆），工作台本身是单例，不存在多实例串台。
 *
 * ⚠ **快照必须是稳定引用**：`getSnapshot` 每次返回新对象会让
 * `useSyncExternalStore` 判定「变了」而无限重渲染。所以这里只有一个 `state`
 * 变量，改动一律「造一个新对象整体替换」，读永远读那一个。
 */

import { useSyncExternalStore } from 'react'

import {
  ASSISTANT_MENTION_LIMITS,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import {
  ASSISTANT_CHAT_MODE_IDS,
  ASSISTANT_PROTOCOL_DOMAIN_IDS,
  type AssistantChatMode,
} from '@/constants/assistant-protocol'
import type { AssistantPersonaPlanMode } from '@/constants/assistant-persona'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import type { GenerationReviewState } from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_STREAMING,
  type StudioOperatorConfirmStatus,
  type StudioOperatorField,
} from '@/constants/studio-assistant-operator'
import {
  clearOperatorResume,
  createResumePlan,
  markResumeStep,
  readOperatorResume,
  writeOperatorResume,
} from '@/lib/studio-operator-resume'
import { mentionFromAttachment, mentionKey } from '@/lib/assistant-mention'
import type {
  AssistantMention,
  AssistantMentionScope,
} from '@/types/assistant-mention'
import type {
  StudioOperatorResumePlan,
  StudioOperatorResumeStep,
} from '@/types/studio-operator-resume'
import type {
  StudioOperatorAttachment,
  StudioOperatorChange,
  StudioOperatorConfirmPrompt,
  StudioOperatorErrorTrace,
  StudioOperatorMessageEntry,
  StudioOperatorMessageVoice,
  StudioOperatorQuestionPrompt,
  StudioOperatorQueuedMessage,
  StudioOperatorResultEntry,
  StudioOperatorStatus,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'
import type {
  AssistantOperatorBenchOpen,
  AssistantOperatorMissingKey,
  AssistantOperatorRoundSummary,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import {
  ASSISTANT_SURFACE_IDS,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'
import type {
  StudioOperatorHistoryEntry,
  StudioOperatorPending,
} from '@/types/studio-operator-history'
import type { AssistantWorkspace } from '@/types/assistant-workspace'

interface StudioOperatorWorkbenchFields {
  changes: Readonly<Partial<Record<StudioOperatorField, StudioOperatorChange>>>
  primed: boolean
}

/** 以前聊天会话的对象（附录L）：只读那条要名字去找她的配音间。 */
export interface StudioOperatorChatCharacter {
  id: string
  name: string
  /** 和她聊时你在故事里是谁（存在卡上，附录L 第二片 C）；缺席 = 没写。 */
  userRole?: string
}

export interface StudioOperatorState {
  status: StudioOperatorStatus
  /** 现在在哪个域 —— 头部 chip 与线程里那条域标记读的是同一个值。 */
  domain: AssistantOperatorDomain
  /**
   * 从库里载回来的那一段**只读历史**（P4-B）。
   *
   * ⭐ 与 `entries` **是两个数组，不是一个数组的两段**：历史条目在类型上就装不下
   * `inverse` / `payload`（见 `types/studio-operator-history.ts`），所以「刷新之后
   * 冒出一颗点了会做错事的撤销钮」在结构上不可能发生。合成一个数组就得给条目加
   * 「这条是历史」的旗标，而旗标是会被漏判的。
   * ⚠ 渲染顺序永远是 history 在前、entries 在后。
   */
  history: readonly StudioOperatorHistoryEntry[]
  /** 这条线程在库里的行；`null` = 还没落过库（下一次保存会新建一行）。 */
  sessionId: string | null
  localThreadId: string
  saveFailed: boolean
  /** 当前会话的存储 surface；具体工作区归属由 threadScope 决定。 */
  sessionSurface: AssistantSurfaceId | null
  entries: readonly StudioOperatorThreadEntry[]
  /** 改动登记簿 —— 按字段存，见 `StudioOperatorChange` 的头注。**当前域的那一份。** */
  changes: Readonly<Partial<Record<StudioOperatorField, StudioOperatorChange>>>
  /** 生成键是否被预填亮起（拍板 2）。**当前域的那一份。** */
  primed: boolean
  /** 已经跑完的步数 / 计划里说要跑几步 —— 胶囊上「干活中 3/7」的两个数。 */
  stepsDone: number
  plannedSteps: number
  /** 这一轮失败了的话，说了什么。 */
  errorText: string | null
  /**
   * 那次失败的诊断两样（`traceId` / 非生产环境的原始 message）。
   * ⚠ 缺席 = 服务端没给（`GenerationError` 那一族自带码与 i18nKey，不需要短码）。
   */
  errorTrace: StudioOperatorErrorTrace | null
  /**
   * 那次失败的错误码 —— 面板据此决定错误条上要不要一颗动作键（缺 key → 「配置 Key」，
   * Hard Rule 8）。⚠ 文案仍走 `errorText`，⛔ 不按码在面板里另取一份。
   */
  errorCode: string | null
  /**
   * 助手选定的那个模型缺 key 时，缺的是哪一家、哪个型号（owner 2026-10-15）—— 错误条上那颗
   * 「配置 X 的 key」就地开的就是这一家的 `QuickSetupDialog`。其余失败都是 `null`。
   */
  errorMissingKey: AssistantOperatorMissingKey | null
  /**
   * 排着队、还没发出去的那些话（§3.1 ㉒，本片）。
   *
   * ⭐ **住在 store 不住在面板**：面板会被收放法则（拍板 7）随时卸载，而排队条
   * 的整个意义是「你说的话没丢，下一个停顿点就处理」—— 收一下面板它就丢了的话，
   * 这条承诺是假的。同时驱动 hook 要在**事件处理器里同步读它**（`getOperatorState()`），
   * 那正是这份 store 存在的理由（见 `getOperatorState` 头注）。
   * ⚠ **跨域不分槽**：排队的是「用户说的话」，与他此刻站在哪台工作台无关。
   */
  queue: readonly StudioOperatorQueuedMessage[]
  /**
   * `@` 引用的**登记表**（统一引用模型，设计方案 §10b）。
   *
   * ⭐ 正文里只存 `<@kind:id>`，名字 / 缩略图 / scope / nodeId 住在这里 —— 「这条
   * 消息带了哪几条引用」的真值是**正文里的记号**，这张表只负责把记号翻译回东西。
   * 登记了但正文里已经删掉的那几条不算数（`resolveDraftMentions` 只看正文）。
   * ⚠ 住在 store：它属于**还没发出去的那条消息**（与草稿同命，收放法则会卸载面板）。
   */
  mentions: readonly AssistantMention[]
  /**
   * 外面递进来、还没写进正文的那几条的键（「问助手」/ 拖进来 / 用它当参考 / 歧义单选）。
   * 面板挂着时立刻把它们接到正文末尾（`takeOperatorMentionInbox`）；收着时就等它
   * 下次挂上来。
   */
  mentionInbox: readonly string[]
  /**
   * **自动生成开关**（D12 S-C）—— 开着时助手改完出图相关的卡就直接摆生成，
   * 确认卡一到由客户端替你按下（单轮张数上限见 `ASSISTANT_AUTO_GENERATE_LIMITS`）。
   *
   * ⭐ 跟着**工作台**走（owner 2026-10-14 改定，替掉 09-23 的「只管当前会话」）：
   * 新对话、换一段会话、刷新都保留；按 `threadScope` 记在本机（`readAutoGenerate`）。
   * ⚠ 钱闸不变：扳机仍是客户端这一下，服务端没有任何工具能建 generation。
   */
  autoGenerate: boolean
  /** 用户、工作区和项目共同决定的作用域；null 时不得持久化。 */
  threadScope: string | null
  /**
   * 结果行卡上被点中的那一格（§4.2「结果行卡：未选 / 已选 / 被 @」）。
   *
   * ⚠ 存 id 不存整条：那一批的内容来自宿主的在飞回流，每次轮询都是新对象，
   * 存整条会在下一次轮询后指向一份陈旧的记录。
   */
  selectedResultId: string | null
  /**
   * **还在出图的那张结果卡**的条目 id（v2 §6.3，commit #10）。
   *
   * ⭐ 卡在「确认生成」那一刻就落进时间线（生成中态），宿主的回流随后往它身上
   * 写张数与缩略图。记一个 id 是为了让回流那一侧**找得到该改哪一条** ——
   * ⛔ 别去线程里倒着找最后一条 `result`：用户在等图的这段时间里照样可以说话，
   * 而「最后一条」随时会变成别的东西。
   * ⚠ 结账（全部落地 / 全挂了）之后清回 `null`：留着它，下一批的进度会写进上一
   * 张卡里。
   */
  pendingResultId: string | null
  /**
   * persona 的「默认行为」（§8.2 `planMode`）—— **store 里存一份的唯一理由**是
   * 驱动 hook 要在事件处理器里同步读它（`getOperatorState()`），而 persona 是
   * 一次异步拉取的结果。
   *
   * ⚠ ⛔ 别在驱动 hook 里再调一次 `useAssistantPersona()`：那会在同一棵树上开出
   * 第二个 `GET /api/assistant/persona`，两份数据还会各说各话。外壳拉一次、
   * 写进来一次，读的人都读这一个。
   */
  planMode: AssistantPersonaPlanMode
  /**
   * 钉在流末尾的三张「等你定」的卡（§4.1）。
   *
   * ⚠ 三张各自最多一张，且**跨域不分槽**：它们属于「此刻这条流停在哪儿」，而流
   * 本来就只有一条。切域时由驱动 hook 一起清（同 `confirm` 的理由）。
   */
  /** 钉在输入框上方那张**问题卡**（§3.4）。⛔ 不进时间线。 */
  question: StudioOperatorQuestionPrompt | null
  /** 时间线末尾那张**确认卡**（§3.3，两种来源一张卡）。 */
  confirm: StudioOperatorConfirmPrompt | null
  /**
   * **隐身**（56a · ⋯ 菜单里那颗开关）—— 开着时这一轮**一条记忆都不写**。
   *
   * ⭐ 住在 store 而不是面板：面板会被收放法则（拍板 7）随时卸载，而「这段对话
   * 别记」的承诺不该因为收了一下面板就失效。驱动 hook 也要在事件处理器里同步
   * 读它（`getOperatorState()`），那正是这份 store 存在的理由。
   * ⚠ **作用于当前会话**，⛔ 不写库、⛔ 不跨域分槽：它说的是「这段对话」，
   * 与用户此刻站在哪台工作台无关。换会话 / 刷新之后回到关着。
   * ⚠ 它关掉的是**写入**：这一轮照常跑、照常结账下发，只是一条记忆都不落，这段对话也不存
   *   （见 `offTheRecord`）。
   */
  incognito: boolean
  /**
   * 这段对话**开过隐身**（P3「隐身真的不存会话」）—— 一旦开过就整段不落库，中途关掉也不补存：
   * 否则关掉的那一刻会把隐身时说的话连同历史一起写进历史列表。换会话 / 新会话回到 `false`。
   * ⚠ 已经存过的那一行留在库里（开隐身之前的那几轮），之后的都不再追加。
   */
  offTheRecord: boolean
  /**
   * 以前「和角色聊」留下的会话（附录L；用户 10-25 去掉聊天模式）：载入时从会话上读回角色，
   * 这段只能看、输入区换成「去她的配音间」。`null` = 工作会话（新会话一律是工作）。
   */
  chatCharacter: StudioOperatorChatCharacter | null
  /**
   * 这段对话在哪一档（owner 2026-10-28 B1：名字旁那枚胶囊）。`null` = 还没定：没开口前跟着
   * 你站在哪儿走（`resolveOperatorChatMode`），开口那一刻定下来，之后换台、刷新都不变，
   * 只有点胶囊会改。载回的会话从最后一条切模式标记读回。
   */
  chatMode: AssistantChatMode | null
  /**
   * 上一轮是**步数用完**停下的（D12 S12）—— 面板据此在末尾给「继续 / 先到这里」。
   * ⚠ 用户一开口（或新对话 / 换会话）就清掉。
   */
  outOfSteps: boolean
  /**
   * 视频域评审的**抽帧那一段**正在跑（第二期最后一环）。
   *
   * ⭐ 它与 `status: 'working'` **不是同一件事**：抽帧发生在请求发出去**之前**
   * （浏览器里 `<video>` seek 三次，实测可达数秒），此刻服务端连一个字都还没收到，
   * 进度带上一步都没有。不单独记一格的下场是那几秒里带上写着「思考中」——
   * 而它并没有在思考，它在解码用户那段片子。
   * ⚠ 无论成败都要复位（`finally`）：留在 true 上，带子会永远写着「正在抽帧」。
   */
  capturingFrames: boolean
  /**
   * 产物的**审核态**（切片 Y）—— 键是 generation id。
   *
   * ⭐ **跨会话不清**：它说的是「用户对这件产物的判断」，与他在哪条线程里聊天
   * 无关。＋新对话就把「已否」忘掉的表现是那张被否掉的图又能拖进首帧槽了。
   * ⚠ 这里存的是**乐观值**：点下去先写这里，PATCH 失败再退回去（见
   * `use-operator-review.ts`）。⛔ 别等服务端回来才变 —— 一次往返的空窗里用户
   * 会以为自己没点上。
   * ⚠ `pending` **不落键**：没有键就是没人看过，⛔ 别为每一张都写一行 pending。
   */
  reviewStates: Readonly<Record<string, GenerationReviewState>>
  /*
   * ⛔ **没有 `workingMemory`**（v2 §7.6，commit #12）：产物索引改由服务端从
   * 本轮每一步的 `result` 现场派生 —— 客户端镜像一份再传回去，是为了「省一次
   * 查库」而多养的一套会分叉的事实。跨轮那一半由结论记录接手（注入段）。
   */
  /**
   * **上一份还没跑完的计划**（第三期 · 断点续跑）。
   *
   * ⭐ 与那三张「等你定」的卡不同，它**活得比这一次挂载长**：真正的记录在
   * localStorage 上（`lib/studio-operator-resume.ts`），这里只是那一份的镜像，
   * 好让进度带与检查点卡直接读得到。刷新之后由外壳 `hydrateOperatorResume()`
   * 填回来 —— 断点续跑的整个意义就在于「刷新之后还在」。
   * ⚠ `null` 有两种意思：没有过计划，或者上一份已经跑完了。两者对 UI 是同一件事
   *   （不露续跑入口），⛔ 不为此加第三档。
   */
  resume: StudioOperatorResumePlan | null
  /**
   * **载回来的那几条结论记录**（v2 §7.2 / §7.7，commit #13）。
   *
   * ⭐ 与 `history` 分开的理由和 `history` 与 `entries` 分开的理由是同一条：
   * 它们来自**另一列**（`AssistantConversation.rounds`），不是 `messages` 里的
   * 条目，库里也没有「这条结论长在哪条消息之后」的锚。合进 `history` 就得先
   * 编一个位置出来，而编出来的位置会在下一次读写里变成事实。
   * ⚠ 在飞那一轮的结论记录**不在这里**：它是 `entries` 里的 `roundSummary`
   * 条目（`done` 帧到达即落位）。⛔ 别两边都写 —— 那会让同一轮的结论出现两次。
   */
  historyRounds: readonly AssistantOperatorRoundSummary[]
  /**
   * **助手开了别的台，这一轮在那边接着跑**（第 9e 步）。
   *
   * ⭐ 面板每页各挂一份：换页时这一页的 hook 卸了，接力只能靠线程上这一格交给新页那一份 ——
   *   新台的宿主准备好（工作区对上）就带着接力条接着发，然后清掉。
   * ⚠ 等太久（换页失败、创作者又去了别处）就作废，⛔ 不在一个不相干的台上接着跑。
   */
  benchOpen: StudioOperatorBenchOpen | null
}

export interface StudioOperatorBenchOpen {
  target: AssistantOperatorBenchOpen
  transcript: AssistantV3Transcript
  runKey: string
  /** 这一轮已经走了几步（接着编号，见 `RunOptions.canvasSteps`）。 */
  steps: number
  /** 发出的时间（毫秒）：过了 `STUDIO_OPERATOR_BENCH_OPEN_TIMEOUT_MS` 就作废。 */
  at: number
}

const EMPTY_WORKBENCH_FIELDS: StudioOperatorWorkbenchFields = {
  changes: {},
  primed: false,
}

const INITIAL_DOMAIN: AssistantOperatorDomain =
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image

const EMPTY_HISTORY: readonly StudioOperatorHistoryEntry[] = []
const EMPTY_ROUNDS: readonly AssistantOperatorRoundSummary[] = []

const INITIAL_STATE: StudioOperatorState = {
  status: 'idle',
  domain: INITIAL_DOMAIN,
  history: EMPTY_HISTORY,
  sessionId: null,
  localThreadId: '',
  saveFailed: false,
  sessionSurface: null,
  entries: [],
  ...EMPTY_WORKBENCH_FIELDS,
  stepsDone: 0,
  plannedSteps: 0,
  errorText: null,
  errorTrace: null,
  errorCode: null,
  errorMissingKey: null,
  queue: [],
  mentions: [],
  mentionInbox: [],
  autoGenerate: false,
  threadScope: null,
  selectedResultId: null,
  pendingResultId: null,
  planMode: ASSISTANT_PERSONA_DEFAULTS.planMode,
  question: null,
  confirm: null,
  incognito: false,
  offTheRecord: false,
  chatCharacter: null,
  chatMode: null,
  outOfSteps: false,
  capturingFrames: false,
  reviewStates: {},
  resume: null,
  historyRounds: EMPTY_ROUNDS,
  benchOpen: null,
}

const threads = new Map<string, StudioOperatorState>()
let state: StudioOperatorState = {
  ...INITIAL_STATE,
  localThreadId: crypto.randomUUID(),
}
let entrySeq = 0
const listeners = new Set<() => void>()

function emit(next: StudioOperatorState): void {
  state = next
  if (next.threadScope) threads.set(next.threadScope, next)
  for (const listener of listeners) listener()
}

function updateThread(
  current: StudioOperatorState,
  next: StudioOperatorState,
): void {
  if (
    state.threadScope === current.threadScope &&
    state.localThreadId === current.localThreadId
  ) {
    emit(next)
  } else if (current.threadScope) {
    threads.set(current.threadScope, next)
  }
}

function emitSlice(patch: Partial<StudioOperatorWorkbenchFields>): void {
  emit({ ...state, ...patch })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): StudioOperatorState {
  return state
}

function getServerSnapshot(): StudioOperatorState {
  return INITIAL_STATE
}

export function useStudioOperatorState(): StudioOperatorState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * 非响应式地读**此刻**的状态。
 *
 * ⭐ 事件处理器里必须用它，不能用 render 时抓的 ref：`send()` 是先
 * `appendOperatorEntry(用户这句话)` 再 `run()`，两件事在**同一个 tick** 里 ——
 * React 还没重渲染，render 时抓的 ref 里根本没有刚加的那一条，于是 `run()` 看到
 * 一个空对话直接返回。表现是「点了发送，什么都没发生，连请求都没发出去」。
 * （2026-08-30 真机撞到，这就是当时的成因。）
 */
export function getOperatorState(): StudioOperatorState {
  return state
}

export function getOperatorThread(
  scope: string | null,
): StudioOperatorState | null {
  if (state.threadScope === scope) return state
  return scope ? (threads.get(scope) ?? null) : null
}

// ─── 「把这张图给助手看」的投递口（P4-C）──────────────────────────────
//
// ⭐ 与 `runner` 同一个形状、同一条论据：发起方（结果列上那颗 🤖，长在装配台深处）
// 与消费方（面板的附件栏，长在 dock 里）中间隔着整棵组件树，逐层透传一个可选回调
// 正是本仓「漏传 = 三绿而功能全失效」的高发形态。
// ⚠ `LoraWorkbench` 此前把这件事投给 `useStudioAssistantReference`（旧面板的口），
//    而操作员不读那个 store —— 不接上就是一颗点了只会把面板打开、图却没跟过来的
//    按钮。⛔ 本仓最讨厌的那种失败。

let pendingAttachment: StudioOperatorAttachment | null = null
const attachmentListeners = new Set<() => void>()

/**
 * 请求把一件东西挂成下一条消息的附件。
 *
 * ⚠ 只留**一件**：连点两次结果列那颗按钮，用户的意思是「看这张」而不是
 * 「看这两张」（第二次点的是同一个位置上换过的那张图）。
 */
export function requestOperatorAttachment(
  attachment: StudioOperatorAttachment,
): void {
  pendingAttachment = attachment
  for (const listener of attachmentListeners) listener()
}

/** 取走并清空 —— ⚠ 取走即消费：留着它，面板每次重挂都会再挂一遍同一张图。 */
export function takeOperatorAttachment(): StudioOperatorAttachment | null {
  const next = pendingAttachment
  pendingAttachment = null
  return next
}

export function subscribeOperatorAttachment(listener: () => void): () => void {
  attachmentListeners.add(listener)
  return () => {
    attachmentListeners.delete(listener)
  }
}

/**
 * **别处递过来的一句话**（画布角色卡「写剧本 / 写台词」）：那个台的助手把它填进输入框并
 * 打开面板，由用户按发送。
 *
 * ⚠ 带着**要给哪个域**：⛔ 别的台挂着的 Dock 不能把话先吞了。只留一句：连点两次，意思是「就这句」。
 */
let pendingDraft: {
  /** 哪个账号的线程（作用域 `:` 之前那一段）。 */
  account: string
  /** 给哪个台（`workspaceKey`）；`canvas` = 眼前挂着的那块画布。 */
  target: string
  text: string
} | null = null
const draftListeners = new Set<() => void>()

export function requestOperatorDraft(
  workspace: AssistantWorkspace,
  text: string,
  /** 画布那一格要指名哪块画布（工作台交过来时刚切 / 刚建好）；缺席 = 眼前这块。 */
  canvasProjectId?: string,
): void {
  const source = state.threadScope
  if (!source) return
  const account = source.slice(0, source.indexOf(':'))
  if (workspace === 'canvas' && !canvasProjectId && state.domain !== 'canvas')
    return
  const target =
    workspace === 'canvas' && canvasProjectId
      ? `canvas:${canvasProjectId}`
      : workspace
  pendingDraft = { account, target, text }
  for (const listener of draftListeners) listener()
}

/**
 * 取走并清空 —— 只有台对得上的那一页取得走（线程一个人一段，第 9d 步；台由 `workspaceKey` 认）。
 */
export function takeOperatorDraft(
  scope: string | null,
  workspaceKey: string | null,
): string | null {
  if (!scope || !workspaceKey || !pendingDraft) return null
  if (scope.slice(0, scope.indexOf(':')) !== pendingDraft.account) return null
  const matches =
    pendingDraft.target === 'canvas'
      ? workspaceKey.startsWith('canvas:')
      : pendingDraft.target === workspaceKey
  if (!matches) return null
  const { text } = pendingDraft
  pendingDraft = null
  return text
}

export function subscribeOperatorDraft(listener: () => void): () => void {
  draftListeners.add(listener)
  return () => {
    draftListeners.delete(listener)
  }
}

/** 线程条目的 id —— 单调递增，不用 uuid：测试里能直接断言顺序。 */
export function nextOperatorEntryId(prefix: string): string {
  entrySeq += 1
  return `${prefix}-${entrySeq}`
}

export function appendOperatorEntry(entry: StudioOperatorThreadEntry): void {
  emit({ ...state, entries: [...state.entries, entry] })
}

/**
 * **本轮结账落进时间线**（v2 §7.7，commit #13）—— `done` 帧带着它来。
 *
 * ⚠ 同一个 `roundIndex` 只留一条：一轮里被问题卡停过几次都不算新的一轮
 * （服务端那侧的同一条纪律，见 `appendAssistantConversationRound` 头注），而
 * 客户端重发续跑时那条 `done` 会再来一次 —— 追加的表现是流末尾两条一模一样的
 * 「本轮结论」。
 */
export function appendOperatorRoundSummary(
  summary: AssistantOperatorRoundSummary,
): void {
  const exists = state.entries.some(
    (entry) =>
      entry.kind === 'roundSummary' &&
      entry.summary.roundIndex === summary.roundIndex,
  )
  if (exists) {
    emit({
      ...state,
      entries: state.entries.map((entry) =>
        entry.kind === 'roundSummary' &&
        entry.summary.roundIndex === summary.roundIndex
          ? { ...entry, summary }
          : entry,
      ),
    })
    return
  }
  appendOperatorEntry({
    kind: 'roundSummary',
    id: nextOperatorEntryId('round'),
    summary,
  })
}

/**
 * 用户就地改完那三栏之后的**乐观写入**（§7.7）。
 *
 * ⭐ 在飞那条（`entries`）与载回来那几条（`historyRounds`）**一起改**：同一个
 * `roundIndex` 在两个数组里各存在过一次（这一次页面加载里生成的 vs 上一次载回
 * 来的），只改一边的表现是编辑保存后那个块看上去回滚了。
 * ⚠ `editedByUser` 在这里就置上，⛔ 不等服务端回来：那一次往返的空窗里用户会
 * 以为自己没点上（与 `reviewStates` 那一格同一条判据）。PATCH 失败时由调用方
 * 用原值再调一次这个函数退回去。
 * ⚠ **只钉住那一次不置 `editedByUser`**（2026-09-12 实测第三组 B）：钉住写的是
 * `pinnedEvidence` 一列，动的是「这一句还留不留在眼前」——⛔ 不是把模型压出来的
 * 那三栏认领成用户写的（服务端那侧逐字同一条纪律）。
 */
export function updateOperatorRoundSummary(
  roundIndex: number,
  patch: Partial<
    Pick<
      AssistantOperatorRoundSummary,
      'facts' | 'decisions' | 'todos' | 'pinnedEvidence' | 'editedByUser'
    >
  >,
): void {
  const editedColumns =
    patch.facts !== undefined ||
    patch.decisions !== undefined ||
    patch.todos !== undefined
  const apply = (
    summary: AssistantOperatorRoundSummary,
  ): AssistantOperatorRoundSummary =>
    summary.roundIndex === roundIndex
      ? {
          ...summary,
          ...patch,
          ...(editedColumns
            ? { editedByUser: patch.editedByUser ?? true }
            : patch.editedByUser !== undefined
              ? { editedByUser: patch.editedByUser }
              : {}),
        }
      : summary
  emit({
    ...state,
    entries: state.entries.map((entry) =>
      entry.kind === 'roundSummary'
        ? { ...entry, summary: apply(entry.summary) }
        : entry,
    ),
    historyRounds: state.historyRounds.map(apply),
  })
}

/**
 * 助手正文的**占位行**（§4.1「发送即回显」）—— 发出去的同一帧就落进线程。
 *
 * ⭐ 它就是一条 `text: ''` 的待写正文条：占位与正文**共用一条条目**，定稿帧
 * 直接往它里面写字。⛔ 不做「另起一种 placeholder 条目、到货再换成 message
 * 条目」—— 换条目 = 换 React key = 头像和那一行整个重挂一次，而用户看到的是
 * 刚出现的占位行闪一下又跳一格。
 */
export function appendOperatorPending(
  id: string,
  /** 画布接力那一跳（「正在画布上落地…」）。缺省 = 等模型开口。 */
  phase?: 'landing',
): void {
  appendOperatorEntry({
    kind: 'message',
    id,
    text: '',
    streaming: true,
    // 「正在想… N 秒」从这一刻数（2026-10-14 加载态）。
    pendingSince: Date.now(),
    ...(phase ? { pendingPhase: phase } : {}),
  })
}

/** 这一条攒下的思考摘要 —— 正文增量 / 定稿重建条目时带着走。 */
function thinkingOf(
  current: StudioOperatorThreadEntry | undefined,
): Pick<StudioOperatorMessageEntry, 'thinking'> {
  return current?.kind === 'message' && current.thinking
    ? { thinking: current.thinking }
    : {}
}

/**
 * 第一个字到达时**这一段想了多久** —— 占位行还空着就从它挂上那一刻算，已经算过就
 * 沿用（⛔ 每来一段增量重算一次，数会一直涨）。
 */
function thoughtMsOf(
  current: StudioOperatorThreadEntry | undefined,
): number | undefined {
  if (!current || current.kind !== 'message') return undefined
  if (current.thoughtMs !== undefined) return current.thoughtMs
  if (current.text.length === 0 && current.pendingSince !== undefined)
    return Math.max(0, Date.now() - current.pendingSince)
  return undefined
}

/**
 * 定稿一条正文 —— **按 id 整体覆盖**已有的那条，并把 `streaming` 降下来。
 *
 * ⭐ 覆盖而不是追加（v2 §13.1）：追加的表现正是那条 bug —— 计划帧插在两帧正文
 * 之间时，同一段分析回复在计划上下各出现一次。
 */
/**
 * 收尾轮还在写 —— **把一小段增量追加**到那条正文后面，`streaming` 保持。
 *
 * ⭐ 追加而不是覆盖（56b 切片 3）：服务端从此只发差值（`message_delta`），
 * 一句 800 字的回答不再被重发几十遍。
 * ⚠ 定稿仍旧走 `finalizeOperatorMessage` 的**整体覆盖** —— v2 §13.1 那条
 * 「追加会让同一段话出现两遍」说的是**定稿帧**，⛔ 别拿它来反对这里的追加：
 * 这一条只在同一条 `streaming` 气泡里长长度，定稿一到就整条被顶掉。
 * ⚠ 找不到那条（占位行被别的帧顶走了）就**新建一条**：⛔ 不静默丢字。
 */
export function appendOperatorStreamingMessage(
  id: string,
  delta: string,
  /** 新一稿的第一段：换掉还在流的旧稿，⛔ 不接在后面。 */
  restart = false,
  /** 她在聊天：拆成气泡（②c-2）。 */
  chat = false,
): void {
  const index = state.entries.findIndex(
    (item) => item.kind === 'message' && item.id === id,
  )
  const current = index >= 0 ? state.entries[index] : undefined
  const text =
    current && current.kind === 'message' && !(restart && current.streaming)
      ? `${current.text}${delta}`
      : delta
  const thoughtMs = thoughtMsOf(current)
  const entry: StudioOperatorMessageEntry = {
    kind: 'message',
    id,
    text,
    streaming: true,
    ...(thoughtMs !== undefined ? { thoughtMs } : {}),
    ...thinkingOf(current),
    ...(chat ? { chat: true as const } : {}),
  }
  if (index < 0) {
    appendOperatorEntry(entry)
    return
  }
  emit({
    ...state,
    entries: state.entries.map((item, i) => (i === index ? entry : item)),
  })
}

export function finalizeOperatorMessage(
  id: string,
  text: string,
  /** 她在聊天：拆成气泡（②c-2）。 */
  chat = false,
): void {
  const index = state.entries.findIndex(
    (item) => item.kind === 'message' && item.id === id,
  )
  const current = index >= 0 ? state.entries[index] : undefined
  const thoughtMs = thoughtMsOf(current)
  const entry: StudioOperatorMessageEntry = {
    kind: 'message',
    id,
    text,
    ...(thoughtMs !== undefined ? { thoughtMs } : {}),
    ...thinkingOf(current),
    ...(chat ? { chat: true as const } : {}),
  }
  if (index < 0) {
    appendOperatorEntry(entry)
    return
  }
  emit({
    ...state,
    entries: state.entries.map((item, i) => (i === index ? entry : item)),
  })
}

/** 🔊 念她的回复（②c-2）：把这段念到哪了记在那条正文上；那条已经不在就算了。 */
export function setOperatorMessageVoice(
  id: string,
  voice: StudioOperatorMessageVoice,
): void {
  const index = state.entries.findIndex(
    (item) => item.kind === 'message' && item.id === id,
  )
  const current = index >= 0 ? state.entries[index] : undefined
  if (!current || current.kind !== 'message') return
  emit({
    ...state,
    entries: state.entries.map((item, i) =>
      i === index ? { ...current, voice } : item,
    ),
  })
}

/**
 * 扔掉一条**还空着的**占位行（§4.1：第一个 step / 卡片到达时占位行让位）。
 *
 * ⚠ 只扔空的：助手先说了一句再去调工具时，那句话必须留在屏幕上。
 */
export function dropOperatorPending(id: string): void {
  const index = state.entries.findIndex(
    (entry) =>
      entry.kind === 'message' && entry.id === id && entry.text.length === 0,
  )
  if (index < 0) return
  const current = state.entries[index]!
  /**
   * ⭐ 想过的那一格**留下来当回执**（10-27「流出思考摘要」）：工具步压上来时，这一段想了什么、
   * 想了多久得留在它该在的位置（工具步上面），⛔ 跟着空占位行一起扔掉 —— 以前的回执只剩最后
   * 一段的秒数，就是因为前几段的这一格都被扔了。
   */
  const thoughtMs = thoughtMsOf(current)
  if (
    current.kind === 'message' &&
    (current.thinking ||
      (thoughtMs !== undefined &&
        thoughtMs >= STUDIO_OPERATOR_STREAMING.thinkingRevealMs))
  ) {
    // 收成回执：占位行那两格（从哪一刻数 / 在等什么）不再有意义。
    const rest = { ...current }
    delete rest.pendingSince
    delete rest.pendingPhase
    emit({
      ...state,
      entries: state.entries.map((entry, i) =>
        i === index
          ? {
              ...rest,
              streaming: false,
              ...(thoughtMs !== undefined ? { thoughtMs } : {}),
            }
          : entry,
      ),
    })
    return
  }
  emit({ ...state, entries: state.entries.filter((_, i) => i !== index) })
}

/**
 * 这一段想完时回执写几秒：服务端量的（只算模型调用）与这一行自己数到的（从占位行挂上算，含开跑前
 * 准备）取大的 —— 🔬 10-27 实跑：那一行数到 7 秒，回执写「想了 4 秒」，两个数对不上。
 */
function thoughtMsWith(base: StudioOperatorMessageEntry, ms: number): number {
  const observed =
    !base.text && base.pendingSince !== undefined
      ? Date.now() - base.pendingSince
      : 0
  return Math.max((base.thoughtMs ?? 0) + ms, observed)
}

/**
 * 模型在想（`thinking` 帧）—— 摘要追加进这一条占位行，`ms` 到了就记下这一段想了多久。
 * ⚠ 那一条还不在（工具步之后的占位行还没挂出来）就**当场挂一条**：摘要来了就该看得见。
 *   只带 `ms` 的那一帧⛔ 不为它挂：没有可看的，挂了下一帧又拆就是闪一下。
 * ⚠ 一段里想了好几回（联网查完接着想）秒数累加。
 */
export function appendOperatorThinking(
  id: string,
  delta: string | undefined,
  ms: number | undefined,
): void {
  const index = state.entries.findIndex(
    (item) => item.kind === 'message' && item.id === id,
  )
  const current = index >= 0 ? state.entries[index] : undefined
  if (current && current.kind !== 'message') return
  if (!current && !delta) return
  const base: StudioOperatorMessageEntry = current ?? {
    kind: 'message',
    id,
    text: '',
    streaming: true,
    pendingSince: Date.now(),
  }
  const entry: StudioOperatorMessageEntry = {
    ...base,
    ...(delta ? { thinking: `${base.thinking ?? ''}${delta}` } : {}),
    ...(ms !== undefined ? { thoughtMs: thoughtMsWith(base, ms) } : {}),
  }
  if (index < 0) {
    appendOperatorEntry(entry)
    return
  }
  emit({
    ...state,
    entries: state.entries.map((item, i) => (i === index ? entry : item)),
  })
}

/**
 * 一轮流收尾时把还挂着 `streaming` 的正文**全部定稿**（D12 C6）。
 *
 * 🔬 真机：一轮停在问题 / 确认卡上时服务端不再发定稿帧，那条正文于是一直
 * `streaming`，末尾光标挂着不走 —— 读起来像它还在写。写完即收。
 */
export function settleOperatorStreaming(): void {
  if (
    !state.entries.some((entry) => entry.kind === 'message' && entry.streaming)
  ) {
    return
  }
  emit({
    ...state,
    entries: state.entries.map((entry) =>
      entry.kind === 'message' && entry.streaming
        ? { ...entry, streaming: false }
        : entry,
    ),
  })
}

/**
 * 一条日志在**线程里**的 id。
 *
 * ⭐ **不能直接用 `step.id`** —— 服务端每跑一轮都从 `step-1` 重新编号，
 * 而线程是跨轮累积的。直接用它的表现是：第二轮的第一步把第一轮的第一步**原地
 * 顶掉**（历史消失），并且继承那条的 `undone` —— 新改动一落地就是划线状态、
 * 也不计入改动数。2026-08-30 真机实测到（两轮都改张数，第一轮那条变成了第二轮
 * 的内容且带着划线）。所以线程侧的 key = 这一轮的 token + 服务端的步号。
 */
export function operatorStepEntryId(runKey: string, stepId: string): string {
  return `${runKey}:${stepId}`
}

export function upsertOperatorStep(
  step: AssistantOperatorStep,
  runKey: string,
): void {
  const entryId = operatorStepEntryId(runKey, step.id)
  const index = state.entries.findIndex(
    (entry) => entry.kind === 'step' && entry.id === entryId,
  )
  const existing =
    index >= 0 ? (state.entries[index] as StudioOperatorStepEntry) : null
  const nextEntry: StudioOperatorStepEntry = {
    kind: 'step',
    id: entryId,
    step,
    runKey,
    undone: existing?.undone ?? false,
  }
  const entries =
    index >= 0
      ? state.entries.map((entry, i) => (i === index ? nextEntry : entry))
      : [...state.entries, nextEntry]
  // 「跑完几步」数的是 `done` 的那一次 —— `running` 也数就会一步顶两步。
  const stepsDone =
    step.status === 'done' && existing?.step.status !== 'done'
      ? state.stepsDone + 1
      : state.stepsDone
  emit({ ...state, entries, stepsDone })
}

export function markOperatorStepUndone(stepId: string): void {
  emit({
    ...state,
    entries: state.entries.map((entry) =>
      entry.kind === 'step' && entry.id === stepId
        ? { ...entry, undone: true }
        : entry,
    ),
  })
}

export function setOperatorStatus(
  status: StudioOperatorStatus,
  errorText: string | null = null,
  /**
   * 诊断两样（owner 2026-09-20 真机第 1 条）。⚠ 缺省清空：非错误态、以及
   * 有码有文案的那一族失败，都不该留着上一次的短码在屏幕上。
   */
  errorTrace: StudioOperatorErrorTrace | null = null,
  errorCode: string | null = null,
  errorMissingKey: AssistantOperatorMissingKey | null = null,
): void {
  emit({
    ...state,
    status,
    errorText,
    errorTrace,
    errorCode,
    errorMissingKey,
  })
}

/** 抽帧那一段的开关（第二期）—— 见 `capturingFrames` 头注。 */
export function setOperatorCapturingFrames(capturingFrames: boolean): void {
  if (state.capturingFrames === capturingFrames) return
  emit({ ...state, capturingFrames })
}

export function setOperatorPrimed(primed: boolean): void {
  if (state.primed === primed) return
  emitSlice({ primed })
}

export function setOperatorPlannedSteps(plannedSteps: number): void {
  emit({ ...state, plannedSteps })
}

// ─── 排队（§3.1 ㉒–㉔）────────────────────────────────────────────
//
// ⭐ 本片把「插话」拆成了两件事：**排队**（默认，等下一个工具步边界）与
// **⏹ Stop**（显式中断）。之前两件事共用 `send()` 的 abort，于是想补一句
// 「顺便把比例改成 3:4」会把正在跑的三步整个掐掉重来 —— 用户付了三步的钱，
// 看到的却是从头再跑一遍。

export function enqueueOperatorMessage(
  message: StudioOperatorQueuedMessage,
): void {
  emit({ ...state, queue: [...state.queue, message] })
}

/**
 * 取走整队并清空 —— **取走即消费**。
 *
 * ⚠ 一次取整队而不是逐条：两条排在一起时用户的意思是「这两句一起说」，
 * 逐条接住会让第二句再等一个工具步边界（而那一步可能永远不来）。
 */
export function takeOperatorQueue(): readonly StudioOperatorQueuedMessage[] {
  const queue = state.queue
  if (queue.length === 0) return queue
  emit({ ...state, queue: [] })
  return queue
}

/** 撤回一条（排队条上那颗「撤回」）—— 通报由调用方插系统行，这里只管队列。 */
export function removeOperatorQueued(id: string): void {
  if (!state.queue.some((item) => item.id === id)) return
  emit({ ...state, queue: state.queue.filter((item) => item.id !== id) })
}

export function clearOperatorQueue(): void {
  if (state.queue.length === 0) return
  emit({ ...state, queue: [] })
}

// ─── 审核态 / 工作记忆 / 成本计数（切片 Y）────────────────────────

/**
 * 标一件产物的审核态。
 *
 * ⚠ `pending` **删键**而不是写一个 `'pending'`：没有键就是「没人看过」，两种
 * 表示法并存的下场是 `Object.keys` 数出来的「看过的张数」比实际多。
 * ⚠ 值没变时整个 no-op：结果行卡与选择器都订这份 store，白发一次 emit 就是
 * 一次全面板重渲染。
 */
export function setOperatorReviewState(
  id: string,
  reviewState: GenerationReviewState,
): void {
  const current = state.reviewStates[id] ?? GENERATION_REVIEW_STATE_IDS.pending
  if (current === reviewState) return
  const reviewStates = { ...state.reviewStates }
  if (reviewState === GENERATION_REVIEW_STATE_IDS.pending) {
    delete reviewStates[id]
  } else {
    reviewStates[id] = reviewState
  }
  emit({ ...state, reviewStates })
}

/** 非响应式地问一件产物的审核态 —— 拖拽的 `onDrop` 里要同步读它。 */
export function getOperatorReviewState(id: string): GenerationReviewState {
  return state.reviewStates[id] ?? GENERATION_REVIEW_STATE_IDS.pending
}

// ─── @ 引用（统一引用模型，§10b）────────────────────────────────────

function upsertMentions(
  current: readonly AssistantMention[],
  next: readonly AssistantMention[],
): readonly AssistantMention[] {
  const keys = new Set(next.map((item) => mentionKey(item)))
  return [
    ...current.filter((item) => !keys.has(mentionKey(item))),
    ...next,
  ].slice(-ASSISTANT_MENTION_LIMITS.registry)
}

/**
 * 从外面递一条进来（结果卡「问助手」/ 拖图 / 歧义单选 / 用它当参考）：登记，并排进
 * 「待写进正文」那一格。
 *
 * ⚠ **按键去重**：同一张图被两个入口各递一次，正文里也只有一枚胶囊 ——「将看 N 张」
 * 多数一张而助手只看到一张，是本仓明令不许的那种失败。
 */
export function addOperatorMention(
  attachment: StudioOperatorAttachment,
  scope: AssistantMentionScope = ASSISTANT_MENTION_SCOPE_IDS.library,
): void {
  queueOperatorMention(mentionFromAttachment(attachment, scope))
}

/** 同上，递进来的已经是一条引用（库里「交给助手」一位角色 / 一个 LoRA，不是一张图）。 */
export function queueOperatorMention(mention: AssistantMention): void {
  const key = mentionKey(mention)
  emit({
    ...state,
    mentions: upsertMentions(state.mentions, [mention]),
    mentionInbox: state.mentionInbox.includes(key)
      ? state.mentionInbox
      : [...state.mentionInbox, key],
  })
}

/** 只登记、不排队 —— 面板自己从菜单里挑的那几条（胶囊它自己插）。 */
export function registerOperatorMentions(
  mentions: readonly AssistantMention[],
): void {
  if (!mentions.length) return
  emit({ ...state, mentions: upsertMentions(state.mentions, mentions) })
}

/** 取走「待写进正文」的那几条（取走即清空）。 */
export function takeOperatorMentionInbox(): AssistantMention[] {
  if (!state.mentionInbox.length) return []
  const byKey = new Map(state.mentions.map((item) => [mentionKey(item), item]))
  const taken = state.mentionInbox.flatMap((key) => {
    const hit = byKey.get(key)
    return hit ? [hit] : []
  })
  emit({ ...state, mentionInbox: [] })
  return taken
}

/** 整张登记表连同待写进正文的那几条一起清（测试与「换账号」那种彻底重来用）。 */
export function clearOperatorMentions(): void {
  if (state.mentions.length === 0 && state.mentionInbox.length === 0) return
  emit({ ...state, mentions: [], mentionInbox: [] })
}

/** 自动生成开关在本机的那一格（按工作台作用域）。读写失败一律当「关」。 */
const AUTO_GENERATE_STORAGE_PREFIX = 'antei:assistant-auto-generate:'

function readAutoGenerate(scope: string | null): boolean {
  if (!scope) return false
  try {
    return (
      globalThis.localStorage?.getItem(AUTO_GENERATE_STORAGE_PREFIX + scope) ===
      '1'
    )
  } catch {
    return false
  }
}

function writeAutoGenerate(scope: string | null, on: boolean): void {
  if (!scope) return
  try {
    if (on)
      globalThis.localStorage?.setItem(
        AUTO_GENERATE_STORAGE_PREFIX + scope,
        '1',
      )
    else
      globalThis.localStorage?.removeItem(AUTO_GENERATE_STORAGE_PREFIX + scope)
  } catch {
    // 存不下（隐私模式 / 配额）：开关只在这次打开期间有效。
  }
}

export function claimOperatorThreadScope(
  scope: string | null,
  domain: AssistantOperatorDomain,
): boolean {
  if (state.threadScope === scope && state.domain === domain) return false
  settleOperatorStreaming()
  if (scope === null) threads.clear()
  const cached = scope ? threads.get(scope) : undefined
  const next: StudioOperatorState = cached ?? {
    ...INITIAL_STATE,
    localThreadId: crypto.randomUUID(),
    planMode: scope ? state.planMode : INITIAL_STATE.planMode,
    autoGenerate: readAutoGenerate(scope),
  }
  pendingAttachment = null
  if (
    !scope ||
    (pendingDraft &&
      pendingDraft.account !== scope.slice(0, scope.indexOf(':')))
  ) {
    pendingDraft = null
  }
  emit({
    ...next,
    entries: withDomainMark(next, domain),
    domain,
    threadScope: scope,
    // 开台途中换过来的（第 9e 步）：这一轮还在跑，⛔ 不收成 idle。
    status: next.status === 'working' && !next.benchOpen ? 'idle' : next.status,
    capturingFrames: false,
  })
  if (!cached) hydrateOperatorResume()
  return true
}

/**
 * 同一段对话换了台（第 9d 步：对话不按台分）→ 时间线上落一条换台细线，模型也读得到。
 * ⚠ 空线程不落（还没聊过，换台不是一件事）；上一条就是换台线时就地改掉（来回点台不堆一串）。
 */
function withDomainMark(
  thread: StudioOperatorState,
  domain: AssistantOperatorDomain,
): StudioOperatorState['entries'] {
  if (thread.domain === domain) return thread.entries
  if (thread.entries.length === 0 && thread.history.length === 0)
    return thread.entries
  const kept =
    thread.entries.at(-1)?.kind === 'domainMark'
      ? thread.entries.slice(0, -1)
      : thread.entries
  return [
    ...kept,
    { kind: 'domainMark', id: nextOperatorEntryId('domain'), domain },
  ]
}

/** 自动生成开关（D12 S-C）—— 跟着工作台走，见 `autoGenerate` 头注。 */
export function setOperatorAutoGenerate(autoGenerate: boolean): void {
  if (state.autoGenerate === autoGenerate) return
  writeAutoGenerate(state.threadScope, autoGenerate)
  emit({ ...state, autoGenerate })
}

/** 结果行卡的选中格（§4.2）。⚠ 再点一次同一格 = 取消选中，由调用方传 `null`。 */
export function setOperatorSelectedResult(id: string | null): void {
  if (state.selectedResultId === id) return
  emit({ ...state, selectedResultId: id })
}

/**
 * **落一张生成中的结果卡**（v2 §6.3，commit #10）—— 「确认生成」那一刻调。
 *
 * ⚠ 同时记下 `pendingResultId`：回流那一侧靠它找到该往哪条写（见字段头注）。
 * ⚠ 上一张还没结账就又来一张时，旧的那张**留在原地不动**（它已经是历史了），
 * 只有指针改到新的这条 —— ⛔ 别去把旧卡改成失败：它到底出没出图这里并不知道。
 */
export function appendOperatorPendingResult(
  entry: Omit<StudioOperatorResultEntry, 'kind' | 'items' | 'completed'>,
): void {
  emit({
    ...state,
    entries: [
      ...state.entries,
      { ...entry, kind: 'result', items: [], completed: 0 },
    ],
    pendingResultId: entry.id,
  })
}

/**
 * 往那张结果卡上写回流（张数 / 缩略图 / 入库时刻）。
 *
 * ⚠ 找不到那一条就**什么都不做**（用户可能已经＋新对话把线程清了）：
 * 补一条新的表现是一张凭空出现在流末尾的结果卡，而它上面那句「已入库」
 * 对应的是上一个话题。
 */
export function updateOperatorResult(
  id: string,
  patch: Partial<Omit<StudioOperatorResultEntry, 'kind' | 'id'>>,
): void {
  const index = state.entries.findIndex(
    (entry) => entry.kind === 'result' && entry.id === id,
  )
  if (index < 0) return
  const entries = [...state.entries]
  entries[index] = {
    ...(entries[index] as StudioOperatorResultEntry),
    ...patch,
  }
  emit({ ...state, entries })
}

/** 这一批结账了 —— 指针清掉，下一批不会再写进这张卡。 */
export function clearOperatorPendingResult(): void {
  if (state.pendingResultId === null) return
  emit({ ...state, pendingResultId: null })
}

/**
 * 全挂了 —— **把那张生成中的卡撤掉**，由调用方另落一行系统行（§6 头注）。
 *
 * ⚠ 撤掉而不是留一张写着「失败」的结果卡：结果卡的两个轻操作在一批空图上
 * 全是死的，而一张每一格都点不动的卡比没有卡更难读。
 */
export function dropOperatorPendingResult(id: string): void {
  emit({
    ...state,
    entries: state.entries.filter(
      (entry) => !(entry.kind === 'result' && entry.id === id),
    ),
    pendingResultId:
      state.pendingResultId === id ? null : state.pendingResultId,
  })
}

/**
 * persona 的「默认行为」落进 store（§8.2）。
 *
 * ⚠ 「先问我」开关已随 v2 决策 6 删掉，`planMode` 就是它的**唯一**语义来源：
 * `always` 让服务端每轮先摆一张计划确认卡（`assistant-operator.service.ts` 的
 * 多步确认闸 + 系统提示 `PLAN_MODE_DIRECTIVES`）。⛔ 别在输入区再造一个跟它
 * 打架的单轮开关（v2 §11.1）。
 */
/**
 * 隐身开关（56a）—— ⋯ 菜单那一颗按的就是它。
 *
 * ⚠ ⛔ 不在这里清任何东西：隐身**不撤销**已经记下的那些（那是设置页上的
 * 「删」与「全部清空」干的事），它只管从现在起这段对话不再记。
 */
/** 步数用完那一轮的标记（D12 S12）。 */
/** 开台（第 9e 步）：记下要在新台上接着跑的那一跳；`null` = 接上了 / 作废了。 */
export function setOperatorBenchOpen(
  benchOpen: StudioOperatorBenchOpen | null,
): void {
  if (state.benchOpen === benchOpen) return
  emit({ ...state, benchOpen })
}

/**
 * 画布按 `?project=<id|new>` 打开了哪一块（第 9e 步）：把真正的项目号补回开台那一格 ——
 * 新建的那块这时才有号，要的那块已经没了时落在眼前这块。
 */
export function settleOperatorBenchOpenProject(projectId: string): void {
  const open = state.benchOpen
  if (!open || open.target.workspace !== 'canvas') return
  if (open.target.projectId === projectId) return
  emit({
    ...state,
    benchOpen: { ...open, target: { ...open.target, projectId } },
  })
}

export function setOperatorOutOfSteps(outOfSteps: boolean): void {
  if (state.outOfSteps === outOfSteps) return
  emit({ ...state, outOfSteps })
}

/** 载回的会话停在哪一档：最后一条切模式标记说了算；一条都没有 = 还没定（按会话从哪儿开始的算）。 */
function chatModeFromHistory(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantChatMode | null {
  const mark = history.findLast((entry) => entry.kind === 'chatMark')
  if (!mark || mark.kind !== 'chatMark') return null
  return mark.characterId
    ? ASSISTANT_CHAT_MODE_IDS.chat
    : ASSISTANT_CHAT_MODE_IDS.work
}

/**
 * 这段对话现在在哪一档。没有人设角色 = 只有工作（胶囊不出现）；定过的照定的；没定 = 载回的会话
 * 按它从哪儿开始，新对话按你现在站在哪儿（首页聊、台上干活）。
 */
export function resolveOperatorChatMode(
  current: Pick<StudioOperatorState, 'chatMode' | 'sessionSurface' | 'domain'>,
  hasCharacter: boolean,
): AssistantChatMode {
  if (!hasCharacter) return ASSISTANT_CHAT_MODE_IDS.work
  if (current.chatMode) return current.chatMode
  const home = current.sessionSurface
    ? current.sessionSurface === ASSISTANT_SURFACE_IDS.home
    : current.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.home
  return home ? ASSISTANT_CHAT_MODE_IDS.chat : ASSISTANT_CHAT_MODE_IDS.work
}

/** 开口那一刻把档位定下来（还没定才定）：之后换台不再跟着变。 */
export function settleOperatorChatMode(mode: AssistantChatMode): void {
  if (state.chatMode) return
  emit({ ...state, chatMode: mode })
}

/**
 * 点胶囊换档。对话里已经有话时，时间线上留一条细线（「切到聊天 · 和她」/「回到工作」），模型也读
 * 得到；连着切回去就把上一条细线拿掉，⛔ 留两条互相抵消的线。
 */
export function switchOperatorChatMode(
  mode: AssistantChatMode,
  character: { id: string; name: string },
): void {
  const last = state.entries.at(-1)
  if (last?.kind === 'chatMark') {
    emit({ ...state, chatMode: mode, entries: state.entries.slice(0, -1) })
    return
  }
  const talked = state.entries.length > 0 || state.history.length > 0
  emit({
    ...state,
    chatMode: mode,
    entries: talked
      ? [
          ...state.entries,
          {
            kind: 'chatMark',
            id: nextOperatorEntryId('chat-mark'),
            character: mode === ASSISTANT_CHAT_MODE_IDS.chat ? character : null,
            previous: mode === ASSISTANT_CHAT_MODE_IDS.chat ? null : character,
          },
        ]
      : state.entries,
  })
}

export function setOperatorIncognito(incognito: boolean): void {
  if (state.incognito === incognito) return
  emit({ ...state, incognito, offTheRecord: state.offTheRecord || incognito })
}

export function setOperatorPlanMode(planMode: AssistantPersonaPlanMode): void {
  if (state.planMode === planMode) return
  emit({ ...state, planMode })
}

// ─── 两张「等你定」的卡（v2 §3.2：问题 / 确认）────────────────────
//
// ⭐ 五类卡收敛之后这里只剩两格（此前是计划 / 花钱 / 歧义三格）：
//  · `question` 钉在输入框上方，答完消失，时间线落一行系统行；
//  · `confirm`  长在时间线末尾，确认 / 取消后**就地换态**，⛔ 不消失。

/** 问题卡到货（§3.4）—— ⚠ 一次只有一张，新的一张直接顶掉旧的。 */
export function setOperatorQuestion(
  question: StudioOperatorQuestionPrompt | null,
): void {
  emit({ ...state, question })
}

/**
 * 问题块上**勾选 / 取消勾选**（2026-10-14 反问卡多选）—— 只动当前题的 `checked`。
 * ⚠ 没有问题卡时什么都不做：卡刚被答掉的那一帧里迟到的一下不该复活它。
 */
export function setOperatorQuestionChecked(checked: readonly string[]): void {
  if (!state.question) return
  emit({ ...state, question: { ...state.question, checked } })
}

/** 确认卡到货（§3.3）。 */
export function setOperatorConfirm(
  confirm: StudioOperatorConfirmPrompt | null,
): void {
  emit({ ...state, confirm })
}

/**
 * 确认卡换态（§3.2 状态表）—— 「确认中 / 已确认 / 已取消」。
 *
 * ⚠ 已经定过的**不再改**：`confirmed` 之后再收到一次 `cancelled` 的表现是那一枪
 * 明明发出去了，卡上却写着「没有执行」。⛔ 唯一的例外是「再来一次」——它走
 * `setOperatorConfirm` 重新摆一张 `idle` 的卡，不是在这里回退。
 */
export function resolveOperatorConfirm(
  status: StudioOperatorConfirmStatus,
  /** 自动生成开关替你按下的那一次（D12 S-C）。 */
  options: { auto?: boolean } = {},
): void {
  const confirm = state.confirm
  if (!confirm) return
  if (
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  ) {
    return
  }
  emit({
    ...state,
    confirm: {
      ...confirm,
      status,
      ...(status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
        ? {}
        : { decidedAt: new Date().toISOString() }),
      ...(options.auto ? { auto: true } : {}),
    },
  })
}

/**
 * 两张卡一起清 —— 切域（拍板 8）与 ⏹ Stop 用。
 */
export function clearOperatorPrompts(): void {
  if (!state.question && !state.confirm) return
  emit({ ...state, question: null, confirm: null })
}

/**
 * 记一笔改动。
 *
 * ⚠ 同一个字段第二次被改时**保留最早那次的 `firstInverse`**（见
 * `StudioOperatorChange` 头注）：只留最近一次，撤销会停在助手的中间版本上。
 */
export function recordOperatorChange(change: StudioOperatorChange): void {
  const existing = state.changes[change.field]
  emitSlice({
    changes: {
      ...state.changes,
      [change.field]: existing
        ? {
            ...change,
            firstInverse: existing.firstInverse,
            previousLabel: existing.previousLabel,
          }
        : change,
    },
  })
}

export function clearOperatorChange(field: StudioOperatorField): void {
  if (!state.changes[field]) return
  const changes = { ...state.changes }
  delete changes[field]
  emitSlice({ changes })
}

/**
 * 载入一段历史（P4-B，拍板 10 的「历史」那一半）。
 *
 * ⭐ **只换会话，不碰表单**：`changes` / `primed` 两个分槽一个都不动。
 * 它们说的是「助手在这台工作台上把哪些旋钮拧过、哪一枪备着」，而那是表单此刻的
 * 事实，与用户翻看哪一段对话无关。顺手清掉的下场是「翻了一眼历史，✦ 标记全没了、
 * 撤不回去了」。
 * ⚠ 反过来也一样：载回来的历史**不会**让 primed 或撤销钮复活 —— 那些字段在历史
 * 类型里根本不存在。
 */
export function loadOperatorThread(args: {
  history: readonly StudioOperatorHistoryEntry[]
  /** 那一行 `rounds` 列里读出来的结论记录（§7.7 回填）。缺席 = 这条会话一条都没有。 */
  rounds?: readonly AssistantOperatorRoundSummary[]
  sessionId: string | null
  sessionSurface: AssistantSurfaceId | null
  /**
   * 这段会话末尾**还没决定的那一下**（owner 09-27 刷新丢卡）：放回面板上，状态
   * 回到「等你定」。缺席 = 没有；⚠ 换一段会话时旧的问题 / 卡一并清掉。
   */
  pending?: StudioOperatorPending | null
  /** 这段会话是和谁聊（会话菜单那一行带来的）；缺席 = 工作会话。 */
  chatCharacter?: StudioOperatorChatCharacter | null
}): void {
  const pending = args.pending ?? null
  emit({
    ...state,
    localThreadId: crypto.randomUUID(),
    status: pending ? 'awaitingConfirm' : 'idle',
    question:
      pending?.kind === 'question'
        ? {
            id: nextOperatorEntryId('question'),
            questions: pending.questions,
            answers: [],
            ...(pending.why ? { why: pending.why } : {}),
          }
        : null,
    confirm:
      pending && pending.kind !== 'question'
        ? {
            ...pending,
            id: nextOperatorEntryId('confirm'),
            status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
          }
        : null,
    history: args.history,
    historyRounds: args.rounds ?? EMPTY_ROUNDS,
    sessionId: args.sessionId,
    saveFailed: false,
    sessionSurface: args.sessionSurface,
    entries: [],
    outOfSteps: false,
    stepsDone: 0,
    plannedSteps: 0,
    errorText: null,
    errorTrace: null,
    errorCode: null,
    errorMissingKey: null,
    queue: [],
    // ⚠ 登记表留着：它只是 `<@kind:id>` 的名字 / 缩略图，别的作用域的草稿可能还
    //   指着它们（换档回来胶囊不该变成「已删除」）。待写进正文的那几条跟着线程走。
    mentions: state.mentions,
    mentionInbox: [],
    selectedResultId: null,
    pendingResultId: null,
    capturingFrames: false,
    resume: null,
    incognito: false,
    offTheRecord: false,
    chatCharacter: args.chatCharacter ?? null,
    chatMode: chatModeFromHistory(args.history),
  })
  hydrateOperatorResume()
}

/**
 * 保存成功后回填库里那一行的身份。
 *
 * ⚠ `surface` 只在**第一次**落库时定下来（线程起始域），之后原样带回去 ——
 * 见 `sessionSurface` 的头注。
 */
export function setOperatorSession(
  /** `null` = 那一行没了（别处删了），下一次保存整份新建。 */
  sessionId: string | null,
  sessionSurface: AssistantSurfaceId | null,
  identity?: Pick<StudioOperatorState, 'threadScope' | 'localThreadId'>,
): boolean {
  const current = identity ? getOperatorThread(identity.threadScope) : state
  if (
    !current ||
    (identity && current.localThreadId !== identity.localThreadId)
  ) {
    return false
  }
  if (
    current.sessionId === sessionId &&
    current.sessionSurface === sessionSurface
  ) {
    return true
  }
  const resume = current.resume ? { ...current.resume, sessionId } : null
  const next: StudioOperatorState = {
    ...current,
    sessionId,
    sessionSurface,
    resume,
    saveFailed: false,
  }
  if (resume && current.threadScope && current.sessionId !== sessionId) {
    if (writeOperatorResume(current.threadScope, next, resume)) {
      clearOperatorResume(current.threadScope, current)
    }
  }
  updateThread(current, next)
  return true
}

export function setOperatorSaveFailed(
  identity: Pick<StudioOperatorState, 'threadScope' | 'localThreadId'>,
  saveFailed: boolean,
): void {
  const current = getOperatorThread(identity.threadScope)
  if (
    !current ||
    current.localThreadId !== identity.localThreadId ||
    current.saveFailed === saveFailed
  )
    return
  updateThread(current, { ...current, saveFailed })
}

// ─── 断点续跑（第三期）────────────────────────────────────────────
//
/**
 * 刷新之后把那一份读回来（外壳挂载时调一次）。
 *
 * ⚠ 读不动 / 过期 / 没存过一律填 `null` —— 判据全在 `readOperatorResume` 里，
 * ⛔ 这里不再判一次。
 */
export function hydrateOperatorResume(now: number = Date.now()): void {
  if (!state.threadScope) return
  const resume = readOperatorResume(state.threadScope, state, now)
  emit({ ...state, resume })
}

/**
 * 计划卡刚被批准 —— 落一份新的续跑记录。
 *
 * ⚠ 每一份**整个顶掉**上一份，⛔ 不做「几份计划排队」：用户点「开始」时想的是
 * 这一份，而一个能同时提示两份未完成计划的面板没有人读得懂。
 */
export function startOperatorResumePlan(input: {
  planId: string
  labels: readonly string[]
  now?: number
}): void {
  if (!state.threadScope) return
  const resume = createResumePlan({
    planId: input.planId,
    domain: state.domain,
    sessionId: state.sessionId,
    labels: input.labels,
    now: input.now ?? Date.now(),
  })
  if (!resume) return
  writeOperatorResume(state.threadScope, state, resume)
  emit({ ...state, resume, entries: withPlanProgress(state.entries, resume) })
}

/**
 * 把续跑记录的逐项状态抄到同 id 的那条计划上（D12 S9：计划只出现一次、逐项打勾）。
 * ⚠ 找不到那条计划就原样返回 —— 不是每份续跑记录都有一条可画的计划。
 */
function withPlanProgress(
  entries: readonly StudioOperatorThreadEntry[],
  resume: StudioOperatorResumePlan,
): readonly StudioOperatorThreadEntry[] {
  const index = entries.findIndex(
    (entry) => entry.kind === 'plan' && entry.id === resume.planId,
  )
  const entry = entries[index]
  if (!entry || entry.kind !== 'plan') return entries
  const next = [...entries]
  next[index] = {
    ...entry,
    progress: resume.steps.map((step) => step.state),
  }
  return next
}

/**
 * 某一步有结论了（做完 / 挂了）。
 *
 * ⚠ **先落盘再 emit**：反过来的话，写盘失败（无痕模式 / 配额满）时屏幕上写着
 * 「4/6」而刷新之后一步都没有 —— 那种不一致没有任何人会去查。
 * ⚠ 没有在飞的计划时整个是 no-op：没有计划的那一轮里每一步都来敲一次门，判在
 * 这里一次好过让四个调用点各判一次。
 */
export function markOperatorResumeStep(
  stepId: string,
  patch: {
    state: StudioOperatorResumeStep['state']
    artifactIds?: readonly string[]
    reason?: string
  },
  now: number = Date.now(),
): void {
  if (!state.threadScope || !state.resume) return
  const next = markResumeStep(state.resume, stepId, patch, now)
  // ⚠ 同一个引用 = 那一步压根不在这份计划里（`markResumeStep` 的短路）。
  if (next === state.resume) return
  writeOperatorResume(state.threadScope, state, next)
  emit({
    ...state,
    resume: next,
    entries: withPlanProgress(state.entries, next),
  })
}

/**
 * 这份计划到此为止（跑完了 / ＋新对话 / 用户不打算续了）。
 *
 * ⛔ **不留「已完成的历史计划」**：续跑记录的唯一用途是那颗按钮，跑完之后它只是
 * 一格会过期的噪音。
 */
export function clearOperatorResumePlan(): void {
  if (state.threadScope) clearOperatorResume(state.threadScope, state)
  if (!state.resume) return
  emit({ ...state, resume: null })
}

/**
 * 新对话（拍板 10 的「＋新对话」）。
 *
 * ⚠ **只清线程，不清登记簿与 primed**：表单上那些改动还在，登记簿是它们唯一的
 * 撤销本钱。开个新话题就把撤销能力清掉，用户会发现「✦ 标记还在、点了没反应」——
 * 而那是最难查的一类失败。要清改动有专门的入口（拍板 14 的二击确认）。
 * ⚠ 历史与会话身份**要一起清**（P4-B）：留着 `sessionId` 的话，「新对话」之后
 * 第一次保存会把新线程写进**上一条会话那一行**，库里永远只有一条。
 */
export function resetOperatorThread(
  identity?: Pick<StudioOperatorState, 'threadScope' | 'localThreadId'>,
): void {
  const current = identity ? getOperatorThread(identity.threadScope) : state
  if (
    !current ||
    (identity && current.localThreadId !== identity.localThreadId)
  )
    return
  if (current.threadScope) clearOperatorResume(current.threadScope, current)
  updateThread(current, {
    ...current,
    localThreadId: crypto.randomUUID(),
    saveFailed: false,
    // 新会话只在隐身还开着时不存；上一段开过隐身不连累这一段。
    offTheRecord: current.incognito,
    status: 'idle',
    history: EMPTY_HISTORY,
    historyRounds: EMPTY_ROUNDS,
    chatCharacter: null,
    chatMode: null,
    sessionId: null,
    sessionSurface: null,
    entries: [],
    question: null,
    confirm: null,
    outOfSteps: false,
    stepsDone: 0,
    plannedSteps: 0,
    errorText: null,
    errorTrace: null,
    errorCode: null,
    errorMissingKey: null,
    // ⚠ 队列跟着走：排的那几句是说给**上一条线程**听的，留到新话题里接住，
    //   用户会看到助手回答一个他已经翻篇的问题。
    queue: [],
    selectedResultId: null,
    // ⚠ 在飞那张结果卡跟着走：新话题里它指向的条目已经不在线程里了。
    pendingResultId: null,
    // ⚠ `mentions` **不清**：它属于用户此刻正在写的那条消息（与草稿同命），
    //   而「＋新对话」清的是已经说完的那些。顺手清掉 = 挂好的三张图凭空消失。
    /**
     * ⭐ 「不再问」跟着会话走（§6 拍板 24 的第一条要素）—— 新话题重新硬确认。
     * ⛔ 留着它的表现是：用户为上一个话题批过一次 4 credits，新话题里助手直接
     * 又发了一枪，而他这一次根本没看见过任何确认卡。
     */
    /**
     * ⛔ `reviewStates` **不清**：那是用户对产物的判断，与聊哪条线程无关。
     */
    /**
     * ⭐ 续跑记录也跟着会话走：那份没跑完的计划是**上一个话题**的事，留在新话题
     * 里的表现是一颗「从第 4 步继续」按钮，点下去助手接着做用户已经翻篇的活。
     * ⚠ 盘上那一格由 `clearOperatorResumePlan()` 清 —— 只清内存镜像的话，刷新
     *   之后它自己又回来了。
     */
    resume: null,
  })
}
