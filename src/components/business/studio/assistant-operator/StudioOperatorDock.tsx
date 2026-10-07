'use client'

/**
 * 操作员面板的**外壳**：两态（展开 ↔ 右下角 44px 圆按钮，D7 ④ · Q2 = C）、注意力
 * 收放法则、左缘拖拽与宽度记忆。
 *
 * ## 注意力收放法则（拍板 7 —— 唯一的收放规则）
 * 点工作台任意处 → 收成圆按钮；点**提示词框**或**助手面板**→ 不收；点按钮 → 展开。
 * **没有定时器，没有流程钩子。** 推论：点生成键属于「工作台任意处」，所以扣扳机
 * 时面板自动让位 —— 这条不需要单独写代码，它是同一条规则的结果。
 *
 * ⚠ 「不收」的判据是 DOM 上的 `data-operator-keep` 与**提示词框自己的 id**
 * （`STUDIO_PROMPT_TEXTAREA_ID`，本仓早就有的常量）。用现成的 id 意味着这条断言
 * **一行都不用改 `StudioPromptArea`** —— 那个文件此刻是别的会话的在飞文件。
 *
 * ## 手机（本片）
 * 同一颗外壳两种容器：`≥lg` 是右侧那颗 `<aside>`（两态 + 拖宽），`<lg` 是
 * `StudioOperatorMobileSheet`（半屏可拖底部 Sheet）+ **同一颗**收起态圆按钮
 * （只换距下缘的留白：桌面 16 / 手机 96）。⭐ **面板与 props 两条分支共用同一个元素**，⛔ 手机
 * 上没有第二套面板内容 —— 疏密由面板自己的 `@container` 收。
 * ⚠ 手机上**不记宽**：宽度记忆是「拖得动的浮层」才有的概念。
 *
 * ## 与旧 `StudioAssistantDock` 的关系
 * 图片工作台**整体切到这里**，旧面板留给音频（P4 扩域时再统一）。
 * ⛔ 没有 feature flag：本仓 flag 文化已死（只有 comfyRunner 还活着），
 * 加一个只会多一条没人翻的死分支。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import styles from './StudioOperatorDock.module.css'
import { GripVertical } from '@/components/icons'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useTranslations } from 'next-intl'
import { useUser } from '@clerk/nextjs'
import { assistantWorkspaceScope } from '@/lib/assistant-workspace'

import { LIQUID_SPRING, LIQUID_TIMING } from '@/constants/motion'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_DEFAULT_ANCHOR,
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
  STUDIO_OPERATOR_SHELL,
  STUDIO_OPERATOR_PANEL_RESIZE as RESIZE,
  getStudioOperatorPanelWidthBounds,
  getStudioOperatorPanelWidthPx,
} from '@/constants/studio-assistant-operator'
import {
  getReferenceImageAttachmentId,
  removeReferenceMentions,
} from '@/lib/studio-reference-mentions'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAssistantOperator } from '@/hooks/use-assistant-operator'
import { useCanvasOperatorRequests } from '@/hooks/node/use-canvas-operator-requests'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useStudioOperatorResults } from '@/hooks/use-studio-operator-results'
import { useStudioOperatorHistory } from '@/hooks/use-studio-operator-history'
import {
  getOperatorState,
  setOperatorPlanMode,
  removeOperatorMention,
  subscribeOperatorAttachment,
  takeOperatorAttachment,
  takeOperatorDraft,
  subscribeOperatorDraft,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { useStudioOperatorUpload } from '@/hooks/use-studio-operator-upload'
import { studioOperatorYield } from '@/hooks/use-studio-operator-yield'
import { useStudioOperatorWebImport } from '@/hooks/use-studio-operator-web-import'
import { AssistantSettingsDialog } from '@/components/business/studio/assistant-operator/AssistantSettingsDialog'
import {
  ASSISTANT_SETTINGS_SECTIONS,
  type AssistantSettingsSection,
} from '@/components/business/assistant-settings/AssistantSettings'
import {
  StudioOperatorAvatarToggle,
  type StudioOperatorShellPhase,
} from '@/components/business/studio/assistant-operator/StudioOperatorAvatarToggle'
import { StudioOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { StudioOperatorMobileSheet } from '@/components/business/studio/assistant-operator/StudioOperatorMobileSheet'
import { StudioOperatorPanel } from '@/components/business/studio/assistant-operator/StudioOperatorPanel'
import { cn } from '@/lib/utils'
import {
  toAssistantPersonaUpdate,
  type AssistantRouteModel,
} from '@/types/assistant-persona'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

// ─── 宽度记忆（localStorage 背书的模块 store）──────────────────────
//
// 记的是**占视口宽的比例**（owner 2026-09-26「按屏幕比例算」），快照按当前视口
// 折成像素 —— 所以窗口缩放也算一次变化（`resize` 一起订阅）。
// ⚠ 记忆键与旧 dock **必须分开**（见 `constants/studio-assistant-operator.ts`
//    里那段注释）。

let storedRatio: number | null = null
const widthListeners = new Set<() => void>()

function readViewportPx(): number {
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

function readStoredRatio(): number {
  if (typeof window === 'undefined') return RESIZE.defaultRatio
  try {
    const raw = window.localStorage.getItem(RESIZE.storageKey)
    const parsed = raw === null ? Number.NaN : Number.parseFloat(raw)
    return Number.isFinite(parsed) && parsed > 0
      ? Math.min(RESIZE.maxRatio, parsed)
      : RESIZE.defaultRatio
  } catch {
    return RESIZE.defaultRatio
  }
}

function getWidthSnapshot(): number {
  if (storedRatio === null) storedRatio = readStoredRatio()
  return getStudioOperatorPanelWidthPx(storedRatio, readViewportPx())
}

function getServerWidthSnapshot(): number {
  return RESIZE.minWidthPx
}

function subscribeWidth(listener: () => void): () => void {
  widthListeners.add(listener)
  window.addEventListener('resize', listener)
  return () => {
    widthListeners.delete(listener)
    window.removeEventListener('resize', listener)
  }
}

/**
 * 展开那一段兜底定时器比形状本身多等这么久。
 *
 * ⚠ 它**只是兜底**：正常路径上第二拍那根弹簧的 `finished` 先到（见相位机那段头注）。
 * 多等这几十毫秒是为了让它有机会先落，⛔ 不是为了「等动画跑完」—— 后者是定时器
 * 那条路，而那条路在后台标签页里才是唯一还走得通的。
 */
const SHELL_FALLBACK_SLACK_MS = 60

/**
 * 形状内缩的「藏起来」档：比任何面板都宽，裁出来是空的。
 *
 * ⚠ 收起落定后把两条内缩停在这里：下一次打开时 `<aside>` 刚挂载的那一帧还没量到
 * 尺寸，用它画出来的是空形状（头像盖在那个角上），⛔ 不会先闪一整块面板。
 */
