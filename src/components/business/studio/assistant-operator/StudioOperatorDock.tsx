'use client'

/**
 * 操作员面板的**外壳**：两态（展开 ↔ 右上角微状态卡，v2 §4.3）、注意力收放法则、左缘拖拽与
 * 宽度记忆。
 *
 * ## 注意力收放法则（拍板 7 —— 唯一的收放规则）
 * 点工作台任意处 → 收成微状态卡；点**提示词框**或**助手面板**→ 不收；点卡 → 展开。
 * **没有定时器，没有流程钩子。** 推论：点生成键属于「工作台任意处」，所以扣扳机
 * 时面板自动让位 —— 这条不需要单独写代码，它是同一条规则的结果。
 *
 * ⚠ 「不收」的判据是 DOM 上的 `data-operator-keep` 与**提示词框自己的 id**
 * （`STUDIO_PROMPT_TEXTAREA_ID`，本仓早就有的常量）。用现成的 id 意味着这条断言
 * **一行都不用改 `StudioPromptArea`** —— 那个文件此刻是别的会话的在飞文件。
 *
 * ## 手机（本片）
 * 同一颗外壳两种容器：`≥lg` 是右侧那颗 `<aside>`（两态 + 拖宽），`<lg` 是
 * `StudioOperatorMobileSheet`（全屏底部 Sheet）+ `StudioOperatorMobileFab`
 * （右下浮标，替代微状态卡）。⭐ **面板与 props 两条分支共用同一个元素**，⛔ 手机
 * 上没有第二套面板内容 —— 疏密由面板自己的 `@container` 收。
 * ⚠ 手机上**不渲染微状态卡、不记宽**：那两样都是「拖得动的浮层」才有的概念。
 * ⛔ LoRA 装配台的手机档不在本片内（仍走 `LoraAssistantDock`），判据见下方
 * `hasMobileShell`。
 *
 * ## 与旧 `StudioAssistantDock` 的关系
 * 图片工作台**整体切到这里**，旧面板留给音频（P4 扩域时再统一）。
 * ⛔ 没有 feature flag：本仓 flag 文化已死（只有 comfyRunner 还活着），
 * 加一个只会多一条没人翻的死分支。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import styles from './StudioOperatorDock.module.css'
import { GripVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_PANEL_RESIZE as RESIZE,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
import {
  getReferenceImageAttachmentId,
  removeReferenceMentions,
} from '@/lib/studio-reference-mentions'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAssistantOperator } from '@/hooks/use-assistant-operator'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useStudioOperatorCritique } from '@/hooks/use-studio-operator-critique'
import { useStudioOperatorHistory } from '@/hooks/use-studio-operator-history'
import { useStudioOperatorStatusWord } from '@/hooks/use-studio-operator-status-word'
import {
  setOperatorPlanMode,
  removeOperatorMention,
  subscribeOperatorAttachment,
  takeOperatorAttachment,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { useStudioOperatorUpload } from '@/hooks/use-studio-operator-upload'
import { useStudioOperatorWebImport } from '@/hooks/use-studio-operator-web-import'
import {
  ASSISTANT_SETTINGS_SECTIONS,
  AssistantSettingsDialog,
  type AssistantSettingsSection,
} from '@/components/business/studio/assistant-operator/AssistantSettingsDialog'
import { StudioOperatorCollapsedCard } from '@/components/business/studio/assistant-operator/StudioOperatorCollapsedCard'
import { StudioOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { StudioOperatorMobileFab } from '@/components/business/studio/assistant-operator/StudioOperatorMobileFab'
import { StudioOperatorMobileSheet } from '@/components/business/studio/assistant-operator/StudioOperatorMobileSheet'
import { StudioOperatorPanel } from '@/components/business/studio/assistant-operator/StudioOperatorPanel'
import { cn } from '@/lib/utils'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

// ─── 宽度记忆（localStorage 背书的模块 store）──────────────────────
//
// ⚠ 记忆键与旧 dock **必须分开**（见 `constants/studio-assistant-operator.ts`
//    里那段注释）：两个面板的取值范围不同，共用一个键会让用户觉得「我拖过的
//    宽度自己弹回去了」。

let storedWidth: number | null = null
const widthListeners = new Set<() => void>()

function clamp(value: number): number {
  if (value < RESIZE.minWidthPx) return RESIZE.minWidthPx
  if (value > RESIZE.maxWidthPx) return RESIZE.maxWidthPx
  return value
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return RESIZE.defaultWidthPx
  try {
    const raw = window.localStorage.getItem(RESIZE.storageKey)
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? clamp(parsed) : RESIZE.defaultWidthPx
  } catch {
    return RESIZE.defaultWidthPx
  }
}

function getWidthSnapshot(): number {
  if (storedWidth === null) storedWidth = readStoredWidth()
  return storedWidth
}

function getServerWidthSnapshot(): number {
  return RESIZE.defaultWidthPx
}

function subscribeWidth(listener: () => void): () => void {
  widthListeners.add(listener)
  return () => {
    widthListeners.delete(listener)
  }
}

function writeWidth(next: number): void {
  const width = clamp(next)
  if (storedWidth === width) return
  storedWidth = width
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RESIZE.storageKey, String(width))
    } catch {
      // 存不下就只在本次会话里生效 —— 一个 UI 偏好不值得让面板报错。
    }
  }
  for (const listener of widthListeners) listener()
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
    domain: hostDomain,
  } = useStudioOperatorHost()
  const isMobile = useIsMobile()
  const {
    status,
    primed,
    stepsDone,
    plannedSteps,
    domain,
    mentions,
    question,
    confirm,
  } = useStudioOperatorState()
  /**
   * 收起态那一行**微状态**（§4.3）—— 与展开时助手头像旁那一句是**同一句**
   * （见 `use-studio-operator-status-word.ts` 的头注）。
   * ⚠ 算在外壳这一层：收起时面板是卸载的，而那一句正是收起之后唯一的读数。
   */
  const statusWord = useStudioOperatorStatusWord()
  /**
   * 待办角标（§4.3）：**未答问题 + 未处理确认**。
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
   * ⭐ 驱动 hook 在**外壳**这一层调用，不在面板里：收起面板时面板会被卸载，
   * 而收起（拍板 7）绝不该把在飞的那一轮掐掉 —— 胶囊上那句「干活中 3/7」
   * 必须是真的。
   */
  const operator = useAssistantOperator()
  /**
   * ⭐ 看图闭环的观察端（P3-C，拍板 4）也**住在外壳**：它盯的是工作台的结果
   * 回流，而那件事在面板收起（拍板 7 随时会卸载面板）时照样在发生。挂在面板里
   * 的下场是「收着面板等了三分钟，结果回来了却没人看」。
   * ⚠ 手机分支同样排在所有 hook 后面，所以这颗照样在跑 —— Sheet 关着的时候
   *   面板是卸载的，但闭环该照常闭。
   */
  useStudioOperatorCritique({ onResult: operator.critique })
  /**
   * ⭐ 会话历史（P4-B）也**住在外壳**：水化（载回最近一条）只该每次页面加载跑
   * 一次，而收放法则（拍板 7）随时会把面板整颗卸载再挂回来 —— 挂在面板里的
   * 下场是每展开一次就去库里覆盖一遍当前线程。落库的防抖同理：一轮流跑完那一拍
   * 常常发生在面板已经让位之后（点生成键 = 点工作台 = 收面板）。
   */
  const history = useStudioOperatorHistory()
  /**
   * ⭐ **persona 全树只拉这一次**（§8）：头像（时间线沟）、问候语、以及「先问我」
   * 的初始态读的都是它。⛔ 别在面板 / 头像组件里各调一次 `useAssistantPersona()`
   * —— 那会开出好几个 `GET /api/assistant/persona`，而且它们还会各说各话。
   * ⚠ 住在外壳而不是面板里，理由同驱动 hook：收放法则（拍板 7）随时卸载面板，
   *   挂在那里的下场是每展开一次就重新拉一遍。
   */
  const { persona } = useAssistantPersona()
  /**
   * 助手设置弹层（§8.1）。**状态住在外壳**：面板会被收放法则卸载，而弹层是它开
   * 出来的 —— 挂在面板里的表现是「点开设置、鼠标滑出面板，弹层自己没了」。
   * ⚠ `null` = 关着；非 null 时同时说明**开在哪一页**（规则薄卡的「查看规则」
   *   直接落到规则那一页，§10）。
   */
  const [panelPresence, setPanelPresence] = useState({ open, present: open })
  if (panelPresence.open !== open) {
    setPanelPresence({ open, present: open || panelPresence.present })
  }
  useEffect(() => {
    if (open) return
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const timeout = window.setTimeout(
      () => setPanelPresence((current) => ({ ...current, present: false })),
      reducedMotion ? 0 : 240,
    )
    return () => window.clearTimeout(timeout)
  }, [open])
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
  /**
   * ⭐ 草稿与非图片附件住在外壳；图片来自宿主参考图列表：收起会卸载面板，
   * 而「点错工作台一下，刚写的话和刚挂好的素材一起消失」是让位法则最容易踩到的
   * 那一脚。2026-08-30 真机实测过 —— 收起再展开后附件 chip 归零。
   */
  const [draft, setDraft] = useState('')
  const [localAttachments, setLocalAttachments] = useState<
    readonly StudioOperatorAttachment[]
  >([])
  const attachments = useMemo<readonly StudioOperatorAttachment[]>(
    () => [
      ...referenceImages.map(
        (entry, index): StudioOperatorAttachment => ({
          id: getReferenceImageAttachmentId(entry.url),
          url: entry.url,
          thumbnailUrl: entry.url,
          kind: 'image',
          label: `${tReference('image', { index: index + 1 })}${entry.disabledReason ? ` · ${tReference('unavailable')}` : ''}`,
        }),
      ),
      ...localAttachments.filter((item) => item.kind !== 'image'),
    ],
    [referenceImages, localAttachments, tReference],
  )
  const handleUploaded = useCallback(
    (attachment: StudioOperatorAttachment) => {
      if (attachment.kind === 'image') {
        apply.addReference(attachment.url)
        return
      }
      setLocalAttachments((current) =>
        current.some((item) => item.id === attachment.id)
          ? current
          : [...current, attachment],
      )
    },
    [apply],
  )
  const handleAttachmentsChange = useCallback(
    (next: readonly StudioOperatorAttachment[]) => {
      const images = next.filter((item) => item.kind === 'image')
      for (const entry of [...referenceImages].reverse()) {
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
    [apply, referenceImages],
  )
  const upload = useStudioOperatorUpload({ onUploaded: handleUploaded })

  useEffect(() => {
    for (const mention of mentions) {
      if (mention.kind !== 'image') continue
      apply.addReference(mention.url)
      removeOperatorMention(mention.id)
    }
  }, [apply, mentions])

  const [previousReferences, setPreviousReferences] = useState({
    domain: hostDomain,
    images: referenceImages,
  })
  if (
    previousReferences.domain !== hostDomain ||
    previousReferences.images !== referenceImages
  ) {
    setPreviousReferences({ domain: hostDomain, images: referenceImages })
    if (previousReferences.domain !== hostDomain) {
      setDraft((current) => removeReferenceMentions(current))
    } else if (referenceImages.length < previousReferences.images.length) {
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

  const webImportedUrls = useRef(new Map<string, string>())
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
    [apply],
  )
  const webImport = useStudioOperatorWebImport({
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
   */
  useEffect(() => {
    if (!open || isMobile) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      // 面板自己、参数栏里的归属标记/确认条、提示词框 —— 三处「共同编辑区」。
      if (target.closest(`[${STUDIO_OPERATOR_KEEP_OPEN_ATTR}]`)) return
      if (target.closest(`#${STUDIO_PROMPT_TEXTAREA_ID}`)) return
      // Radix 的下拉 / popover 渲染在 portal 里（不在面板 DOM 内），
      // 但它们是面板自己开出来的 —— 点它们当然不该收。
      if (target.closest('[data-radix-popper-content-wrapper]')) return
      // 弹层同理，而且更要命：📎 面板的「打开完整素材库」（拍板 20）开的是
      // `AssetSelectorDialog`，它也在 portal 里。收面板会把 📎 面板连同这颗
      // 弹层一起卸载 —— 用户点一下素材库里的瓦片，整个弹层就没了。
      // 判据用 shadcn 的 `data-slot`（`dialog-content` / `dialog-overlay` /
      // `dialog-close`），它是本仓所有 Dialog 的共同标记。
      if (target.closest('[data-slot^="dialog-"]')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true)
  }, [isMobile, open, setOpen])

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
        writeWidth(RESIZE.maxWidthPx)
      } else if (event.key === 'End') {
        event.preventDefault()
        writeWidth(RESIZE.minWidthPx)
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
      operator={operator}
      draft={draft}
      onDraftChange={setDraft}
      attachments={attachments}
      onAttachmentsChange={handleAttachmentsChange}
      upload={upload}
      webImport={webImport}
      history={history}
      persona={persona}
      onOpenAssistantSettings={() =>
        setSettingsSection(ASSISTANT_SETTINGS_SECTIONS.persona)
      }
      onOpenProjectRules={() =>
        setSettingsSection(ASSISTANT_SETTINGS_SECTIONS.rules)
      }
      onCollapse={() => setOpen(false)}
    />
  )

  /**
   * 手机上有没有这套外壳 —— **只有工作台那两个域**（图片 / 视频）。
   *
   * ⛔ LoRA 装配台不在此列：那条路由的小屏助手仍是 `LoraAssistantDock`（旧面板的
   * Drawer 宿主），而「两颗面板永不同屏」那道门就长在 `LoraWorkbench` 里 ——
   * 它的判据是「Dock 在小屏什么都不渲染」。这里不按域收窄的话，LoRA 手机上会
   * 同时弹出两张面板。LoRA 的收编是第四期（`assistant-shell.md` 四期次序）。
   * ⚠ 判据用**宿主的域**不是路由：域是宿主说了算的（见 `studio-operator-host`）。
   */
  const hasMobileShell =
    hostDomain === ASSISTANT_PROTOCOL_DOMAIN_IDS.image ||
    hostDomain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video

  if (isMobile && !hasMobileShell) return null

  /**
   * ── 手机：全屏 Sheet + 右下浮标（`ui-defaults.md §6`）─────────────────
   *
   * ⚠ 收放法则（拍板 7）在手机上**只剩一半**：Sheet 关闭即收，⛔ 没有「点工作台
   * 收起」那条 —— 全屏 Sheet 底下根本没有工作台可点（实现上也自动成立：那条
   * `pointerdown` 监听本来就 `isMobile` 时不挂）。
   * ⚠ **宽度记忆整套在手机上不参与**：没有把手、不写 `storageKey` —— 手机上拖不
   *   出宽度，往那个键里写数会污染用户在桌面拖出来的那一份。
   */
  if (isMobile) {
    return (
      <>
        <StudioOperatorMobileFab
          status={status}
          primed={primed}
          stepsDone={stepsDone}
          plannedSteps={plannedSteps}
          onOpen={() => setOpen(true)}
        />
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
          // ⭐「常挂在这台工作台」认的就是当前域（切片 Y）。
          scope={domain}
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
      <aside
        role="complementary"
        aria-label={t('title')}
        {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
        data-testid="operator-panel"
        data-open={open ? 'true' : 'false'}
        style={{
          width: open ? `${width}px` : 'auto',
          height: open
            ? 'calc(100dvh - 3rem)'
            : `${STUDIO_OPERATOR_SHELL.collapsedHeightPx}px`,
        }}
        // ⚠ 拖拽中关掉过渡：320ms 的 width 过渡会让把手「跟不上手」。
        className={cn(
          'fixed right-6 top-6 z-40 hidden flex-col lg:flex',
          styles.shell,
          open
            ? 'overflow-hidden rounded-xl border border-border bg-card shadow-lg'
            : '',
          isResizing && styles.resizing,
        )}
      >
        {open || panelPresence.present ? (
          <div
            className={styles.content}
            data-visible={open}
            inert={!open}
            aria-hidden={!open}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('resize')}
              aria-valuemin={RESIZE.minWidthPx}
              aria-valuemax={RESIZE.maxWidthPx}
              aria-valuenow={width}
              tabIndex={0}
              data-testid="operator-resize-handle"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown}
              onDoubleClick={() => writeWidth(RESIZE.defaultWidthPx)}
              title={t('resize')}
              className="group absolute inset-y-0 left-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center focus:outline-none"
            >
              <span
                className={cn(
                  'flex h-14 w-1.5 items-center justify-center rounded-full bg-border text-muted-foreground transition-colors duration-(--duration-fast) ease-standard group-hover:bg-primary/40 group-focus-visible:bg-primary/60',
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
        ) : null}
        {!open && (
          <div className={styles.trigger}>
            <StudioOperatorCollapsedCard
              status={status}
              primed={primed}
              statusText={statusWord}
              todoCount={todoCount}
              {...(persona ? { persona } : {})}
              onExpand={() => setOpen(true)}
            />
          </div>
        )}
      </aside>

      {/* 助手设置（§8.1）—— ⚠ 弹层挂在**外壳**里，与面板同生共死会被收放法则
          随手卸载掉。⛔ 别把它塞进面板：那是「点开设置、光标滑出面板，弹层
          自己没了」。 */}
      <AssistantSettingsDialog
        open={settingsSection !== null}
        section={settingsSection ?? ASSISTANT_SETTINGS_SECTIONS.persona}
        onOpenChange={(next) => {
          if (!next) setSettingsSection(null)
        }}
        scope={domain}
      />

      <StudioOperatorLightbox />
    </>
  )
}
