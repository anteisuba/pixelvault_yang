'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { LIQUID_SPRING } from '@/constants/motion'
import type { CharacterCardRecord } from '@/types'
import { Search } from '@/components/icons'
import { characterImageCount, characterWork } from '@/lib/character-works'
import { cn } from '@/lib/utils'

/**
 * **角色页总览 · 方向 A「书架」**（owner 09-26 选 A，原型见画布第 7 页）。
 *
 * ⭐ 一页一个主角：「用得最多」按张数排大小格（第 1 名占 2×2），下面是按作品的
 *   扇形书架；点作品 chip / 书架 = 只看这部作品的全部角色。
 * ⭐ 张数 = 卡上的图 + 用她出过的图；作品从角色标签括号里取、可手改（`lib/character-works`）。
 * ⚠ 只有一位角色时**不排名次、不拼格子**：一张大图 + 一句提示（参考图是给上千位角色
 *   设计的，少量时硬排会很空）。
 */

/** 排名只排前几位；其余从作品进。 */
const RANKED_COUNT = 5

export interface OverviewItem {
  card: CharacterCardRecord
  /** 变体跟在父卡后面，副标题写「父卡 · 变体名」。 */
  parentName: string | null
}

interface Entry extends OverviewItem {
  images: number
  workKey: string
  workLabel: string
}

interface WorkGroup {
  key: string
  label: string
  entries: Entry[]
  images: number
}

interface CharacterOverviewProps {
  items: OverviewItem[]
  reducedMotion: boolean
  onOpen(id: string): void
  /** 液态展开从哪张图长出来：把每个角色的图框登记给外面。 */
  registerTile(id: string, node: HTMLElement | null): void
  /** 标题行右侧的动作（新角色）。 */
  actions: React.ReactNode
}

const ORIGINAL_KEY = '\u0000original'

