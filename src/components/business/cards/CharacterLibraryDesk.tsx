'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import {
  ASSISTANT_MENTION_KIND_IDS,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import type { CharacterCardRecord } from '@/types'
import { Copy, Pencil, Trash2, Upload } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LIBRARY_PILL_CLASS,
  LibraryGrid,
  LibraryNewTile,
  LibraryPillSelect,
  LibrarySearch,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  MEDIA_TILE_CLASS,
  MediaTileActions,
  MediaTileCaption,
  MediaTileMoreTrigger,
  MediaTileShade,
} from '@/components/ui/media-tile'
import { Spinner } from '@/components/ui/spinner'
import { useHandMentionToAssistant } from '@/hooks/use-hand-to-assistant'
import { clampLabel } from '@/lib/assistant-mention'
import { characterCoverUrl } from '@/lib/card-bus'
import { characterImageCount, characterWork } from '@/lib/character-works'

/**
 * **角色库 · 桌面**（ui-spec §9「库 `LibraryPage`」，样件 E S18）：库同一副骨架的右半边 ——
 * 顶上搜索 + 排序，下面作品切换条，再下面 3:4 格子（名字 + 「作品 · N 张」在图下），
 * 第一格虚线「+ 新角色」。左栏（全部 / 收藏 / 卡库）在 `CharacterRoster`。
 *
 * ⭐ 悬停出「交给助手 · 收藏 · 更多」：交给助手 = 一枚 `@角色` 胶囊挂进助手输入框；
 *   更多 = 编辑 / 复制 / 删除（同手机长按那一份）。
 * ⚠ 导入酒馆卡（拖进来或这颗药丸）样件没画，⛔ 丢掉这条路 —— 放在排序左边。
 * 手机照旧走 `CharacterOverview` + `CharacterPhoneBar`（等手机端整体重设计）。
 */

const SORT_KEYS = ['mostUsed', 'name', 'recent'] as const
type SortKey = (typeof SORT_KEYS)[number]

const ALL_WORKS = '\u0000all'
const ORIGINAL_KEY = '\u0000original'

interface Entry {
  card: CharacterCardRecord
  images: number
  workKey: string
  workLabel: string
}

interface CharacterLibraryDeskProps {
  cards: readonly CharacterCardRecord[]
  loading: boolean
  /** 左栏点的是「收藏」：只摆收藏了的。 */
  favoritesOnly: boolean
  query: string
  onQueryChange(query: string): void
  onOpen(id: string): void
  onNew(): void
  onImport(): void
  importing: boolean
  onToggleFavorite(id: string): void
  onDuplicate(card: CharacterCardRecord): void
  onDelete(id: string): void
}

