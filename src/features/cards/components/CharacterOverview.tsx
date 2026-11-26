'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { LIQUID_SPRING } from '@/constants/motion'
import type { CharacterCardRecord } from '@/types'
import { ASSISTANT_LIBRARY_SCREEN_LIMIT } from '@/types/assistant-operator'
import type { CharacterRecentActivity } from '@/types/character-growth'
import { LibraryNewTile, LibraryNoResults } from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { CharacterRecentCards } from '@/features/cards/components/CharacterRecentCards'
import { useReportLibraryScreen } from '@/hooks/use-library-view'
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
import { screenItemProps } from '@/lib/assistant-screen-scan'

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
export type CharacterWorkGroup = WorkGroup

interface CharacterOverviewProps {
  cards: CharacterCardRecord[]
  reducedMotion: boolean
  onOpen(id: string): void
  /** 搜索词（桌面搜索框在库工具行里，`CharacterRoster`；手机在顶上胶囊里）。 */
  query: string
  /** 搜不到时「清除搜索」。 */
  onClearSearch(): void
  /**
   * 只看哪部作品（`null` = 全部）：桌面切换条在库工具行里（`CharacterWorksSegmented`），
   * 手机是这里的作品 chip，同一份状态由宿主拿着。
   */
  workKey: string | null
  onWorkKeyChange(key: string | null): void
  /** 桌面「全部角色」第一格虚线「+ 新角色」（同提示词 / 声音的第一格）；手机不传（＋ 在胶囊里）。 */
  onNew?(): void
  /** 触屏长按一张（手机）：调用方出「编辑 / 复制 / 删除」。 */
  onLongPress?(id: string): void
  /** 桌面「最近」那几张卡（每位最近一件事）；手机不传。 */
  recent?: readonly CharacterRecentActivity[]
}

const ORIGINAL_KEY = '\u0000original'
/** 作品切换条上「全部」那一格的值（⛔ 与作品名撞上）。 */
const ALL_KEY = '\u0000all'

/** 每位角色的张数与作品，按作品分组（张数多的作品在前）。总览与库工具行的作品切换条同一份算法。 */
export function useCharacterWorks(cards: CharacterCardRecord[]) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
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
  return { entries, groups }
}

/**
 * 作品切换条（全部 · 各作品，带张数）：桌面放在库工具行的切换条位（`LibraryToolbar.segments`）。
 * `groups` 来自 `useCharacterWorks`；画不画由宿主判（不止一部作品，或正停在某一部上）。
 */
export function CharacterWorksSegmented({
  groups,
  workKey,
  onChange,
}: {
  groups: readonly CharacterWorkGroup[]
  workKey: string | null
  onChange(key: string | null): void
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <LiquidSegmented
      items={[
        { value: ALL_KEY, label: t('overviewAll') },
        ...groups.map((group) => ({
          value: group.key,
          label: group.label,
          count: group.images,
        })),
      ]}
      value={workKey ?? ALL_KEY}
      onChange={(key) => onChange(key === ALL_KEY ? null : key)}
      ariaLabel={t('worksLabel')}
    />
  )
}

