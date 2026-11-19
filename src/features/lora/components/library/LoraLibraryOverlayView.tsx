'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

import { Bookmark, LayoutGrid, SwatchBook, User } from '@/components/icons'
import { ROUTES } from '@/constants/routes'
import { LORA_LIBRARY_VIEW_PARAM } from '@/constants/studio-shell'
import { ASSISTANT_LIBRARY_SCREEN_LIMIT } from '@/types/assistant-operator'
import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { useStudioLibraryPick } from '@/contexts/studio-library-pick'
import { useCharacterLoras } from '@/features/cards/hooks'
import {
  useLibraryChanged,
  useLibraryShowRequest,
  useReportLibraryScreen,
} from '@/hooks/use-library-view'
import { useLoraAssets } from '@/features/lora/hooks/use-lora-assets'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  LibraryRail,
  LibraryRailRow,
  LibraryScopeSelect,
} from '@/components/ui/library-kit'

import { CharacterLorasProvider } from '../character-loras-context'
import { LoraStageProvider } from '../lora-stage-context'
import {
  LoraFavoritesBrowse,
  type FavoritesSection,
} from './LoraFavoritesBrowse'
import { LoraLibraryStage } from './LoraLibraryStage'
import { LoraLibraryScopeProvider } from './lora-library-scope-context'

/**
 * `/library/lora?view=favorites|trained|characters` = 页签「收藏 / 自训 / 角色」那一格；
 * 不写就是「全部 LoRA」（库）。手机桌面同一排页签。
 */
const VIEW_PARAM = LORA_LIBRARY_VIEW_PARAM
const SECTION_VIEWS: readonly FavoritesSection[] = [
  'favorites',
  'trained',
  'characters',
]
export type LoraLibraryView = 'library' | FavoritesSection

function isSectionView(value: string | null): value is FavoritesSection {
  return SECTION_VIEWS.some((view) => view === value)
}

const NO_STAGE = { base: null, baseLabel: null } as const

/** 助手按名字换格时晚这么久再换（见 `useLibraryShowRequest` 那一段）。 */
const LIBRARY_SHOW_SECTION_DELAY_MS = 300

/**
 * 库的四格（全部 · 收藏 · 自训 · 角色）各放什么：库整页与挑选框（`LoraPickerDialog`）共用，
 * ⛔ 各拼一遍。`onGoLibrary` 换到「全部」那一格（由宿主记在网址或自己手上）。
 */
export function useLoraLibrarySections(
  view: LoraLibraryView,
  onViewChange: (next: LoraLibraryView) => void,
) {
  const router = useRouter()
  const characterLoras = useCharacterLoras()
  const {
    trainedAssets,
    favoriteAssets,
    isLoadingMine,
    errorMine,
    refresh,
    setVisibility,
    favoriteExternalLora,
    favoriteCivitaiLora,
    unfavoriteByUrl,
    deleteAsset,
    isFavorited,
  } = useLoraAssets()
  const characterLoraCount = useMemo(
    () =>
      new Set(
        characterLoras.groups.flatMap((group) =>
          group.loras.map((lora) => lora.loraUrl),
        ),
      ).size,
    [characterLoras.groups],
  )

  const content =
    view === 'library' ? (
      <LoraLibraryStage
        onFavorite={favoriteCivitaiLora}
        onImport={favoriteExternalLora}
        onUnfavoriteByUrl={unfavoriteByUrl}
        isFavorited={isFavorited}
      />
    ) : (
      <LoraFavoritesBrowse
        key={view}
        section={view}
        characterGroups={characterLoras.groups}
        trained={trainedAssets}
        favorites={favoriteAssets}
        isLoading={isLoadingMine}
        error={errorMine}
        onRefresh={refresh}
        onUnfavoriteByUrl={unfavoriteByUrl}
        onFavoriteCivitai={favoriteCivitaiLora}
        onDelete={deleteAsset}
        onVisibilityChange={setVisibility}
        isFavorited={isFavorited}
        onGoLibrary={() => onViewChange('library')}
        onGoTrain={() =>
          router.push(
            `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.TRAIN}`,
          )
        }
      />
    )

  return {
    content,
    characterLoras,
    /** 各格里有哪几把（库整页报给助手「屏上那一页」、助手改了库时重读）。 */
    names: {
      favorites: favoriteAssets.map((asset) => asset.name),
      trained: trainedAssets.map((asset) => asset.name),
      characters: [
        ...new Set(
          characterLoras.groups.flatMap((group) =>
            group.loras.map((lora) => lora.name),
          ),
        ),
      ],
    },
    /** 收藏 / 自训那两份还在取（这时屏上那一页先不报，⛔ 让助手以为是空的）。 */
    loading: isLoadingMine,
    refresh: () => {
      void refresh()
      void characterLoras.refresh()
    },
    counts: {
      favorites: favoriteAssets.length,
      trained: trainedAssets.length,
      characters: characterLoraCount,
    },
  }
}

