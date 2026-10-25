'use client'

import { useCallback, useState, type Ref } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { ChevronLeft, RefreshCw, Search } from '@/components/icons'
import { DURATION_MS, EASE_STANDARD } from '@/constants/motion'
import type { TagLookupTarget } from '@/contexts/studio-library-pick'
import { useDanbooruCatalog } from '@/hooks/use-danbooru-catalog'
import { useDanbooruFavorites } from '@/hooks/use-danbooru-favorites'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTagLookupAdder } from '@/hooks/use-tag-lookup-adder'
import {
  compactPostCount,
  danbooruTagSearchUrl,
  displayDanbooruTag,
  stylePromptTag,
} from '@/lib/tag-lookup'
import { cn } from '@/lib/utils'
import {
  DanbooruCatalogKindSchema,
  type DanbooruCatalogKind,
} from '@/types/danbooru-catalog'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { LookupRows, LookupSay, LookupSkeletonRows } from './lookup/LookupList'
import {
  LookupBlank,
  LookupDetailSkeleton,
  LookupFavoriteButton,
} from './lookup/LookupDetail'
import { LookupDetailPane } from './lookup/LookupDetailPane'
import { FadeSwap } from './lookup/LookupPanes'
import {
  KIND_TEXT,
  kindLabelKey,
  shownData,
  styleSections,
  type ByKind,
  type LookupItem,
  useLookupRowSub,
} from './lookup/lookup-kinds'

const PHONE_ICON_BUTTON_CLASS =
  'grid size-11 shrink-0 place-items-center rounded-xl text-foreground/75 transition-colors duration-fast ease-linear active:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 五个页签：四类查询 + 收藏（owner 2026-09-28：收藏单独一页，按类别分段）。 */
type LookupTab = DanbooruCatalogKind | 'favorites'

function byKind<T>(value: T): ByKind<T> {
  return { character: value, artist: value, copyright: value, general: value }
}

/**
 * 查资料（标签台，owner 2026-09-27 选 B「左边列表，右边常驻详情」，画板
 * 「查资料 B · 全部状态」）。四页：**角色 | 画风 | 作品 | 特征**（owner 2026-09-28
 * 加后两页），各自记住搜索词、换一批与选中项。
 *
 * - 每页先「随便看看」（作品多的里随机抽；特征从一张全年龄名单里抽）+ 换一批；一搜就
 *   选中第一个（作品最多的），右边直接出详情；停手 300ms 才查。没点过的页不查。
 * - 角色 / 作品 / 特征：名字默认选上，下面的点选（角色 = 常见特征，作品 = 里面的角色，
 *   特征 = 常一起出现的）；加到 整体 / 角色 N / ＋新角色，默认跟着输入框当前那一页；
 *   模型没有角色构图就只剩整体。已在目标里的不重复加。
 * - 画风：两段，画法在前、画师在后（owner 2026-10-22）。画师加入 = `artist:名字` 放在正向
 *   标签最前面；画法（`*_(medium)` 等说画面的 meta tag）原样加、接在画师标签后面。都是
 *   开关。「常画的 / 常一起出现的」只是参考，⛔ 不跟着加。
 * - 这一页查不到而别的页有：说「它是画师 / 作品…」，点了带着同一个词过去。
 * - 收藏（owner 2026-09-28）：详情标题旁一颗星，存账号里；第五页「收藏」按类别分段、
 *   默认选中第一条，⛔ 不再置顶在各页「随便看看」上面（收多了挤）。
 * - 手机：左右放不下，列表一页、点一行推进详情页，「加到哪 + 加入」钉在底部。
 */
