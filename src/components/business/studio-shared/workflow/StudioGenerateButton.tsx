'use client'

import { useReducedMotion } from 'motion/react'

import { ArrowUp } from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'
import { resolveGenerationProgress } from '@/lib/generation-progress'
import {
  setOperatorPrimed,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

interface StudioGenerateButtonProps {
  /** 能出图时按钮上写什么（已含「出几张」这类数量，调用方自己算）。 */
  label: string
  /** 跑起来之后的那句话（不含秒数，秒数由这里拼）。 */
  busyLabel: string
  /** 无障碍名字 —— 文案会在三态之间换，`aria-label` 不跟着换。 */
  ariaLabel: string
  /**
   * 缺什么就写在按钮上。**按钮仍然可点**（Krea 式：点了会 toast 并把焦点送到
   * 该补的地方），⛔ 不靠禁用来表达「还差一步」。
   */
  blockedMessage?: string
  isGenerating: boolean
  elapsedSeconds: number
  canGenerate: boolean
  /** 真正点不动的那一档（生成中 / 提示词超长）。 */
  disabled: boolean
  onGenerate: () => void
  /**
   * `block` = 参数栏底部那颗整宽键（文案写在键上）。
   * `round` = 底部输入框右端那颗 36px 圆键 ①（owner 2026-09-26）：只画 ↑，
   * 张数进角标，缺什么由宿主在左边写一行灰字 —— 键上不写字。
   */
  variant?: 'block' | 'round'
  /** `round` 的角标数（这一次出几张）；≤ 1 不画。 */
  count?: number
  /**
   * `round` 生成中那一档：给了就是 ■ 停止（外圈走进度），点一下取消这一轮；
   * 不给就退回转圈且不可点。
   */
  onStop?: () => void
  /** 停止键的无障碍名。 */
  stopLabel?: string
  className?: string
}

/**
 * 工作台的生成键 —— 三个模态与标签台**同一颗**。
 *
 * 原来整块内联在 `StudioPromptArea` 里；标签台要同一颗键（同样的三态、同样的
 * 归属追踪、同样的 primed 圈），抄一份就等于两处各自演化。
 *
 * ⚠ 它**不调** `useStudioGenerateAction` —— 那颗 hook 带着 `REQUEST_GENERATE`
 * 的执行端副作用，两个宿主同时挂会让一次请求发两遍（参数栏与移动端 composer
 * 必须二选一渲染，就是这个原因）。所有事实由调用方算好传进来。
 */
export function StudioGenerateButton({
  label,
  busyLabel,
  ariaLabel,
  blockedMessage,
  isGenerating,
  elapsedSeconds,
  canGenerate,
  disabled,
  onGenerate,
  variant = 'block',
  count = 1,
  onStop,
  stopLabel,
  className,
}: StudioGenerateButtonProps) {
  const { primed: isOperatorPrimed } = useStudioOperatorState()
  const reducedMotion = Boolean(useReducedMotion())

  if (variant === 'round') {
    const blocked = !isGenerating && Boolean(blockedMessage)
    const stoppable = isGenerating && Boolean(onStop)
    const spoken = isGenerating
      ? elapsedSeconds > 0
        ? `${busyLabel} ${elapsedSeconds}s`
        : busyLabel
      : (blockedMessage ?? label)
    /**
     * 外圈进度 —— 与卡片边上的进度线同一套阶段估算（`resolveGenerationProgress`），
     * 永不自己走到 100。持续运动用 linear（loading.md：匀速 = 诚实）。
     */
    const percent = isGenerating
      ? resolveGenerationProgress({
          elapsedSeconds,
          isComplete: false,
          reducedMotion,
        }).percent
      : 0
    return (
      <button
        type="button"
        data-operator-primed={isOperatorPrimed ? 'true' : undefined}
        data-state={stoppable ? 'busy' : blocked ? 'blocked' : 'ready'}
        onClick={(event) => {
          event.stopPropagation()
          if (stoppable) {
            onStop?.()
            return
          }
          setOperatorPrimed(false)
          onGenerate()
        }}
        disabled={stoppable ? false : disabled}
        aria-label={
          stoppable ? (stopLabel ?? spoken) : `${ariaLabel} · ${spoken}`
        }
        title={spoken}
        aria-busy={isGenerating}
        aria-disabled={stoppable ? undefined : !canGenerate}
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground',
          'transition-[background-color,color,transform] duration-fast ease-standard',
          'active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          // ⚠ 被挡住仍然可点（同 block 那档的 Krea 式规则），只是退成灰底。
          blocked && 'bg-muted text-muted-foreground',
          disabled &&
            !isGenerating &&
            'cursor-not-allowed bg-muted text-muted-foreground',
          isOperatorPrimed &&
            !isGenerating &&
            !blockedMessage &&
            'ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
          className,
        )}
      >
        {isGenerating ? (
          stoppable ? (
            <>
              <svg
                aria-hidden
                viewBox="0 0 36 36"
                className="pointer-events-none absolute inset-0 size-full -rotate-90"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="16.5"
                  pathLength={100}
                  className="fill-none stroke-primary-foreground/25"
                  strokeWidth={2}
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16.5"
                  pathLength={100}
                  strokeDasharray={100}
                  strokeDashoffset={100 - percent}
                  className="fill-none stroke-primary-foreground transition-[stroke-dashoffset] duration-slow ease-linear motion-reduce:transition-none"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
              <span aria-hidden className="size-2.5 rounded-xs bg-current" />
            </>
          ) : (
            <Spinner className="size-4" />
          )
        ) : (
          <ArrowUp className="size-4" aria-hidden />
        )}
        {count > 1 && !isGenerating ? (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-background px-1 font-mono text-2xs font-semibold tabular-nums text-foreground ring-1 ring-border"
          >
            {count}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <button
      type="button"
      data-operator-primed={isOperatorPrimed ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation()
        // 助手预填的那一枪打出去了 —— primed 是「等你来点」，点完就该灭
        // （owner 拍板：钱是唯一硬闸）。
        // ⛔ 助手在服务端一条能创建 generation 的工具都没有：扣扳机的永远是
        //    这一下点击。
        setOperatorPrimed(false)
        onGenerate()
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-busy={isGenerating}
      aria-disabled={!canGenerate}
      className={cn(
        'flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm',
        'transition-[background-color,transform,box-shadow] duration-fast ease-standard',
        'hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        // 挡住时降到次级填充。按钮上写着缺什么，就没有「点一下才知道」这层
        // 信息了，所以不必再用满强度的实心黑去引诱点击 —— 整屏唯一的最高强调
        // 留给真正能出图的那一刻。文字仍用 foreground 满强度：降的是底不是字，
        // `muted-foreground` 落在浅底上过不了对比度。
        !isGenerating &&
          blockedMessage &&
          'bg-muted text-foreground shadow-none hover:shadow-none',
        disabled &&
          'cursor-not-allowed bg-muted text-muted-foreground shadow-none hover:shadow-none',
        // 助手把表单配好了、价钱就在上面那行 —— 这一圈是「等你来点」。
        // ⚠ 只加一圈 ring，**不改按钮的文案与行为**：钱闸是这一下点击，把它做得
        //   更像「已经在跑」只会让人以为不用点了。
        isOperatorPrimed &&
          !isGenerating &&
          !blockedMessage &&
          'ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {isGenerating ? (
        <>
          <Spinner className="size-4" />
          {elapsedSeconds > 0 ? `${busyLabel} ${elapsedSeconds}s` : busyLabel}
        </>
      ) : (
        (blockedMessage ?? label)
      )}
    </button>
  )
}