/** 库整页的分组药丸「全部 LoRA · 收藏 · 自训 · 角色」（ui-spec §9）。 */
export function LoraLibraryScopeSelect({
  view,
  onViewChange,
  counts,
}: {
  view: LoraLibraryView
  onViewChange: (next: LoraLibraryView) => void
  counts: { favorites: number; trained: number; characters: number }
}) {
  const t = useTranslations('LoraWorkbench')
  return (
    <LibraryScopeSelect
      label={t('libraryScopeLabel')}
      value={view}
      items={[
        {
          value: 'library',
          label: t('librarySectionAllLoras'),
          meta: t('librarySourceCivitai'),
        },
        {
          value: 'favorites',
          label: t('myLorasFavoritesSection'),
          meta: counts.favorites,
        },
        {
          value: 'trained',
          label: t('myLorasTrainedSection'),
          meta: counts.trained,
        },
        {
          value: 'characters',
          label: t('librarySectionCharacters'),
          meta: counts.characters,
        },
      ]}
      current={
        view === 'library' ? { label: t('librarySectionAllLoras') } : undefined
      }
      onChange={onViewChange}
    />
  )
}

/** 挑选框（`LoraPickerDialog`）的左栏「全部 · 收藏 · 自训 · 角色」（样件 S24）；库整页是分组药丸。 */
export function LoraLibrarySectionRail({
  view,
  onViewChange,
  counts,
  className,
}: {
  view: LoraLibraryView
  onViewChange: (next: LoraLibraryView) => void
  counts: { favorites: number; trained: number; characters: number }
  className?: string
}) {
  const t = useTranslations('LoraWorkbench')
  return (
    <LibraryRail label={t('tabsLabel')} className={className}>
      <LibraryRailRow
        icon={<LayoutGrid aria-hidden />}
        label={t('librarySectionAll')}
        trailing={t('librarySourceCivitai')}
        active={view === 'library'}
        onSelect={() => onViewChange('library')}
      />
      <LibraryRailRow
        icon={<Bookmark aria-hidden />}
        label={t('myLorasFavoritesSection')}
        trailing={counts.favorites}
        active={view === 'favorites'}
        onSelect={() => onViewChange('favorites')}
      />
      <LibraryRailRow
        icon={<SwatchBook aria-hidden />}
        label={t('myLorasTrainedSection')}
        trailing={counts.trained}
        active={view === 'trained'}
        onSelect={() => onViewChange('trained')}
      />
      <LibraryRailRow
        icon={<User aria-hidden />}
        label={t('librarySectionCharacters')}
        trailing={counts.characters}
        active={view === 'characters'}
        onSelect={() => onViewChange('characters')}
      />
    </LibraryRail>
  )
}

