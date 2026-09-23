'use client'

/**
 * **结果卡**（v2 §6 / 画板 BCards「结果」三态）。
 *
 * 一张卡三个形态，分岔只看载荷：
 *  · **生成中**（`items` 为空）—— 灰底占位格 × `total` + 「正在出图 · 1 / 3」+ 细进度条；
 *  · **单张**（`items.length === 1`）—— 左缩略图 + 右「已入库 · 摘要 · 时间」+ 两颗轻操作；
 *  · **多张** —— 一排等宽缩略图 + 同一行读数 + 同两颗轻操作。
 *
 * ── ⛔ 没有审核态（§6.1 / 决策 12）────────────────────────────────
 * 生成一律**自动入库**，卡上写的是结果（`已入库 3 张`）而不是一道要人点的题。
 * ✓/✕ 两颗记号、标审核态的那条工具在面板里的入口、以及「未选定 / 已选 ②」
 * 那一行全部删掉。由来：审核态要求用户在「刚看到图」这个最没耐心的时刻做一次
 * 二元判断，而实测里绝大多数人直接跳过 —— 留着一个没人点的控件，只会让「这张
 * 我否过」这条语义看上去存在、实际不可靠。⚠ **工具本身留在服务端「改」组**
 * （画布侧还在用它），⛔ 别顺手把它也删了。
 *
 * ── 两个轻操作（§6.2）──────────────────────────────────────────────
 * 「再来一组」→ 参数原样出一张**新的生成确认卡**（⛔ 不直接扣扳机，钱闸只有
 * 确认卡一个入口）；「用它当参考」→ 走 `@` chip 那条唯一的管线挂进工作台参考位
 * （与下行「素材库」按钮同一条路）。⛔ 没有第三颗：放大与「问助手」随 §6 一起
 * 删了 —— 放大去灯箱、指认去 `@` 选择器，两条路本来就在。
 *
 * ── ⚠ 这颗组件**不知道结果从哪来** ────────────────────────────────
 * 它只画传进来的那几样。回流在 `use-studio-operator-results.ts`，卡的落地在
 * `confirmGeneration`。组件里去 context 摸一把的下场是它在 `/studio/lora` 上
 * 直接抛 —— 那条路由故意不挂 `<StudioProvider>`。
 */

import { motion, useReducedMotion } from 'motion/react'
import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'

import { EASE_STANDARD, DURATION } from '@/constants/motion'
import { STUDIO_OPERATOR_RESULT_STAGGER } from '@/constants/studio-assistant-operator'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import type {
  StudioOperatorResultEntry,
  StudioOperatorResultItem,
} from '@/types/studio-assistant-operator'

interface StudioOperatorResultRowProps {
  entry: StudioOperatorResultEntry
  /** 「再来一组」—— 缺席时那颗不画（载荷丢了的历史条目）。 */
  onRerun?(entry: StudioOperatorResultEntry): void
  /** 「用它当参考」—— 多张时挂的是第一张（画板上那两颗按钮没有分格）。 */
  onUseAsReference(item: StudioOperatorResultItem): void
}

/**
 * 比例串（「3:4」）→ CSS `aspect-ratio`。读不出来就按 3:2（D12 P3：单张按输入区
 * 宽度出，约 3:2）。⚠ 走 style：比例来自生成参数，是数据不是设计值。
 */
function toCssAspect(ratio: string | null | undefined): string {
  const match = ratio?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  return match ? `${match[1]} / ${match[2]}` : '3 / 2'
}

function ResultThumb({
  item,
  index,
  aspect,
}: {
  item: StudioOperatorResultItem
  index: number
  aspect: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      data-testid="operator-result-tile"
      onClick={() => openOperatorLightbox(item.url, item.label ?? '')}
      // 占位格 → 结果图（D12 动效表）：只淡入，尺寸与占位格一致，⛔ 不跳动。
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion ? 0 : DURATION.base,
        ease: EASE_STANDARD,
        delay: reduceMotion
          ? 0
          : Math.min(index, STUDIO_OPERATOR_RESULT_STAGGER.maxItems) *
            STUDIO_OPERATOR_RESULT_STAGGER.stepSeconds,
      }}
      style={{ aspectRatio: aspect }}
      className="relative w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src={item.thumbnailUrl ?? item.url}
        alt={item.label ?? ''}
        fill
        sizes="(max-width: 640px) 100vw, 420px"
        unoptimized
        /**
         * ⚠ `object-top`（2026-09-12 实测第 5 步）：按中心裁一张人物图正好剩两条
         * 腿。取顶部之后缩略图里至少有脸。
         */
        className="object-cover object-top"
      />
    </motion.button>
  )
}

export function StudioOperatorResultRow({
  entry,
  onRerun,
  onUseAsReference,
}: StudioOperatorResultRowProps) {
  const t = useTranslations('StudioOperator.result')
  const format = useFormatter()
  const { items, total, completed } = entry
  const generating = items.length === 0
  const aspect = toCssAspect(entry.request?.specs.aspectRatio)
  /**
   * ⚠ 占位格数 = 本次张数（§6.3），⛔ 不画一个固定的三格。
   */
  const count = generating ? Math.max(total, 1) : items.length
  /**
   * 单张封顶 `max-w-sm`（D12 真机：1:1 的图按整宽出有 600 多高，一张图顶掉半个
   * 面板）；多张两列铺满。
   */
  const grid = count > 1 ? 'grid grid-cols-2 gap-1.5' : 'flex max-w-sm'
  const ghost =
    'inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'

  return (
    <div
      data-testid="operator-result-row"
      data-generating={generating}
      /* D12 S6 / S7：白底细边卡，图按卡宽出（单张整宽、多张两列）。 */
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5"
    >
      {generating ? (
        <>
          <p
            data-testid="operator-result-progress"
            className="text-xs text-muted-foreground"
          >
            {t('generating', { done: completed, total })}
          </p>
          <div className={grid}>
            {Array.from({ length: count }, (_, index) => (
              <span
                key={index}
                data-testid="operator-result-placeholder"
                /* P4：图片占位允许骨架（助手文字态才禁骨架），尺寸 = 结果尺寸。 */
                style={{
                  aspectRatio: aspect,
                  animationDelay: `${index * 120}ms`,
                }}
                className="w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={grid}>
            {items.map((item, index) => (
              <ResultThumb
                key={item.id}
                item={item}
                index={index}
                aspect={aspect}
              />
            ))}
          </div>
          <p
            data-testid="operator-result-stored"
            className="min-w-0 truncate text-xs text-muted-foreground"
          >
            {items.length === 1
              ? t('stored')
              : t('storedCount', { count: items.length })}
            {entry.storedAt
              ? ` · ${format.dateTime(new Date(entry.storedAt), {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : ''}
            {entry.summary ? ` · ${entry.summary}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {/* ⚠ 载荷缺席时**不渲染**，⛔ 不做禁用占位。 */}
            {entry.request && onRerun ? (
              <button
                type="button"
                data-testid="operator-result-rerun"
                onClick={() => onRerun(entry)}
                className={ghost}
              >
                {t('rerun')}
              </button>
            ) : null}
            {items[0] ? (
              <button
                type="button"
                data-testid="operator-result-reference"
                onClick={() => onUseAsReference(items[0]!)}
                className={ghost}
              >
                {t('useAsReference')}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
