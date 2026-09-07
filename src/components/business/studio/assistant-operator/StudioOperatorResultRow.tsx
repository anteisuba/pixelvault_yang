'use client'

/**
 * **结果行卡**（`pages/assistant-shell.md` §3.1 ⑱–⑲ / §4.2 / §11.4）。
 *
 * 助手触发或用户点名的那一批生成回来之后，在时间线里插一行缩略图：
 *  · 2 列，容器 ≥`wideAtPx` 时 4 列（`@container`，⛔ 不看视口 —— 面板宽是用户
 *    拖出来的，视口断点在这里说不了话）；
 *  · 点一格 = 选中（再点一次取消）；选中态是 `border-primary` + 内描边，
 *    ⛔ 不用底色块（§11.3 的「层级靠形状与缩进」同一条纪律）；
 *  · hover / focus-within 出底部浮层两颗：「问助手」（→ @chip 管线）与「放大」
 *    （→ 既有灯箱，⛔ 不新做一个查看器）；
 *  · 卡脚「未选定 / 已选 ②」+「按这张继续」= 插 @chip 并预填一句。
 *
 * ── ⚠ 这颗组件**不知道结果从哪来** ────────────────────────────────
 * 它只画 `items`。数据源是宿主那条在飞回流（工作台的 `activeRun`；LoRA 装配台
 * 第 3 轮接自己的结果列）。组件里去 context 摸一把的下场是它在 `/studio/lora`
 * 上直接抛 —— 那条路由故意不挂 `<StudioProvider>`。
 */

import { motion, useReducedMotion } from 'motion/react'
import { Maximize2, MessageSquarePlus } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { EASE_STANDARD, DURATION } from '@/constants/motion'
import { STUDIO_OPERATOR_RESULT_STAGGER } from '@/constants/studio-assistant-operator'
import { buildGenerationTag } from '@/lib/generation-name'
import { cn } from '@/lib/utils'
import type { StudioOperatorResultItem } from '@/types/studio-assistant-operator'

/**
 * 序号字形（§3.1 ⑲「结果 ②」的那个 ②）。
 *
 * ⚠ 用带圈数字而不是 `02`：这个序号会**出现在对话里**（「@结果② 手指有问题」），
 * 而带圈数字在一句话中间读得出来、也复制得走。超出表长回落成 `#21` —— ⛔ 不
 * 静默截断成 ⑳（那会让两格顶着同一个号）。
 */
const RESULT_ORDINALS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

export function resultOrdinal(index: number): string {
  return RESULT_ORDINALS[index] ?? `#${index + 1}`
}

interface StudioOperatorResultRowProps {
  items: readonly StudioOperatorResultItem[]
  /** 当前选中的那一格（store 里那份）。 */
  selectedId: string | null
  /** 点一格 —— 再点同一格时调用方收到 `null`（取消选中）。 */
  onSelect(id: string | null): void
  /** 「问助手」—— 插一枚 @chip 并把焦点还给输入框。 */
  onAsk(item: StudioOperatorResultItem, index: number): void
  /** 「放大」—— 复用既有灯箱。 */
  onZoom(item: StudioOperatorResultItem, index: number): void
  /** 「按这张继续」—— 插 @chip + 预填一句。 */
  onContinue(item: StudioOperatorResultItem, index: number): void
}