/**
 * 库叠层里的 LoRA 一类（第 9f 步 9f-2b）：原来住在 LoRA 台里的「库 / 收藏」两格搬到这里，
 * 叠在中间那一栏。挂上去进的是外壳上那份挂载栈 —— 右边 LoRA 台的装配列当场看见。
 *
 * LoRA 台开着时它登记了底模（`useRegisterLoraLibraryPick`），这里顶上就写「选给 LoRA 台」，
 * 详情页按那个底模判断装不装得上；没开台就只按 LoRA 自己的条件说。
 */
export function LoraLibraryOverlayView() {
  const tShell = useTranslations('StudioShell')
  const benchLabel = useTranslations('StudioTools')('tools.lora.label')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pick = useStudioLibraryPick().lora

  const rawView = searchParams.get(VIEW_PARAM)
  const view: LoraLibraryView = isSectionView(rawView) ? rawView : 'library'
  const setView = useCallback(
    (next: LoraLibraryView) => {
      // ⚠ 换格把库的筛选参数一起清掉：收藏那一格不认它们，回到库从默认开始。
      router.replace(
        next === 'library' ? pathname : `${pathname}?${VIEW_PARAM}=${next}`,
        { scroll: false },
      )
    },
    [pathname, router],
  )
  const { content, characterLoras, counts, names, loading, refresh } =
    useLoraLibrarySections(view, setView)
  // 屏上那一页（owner 10-28）：哪一格、那一格里有哪几把（Civitai 那一格的结果不在这里，助手用 find 查）。
  const sectionNames = view === 'library' ? [] : names[view]
  useReportLibraryScreen(
    view !== 'library' && loading
      ? null
      : {
          kind: 'lora',
          scope:
            view === 'library'
              ? 'the Civitai LoRA library (search it with find lora_library)'
              : `their ${view === 'trained' ? 'trained' : view === 'characters' ? 'character-linked' : 'favorite'} LoRAs`,
          total: sectionNames.length,
          visible: sectionNames.slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT),
        },
  )
  // 助手改了 LoRA 库（收藏 / 封面 / 关联角色）：收藏与角色那两份重读。
  useLibraryChanged('lora', refresh)
  // 助手翻给你看：切到那一格；点名的那一把在哪一格就切到哪一格。
  useLibraryShowRequest('lora', (show) => {
    const target = show.itemName?.toLowerCase()
    const holder = target
      ? (['favorites', 'trained', 'characters'] as const).find((section) =>
          names[section].some((name) => name.toLowerCase() === target),
        )
      : undefined
    const next = show.section ?? holder
    if (!next || next === view) return
    // ⚠ 等 Civitai 那一格挂载时那一次写网址落定再换格，⛔ 被它按旧网址盖回去。
    window.setTimeout(() => setView(next), LIBRARY_SHOW_SECTION_DELAY_MS)
  })

  // 「选给 LoRA 台」摆在工具行排序前（手机放不下，不写）。
  const pickTarget = pick ? (
    <p
      data-testid="library-pick-target"
      className="max-w-60 truncate text-2sm text-muted-foreground max-md:hidden"
    >
      {pick.baseLabel
        ? tShell('pickForBase', { bench: benchLabel, base: pick.baseLabel })
        : tShell('pickFor', { bench: benchLabel })}
    </p>
  ) : null

  return (
    <CharacterLorasProvider value={characterLoras}>
      <LoraStageProvider value={pick ?? NO_STAGE}>
        <LoraLibraryScopeProvider
          value={{
            scope: (
              <LoraLibraryScopeSelect
                view={view}
                onViewChange={setView}
                counts={counts}
              />
            ),
            note: pickTarget,
          }}
        >
          {/* 库骨架（ui-spec §9，样件 E S19）：手机桌面同一份 —— 一行工具行（分组药丸「全部 LoRA ·
              收藏 · 自训 · 角色」打头，各格自己画）+ 格子。 */}
          <div className="domain-lora lora-library @container flex h-full min-h-0 flex-col p-4 md:px-5.5 md:pb-0">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {content}
            </div>
          </div>
        </LoraLibraryScopeProvider>
      </LoraStageProvider>
    </CharacterLorasProvider>
  )
}