const SHAPE_HIDDEN_INSET_PX = 100_000

/** 内容两批换场的节拍，以 CSS 变量交给 module（数只住 `LIQUID_TIMING`）。 */
const LIQUID_CONTENT_VARS = {
  '--liquid-head-delay': `${LIQUID_TIMING.headInDelayS}s`,
  '--liquid-head-in': `${LIQUID_TIMING.headInS}s`,
  '--liquid-body-delay': `${LIQUID_TIMING.bodyInDelayS}s`,
  '--liquid-body-in': `${LIQUID_TIMING.bodyInS}s`,
  '--liquid-out': `${LIQUID_TIMING.contentOutS}s`,
  '--liquid-blur': `${LIQUID_TIMING.blurPx}px`,
} as CSSProperties

function writeRatio(ratio: number): void {
  if (storedRatio === ratio) return
  storedRatio = ratio
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RESIZE.storageKey, String(ratio))
    } catch {
      // 存不下就只在本次会话里生效 —— 一个 UI 偏好不值得让面板报错。
    }
  }
  for (const listener of widthListeners) listener()
}

/** 拖到 / 键盘挪到某个像素宽 —— 先夹进上下限，再按当前视口折成比例记下。 */
function writeWidth(next: number): void {
  const viewport = readViewportPx()
  if (viewport <= 0) return
  const { min, max } = getStudioOperatorPanelWidthBounds(viewport)
  writeRatio(Math.min(max, Math.max(min, next)) / viewport)
}

