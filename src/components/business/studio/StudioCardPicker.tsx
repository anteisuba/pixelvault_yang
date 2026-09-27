'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import { cardManagementPath } from '@/constants/routes'
import type { CharacterCardRecord, CharacterImagePick } from '@/types'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Search,
  UserRound,
} from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'
import { useStudioData } from '@/contexts/studio-context'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { Link } from '@/i18n/navigation'
import { characterWork } from '@/lib/character-works'
import { filterByQuery } from '@/lib/search-utils'
import { buildStudioCardUsageMap } from '@/lib/studio-history'
import { cn } from '@/lib/utils'

/**
 * 工作台「角色」弹层（owner 09-27）。
 *
 * ⭐ 只剩角色（画风卡 · 背景卡 · 内置风格一起下线）。点一个角色，她那一行下面展开她的
 *   所有图（卡上的在前，用她出的在后），勾一张或几张 = 这次出图带这几张；一张都不勾 =
 *   她不在场。第一次展开默认勾主图。
 * ⭐ 张数按**这个模型一次能收的参考图**卡住（含你自己挂的参考图）：到上限，没勾的格子
 *   勾不上并写明原因。模型不收参考图时不展开，点一下只是让她在场（名字和标签进文字）。
 * ⚠ 挑的图住在 `characters.imagePicks`；出图时随请求送给卡片总线，服务端按本人校验。
 */

type Pick = CharacterImagePick

const sameTile = (a: Pick, b: Pick) =>
  'slotId' in a
    ? 'slotId' in b && a.slotId === b.slotId
    : 'generationId' in b && a.generationId === b.generationId

