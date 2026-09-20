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

import type { StudioOperatorCheckpoint } from '@/types/studio-operator-checkpoint'
import { useSyncExternalStore } from 'react'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { AssistantPersonaPlanMode } from '@/constants/assistant-persona'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import type { GenerationReviewState } from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  type StudioOperatorConfirmStatus,
  type StudioOperatorField,
} from '@/constants/studio-assistant-operator'
import {
  createOperatorClaim,
  type StudioOperatorClaim,
} from '@/lib/studio-operator-claim'
import {
  clearOperatorResume,
  createResumePlan,
  markResumeStep,
  readOperatorResume,
  writeOperatorResume,
} from '@/lib/studio-operator-resume'
import type {
  StudioOperatorResumePlan,
  StudioOperatorResumeStep,
} from '@/types/studio-operator-resume'
import type {
  StudioOperatorAttachment,
  StudioOperatorCardMention,
  StudioOperatorChange,
  StudioOperatorConfirmPrompt,
  StudioOperatorMessageEntry,
  StudioOperatorQuestionPrompt,
  StudioOperatorQueuedMessage,
  StudioOperatorResultEntry,
  StudioOperatorStatus,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'
import type {
  AssistantOperatorRoundSummary,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { AssistantSurfaceId } from '@/types/assistant-conversation'
import type { StudioOperatorHistoryEntry } from '@/types/studio-operator-history'

/**
 * **按域分槽**的那三样（P4-A，拍板 8）。
 *
 * ⭐ 判据：它们说的是「助手在**这个工作台上**做了什么、正在问什么、把哪个生成键
 * 点亮了」。线程是跨域连续的（拍板 8：切域不断会话），这三样不是 ——
 *  · `changes` 不分槽的下场：助手在视频档改了提示词，图片档那条「✦ 提示词」的
 *    登记被顶掉，回到图片档一点还原，撤的是视频那一版（真正的「误标」）；
 *  · `primed` 不分槽的下场：在图片档备好一枪、切到视频，视频的生成键跟着亮起来
 *    —— 而那份表单助手根本没碰过；
 * ⚠ **覆写三选那条子已经不在这里了**（v2 §3.1）：它降级成了问题卡，而问题卡
 *   钉在输入框上方、一次只有一张（§3.4）—— 于是它跟着 `question` 走全局那一份。
 */
interface StudioOperatorDomainSlice {
  changes: Readonly<Partial<Record<StudioOperatorField, StudioOperatorChange>>>
  primed: boolean
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
  /**
   * 那一行的 `surface` —— **线程起始域**，⛔ 不跟着当前域走。
   *
   * ⚠ 一条线程可以跨域（拍板 8），而 `surface` 是单值。切到视频档时顺手把它改成
   * `VIDEO_STUDIO` 的下场是这条线程从图片档的历史列表里消失了 —— 用户在原地
   * 找不回自己刚才聊的东西。域切换的痕迹在 `messages` 里的 domainMark 条目上。
   */
  sessionSurface: AssistantSurfaceId | null
  /** ⚠ **跨域连续**（拍板 8）：域标记就长在这条线程里。 */
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
   * `@` 提及的那些图（§3.3 四入口共用的**同一条 chip 管线**）。
   *
   * ⚠ 类型就是附件类型，**不另立一个 mention 形状**：发送时它们与 📎 挂的那些
   * 合成同一个数组送出去（`send(text, [...attachments, ...mentions])`），
   * 服务端一个新字段都没有。分成两种形状的下场是下游要处处判「这是 @ 来的还是
   * 📎 来的」，而对助手来说它们本来就是同一件事：这条消息附带的图。
   * ⚠ 同样住在 store：它属于**还没发出去的那条消息**，与草稿同命（草稿今天住在
   * dock 的 state 里 —— 本片不动 dock，chip 放这里反而更抗卸载）。
   */
  mentions: readonly StudioOperatorAttachment[]
  /**
   * `@` 上来的**上下文卡**（切片 Y）—— 与 `mentions` 分开的一排。
   *
   * ⭐ 分开的判据写在 `StudioOperatorCardMention` 的头注里：卡不是附件，
   * 混进同一个数组会让「将看 N 张」把卡也数进去。
   * ⚠ 与 `mentions` 同命：属于用户正在写的那条消息，发出去之后一起清。
   */
  cardMentions: readonly StudioOperatorCardMention[]
  /**
   * **这一轮只信这几个来源**（v2 §9.3 ·「+」菜单的「指定来源」）。
   *
   * ⚠ 与 `mentions` 同命：它属于用户此刻正在写的那条消息 —— 发出去就清，⛔ 不
   * 写库。用户为一个问题临时指了几个源，不该变成他此后每一轮的规矩；要一直生效
   * 的那份住在设置弹层的规则页里（`ProjectRule.kind`）。
   * ⚠ 每一条是**来源 id 或域名**，与服务端收的是同一种东西。
   */
  sourceAllowlist: readonly string[]
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
   * ⚠ 它**只关掉写入**：这一轮照常跑、照常结账下发，只是一条记忆都不落。
   */
  incognito: boolean
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
}

const EMPTY_SLICE: StudioOperatorDomainSlice = {
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
  sessionSurface: null,
  entries: [],
  ...EMPTY_SLICE,
  stepsDone: 0,
  plannedSteps: 0,
  errorText: null,
  queue: [],
  mentions: [],
  cardMentions: [],
  sourceAllowlist: [],
  selectedResultId: null,
  pendingResultId: null,
  planMode: ASSISTANT_PERSONA_DEFAULTS.planMode,
  question: null,
  confirm: null,
  incognito: false,
  capturingFrames: false,
  reviewStates: {},
  resume: null,
  historyRounds: EMPTY_ROUNDS,
}

/**
 * ⚠ 分槽的那三样存在这里，**扁平化之后才进 `state`**。
 *
 * 为什么不让 `getSnapshot` 现算：`useSyncExternalStore` 要求快照是**稳定引用**，
 * 每次现算一个新对象会判定「变了」而无限重渲染（见文件头注）。所以每次写入都
 * 重建一次扁平快照，读永远读那一个 —— 代价是每个 mutator 多一行，换来的是
 * 全部消费者一行都不用改。
 */
const slices: Record<AssistantOperatorDomain, StudioOperatorDomainSlice> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: EMPTY_SLICE,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: EMPTY_SLICE,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: EMPTY_SLICE,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: EMPTY_SLICE,
}

let state: StudioOperatorState = INITIAL_STATE
let entrySeq = 0
const listeners = new Set<() => void>()

function emit(next: StudioOperatorState): void {
  state = next
  for (const listener of listeners) listener()
}

/** 改当前域的那一槽，并把扁平快照重建出来。 */
function emitSlice(patch: Partial<StudioOperatorDomainSlice>): void {
  const next: StudioOperatorDomainSlice = { ...slices[state.domain], ...patch }
  slices[state.domain] = next
  emit({ ...state, ...next })
}

/**
 * 切域（拍板 8）—— **换工具、不断会话**。
 *
 * ⭐ 域标记与 `domain` 在**同一次写入**里落地，⛔ 不拆成两个调用：拆开就有一个
 * 「标记已插、域还没切」的中间态，而那一帧里发出去的请求会带着旧域的工具表。
 * ⚠ 线程是空的就不插标记：一条「切到视频工作台」孤零零地开头，说的是一件还没
 * 发生过的事。
 * ⚠ 域没变时**整个是 no-op**（连一次 emit 都不发）：模态切换那条 effect 会在
 * 每次表单变化时被求值，白发一次 emit 就是全面板一次重渲染。
 */
export function switchOperatorDomain(domain: AssistantOperatorDomain): void {
  if (state.domain === domain) return
  /**
   * ⚠ 「线程是空的」要**把载回来的历史也算上**（P4-B）：刷新之后 `entries` 是空
   * 的而对话明明就在眼前，只看 `entries` 的下场是切域那一条标记不再插 ——
   * 于是历史里出现「上一句还在聊图片，下一句突然在配音」而没有任何交代。
   */
  const entries =
    state.entries.length > 0 || state.history.length > 0
      ? [
          ...state.entries,
          {
            kind: 'domainMark' as const,
            id: nextOperatorEntryId('domain'),
            domain,
          },
        ]
      : state.entries
  emit({ ...state, domain, entries, ...slices[domain] })
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

// ─── 归属追踪（P3-C，拍板 4）──────────────────────────────────────
//
// ⛔ **和 `runner` 一样不进 `state`**：它不是渲染要读的数据，进了 state 只会让
// 每一次轮询都触发一遍全面板重渲染。逻辑本体是纯函数（`lib/studio-operator-claim.ts`），
// 这里只是那张票的家。

/**
 * 此刻在跑的那些 run item id。
 *
 * ⭐ 由观察 hook 每次 `activeRun` 变化时写进来，**领票时同步读它** ——
 * 领票发生在按钮的 onClick 里（那里没有 `activeRun`），而票上必须抄下
 * 「领票那一刻已经存在的那些」才分得出后来新冒出来的是不是这一枪。
 */
let latestRunItemIds: readonly string[] = []
let claim: StudioOperatorClaim | null = null

export function publishOperatorRunItemIds(ids: readonly string[]): void {
  latestRunItemIds = ids
}

/**
 * 领票 —— **只该由「primed 态下真的按下去的那一次生成」调用**。
 *
 * ⚠ 调用方（生成键）必须自己先确认那三个前提（primed / 没在跑 / 没被挡），
 * 判据与 `handleGenerate` 自己的守卫逐条一致。在这里再判一遍做不到：这个模块
 * 看不见表单。
 */
export function claimOperatorGeneration(): void {
  claim = createOperatorClaim(Date.now(), latestRunItemIds)
}

export function getOperatorClaim(): StudioOperatorClaim | null {
  return claim
}

export function setOperatorClaim(next: StudioOperatorClaim | null): void {
  claim = next
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
export function appendOperatorPending(id: string): void {
  appendOperatorEntry({ kind: 'message', id, text: '', streaming: true })
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
): void {
  const index = state.entries.findIndex(
    (item) => item.kind === 'message' && item.id === id,
  )
  const current = index >= 0 ? state.entries[index] : undefined
  const text =
    current && current.kind === 'message' ? `${current.text}${delta}` : delta
  const entry: StudioOperatorMessageEntry = {
    kind: 'message',
    id,
    text,
    streaming: true,
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
  /** 「为什么」那一段（2026-09-06 面板轮，第 4 件）—— 面板把它折起来。 */
  detail?: string,
): void {
  const entry: StudioOperatorMessageEntry = {
    kind: 'message',
    id,
    text,
    ...(detail ? { detail } : {}),
  }
  const index = state.entries.findIndex(
    (item) => item.kind === 'message' && item.id === id,
  )
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
  emit({ ...state, entries: state.entries.filter((_, i) => i !== index) })
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

/**
 * 落一条日志。
 *
 * ⭐ **按条目 id 覆盖，不是追加** —— 同一步会来两次（`running` 然后
 * `done` / `error`，见协议词表）。追加的表现是日志流里每一步重复两行，
 * 而这正是这份契约在注释里点名警告过的那个错。
 * `runKey` 由驱动 hook 每轮现给（见 `operatorStepEntryId`）。
 */
export function setOperatorStepCheckpoint(
  entryId: string,
  checkpoint: StudioOperatorCheckpoint,
): void {
  emit({
    ...state,
    entries: state.entries.map((entry) =>
      entry.kind === 'step' && entry.id === entryId
        ? { ...entry, checkpoint }
        : entry,
    ),
  })
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
    ...(existing?.checkpoint ? { checkpoint: existing.checkpoint } : {}),
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

/**
 * 截断**这一轮之后**的线程（checkpoint 薄卡的「连对话一起回」，§3.2）。
 *
 * ⭐ 保留这一轮自己的那些条目：用户撤的是「这一轮**之后**发生的事」，把这一轮
 * 也删掉的话，划线的日志（撤销的证据）会跟着消失 —— 而那正是他要复核的东西。
 * ⚠ 只认 `runKey`，⛔ 不去劈条目 id（它是 `runKey:stepId` 拼的，runKey 里哪天
 * 多一个冒号这种字符串手术就会静默失效）。
 * ⚠ 这一轮**一条步都没有**时整个是 no-op：找不到锚点就截断，等于把整条线程清空。
 * ⚠ `history`（载回来的只读段）一个字节都不动：它在这一轮之前，且本来就撤不了。
 */
export function truncateOperatorThreadAfterRound(runKey: string): void {
  let anchor = -1
  state.entries.forEach((entry, index) => {
    if (entry.kind === 'step' && entry.runKey === runKey) anchor = index
  })
  if (anchor < 0 || anchor === state.entries.length - 1) return
  emit({ ...state, entries: state.entries.slice(0, anchor + 1) })
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
): void {
  emit({ ...state, status, errorText })
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

// ─── @ chip（§3.3 / §7）──────────────────────────────────────────

/**
 * 加一枚 chip。
 *
 * ⚠ **按 id 去重**：四个入口（@ 选择器 / 结果卡「问助手」/ 拖图 / 歧义单选）
 * 都可能指向同一张图，重复的 chip 会让「将看 N 张」多数一张，而助手那边看到的
 * 还是一张 —— 界面上的数字与实际不符是本仓明令不许的那种失败。
 */
export function addOperatorMention(mention: StudioOperatorAttachment): void {
  if (state.mentions.some((item) => item.id === mention.id)) return
  emit({ ...state, mentions: [...state.mentions, mention] })
}

export function removeOperatorMention(id: string): void {
  if (!state.mentions.some((item) => item.id === id)) return
  emit({ ...state, mentions: state.mentions.filter((item) => item.id !== id) })
}

/** 发出去之后清空 —— chip 属于**那一条消息**，不是一直挂着的设置。 */
export function clearOperatorMentions(): void {
  if (
    state.mentions.length === 0 &&
    state.cardMentions.length === 0 &&
    state.sourceAllowlist.length === 0
  ) {
    return
  }
  // ⚠ 三排一起清：卡、图与这一轮指的来源都属于刚发出去的那一条消息。
  emit({ ...state, mentions: [], cardMentions: [], sourceAllowlist: [] })
}

/**
 * **这一轮只信这几个来源**（§9.3）——「+」菜单那一页按一下就整份换掉。
 *
 * ⚠ 收的是**整份名单**而不是逐条加：那一页本身就是一组多选，逐条加/减会让
 * 「全清」变成一串 remove 调用。⛔ 不去重之外做任何清洗：token 的那把刀在
 * schema 层（服务端照样再过一遍）。
 */
export function setOperatorSourceAllowlist(sources: readonly string[]): void {
  const next = [...new Set(sources)]
  if (
    next.length === state.sourceAllowlist.length &&
    next.every((item, index) => item === state.sourceAllowlist[index])
  ) {
    return
  }
  emit({ ...state, sourceAllowlist: next })
}

/**
 * 挂一张上下文卡（切片 Y）。
 *
 * ⚠ 按 `cardId` 去重：`@` 两次同一张卡，chip 排上不该出现两颗一模一样的。
 */
export function addOperatorCardMention(card: StudioOperatorCardMention): void {
  if (state.cardMentions.some((item) => item.cardId === card.cardId)) return
  emit({ ...state, cardMentions: [...state.cardMentions, card] })
}

export function removeOperatorCardMention(cardId: string): void {
  if (!state.cardMentions.some((item) => item.cardId === cardId)) return
  emit({
    ...state,
    cardMentions: state.cardMentions.filter((item) => item.cardId !== cardId),
  })
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
export function setOperatorIncognito(incognito: boolean): void {
  if (state.incognito === incognito) return
  emit({ ...state, incognito })
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

export function clearOperatorChanges(): void {
  // ⚠ 只清**当前域**：拍板 14 那颗按钮长在参数栏上，它说的是「这个工作台上助手
  //   改的那些」。顺手把别的域一起清掉，用户会发现自己切回去之后 ✦ 全没了。
  emitSlice({ changes: {}, primed: false })
}

export function restoreOperatorThreadCheckpoint(
  history: readonly StudioOperatorHistoryEntry[],
  subject: string,
): void {
  clearOperatorResumePlan()
  for (const slice of Object.values(slices)) {
    slice.changes = {}
  }
  emitSlice({ changes: {}, primed: false })
  emit({
    ...state,
    history,
    entries: [
      {
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'checkpointRestored',
        subject,
      },
    ],
    status: 'idle',
    queue: [],
    question: null,
    confirm: null,
    stepsDone: 0,
    plannedSteps: 0,
    errorText: null,
  })
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
}): void {
  emit({
    ...state,
    status: 'idle',
    history: args.history,
    historyRounds: args.rounds ?? EMPTY_ROUNDS,
    sessionId: args.sessionId,
    sessionSurface: args.sessionSurface,
    entries: [],
    stepsDone: 0,
    plannedSteps: 0,
    errorText: null,
  })
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
): void {
  if (
    state.sessionId === sessionId &&
    state.sessionSurface === sessionSurface
  ) {
    return
  }
  emit({ ...state, sessionId, sessionSurface })
}

// ─── 断点续跑（第三期）────────────────────────────────────────────
//
// ⭐ **scope 与 runner 同族，不进 `state`**：它不是渲染要读的数据（渲染读的是
// `state.resume`），进了 state 只会让外壳每次挂载都触发一次全面板重渲染。
// ⚠ 没设过 scope 时**所有写入都是 no-op**：一份不知道该存到哪个项目下的计划
// 存进一个默认键，下一次换项目就会问「要继续吗」而那份计划与眼前的画布无关。

let resumeScope: string | null = null

/**
 * 这台工作台的续跑记录存哪一格（项目 id / 工作台 surface）。
 *
 * ⚠ 换 scope 时**顺手把镜像清掉**：留着上一个项目那份的表现是刚切过去的那一帧
 * 里进度带写着「有未完成计划」，而它说的是上一个项目的事。真正该显示的那一份由
 * 紧随其后的 `hydrateOperatorResume()` 填回来。
 */
export function setOperatorResumeScope(scope: string | null): void {
  if (resumeScope === scope) return
  resumeScope = scope
  if (state.resume) emit({ ...state, resume: null })
}

export function getOperatorResumeScope(): string | null {
  return resumeScope
}

/**
 * 刷新之后把那一份读回来（外壳挂载时调一次）。
 *
 * ⚠ 读不动 / 过期 / 没存过一律填 `null` —— 判据全在 `readOperatorResume` 里，
 * ⛔ 这里不再判一次。
 */
export function hydrateOperatorResume(now: number = Date.now()): void {
  if (!resumeScope) return
  const resume = readOperatorResume(resumeScope, now)
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
  if (!resumeScope) return
  const resume = createResumePlan({
    planId: input.planId,
    domain: state.domain,
    sessionId: state.sessionId,
    labels: input.labels,
    now: input.now ?? Date.now(),
  })
  if (!resume) return
  writeOperatorResume(resumeScope, resume)
  emit({ ...state, resume })
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
  if (!resumeScope || !state.resume) return
  const next = markResumeStep(state.resume, stepId, patch, now)
  // ⚠ 同一个引用 = 那一步压根不在这份计划里（`markResumeStep` 的短路）。
  if (next === state.resume) return
  writeOperatorResume(resumeScope, next)
  emit({ ...state, resume: next })
}

/**
 * 这份计划到此为止（跑完了 / ＋新对话 / 用户不打算续了）。
 *
 * ⛔ **不留「已完成的历史计划」**：续跑记录的唯一用途是那颗按钮，跑完之后它只是
 * 一格会过期的噪音。
 */
export function clearOperatorResumePlan(): void {
  if (resumeScope) clearOperatorResume(resumeScope)
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
export function resetOperatorThread(): void {
  emit({
    ...state,
    status: 'idle',
    history: EMPTY_HISTORY,
    historyRounds: EMPTY_ROUNDS,
    sessionId: null,
    sessionSurface: null,
    entries: [],
    question: null,
    confirm: null,
    stepsDone: 0,
    plannedSteps: 0,
    errorText: null,
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
  clearOperatorResumePlan()
}