export function StudioOperatorResultRow({
  items,
  selectedId,
  onSelect,
  onAsk,
  onZoom,
  onContinue,
}: StudioOperatorResultRowProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()

  if (items.length === 0) return null

  const selectedIndex = items.findIndex((item) => item.id === selectedId)
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null

  return (
    <div
      data-testid="operator-result-row"
      className="@container overflow-hidden rounded-xl border border-border bg-card"
    >
      <p className="border-b border-border px-3 py-2 text-md font-semibold text-foreground">
        {t('result.title', { count: items.length })}
      </p>

      {/* ⚠ 宽档门槛与 `STUDIO_OPERATOR_SHELL.wideAtPx` 是同一个数（用例按它断言
          类名）。⛔ 不看视口断点：面板宽度是拖出来的。 */}
      <div className="grid grid-cols-2 gap-2 p-3 @min-[700px]:grid-cols-4">
        {items.map((item, index) => {
          const isSelected = item.id === selectedId
          return (
            <motion.div
              key={item.id}
              data-testid="operator-result-tile"
              data-selected={isSelected}
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
              className="group/tile relative aspect-3/4 overflow-hidden rounded-lg"
            >
              <button
                type="button"
                data-testid="operator-result-select"
                aria-pressed={isSelected}
                aria-label={t('result.select', {
                  ordinal: resultOrdinal(index),
                })}
                onClick={() => onSelect(isSelected ? null : item.id)}
                className={cn(
                  'absolute inset-0 size-full overflow-hidden rounded-lg border bg-muted transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-primary ring-2 ring-inset ring-primary'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <Image
                  src={item.thumbnailUrl ?? item.url}
                  alt={item.label ?? ''}
                  width={240}
                  height={320}
                  unoptimized
                  className="size-full object-cover"
                />
              </button>

              {/**
               * 角标写**产物名的身份段**（`图_012`，切片 N1）而不是 ①②③。
               *
               * ⭐ 理由是这个角标要能**照着打出来**：用户在输入框里写
               * `@图_012 手指有问题`，正文解析当场把它变成 chip。序号 ① 做不到
               * 这件事 —— 它每一轮都从 ① 重新数，指的是「这一屏的第几格」，
               * 一换轮次就指向另一张图。
               * ⚠ 序号本身**没有消失**：选中态文案与读屏名照旧用它（那两处说的
               * 就是「这一屏的第几格」），⛔ 不为了统一而把它们也换掉。
               */}
              <span
                data-testid="operator-result-name"
                className="pointer-events-none absolute left-1 top-1 rounded bg-card/85 px-1 font-mono text-xs tracking-nav tabular-nums text-foreground"
              >
                {buildGenerationTag({ id: item.id })}
              </span>

              {/* 底部渐变浮层（§3.1 ⑲）：默认透明，hover / 键盘聚焦才出现 ——
                  ⚠ `focus-within` 那一半不能省，否则这两颗按钮键盘永远够不着。 */}
              <div
                data-testid="operator-result-overlay"
                className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-foreground/70 to-transparent p-1 opacity-0 transition-opacity duration-(--duration-fast) ease-standard group-hover/tile:pointer-events-auto group-hover/tile:opacity-100 group-focus-within/tile:pointer-events-auto group-focus-within/tile:opacity-100 motion-reduce:transition-none"
              >
                <button
                  type="button"
                  data-testid="operator-result-ask"
                  title={t('result.ask')}
                  aria-label={t('result.ask')}
                  onClick={() => onAsk(item, index)}
                  className="flex items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-xs text-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MessageSquarePlus className="size-2.5" aria-hidden />
                  {t('result.ask')}
                </button>
                <button
                  type="button"
                  data-testid="operator-result-zoom"
                  title={t('result.zoom')}
                  aria-label={t('result.zoom')}
                  onClick={() => onZoom(item, index)}
                  className="flex items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-xs text-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Maximize2 className="size-2.5" aria-hidden />
                  {t('result.zoom')}
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-muted/45 px-3 py-2">
        <span
          data-testid="operator-result-selection"
          className="min-w-0 flex-1 truncate font-mono text-xs tracking-nav text-muted-foreground"
        >
          {selected
            ? t('result.selected', { ordinal: resultOrdinal(selectedIndex) })
            : t('result.unselected')}
        </span>
        {/* ⚠ 没选中时**不渲染**这颗，⛔ 不做禁用占位（§4.3）。 */}
        {selected ? (
          <button
            type="button"
            data-testid="operator-result-continue"
            onClick={() => onContinue(selected, selectedIndex)}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-2sm text-primary-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('result.continue')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
