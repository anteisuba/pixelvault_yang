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

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { StudioOperatorField } from '@/constants/studio-assistant-operator'
import {
  createOperatorClaim,
  type StudioOperatorClaim,
} from '@/lib/studio-operator-claim'
import type {
  StudioOperatorAttachment,
  StudioOperatorChange,
  StudioOperatorConfirm,
  StudioOperatorStatus,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'
import type { AssistantOperatorConfirmChoice } from '@/constants/assistant-operator'
import type { AssistantOperatorStep } from '@/types/assistant-operator'
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
  })
}
