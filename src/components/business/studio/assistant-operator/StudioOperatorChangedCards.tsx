'use client'

/**
 * 回执下面那张**改动清单**（node-canvas-v2 §1 第 4 条 · 方向 B「助手推开画布」）：
 * 这一轮改了哪几张卡，一行一张「卡名 · 改了什么」，点一行 = 画布平移到那张卡并让
 * 卡面闪一下（`host.canvasTargets.locate`）。
 *
 * ⚠ 只有画布给：其余宿主没有「卡」可定位。⛔ 不在这里再放一颗撤销 —— 撤销只有回执
 * 那一个入口（owner 2026-09-24「只留一个入口」）。
 */

import { ArrowUpRight } from '@/components/icons'

export interface StudioOperatorChangedCard {
  readonly id: string
  /** 「S02 · 公园 · 提示词」—— 卡名在前，改了什么跟在后面。 */
  readonly label: string
}

export function StudioOperatorChangedCards({
  cards,
  onLocate,
}: {
  readonly cards: readonly StudioOperatorChangedCard[]
  onLocate(id: string): void
}) {
  if (cards.length === 0) return null
  return (
    <ul data-testid="operator-changed-cards" className="mt-1.5 flex flex-col">
      {cards.map((card) => (
        <li key={card.id}>
          <button
            type="button"
            data-changed-card={card.id}
            onClick={() => onLocate(card.id)}
            className="group/row flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-foreground/80 transition-[background-color,transform] duration-fast ease-standard hover:bg-surface-fill-hover active:scale-96 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
          >
            <span className="min-w-0 flex-1 truncate">{card.label}</span>
            <ArrowUpRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-fast group-hover/row:opacity-100"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}
