'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronLeft, Search } from '@/components/icons'
import {
  useStudioLibraryPick,
  type TagLookupTarget,
} from '@/contexts/studio-library-pick'
import { useDanbooruCatalog } from '@/hooks/use-danbooru-catalog'
import { useDanbooruFavorites } from '@/hooks/use-danbooru-favorites'
import { useDanbooruTagPages } from '@/hooks/use-danbooru-tag-library'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  danbooruTagSearchUrl,
  displayDanbooruTag,
  stylePromptTag,
} from '@/lib/tag-lookup'
import {
  DanbooruCatalogKindSchema,
  type DanbooruCatalogKind,
} from '@/types/danbooru-catalog'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

import { LookupBlank, LookupDetailSkeleton } from '../lookup/LookupDetail'
import { LookupDetailPane } from '../lookup/LookupDetailPane'
import { LookupSay } from '../lookup/LookupList'
import {
  KIND_TEXT,
  shownData,
  styleSections,
  type LookupItem,
} from '../lookup/lookup-kinds'
import { TagLibraryCard } from './TagLibraryCard'
import { TagLibraryDesk, TagLibraryMoreSentinel } from './TagLibraryDesk'
import {
  TAG_LIBRARY_FAVORITES_VIEW,
  TAG_LIBRARY_PARAM,
  useTagLibraryParams,
} from './tag-library-params'

/** 网格：按库这一栏的宽排列数（容器查询），⛔ 按整个窗口。 */
const GRID_CLASS =
  'grid grid-cols-2 gap-x-2 gap-y-3 @sm:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-5 @5xl:grid-cols-6'

/**
 * 库叠层里的「标签」一类（第 9f 步 9f-2c）。桌面 = `TagLibraryDesk`（ui-spec §9 ㊴，左列表 +
 * 右详情）；手机照旧是下面这一副网格：
 *
 * - 顶上「库 | 收藏」；库分 角色 · 画风 · 作品 · 特征 四类，不搜就按作品数从多到少排、
 *   滚到底接着翻；一搜就是搜到的那几个（中日英名都认，同查资料）。
 * - 点一张卡进详情：样图 · 别名 · Wiki 那一段 · 常一起出现的 · Danbooru 链接 · 收藏。
 * - 标签台开着（它登记了 `TagsLibraryAdder`）：顶上写「选给 标签 台」，详情能加到
 *   整体 / 角色 N；没开就只能看、收藏。
 */
export function TagLibraryView() {
  return useIsMobile() ? <TagLibraryPhone /> : <TagLibraryDesk />
}

