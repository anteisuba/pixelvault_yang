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

import { Check } from '@/components/icons'
import { BlurSwap } from '@/components/ui/blur-swap'
import { Spinner } from '@/components/ui/spinner'
import { FEEDBACK_TIMING, SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * 键上的结果（owner 2026-10-08「提示与弹窗」第 1、2 题）：
 *
 * · `done`     —— 点下去得到的结果：键自己拉长、变黑，写「✓ 已开始下载」，过 1.6 秒缩回。
 * · `progress` —— 还在做（「上传中 2/3」）：同样是黑的，图标换成转圈，⛔ 不自己缩回。
 *
 * 删东西 ⛔ 写在键上，一律走居中小弹窗 `ConfirmDialog`（ui-spec.md §9「删除确认」）。
 */
export type ButtonFeedbackTone = 'done' | 'progress'

export interface ButtonFeedback {
  label: string
  tone?: ButtonFeedbackTone
  /** 不给 = 按 tone 取（done ✓ · progress 转圈）。传 `null` 不要图标。 */
  icon?: ReactNode | null
}

/**
 * 键在结果态的皮肤（`primary` 黑底 `on-primary` 字）。宿主的皮肤照旧（白药丸、图标键、shadcn Button 都行），
 * 结果态只靠 `data-feedback` 盖上去 —— ⛔ 不换一颗按钮。
 * ⚠ hover 那一档也要盖住：否则鼠标停在键上时结果底色会被宿主的 hover 底色抢走。
 */
export const FEEDBACK_BUTTON_CLASS =
  'overflow-hidden whitespace-nowrap transition-[background-color,color,border-color] duration-fast ease-standard motion-reduce:transition-none data-[feedback]:gap-1.5 data-[feedback]:px-3 data-[feedback]:border-primary data-[feedback]:bg-primary data-[feedback]:text-primary-foreground data-[feedback]:shadow-none data-[feedback]:hover:bg-primary data-[feedback]:hover:text-primary-foreground'

function defaultIcon(tone: ButtonFeedbackTone): ReactNode {
  if (tone === 'progress') return <Spinner size="sm" />
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