export function CharacterLibraryDesk({
  cards,
  loading,
  favoritesOnly,
  query,
  onQueryChange,
  onOpen,
  onNew,
  onImport,
  importing,
  onToggleFavorite,
  onDuplicate,
  onDelete,
}: CharacterLibraryDeskProps) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const [sort, setSort] = useState<SortKey>('mostUsed')
  const [workKey, setWorkKey] = useState(ALL_WORKS)
  const hand = useHandMentionToAssistant()

  const entries = useMemo<Entry[]>(
    () =>
      cards
        .filter((card) => !favoritesOnly || card.isFavorite)
        .map((card) => {
          const work = characterWork(card, locale)
          return {
            card,
            images: characterImageCount(card),
            workKey: work.label ?? ORIGINAL_KEY,
            workLabel: work.label ?? t('workOriginal'),
          }
        }),
    [cards, favoritesOnly, locale, t],
  )

  /** 切换条上的作品：按这部作品的张数排，多的在前。 */
  const works = useMemo(() => {
    const byKey = new Map<string, { label: string; images: number }>()
    for (const entry of entries) {
      const work = byKey.get(entry.workKey) ?? {
        label: entry.workLabel,
        images: 0,
      }
      work.images += entry.images
      byKey.set(entry.workKey, work)
    }
    return [...byKey.entries()]
      .sort((a, b) => b[1].images - a[1].images)
      .map(([key, work]) => ({ value: key, label: work.label }))
  }, [entries])
  // 收藏里没有这部作品了（或刚删掉最后一位）就回「全部」。
  const activeWork = works.some((work) => work.value === workKey)
    ? workKey
    : ALL_WORKS

  const needle = query.trim().toLowerCase()
  const visible = entries
    .filter((entry) => activeWork === ALL_WORKS || entry.workKey === activeWork)
    .filter(
      (entry) =>
        !needle ||
        [
          entry.card.name,
          entry.card.handle ?? '',
          entry.workLabel,
          ...entry.card.looks.flatMap((look) => [
            look.label ?? '',
            ...look.tags,
          ]),
        ].some((text) => text.toLowerCase().includes(needle)),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.card.name.localeCompare(b.card.name, locale)
        : sort === 'recent'
          ? new Date(b.card.updatedAt).getTime() -
            new Date(a.card.updatedAt).getTime()
          : b.images - a.images,
    )

  const sortOptions = SORT_KEYS.map((key) => ({
    value: key,
    label:
      key === 'mostUsed'
        ? t('mostUsed')
        : key === 'name'
          ? t('library.sortName')
          : t('library.sortRecent'),
  }))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LibraryToolbar
        className="shrink-0"
        search={
          <LibrarySearch
            value={query}
            onChange={onQueryChange}
            placeholder={t('library.search')}
            label={t('library.search')}
          />
        }
        end={
          <>
            <button
              type="button"
              title={t('importCardHint')}
              disabled={importing}
              onClick={onImport}
              className={LIBRARY_PILL_CLASS}
            >
              {importing ? <Spinner size="sm" /> : <Upload aria-hidden />}
              {t('importCard')}
            </button>
            <LibraryPillSelect
              label={t('librarySort')}
              value={sort}
              options={sortOptions}
              onChange={setSort}
            />
          </>
        }
      />
      {works.length > 1 ? (
        <div className="mt-3 flex shrink-0">
          <LiquidSegmented
            ariaLabel={t('worksLabel')}
            value={activeWork}
            items={[{ value: ALL_WORKS, label: t('library.all') }, ...works]}
            onChange={setWorkKey}
          />
        </div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : (
          <LibraryGrid>
            {favoritesOnly || needle ? null : (
              <LibraryNewTile label={t('newCharacter')} onClick={onNew} />
            )}
            {visible.map((entry) => (
              <CharacterLibraryTile
                key={entry.card.id}
                entry={entry}
                onOpen={() => onOpen(entry.card.id)}
                onHandToAssistant={
                  hand
                    ? () => {
                        const thumb = characterCoverUrl(entry.card)
                        hand({
                          kind: ASSISTANT_MENTION_KIND_IDS.character,
                          id: entry.card.id,
                          label: clampLabel(entry.card.name),
                          scope: ASSISTANT_MENTION_SCOPE_IDS.character,
                          ...(thumb ? { thumb } : {}),
                        })
                      }
                    : undefined
                }
                onToggleFavorite={() => onToggleFavorite(entry.card.id)}
                onDuplicate={() => onDuplicate(entry.card)}
                onDelete={() => onDelete(entry.card.id)}
              />
            ))}
          </LibraryGrid>
        )}
      </div>
    </div>
  )
}

function CharacterLibraryTile({
  entry,
  onOpen,
  onHandToAssistant,
  onToggleFavorite,
  onDuplicate,
  onDelete,
}: {
  entry: Entry
  onOpen(): void
  onHandToAssistant?: () => void
  onToggleFavorite(): void
  onDuplicate(): void
  onDelete(): void
}) {
  const t = useTranslations('CharacterRoster')
  const { card } = entry
  const cover = characterCoverUrl(card)
  const meta =
    entry.images > 0
      ? t('tileMeta', { work: entry.workLabel, images: entry.images })
      : t('library.tileUnused', { work: entry.workLabel })
  return (
    <div className="min-w-0">
      <div className={`${MEDIA_TILE_CLASS} aspect-3/4`}>
        <button
          type="button"
          aria-label={card.name}
          data-testid="roster-tile"
          onClick={onOpen}
          className="absolute inset-0 z-10 rounded-12 focus-visible:outline-none focus-visible:shadow-focus"
        />
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="(min-width: 1024px) 160px, 45vw"
            draggable={false}
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center text-3xl font-semibold text-ink-2"
          >
            {Array.from(card.name)[0] ?? ''}
          </span>
        )}
        <MediaTileShade />
        <MediaTileActions
          handToAssistant={
            onHandToAssistant
              ? {
                  label: t('library.handToAssistant'),
                  onClick: onHandToAssistant,
                }
              : undefined
          }
          favorite={{
            saved: card.isFavorite,
            label: card.isFavorite
              ? t('library.unfavorite')
              : t('library.favorite'),
            onToggle: onToggleFavorite,
          }}
          more={
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <MediaTileMoreTrigger label={t('library.more')} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-36">
                <DropdownMenuItem onSelect={onOpen}>
                  <Pencil aria-hidden />
                  {t('phone.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate}>
                  <Copy aria-hidden />
                  {t('phone.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 aria-hidden />
                  {t('phone.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={onOpen}
        className="block w-full min-w-0 text-left"
      >
        <MediaTileCaption name={card.name} meta={meta} />
      </button>
    </div>
  )
}
