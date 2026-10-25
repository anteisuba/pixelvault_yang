'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

import { Bookmark, LayoutGrid, SwatchBook, User } from '@/components/icons'
import { ROUTES } from '@/constants/routes'
import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { useStudioLibraryPick } from '@/contexts/studio-library-pick'
import { useCharacterLoras } from '@/hooks/cards/use-character-loras'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePathname, useRouter } from '@/i18n/navigation'
import { LibraryRail, LibraryRailRow } from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

import { CharacterLorasProvider } from '../character-loras-context'
import { LoraStageProvider } from '../lora-stage-context'
import {
  LoraFavoritesBrowse,
  type FavoritesSection,
} from './LoraFavoritesBrowse'
import { LoraLibraryStage } from './LoraLibraryStage'

/**
 * `/library/lora?view=favorites|trained|characters` = 左栏「收藏 / 自训 / 角色」那一格；
 * 不写就是「全部」（库）。手机只有「库 / 收藏」两格，收藏那格就是 `favorites`。
 */
const VIEW_PARAM = 'view'
const SECTION_VIEWS: readonly FavoritesSection[] = [
  'favorites',
  'trained',
  'characters',
]
type LoraLibraryView = 'library' | FavoritesSection

function isSectionView(value: string | null): value is FavoritesSection {
  return SECTION_VIEWS.some((view) => view === value)
}

const NO_STAGE = { base: null, baseLabel: null } as const

/**
 * 库叠层里的 LoRA 一类（第 9f 步 9f-2b）：原来住在 LoRA 台里的「库 / 收藏」两格搬到这里，
 * 叠在中间那一栏。挂上去进的是外壳上那份挂载栈 —— 右边 LoRA 台的装配列当场看见。
 *
 * LoRA 台开着时它登记了底模（`useRegisterLoraLibraryPick`），这里顶上就写「选给 LoRA 台」，
 * 详情页按那个底模判断装不装得上；没开台就只按 LoRA 自己的条件说。
 */
export function LoraLibraryOverlayView() {
  const t = useTranslations('LoraWorkbench')
  const tShell = useTranslations('StudioShell')
  const benchLabel = useTranslations('StudioTools')('tools.lora.label')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pick = useStudioLibraryPick().lora
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

  const isMobile = useIsMobile()
  const rawView = searchParams.get(VIEW_PARAM)
  const requested: LoraLibraryView = isSectionView(rawView)
    ? rawView
    : 'library'
  // 手机没有左栏：自训 / 角色落回收藏那一格（它里面没有再分格，只看收藏）。
  const view: LoraLibraryView =
    isMobile && requested !== 'library' ? 'favorites' : requested
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
  const characterLoraCount = useMemo(
    () =>
      new Set(
        characterLoras.groups.flatMap((group) =>
          group.loras.map((lora) => lora.loraUrl),
        ),
      ).size,
    [characterLoras.groups],
  )

  const pickTarget = pick ? (
    <p
      data-testid="library-pick-target"
      className="ml-auto truncate text-sm text-muted-foreground"
    >
      {pick.baseLabel
        ? tShell('pickForBase', { bench: benchLabel, base: pick.baseLabel })
        : tShell('pickFor', { bench: benchLabel })}
    </p>
  ) : null
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
        onGoLibrary={() => setView('library')}
        onGoTrain={() =>
          router.push(
            `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.TRAIN}`,
          )
        }
      />
    )

  return (
    <CharacterLorasProvider value={characterLoras}>
      <LoraStageProvider value={pick ?? NO_STAGE}>
        {isMobile ? (
          <div className="domain-lora flex h-full min-h-0 flex-col gap-3 p-4">
            <div className="flex h-9 shrink-0 items-center gap-3">
              <LiquidSegmented
                ariaLabel={t('tabsLabel')}
                value={view === 'library' ? 'library' : 'favorites'}
                items={[
                  { value: 'library', label: t('tabs.library') },
                  { value: 'favorites', label: t('tabs.favorites') },
                ]}
                onChange={setView}
              />
              {pickTarget}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{content}</div>
          </div>
        ) : (
          // 桌面 = 库骨架（ui-spec §9，样件 E S19）：左栏「全部 · 收藏 · 自训 · 角色」，右边那一格。
          <div className="domain-lora flex h-full min-h-0 gap-8 pt-3 pr-5.5">
            <LibraryRail label={t('tabsLabel')} className="pt-0.5">
              <LibraryRailRow
                icon={<LayoutGrid aria-hidden />}
                label={t('librarySectionAll')}
                trailing={t('librarySourceCivitai')}
                active={view === 'library'}
                onSelect={() => setView('library')}
              />
              <LibraryRailRow
                icon={<Bookmark aria-hidden />}
                label={t('myLorasFavoritesSection')}
                trailing={favoriteAssets.length}
                active={view === 'favorites'}
                onSelect={() => setView('favorites')}
              />
              <LibraryRailRow
                icon={<SwatchBook aria-hidden />}
                label={t('myLorasTrainedSection')}
                trailing={trainedAssets.length}
                active={view === 'trained'}
                onSelect={() => setView('trained')}
              />
              <LibraryRailRow
                icon={<User aria-hidden />}
                label={t('librarySectionCharacters')}
                trailing={characterLoraCount}
                active={view === 'characters'}
                onSelect={() => setView('characters')}
              />
            </LibraryRail>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {pick ? (
                <div className="flex shrink-0 pb-2">{pickTarget}</div>
              ) : null}
              {content}
            </div>
          </div>
        )}
      </LoraStageProvider>
    </CharacterLorasProvider>
  )
}
