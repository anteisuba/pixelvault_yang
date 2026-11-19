'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronLeft } from '@/components/icons'
import { LibraryToolbar } from '@/components/ui/library-kit'
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

import {
  LookupBlank,
  LookupDetailSkeleton,
  LookupFavoriteButton,
} from '../lookup/LookupDetail'
import { LookupDetailPane } from '../lookup/LookupDetailPane'
import { LookupSay } from '../lookup/LookupList'
import {
  KIND_TEXT,
  kindLabelKey,
  shownData,
  styleSections,
  type LookupItem,
} from '../lookup/lookup-kinds'
import { TagLibraryCard } from './TagLibraryCard'
import {
  TagLibraryDesk,
  TagLibraryMoreSentinel,
  TagLibraryScopeSelect,
} from './TagLibraryDesk'
import { TAG_LIBRARY_PARAM, useTagLibraryParams } from './tag-library-params'

/** 网格：按库这一栏的宽排列数（容器查询），⛔ 按整个窗口。 */
const GRID_CLASS =
  'grid grid-cols-2 gap-x-2 gap-y-3 @sm:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-5 @5xl:grid-cols-6'

/**
 * 库叠层里的「标签」一类（第 9f 步 9f-2c）。桌面 = `TagLibraryDesk`（ui-spec §9 ㊴，左列表 +
 * 右详情）；手机照旧是下面这一副网格：
 *
 * - 顶上库骨架两行：分组药丸「全部标签 · 收藏」……… 搜索圆键；下面一行 角色 · 画风 · 作品 · 特征 四类，不搜就按作品数从多到少排、
 *   滚到底接着翻；一搜就是搜到的那几个（中日英名都认，同查资料）。
 * - 点一张卡进详情：样图 · 别名 · Wiki 那一段 · 常一起出现的 · Danbooru 链接 · 收藏。
 * - 标签台开着（它登记了 `TagsLibraryAdder`）：顶上写「选给 标签 台」，详情能加到
 *   整体 / 角色 N；没开就只能看、收藏。
 */
export function TagLibraryView() {
  return useIsMobile() ? <TagLibraryPhone /> : <TagLibraryDesk />
}

/** 手机：库骨架两行工具行 + 网格，点开进详情（「← 返回」）。 */
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
      className="truncate text-2sm text-muted-foreground"
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
        {/* 和台上「查资料」的手机详情同一行：‹ · 名字 · 类型 · 收藏（⛔ 只有一个「返回」、名字丢了）。 */}
        <div className="-ml-2 flex h-11 shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={tLibrary('back')}
            onClick={() =>
              navigate({
                [TAG_LIBRARY_PARAM.tag]: null,
                [TAG_LIBRARY_PARAM.of]: null,
              })
            }
            className="grid size-11 shrink-0 place-items-center rounded-xl text-foreground/75 transition-colors duration-fast ease-linear active:bg-surface-fill focus-visible:outline-none focus-visible:shadow-focus"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-md font-semibold">
            {name}
          </h2>
          {found ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.75 text-2xs font-semibold text-foreground/75">
              {t(kindLabelKey(of, openTag))}
            </span>
          ) : null}
          {favorite ? <LookupFavoriteButton phone {...favorite} /> : null}
        </div>
        {pickLine}
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
      <LibraryToolbar
        className="shrink-0"
        scope={
          <TagLibraryScopeSelect
            favoritesView={favoritesView}
            favoritesCount={DanbooruCatalogKindSchema.options.reduce(
              (sum, of) => sum + favorites.of(of).length,
              0,
            )}
            onView={setView}
          />
        }
        segments={
          favoritesView ? null : (
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
          )
        }
        search={
          favoritesView
            ? undefined
            : {
                value: queryText,
                maxLength: 100,
                placeholder: t('search'),
                label: t('search'),
                onChange: (text) => setDraft({ key: draftKey, text }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter')
                    navigate({
                      [TAG_LIBRARY_PARAM.query]: queryText.trim() || null,
                    })
                },
              }
        }
      />
      {pickLine}
      <div className="@container flex flex-col gap-4">{body}</div>
    </div>
  )
}
