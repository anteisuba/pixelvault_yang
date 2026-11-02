'use client'

/**
 * 回执与提示（换皮第二轮 ⑧ B · 样片 Y · node-canvas-v2 §6「回执与段闪」）：**舞台底部居中
 * 的黑提示，叠成一摞**，照素材页的提示。
 * - 外部 Claude 改了时间线 →「Claude 改了 N 段 · 撤销」，同一来源连着改数字累加在同一条上；
 * - 删了一段 →「删了「镜头名」，带走 2 条台词 · 撤销」（删除按两次 J 之后、⌫ 也一样）；
 * - 撤销之后 → 同一条原地换成「已撤销」；
 * - 成片落卡 →「Claude 导出了成片 · 已落到画布 · 看看」/「「成片名」已落到画布 · 回画布看」；
 * - 剪辑台自己的错（导出没建起来、素材没落上）→ 一条带「!」的。
 * 新的从下面推上来，旧的往后缩、变淡，最多叠三条；「撤销 / 看看」是提示里的下划线字。
 *
 * 每条自己计时（`idleMs`，「已撤销」`undoneMs`），鼠标停在这一摞上时都不走。哪条该在、
 * 哪条该撤由台面管；这里只报「这条到点了」和「点了它的字」。
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Check } from '@/components/icons'

import { EDIT_RECEIPT_MOTION } from '@/constants/edit-desk'
import { LIQUID_TIMING } from '@/constants/motion'

import { BlurSwap } from '@/components/ui/blur-swap'

export type EditDeskReceiptState =
  | { readonly kind: 'changes'; readonly count: number }
  | { readonly kind: 'undone' }
  | {
      readonly kind: 'landed'
      readonly by: 'claude' | 'you'
      readonly name: string
    }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'removed'
      readonly name: string
      /** 一起带走的台词 / 字幕条数。 */
      readonly lines: number
      readonly captions: number
    }

export interface EditDeskReceiptItem {
  /** 换一次 = 换了一条（重播进场）；数字累加、「已撤销」原地换字都不换。 */
  readonly seq: number
  readonly receipt: EditDeskReceiptState
}

export interface EditDeskReceiptsProps {
  /** 新的在前。 */
  readonly items: readonly EditDeskReceiptItem[]
  /** 离舞台底多高（重拍栏开着时垫在栏上面）。 */
  readonly bottomPx: number
  /** 点了提示里的下划线字（撤销 / 看看 / 回画布看）。 */
  onAction(seq: number): void
  /** 这一条到点了。 */
  onExpire(seq: number): void
}

export function EditDeskReceipts({
  items,
  bottomPx,
  onAction,
  onExpire,
}: EditDeskReceiptsProps) {
  const reduceMotion = useReducedMotion()
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      initial={false}
      animate={{ bottom: bottomPx }}
      transition={reduceMotion ? { duration: 0 } : EDIT_RECEIPT_MOTION.stack}
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
    >
      <div
        className="relative"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <AnimatePresence>
          {items.map((item, depth) => (
            <ReceiptToast
              key={item.seq}
              item={item}
              depth={depth}
              paused={hovered}
              reduceMotion={reduceMotion ?? false}
              onAction={onAction}
              onExpire={onExpire}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function ReceiptToast({
  item,
  depth,
  paused,
  reduceMotion,
  onAction,
  onExpire,
}: {
  readonly item: EditDeskReceiptItem
  /** 0 = 最前面那条。 */
  readonly depth: number
  readonly paused: boolean
  readonly reduceMotion: boolean
  onAction(seq: number): void
  onExpire(seq: number): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const { seq, receipt } = item
  const text =
    receipt.kind === 'removed'
      ? removedText(t, receipt)
      : receipt.kind === 'changes'
        ? t('receipt.claudeChanged', { count: receipt.count })
        : receipt.kind === 'undone'
          ? t('receipt.undone')
          : receipt.kind === 'error'
            ? receipt.message
            : receipt.by === 'claude'
              ? t('receipt.claudeExported')
              : t('render.landed', { name: receipt.name })
  const action =
    receipt.kind === 'changes' || receipt.kind === 'removed'
      ? t('receipt.undo')
      : receipt.kind === 'landed'
        ? receipt.by === 'claude'
          ? t('receipt.look')
          : t('receipt.backToCanvas')
        : null

  // 「没有新改动」才算闲：数字一加、换成「已撤销」都重新计时。
  const timerKey = `${receipt.kind}:${receipt.kind === 'changes' ? receipt.count : ''}`
  useEffect(() => {
    if (paused) return undefined
    const timer = window.setTimeout(
      () => onExpire(seq),
      receipt.kind === 'undone'
        ? EDIT_RECEIPT_MOTION.undoneMs
        : EDIT_RECEIPT_MOTION.idleMs,
    )
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, timerKey, seq])

  const { stepY, stepScale, stepFade, enterY, outS, stack } =
    EDIT_RECEIPT_MOTION
  return (
    <motion.div
      role={receipt.kind === 'error' ? 'alert' : 'status'}
      data-testid="edit-desk-receipt"
      initial={reduceMotion ? false : { opacity: 0, y: enterY }}
      animate={{
        opacity: 1 - depth * stepFade,
        y: -depth * stepY,
        scale: 1 - depth * stepScale,
        filter: 'blur(0px)',
      }}
      exit={{
        opacity: 0,
        filter: `blur(${LIQUID_TIMING.blurPx}px)`,
        transition: { duration: reduceMotion ? 0 : outS },
      }}
      transition={reduceMotion ? { duration: 0 } : stack}
      style={{ x: '-50%', zIndex: EDIT_RECEIPT_MOTION.max - depth }}
      className="pointer-events-auto absolute bottom-0 left-0 inline-flex h-9 origin-bottom items-center gap-2 whitespace-nowrap rounded-xl bg-foreground px-3.5 text-xs text-background ring-1 ring-background/15"
    >
      {receipt.kind === 'error' ? (
        <span aria-hidden className="w-3.5 text-center font-bold">
          !
        </span>
      ) : (
        <Check aria-hidden className="size-3.5 shrink-0" />
      )}
      <span data-testid="edit-desk-receipt-text">
        <BlurSwap swapKey={text}>{text}</BlurSwap>
      </span>
      {action ? (
        <>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          <button
            type="button"
            data-testid="edit-desk-receipt-action"
            onClick={() => onAction(seq)}
            className="underline underline-offset-3 transition-opacity duration-fast hover:opacity-80"
          >
            {action}
          </button>
        </>
      ) : null}
    </motion.div>
  )
}

/** 「删了「名」」/「删了「名」，带走 2 条台词、1 条字幕」。 */
function removedText(
  t: ReturnType<typeof useTranslations<'StudioNode.editDesk'>>,
  receipt: Extract<EditDeskReceiptState, { kind: 'removed' }>,
): string {
  const riders = [
    receipt.lines > 0
      ? t('receipt.riderLines', { count: receipt.lines })
      : null,
    receipt.captions > 0
      ? t('receipt.riderCaptions', { count: receipt.captions })
      : null,
  ].filter((part): part is string => part !== null)
  return riders.length === 0
    ? t('receipt.removed', { name: receipt.name })
    : t('receipt.removedWith', {
        name: receipt.name,
        riders: riders.join(t('receipt.ridersJoiner')),
      })
}