/** 手机：照旧网格 + 点开进详情（「← 返回」），等手机整体重设计。 */
function TagLibraryPhone() {
  const t = useTranslations('StudioTags.lookup')
  const tLibrary = useTranslations('StudioTags.library')
  const tShell = useTranslations('StudioShell')
  const {
    favoritesView,
    kind,
    query: urlQuery,
    tag: openTag,
    of: openKind,
    navigate,
    setView,
  } = useTagLibraryParams()
  const adder = useStudioLibraryPick().tags
  const favorites = useDanbooruFavorites()
  // 换一个候选还加到刚才那一位（刚建的新角色也算）。
  const [target, setTarget] = useState<TagLookupTarget | null>(null)
  const [selections, setSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({})

  // 搜索框打字先记在本地，停手才进地址（与查资料同一档 300ms，由 useDanbooruCatalog 去抖）。
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null)
  const draftKey = `${kind}:${urlQuery}`
  const queryText = draft?.key === draftKey ? draft.text : urlQuery
  const searching = queryText.trim().length >= 2

  const open = (item: LookupItem, of: DanbooruCatalogKind) =>
    navigate({ [TAG_LIBRARY_PARAM.tag]: item.name, [TAG_LIBRARY_PARAM.of]: of })

  const pages = useDanbooruTagPages(
    !favoritesView && !openTag && !searching ? kind : null,
  )
  const search = useDanbooruCatalog(
    !favoritesView && !openTag && searching
      ? { kind, query: queryText.trim() }
      : null,
  )
  const detail = useDanbooruCatalog(
    openTag ? { tag: openTag, ...(openKind ? { kind: openKind } : {}) } : null,
  )

  const pickLine = adder ? (
    <p
      data-testid="library-pick-target"
      className="ml-auto truncate text-sm text-muted-foreground"
    >
      {tShell('pickFor', { bench: adder.benchLabel })}
    </p>
  ) : null

  const addedOf = (item: LookupItem, of: DanbooruCatalogKind) =>
    of === 'artist' && Boolean(adder?.hasPositive(stylePromptTag(item.name)))

  // ── 详情 ──────────────────────────────────────────────────────
  if (openTag) {
    const found = detail.data?.detail ?? null
    const of = found?.kind ?? openKind ?? 'general'
    const candidate: LookupItem = {
      name: openTag,
      count: found?.count ?? 0,
      work: found?.work ?? null,
      previews: [],
    }
    const name =
      of === 'artist' ? stylePromptTag(openTag) : displayDanbooruTag(openTag)
    const favorite = found
      ? {
          on: favorites.has(of, openTag),
          label: favorites.has(of, openTag)
            ? t('unfavorite', { name })
            : t('favorite', { name }),
          onToggle: () =>
            favorites.toggle({
              kind: of,
              name: openTag,
              count: found.count ?? 0,
              work: found.work,
              previews: found.images.slice(0, 3).map((image) => image.url),
            }),
        }
      : null
    const missing = detail.data && !found
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <div className="flex h-9 shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() =>
              navigate({
                [TAG_LIBRARY_PARAM.tag]: null,
                [TAG_LIBRARY_PARAM.of]: null,
              })
            }
            className="-ml-1.5 inline-flex h-9 items-center gap-1 rounded-lg pl-1 pr-2.5 text-sm text-muted-foreground transition-colors duration-fast ease-linear hover:bg-surface-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {tLibrary('back')}
          </button>
          {pickLine}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {missing ? (
            <LookupSay
              title={t('noneTitle', { query: displayDanbooruTag(openTag) })}
              text={tLibrary('notATag')}
              link={{
                label: t('searchDanbooru', {
                  query: displayDanbooruTag(openTag),
                }),
                href: danbooruTagSearchUrl(displayDanbooruTag(openTag)),
              }}
            />
          ) : found || detail.error ? (
            <LookupDetailPane
              key={`${of}:${openTag}`}
              kind={of}
              candidate={candidate}
              query={detail}
              phone
              adder={adder}
              target={target}
              onTarget={setTarget}
              selections={selections}
              onSelections={setSelections}
              favorite={favorite}
            />
          ) : (
            <LookupDetailSkeleton label={t('loading')} />
          )}
        </div>
      </div>
    )
  }

  // ── 网格 ──────────────────────────────────────────────────────
  const grid = (
    items: readonly LookupItem[],
    of: DanbooruCatalogKind,
    hideBare = false,
  ) => (
    <ul className={GRID_CLASS}>
      {items.map((item) => (
        <TagLibraryCard
          key={item.name}
          kind={of}
          item={item}
          added={addedOf(item, of)}
          hideBare={hideBare}
          onOpen={() => open(item, of)}
        />
      ))}
    </ul>
  )
  const sectioned = (items: readonly LookupItem[], of: DanbooruCatalogKind) =>
    styleSections(of, items).map((section) => (
      <section key={`${of}:${section.key}`} className="flex flex-col gap-2">
        <b className="text-2sm font-semibold text-foreground">
          {t('section', {
            kind: t(section.label),
            count: section.items.length,
          })}
        </b>
        {grid(section.items, of, false)}
      </section>
    ))

  const searchData = shownData(search)
  const cross = searchData?.crossHint ?? null
  const body = favoritesView ? (
    !favorites.loaded ? (
      <LookupDetailSkeleton label={t('loading')} />
    ) : DanbooruCatalogKindSchema.options.some(
        (of) => favorites.of(of).length > 0,
      ) ? (
      DanbooruCatalogKindSchema.options.flatMap((of) =>
        sectioned(favorites.of(of), of),
      )
    ) : (
      <LookupBlank text={t('favoritesEmpty')} />
    )
  ) : searching ? (
    search.error ? (
      <LookupSay
        title={t('errorTitle')}
        text={t('errorText')}
        action={{ label: t('retry'), onClick: search.retry }}
      />
    ) : !searchData ? (
      <LookupDetailSkeleton label={t('loading')} />
    ) : searchData.candidates.length ? (
      sectioned(searchData.candidates, kind)
    ) : cross ? (
      <LookupSay
        title={t('crossTitle', {
          page: t(KIND_TEXT[kind].tab),
          query: queryText.trim(),
        })}
        text={t('crossText', {
          kind: t(KIND_TEXT[cross.kind].kind),
          posts: t('posts', { count: cross.count }),
          page: t(KIND_TEXT[cross.kind].tab),
        })}
        action={{
          label: t('goPage', { page: t(KIND_TEXT[cross.kind].tab) }),
          onClick: () =>
            navigate({
              [TAG_LIBRARY_PARAM.kind]: cross.kind,
              [TAG_LIBRARY_PARAM.query]: queryText,
            }),
        }}
      />
    ) : (
      <LookupSay
        title={t('noneTitle', { query: queryText.trim() })}
        text={t(KIND_TEXT[kind].none)}
        link={{
          label: t('searchDanbooru', { query: queryText.trim() }),
          href: danbooruTagSearchUrl(queryText.trim()),
        }}
      />
    )
  ) : pages.items.length === 0 && pages.error ? (
    <LookupSay
      title={t('errorTitle')}
      text={t('errorText')}
      action={{ label: t('retry'), onClick: pages.retry }}
    />
  ) : pages.items.length === 0 ? (
    <LookupDetailSkeleton label={t('loading')} />
  ) : (
    <>
      {grid(pages.items, kind, true)}
      {pages.error ? (
        <LookupSay
          title={t('errorTitle')}
          text={t('errorText')}
          action={{ label: t('retry'), onClick: pages.retry }}
        />
      ) : pages.done ? null : (
        <TagLibraryMoreSentinel
          key={pages.items.length}
          label={t('loading')}
          onReach={pages.loadMore}
        />
      )}
    </>
  )

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <div className="flex h-9 shrink-0 items-center gap-3">
        <LiquidSegmented
          ariaLabel={tLibrary('viewLabel')}
          value={favoritesView ? TAG_LIBRARY_FAVORITES_VIEW : 'library'}
          items={[
            { value: 'library', label: tLibrary('tabLibrary') },
            { value: TAG_LIBRARY_FAVORITES_VIEW, label: t('tabFavorites') },
          ]}
          onChange={(next) => setView(next === TAG_LIBRARY_FAVORITES_VIEW)}
        />
        {pickLine}
      </div>
      {favoritesView ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <LiquidSegmented
            ariaLabel={t('tabsLabel')}
            value={kind}
            items={DanbooruCatalogKindSchema.options.map((of) => ({
              value: of,
              label: t(KIND_TEXT[of].tab),
            }))}
            onChange={(next) =>
              navigate({
                [TAG_LIBRARY_PARAM.kind]: next,
                [TAG_LIBRARY_PARAM.query]: null,
              })
            }
          />
          <label className="flex h-9 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg bg-surface-fill px-3 text-muted-foreground">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input
              type="search"
              aria-label={t(KIND_TEXT[kind].search)}
              placeholder={t(KIND_TEXT[kind].search)}
              value={queryText}
              maxLength={100}
              onChange={(event) =>
                setDraft({ key: draftKey, text: event.target.value })
              }
              onBlur={() => {
                if (queryText !== urlQuery)
                  navigate({
                    [TAG_LIBRARY_PARAM.query]: queryText.trim() || null,
                  })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  navigate({
                    [TAG_LIBRARY_PARAM.query]: queryText.trim() || null,
                  })
              }}
              // ⚠ <768 必须 ≥16px，否则 iOS 聚焦即放大整页。
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:text-2sm"
            />
          </label>
        </div>
      )}
      <div className="@container flex flex-col gap-4">{body}</div>
    </div>
  )
}
