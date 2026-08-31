'use client'

/**
 * 操作员面板的**外壳**：三态（展开 ↔ 胶囊）、注意力收放法则、左缘拖拽与宽度记忆。
 *
 * ## 注意力收放法则（拍板 7 —— 唯一的收放规则）
 * 点工作台任意处 → 收成胶囊；点**提示词框**或**助手面板**→ 不收；点胶囊 → 展开。
 * **没有定时器，没有流程钩子。** 推论：点生成键属于「工作台任意处」，所以扣扳机
 * 时面板自动让位 —— 这条不需要单独写代码，它是同一条规则的结果。
 *
 * ⚠ 「不收」的判据是 DOM 上的 `data-operator-keep` 与**提示词框自己的 id**
 * （`STUDIO_PROMPT_TEXTAREA_ID`，本仓早就有的常量）。用现成的 id 意味着这条断言
 * **一行都不用改 `StudioPromptArea`** —— 那个文件此刻是别的会话的在飞文件。
 *
 * ## 与旧 `StudioAssistantDock` 的关系
 * 图片工作台**整体切到这里**，旧面板留给视频 / 音频（P4 扩域时再统一）。
 * ⛔ 没有 feature flag：本仓 flag 文化已死（只有 comfyRunner 还活着），
 * 加一个只会多一条没人翻的死分支。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { GripVertical, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_PANEL_RESIZE as RESIZE,
} from '@/constants/studio-assistant-operator'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAssistantOperator } from '@/hooks/use-assistant-operator'
import { useStudioOperatorCritique } from '@/hooks/use-studio-operator-critique'
import { useStudioOperatorHistory } from '@/hooks/use-studio-operator-history'
import {
  subscribeOperatorAttachment,
  takeOperatorAttachment,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { useStudioOperatorUpload } from '@/hooks/use-studio-operator-upload'
import { useStudioOperatorWebImport } from '@/hooks/use-studio-operator-web-import'
import { StudioOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
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
  /**
   * ⭐ **表单、开合、参考位上限全从宿主拿**（P4-C）：这颗外壳因此**页面无关** ——
   * 同一个 Dock 既挂在工作台（`StudioWorkspaceUI`）也挂在 LoRA 装配台
   * （`LoraWorkbench`）。此前它直接 `useStudioForm()`，而 `/studio/lora` 故意不挂
   * `<StudioProvider>`。见 `contexts/studio-operator-host.tsx` 的头注。
   */
  const { open, setOpen, referenceLimit } = useStudioOperatorHost()
  const isMobile = useIsMobile()
  const reduceMotion = useReducedMotion()
  const { status, primed, stepsDone, plannedSteps } = useStudioOperatorState()
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
   * ⚠ 小屏那条 `return null` 排在所有 hook 后面，所以这颗照样在跑 —— 小屏不渲染
   *   面板，但闭环该照常闭。
   */
  useStudioOperatorCritique({ onResult: operator.critique })
  /**
   * ⭐ 会话历史（P4-B）也**住在外壳**：水化（载回最近一条）只该每次页面加载跑
   * 一次，而收放法则（拍板 7）随时会把面板整颗卸载再挂回来 —— 挂在面板里的
   * 下场是每展开一次就去库里覆盖一遍当前线程。落库的防抖同理：一轮流跑完那一拍
   * 常常发生在面板已经让位之后（点生成键 = 点工作台 = 收面板）。
   */
  const history = useStudioOperatorHistory()
  const width = useSyncExternalStore(
    subscribeWidth,
    getWidthSnapshot,
    getServerWidthSnapshot,
  )
  /**
   * ⭐ 草稿与附件也住在外壳（与驱动 hook 同理，但更贵）：收起会卸载面板，
   * 而「点错工作台一下，刚写的话和刚挂好的素材一起消失」是让位法则最容易踩到的
   * 那一脚。2026-08-30 真机实测过 —— 收起再展开后附件 chip 归零。
   */
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<
    readonly StudioOperatorAttachment[]
  >([])
  /**
   * ⭐ 上传队列也住在外壳（P3-A）：一次视频直传能跑几分钟，而收起（拍板 7）
   * 会把面板整颗卸载。放在面板里的下场是「点一下工作台，正在传的东西全没了」，
   * 而且是在文件已经上路之后 —— 比草稿丢失更糟。
   *
   * ⚠ 成功的上传落进的是**同一个 `attachments` 数组**（素材库挑的那个）：
   * 从这一行往后，「传上来的」和「库里挑的」在代码里再也分不出来 —— 这就是
   * 「同一条 attachment 链」的字面含义。
   */
  const handleUploaded = useCallback((attachment: StudioOperatorAttachment) => {
    setAttachments((current) =>
      current.some((item) => item.id === attachment.id)
        ? current
        : [...current, attachment],
    )
  }, [])
  const upload = useStudioOperatorUpload({ onUploaded: handleUploaded })
  /**
   * 「把这张图给助手看」（P4-C）—— 结果列上那颗 🤖 投过来的东西。
   *
   * ⭐ 落进的是**同一个 `attachments` 数组**：传上来的、库里挑的、联网选用的、
   * 结果列投过来的，从这一行往后在代码里分不出来。
   * ⚠ 顺手把面板打开：投递方按那颗按钮的意思就是「现在就聊这张」，而面板此刻
   * 很可能是收起的（点结果列 = 点工作台 = 收面板，拍板 7）。
   */
  useEffect(() => {
    const consume = () => {
      const attachment = takeOperatorAttachment()
      if (!attachment) return
      setAttachments((current) =>
        current.some((item) => item.id === attachment.id)
          ? current
          : [...current, attachment],
      )
      setOpen(true)
    }
    // ⚠ 挂载时先取一次：投递可能发生在这颗组件还没挂上的时候（收起态下点结果列）。
    consume()
    return subscribeOperatorAttachment(consume)
  }, [setOpen])
  /**
   * ⭐ 联网候选的「选用」（P3-B / 拍板 21）也走**同一个 `attachments` 数组** ——
   * 搜来的、传上来的、库里挑的，从这一行往后在代码里分不出来。
   */
  const handleWebImported = useCallback(
    (attachment: StudioOperatorAttachment) => {
      setAttachments((current) =>
        current.some((item) => item.id === attachment.id)
          ? current
          : [...current, attachment],
      )
    },
    [],
  )
  /**
   * 取消选用 / 被换下来：把那条附件从消息上摘掉。
   * ⚠ 素材本身由 hook 走既有删除路径清掉（拍板 21 的「零残留」）—— 这里只管消息。
   */
  const handleWebRemoved = useCallback((attachmentId: string) => {
    setAttachments((current) =>
      current.filter((item) => item.id !== attachmentId),
    )
  }, [])
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

  // 小屏走的是抽屉那条路（`StudioEnhanceButton` 里的宿主），这里不占位。
  if (isMobile) return null

  /**
   * 胶囊上的那一行字（拍板 7 要求胶囊**有状态**）—— 面板让位之后它是助手唯一
   * 还看得见的一行，写「助手」两个字等于什么都没说。
   */
  const pillLabel = (() => {
    if (status === 'working') {
      return plannedSteps > 0
        ? t('pill.workingCount', { done: stepsDone, total: plannedSteps })
        : t('pill.working')
    }
    if (status === 'awaitingConfirm') return t('pill.awaitingConfirm')
    if (primed) return t('pill.primed')
    return t('pill.idle')
  })()

  return (
    <>
      {/* ⚠ **不用 `AnimatePresence`**（只做入场，不做退场）。
          隐藏标签页里 rAF 是冻结的，退场动画因此永远不「完成」，
          `AnimatePresence` 就一直不把节点摘掉 —— 留下的是一个 opacity:0、
          却仍然占着右半屏并吃掉点击的幽灵面板（灯箱那颗更糟：全屏）。
          2026-08-30 真机实测撞到，判据是 `document.visibilityState === 'hidden'`
          时元素停在退场的终态却不消失。
          收起本来就该是「让位」这种干脆的动作，退场动画不值这个风险。 */}
      {open ? (
        <motion.aside
          key="operator-panel"
          role="complementary"
          aria-label={t('title')}
          {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
          data-testid="operator-panel"
          style={{ width: `${width}px` }}
          initial={reduceMotion ? false : { opacity: 0, x: 24, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{
            duration: reduceMotion ? 0 : 0.28,
            ease: [0.3, 0.9, 0.3, 1],
          }}
          className="fixed bottom-4 right-4 top-4 z-40 hidden flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm lg:flex"
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
                'flex h-14 w-1.5 items-center justify-center rounded-full bg-border/80 text-muted-foreground transition-colors duration-fast ease-standard group-hover:bg-primary/40 group-focus-visible:bg-primary/60',
                isResizing && 'bg-primary/60',
              )}
            >
              <GripVertical className="size-3" aria-hidden />
            </span>
          </div>
          {isResizing ? (
            <span
              data-testid="operator-width-tip"
              className="absolute left-3 top-3 z-20 rounded-md bg-foreground px-2 py-0.5 font-mono text-2xs text-background"
            >
              {`${width}px`}
            </span>
          ) : null}

          <StudioOperatorPanel
            operator={operator}
            draft={draft}
            onDraftChange={setDraft}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            upload={upload}
            webImport={webImport}
            history={history}
            onCollapse={() => setOpen(false)}
          />
        </motion.aside>
      ) : null}

      {/* ── 胶囊（收起态）—— 点它展开（拍板 7）────────────────────── */}
      {open ? null : (
        <motion.button
          key="operator-pill"
          type="button"
          data-testid="operator-pill"
          onClick={() => setOpen(true)}
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className={cn(
            'fixed right-4 top-4 z-50 hidden items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-md lg:inline-flex',
            primed &&
              'ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full bg-primary',
              status === 'working' && 'animate-pulse',
            )}
            aria-hidden
          />
          <Sparkles className="size-3.5" aria-hidden />
          {pillLabel}
        </motion.button>
      )}

      <StudioOperatorLightbox />
    </>
  )
}
