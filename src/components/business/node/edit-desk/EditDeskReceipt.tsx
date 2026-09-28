'use client'

/**
 * 舞台正上方那一条回执（④ A 关键切片 · node-canvas-v2 §6「回执与段闪」）。
 *
 * 永远只有一条（⛔ 不弹 toast、不堆叠）：
 * - 外部 Claude 改了时间线 →「Claude 改了 N 段 · 撤销」，同一来源连着改数字累加；
 * - 撤销之后 →「已撤销 · 好」；
 * - 成片落卡 →「Claude 导出了成片 · 已落到画布 · 看看」/「「成片名」已落到画布 ·
 *   回画布看」（你自己导出的也只出这一条，⛔ 不自动退出剪辑台）。
 *
 * 什么时候收起由台面管（它知道有没有新改动）；这里只报「鼠标在不在上面」——
 * 悬停时不走计时。
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { EDIT_RECEIPT_MOTION } from '@/constants/edit-desk'

export type EditDeskReceiptState =
  | { readonly kind: 'changes'; readonly count: number }
  | { readonly kind: 'undone' }
  | {
      readonly kind: 'landed'
      readonly by: 'claude' | 'you'
      readonly name: string
    }

export interface EditDeskReceiptProps {
  /** `null` = 不显示（收起时照样播淡出）。 */
  readonly receipt: EditDeskReceiptState | null
  /** 换一条回执才换 key（重播进场）；数字累加、「已撤销」原地换字都不换。 */
  readonly receiptKey: string
  onUndo(): void
  onDismiss(): void
  onLook(): void
  onHoverChange(hovered: boolean): void
}

export function EditDeskReceipt({
  receipt,
  receiptKey,
  onUndo,
  onDismiss,
  onLook,
  onHoverChange,
}: EditDeskReceiptProps) {
  const t = useTranslations('StudioNode.editDesk')
  const reduceMotion = useReducedMotion()

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      {/* ⚠ `wait`：换一种回执时旧的先淡出 —— 永远只有一条，⛔ 两条并排挤一下。 */}
      <AnimatePresence mode="wait">
        {receipt ? (
          <motion.div
            key={receiptKey}
            role="status"
            data-testid="edit-desk-receipt"
            initial={{ opacity: 0, y: EDIT_RECEIPT_MOTION.riseY }}
            animate={{
              opacity: 1,
              y: 0,
              transition: {
                duration: reduceMotion ? 0 : EDIT_RECEIPT_MOTION.inS,
                ease: 'easeOut',
              },
            }}
            exit={{
              opacity: 0,
              transition: {
                duration: reduceMotion ? 0 : EDIT_RECEIPT_MOTION.outS,
                ease: 'easeIn',
              },
            }}
            onPointerEnter={() => onHoverChange(true)}
            onPointerLeave={() => onHoverChange(false)}
            className="pointer-events-auto inline-flex h-8 items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-card pl-3.5 pr-1 text-xs text-foreground shadow-float"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-foreground" />
            <span data-testid="edit-desk-receipt-text">
              {receipt.kind === 'changes'
                ? t('receipt.claudeChanged', { count: receipt.count })
                : receipt.kind === 'undone'
                  ? t('receipt.undone')
                  : receipt.by === 'claude'
                    ? t('receipt.claudeExported')
                    : t('render.landed', { name: receipt.name })}
            </span>
            <button
              type="button"
              data-testid="edit-desk-receipt-action"
              onClick={
                receipt.kind === 'changes'
                  ? onUndo
                  : receipt.kind === 'undone'
                    ? onDismiss
                    : onLook
              }
              className="inline-flex h-6 items-center rounded-full bg-muted px-3 text-xs transition-colors duration-fast hover:bg-accent"
            >
              {receipt.kind === 'changes'
                ? t('receipt.undo')
                : receipt.kind === 'undone'
                  ? t('receipt.ok')
                  : receipt.by === 'claude'
                    ? t('receipt.look')
                    : t('receipt.backToCanvas')}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
