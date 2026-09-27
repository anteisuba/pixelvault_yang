'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import type { CharacterCardRecord, CharacterImagePick } from '@/types'
import { Check } from '@/components/icons'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { cn } from '@/lib/utils'

/**
 * 一位角色的**勾图格子**：卡上的图在前（主图 / 卡上），用她出的在后；勾一张或几张 =
 * 这一次带这几张（owner 09-27 工作台「角色」弹层；09-28 画布镜头里 @她 同一套）。
 *
 * ⚠ 张数按「这个模型一次能收几张参考图」卡住：到上限，没勾的格子勾不上并写明原因。
 *   上限怎么算归调用方（工作台 / 画布各自知道模型和已挂的参考图），这里只收 `remaining`。
 */

export function sameCharacterPick(
  a: CharacterImagePick,
  b: CharacterImagePick,
) {
  return 'slotId' in a
    ? 'slotId' in b && a.slotId === b.slotId
    : 'generationId' in b && a.generationId === b.generationId
}

export function CharacterImagePickGrid({
  card,
  picks,
  remaining,
  onChange,
  className,
}: {
  card: CharacterCardRecord
  picks: readonly CharacterImagePick[]
  /** 还能再勾几张（`Infinity` = 不限）。 */
  remaining: number
  onChange(next: CharacterImagePick[]): void
  className?: string
}) {
  const t = useTranslations('CharacterImagePick')
  const usage = useCharacterCardUsage(card.id, true)
  const tiles: {
    pick: CharacterImagePick
    url: string
    badge: string | null
  }[] = [
    ...card.referenceSlots.map((slot) => ({
      pick: { slotId: slot.id } as CharacterImagePick,
      url: slot.url,
      badge: slot.isPrimary ? t('primary') : t('onCard'),
    })),
    ...usage.generations
      .filter(
        (generation) =>
          !card.referenceSlots.some((slot) => slot.url === generation.url),
      )
      .map((generation) => ({
        pick: { generationId: generation.id } as CharacterImagePick,
        url: generation.thumbnailUrl ?? generation.url,
        badge: null,
      })),
  ]

  if (tiles.length === 0) {
    return (
      <p className={cn('px-3 pb-3 text-xs text-muted-foreground', className)}>
        {usage.isLoading ? t('loading') : t('empty')}
      </p>
    )
  }

  return (
    <div className={cn('px-2 pb-2.5', className)}>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {tiles.map((tile) => {
          const on = picks.some((pick) => sameCharacterPick(pick, tile.pick))
          const blocked = !on && remaining <= 0
          return (
            <button
              key={
                'slotId' in tile.pick
                  ? tile.pick.slotId
                  : tile.pick.generationId
              }
              type="button"
              data-testid="card-picker-image"
              aria-pressed={on}
              disabled={blocked}
              title={blocked ? t('limitReached') : undefined}
              onClick={() =>
                onChange(
                  on
                    ? picks.filter(
                        (pick) => !sameCharacterPick(pick, tile.pick),
                      )
                    : [...picks, tile.pick],
                )
              }
              className={cn(
                'relative aspect-4/5 overflow-hidden rounded-lg bg-muted outline-none transition-opacity duration-fast focus-visible:ring-2 focus-visible:ring-ring',
                on && 'ring-2 ring-foreground',
                blocked && 'cursor-not-allowed opacity-40',
              )}
            >
              <Image
                src={tile.url}
                alt=""
                fill
                sizes="72px"
                className="object-cover"
              />
              {tile.badge ? (
                <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 text-3xs">
                  {tile.badge}
                </span>
              ) : null}
              {on ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-3" aria-hidden />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {remaining <= 0 ? (
        <p className="mt-1.5 px-0.5 text-xs text-muted-foreground">
          {t('limitReached')}
        </p>
      ) : null}
    </div>
  )
}
