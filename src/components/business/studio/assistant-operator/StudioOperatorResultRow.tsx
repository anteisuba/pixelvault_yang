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
import { Images, RotateCw } from '@/components/icons'
import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'

import { EASE_STANDARD, DURATION } from '@/constants/motion'
import { STUDIO_OPERATOR_RESULT_STAGGER } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
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

/** 缩略图一格 —— 单张那一档给固定宽，多张那一档等分。 */
function ResultThumb({
  item,
  index,
  className,
}: {
  item: StudioOperatorResultItem
  index: number
  className: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.span
      data-testid="operator-result-tile"
      // `tileIn`（§11.5）：opacity + y8，stagger 30ms 封顶前 12 项。
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : DURATION.base,
        ease: EASE_STANDARD,
        delay: reduceMotion
          ? 0
          : Math.min(index, STUDIO_OPERATOR_RESULT_STAGGER.maxItems) *
            STUDIO_OPERATOR_RESULT_STAGGER.stepSeconds,
      }}
      className={cn('overflow-hidden rounded-lg bg-muted', className)}
    >
      <Image
        src={item.thumbnailUrl ?? item.url}
        alt={item.label ?? ''}
        width={240}
        height={180}
        unoptimized
        /**
         * ⚠ `object-top`（2026-09-12 实测第 5 步）：格子是横的、出的图多半是竖的，
         * 按中心裁一张人物图正好剩两条腿。取顶部之后缩略图里至少有脸。
         * ⛔ 不写任意值的 `object-position`（Tailwind 4，本仓无 tailwind.config）。
         */
        className="size-full object-cover object-top"
      />
    </motion.span>
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
  const single = items.length === 1
  const first = items[0]

  /**
   * ⚠ 占位格数 = 本次张数（§6.3），⛔ 不画一个固定的三格：一次出一张时三格
   * 里有两格永远是空的，而用户会以为有两张没出来。
   */
  const placeholders = Array.from(
    { length: Math.max(total, 1) },
    (_, index) => index,
  )

  return (
    <div
      data-testid="operator-result-row"
      data-generating={generating}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-assistant-card"
    >
      {generating ? (
        <>
          <div className="flex gap-1.5">
            {placeholders.map((index) => (
              <span
                key={index}
                data-testid="operator-result-placeholder"
                // ⚠ 脉冲**逐格错开**（画板上那三格是三档灰的静态表达）：三格
                //   同时呼吸读起来像一整块没加载出来的背景，错开之后它说的才是
                //   「有 3 张各自在路上」。⛔ 不画转圈。
                className="h-16 flex-1 animate-pulse rounded-lg bg-muted"
                style={{ animationDelay: `${index * 120}ms` }}
              />
            ))}
          </div>
          <p
            data-testid="operator-result-progress"
            className="text-2sm text-muted-foreground"
          >
            {t('generating', { done: completed, total })}
          </p>
          {/* 细进度条 —— 读数已经写在上一行，这条只是它的形状。 */}
          <span
            aria-hidden
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-foreground transition-[width] duration-(--duration-fast) ease-standard motion-reduce:transition-none"
              style={{
                width: `${total > 0 ? Math.round((completed / total) * 100) : 0}%`,
              }}
            />
          </span>
        </>
      ) : (
        <div className={cn('flex gap-3', single ? 'items-center' : 'flex-col')}>
          {single && first ? (
            <ResultThumb
              item={first}
              index={0}
              className="h-20 w-28 shrink-0"
            />
          ) : (
            <div className="flex gap-1.5">
              {items.map((item, index) => (
                <ResultThumb
                  key={item.id}
                  item={item}
                  index={index}
                  className="h-16 min-w-0 flex-1"
                />
              ))}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* 🔬 contrast-check（2026-09-11，浅 / 深）：`status-applied` 对卡背
                5.42 / 10.26 —— 正文字号按 1.4.3 走 4.5:1，两档都过。 */}
            <p
              data-testid="operator-result-stored"
              className="min-w-0 truncate text-2sm text-muted-foreground"
            >
              <span className="text-status-applied">
                {single
                  ? t('stored')
                  : t('storedCount', { count: items.length })}
              </span>
              {entry.summary ? ` · ${entry.summary}` : ''}
              {entry.storedAt
                ? ` · ${format.dateTime(new Date(entry.storedAt), {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {/* ⚠ 载荷缺席时**不渲染**，⛔ 不做禁用占位（§4.3 同一条纪律）。 */}
              {entry.request && onRerun ? (
                <button
                  type="button"
                  data-testid="operator-result-rerun"
                  onClick={() => onRerun(entry)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <RotateCw className="size-3" aria-hidden />
                  {t('rerun')}
                </button>
              ) : null}
              {first ? (
                <button
                  type="button"
                  data-testid="operator-result-reference"
                  onClick={() => onUseAsReference(first)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <Images className="size-3" aria-hidden />
                  {t('useAsReference')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
