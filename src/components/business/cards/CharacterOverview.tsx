'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { LIQUID_SPRING } from '@/constants/motion'
import type { CharacterCardRecord } from '@/types'
import { Search } from '@/components/icons'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSearchExpansion } from '@/hooks/use-search-expansion'
import { useTouchLongPress } from '@/hooks/use-touch-long-press'
import {
  allLookSlots,
  characterCoverUrl,
  referenceUrlKey,
} from '@/lib/card-bus'
import { characterImageCount, characterWork } from '@/lib/character-works'
import { withWordMatches } from '@/lib/search-words'
import { cn } from '@/lib/utils'

/**
 * **角色页总览 · 方向 A「书架」**（owner 09-26 选 A，原型见画布第 7 页）。
 *
 * ⭐ 一页一个主角：「用得最多」按张数排大小格（第 1 名占 2×2），下面是按作品的
 *   扇形书架；点作品 chip / 书架 = 只看这部作品的全部角色。
 * ⭐ 张数 = 卡上的图 + 用她出过的图；作品从角色标签括号里取、可手改（`lib/character-works`）。
 * ⚠ 只有一位角色时**不排名次、不拼格子**：一张大图 + 一句提示（参考图是给上千位角色
 *   设计的，少量时硬排会很空）。
 * ⭐ 手机（iOS 稿 v16，owner 2026-10-16）：「用得最多」与作品书架各是一行左右滑，
 *   卡的名字写在图下面；长按一张出「编辑 / 复制 / 删除」（`onLongPress`）。
 */

/** 排名只排前几位；其余从作品进。 */
const RANKED_COUNT = 5

interface Entry {
  card: CharacterCardRecord
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
  cards: CharacterCardRecord[]
  reducedMotion: boolean
  onOpen(id: string): void
  /** 搜索词（搜索框住在地台上那一行，`CharacterOverviewHeader`；手机在顶上胶囊里）。 */
  query: string
  /** 触屏长按一张（手机）：调用方出「编辑 / 复制 / 删除」。 */
  onLongPress?(id: string): void
}

const ORIGINAL_KEY = '\u0000original'

export function CharacterOverview({
  cards,
  reducedMotion,
  onOpen,
  query,
  onLongPress,
}: CharacterOverviewProps) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const isMobile = useIsMobile()
  const [workKey, setWorkKey] = useState<string | null>(null)
  const longPress = useTouchLongPress<string>((id) => onLongPress?.(id))

  const entries = useMemo<Entry[]>(
    () =>
      cards.map((card) => {
        const work = characterWork(card, locale)
        return {
          card,
          images: characterImageCount(card),
          workKey: work.label ?? ORIGINAL_KEY,
          workLabel: work.label ?? t('workOriginal'),
        }
      }),
    [cards, locale, t],
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
  // 字面没对上的，把搜索词翻成标签（猫耳 → cat ears）再对造型标签、外观和简介，接在后面。
  const expansion = useSearchExpansion(query)
  const matches = needle
    ? withWordMatches(
        entries,
        entries
          .filter((entry) =>
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
          .sort(byImages),
        expansion,
        (entry) => [
          entry.card.summary,
          ...entry.card.tags,
          ...entry.card.looks.flatMap((look) => [
            ...look.tags,
            look.description,
          ]),
        ],
      )
    : null
  const activeGroup = groups.find((group) => group.key === workKey) ?? null
  const ranked = [...entries].sort(byImages).slice(0, RANKED_COUNT)

  const pressProps = (id: string) =>
    onLongPress
      ? {
          ...longPress.bind(id),
          // 安卓长按后会补一个 contextmenu：吞掉，别弹系统菜单（桌面右键照旧）。
          onContextMenu: (event: React.MouseEvent) => {
            if (longPress.swallow()) event.preventDefault()
          },
        }
      : {}
  const tile = (entry: Entry, rank: number | null) => (
    <CharacterTile
      key={entry.card.id}
      entry={entry}
      rank={rank}
      reducedMotion={reducedMotion}
      captionBelow={isMobile}
      pressProps={pressProps(entry.card.id)}
      onOpen={(id) => {
        if (longPress.swallow()) return
        onOpen(id)
      }}
    />
  )

  return (
    <div className="flex flex-col">
      {groups.length > 1 || workKey ? (
        <div
          role="group"
          aria-label={t('worksLabel')}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 max-md:-mx-4 max-md:gap-1.5 max-md:px-4 max-md:scrollbar-none"
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
              cover={characterCoverUrl(group.entries[0]!.card)}
              active={workKey === group.key}
              onClick={() => setWorkKey(group.key)}
            />
          ))}
        </div>
      ) : null}

      {matches ? (
        <Section title={t('searchResults', { count: matches.length })}>
          <CellGrid>{matches.map((entry) => tile(entry, null))}</CellGrid>
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
            {activeGroup.entries.map((entry) => tile(entry, null))}
          </CellGrid>
        </Section>
      ) : entries.length === 1 ? (
        <Section title={t('mostUsed')} hint={t('mostUsedHint')}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="w-1/2 max-w-52">{tile(entries[0]!, null)}</div>
            <p className="max-w-xs pb-1 text-2sm text-muted-foreground">
              {t('loneHint')}
            </p>
          </div>
        </Section>
      ) : (
        <>
          <Section
            title={t('mostUsed')}
            hint={isMobile ? undefined : t('mostUsedHint')}
          >
            {isMobile ? (
              // 手机：一行左右滑、5 张一样大（v10 手机摆法 ①）。
              <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
                {ranked.map((entry, index) => (
                  <div key={entry.card.id} className="w-34 shrink-0 snap-start">
                    {tile(entry, index + 1)}
                  </div>
                ))}
              </div>
            ) : (
              // owner 09-28：几张一样大，与作品页 / 搜索同一个网格（卡的大小不随人数变）。
              <CellGrid>
                {ranked.map((entry, index) => tile(entry, index + 1))}
              </CellGrid>
            )}
          </Section>
          <Section
            title={t('works')}
            hint={
              isMobile
                ? t('phone.worksCount', { count: groups.length })
                : t('byImages')
            }
          >
            <div
              className={
                isMobile
                  ? '-mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 scrollbar-none'
                  : 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'
              }
            >
              {groups.map((group) => (
                <WorkShelf
                  key={group.key}
                  group={group}
                  compact={isMobile}
                  onOpen={() => setWorkKey(group.key)}
                  summary={t('workSummary', {
                    characters: group.entries.length,
                    images: group.images,
                  })}
                />
              ))}
            </div>
          </Section>
          {/* 人一多，「用得最多」只露前几位：这里按名字列全员，翻找用（owner 09-28）。
              ⚠ 不超过「用得最多」那几位时不出，免得同一批卡摆两遍。 */}
          {entries.length > RANKED_COUNT ? (
            <Section
              title={t('allCharacters')}
              hint={
                isMobile
                  ? t('phone.charactersCount', { count: entries.length })
                  : t('allCharactersHint', { count: entries.length })
              }
            >
              <CellGrid>
                {[...entries]
                  .sort((a, b) =>
                    a.card.name.localeCompare(b.card.name, locale),
                  )
                  .map((entry) => tile(entry, null))}
              </CellGrid>
            </Section>
          ) : null}
        </>
      )}
      {isMobile && onLongPress ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('phone.longPressHint')}
        </p>
      ) : null}
    </div>
  )
}

