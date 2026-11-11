'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import type { CharacterCardRecord, CharacterLookRecord } from '@/types'
import type { NovelAiCharacter } from '@/types/novelai'
import { cn } from '@/lib/utils'
import { defaultLook } from '@/lib/card-bus'
import { lookLabel } from '@/lib/character-looks'
import { ChevronDown, ChevronRight, Plus } from '@/components/icons'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { Spinner } from '@/components/ui/spinner'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverBaseClass,
  studioToolSurfaceMobileClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { useCharacterCards } from '@/features/cards/hooks'
import { useDanbooruCatalog } from '@/hooks/use-danbooru-catalog'

export type StudioTagCharacterSeed = Pick<
  NovelAiCharacter,
  'label' | 'origin'
> & { prompt: string }

/** 一套造型拷进台上那一位时的标签原文（`origin.tags` 和「改过」都按它比）。 */
export function lookTagsText(look: Pick<CharacterLookRecord, 'tags'>) {
  return look.tags.join(', ')
}

/** 页签名字：「爱弥斯 · 泳装」；只有一套没起名的默认造型就只写名字。 */
export function seedLabel(
  card: Pick<CharacterCardRecord, 'name' | 'looks'>,
  look: CharacterLookRecord,
  lookName: string,
) {
  return card.looks.length > 1 || look.label
    ? `${card.name} · ${lookName}`
    : card.name
}

const rowClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus'

/**
 * 「＋ 加角色 ▾」（owner 11-01 定 A 细化，稿 tag-studio-ui/q1b）：一个搜索框同时搜
 * 「我的角色」和标签库；我的角色点开挑造型（只有一套就直接加）；标签库挑中 = 新一位只填
 * 那个角色标签；最下面是空白的女 / 男 / 其他。填进来是**拷贝**，台上改不动角色卡。
 */
export function StudioTagAddCharacter({
  disabled,
  full,
  onAdd,
}: {
  disabled: boolean
  /** 满了：键变淡、点不开。 */
  full: boolean
  onAdd: (seed: StudioTagCharacterSeed) => void
}) {
  const t = useTranslations('StudioTags.addMenu')
  const [open, setOpen] = useState(false)
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'start',
    sideOffset: 8,
  })
  return (
    <StudioToolSurface open={open} onOpenChange={setOpen}>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={disabled || full}
          aria-label={t('trigger')}
          className="relative inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-2xs whitespace-nowrap text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40 data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
          {t('trigger')}
          <ChevronDown className="size-3" aria-hidden />
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        label={t('trigger')}
        side="top"
        align="start"
        sideOffset={8}
        style={popoverMotion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'w-80 p-2',
          popoverMotion.className,
        )}
        mobileClassName={studioToolSurfaceMobileClass.small}
      >
        {open ? (
          <AddCharacterBody
            onAdd={(seed) => {
              setOpen(false)
              onAdd(seed)
            }}
          />
        ) : null}
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}

