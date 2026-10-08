'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { animate, useReducedMotion } from 'motion/react'

import { Check, Trash2 } from '@/components/icons'
import { BlurSwap } from '@/components/ui/blur-swap'
import { Spinner } from '@/components/ui/spinner'
import { FEEDBACK_TIMING, SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * 键上的结果（owner 2026-10-08「提示与弹窗」第 1、2 题）：
 *
 * · `done`     —— 点下去得到的结果：键自己拉长、变黑，写「✓ 已开始下载」，过 1.6 秒缩回。
 * · `progress` —— 还在做（「上传中 2/3」）：同样是黑的，图标换成转圈，⛔ 不自己缩回。
 * · `danger`   —— 能撤销的小删除第一下：键拉长成红色「确认删除」，再点才删。
 */
export type ButtonFeedbackTone = 'done' | 'progress' | 'danger'

export interface ButtonFeedback {
  label: string
  tone?: ButtonFeedbackTone
  /** 不给 = 按 tone 取（done ✓ · progress 转圈 · danger 垃圾桶）。传 `null` 不要图标。 */
  icon?: ReactNode | null
}

/**
 * 键在结果态的皮肤。宿主的皮肤照旧（outline 药丸、图标键、shadcn Button 都行），
 * 结果态只靠 `data-feedback` 盖上去 —— ⛔ 不换一颗按钮。
 * ⚠ hover 那一档也要盖住：否则鼠标停在键上时结果底色会被宿主的 hover 底色抢走。
 */
export const FEEDBACK_BUTTON_CLASS =
  'overflow-hidden whitespace-nowrap transition-[background-color,color,border-color] duration-fast ease-standard motion-reduce:transition-none data-[feedback]:gap-1.5 data-[feedback]:px-3 data-[feedback=done]:border-foreground data-[feedback=done]:bg-foreground data-[feedback=done]:text-background data-[feedback=done]:hover:bg-foreground data-[feedback=done]:hover:text-background data-[feedback=progress]:border-foreground data-[feedback=progress]:bg-foreground data-[feedback=progress]:text-background data-[feedback=progress]:hover:bg-foreground data-[feedback=progress]:hover:text-background data-[feedback=danger]:border-destructive data-[feedback=danger]:bg-destructive data-[feedback=danger]:text-destructive-foreground data-[feedback=danger]:hover:bg-destructive/90 data-[feedback=danger]:hover:text-destructive-foreground'

function defaultIcon(tone: ButtonFeedbackTone): ReactNode {
  if (tone === 'progress') return <Spinner size="sm" />
  if (tone === 'danger') return <Trash2 className="size-3.5" aria-hidden />
  return <Check className="size-3.5" aria-hidden />
}

/**
 * 键上结果的状态：`show()` 写一句结果，`done` 一类 1.6 秒后自己清掉；
 * `progress` 一直留着，直到下一次 `show()` 或 `clear()`。
 */
export function useButtonFeedback(
  durationMs: number = FEEDBACK_TIMING.buttonAckMs,
) {
  const [feedback, setFeedback] = useState<ButtonFeedback | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setFeedback(null)
  }, [])

  const show = useCallback(
    (next: ButtonFeedback) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setFeedback(next)
      if ((next.tone ?? 'done') === 'progress') return
      timer.current = setTimeout(() => {
        timer.current = null
        setFeedback(null)
      }, durationMs)
    },
    [durationMs],
  )

  return { feedback, show, clear }
}

export interface FeedbackButtonProps extends Omit<
  React.ComponentProps<'button'>,
  'ref'
> {
  feedback?: ButtonFeedback | null
  ref?: Ref<HTMLButtonElement>
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else ref.current = value
}

/**
 * 「键自己拉长成结果」的唯一实现。宽度从量到的旧宽度走 `SPRING.slot` 弹到新宽度
 * （只留一丝过冲），字由糊变清换进来（`BlurSwap`）；结果清掉时原路缩回。
 *
 * ⚠ 量宽度而不是 motion `layout`：`layout` 用 scale 做形变，药丸的圆角和字在途中
 *   都会被压扁；这里直接动 `width`，键里的字只是被一点点露出来。
 * ⚠ `prefers-reduced-motion` 下直接换宽度，⛔ 不弹。
 */