export function StudioDanbooruPanel({
  onClose,
  headingRef,
}: {
  onClose: () => void
  /** 打开时给读屏一个落点（宿主负责落焦点与滚到看得见）。 */
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const t = useTranslations('StudioTags.lookup')
  const tTags = useTranslations('StudioTags')
  const locale = useLocale()
  const phone = useIsMobile()
  const reducedMotion = useReducedMotion()
  const adder = useTagLookupAdder(tTags('dialect.tags'))
  const rowSub = useLookupRowSub()
  const favorites = useDanbooruFavorites()

  const [tab, setTab] = useState<LookupTab>('character')
  const [favoritePick, setFavoritePick] = useState<{
    kind: DanbooruCatalogKind
    name: string
  } | null>(null)
  const [queries, setQueries] = useState(() => byKind(''))
  const [visited, setVisited] = useState(() => ({
    ...byKind(false),
    character: true,
  }))
  const [rounds, setRounds] = useState(() => byKind(0))
  const [picks, setPicks] = useState(() => byKind<string | null>(null))
  const [target, setTarget] = useState<TagLookupTarget | null>(null)
  const [selections, setSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({})
  const [phoneDetail, setPhoneDetail] = useState(false)
  const focusPhoneDetail = useCallback((node: HTMLHeadingElement | null) => {
    if (!node) return
    node.focus({ preventScroll: true })
    node.closest('section')?.scrollIntoView({ block: 'start' })
  }, [])

  const setQuery = (kind: DanbooruCatalogKind, value: string) =>
    setQueries((current) => ({ ...current, [kind]: value }))
  const setPick = (kind: DanbooruCatalogKind, name: string | null) =>
    setPicks((current) => ({ ...current, [kind]: name }))

  // 四页各问各的：切回来还是刚才那一批，⛔ 换页就重新抽。
  const listRequest = (kind: DanbooruCatalogKind) => {
    if (!visited[kind]) return null
    const text = queries[kind].trim()
    return text.length >= 2
      ? { kind, query: text }
      : { kind, random: true, round: rounds[kind] }
  }
  const lists: ByKind<ReturnType<typeof useDanbooruCatalog>> = {
    character: useDanbooruCatalog(listRequest('character')),
    artist: useDanbooruCatalog(listRequest('artist')),
    copyright: useDanbooruCatalog(listRequest('copyright')),
    general: useDanbooruCatalog(listRequest('general')),
  }
  // ⚠ 换一批是整批换掉：左右都出骨架（画板「画风 · 换一批中」），⛔ 旧的一批留着。
  const listData = (kind: DanbooruCatalogKind) =>
    queries[kind].trim().length >= 2 ? shownData(lists[kind]) : lists[kind].data
  const candidateOf = (kind: DanbooruCatalogKind): LookupItem | null => {
    const list = listData(kind)?.candidates ?? []
    return list.find((item) => item.name === picks[kind]) ?? list[0] ?? null
  }
  const detailRequest = (kind: DanbooruCatalogKind) => {
    const picked = candidateOf(kind)
    return picked ? { kind, tag: picked.name } : null
  }
  const details: ByKind<ReturnType<typeof useDanbooruCatalog>> = {
    character: useDanbooruCatalog(detailRequest('character')),
    artist: useDanbooruCatalog(detailRequest('artist')),
    copyright: useDanbooruCatalog(detailRequest('copyright')),
    general: useDanbooruCatalog(detailRequest('general')),
  }

  // 收藏页：按页签顺序分段，段内新收的在前；默认选中第一条。
  const onFavorites = tab === 'favorites'
  const favoriteList = DanbooruCatalogKindSchema.options.flatMap((kind) =>
    favorites.of(kind),
  )
  const favoriteSelected =
    favoriteList.find(
      (item) =>
        item.kind === favoritePick?.kind && item.name === favoritePick.name,
    ) ??
    favoriteList[0] ??
    null
  const favoriteDetail = useDanbooruCatalog(
    onFavorites && favoriteSelected
      ? { kind: favoriteSelected.kind, tag: favoriteSelected.name }
      : null,
  )

  // 详情是哪一类：四页就是页签本身，收藏页是选中那条的类别。
  const activeKind: DanbooruCatalogKind = onFavorites
    ? (favoriteSelected?.kind ?? 'character')
    : tab
  const text = KIND_TEXT[activeKind]
  const candidate: LookupItem | null = onFavorites
    ? favoriteSelected
    : candidateOf(activeKind)
  const posts = (count: number) =>
    t('posts', { count: compactPostCount(count, locale) })

  // ── 换页 / 跨页 ────────────────────────────────────────────────
  const switchTab = (next: LookupTab) => {
    setTab(next)
    setPhoneDetail(false)
    if (next !== 'favorites')
      setVisited((current) => ({ ...current, [next]: true }))
  }
  const goTo = (kind: DanbooruCatalogKind, name: string) => {
    switchTab(kind)
    setQuery(kind, displayDanbooruTag(name))
    setPick(kind, name)
  }
  const pick = (kind: DanbooruCatalogKind, name: string) => {
    if (onFavorites) setFavoritePick({ kind, name })
    else setPick(kind, name)
    if (phone) setPhoneDetail(true)
  }
  const nameOf = (name: string, kind: DanbooruCatalogKind = activeKind) =>
    kind === 'artist' ? stylePromptTag(name) : displayDanbooruTag(name)

  // ── 左栏 ───────────────────────────────────────────────────────
  const list = lists[activeKind]
  const data = listData(activeKind)
  const candidates = data?.candidates ?? []
  const query = queries[activeKind].trim()
  const randomMode = query.length < 2
  const loadingList = list.loading && !data
  const errored = list.error
  const empty = !loadingList && !errored && data && !candidates.length

  const listTitle = loadingList
    ? randomMode
      ? t('rerolling')
      : t('searching', { query })
    : candidates.length
      ? randomMode
        ? t(text.random, { count: candidates.length })
        : t(text.results, { query, count: candidates.length })
      : null

  const cross = empty ? data?.crossHint : null
  const say = errored
    ? {
        title: t('errorTitle'),
        text: t('errorText'),
        action: { label: t('retry'), onClick: list.retry },
      }
    : cross
      ? {
          title: t('crossTitle', { page: t(text.tab), query }),
          text: t('crossText', {
            kind: t(kindLabelKey(cross.kind, cross.name)),
            posts: posts(cross.count),
            page: t(KIND_TEXT[cross.kind].tab),
          }),
          action: {
            label: t('goPage', { page: t(KIND_TEXT[cross.kind].tab) }),
            onClick: () => goTo(cross.kind, cross.name),
          },
        }
      : empty
        ? {
            title: t('noneTitle', { query }),
            text: t(text.none),
            link: {
              label: t('searchDanbooru', { query }),
              href: danbooruTagSearchUrl(query),
            },
          }
        : null

  const toRow = (item: LookupItem, kind: DanbooruCatalogKind) => ({
    name: item.name,
    label: nameOf(item.name, kind),
    sub: rowSub(item, kind),
    previews: item.previews,
    added: kind === 'artist' && adder.hasPositive(stylePromptTag(item.name)),
    selected: !phone && kind === activeKind && item.name === candidate?.name,
  })
  const favorite = candidate
    ? {
        on: favorites.has(activeKind, candidate.name),
        label: favorites.has(activeKind, candidate.name)
          ? t('unfavorite', { name: nameOf(candidate.name) })
          : t('favorite', { name: nameOf(candidate.name) }),
        onToggle: () =>
          favorites.toggle({
            kind: activeKind,
            name: candidate.name,
            count: candidate.count,
            work: candidate.work,
            previews: [...candidate.previews],
          }),
      }
    : null

  const searchField = (
    <label
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-2 rounded-lg bg-surface-fill px-3 text-muted-foreground',
        phone ? 'h-11' : 'h-9',
      )}
    >
      <Search className="size-3.5 shrink-0" aria-hidden />
      <input
        type="search"
        aria-label={t(text.search)}
        placeholder={t(text.search)}
        value={queries[activeKind]}
        maxLength={100}
        onChange={(event) => setQuery(activeKind, event.target.value)}
        // ⚠ <768 必须 ≥16px，否则 iOS 聚焦即放大整页。
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-2sm"
      />
    </label>
  )

  const listColumn = (
    <>
      {searchField}
      {listTitle ? (
        <div className="flex min-h-6.5 shrink-0 items-center gap-2">
          <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <b className="truncate text-2sm font-semibold text-foreground">
              {listTitle}
            </b>
            {phone && !loadingList && candidates.length ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('pickHint')}
              </span>
            ) : null}
          </span>
          {randomMode && !loadingList && candidates.length ? (
            <button
              type="button"
              onClick={() => {
                setPick(activeKind, null)
                setRounds((current) => ({
                  ...current,
                  [activeKind]: current[activeKind] + 1,
                }))
              }}
              className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-lg px-2 text-2sm font-medium text-foreground/75 transition-colors duration-fast ease-linear hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <RefreshCw className="size-3" aria-hidden />
              {t('reroll')}
            </button>
          ) : null}
        </div>
      ) : null}
      {loadingList ? (
        <LookupSkeletonRows label={t('loading')} />
      ) : say ? (
        <LookupSay {...say} />
      ) : activeKind === 'artist' ? (
        // 画风页两段同一个滚动区；按名单认（同下）。
        <div
          key={`${activeKind}:${candidates.map((item) => item.name).join('|')}`}
          className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1.5"
        >
          {styleSections(activeKind, candidates).map((section) => (
            <section key={section.key} className="flex flex-col gap-1.5">
              <b className="flex min-h-6.5 items-center text-2sm font-semibold text-foreground">
                {t('section', {
                  kind: t(section.label),
                  count: section.items.length,
                })}
              </b>
              <LookupRows
                kind={activeKind}
                rows={section.items.map((item) => toRow(item, activeKind))}
                contained
                addedLabel={t('added')}
                phone={phone}
                onPick={(name) => pick(activeKind, name)}
              />
            </section>
          ))}
        </div>
      ) : (
        <LookupRows
          // 按名单认：换词重搜期间名单没变就不重演入场，换成新名单时才升起。
          key={`${activeKind}:${candidates.map((item) => item.name).join('|')}`}
          kind={activeKind}
          rows={candidates.map((item) => toRow(item, activeKind))}
          addedLabel={t('added')}
          phone={phone}
          onPick={(name) => pick(activeKind, name)}
        />
      )}
    </>
  )

  // 收藏页左栏：按页签顺序一类一段（画风再分画法 / 画师，空的段不画），同一个滚动区。
  const favoritesColumn = !favorites.loaded ? (
    <LookupSkeletonRows label={t('loading')} />
  ) : favoriteList.length ? (
    <div className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1.5">
      {DanbooruCatalogKindSchema.options.flatMap((kind) =>
        styleSections(kind, favorites.of(kind)).map((section) => (
          <section
            key={`${kind}:${section.key}`}
            className="flex flex-col gap-1.5"
          >
            <b className="flex min-h-6.5 items-center text-2sm font-semibold text-foreground">
              {t('section', {
                kind: t(section.label),
                count: section.items.length,
              })}
            </b>
            <LookupRows
              kind={kind}
              rows={section.items.map((item) => toRow(item, kind))}
              contained
              addedLabel={t('added')}
              phone={phone}
              onPick={(name) => pick(kind, name)}
            />
          </section>
        )),
      )}
    </div>
  ) : (
    <LookupBlank text={t('favoritesEmpty')} />
  )

  // ── 右栏 ───────────────────────────────────────────────────────
  const detailQuery = onFavorites ? favoriteDetail : details[activeKind]
  const detail = detailQuery.data?.detail ?? null

  const paneKey = candidate
    ? `${activeKind}:${candidate.name}:${detail ? 'ready' : detailQuery.error ? 'error' : 'loading'}`
    : `${tab}:blank`
  const pane = candidate ? (
    <LookupDetailPane
      kind={activeKind}
      candidate={candidate}
      query={detailQuery}
      phone={phone}
      adder={adder}
      target={target}
      onTarget={setTarget}
      selections={selections}
      onSelections={setSelections}
      favorite={favorite}
    />
  ) : !onFavorites && loadingList ? (
    <LookupDetailSkeleton label={t('loading')} />
  ) : (
    <LookupBlank />
  )

  const tabs = (
    <LiquidSegmented
      ariaLabel={t('tabsLabel')}
      value={tab}
      fill={phone}
      onChange={switchTab}
      items={[
        ...DanbooruCatalogKindSchema.options.map((kind) => ({
          value: kind as LookupTab,
          label: t(KIND_TEXT[kind].tab),
        })),
        { value: 'favorites' as LookupTab, label: t('tabFavorites') },
      ]}
    />
  )

  return (
    <section
      aria-labelledby="studio-lookup-title"
      className={cn(
        'relative flex min-h-0 flex-col',
        phone
          ? 'studio-mobile-stage-panel flex-none scroll-mt-16 gap-3'
          : 'flex-1 gap-3.5',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        if (phoneDetail) setPhoneDetail(false)
        else onClose()
      }}
    >
      {phone ? (
        <>
          {/* 五个页签一行放不下标题，单独占下一行；英文等长文案等分放不下时横向滑。 */}
          <div className="-ml-2 flex h-11 shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={t('backToResults')}
              onClick={onClose}
              className={PHONE_ICON_BUTTON_CLASS}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <h2
              ref={headingRef}
              id="studio-lookup-title"
              tabIndex={-1}
              className="min-w-0 flex-1 truncate text-md font-semibold outline-none"
            >
              {t('title')}
            </h2>
          </div>
          <div className="-mx-3 flex shrink-0 overflow-x-auto px-3">{tabs}</div>
        </>
      ) : (
        <div className="flex h-9 shrink-0 items-center gap-2.5">
          {/* ⚠ `outline-none`：打开时焦点被程序挪到这里（给读屏一个落点）。 */}
          <h2
            ref={headingRef}
            id="studio-lookup-title"
            tabIndex={-1}
            className="truncate text-md font-semibold outline-none"
          >
            {t('title')}
          </h2>
          {tabs}
          <span className="flex-1" />
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('backToResults')}
          </Button>
        </div>
      )}

      <FadeSwap
        swapKey={tab}
        reduced={Boolean(reducedMotion)}
        className={cn('flex min-h-0 flex-1', phone ? 'flex-col gap-3' : '')}
      >
        {phone ? (
          onFavorites ? (
            favoritesColumn
          ) : (
            listColumn
          )
        ) : (
          <>
            <div className="flex w-80 shrink-0 flex-col gap-2.5 border-r border-border/60 pr-4.5">
              {onFavorites ? favoritesColumn : listColumn}
            </div>
            <div className="flex min-w-0 flex-1 flex-col pl-6.5">
              <FadeSwap
                swapKey={paneKey}
                reduced={Boolean(reducedMotion)}
                className="flex min-h-0 flex-1 flex-col"
              >
                {pane}
              </FadeSwap>
            </div>
          </>
        )}
      </FadeSwap>

      {phone ? (
        <AnimatePresence initial={false}>
          {phoneDetail && candidate ? (
            <motion.div
              key="detail"
              initial={reducedMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { x: '100%' }}
              transition={{
                duration: DURATION_MS.slow / 1000,
                ease: EASE_STANDARD,
              }}
              className="absolute inset-0 z-10 flex flex-col gap-3 bg-card"
            >
              <div className="-ml-2 flex h-11 shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={t('backToList')}
                  onClick={() => setPhoneDetail(false)}
                  className={PHONE_ICON_BUTTON_CLASS}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <h3
                  ref={focusPhoneDetail}
                  tabIndex={-1}
                  className="min-w-0 flex-1 truncate text-md font-semibold outline-none"
                >
                  {nameOf(candidate.name)}
                </h3>
                <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.75 text-2xs font-semibold text-foreground/75">
                  {t(kindLabelKey(activeKind, candidate.name))}
                </span>
                {favorite ? <LookupFavoriteButton phone {...favorite} /> : null}
              </div>
              {pane}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
    </section>
  )
}
