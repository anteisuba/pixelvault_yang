'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { Bookmark, LayoutGrid } from '@/components/icons'
import {
  useStudioLibraryPick,
  type TagLookupTarget,
} from '@/contexts/studio-library-pick'
import { useDanbooruCatalog } from '@/hooks/use-danbooru-catalog'
import { useDanbooruFavorites } from '@/hooks/use-danbooru-favorites'
import {
  useDanbooruTagPages,
  useDanbooruTagPreview,
} from '@/hooks/use-danbooru-tag-library'
import { useNearViewport } from '@/hooks/use-near-viewport'
import {
  danbooruTagSearchUrl,
  displayDanbooruTag,
  stylePromptTag,
} from '@/lib/tag-lookup'
import {
  DanbooruCatalogKindSchema,
  type DanbooruCatalogKind,
} from '@/types/danbooru-catalog'
import {
  LibraryRail,
  LibraryRailRow,
  LibrarySearch,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

import { LookupBlank, LookupDetailSkeleton } from '../lookup/LookupDetail'
import { LookupDetailPane } from '../lookup/LookupDetailPane'
import {
  LookupRowButton,
  LookupRows,
  LookupSay,
  LookupSkeletonRows,
} from '../lookup/LookupList'
import { FadeSwap } from '../lookup/LookupPanes'
import {
  KIND_TEXT,
  shownData,
  styleSections,
  useLookupRowSub,
  type LookupItem,
} from '../lookup/lookup-kinds'
import { TAG_LIBRARY_PARAM, useTagLibraryParams } from './tag-library-params'

const DANBOORU_SOURCE_LABEL = 'Danbooru'

interface ListedTag {
  item: LookupItem
  of: DanbooruCatalogKind
}

/** 一段：画风页 / 收藏页分段才有标题，别的就一段不写标题。 */
interface RowSection {
  key: string
  title: string | null
  of: DanbooruCatalogKind
  items: readonly LookupItem[]
}

/**
 * 标签库桌面（ui-spec §9 ㊴，样件 E）：库骨架左栏「全部（Danbooru）/ 收藏」；右边顶上搜索
 *（中日英名都认）+ 下面「角色 · 画风 · 作品 · 特征」切换条；再下面照查资料：左列 320 一行一个，
 * 右边点中那一个的详情（不点就是列表第一个）。⛔ 格子、⛔「← 返回」。
 *
 * 标签台开着（它登记了 `TagsLibraryAdder`）：顶上写「选给 标签 台」，详情能加到 整体 / 角色 N；
 * 没开就只能看、收藏。标签还交不了助手（引用里没有标签这一类）。
 */
export function TagLibraryDesk() {
  const t = useTranslations('StudioTags.lookup')
  const tLibrary = useTranslations('StudioTags.library')
  const tShell = useTranslations('StudioShell')
  const reducedMotion = useReducedMotion()
  const params = useTagLibraryParams()
  const { favoritesView, kind, navigate } = params
  const adder = useStudioLibraryPick().tags
  const favorites = useDanbooruFavorites()
  const rowSub = useLookupRowSub()
  // 换一个候选还加到刚才那一位（刚建的新角色也算）。
  const [target, setTarget] = useState<TagLookupTarget | null>(null)
  const [selections, setSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({})

  // 搜索框打字先记在本地，回车才进地址；查询由 useDanbooruCatalog 去抖（300ms，同查资料）。
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null)
  const draftKey = `${kind}:${params.query}`
  const queryText = draft?.key === draftKey ? draft.text : params.query
  const query = queryText.trim()
  const searching = !favoritesView && query.length >= 2

  const pages = useDanbooruTagPages(!favoritesView && !searching ? kind : null)
  const search = useDanbooruCatalog(searching ? { kind, query } : null)
  const searchData = shownData(search)

  const nameOf = (name: string, of: DanbooruCatalogKind) =>
    of === 'artist' ? stylePromptTag(name) : displayDanbooruTag(name)
  const sectionTitle = (label: string, count: number) =>
    t('section', { kind: t(label), count })

  // ── 左列是哪几段 ───────────────────────────────────────────────
  const sections: RowSection[] = favoritesView
    ? DanbooruCatalogKindSchema.options.flatMap((of) =>
        styleSections(of, favorites.of(of)).map((section) => ({
          key: `${of}:${section.key}`,
          title: sectionTitle(section.label, section.items.length),
          of,
          items: section.items,
        })),
      )
    : searching
      ? styleSections(kind, searchData?.candidates ?? []).map((section) => ({
          key: section.key,
          title:
            kind === 'artist'
              ? sectionTitle(section.label, section.items.length)
              : null,
          of: kind,
          items: section.items,
        }))
      : [{ key: kind, title: null, of: kind, items: pages.items }]
  const listed: ListedTag[] = sections.flatMap((section) =>
    section.items.map((item) => ({ item, of: section.of })),
  )

  // ── 选中的那一个：地址里的，没有就是列表第一个 ───────────────────
  const picked = params.tag
    ? (listed.find(
        (entry) =>
          entry.item.name === params.tag &&
          (!params.of || entry.of === params.of),
      ) ?? null)
    : (listed[0] ?? null)
  const selectedName = params.tag ?? picked?.item.name ?? null
  const selectedOf = params.tag ? params.of : (picked?.of ?? null)
  const detail = useDanbooruCatalog(
    selectedName
      ? { tag: selectedName, ...(selectedOf ? { kind: selectedOf } : {}) }
      : null,
  )
  const found = detail.data?.detail ?? null
  const selectedKind: DanbooruCatalogKind =
    found?.kind ?? selectedOf ?? 'general'

  const pick = (entry: ListedTag) =>
    navigate({
      [TAG_LIBRARY_PARAM.tag]: entry.item.name,
      [TAG_LIBRARY_PARAM.of]: entry.of,
    })
  const addedOf = (name: string, of: DanbooruCatalogKind) =>
    of === 'artist' && Boolean(adder?.hasPositive(stylePromptTag(name)))
  const isSelected = (name: string, of: DanbooruCatalogKind) =>
    name === selectedName && of === selectedKind

  const rowsOf = (section: RowSection) => (
    <LookupRows
      // 按名单认：换词重搜期间名单没变就不重演入场，换成新名单时才升起。
      key={`${section.key}:${section.items.map((item) => item.name).join('|')}`}
      kind={section.of}
      contained
      addedLabel={t('added')}
      rows={section.items.map((item) => ({
        name: item.name,
        label: nameOf(item.name, section.of),
        sub: rowSub(item, section.of),
        previews: item.previews,
        added: addedOf(item.name, section.of),
        selected: isSelected(item.name, section.of),
      }))}
      onPick={(name) => {
        const item = section.items.find((entry) => entry.name === name)
        if (item) pick({ item, of: section.of })
      }}
    />
  )
  const sectioned = sections.map((section) =>
    section.title ? (
      <section key={section.key} className="flex flex-col gap-1.5">
        <b className="flex min-h-6.5 items-center text-2sm font-semibold text-foreground">
          {section.title}
        </b>
        {rowsOf(section)}
      </section>
    ) : (
      <div key={section.key}>{rowsOf(section)}</div>
    ),
  )

  const cross = searchData?.crossHint ?? null
  const listLoading = favoritesView
    ? !favorites.loaded
    : searching
      ? !searchData && !search.error
      : pages.items.length === 0 && !pages.error
  const column = favoritesView ? (
    !favorites.loaded ? (
      <LookupSkeletonRows label={t('loading')} />
    ) : listed.length ? (
      sectioned
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
      <LookupSkeletonRows label={t('loading')} />
    ) : listed.length ? (
      sectioned
    ) : cross ? (
      <LookupSay
        title={t('crossTitle', { page: t(KIND_TEXT[kind].tab), query })}
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
              [TAG_LIBRARY_PARAM.query]: query,
              [TAG_LIBRARY_PARAM.tag]: null,
              [TAG_LIBRARY_PARAM.of]: null,
            }),
        }}
      />
    ) : (
      <LookupSay
        title={t('noneTitle', { query })}
        text={t(KIND_TEXT[kind].none)}
        link={{
          label: t('searchDanbooru', { query }),
          href: danbooruTagSearchUrl(query),
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
    <LookupSkeletonRows label={t('loading')} />
  ) : (
    // 按热度翻出来的这一列没带样图：每一行滚到才问（同原来的格子）。
    <ul className="-mx-1.5 flex flex-col gap-0.5 pb-1">
      {pages.items.map((item) => (
        <TagLibraryLazyRow
          key={item.name}
          kind={kind}
          item={item}
          label={nameOf(item.name, kind)}
          added={addedOf(item.name, kind)}
          selected={isSelected(item.name, kind)}
          onPick={() => pick({ item, of: kind })}
        />
      ))}
      {pages.error ? (
        <li>
          <LookupSay
            title={t('errorTitle')}
            text={t('errorText')}
            action={{ label: t('retry'), onClick: pages.retry }}
          />
        </li>
      ) : pages.done ? null : (
        <li>
          <TagLibraryMoreSentinel
            key={pages.items.length}
            label={t('loading')}
            onReach={pages.loadMore}
          />
        </li>
      )}
    </ul>
  )

  // ── 右边详情 ───────────────────────────────────────────────────
  const candidate: LookupItem | null = selectedName
    ? (picked?.item ?? {
        name: selectedName,
        count: found?.count ?? 0,
        work: found?.work ?? null,
        previews: [],
      })
    : null
  const favorite =
    found && selectedName
      ? {
          on: favorites.has(selectedKind, selectedName),
          label: favorites.has(selectedKind, selectedName)
            ? t('unfavorite', { name: nameOf(selectedName, selectedKind) })
            : t('favorite', { name: nameOf(selectedName, selectedKind) }),
          onToggle: () =>
            favorites.toggle({
              kind: selectedKind,
              name: selectedName,
              count: found.count ?? 0,
              work: found.work,
              previews: found.images.slice(0, 3).map((image) => image.url),
            }),
        }
      : null
  const missing = Boolean(selectedName && detail.data && !found)
  const paneKey = candidate
    ? `${selectedKind}:${candidate.name}:${found ? 'ready' : detail.error ? 'error' : 'loading'}`
    : 'blank'
  const pane =
    missing && selectedName ? (
      <LookupSay
        title={t('noneTitle', { query: displayDanbooruTag(selectedName) })}
        text={tLibrary('notATag')}
        link={{
          label: t('searchDanbooru', {
            query: displayDanbooruTag(selectedName),
          }),
          href: danbooruTagSearchUrl(displayDanbooruTag(selectedName)),
        }}
      />
    ) : candidate ? (
      <LookupDetailPane
        key={`${selectedKind}:${candidate.name}`}
        kind={selectedKind}
        candidate={candidate}
        query={detail}
        phone={false}
        adder={adder}
        target={target}
        onTarget={setTarget}
        selections={selections}
        onSelections={setSelections}
        favorite={favorite}
      />
    ) : listLoading ? (
      <LookupDetailSkeleton label={t('loading')} />
    ) : (
      <LookupBlank />
    )

  return (
    <div className="flex h-full min-h-0 gap-8 pt-3 pr-5.5">
      <LibraryRail label={tLibrary('viewLabel')} className="pt-0.5">
        <LibraryRailRow
          icon={<LayoutGrid aria-hidden />}
          label={tLibrary('all')}
          trailing={DANBOORU_SOURCE_LABEL}
          active={!favoritesView}
          onSelect={() => params.setView(false)}
        />
        <LibraryRailRow
          icon={<Bookmark aria-hidden />}
          label={t('tabFavorites')}
          trailing={DanbooruCatalogKindSchema.options.reduce(
            (sum, of) => sum + favorites.of(of).length,
            0,
          )}
          active={favoritesView}
          onSelect={() => params.setView(true)}
        />
      </LibraryRail>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {adder ? (
          <div className="flex shrink-0 pb-2">
            <p
              data-testid="library-pick-target"
              className="ml-auto truncate text-sm text-muted-foreground"
            >
              {tShell('pickFor', { bench: adder.benchLabel })}
            </p>
          </div>
        ) : null}
        {favoritesView ? null : (
          <>
            <LibraryToolbar
              className="shrink-0"
              search={
                <LibrarySearch
                  value={queryText}
                  maxLength={100}
                  placeholder={t(KIND_TEXT[kind].search)}
                  label={t(KIND_TEXT[kind].search)}
                  onChange={(text) => {
                    setDraft({ key: draftKey, text })
                    // 一搜就看搜到的第一个：刚才点开的那一个放掉。
                    if (params.tag)
                      navigate({
                        [TAG_LIBRARY_PARAM.tag]: null,
                        [TAG_LIBRARY_PARAM.of]: null,
                      })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter')
                      navigate({ [TAG_LIBRARY_PARAM.query]: query || null })
                  }}
                />
              }
            />
            <div className="mt-3 flex shrink-0">
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
                    [TAG_LIBRARY_PARAM.tag]: null,
                    [TAG_LIBRARY_PARAM.of]: null,
                  })
                }
              />
            </div>
          </>
        )}
        <div className="mt-3 flex min-h-0 flex-1 pb-4">
          <div className="flex w-80 shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-border/60 pr-4.5">
            {column}
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
        </div>
      </div>
    </div>
  )
}

