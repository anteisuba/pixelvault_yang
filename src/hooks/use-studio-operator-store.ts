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
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_PLAN_MODE_IDS,
} from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { AssistantPersonaPlanMode } from '@/constants/assistant-persona'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { StudioOperatorField } from '@/constants/studio-assistant-operator'
import {
  createOperatorClaim,
  type StudioOperatorClaim,
} from '@/lib/studio-operator-claim'
import type {
  StudioOperatorAttachment,
  StudioOperatorChange,
  StudioOperatorChoicePrompt,
  StudioOperatorConfirm,
  StudioOperatorMessageEntry,
  StudioOperatorPlanPrompt,
  StudioOperatorQuestionAnswer,
  StudioOperatorQueuedMessage,
  StudioOperatorSpendPrompt,
  StudioOperatorStatus,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'
import type { AssistantOperatorConfirmChoice } from '@/constants/assistant-operator'
import type {
  AssistantOperatorAutoApprove,
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
 *  · `confirm` 不分槽的下场：问的是图片档的提示词，条子却出现在视频档的参数栏上。
 */
interface StudioOperatorDomainSlice {
  changes: Readonly<Partial<Record<StudioOperatorField, StudioOperatorChange>>>
  confirm: StudioOperatorConfirm | null
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
  /** 就地确认条（拍板 3）。非 null 时流已经停了，等用户选。**当前域的那一份。** */
  confirm: StudioOperatorConfirm | null
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
   * 结果行卡上被点中的那一格（§4.2「结果行卡：未选 / 已选 / 被 @」）。
   *
   * ⚠ 存 id 不存整条：那一批的内容来自宿主的在飞回流，每次轮询都是新对象，
   * 存整条会在下一次轮询后指向一份陈旧的记录。
   */
  selectedResultId: string | null
  /**
   * 「先问我」开关（§3.3 后两行）—— 本轮强制先出计划卡。
   *
   * ⚠ **本片只到状态为止**：真正「强制出卡」的那一半由计划卡片那一片接
   * （客户端硬判在 §5 的流程图里）。⛔ 但开关不能因此做成假的 —— 它此刻就真的
   * 在存值，接线那一片读它即可，形状一行不用改。
   * ⚠ 跨域不分槽：它说的是「这个助手这一轮先问不问我」，与站在哪台工作台无关。
   */
  askFirst: boolean
  /**
   * persona 的「默认行为」（§8.2 `planMode`）—— **store 里存一份的唯一理由**是
   * 驱动 hook 要在事件处理器里同步读它（`getOperatorState()`），而 persona 是
   * 一次异步拉取的结果。
   *
   * ⚠ ⛔ 别在驱动 hook 里再调一次 `useAssistantPersona()`：那会在同一棵树上开出
   * 第二个 `GET /api/assistant/persona`，两份数据还会各说各话。外壳拉一次、
   * 写进来一次，读的人都读这一个。
   * ⚠ `always` 时「先问我」发完**不复位**（§3.3 / 拍板：单轮关掉只对本轮生效）。
   */
  planMode: AssistantPersonaPlanMode
  /**
   * 钉在流末尾的三张「等你定」的卡（§4.1）。
   *
   * ⚠ 三张各自最多一张，且**跨域不分槽**：它们属于「此刻这条流停在哪儿」，而流
   * 本来就只有一条。切域时由驱动 hook 一起清（同 `confirm` 的理由）。
   */
  plan: StudioOperatorPlanPrompt | null
  spend: StudioOperatorSpendPrompt | null
  choice: StudioOperatorChoicePrompt | null
  /**
   * 「本会话此类不再问」的条子（§6 拍板 24）—— **会话级**。
   *
   * ⭐ 作用域三要素里的「同会话」由这里负责：换一条线程（`resetOperatorThread`）
   * 它就没了，于是下一次生成重新硬确认。另外两条（同模型 / 不超上次金额）由服务端
   * 逐条核 —— 客户端只是把条子原样带上去。
   * ⛔ **不落 localStorage**：跨刷新还记着「不再问」，等于用一次点击买断了以后
   * 每一次花钱的确认，而用户当时同意的是「本会话」。
   */
  autoApprove: AssistantOperatorAutoApprove | null
}

const EMPTY_SLICE: StudioOperatorDomainSlice = {
  changes: {},
  confirm: null,
  primed: false,
}

const INITIAL_DOMAIN: AssistantOperatorDomain =
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image

const EMPTY_HISTORY: readonly StudioOperatorHistoryEntry[] = []

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
  selectedResultId: null,
  askFirst: false,
  planMode: ASSISTANT_PERSONA_DEFAULTS.planMode,
  plan: null,
  spend: null,
  choice: null,
  autoApprove: null,
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

/**
 * 「续跑」的注册口。
 *
 * ⚠ 就地确认条长在**参数栏**（提示词框底下，拍板 3 要求「就地」），而续跑要
 * 重发整条流 —— 那件事只有面板里的驱动 hook 做得到。两棵组件树之间没有共同的
 * Provider（见文件头注：本片不动 `studio-context.tsx`），所以留一个模块级的
 * 命令口：面板挂载时注册，卸载时注销。
 *
 * ⛔ 它**不进 `state`**：它不是渲染要读的数据，进了 state 只会让每次注册都触发
 * 一次全面板重渲染。
 */
export interface StudioOperatorRunner {
  resume(choice: AssistantOperatorConfirmChoice): void
}

let runner: StudioOperatorRunner | null = null

export function registerOperatorRunner(
  next: StudioOperatorRunner | null,
): void {
  runner = next
}

export function getOperatorRunner(): StudioOperatorRunner | null {
  return runner
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
 * 助手正文的**占位行**（§4.1「发送即回显」）—— 发出去的同一帧就落进线程。
 *
 * ⭐ 它就是一条 `text: ''` 的流式正文条：占位与正文**共用一条条目**，第一个
 * `message_delta` 直接往它里面写字。⛔ 不做「另起一种 placeholder 条目、到货再
 * 换成 message 条目」—— 换条目 = 换 React key = 头像和那一行整个重挂一次，
 * 而用户看到的是刚出现的占位行闪一下又跳一格。
 */
export function appendOperatorPending(id: string): void {
  appendOperatorEntry({ kind: 'message', id, text: '', streaming: true })
}

/**
 * 把一块增量累加进正文条。条目不在（占位行已被别的事件吃掉）就新起一条。
 *
 * ⚠ **追加**，不是覆盖：服务端每帧只发新解出来的那几个字。
 */
export function appendOperatorMessageDelta(id: string, text: string): void {
  const index = state.entries.findIndex(
    (entry) => entry.kind === 'message' && entry.id === id,
  )
  if (index < 0) {
    appendOperatorEntry({ kind: 'message', id, text, streaming: true })
    return
  }
  const existing = state.entries[index] as StudioOperatorMessageEntry
  emit({
    ...state,
    entries: state.entries.map((entry, i) =>
      i === index
        ? { ...existing, text: existing.text + text, streaming: true }
        : entry,
    ),
  })
}

/**
 * 定稿一条正文 —— 服务端那一版**整体覆盖**累积值，并把 `streaming` 降下来。
 *
 * ⭐ 覆盖而不是「校验一下累积对不对」：增量是从半截 JSON 里现解的，转义、围栏、
 * 模型改口都会让它与定稿差一两个字符。差一两个字符没人查得出来，覆盖一次就没了。
 */
export function finalizeOperatorMessage(
  id: string,
  text: string,
  /**
   * 「为什么」那一段（2026-09-06 面板轮，第 4 件）—— 面板把它折起来。
   * ⚠ 只在定稿这一跳落地：增量帧里没有它（服务端只在整份 turn 解出来之后才有
   * 这一段），⛔ 别为它另开一条流式通道。
   */
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
 * 把一条正文**从流态里放下来**，不动它的字。
 *
 * ⭐ 用在那几条**中途 return 的路径**上（计划卡到达就掐流、abort、出错）：那时
 * 定稿帧永远不会来了，而条目还举着 `streaming` 旗。旗本身今天不改变渲染，但它
 * 是一句假话 —— 哪天给流式正文加一颗光标，那颗光标就会在一条早已停下的回复
 * 末尾永远闪下去。
 */
export function settleOperatorMessage(id: string): void {
  const index = state.entries.findIndex(
    (entry) => entry.kind === 'message' && entry.id === id && entry.streaming,
  )
  if (index < 0) return
  const existing = state.entries[index] as StudioOperatorMessageEntry
  emit({
    ...state,
    entries: state.entries.map((entry, i) =>
      i === index
        ? {
            kind: 'message',
            id: existing.id,
            text: existing.text,
            ...(existing.detail ? { detail: existing.detail } : {}),
          }
        : entry,
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

export function setOperatorConfirm(
  confirm: StudioOperatorConfirm | null,
): void {
  emitSlice({ confirm })
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
  if (state.mentions.length === 0) return
  emit({ ...state, mentions: [] })
}

/** 结果行卡的选中格（§4.2）。⚠ 再点一次同一格 = 取消选中，由调用方传 `null`。 */
export function setOperatorSelectedResult(id: string | null): void {
  if (state.selectedResultId === id) return
  emit({ ...state, selectedResultId: id })
}

/**
 * 「先问我」（§3.3）—— 开着时下一条消息带 `forcePlan: true`。
 *
 * ⚠ 发完之后由驱动 hook 复位，**除非** persona 的 `planMode === 'always'`
 * （§3.4「单轮仍可关，关只对本轮生效」的另一半）。
 */
export function setOperatorAskFirst(askFirst: boolean): void {
  if (state.askFirst === askFirst) return
  emit({ ...state, askFirst })
}

/**
 * persona 的「默认行为」落进 store（§8.2）。
 *
 * ⚠ **顺手把「先问我」的初始态定下来**（§3.4「『默认行为』= 总是先出计划 →
 * 『先问我』开关默认开」）：⛔ 只在 `always` 这一档写，别在 `auto` / `direct` 时
 * 顺手把它关掉 —— 用户可能刚刚亲手打开了它，而 persona 是异步到达的。
 */
export function setOperatorPlanMode(planMode: AssistantPersonaPlanMode): void {
  if (state.planMode === planMode) return
  const askFirst = planMode === ASSISTANT_PERSONA_PLAN_MODE_IDS.always
  emit({ ...state, planMode, askFirst: askFirst || state.askFirst })
}

// ─── 三张「等你定」的卡（§4.1 / §2.6 / §6 / §7）──────────────────

/** 计划卡到货（§2.6）。⚠ 出不出由 `shouldShowPlanCard` 判，这里只管存。 */
export function setOperatorPlan(plan: StudioOperatorPlanPrompt | null): void {
  emit({ ...state, plan })
}

/**
 * 点过「开始」—— 卡收成一行摘要（§3.1 ④），⛔ 不删掉它。
 *
 * ⚠ `answers` 是**反问卡**那一份（2026-09-06 面板轮）：收起态那一行写的是
 * 「你选了：…」，没有它就只剩一句「已确认」—— 而用户下一秒要问的正是
 * 「我刚才选了什么」。旧的三格待定项那条路不带它，行为一字不变。
 */
export function resolveOperatorPlan(
  answers: readonly StudioOperatorQuestionAnswer[] = [],
): void {
  if (!state.plan || state.plan.resolved) return
  emit({
    ...state,
    plan: {
      ...state.plan,
      resolved: true,
      ...(answers.length > 0 ? { answers } : {}),
    },
  })
}

export function setOperatorSpend(
  spend: StudioOperatorSpendPrompt | null,
): void {
  emit({ ...state, spend })
}

export function resolveOperatorSpend(): void {
  if (!state.spend || state.spend.resolved) return
  emit({ ...state, spend: { ...state.spend, resolved: true } })
}

export function setOperatorChoice(
  choice: StudioOperatorChoicePrompt | null,
): void {
  emit({ ...state, choice })
}

/** 点中了一格 —— 卡转 `.resolved`（§11.4 卡型通则），⛔ 不消失。 */
export function resolveOperatorChoice(optionId: string): void {
  if (!state.choice || state.choice.chosenId) return
  emit({ ...state, choice: { ...state.choice, chosenId: optionId } })
}

/**
 * 「本会话此类不再问」（§6 拍板 24）。
 *
 * ⚠ 传 `null` = 「改回每次确认」。⛔ 不做 merge：条子只有一张，第二次确认的
 * 模型 / 金额整体顶掉第一张 —— 两张条子并存就得回答「哪张先匹配」，而那正是
 * 「明明换了模型却没再问我」的来源。
 */
export function setOperatorAutoApprove(
  autoApprove: AssistantOperatorAutoApprove | null,
): void {
  emit({ ...state, autoApprove })
}

/**
 * 三张卡一起清 —— 切域（拍板 8）与 ⏹ Stop 用。
 *
 * ⚠ `autoApprove` **不在这里清**：它的作用域是「本会话」，切一下域不该让用户
 * 刚点过的「不再问」失效（那颗勾选说的是这条会话，不是这台工作台）。
 */
export function clearOperatorPrompts(): void {
  if (!state.plan && !state.spend && !state.choice) return
  emit({ ...state, plan: null, spend: null, choice: null })
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

/**
 * 载入一段历史（P4-B，拍板 10 的「历史」那一半）。
 *
 * ⭐ **只换会话，不碰表单**：`changes` / `primed` / `confirm` 三个分槽一个都不动。
 * 它们说的是「助手在这台工作台上把哪些旋钮拧过、哪一枪备着」，而那是表单此刻的
 * 事实，与用户翻看哪一段对话无关。顺手清掉的下场是「翻了一眼历史，✦ 标记全没了、
 * 撤不回去了」。
 * ⚠ 反过来也一样：载回来的历史**不会**让 primed 或撤销钮复活 —— 那些字段在历史
 * 类型里根本不存在。
 */
export function loadOperatorThread(args: {
  history: readonly StudioOperatorHistoryEntry[]
  sessionId: string | null
  sessionSurface: AssistantSurfaceId | null
}): void {
  emit({
    ...state,
    status: 'idle',
    history: args.history,
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
  // ⚠ `confirm` 走分槽写入（它属于当前域），其余是跨域的会话态。
  slices[state.domain] = { ...slices[state.domain], confirm: null }
  emit({
    ...state,
    status: 'idle',
    history: EMPTY_HISTORY,
    sessionId: null,
    sessionSurface: null,
    entries: [],
    confirm: null,
    stepsDone: 0,
    plannedSteps: 0,
    errorText: null,
    // ⚠ 队列跟着走：排的那几句是说给**上一条线程**听的，留到新话题里接住，
    //   用户会看到助手回答一个他已经翻篇的问题。
    queue: [],
    selectedResultId: null,
    // ⚠ `mentions` **不清**：它属于用户此刻正在写的那条消息（与草稿同命），
    //   而「＋新对话」清的是已经说完的那些。顺手清掉 = 挂好的三张图凭空消失。
    plan: null,
    spend: null,
    choice: null,
    /**
     * ⭐ 「不再问」跟着会话走（§6 拍板 24 的第一条要素）—— 新话题重新硬确认。
     * ⛔ 留着它的表现是：用户为上一个话题批过一次 4 credits，新话题里助手直接
     * 又发了一枪，而他这一次根本没看见过任何确认卡。
     */
    autoApprove: null,
  })
}