function toTimestampMs(value: Date | string | number | null | undefined) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export function StudioCardPicker() {
  const { characters, projects, imageUpload } = useStudioData()
  const t = useTranslations('StudioV2')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const usage = useMemo(
    () => buildStudioCardUsageMap(projects.history),
    [projects.history],
  )

  const maxImages = imageUpload.maxImages
  const ownReferences = imageUpload.referenceImages.length
  const pickedTotal = characters.activeCardIds.reduce(
    (total, id) => total + (characters.imagePicks[id]?.length ?? 0),
    0,
  )
  const noReferences = maxImages === 0
  const remaining = Number.isFinite(maxImages)
    ? Math.max(0, maxImages - ownReferences - pickedTotal)
    : Infinity

  const visible = filterByQuery(characters.cards, query, (card) => [
    card.name,
    ...card.cardTags.character,
    characterWork(card, locale).label ?? '',
  ]).sort((left, right) => {
    const rightUsed = toTimestampMs(usage.character[right.id])
    const leftUsed = toTimestampMs(usage.character[left.id])
    if (rightUsed !== leftUsed) return rightUsed - leftUsed
    return (
      toTimestampMs(right.createdAt) - toTimestampMs(left.createdAt) ||
      left.name.localeCompare(right.name)
    )
  })

  const openRow = (card: CharacterCardRecord) => {
    if (noReferences) {
      characters.toggleCardSelection(card.id)
      return
    }
    if (expandedId === card.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(card.id)
    // 第一次展开一个还没挑图的角色：默认勾主图（有位子的话）。
    const primary =
      card.referenceSlots.find((slot) => slot.isPrimary) ??
      card.referenceSlots[0]
    if (!characters.imagePicks[card.id]?.length && primary && remaining > 0) {
      characters.setImagePicks(card.id, [{ slotId: primary.id }])
    }
  }

  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-xl">
      <header className="flex flex-col gap-2.5 border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('characters')}</h2>
          {characters.activeCardIds.length > 0 ? (
            <>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                {characters.activeCardIds.length}
              </span>
              <button
                type="button"
                onClick={() => characters.setActiveCardIds([])}
                className="ml-auto text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground"
              >
                {t('clearCharacters')}
              </button>
            </>
          ) : null}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchCharactersPlaceholder')}
            // ⚠ <768 必须 ≥16px：iOS 对小于 16px 的可聚焦输入框会自动放大整页。
            className="h-9 w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 text-base outline-none transition-colors focus:border-primary/35 focus:ring-2 focus:ring-primary/15 md:text-sm"
          />
        </div>
        <p
          className="text-xs text-muted-foreground"
          data-testid="card-picker-limit"
        >
          {noReferences
            ? t('noReferenceImages')
            : Number.isFinite(maxImages)
              ? t('referenceLimit', {
                  max: maxImages,
                  used: ownReferences + pickedTotal,
                })
              : null}
        </p>
      </header>

      <div className="max-h-[min(48vh,28rem)] overflow-y-auto p-2">
        {characters.isLoading && characters.cards.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          query.trim() ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t('cardSearchEmpty')}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
              <p className="max-w-72 text-sm leading-6 text-muted-foreground">
                {t('noCharacterCards')}
              </p>
              <Link
                href={cardManagementPath({ tab: 'characters' })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
              >
                {t('openCardManagement')}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-1">
            {visible.map((card) => {
              const active = characters.activeCardIds.includes(card.id)
              const picks = characters.imagePicks[card.id] ?? []
              const expanded = expandedId === card.id
              const work = characterWork(card, locale).label
              const thumb =
                card.referenceSlots.find((slot) => slot.isPrimary)?.url ??
                card.sourceImageUrl
              return (
                <li
                  key={card.id}
                  data-testid="card-picker-character"
                  className={cn(
                    'rounded-xl transition-colors duration-fast',
                    active ? 'bg-muted/60' : 'hover:bg-muted/35',
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={noReferences ? undefined : expanded}
                    aria-pressed={noReferences ? active : undefined}
                    onClick={() => openRow(card)}
                    className="flex w-full items-center gap-3 p-2 text-left"
                  >
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {card.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          work ?? t('originalWork'),
                          active
                            ? picks.length
                              ? t('pickedImages', { count: picks.length })
                              : t('autoImages')
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {noReferences ? (
                      active ? (
                        <Check className="size-4 shrink-0" aria-hidden />
                      ) : null
                    ) : (
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
                          expanded && 'rotate-180',
                        )}
                        aria-hidden
                      />
                    )}
                  </button>
                  {expanded ? (
                    <CharacterImageGrid
                      card={card}
                      picks={picks}
                      remaining={remaining}
                      onChange={(next) =>
                        characters.setImagePicks(card.id, next)
                      }
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function CharacterImageGrid({
  card,
  picks,
  remaining,
  onChange,
}: {
  card: CharacterCardRecord
  picks: readonly Pick[]
  remaining: number
  onChange(next: Pick[]): void
}) {
  const t = useTranslations('StudioV2')
  const usage = useCharacterCardUsage(card.id, true)
  const tiles: { pick: Pick; url: string; badge: string | null }[] = [
    ...card.referenceSlots.map((slot) => ({
      pick: { slotId: slot.id } as Pick,
      url: slot.url,
      badge: slot.isPrimary ? t('primaryImage') : t('imagesOnCard'),
    })),
    ...usage.generations
      .filter(
        (generation) =>
          !card.referenceSlots.some((slot) => slot.url === generation.url),
      )
      .map((generation) => ({
        pick: { generationId: generation.id } as Pick,
        url: generation.thumbnailUrl ?? generation.url,
        badge: null,
      })),
  ]

  if (tiles.length === 0) {
    return (
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        {usage.isLoading ? t('loadingImages') : t('noCharacterImages')}
      </p>
    )
  }

  return (
    <div className="px-2 pb-2.5">
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {tiles.map((tile) => {
          const on = picks.some((pick) => sameTile(pick, tile.pick))
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
              title={blocked ? t('referenceLimitReached') : undefined}
              onClick={() =>
                onChange(
                  on
                    ? picks.filter((pick) => !sameTile(pick, tile.pick))
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
          {t('referenceLimitReached')}
        </p>
      ) : null}
    </div>
  )
}
