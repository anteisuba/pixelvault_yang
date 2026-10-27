'use client'

/**
 * **等第一个字时那一行**（2026-10-14 设计方案 §9.1 · 附录 F）。
 *
 * ── 一行的四个阶段 ─────────────────────────────────────────────
 *  · 发送后 `< thinkingRevealMs`：**什么都不画**（只留一行高）—— 一秒内就回话的那一轮
 *    ⛔ 不闪一下「正在想…」。行本身（头像那一格）照旧发送即落，那是「收到了」的凭证。
 *  · 之后：一颗呼吸点 + 扫光字「正在想…」+ 已等秒数。
 *  · `≥ thinkingSlowMs`：下面多一句慢提示（「比平时久一点」）—— 让人知道不是卡死了。
 *  · 画布接力那一跳（`landing`）：字换成「正在画布上落地…」。
 *  · 思考摘要流过来了（owner 2026-10-27 定 B 一行 + ② 足迹）：呼吸点换成一排短线，每想完一步
 *    落一道、正在想的那道在呼吸，后面只露最新一步的小标题（换标题由糊变清）+ 秒数。
 *    ⛔ 不铺摘要正文（owner：不想看到一大段）。
 *
 * ⚠ 秒数是**本地计时**（`since` 由 store 在占位行挂上那一刻写下）：⛔ 不进 store、
 *   ⛔ 不每半秒 emit 一次整份状态 —— 只有这一行在跳。
 * ⚠ `since` 缺席（老条目 / 单测直接造的占位行）= 立刻露字、不带秒数。
 * ⚠ 减少动效：呼吸点静止（`motion-reduce:animate-none`），扫光退回静态灰字
 *   （`.assistant-shimmer-text` 自带的 reduced-motion 分支）。
 */

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'
import { ChevronRight } from '@/components/icons'
import { BlurSwap } from '@/components/ui/blur-swap'
import {
  operatorThoughtSteps,
  type OperatorThoughtStep,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'

/** 一排短线最多画几道：想了十几步也只占一小截，多出的从左边挤掉。 */
const MAX_TRAIL_TICKS = 8

/**
 * 足迹那一排短线（10-27 ② 足迹）。`live` = 还在想：最后一道在呼吸，新的一道从左往右长出来；
 * 想完全部定灰。⚠ 减少动效：不长、不呼吸，直接是一排实线。
 */
function ThoughtTrail({ count, live }: { count: number; live: boolean }) {
  const reduceMotion = useReducedMotion()
  const shown = Math.min(count, MAX_TRAIL_TICKS)
  const offset = count - shown
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.75">
      {Array.from({ length: shown }, (_, i) => {
        const now = live && i === shown - 1
        return (
          <motion.span
            key={offset + i}
            initial={live && !reduceMotion ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
            className={cn(
              'block h-0.75 w-2.5 origin-left rounded-full',
              now
                ? 'bg-foreground animate-assistant-breathe motion-reduce:animate-none'
                : 'bg-muted-foreground',
            )}
          />
        )
      })}
    </span>
  )
}

export function StudioOperatorThinkingRow({
  since,
  landing = false,
  thinking,
}: {
  /** 占位行挂上的那一刻（ms）。 */
  since?: number
  /** 画布接力那一跳。 */
  landing?: boolean
  /** 到此刻为止的思考摘要（`thinking` 帧攒的）。 */
  thinking?: string
}) {
  const t = useTranslations('StudioOperator.streaming')
  /**
   * ⚠ 初值取 `since` 而不是 `Date.now()`：渲染期⛔ 不读时钟（同一份输入要画出同一行）。
   * 代价是重新挂载后最多晚半秒才露字 —— 比一次闪烁便宜。
   */
  const [now, setNow] = useState(since ?? 0)

  useEffect(() => {
    if (since === undefined) return
    const timer = setInterval(
      () => setNow(Date.now()),
      STUDIO_OPERATOR_STREAMING.thinkingTickMs,
    )
    return () => clearInterval(timer)
  }, [since])

  const elapsed = since === undefined ? null : Math.max(0, now - since)
  const revealed =
    elapsed === null || elapsed >= STUDIO_OPERATOR_STREAMING.thinkingRevealMs
  const slow =
    elapsed !== null && elapsed >= STUDIO_OPERATOR_STREAMING.thinkingSlowMs
  const steps = useMemo(
    () => (thinking && !landing ? operatorThoughtSteps(thinking) : []),
    [thinking, landing],
  )
  const current = steps.at(-1)

  if (current) {
    return (
      <p
        data-testid="operator-message-pending"
        data-revealed="true"
        className="flex h-6 min-w-0 items-center gap-2 text-xs"
      >
        <ThoughtTrail count={steps.length} live />
        {/* 按第几步换：没有小标题的摘要，标题是这段的第一句、边流边长，⛔ 每来一片糊一次。 */}
        <BlurSwap
          swapKey={String(steps.length)}
          className="min-w-0 shrink text-ink-2"
        >
          <span
            data-testid="operator-message-thinking-title"
            className="truncate"
          >
            {current.title}
          </span>
        </BlurSwap>
        {elapsed !== null ? (
          <span
            data-testid="operator-message-pending-seconds"
            className="shrink-0 font-mono tabular-nums text-muted-foreground"
          >
            {t('seconds', { count: Math.floor(elapsed / 1000) })}
          </span>
        ) : null}
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      <p
        data-testid="operator-message-pending"
        data-revealed={revealed ? 'true' : 'false'}
        {...(landing ? { 'data-phase': 'landing' } : {})}
        /* ⚠ 高度 = 一行正文高（`h-6`）：露字与第一个字到达时这一行都不跳。 */
        className="flex h-6 items-center gap-2 text-xs"
      >
        {revealed ? (
          <>
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-foreground animate-assistant-breathe motion-reduce:animate-none"
            />
            <span className="assistant-shimmer-text">
              {landing ? t('landing') : t('thinking')}
            </span>
            {elapsed !== null ? (
              <span
                data-testid="operator-message-pending-seconds"
                className="font-mono tabular-nums text-muted-foreground"
              >
                {t('seconds', { count: Math.floor(elapsed / 1000) })}
              </span>
            ) : null}
          </>
        ) : null}
      </p>
      {slow ? (
        <p
          data-testid="operator-message-slow"
          className="text-2xs leading-4 text-muted-foreground"
        >
          {t('slow')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 想完之后那句「想了 N 秒」（§9.1：思考结束后变成回执）。
 * ⚠ 不到 `thinkingRevealMs` 又没有摘要的那一段⛔ 不画：那时用户什么都没看到过，回执是噪音。
 * ⭐ 有摘要（10-27）：前面留着那排短线，点开一步一行（小标题 + 一句），原地撑开 / 收回；
 *   没摘要的型号只是一句灰字，⛔ 不画点开什么都没有的展开键。
 */
export function StudioOperatorThoughtReceipt({
  thoughtMs,
  thinking,
}: {
  thoughtMs?: number
  thinking?: string
}) {
  const t = useTranslations('StudioOperator.streaming')
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const steps = useMemo(
    () => (thinking ? operatorThoughtSteps(thinking) : []),
    [thinking],
  )
  const ms = thoughtMs ?? 0
  if (steps.length === 0 && ms < STUDIO_OPERATOR_STREAMING.thinkingRevealMs)
    return null
  const label = t('thought', { count: Math.round(ms / 1000) })
  if (steps.length === 0)
    return (
      <p
        data-testid="operator-message-thought"
        className="text-2xs leading-4 text-muted-foreground"
      >
        {label}
      </p>
    )
  return (
    <div data-testid="operator-message-thought" className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-6 w-fit items-center gap-2 rounded-sm text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ThoughtTrail count={steps.length} live={false} />
        {label}
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3 transition-transform duration-fast ease-standard motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ol
            key="steps"
            data-testid="operator-message-thought-steps"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : DURATION.slow,
              ease: EASE_STANDARD,
            }}
            className="overflow-hidden"
          >
            {steps.map((step, index) => (
              <ThoughtStepRow key={index} step={step} />
            ))}
          </motion.ol>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** 展开后的一步：左边一道短线，小标题（深一档）+ 一句（灰）。 */
function ThoughtStepRow({ step }: { step: OperatorThoughtStep }) {
  return (
    <li className="flex gap-2 py-1 text-2sm leading-reading first:pt-1.5">
      <span
        aria-hidden
        className="mt-2.5 block h-0.75 w-2.5 shrink-0 rounded-full bg-muted-foreground"
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-ink-2">{step.title}</span>
        {step.line ? (
          <span className="text-muted-foreground">{step.line}</span>
        ) : null}
      </span>
    </li>
  )
}