export function CharacterOverview({
  cards,
  reducedMotion,
  onOpen,
  query,
  onClearSearch,
  workKey,
  onWorkKeyChange: setWorkKey,
  onNew,
  onLongPress,
  recent,
}: CharacterOverviewProps) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const isMobile = useIsMobile()
  const longPress = useTouchLongPress<string>((id) => onLongPress?.(id))
  const { entries, groups } = useCharacterWorks(cards)

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
  // 屏上那一页（owner 10-28）：哪部作品、搜了什么、屏上前几位。
  const onScreen =
    matches ?? activeGroup?.entries ?? [...entries].sort(byImages)
  useReportLibraryScreen({
    kind: 'character',
    scope: activeGroup
      ? `characters from 「${activeGroup.label}」`
      : 'all their characters',
    ...(needle ? { search: query.trim() } : {}),
    total: onScreen.length,
    visible: onScreen
      .slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT)
      .map((entry) => entry.card.name),
  })

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
      captionBelow
      pressProps={pressProps(entry.card.id)}
      onOpen={(id) => {
        if (longPress.swallow()) return
        onOpen(id)
      }}
    />
  )

  return (
    <div className="flex flex-col">
      {/* 桌面（角色大项目 ①，样件 O4）：最近 → 作品扇形 → 全部角色（作品切换条在库工具行里）；切到一部作品只留它的格子。 */}
      {!isMobile && !matches && !activeGroup && recent ? (
        <CharacterRecentCards rows={recent} cards={cards} onOpen={onOpen} />
      ) : null}
      {(groups.length > 1 || workKey) && isMobile ? (
        <div
          role="group"
          aria-label={t('worksLabel')}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 coarse:-my-1.5 coarse:py-1.5 max-md:-mx-4 max-md:mt-3 max-md:gap-1.5 max-md:px-4 max-md:scrollbar-none"
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

      {matches && matches.length === 0 ? (
        <LibraryNoResults
          query={query}
          onClearSearch={onClearSearch}
          className="mt-7"
        />
      ) : matches ? (
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
      ) : !isMobile ? (
        <>
          {groups.length > 1 ? (
            <Section title={t('works')}>
              <div className="@container">
                <div className={WORK_SHELF_GRID_CLASS}>
                  {groups.map((group) => (
                    <WorkShelf
                      key={group.key}
                      group={group}
                      compact={false}
                      onOpen={() => setWorkKey(group.key)}
                      summary={t('workSummary', {
                        characters: group.entries.length,
                        images: group.images,
                      })}
                    />
                  ))}
                </div>
              </div>
            </Section>
          ) : null}
          <Section title={t('allCharacters')}>
            <CellGrid>
              {onNew ? (
                <LibraryNewTile label={t('newCharacter')} onClick={onNew} />
              ) : null}
              {[...entries].sort(byImages).map((entry) => tile(entry, null))}
            </CellGrid>
          </Section>
        </>
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
            <div className={isMobile ? undefined : '@container'}>
              <div
                className={
                  isMobile
                    ? '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 scrollbar-none'
                    : WORK_SHELF_GRID_CLASS
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
        <p className="mt-6 text-center text-2xs text-muted-foreground">
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
    <section className="mt-7 flex flex-col gap-3 max-md:mt-5 max-md:gap-2.5">
      <div className="flex items-baseline gap-2.5 max-md:gap-2">
        <h2 className="text-md font-semibold tracking-tight max-md:text-md">
          {title}
        </h2>
        {hint ? (
          <span className="text-2xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** 骨架里摆几格（宽屏一行 8 张，摆两行）。 */
const SKELETON_TILES = 16

/**
 * 总览的骨架（11-19 库走查：角色总览加载时只有一个转圈）：与真格子同一个网格、同一个
 * 3:4 + 下面两行小字，到了只是由灰变图，⛔ 跳版。用项目的 `Skeleton`（ui-defaults 加载态）。
 */
export function CharacterOverviewSkeleton() {
  return (
    <div aria-busy className="flex flex-col" data-testid="roster-skeleton">
      <section className="mt-7 flex flex-col gap-3 max-md:mt-4 max-md:gap-2.5">
        <Skeleton className="h-5 w-24" />
        <CellGrid>
          {Array.from({ length: SKELETON_TILES }, (_, index) => (
            <span key={index} className="flex flex-col gap-2">
              <Skeleton className="aspect-3/4 w-full rounded-2xl" />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </span>
          ))}
        </CellGrid>
      </section>
    </div>
  )
}

/**
 * 角色格子的网格。⭐ 列数随这一栏的宽走、⛔ 不随人数走：人少时卡不会被撑大，人多时往下
 * 一行一行排（owner 09-28「太大了」—— 宽屏一行 8 张，一张约 210 宽）。
 * ⭐ 每一档 = 原来的视口档 **且** 这一栏够宽（`sm:@md:` 这种叠法）：助手收着时与原来
 * 逐档一样；库里叫出助手、这一栏变窄就少几列，卡不再被硬挤（11-18 审查）。容器档取
 * 原视口档减去外壳左栏与内边距（约 118）后最近的容器尺寸。
 */
function CellGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 max-md:gap-x-2.5 max-md:gap-y-3.5 sm:@md:grid-cols-3 md:@xl:grid-cols-4 desk:@4xl:grid-cols-6 2xl:@7xl:grid-cols-8">
        {children}
      </div>
    </div>
  )
}

/** 作品书架的网格：同样是「视口档 且 这一栏够宽」（见 `CellGrid`）。 */
const WORK_SHELF_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-6 sm:@md:grid-cols-3 lg:@xl:grid-cols-4 2xl:@7xl:grid-cols-5'

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
        // 手机 S1（Apple HIG 无边框浅灰胶囊，与素材/画廊控件语法一致）：
        'touch-target-y max-md:h-8 max-md:gap-1.5 max-md:pr-3',
        cover ? 'pl-1' : 'pl-3.5 max-md:pl-3',
        active
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'bg-muted text-ink-2 hover:bg-accent',
      )}
    >
      {cover ? (
        <span className="relative size-6 overflow-hidden rounded-full bg-background">
          <Image
            src={cover}
            alt=""
            fill
            sizes="24px"
            className="object-cover object-top"
          />
        </span>
      ) : null}
      {label}
      {count !== undefined ? (
        <span
          className={cn(
            'font-mono text-2xs tabular-nums',
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
        {...screenItemProps('character', name, cover)}
        data-testid="roster-tile"
        className="group block w-full select-none text-left transition-transform duration-fast ease-standard active:scale-96 motion-reduce:transition-none"
      >
        <span className="relative block aspect-3/4 overflow-hidden rounded-2xl bg-muted ring-1 ring-inset ring-foreground/8">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="45vw"
              draggable={false}
              className="object-cover object-top transition-transform duration-reveal ease-standard group-hover:scale-103"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-full flex-col items-center justify-center bg-linear-to-b from-surface-companion to-fill-strong/70 select-none"
            >
              <span className="grid size-14 place-items-center rounded-full bg-background/85 text-xl font-semibold text-ink-2 shadow-ring">
                {name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            </span>
          )}
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
            <span className="truncate text-2sm font-semibold">{name}</span>
            <span className="truncate text-2xs text-muted-foreground">
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
      {...screenItemProps('character', name, cover)}
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
            className="object-cover object-top transition-transform duration-reveal ease-standard group-hover:scale-103"
          />
        ) : null}
        <span className="absolute inset-x-0 bottom-0 flex flex-col bg-linear-to-t from-foreground/60 to-transparent px-4 pb-3 pt-10 text-background">
          <span className="truncate text-md font-semibold">{name}</span>
          <span className="truncate text-2xs opacity-85">{meta}</span>
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
        className="group flex w-34 shrink-0 snap-start flex-col items-center text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative block h-29 w-full">
          {[
            {
              url: left,
              className:
                '-translate-x-14.5 -rotate-10 scale-95 group-active:-translate-x-16 group-active:-rotate-14',
            },
            {
              url: right,
              className:
                '-translate-x-3.5 rotate-10 scale-95 group-active:-translate-x-2 group-active:rotate-14',
            },
            { url: front, className: '-translate-x-9 shadow-md' },
          ].map((layer, index) =>
            layer.url ? (
              <span
                key={index}
                className={cn(
                  'absolute left-1/2 top-1.5 h-24 w-18 overflow-hidden rounded-xl border-2 border-background bg-muted shadow-sm transition-transform duration-slow ease-standard motion-reduce:transition-none',
                  layer.className,
                )}
              >
                <Image
                  src={layer.url}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover object-top"
                />
              </span>
            ) : null,
          )}
        </span>
        <span className="mt-0.5 max-w-full truncate text-2sm font-semibold">
          {group.label}
        </span>
        <span className="max-w-full truncate text-2xs text-muted-foreground">
          {summary}
        </span>
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
                className="object-cover object-top"
              />
            </span>
          ) : null,
        )}
      </span>
      <span className="text-2sm font-semibold">{group.label}</span>
      <span className="text-2xs text-muted-foreground">{summary}</span>
    </button>
  )
}
