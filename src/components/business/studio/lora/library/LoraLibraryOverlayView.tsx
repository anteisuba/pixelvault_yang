'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { useStudioLibraryPick } from '@/contexts/studio-library-pick'
import { useCharacterLoras } from '@/hooks/cards/use-character-loras'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import { usePathname, useRouter } from '@/i18n/navigation'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

import { CharacterLorasProvider } from '../character-loras-context'
import { LoraStageProvider } from '../lora-stage-context'
import { LoraFavoritesBrowse } from './LoraFavoritesBrowse'
import { LoraLibraryStage } from './LoraLibraryStage'

/** `/library/lora?view=favorites` = 收藏那一半；不写就是库。 */
const VIEW_PARAM = 'view'
const FAVORITES_VIEW = 'favorites'
type LoraLibraryView = 'library' | typeof FAVORITES_VIEW

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

  const view: LoraLibraryView =
    searchParams.get(VIEW_PARAM) === FAVORITES_VIEW ? FAVORITES_VIEW : 'library'
  const setView = useCallback(
    (next: LoraLibraryView) => {
      // ⚠ 换格把库的筛选参数一起清掉：收藏那一格不认它们，回到库从默认开始。
      router.replace(
        next === FAVORITES_VIEW
          ? `${pathname}?${VIEW_PARAM}=${FAVORITES_VIEW}`
          : pathname,
        { scroll: false },
      )
    },
    [pathname, router],
  )

  return (
    <CharacterLorasProvider value={characterLoras}>
      <LoraStageProvider value={pick ?? NO_STAGE}>
        <div className="domain-lora flex h-full min-h-0 flex-col gap-3 p-4">
          <div className="flex h-9 shrink-0 items-center gap-3">
            <LiquidSegmented
              ariaLabel={t('tabsLabel')}
              value={view}
              items={[
                { value: 'library', label: t('tabs.library') },
                { value: FAVORITES_VIEW, label: t('tabs.favorites') },
              ]}
              onChange={setView}
            />
            {pick ? (
              <p
                data-testid="library-pick-target"
                className="ml-auto truncate text-sm text-muted-foreground"
              >
                {pick.baseLabel
                  ? tShell('pickForBase', {
                      bench: benchLabel,
                      base: pick.baseLabel,
                    })
                  : tShell('pickFor', { bench: benchLabel })}
              </p>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {view === FAVORITES_VIEW ? (
              <LoraFavoritesBrowse
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
            ) : (
              <LoraLibraryStage
                onFavorite={favoriteCivitaiLora}
                onImport={favoriteExternalLora}
                onUnfavoriteByUrl={unfavoriteByUrl}
                isFavorited={isFavorited}
              />
            )}
          </div>
        </div>
      </LoraStageProvider>
    </CharacterLorasProvider>
  )
}