function AddCharacterBody({
  onAdd,
}: {
  onAdd: (seed: StudioTagCharacterSeed) => void
}) {
  const t = useTranslations('StudioTags.addMenu')
  const tLooks = useTranslations('CharacterLooks')
  const locale = useLocale()
  const { cards, isLoading } = useCharacterCards()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const text = query.trim().toLowerCase()
  const mine = cards
    .filter(
      (card) =>
        !text ||
        card.name.toLowerCase().includes(text) ||
        card.handle?.toLowerCase().includes(text),
    )
    .slice(0, text ? 8 : 5)
  const library = useDanbooruCatalog(
    text.length >= 2 ? { kind: 'character', query: query.trim() } : null,
  )
  const candidates = (library.data ?? library.previous)?.candidates ?? []

  const pickLook = (card: CharacterCardRecord, look: CharacterLookRecord) => {
    const tags = lookTagsText(look)
    onAdd({
      prompt: tags,
      label: seedLabel(card, look, lookLabel(look, card.looks, tLooks)),
      origin: { cardId: card.id, lookId: look.id, tags },
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="h-8 rounded-md border border-border bg-background px-2.5 text-2xs outline-none focus-visible:shadow-focus"
      />
      <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
        <span className="px-2 pt-1.5 pb-0.5 text-2xs text-muted-foreground">
          {t('mine')}
        </span>
        {isLoading && cards.length === 0 ? (
          <span className="flex justify-center py-2">
            <Spinner className="size-4" />
          </span>
        ) : mine.length === 0 ? (
          <span className="px-2 py-1 text-2xs text-muted-foreground">
            {t('mineEmpty')}
          </span>
        ) : (
          mine.map((card) => {
            const cover =
              defaultLook(card).referenceSlots.find((slot) => slot.isPrimary)
                ?.url ?? null
            const several = card.looks.length > 1
            const isOpen = expanded === card.id
            return (
              <div key={card.id} className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={several ? isOpen : undefined}
                  onClick={() =>
                    several
                      ? setExpanded(isOpen ? null : card.id)
                      : pickLook(card, defaultLook(card))
                  }
                  className={cn(rowClass, isOpen && 'bg-muted')}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- R2 / 外链头像，小图不走 next/image
                    <img
                      src={cover}
                      alt=""
                      className="size-6 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-2xs">
                      {card.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{card.name}</span>
                    <span className="text-2xs text-muted-foreground">
                      {t('looks', { count: card.looks.length })}
                    </span>
                  </span>
                  {several ? (
                    <ChevronRight
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform duration-fast ease-standard',
                        isOpen && 'rotate-90',
                      )}
                      aria-hidden
                    />
                  ) : null}
                </button>
                {several && isOpen ? (
                  <div className="flex flex-col pl-8">
                    {card.looks.map((look) => (
                      <button
                        key={look.id}
                        type="button"
                        onClick={() => pickLook(card, look)}
                        className={cn(rowClass, 'justify-between')}
                      >
                        <span className="truncate">
                          {lookLabel(look, card.looks, tLooks)}
                        </span>
                        <span className="text-2xs text-muted-foreground">
                          {t('tagCount', { count: look.tags.length })}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
        {text.length >= 2 ? (
          <>
            <span className="px-2 pt-2 pb-0.5 text-2xs text-muted-foreground">
              {t('library')}
            </span>
            {library.loading && candidates.length === 0 ? (
              <span className="flex justify-center py-2">
                <Spinner className="size-4" />
              </span>
            ) : candidates.length === 0 ? (
              <span className="px-2 py-1 text-2xs text-muted-foreground">
                {t('libraryEmpty')}
              </span>
            ) : (
              candidates.slice(0, 6).map((candidate) => {
                const local =
                  locale === 'zh'
                    ? candidate.zh
                    : locale === 'ja'
                      ? candidate.ja
                      : null
                const readable = candidate.name.replace(/_/g, ' ')
                return (
                  <button
                    key={candidate.name}
                    type="button"
                    onClick={() =>
                      onAdd({
                        prompt: readable,
                        label: local || readable,
                      })
                    }
                    className={rowClass}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{readable}</span>
                      <span className="truncate text-2xs text-muted-foreground">
                        {[local, candidate.work?.replace(/_/g, ' ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {candidate.count}
                    </span>
                  </button>
                )
              })
            )}
          </>
        ) : null}
      </div>
      <div className="mt-1 flex gap-1 border-t border-border pt-1.5">
        {(
          [
            ['girl', 'girl'],
            ['boy', 'boy'],
            ['other', ''],
          ] as const
        ).map(([key, prompt]) => (
          <button
            key={key}
            type="button"
            onClick={() => onAdd({ prompt })}
            className={cn(rowClass, 'flex-1 justify-center')}
          >
            <Plus className="size-3" aria-hidden />
            {t(`blank.${key}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