export function FeedbackButton({
  feedback,
  children,
  className,
  ref,
  'aria-label': ariaLabel,
  ...props
}: FeedbackButtonProps) {
  const nodeRef = useRef<HTMLButtonElement | null>(null)
  const settledWidth = useRef<number | null>(null)
  const animating = useRef(false)
  const reduceMotion = useReducedMotion()
  const tone = feedback ? (feedback.tone ?? 'done') : null
  const active = feedback != null
  const swapKey = feedback ? `${tone}:${feedback.label}` : 'idle'

  useEffect(() => {
    const node = nodeRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!animating.current) settledWidth.current = node.offsetWidth
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const node = nodeRef.current
    if (!node) return
    const from = settledWidth.current
    // 结果态的宽度跟着字走（图标键原本定宽，结果态要让开）。
    node.style.width = active ? 'auto' : ''
    const to = node.offsetWidth
    settledWidth.current = to
    if (from === null || reduceMotion || Math.abs(from - to) < 1) return
    animating.current = true
    const controls = animate(node, { width: [from, to] }, SPRING.slot)
    void controls.then(() => {
      animating.current = false
      node.style.width = active ? 'auto' : ''
    })
    return () => {
      controls.stop()
      animating.current = false
    }
  }, [swapKey, active, reduceMotion])

  return (
    <>
      <button
        type="button"
        {...props}
        ref={(node) => {
          nodeRef.current = node
          assignRef(ref, node)
        }}
        aria-label={feedback ? feedback.label : ariaLabel}
        data-feedback={tone ?? undefined}
        className={cn(className, FEEDBACK_BUTTON_CLASS)}
      >
        <BlurSwap swapKey={swapKey} className="gap-1.5">
          {feedback ? (
            <>
              {feedback.icon === undefined
                ? defaultIcon(tone ?? 'done')
                : feedback.icon}
              <span>{feedback.label}</span>
            </>
          ) : (
            children
          )}
        </BlurSwap>
      </button>
      {/* 结果说给读屏听（`forbidden.md`：状态不只靠颜色与形状）。 */}
      <span role="status" aria-live="polite" className="sr-only">
        {feedback?.label ?? ''}
      </span>
    </>
  )
}

export interface ConfirmDeleteButtonProps extends Omit<
  FeedbackButtonProps,
  'feedback' | 'onClick'
> {
  /** 拉长后那句（「确认删除」）。 */
  confirmLabel: string
  onConfirm: () => void
  /** 3 秒不点自己缩回。 */
  armMs?: number
}

/**
 * 能撤销的小删除（owner 2026-10-08 第 2 题 B）：第一下键拉长成红色「确认删除」，
 * 再点才删；点别处、按 Esc 或 3 秒不动都缩回。删了找不回的大事 ⛔ 不用它 ——
 * 走 `ConfirmDialog`（正中弹窗，从按钮位置长出来）。
 */
export function ConfirmDeleteButton({
  confirmLabel,
  onConfirm,
  armMs = FEEDBACK_TIMING.deleteArmMs,
  ref,
  ...props
}: ConfirmDeleteButtonProps) {
  const [armed, setArmed] = useState(false)
  const nodeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), armMs)
    const onPointerDown = (event: PointerEvent) => {
      const node = nodeRef.current
      if (node && event.target instanceof Node && node.contains(event.target))
        return
      setArmed(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [armed, armMs])

  return (
    <FeedbackButton
      {...props}
      ref={(node) => {
        nodeRef.current = node
        assignRef(ref, node)
      }}
      data-armed={armed || undefined}
      feedback={armed ? { label: confirmLabel, tone: 'danger' } : null}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        onConfirm()
      }}
    />
  )
}