/**
 * 按热度翻出来的一行：滚到附近才问样图与出处；问回来一张全年龄样图都没有就不画这一行
 *（多半是成人向的标签，同原来的格子）。
 */
function TagLibraryLazyRow({
  kind,
  item,
  label,
  added,
  selected,
  onPick,
}: {
  kind: DanbooruCatalogKind
  item: LookupItem
  label: string
  added: boolean
  selected: boolean
  onPick: () => void
}) {
  const t = useTranslations('StudioTags.lookup')
  const rowSub = useLookupRowSub()
  const lazy = item.previews.length === 0
  const { setNode, isNearViewport } = useNearViewport('400px')
  const preview = useDanbooruTagPreview(kind, item.name, lazy && isNearViewport)
  if (lazy && preview && preview.previews.length === 0) return null
  const work = item.work ?? preview?.work ?? null
  return (
    <li ref={setNode}>
      <LookupRowButton
        kind={kind}
        addedLabel={t('added')}
        row={{
          name: item.name,
          label,
          sub: rowSub({ ...item, work }, kind),
          previews: lazy ? (preview?.previews ?? []) : item.previews,
          added,
          selected,
        }}
        onPick={onPick}
      />
    </li>
  )
}

/** 滚到底那一条：进了视野附近就翻下一页（每翻一页换一个 key，重新等）。 */
export function TagLibraryMoreSentinel({
  label,
  onReach,
}: {
  label: string
  onReach: () => void
}) {
  const { setNode, isNearViewport } = useNearViewport('600px')
  useEffect(() => {
    if (isNearViewport) onReach()
  }, [isNearViewport, onReach])
  return (
    <div
      ref={setNode}
      role="status"
      aria-label={label}
      className="h-10 w-full"
    />
  )
}