export function StudioOperatorDock() {
  const t = useTranslations('StudioOperator')
  const tReference = useTranslations('StudioPromptArea.referenceMention')
  /**
   * ⭐ **表单、开合、参考位上限全从宿主拿**（P4-C）：这颗外壳因此**页面无关** ——
   * 同一个 Dock 既挂在工作台（`StudioWorkspaceUI`）也挂在 LoRA 装配台
   * （`LoraWorkbench`）。此前它直接 `useStudioForm()`，而 `/studio/lora` 故意不挂
   * `<StudioProvider>`。见 `contexts/studio-operator-host.tsx` 的头注。
   */
  const {
    open,
    setOpen,
    referenceLimit,
    referenceImages,
    apply,
    buildSnapshot,
    domain: hostDomain,
    workspace,
    resultRun,
    collapseOnOutsidePointer,
    anchor: hostAnchor,
    projectId: hostProjectId,
    attachmentsMountReferences = false,
    results,
  } = useStudioOperatorHost()
  const { user } = useUser()
  const userId = user?.id ?? null
  const scope = assistantWorkspaceScope(userId, workspace, hostProjectId)
  const history = useStudioOperatorHistory({
    userId,
    workspace,
    projectId: hostProjectId,
  })
  /**
   * 头像与面板落在视口的哪两个角（D7b ④）。
   *
   * ⚠ 缺省 = 没有顶栏的那一档（工作台 / LoRA，24/24）：画布自己给一份（顶栏底
   *   + 6），⛔ 这里不按 `domain === 'canvas'` 硬判 —— 判据与
   *   `collapseOnOutsidePointer` 逐字同源，第四个宿主该由它自己说了算。
   */
  const anchor = hostAnchor ?? STUDIO_OPERATOR_DEFAULT_ANCHOR
  /**
   * 布局 A（锚点 `avatarStays`，图片台桌面）：头像留在原位，面板是工作台旁边的一列
   * —— 它从右侧**滑进来**，工作台用同一根弹簧同步让位（owner 2026-09-26「打开时
   * 有点卡」）。⛔ 这一支不走 B 形状：头像不动，「从头像长出来」没有依据；而且
   * `clip-path` 每帧重绘整块面板、外层投影滤镜每帧重算整个视口，再叠上工作台每帧
   * 重排，正是那一下「卡」。滑动只动 `transform`。
   */
  const slides = Boolean(anchor.avatarStays)
  const isMobile = useIsMobile()
  const { entries, mentions, question, confirm, threadScope, localThreadId } =
    useStudioOperatorState()
  const attachmentScope =
    scope && threadScope === scope
      ? JSON.stringify([scope, localThreadId])
      : null
  /**
   * 角标的前半：**未答问题 + 未处理确认**。
   *
   * ⚠ 确认卡只有 `idle` 那一档算数：已确认 / 已取消的卡还留在流里（它们是记录），
   * 把它们也数进去的表现是「答完了角标还挂着 1」。
   */
  const todoCount =
    (question ? 1 : 0) +
    (confirm && confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      ? 1
      : 0)
  /**
   * 角标的后半：**未读结果卡**（D7 ④ · Q2 = C）。
   *
   * ⚠ 「跑完了」的判据是 `items.length > 0`，⛔ 不是卡存在：生成中那张卡正是
   *   用户点了生成之后自己看着它转的那一张，把它数进未读等于「自己点的生成
   *   也算一条通知」。
   * ⚠ 已读线记在 ref 里而不是 store 里：它是**这一颗按钮的阅读状态**，与会话
   *   无关，也不该跟着落库（刷新后重新来过是对的 —— 那些图早就在结果区里了）。
   */
  const settledResultIds = useMemo(
    () =>
      entries.flatMap((entry) =>
        entry.kind === 'result' && entry.items.length > 0 ? [entry.id] : [],
      ),
    [entries],
  )
  /**
   * ⚠ 已读线走**渲染阶段的派生 state**（与下面 `previousReferences` 同一个写法），
   * ⛔ 不在 effect 里 `setState`：那是一次级联渲染，而这里根本不需要等提交 ——
   * 「面板开着 = 都读过了」是一条纯函数规则。
   */
  const [readResults, setReadResults] = useState<{
    open: boolean
    ids: readonly string[]
    seen: ReadonlySet<string>
  }>(() => ({
    open,
    ids: settledResultIds,
    seen: new Set(settledResultIds),
  }))
  if (readResults.open !== open || readResults.ids !== settledResultIds) {
    setReadResults({
      open,
      ids: settledResultIds,
      // 打开面板 = 全部读过了（画板：「打开面板即清零」）；收着时已读线冻住。
      seen: open ? new Set(settledResultIds) : readResults.seen,
    })
  }
  const unreadResults = open
    ? 0
    : settledResultIds.filter((id) => !readResults.seen.has(id)).length
  const badgeCount = todoCount + unreadResults
  /**
   * ⭐ 驱动 hook 在**外壳**这一层调用，不在面板里：收起面板时面板会被卸载，
   * 而收起（拍板 7）绝不该把在飞的那一轮掐掉 —— 胶囊上那句「干活中 3/7」
   * 必须是真的。
   */
  const operator = useAssistantOperator(scope)
  /**
   * ⭐ 看图闭环的观察端（P3-C，拍板 4）也**住在外壳**：它盯的是工作台的结果
   * 回流，而那件事在面板收起（拍板 7 随时会卸载面板）时照样在发生。挂在面板里
   * 的下场是「收着面板等了三分钟，结果回来了却没人看」。
   * ⚠ 手机分支同样排在所有 hook 后面，所以这颗照样在跑 —— Sheet 关着的时候
   *   面板是卸载的，但闭环该照常闭。
   */
  /**
   * ⭐ 画布那三张便条（进度表 22）**也住在外壳**，理由与下面几条逐字相同：
   * 右键「重跑下游」、文本卡助手栏、剪辑台排片栏发来的那一刻，面板多半是收着的
   * （点画布 = 收面板）。挂在面板里的下场是点了什么都不发生。
   * ⚠ 它自己判域，别的三台工作台上一张便条都不取。
   */
  const canvasNodeName = useCallback(
    (nodeId: string): string => {
      const canvas = buildSnapshot().canvas
      if (!canvas) return nodeId
      for (const shot of canvas.shots) {
        if (!shot.expanded) continue
        const hit = shot.nodes.find((node) => node.id === nodeId)
        if (hit) return hit.name
      }
      // 折叠的镜里没有节点表 —— 回落成 id，⛔ 不因此不发（那就是静默失效）。
      return nodeId
    },
    [buildSnapshot],
  )
  useCanvasOperatorRequests({
    domain: hostDomain,
    send: operator.send,
    nodeName: canvasNodeName,
  })
  /**
   * ⭐ 结果卡的回流（v2 §6，commit #10）同样**住在外壳**，理由与上面那条逐字
   * 相同：图回来的那一刻面板多半是收着的（点生成键 = 点工作台 = 收面板），
   * 挂在面板里的下场是那张卡永远停在「正在出图」。
   */
  useStudioOperatorResults(resultRun)
  /**
   * ⭐ 会话历史（P4-B）也**住在外壳**：水化（载回最近一条）只该每次页面加载跑
   * 一次，而收放法则（拍板 7）随时会把面板整颗卸载再挂回来 —— 挂在面板里的
   * 下场是每展开一次就去库里覆盖一遍当前线程。落库的防抖同理：一轮流跑完那一拍
   * 常常发生在面板已经让位之后（点生成键 = 点工作台 = 收面板）。
   */
  /**
   * ⭐ **persona 全树只拉这一次**（§8）：头像（时间线沟）、问候语、以及「先问我」
   * 的初始态读的都是它。⛔ 别在面板 / 头像组件里各调一次 `useAssistantPersona()`
   * —— 那会开出好几个 `GET /api/assistant/persona`，而且它们还会各说各话。
   * ⚠ 住在外壳而不是面板里，理由同驱动 hook：收放法则（拍板 7）随时卸载面板，
   *   挂在那里的下场是每展开一次就重新拉一遍。
   */
  const { persona, save: savePersona } = useAssistantPersona()
  /**
   * 文本模型 chip 选中即写（§4.5）。⚠ **写的是整份 persona**：`PUT` 收的是完整
   * 形状，只递一列会把其余几列按默认值覆盖回去。⛔ 别在 chip 里自己 `save()` ——
   * persona 全树只拉这一次，第二份状态会各说各话。
   */
  const handleSelectRouteModel = useCallback(
    (routeModel: AssistantRouteModel) =>
      savePersona({ ...toAssistantPersonaUpdate(persona), routeModel }),
    [persona, savePersona],
  )
  /**
   * 助手设置弹层（§8.1）。**状态住在外壳**：面板会被收放法则卸载，而弹层是它开
   * 出来的 —— 挂在面板里的表现是「点开设置、鼠标滑出面板，弹层自己没了」。
   * ⚠ `null` = 关着；非 null 时同时说明**开在哪一页**（规则薄卡的「查看规则」
   *   直接落到记忆页 —— 助手设置 B 起规则住在那里，§10）。
   */
  /**
   * ── 头像开关的四档相位（D7b ④ 相位机 · 2026-09-26 形状改 B）─────────
   *
   * `closed` → `opening` →（第二拍弹簧 `finished` 或兜底定时器）→ `open` →
   * `closing` →（**定时器**）→ `closed`。
   *
   * ⚠ **收回那一段只认定时器**（`closeMs`）：后台标签页里 rAF 冻结，动画永远跑不完，
   *   靠它摘节点留下的是一个仍占着右半屏并吃掉点击的幽灵面板（2026-08-30 真机实测，
   *   见下方 `<aside>` 那段头注）。⛔ 同理不用 `AnimatePresence`。
   * ⚠ 展开那一段**认弹簧落定、并带一条兜底定时器**：毛玻璃必须等形状长完才挂
   *   （动着时开 `backdrop-filter` 会让整块在低端机上掉帧），而在后台标签页里弹簧
   *   同样不落 —— 没有兜底的表现是面板永远停在 `pointer-events: none`。
   * ⚠ `prefers-reduced-motion` 两段都**直切**：没有中间档，毛玻璃当场就挂。
   */
  const reducedMotion =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  /**
   * ⚠ 进档走**渲染阶段的派生 state**（与上面 `readResults` / `previousReferences`
   *   同一个写法），⛔ 不在 effect 里 `setState`：那是一次级联渲染，而且面板会
   *   先以静止态画一帧再跳进 `opening` —— 那一帧正是 morph 看起来「闪」的地方。
   * ⚠ 出档（`opening → open` / `closing → closed`）才走 effect 里的定时器：那是
   *   一件真的「过一会儿」的事，不是 render 算得出来的。
   */
  const [shell, setShell] = useState<{
    open: boolean
    phase: StudioOperatorShellPhase
  }>({ open, phase: open ? 'open' : 'closed' })
  if (shell.open !== open) {
    setShell({
      open,
      phase: reducedMotion
        ? open
          ? 'open'
          : 'closed'
        : open
          ? 'opening'
          : 'closing',
    })
  }
  const phase = shell.phase
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return
    const settled: StudioOperatorShellPhase =
      phase === 'opening' ? 'open' : 'closed'
    const timeout = window.setTimeout(
      () =>
        setShell((current) =>
          current.phase === phase ? { ...current, phase: settled } : current,
        ),
      phase === 'opening'
        ? STUDIO_OPERATOR_SHELL.openMs + SHELL_FALLBACK_SLACK_MS
        : STUDIO_OPERATOR_SHELL.closeMs,
    )
    return () => window.clearTimeout(timeout)
  }, [phase])

  /**
   * ── 形状：B「先横成一条，再落下」（owner 2026-09-26）────────────────
   *
   * 面板始终按全尺寸排版，只动 `clip-path: inset()` 的**左 / 下两条内缩**：
   * 收起形 = 右上角一颗头像大小的圆 → 第一拍左边沿走满、下边沿停在头部高度（一条
   * 44px 的头部条）→ `unfoldDelayS` 后下边沿走满。收回反着走。
   * ⚠ 头像不另起一条动画：它的进度就是左边沿走了多少（`dockProgress`），所以它骑在
   *   形状左上角被带进头部槽。
   * ⚠ 尺寸在 layout effect 里量（`<aside>` 此刻已按全尺寸排好、还没上屏），⛔ 不在
   *   render 里猜。
   */
  const asideRef = useRef<HTMLElement>(null)
  const insetLeft = useMotionValue(SHAPE_HIDDEN_INSET_PX)
  const insetBottom = useMotionValue(SHAPE_HIDDEN_INSET_PX)
  /** 左边沿从收起形走到整宽要走的距离；0 = 还没量过。 */
  const shapeSpan = useMotionValue(0)
  /**
   * ⚠ 静止档（`open`）与 reduced-motion 是 `none`，⛔ 别在 style 上把它换成字符串：
   *   motion 的 style 从 MotionValue 换成静态值时不会解绑，DOM 上会留着最后一帧的
   *   裁剪（2026-09-26 用例抓到：落定后面板整块被裁没）。所以两档都走这同一个值。
   */
  const shapeClipPath = useTransform(() => {
    const left = insetLeft.get()
    const bottom = insetBottom.get()
    if (slides || phase === 'open' || reducedMotion) return 'none'
    return `inset(0px 0px ${bottom}px ${left}px round ${STUDIO_OPERATOR_SHELL.avatarSizePx / 2}px)`
  })
  const dockProgress = useTransform(() => {
    const span = shapeSpan.get()
    if (reducedMotion || span <= 0) return phase === 'open' ? 1 : 0
    return Math.min(1.05, Math.max(0, 1 - insetLeft.get() / span))
  })
  const previousPhaseRef = useRef(phase)
  useLayoutEffect(() => {
    const previous = previousPhaseRef.current
    previousPhaseRef.current = phase
    if (reducedMotion || slides) return
    if (phase === 'closed') {
      insetLeft.jump(SHAPE_HIDDEN_INSET_PX)
      insetBottom.jump(SHAPE_HIDDEN_INSET_PX)
      return
    }
    if (phase === 'open') return
    const element = asideRef.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    const size = STUDIO_OPERATOR_SHELL.avatarSizePx
    const collapsedLeft = width - size
    const collapsedBottom = height - size
    const stripBottom = height - STUDIO_OPERATOR_SHELL.headerHeightPx
    shapeSpan.set(collapsedLeft)
    const timers: number[] = []
    const later = (seconds: number, run: () => void) => {
      timers.push(window.setTimeout(run, seconds * 1000))
    }
    if (phase === 'opening') {
      if (previous === 'closed') {
        insetLeft.jump(collapsedLeft)
        insetBottom.jump(collapsedBottom)
      }
      animate(insetLeft, 0, LIQUID_SPRING.strip)
      animate(insetBottom, stripBottom, LIQUID_SPRING.strip)
      later(LIQUID_TIMING.unfoldDelayS, () => {
        void animate(insetBottom, 0, LIQUID_SPRING.unfold).finished.then(() =>
          setShell((current) =>
            current.phase === 'opening'
              ? { ...current, phase: 'open' }
              : current,
          ),
        )
      })
    } else {
      if (previous === 'open') {
        // 静止档没有裁剪（`clipPath: none`），两条内缩从整块起步。
        insetLeft.jump(0)
        insetBottom.jump(0)
      }
      later(LIQUID_TIMING.retractDelayS, () => {
        animate(insetBottom, stripBottom, LIQUID_SPRING.retract)
      })
      later(
        LIQUID_TIMING.retractDelayS + LIQUID_TIMING.retractSecondBeatDelayS,
        () => {
          animate(insetLeft, collapsedLeft, LIQUID_SPRING.retract)
          animate(insetBottom, collapsedBottom, LIQUID_SPRING.retract)
        },
      )
    }
    // ⚠ 只清还没发出的那几拍；已经在跑的弹簧不停 —— 下一段 `animate` 会从它此刻的
    //   位置与速度接着走（连点不从头播）。
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, reducedMotion, slides, insetLeft, insetBottom, shapeSpan])
  const shapeMoving = phase === 'opening' || phase === 'closing'
  const panelPresent = phase !== 'closed'
  const [settingsSection, setSettingsSection] =
    useState<AssistantSettingsSection | null>(null)
  /**
   * persona 的「默认行为」落进 store（§8.2）—— 驱动 hook 要在事件处理器里同步
   * 读它（`always` 时「先问我」发完不复位）。
   * ⚠ 走 effect 而不是 render 阶段调用：那是一次 store 写入（会触发订阅者重渲染）。
   */
  useEffect(() => {
    setOperatorPlanMode(persona.planMode)
  }, [persona.planMode])
  const width = useSyncExternalStore(
    subscribeWidth,
    getWidthSnapshot,
    getServerWidthSnapshot,
  )
  /** 拖宽的上下限随视口走（`width` 的快照已订阅 `resize`，这里跟着重算）。 */
  const widthBounds = getStudioOperatorPanelWidthBounds(readViewportPx())
  /**
   * 工作台让位（owner 2026-09-26）：面板占掉的右侧宽度写进 `studioOperatorYield`，
   * 绑了它的外壳跟着收窄。节拍与形状同一套 —— 展开随第二拍、收起随收回那一拍。
   * ⚠ 只在 `open` / `closed` 两档**静止时**直接落值（初次挂载、拖宽面板）：
   *   动着的那一段交给弹簧，⛔ 别在这里把它截断。
   */
  const yieldReserve =
    width + anchor.panelRightPx + STUDIO_OPERATOR_SHELL.yieldGapPx
  useEffect(() => {
    if (isMobile) {
      studioOperatorYield.jump(0)
      return
    }
    if (reducedMotion) {
      studioOperatorYield.jump(open ? yieldReserve : 0)
      return
    }
    if (slides && (phase === 'opening' || phase === 'closing')) {
      // 布局 A：面板位移由让位量推出来（见 `slideX`），两边同一根弹簧、同一刻起步，
      // 所以面板左缘与工作台右缘一起走。⚠ 展开落定认这根弹簧（兜底定时器照旧在）。
      const opening = phase === 'opening'
      void animate(
        studioOperatorYield,
        opening ? yieldReserve : 0,
        opening ? LIQUID_SPRING.unfold : LIQUID_SPRING.retract,
      ).finished.then(() => {
        if (!opening) return
        setShell((current) =>
          current.phase === 'opening' ? { ...current, phase: 'open' } : current,
        )
      })
      return
    }
    if (phase === 'opening' || phase === 'closing') {
      const opening = phase === 'opening'
      const timer = window.setTimeout(
        () => {
          animate(
            studioOperatorYield,
            opening ? yieldReserve : 0,
            opening ? LIQUID_SPRING.unfold : LIQUID_SPRING.retract,
          )
        },
        (opening ? LIQUID_TIMING.unfoldDelayS : LIQUID_TIMING.retractDelayS) *
          1000,
      )
      return () => window.clearTimeout(timer)
    }
    if (!studioOperatorYield.isAnimating()) {
      studioOperatorYield.jump(phase === 'open' ? yieldReserve : 0)
    }
  }, [phase, open, yieldReserve, isMobile, reducedMotion, slides])
  /**
   * 布局 A 的面板位移：让位量走到哪，面板就滑到哪（收起位 = 整块推出右缘）。
   * ⚠ 由让位量**推出来**而不是另起一根弹簧：两根弹簧各走各的，面板与工作台之间
   *   那条缝会在途中忽宽忽窄。
   */
  const slideX = useTransform(() => {
    if (!slides || yieldReserve <= 0) return 0
    return yieldReserve - studioOperatorYield.get()
  })
  useEffect(() => () => studioOperatorYield.jump(0), [])
  /**
   * ⭐ 草稿与非图片附件住在外壳；图片来自宿主参考图列表：收起会卸载面板，
   * 而「点错工作台一下，刚写的话和刚挂好的素材一起消失」是让位法则最容易踩到的
   * 那一脚。2026-08-30 真机实测过 —— 收起再展开后附件 chip 归零。
   */
  const [composerOwner, setComposerOwner] = useState(userId)
  const [composers, setComposers] = useState<
    Record<
      string,
      {
        draft: string
        attachments: readonly StudioOperatorAttachment[]
      }
    >
  >({})
  if (composerOwner !== userId) {
    setComposerOwner(userId)
    setComposers({})
  }
  const draft = attachmentScope ? (composers[attachmentScope]?.draft ?? '') : ''
  const localAttachments = useMemo(
    () =>
      attachmentScope ? (composers[attachmentScope]?.attachments ?? []) : [],
    [attachmentScope, composers],
  )
  const ownsComposer = useCallback(() => {
    const current = getOperatorState()
    return (
      scope !== null &&
      current.threadScope === scope &&
      current.localThreadId === localThreadId
    )
  }, [scope, localThreadId])
  const setDraft = useCallback(
    (value: string | ((current: string) => string)) => {
      if (!attachmentScope) return
      setComposers((current) => {
        const composer = current[attachmentScope] ?? {
          draft: '',
          attachments: [],
        }
        return {
          ...current,
          [attachmentScope]: {
            ...composer,
            draft: typeof value === 'function' ? value(composer.draft) : value,
          },
        }
      })
    },
    [attachmentScope],
  )
  const setLocalAttachments = useCallback(
    (
      value:
        | readonly StudioOperatorAttachment[]
        | ((
            current: readonly StudioOperatorAttachment[],
          ) => readonly StudioOperatorAttachment[]),
    ) => {
      if (!attachmentScope) return
      setComposers((current) => {
        const composer = current[attachmentScope] ?? {
          draft: '',
          attachments: [],
        }
        return {
          ...current,
          [attachmentScope]: {
            ...composer,
            attachments:
              typeof value === 'function' ? value(composer.attachments) : value,
          },
        }
      })
    },
    [attachmentScope],
  )
  /**
   * ⭐ **刚出的结果自动带进下一句**（owner 2026-10-07）：在工作台出完图直接说「眼睛
   * 糊了」，助手得知道指的是哪张 —— 快照里不带结果，此前它只能猜。新的一批落地时
   * 输入框上方多出它们的 chip（可删），发出去才进对话；⛔ 不自动发、不自检（D12）。
   * ⚠ 挂载那一刻已有的结果不算「新」；下一批到了就换掉上一批还没发出的自动 chip。
   * 渲染期比对（与上面参考图那段同一写法），⛔ 不在 effect 里同步 setState。
   */
  const resultIds = results.map((result) => result.id).join('\n')
  const [previousResultIds, setPreviousResultIds] = useState(resultIds)
  const [autoResultIds, setAutoResultIds] = useState<readonly string[]>([])
  if (previousResultIds !== resultIds) {
    setPreviousResultIds(resultIds)
    const seen = new Set(previousResultIds.split('\n'))
    const fresh = results.filter((result) => !seen.has(result.id))
    if (fresh.length > 0 && !attachmentsMountReferences && attachmentScope) {
      const replaced = new Set([
        ...autoResultIds,
        ...fresh.map((result) => result.id),
      ])
      setAutoResultIds(fresh.map((result) => result.id))
      setLocalAttachments((current) => [
        ...current.filter((item) => !replaced.has(item.id)),
        ...fresh.map(
          (result): StudioOperatorAttachment => ({
            id: result.id,
            kind:
              result.outputType === 'VIDEO'
                ? 'video'
                : result.outputType === 'AUDIO'
                  ? 'audio'
                  : 'image',
            url: result.url,
            ...(result.thumbnailUrl || result.outputType !== 'VIDEO'
              ? { thumbnailUrl: result.thumbnailUrl ?? result.url }
              : {}),
            label: t('attach.latestResult', {
              label: result.label ?? '',
            }),
          }),
        ),
      ])
    }
  }
  // ⚠ 宿主自己带出来的参考图（`implicit`，画布上的图）不摆成 chip：助手照样看得见、
  //   能 @，只是不在输入框上方堆成一墙（owner 2026-09-29）。
  const attachments = useMemo<readonly StudioOperatorAttachment[]>(
    () =>
      !attachmentScope
        ? []
        : // ⭐ 附图只进对话的宿主：输入框里摆的就是这条消息自己的附件，⛔ 不摆挂载的参考图
          //   （那些在工作台自己的参考位上看得见，助手也从快照里读得到）。
          !attachmentsMountReferences
          ? localAttachments
          : [
              ...referenceImages.flatMap(
                (entry, index): StudioOperatorAttachment[] =>
                  entry.implicit
                    ? []
                    : [
                        {
                          id: getReferenceImageAttachmentId(entry.url),
                          url: entry.url,
                          thumbnailUrl: entry.url,
                          kind: 'image',
                          label: `${entry.name || tReference('image', { index: index + 1 })}${entry.disabledReason ? ` · ${tReference('unavailable')}` : ''}`,
                        },
                      ],
              ),
              ...localAttachments.filter((item) => item.kind !== 'image'),
            ],
    [
      attachmentScope,
      attachmentsMountReferences,
      referenceImages,
      localAttachments,
      tReference,
    ],
  )
  const handleUploaded = useCallback(
    (attachment: StudioOperatorAttachment) => {
      if (!ownsComposer()) return
      if (attachment.kind === 'image' && attachmentsMountReferences) {
        apply.addReference(attachment.url)
        return
      }
      setLocalAttachments((current) =>
        current.some((item) => item.id === attachment.id)
          ? current
          : [...current, attachment],
      )
    },
    [apply, attachmentsMountReferences, ownsComposer, setLocalAttachments],
  )
  const handleAttachmentsChange = useCallback(
    (next: readonly StudioOperatorAttachment[]) => {
      if (!ownsComposer()) return
      if (!attachmentsMountReferences) {
        setLocalAttachments(next)
        return
      }
      const images = next.filter((item) => item.kind === 'image')
      for (const entry of [...referenceImages].reverse()) {
        // 没摆出来的那些（`implicit`）不在 chip 列表里，⛔ 别把「列表里没有」读成「被移走了」。
        if (entry.implicit) continue
        if (!images.some((item) => item.url === entry.url)) {
          apply.removeReference(entry.url)
        }
      }
      for (const image of images) {
        if (!referenceImages.some((entry) => entry.url === image.url)) {
          apply.addReference(image.url)
        }
      }
      setLocalAttachments(next.filter((item) => item.kind !== 'image'))
    },
    [
      apply,
      attachmentsMountReferences,
      ownsComposer,
      referenceImages,
      setLocalAttachments,
    ],
  )
  const upload = useStudioOperatorUpload({
    onUploaded: handleUploaded,
    scopeKey: attachmentScope,
  })

  useEffect(() => {
    // 附图只进对话的宿主：@ / 素材库选的图留在 chip 上跟消息走，⛔ 不挂参考位。
    if (!attachmentsMountReferences) return
    for (const mention of mentions) {
      if (mention.kind !== 'image') continue
      apply.addReference(mention.url)
      removeOperatorMention(mention.id)
    }
  }, [apply, attachmentsMountReferences, mentions])

  const [previousReferences, setPreviousReferences] = useState({
    scope: attachmentScope,
    images: referenceImages,
  })
  if (
    previousReferences.scope !== attachmentScope ||
    previousReferences.images !== referenceImages
  ) {
    setPreviousReferences({ scope: attachmentScope, images: referenceImages })
    if (previousReferences.scope === attachmentScope && attachmentScope) {
      const removed = previousReferences.images
        .flatMap((entry, index) =>
          referenceImages.some((current) => current.url === entry.url)
            ? []
            : [index],
        )
        .reverse()
      if (removed.length) {
        setDraft((current) =>
          removed.reduce(
            (text, index) => removeReferenceMentions(text, index),
            current,
          ),
        )
      }
    }
  }

  useEffect(() => {
    const consume = () => {
      const attachment = takeOperatorAttachment()
      if (!attachment) return
      handleUploaded(attachment)
      setOpen(true)
    }
    consume()
    return subscribeOperatorAttachment(consume)
  }, [handleUploaded, setOpen])

  /**
   * 别的页面递过来的一句话（卡片助手 C3「交给图片助手」）：填进输入框、打开面板，
   * ⛔ 不替用户发。只认发给**这个域**的那一句。
   */
  useEffect(() => {
    const consume = () => {
      if (!ownsComposer()) return
      const text = takeOperatorDraft(threadScope)
      if (text === null) return
      setDraft(text)
      setOpen(true)
    }
    consume()
    return subscribeOperatorDraft(consume)
  }, [threadScope, ownsComposer, setDraft, setOpen])

  const webImportedUrls = useRef(new Map<string, string>())
  useLayoutEffect(() => {
    webImportedUrls.current.clear()
  }, [attachmentScope])
  const handleWebImported = useCallback(
    (attachment: StudioOperatorAttachment) => {
      webImportedUrls.current.set(attachment.id, attachment.url)
      handleUploaded(attachment)
    },
    [handleUploaded],
  )
  const handleWebRemoved = useCallback(
    (attachmentId: string) => {
      const url = webImportedUrls.current.get(attachmentId)
      if (url) {
        apply.removeReference(url)
        webImportedUrls.current.delete(attachmentId)
      }
      setLocalAttachments((current) =>
        current.filter((item) => item.id !== attachmentId),
      )
    },
    [apply, setLocalAttachments],
  )
  const webImport = useStudioOperatorWebImport({
    scopeKey: attachmentScope,
    onImported: handleWebImported,
    onRemoved: handleWebRemoved,
    limit: referenceLimit,
  })
  const [isResizing, setIsResizing] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  /**
   * 注意力收放法则的**唯一实现**。
   *
   * ⚠ 捕获阶段监听：面板里很多控件（下拉、popover）会 `stopPropagation`，
   * 冒泡阶段会漏掉一部分点击，于是「点面板不收」在某些角落莫名失效。
   * ⚠ 只在展开时挂：收起时它什么都不需要判断。
   * ⚠ 宿主说「我的面板外面是工作面」（`collapseOnOutsidePointer === false`，画布）
   *   时**整条监听不挂** —— 与 `isMobile` 同一档：不挂才是零开销也零副作用，
   *   挂上再在回调里 return 只是把同一个判断搬进热路径。那种宿主的开合另有其路
   *   （画布是右上角那颗 toggle + Esc 梯），见 `studio-operator-host.tsx`。
   */
  useEffect(() => {
    if (!open || isMobile || collapseOnOutsidePointer === false) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      // 面板自己、参数栏里的归属标记/确认条、提示词框 —— 三处「共同编辑区」。
      if (target.closest(`[${STUDIO_OPERATOR_KEEP_OPEN_ATTR}]`)) return
      if (target.closest(`#${STUDIO_PROMPT_TEXTAREA_ID}`)) return
      // Radix 的下拉 / popover 渲染在 portal 里（不在面板 DOM 内），
      // 但它们是面板自己开出来的 —— 点它们当然不该收。
      if (target.closest('[data-radix-popper-content-wrapper]')) return
      // 弹层同理，而且更要命：面板开出来的弹层（素材库等）也在 portal 里。收面板
      // 会把开它的那一格连同这颗弹层一起卸载 —— 用户点一下弹层里的字段，整个
      // 弹层就没了。
      // 判据用 shadcn 的 `data-slot`（`dialog-content` / `dialog-overlay` /
      // `dialog-close`），它是本仓所有 Dialog 的共同标记。
      if (target.closest('[data-slot^="dialog-"]')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true)
  }, [collapseOnOutsidePointer, isMobile, open, setOpen])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsResizing(true)
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
      }
    },
    [width],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      // 面板贴右缘：往左拖变宽，所以是 `startX - clientX`。
      writeWidth(drag.startWidth + (drag.startX - event.clientX))
    },
    [],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setIsResizing(false)
    },
    [],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        writeWidth(width + RESIZE.widthStepPx)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        writeWidth(width - RESIZE.widthStepPx)
      } else if (event.key === 'Home') {
        event.preventDefault()
        // 夹进上下限的那一步在 `writeWidth` 里，这里给两端就够。
        writeWidth(Number.POSITIVE_INFINITY)
      } else if (event.key === 'End') {
        event.preventDefault()
        writeWidth(0)
      }
    },
    [width],
  )

  /**
   * ⭐ **两条分支装的是同一个面板、同一份 props**：桌面那颗 `<aside>` 与手机那张
   * 全屏 Sheet 换的只是**容器**。面板内部的疏密由 `@container` 按容器宽度自己收
   * （§11.1 的宽档判据本来就不是视口断点），⛔ 不为手机写第二套内容 —— 那是
   * 两份要同步的东西，而它们必然会漂。
   */
  const panel = (
    <StudioOperatorPanel
      key={attachmentScope}
      operator={operator}
      draft={draft}
      onDraftChange={setDraft}
      attachments={attachments}
      onAttachmentsChange={handleAttachmentsChange}
      upload={upload}
      webImport={webImport}
      history={history}
      persona={persona}
      onSelectRouteModel={handleSelectRouteModel}
      onOpenAssistantSettings={() =>
        setSettingsSection(ASSISTANT_SETTINGS_SECTIONS.persona)
      }
      onOpenProjectRules={() =>
        setSettingsSection(ASSISTANT_SETTINGS_SECTIONS.memory)
      }
      onCollapse={() => setOpen(false)}
      /**
       * 头部左上那个头像位。
       *
       * ⚠ 桌面 morph 宿主是 `slot`：那颗是外壳里那个持久 fixed 元素滑进来的（D7b
       *   的「一个元素两个锚点」），面板只留一个同尺寸的空槽给它坐，⛔ 不再画第二颗
       *   —— 两颗叠在一起的表现是头像边缘在过渡末尾闪一下。
       * ⚠ 手机是 `own`：Sheet 那条路没有 morph，头部那颗由面板自己画。
       * ⚠ 头像留在原位的宿主（布局 A）是 `none`：头像就在面板正上方那一行里。
       */
      headerAvatar={isMobile ? 'own' : anchor.avatarStays ? 'none' : 'slot'}
    />
  )

  /**
   * ── 手机：半屏可拖 Sheet + 右下浮标（v2 §4.6 · `ui-defaults.md §6`）───────
   *
   * ⚠ **浮标只在收起档画**（`!open`）：半屏 Sheet 露着上半截工作台，浮标再挂在
   *   那儿就是「开着的助手旁边还浮着一颗打开助手」，而且正好压在露出来的结果图
   *   上。⛔ 别改回「一直挂着让 Sheet 盖住它」—— 半屏盖不住。
   * ⚠ 收放法则（拍板 7）在手机上**只剩一半**：Sheet 关闭即收，⛔ 没有「点工作台
   *   收起」那条 —— 半屏底下那半截工作台是给用户**看改动**的，点一下就收等于把
   *   刚才的对话丢了（实现上也自动成立：那条 `pointerdown` 监听本来就 `isMobile`
   *   时不挂，Sheet 那边 `modal={false}` 又把 `onPointerDownOutside` 拦掉了）。
   * ⚠ **宽度记忆整套在手机上不参与**：没有把手、不写 `storageKey` —— 手机上拖不
   *   出宽度，往那个键里写数会污染用户在桌面拖出来的那一份。
   */
  if (isMobile) {
    return (
      <>
        {/* ⚠ 手机收起态的头像挂**顶栏下方的右侧**（D7b ④，与桌面一致）——⛔ 不再是右下
            那颗浮标：那个位置的全部理由是「清过底部 `StudioMobileComposer` 那条
            固定栏」，而头像已经不在下面了。
            ⚠ 手机上**不做 morph**（Sheet 不从右上角长出来），所以相位恒 `closed`
            且面板一开就把它摘掉。 */}
        {open ? null : (
          <StudioOperatorAvatarToggle
            badgeCount={badgeCount}
            {...(persona ? { persona } : {})}
            anchor={{
              avatarTopPx: STUDIO_OPERATOR_MOBILE_SHELL.avatarTopPx,
              avatarRightPx: STUDIO_OPERATOR_MOBILE_SHELL.fabInsetPx,
              panelTopPx: STUDIO_OPERATOR_MOBILE_SHELL.fabInsetPx,
              panelRightPx: STUDIO_OPERATOR_MOBILE_SHELL.fabInsetPx,
            }}
            panelWidthPx={0}
            phase="closed"
            onToggle={() => setOpen(true)}
          />
        )}
        <StudioOperatorMobileSheet open={open} onOpenChange={setOpen}>
          {panel}
        </StudioOperatorMobileSheet>

        {/* 设置弹层与灯箱两条**手机上照样要有**：前者是 ⋯ 菜单的落点，后者是
            面板里点图看大图的唯一去处。⛔ 别只挂在桌面分支上。 */}
        <AssistantSettingsDialog
          open={settingsSection !== null}
          section={settingsSection ?? ASSISTANT_SETTINGS_SECTIONS.persona}
          onOpenChange={(next) => {
            if (!next) setSettingsSection(null)
          }}
        />

        <StudioOperatorLightbox />
      </>
    )
  }

  return (
    <>
      {/* ⚠ **不用 `AnimatePresence`**（只做入场，不做退场）。
          隐藏标签页里 rAF 是冻结的，退场动画因此永远不「完成」，
          `AnimatePresence` 就一直不把节点摘掉 —— 留下的是一个 opacity:0、
          却仍然占着右半屏并吃掉点击的幽灵面板（灯箱那颗更糟：全屏）。
          2026-08-30 真机实测撞到，判据是 `document.visibilityState === 'hidden'`
          时元素停在退场的终态却不消失。
 */}
      {panelPresent ? (
        /* 动着时的投影挂在这一层 —— 滤镜先于裁剪执行，挂在 aside 自己身上会被它的
           clip-path 一起裁掉。⚠ 它铺满视口且 `pointer-events-none`：只是个画影子的壳；
           filter 会让它成为 fixed 子元素的包含块，而它本身就与视口重合，所以 aside
           的 top / right 照旧按视口算。静止档不挂滤镜（`@` 候选菜单的 fixed 定位靠这一条）。 */
        <div
          className={cn(
            'pointer-events-none fixed inset-0 z-40 hidden lg:block',
            shapeMoving && !slides && styles.shapeShadow,
          )}
        >
          <motion.aside
            ref={asideRef}
            role="complementary"
            aria-label={t('title')}
            {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
            data-testid="operator-panel"
            data-open={open ? 'true' : 'false'}
            data-phase={phase}
            /**
             * ⚠ **宽高是常数**（D7b 铁律）：收放只动 `clip-path` 的两条内缩（形状那段
             * 头注），⛔ 别把宽高改回过渡的量 —— 动 width/height 每一帧都要重排整棵面板，
             * 那正是 owner 说的「卡」。静止档 `clipPath: none`：不裁，描边与阴影回到自己身上。
             * ⚠ 收起档整颗 `<aside>` 根本不渲染（`panelPresent`），所以一个有尺寸的
             *   空面板不会在右上角吃掉点击。
             * ⚠ top / right / bottom 由宿主的锚点给（画布 = 顶栏底 + 6，⛔ 不再压
             *   顶栏；布局 A = 与舞台顶边、输入框底边对齐）。
             */
            style={{
              width: `${width}px`,
              height: `calc(100dvh - ${anchor.panelTopPx + (anchor.panelBottomPx ?? anchor.panelTopPx)}px)`,
              top: `${anchor.panelTopPx}px`,
              right: `${anchor.panelRightPx}px`,
              clipPath: shapeClipPath,
              x: slideX,
              ...LIQUID_CONTENT_VARS,
            }}
            className={cn(
              'fixed z-40 hidden flex-col lg:flex',
              styles.shell,
              // ── 三层玻璃①：**面板**（§12.1）。86% 白 + 轻模糊 + 细边 + 柔投影；
              //    18px 圆角是区间上限（§12.3 「面板与浮层取上限」）。
              /**
               * ⭐ **展开态自己声明可点**（2026-09-19 真机：画布页面板点不动）。
               *
               * 🔬 根因：画布宿主把助手渲染在一条**全屏** rail 里
               * （`CanvasWorkspaceLayout` 的 `canvas-assistant-rail`），那条 rail 必须
               * `pointer-events-none` —— 否则它会盖住整张画布。旧的画布面板自己写了
               * `pointer-events-auto`，而换成这颗 Dock 之后展开态只写了皮肤，于是从
               * rail 继承成 `none`：面板画得出来，点击全落到底下的画布上。
               * ⚠ 所以这一格由**Dock 自己**声明，⛔ 不指望宿主去开：工作台 / LoRA
               * 两个宿主没有 `none` 的父级，加了没有副作用；而依赖宿主的话，下一个
               * 把助手挂进任何一条 overlay 的人会原样再撞一次。
               */
              'overflow-hidden border border-border',
              slides ? 'rounded-node' : 'rounded-2xl shadow-assistant-panel',
              /**
               * ⚠ **毛玻璃只在静止档挂**（D7b 铁律）：`assistant-glass-panel` 带
               * `backdrop-filter`，而过渡中开它会让整块在每一帧重新采样背景 ——
               * owner 09-20 明令「过渡中不开 backdrop-filter，transitionend 后再加」。
               * `phase === 'open'` 正是那一刻（reduced-motion 下它当场就成立）。
               * ⚠ 阴影**不在这条分支里**：它常驻，⛔ 也不做过渡。
               */
              /**
               * ⚠ 布局 A 始终是一张白卡（与舞台 / 输入框同一种东西，它们都是地台上的
               *   卡），⛔ 不在落定时换成毛玻璃：背后只有地台，玻璃看不出来，结尾那一下
               *   换皮反而是一次跳变。
               */
              slides
                ? cn('bg-card', phase === 'open' && 'pointer-events-auto')
                : phase === 'open'
                  ? 'pointer-events-auto assistant-glass-panel'
                  : 'bg-card',
              isResizing && styles.resizing,
            )}
          >
            <div
              className={styles.content}
              /* 布局 A 的内容随面板一起滑，⛔ 不分两批换场（`data-motion`）。 */
              data-motion={slides ? 'slide' : 'shape'}
              data-visible={slides || phase === 'open' || phase === 'opening'}
              inert={!open}
              aria-hidden={!open}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('resize')}
                aria-valuemin={widthBounds.min}
                aria-valuemax={widthBounds.max}
                aria-valuenow={width}
                tabIndex={0}
                data-testid="operator-resize-handle"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleKeyDown}
                onDoubleClick={() => writeRatio(RESIZE.defaultRatio)}
                title={t('resize')}
                className="group absolute inset-y-0 left-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center focus:outline-none"
              >
                <span
                  className={cn(
                    'flex h-14 w-1.5 items-center justify-center rounded-full bg-border text-muted-foreground transition-colors duration-fast ease-standard group-hover:bg-primary/40 group-focus-visible:bg-primary/60',
                    isResizing && 'bg-primary/60',
                  )}
                >
                  <GripVertical className="size-3" aria-hidden />
                </span>
              </div>
              {isResizing ? (
                <span
                  data-testid="operator-width-tip"
                  className="absolute left-3 top-3 z-20 rounded-md bg-foreground px-2 py-0.5 font-mono text-2sm tabular-nums text-background"
                >
                  {`${width}px`}
                </span>
              ) : null}

              {panel}
            </div>
          </motion.aside>
        </div>
      ) : null}

      {/* ── 头像开关（D7b ④）──────────────────────────────────────────
          ⚠ 它**不在 `<aside>` 里**、也**不随开合卸载**：这是「一个持久元素、两个
            锚点」那条的全部实现 —— 塞进面板的那一版每次开合都重新挂载，而重新
            挂载的元素没有可过渡的起始 transform（那正是 morph 看起来「跳」的原因）。
          ⚠ `hidden lg:block` 与面板同一道断点：手机那条分支自己画一颗（见上面）。 */}
      <div className="hidden lg:block">
        <StudioOperatorAvatarToggle
          badgeCount={badgeCount}
          {...(persona ? { persona } : {})}
          anchor={anchor}
          panelWidthPx={width}
          phase={phase}
          /* 布局 A 的头像留在原位（锚点 `avatarStays`）：不给进度 = 恒在收起位。 */
          {...(anchor.avatarStays ? {} : { dockProgress })}
          onToggle={() => setOpen(!open)}
        />
      </div>

      {/* 助手设置（§8.1）—— ⚠ 弹层挂在**外壳**里，与面板同生共死会被收放法则
          随手卸载掉。⛔ 别把它塞进面板：那是「点开设置、光标滑出面板，弹层
          自己没了」。 */}
      <AssistantSettingsDialog
        open={settingsSection !== null}
        section={settingsSection ?? ASSISTANT_SETTINGS_SECTIONS.persona}
        onOpenChange={(next) => {
          if (!next) setSettingsSection(null)
        }}
      />

      <StudioOperatorLightbox />
    </>
  )
}