function byImages(a: Entry, b: Entry): number {
  return b.images - a.images
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
    <section className="mt-7 flex flex-col gap-3 max-md:mt-4 max-md:gap-2.5">
      <div className="flex items-baseline gap-2.5 max-md:gap-2">
        <h2 className="text-base font-semibold max-md:text-lg">{title}</h2>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/**
 * 角色格子的网格。⭐ 列数随屏宽走、⛔ 不随人数走：人少时卡不会被撑大，人多时往下
 * 一行一行排（owner 09-28「太大了」—— 宽屏一行 8 张，一张约 210 宽）。
 */
function CellGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 max-md:gap-x-2.5 max-md:gap-y-3.5 sm:grid-cols-3 md:grid-cols-4 desk:grid-cols-6 2xl:grid-cols-8">
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
        // 手机（iOS 稿）：白底细线，选中近黑实底。
        'max-md:h-8 max-md:gap-1.5 max-md:border max-md:pr-3',
        cover ? 'pl-1' : 'pl-3.5 max-md:pl-3',
        active
          ? 'bg-primary text-primary-foreground max-md:border-foreground max-md:bg-foreground max-md:text-background'
          : 'bg-muted text-foreground hover:bg-accent max-md:border-border max-md:bg-background',
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
            active
              ? 'text-primary-foreground/70 max-md:text-background/60'
              : 'text-muted-foreground',
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
  reducedMotion,
  captionBelow,
  pressProps,
  onOpen,
}: {
  entry: Entry
  rank: number | null
  reducedMotion: boolean
  /** 手机：名字与小字写在图下面（iOS 稿），排名数字在名字左边。 */
  captionBelow: boolean
  pressProps: Pick<
    React.HTMLAttributes<HTMLButtonElement>,
    | 'onPointerDown'
    | 'onPointerMove'
    | 'onPointerUp'
    | 'onPointerCancel'
    | 'onContextMenu'
  >
  onOpen(id: string): void
}) {
  const t = useTranslations('CharacterRoster')
  const { card } = entry
  const cover = characterCoverUrl(card)
  const name = card.name
  const meta = t('tileMeta', { work: entry.workLabel, images: entry.images })
  if (captionBelow) {
    return (
      <motion.button
        type="button"
        layout={!reducedMotion}
        transition={LIQUID_SPRING.unfold}
        onClick={() => onOpen(card.id)}
        {...pressProps}
        data-testid="roster-tile"
        className="group block w-full select-none text-left transition-transform duration-fast ease-standard active:scale-96 motion-reduce:transition-none"
      >
        <span className="relative block aspect-3/4 overflow-hidden rounded-2xl bg-muted">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="45vw"
              draggable={false}
              className="object-cover"
            />
          ) : null}
        </span>
        <span className="mt-2 flex items-start gap-2">
          {rank !== null ? (
            <span
              aria-hidden
              className="font-mono text-3xl font-light leading-none tabular-nums"
            >
              {rank}
            </span>
          ) : null}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {meta}
            </span>
          </span>
        </span>
      </motion.button>
    )
  }
  return (
    <motion.button
      type="button"
      layout={!reducedMotion}
      transition={LIQUID_SPRING.unfold}
      onClick={() => onOpen(card.id)}
      {...pressProps}
      data-testid="roster-tile"
      className="group relative block aspect-4/5 w-full text-left"
    >
      <span className="absolute inset-0 overflow-hidden rounded-2xl bg-muted">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="(min-width: 1024px) 240px, 45vw"
            className="object-cover transition-transform duration-reveal ease-standard group-hover:scale-103"
          />
        ) : null}
        <span className="absolute inset-x-0 bottom-0 flex flex-col bg-linear-to-t from-foreground/60 to-transparent px-4 pb-3 pt-10 text-background">
          <span className="truncate text-base font-semibold">{name}</span>
          <span className="truncate text-xs opacity-85">{meta}</span>
        </span>
        {rank !== null ? (
          <span
            aria-hidden
            className="absolute left-3.5 top-1.5 font-mono text-4xl font-light leading-none text-background/90 tabular-nums"
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
  compact,
  onOpen,
}: {
  group: WorkGroup
  summary: string
  /** 手机：小一号、排在横滑的一行里，按下时扇面再散开一点（iOS 稿）。 */
  compact: boolean
  onOpen(): void
}) {
  // 放最上面的是第一名；左右两张是第二、第三名。⛔ 不放两张一样的图（owner 09-28）：
  // 人不够三位就拿这几位卡上的别的图补，还不够就少放几张。
  const covers: string[] = []
  const seen = new Set<string>()
  const push = (url: string | null | undefined) => {
    if (!url || covers.length >= 3) return
    const key = referenceUrlKey(url)
    if (seen.has(key)) return
    seen.add(key)
    covers.push(url)
  }
  const top = group.entries.slice(0, 3)
  for (const entry of top) push(characterCoverUrl(entry.card))
  for (const entry of top) {
    for (const slot of allLookSlots(entry.card)) push(slot.url)
  }
  const [front, left, right] = covers
  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-32 shrink-0 flex-col items-center text-center"
      >
        <span className="relative block h-30 w-full">
          {[
            {
              url: left,
              className:
                '-translate-x-14.5 -rotate-12 group-active:-translate-x-16 group-active:-rotate-16',
            },
            {
              url: right,
              className:
                'translate-x-3.5 rotate-10 group-active:translate-x-5 group-active:rotate-14',
            },
            { url: front, className: '-translate-x-9' },
          ].map((layer, index) =>
            layer.url ? (
              <span
                key={index}
                className={cn(
                  'absolute left-1/2 top-1 h-25 w-18 overflow-hidden rounded-xl border-2 border-background bg-muted shadow-sm transition-transform duration-slow ease-standard motion-reduce:transition-none',
                  layer.className,
                )}
              >
                <Image
                  src={layer.url}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                />
              </span>
            ) : null,
          )}
        </span>
        <span className="text-sm font-semibold">{group.label}</span>
        <span className="text-xs text-muted-foreground">{summary}</span>
      </button>
    )
  }
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

/** 这页有几部作品（地台那一行的计数用，判据与总览分组同一套）。 */
export function countCharacterWorks(
  cards: readonly CharacterCardRecord[],
  locale: string,
): number {
  return new Set(
    cards.map((card) => characterWork(card, locale).label ?? ORIGINAL_KEY),
  ).size
}

/**
 * 总览那一行（住在地台上、白卡外面，布局 A）：页签（我的角色 / 卡库）+ 计数 · 搜索 ·
 * 新角色。桌面专用，手机是 `CharacterPhoneBar`。
 * ⚠ 右边留出助手头像那一格（头像是 Dock 的 fixed 元素，恒在这一行最右）。
 */
export function CharacterOverviewHeader({
  tabs,
  characters,
  works,
  query,
  onQueryChange,
  actions,
}: {
  tabs: React.ReactNode
  characters: number
  works: number
  query: string
  onQueryChange(query: string): void
  actions: React.ReactNode
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <>
      {tabs}
      <span className="text-2sm text-muted-foreground">
        {t('overviewCount', { characters, works })}
      </span>
      <label className="ml-auto flex h-9 w-72 min-w-0 items-center gap-2 rounded-full bg-background px-3.5 text-2sm text-muted-foreground">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          id="character-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </>
  )
}
