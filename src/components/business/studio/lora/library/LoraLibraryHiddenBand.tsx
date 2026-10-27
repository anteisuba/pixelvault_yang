'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import type { LoraHiddenFilter } from '@/constants/lora'
import type { CivitaiLoraHiddenItem } from '@/types'
import { LIBRARY_GRID_CLASS } from '@/components/ui/library-kit'

interface LoraLibraryHiddenBandProps {
  items: CivitaiLoraHiddenItem[]
  /** 去掉底模与类型后的总数；null = 不给「去掉」那一颗 */
  relaxTotal: string | null
  /** 「去掉底模「X」」/「去掉类型「Y」」/「去掉底模和类型」 */
  relaxLabel: string | null
  onRelax: () => void
  /** 一格怎么画（同网格里的 `LoraLibraryTile`）；`veiled` = 被分级挡住、还没揭开 */
  renderTile: (
    item: CivitaiLoraHiddenItem,
    tile: { meta: string; veiled: boolean; reveal: () => void },
  ) => ReactNode
}

const REASON_KEYS: Record<LoraHiddenFilter, string> = {
  base: 'hiddenByBase',
  type: 'hiddenByType',
  nsfw: 'hiddenByNsfw',
}

/**
 * 搜到了、但名字对得上的几个被筛选挡住了（摆在结果最前面单独
 * 一条）。按名字搜的时候要找的多半就是这几个，所以放最显眼的地方；每格灰字写
 * 是被哪项挡的，被分级挡的封面先糊着、点一下才看清（10-22 定）。右边一颗
 * 「去掉底模 / 类型 · 共 N 个」，分级⛔ 替用户放宽。
 */
export function LoraLibraryHiddenBand({
  items,
  relaxTotal,
  relaxLabel,
  onRelax,
  renderTile,
}: LoraLibraryHiddenBandProps) {
  const tb = useTranslations('LoraWorkbench.browse')
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set())

  return (
    <section className="mb-4 rounded-20 bg-muted p-2.5">
      <div className="flex min-h-7 items-center gap-2 px-1 pb-2">
        <h3 className="text-2sm text-muted-foreground">
          {items.length > 0
            ? tb('hiddenTitle', { count: items.length })
            : tb('hiddenTitleCountOnly')}
        </h3>
        {relaxLabel && relaxTotal ? (
          <button
            type="button"
            onClick={onRelax}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs text-foreground transition-colors duration-fast ease-linear hover:border-foreground/30 focus-visible:outline-none focus-visible:shadow-focus"
          >
            {relaxLabel}
            <small className="font-mono text-2xs text-muted-foreground">
              {tb('hiddenRelaxCount', { count: relaxTotal })}
            </small>
          </button>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className={LIBRARY_GRID_CLASS}>
          {items.map((item) => {
            const veiled =
              item.blockedBy.includes('nsfw') && !revealed.has(item.id)
            const meta = [
              item.baseModelFamily,
              ...item.blockedBy.map((reason) => tb(REASON_KEYS[reason])),
            ].join(' · ')
            return (
              <div key={item.id}>
                {renderTile(item, {
                  meta,
                  veiled,
                  reveal: () =>
                    setRevealed((current) => new Set(current).add(item.id)),
                })}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
