'use client'

/**
 * **「我的想法」**（助手思考过程 C「第一人称旁白」，owner 11-11 画板 Margin）。
 *
 * ⭐ 平时只看结果：想的时候一行「正在想 · N 秒 ›」，答完一行「我的想法 · N 秒 ›」，⛔ 露任何一句；
 *   点开才看到她用自己的口吻写的几句 —— 想的时候点开能看着它一句一句冒出来，答完点开是整段。
 *   决定的那几个词加深，用到的记忆 / 规矩挂在句尾（灰底小签：ui-spec §3.1 强调色只给「选中 / 进行中」，
 *   画板上那颗蓝签照规范改灰）。
 * ⚠ 想的那一行与答完那一行是两个挂载点（占位行 → 正文上方的回执）：开没开按条目 id 记在模块里，
 *   换挂载点照样开着；「正在想」换成「我的想法」那一下只在这一页亲眼看着它想过时才播。
 * 动效表（画板）：一句冒出来 240 由糊变清 · 换字 200 由糊变清 · 点开 / 收起 320（开标准、收缩回）·
 *   箭头 120；减少动效一律直接到位。
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  DURATION,
  EASE_IN,
  EASE_STANDARD,
  THOUGHT_MOTION,
} from '@/constants/motion'
import { ChevronRight } from '@/components/icons'
import { parseStudioOperatorThought } from '@/lib/studio-operator-thoughts'
import { cn } from '@/lib/utils'

/** 点开过的那几条（条目 id）。 */
const openThoughtIds = new Set<string>()
/** 想的时候在这一页画过的那几条：答完换字时才播。 */
const liveThoughtIds = new Set<string>()

/** 展开后的那几句。`live` = 还在想：新来的一句由糊变清冒出来。 */
export function StudioOperatorThoughtLines({
  lines,
  live,
}: {
  lines: readonly string[]
  live: boolean
}) {
  const reduceMotion = useReducedMotion()
  const animateIn = live && !reduceMotion
  return (
    <ol
      data-testid="operator-thoughts-lines"
      className="flex flex-col gap-1.5 py-1 text-2sm leading-reading text-muted-foreground"
    >
      {lines.map((line, index) => {
        const { parts, source } = parseStudioOperatorThought(line)
        return (
          <motion.li
            key={index}
            initial={
              animateIn
                ? {
                    opacity: 0,
                    filter: `blur(${THOUGHT_MOTION.blurPx}px)`,
                  }
                : false
            }
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{
              duration: THOUGHT_MOTION.lineInS,
              ease: EASE_STANDARD,
            }}
          >
            {parts.map((part, partIndex) =>
              part.key ? (
                <span
                  key={partIndex}
                  data-thought-key=""
                  className="font-medium text-foreground"
                >
                  {part.text}
                </span>
              ) : (
                <span key={partIndex}>{part.text}</span>
              ),
            )}
            {source ? (
              <span
                data-testid="operator-thought-source"
                className="ml-1 inline-block rounded-md bg-muted px-1.5 text-2xs leading-5 text-ink-2"
              >
                {source}
              </span>
            ) : null}
          </motion.li>
        )
      })}
    </ol>
  )
}

export function StudioOperatorThoughts({
  entryId,
  lines,
  live,
  seconds,
}: {
  /** 这几句挂在哪条正文上（开没开按它记）。 */
  entryId: string
  lines: readonly string[]
  /** 还在想（第一个字没到）。 */
  live: boolean
  /** 想了 / 已等多少秒；`null` = 不写秒数。 */
  seconds: number | null
}) {
  const t = useTranslations('StudioOperator.streaming')
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(() => openThoughtIds.has(entryId))
  const [swapIn] = useState(
    () => !live && !reduceMotion && liveThoughtIds.has(entryId),
  )
  useEffect(() => {
    if (live) liveThoughtIds.add(entryId)
    else liveThoughtIds.delete(entryId)
  }, [entryId, live])

  const toggle = () => {
    const next = !open
    if (next) openThoughtIds.add(entryId)
    else openThoughtIds.delete(entryId)
    setOpen(next)
  }

  return (
    <div data-testid="operator-thoughts" className="flex min-w-0 flex-col">
      <button
        type="button"
        data-testid="operator-thoughts-toggle"
        aria-expanded={open}
        onClick={toggle}
        className="touch-target-y flex h-6 w-fit items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        {live ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-foreground animate-assistant-breathe motion-reduce:animate-none"
          />
        ) : null}
        <motion.span
          key={live ? 'live' : 'done'}
          initial={
            swapIn
              ? { opacity: 0, filter: `blur(${THOUGHT_MOTION.blurPx}px)` }
              : false
          }
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{
            duration: THOUGHT_MOTION.labelSwapS,
            ease: EASE_STANDARD,
          }}
        >
          {live ? t('thinkingNow') : t('myThoughts')}
        </motion.span>
        {seconds !== null ? (
          <span className="font-mono tabular-nums">
            {t('seconds', { count: seconds })}
          </span>
        ) : null}
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
          <motion.div
            key="lines"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                duration: reduceMotion ? 0 : DURATION.slow,
                ease: EASE_STANDARD,
              },
            }}
            exit={{
              height: reduceMotion ? 'auto' : 0,
              opacity: 0,
              transition: {
                duration: reduceMotion ? 0 : DURATION.slow,
                ease: EASE_IN,
              },
            }}
            className="overflow-hidden"
          >
            <StudioOperatorThoughtLines lines={lines} live={live} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