export function CharacterOverview({
  items,
  reducedMotion,
  onOpen,
  registerTile,
  actions,
}: CharacterOverviewProps) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const [workKey, setWorkKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const entries = useMemo<Entry[]>(
    () =>
      items.map((item) => {
        const work = characterWork(item.card, locale)
        return {
          ...item,
          images: characterImageCount(item.card),
          workKey: work.label ?? ORIGINAL_KEY,
          workLabel: work.label ?? t('workOriginal'),
        }
      }),
    [items, locale, t],
  )

  const groups = useMemo<WorkGroup[]>(() => {
    const byKey = new Map<string, WorkGroup>()
    for (const entry of entries) {
      const group = byKey.get(entry.workKey) ?? {
        key: entry.workKey,
        label: entry.workLabel,
        entries: [],
        images: 0,
      }
      group.entries.push(entry)
      group.images += entry.images
      byKey.set(entry.workKey, group)
    }
    const list = [...byKey.values()]
    list.forEach((group) => group.entries.sort(byImages))
    return list.sort((a, b) => b.images - a.images)
  }, [entries])

  const needle = query.trim().toLowerCase()
  const matches = needle
    ? entries
        .filter((entry) =>
          [
            entry.card.name,
            entry.card.handle ?? '',
            entry.workLabel,
            ...entry.card.cardTags.character,
          ].some((text) => text.toLowerCase().includes(needle)),
        )
        .sort(byImages)
    : null
  const activeGroup = groups.find((group) => group.key === workKey) ?? null
  const ranked = [...entries].sort(byImages).slice(0, RANKED_COUNT)

  const tile = (entry: Entry, rank: number | null, hero: boolean) => (
    <CharacterTile
      key={entry.card.id}
      entry={entry}
      rank={rank}
      hero={hero}
      reducedMotion={reducedMotion}
      onOpen={onOpen}
      registerTile={registerTile}
    />
  )

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-0.5 text-2sm text-muted-foreground">
            {t('overviewCount', {
              characters: entries.length,
              works: groups.length,
            })}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3.5 py-2 text-2sm text-muted-foreground sm:w-72 sm:flex-none">
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              id="character-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {actions}
        </div>
      </header>

      {groups.length > 1 || workKey ? (
        <div
          role="group"
          aria-label={t('worksLabel')}
          className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          <WorkChip
            label={t('overviewAll')}
            active={workKey === null}
            onClick={() => setWorkKey(null)}
          />
          {groups.map((group) => (
            <WorkChip
              key={group.key}
              label={group.label}
              count={group.images}
              cover={coverOf(group.entries[0]!.card)}
              active={workKey === group.key}
              onClick={() => setWorkKey(group.key)}
            />
          ))}
        </div>
      ) : null}

      {matches ? (
        <Section title={t('searchResults', { count: matches.length })}>
          <CellGrid>
            {matches.map((entry) => tile(entry, null, false))}
          </CellGrid>
        </Section>
      ) : activeGroup ? (
        <Section
          title={activeGroup.label}
          hint={t('workSummary', {
            characters: activeGroup.entries.length,
            images: activeGroup.images,
          })}
        >
          <CellGrid>
            {activeGroup.entries.map((entry) => tile(entry, null, false))}
          </CellGrid>
        </Section>
      ) : entries.length === 1 ? (
        <Section title={t('mostUsed')} hint={t('mostUsedHint')}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="w-full max-w-sm">
              {tile(entries[0]!, null, false)}
            </div>
            <p className="max-w-xs pb-1 text-2sm text-muted-foreground">
              {t('loneHint')}
            </p>
          </div>
        </Section>
      ) : (
        <>
          <Section title={t('mostUsed')} hint={t('mostUsedHint')}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ranked.map((entry, index) => (
                <div
                  key={entry.card.id}
                  className={cn(
                    'min-w-0',
                    index === 0 && 'col-span-2 md:row-span-2',
                  )}
                >
                  {tile(entry, index + 1, index === 0)}
                </div>
              ))}
            </div>
          </Section>
          <Section title={t('works')} hint={t('byImages')}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {groups.map((group) => (
                <WorkShelf
                  key={group.key}
                  group={group}
                  onOpen={() => setWorkKey(group.key)}
                  summary={t('workSummary', {
                    characters: group.entries.length,
                    images: group.images,
                  })}
                />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function byImages(a: Entry, b: Entry): number {
  return b.images - a.images
}

function coverOf(card: CharacterCardRecord): string | null {
  return card.referenceSlots[0]?.url ?? card.sourceImageUrl ?? null
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-7 flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function CellGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {children}
    </div>
  )
}

function WorkChip({
  label,
  count,
  cover,
  active,
  onClick,
}: {
  label: string
  count?: number
  cover?: string | null
  active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full py-1 pr-3.5 text-2sm transition-colors duration-fast',
        cover ? 'pl-1' : 'pl-3.5',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground hover:bg-accent',
      )}
    >
      {cover ? (
        <span className="relative size-6 overflow-hidden rounded-full bg-background">
          <Image
            src={cover}
            alt=""
            fill
            sizes="24px"
            className="object-cover"
          />
        </span>
      ) : null}
      {label}
      {count !== undefined ? (
        <span
          className={cn(
            'font-mono text-xs tabular-nums',
            active ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

function CharacterTile({
  entry,
  rank,
  hero,
  reducedMotion,
  onOpen,
  registerTile,
}: {
  entry: Entry
  rank: number | null
  hero: boolean
  reducedMotion: boolean
  onOpen(id: string): void
  registerTile(id: string, node: HTMLElement | null): void
}) {
  const t = useTranslations('CharacterRoster')
  const { card, parentName } = entry
  const cover = coverOf(card)
  const name = parentName
    ? t('variantOf', { parent: parentName, label: card.variantLabel ?? '' })
    : card.name
  return (
    <motion.button
      type="button"
      layout={!reducedMotion}
      transition={LIQUID_SPRING.unfold}
      onClick={() => onOpen(card.id)}
      data-testid="roster-tile"
      className={cn(
        'group relative block w-full text-left',
        hero ? 'aspect-4/3 md:aspect-auto md:h-full' : 'aspect-4/5',
      )}
    >
      <span
        ref={(node) => registerTile(card.id, node)}
        className="absolute inset-0 overflow-hidden rounded-2xl bg-muted"
      >
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes={
              hero
                ? '(min-width: 768px) 50vw, 100vw'
                : '(min-width: 1024px) 240px, 45vw'
            }
            className="object-cover transition-transform duration-reveal ease-standard group-hover:scale-103"
          />
        ) : null}
        <span className="absolute inset-x-0 bottom-0 flex flex-col bg-linear-to-t from-foreground/60 to-transparent px-4 pb-3 pt-10 text-background">
          <span
            className={cn(
              'truncate font-semibold',
              hero ? 'text-2xl' : 'text-base',
            )}
          >
            {name}
          </span>
          <span className="truncate text-xs opacity-85">
            {t('tileMeta', { work: entry.workLabel, images: entry.images })}
          </span>
        </span>
        {rank !== null ? (
          <span
            aria-hidden
            className={cn(
              'absolute left-3.5 top-1.5 font-mono font-light leading-none text-background/90 tabular-nums',
              hero ? 'text-7xl' : 'text-4xl',
            )}
          >
            {rank}
          </span>
        ) : null}
      </span>
    </motion.button>
  )
}

/** 作品书架：这部作品张数最多的三位扇形叠着，悬停散开一点。 */
function WorkShelf({
  group,
  summary,
  onOpen,
}: {
  group: WorkGroup
  summary: string
  onOpen(): void
}) {
  const covers = group.entries
    .slice(0, 3)
    .map((entry) => coverOf(entry.card))
    .filter((url): url is string => Boolean(url))
  // 放最上面的是第一名；左右两张是第二、第三名（不够就重复第一名）。
  const [front, left = front, right = front] = covers
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-center gap-1 text-center"
    >
      <span className="relative block h-48 w-full">
        {[
          {
            url: left,
            className:
              '-translate-x-26 -rotate-6 scale-90 group-hover:-translate-x-30 group-hover:-rotate-12',
          },
          {
            url: right,
            className:
              '-translate-x-4 rotate-6 scale-90 group-hover:translate-x-0 group-hover:rotate-12',
          },
          { url: front, className: '-translate-x-15' },
        ].map((layer, index) =>
          layer.url ? (
            <span
              key={index}
              className={cn(
                'absolute left-1/2 top-2 h-40 w-30 overflow-hidden rounded-xl border-3 border-background bg-muted shadow-md transition-transform duration-slow ease-standard',
                layer.className,
              )}
            >
              <Image
                src={layer.url}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
              />
            </span>
          ) : null,
        )}
      </span>
      <span className="font-semibold">{group.label}</span>
      <span className="text-xs text-muted-foreground">{summary}</span>
    </button>
  )
}
