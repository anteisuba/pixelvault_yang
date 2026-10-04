'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  GripVertical,
  Heart,
  ImageIcon,
  Key,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Bot,
  Wand2,
  X,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_MODEL_SEARCH_URL,
  DEFAULT_LORA_WORKBENCH_SECTION,
  LORA_CHIP_THUMBNAIL_WIDTH,
  LORA_GENERATE_ASPECT_RATIOS,
  LORA_MOBILE_RESULT_SCROLL_OPTIONS,
  LORA_MOBILE_RESULT_SCROLL_OPTIONS_REDUCED,
  LORA_RESULT_HISTORY_MAX,
  LORA_RUNNER_COLD_START_MINUTES,
  LORA_RUNNER_ETA_SECONDS,
  LORA_RUNNER_WARM_STORAGE_PREFIX,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  REDUCED_MOTION_MEDIA_QUERY,
  isLoraWorkbenchSection,
  type LoraWorkbenchSection,
} from '@/constants/lora'
import {
  getBaseOnlyGenerationBases,
  getCompatibleBases,
  getDefaultBaseOnlyGenerationBase,
  getDefaultBase,
  getLoraBaseArchitectureGroup,
  LORA_BASE_MODELS,
  type LoraBaseModel,
} from '@/constants/lora-base-models'
import { LORA_PROMPT_DIALECTS } from '@/constants/lora-prompt-dialects'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import {
  getRunnerCheckpointById,
  isRunnerNegativePromptInert,
} from '@/constants/runner-checkpoints'
import { RUNNER_SAMPLERS, RUNNER_SCHEDULERS } from '@/constants/runner-sampling'
import { STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR } from '@/constants/studio-assistant-operator'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { AspectRatio } from '@/constants/config'
import {
  AdvancedParamsSchema,
  RecipeLoraSetupSchema,
  RunnerSeedStringSchema,
  type AdvancedParams,
  type CivitaiImageRecipe,
  type CivitaiRecipeExtraLora,
  type LoraAssetRecord,
  type RecipeLoraSetup,
  type RecipeRecord,
} from '@/types'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { CommunitySourceBranch } from '@/components/business/studio/lora/library/LoraLibraryTabs'
import { LoraFavoritesBrowse } from '@/components/business/studio/lora/library/LoraFavoritesBrowse'
import { LoraLibraryStage } from '@/components/business/studio/lora/library/LoraLibraryStage'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import { useHuggingFaceLoraShowcase } from '@/hooks/use-huggingface-lora-showcase'
import { useRunnerUsage } from '@/hooks/prompts/use-runner-usage'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import { useIsMobile } from '@/hooks/use-mobile'
import { TrainWizard } from '@/components/business/studio/lora/training/TrainWizard'
import { LoraAssetCard } from '@/components/business/studio/lora/LoraAssetCard'
import { LoraAssemblyColumn } from '@/components/business/studio/lora/LoraAssemblyColumn'
import { LoraNegativeInertHint } from '@/components/business/studio/lora/LoraNegativeInertHint'
import { LoraParamsChip } from '@/components/business/studio/lora/LoraParamsChip'
import {
  LoraRecipeViewer,
  type LoraRecipeViewerOrigin,
} from '@/components/business/studio/lora/LoraRecipeViewer'
import { LoraResultStage } from '@/components/business/studio/lora/LoraResultStage'
import {
  LoraSourceBand,
  type LoraSourceBandMode,
} from '@/components/business/studio/lora/LoraSourceBand'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildSourceMatchedLoraPrompt } from '@/lib/lora-source-match-prompt'
import { getLoraAssetSourceUrl } from '@/lib/lora-asset-source-url'
import { resolveGeneratingStageKey } from '@/lib/generation-progress'
import {
  applyRecipePlanToAdvancedParams,
  buildCivitaiRecipeGenerationPlan,
} from '@/lib/civitai-recipe-to-generation'
import { resolveCivitaiLoraAPI } from '@/lib/api-client/lora-assets'
import {
  createRecipeFromGenerationAPI,
  getRecipeAPI,
} from '@/lib/api-client/recipes'
import {
  buildRecipeLoraSetup,
  readRecipeAspectRatio,
  readRecipeLoraSetup,
  readRecipeNegativePrompt,
  readRecipeRunnerParameters,
  templateLoraAssetFromUrl,
} from '@/lib/recipe-lora-setup'
import { getTagTemplateSource } from '@/lib/recipe-template-kind'
import { tagPromptTextForLoraBase } from '@/lib/tag-composer'
import {
  aggregateOftenMountedExtras,
  extraLoraKey,
  extraLoraLabel,
  mountRecipeExtraLoras,
  type ExtraMountStatus,
  type OftenMountedExtra,
  type RecipeExtraMountResult,
} from '@/lib/lora-recipe-extra-mount'
import {
  isLoraBaseModelMountCompatible,
  summarizeLoraStackCompatibility,
} from '@/lib/lora-model-compatibility'
import { toCivitaiModelSearchQuery } from '@/lib/civitai-lora-reference'
import { parseHuggingFaceLoraSourceUrl } from '@/lib/huggingface-lora-source'
import { LoraHuggingFaceShowcaseStrip } from '@/components/business/studio/prompt-tags/LoraHuggingFaceShowcaseStrip'
import { LoraSourceImagePreviewStrip } from '@/components/business/studio/prompt-tags/LoraSourceImagePreviewStrip'
import {
  LoraSourceRecipeStrip,
  type ApplyRecipeOptions,
} from '@/components/business/studio/prompt-tags/LoraSourceRecipeStrip'
import { PromptTagAutocomplete } from '@/components/business/studio/prompt-tags/PromptTagAutocomplete'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { StudioGeneratingProgress } from '@/components/business/studio-shared'
import { SpecChip } from '@/components/business/studio-shared/spec'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import type { SpecChipModel } from '@/lib/spec-chip-model'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getAvailableImageModels, resolveAdapterType } from '@/constants/models'
import {
  getCapabilityConfig,
  getMaxReferenceImages,
  type NumericRange,
} from '@/constants/provider-capabilities'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useImageUpload } from '@/hooks/use-image-upload'
import {
  toLoraOperatorResults,
  useLoraOperatorHost,
} from '@/hooks/use-lora-operator-host'
import { useLoraLibraryFilterSnapshot } from '@/hooks/use-civitai-lora-library-url'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { useStudioOperatorYield } from '@/hooks/use-studio-operator-yield'
import { requestOperatorAttachment } from '@/hooks/use-studio-operator-store'
import type { StudioOperatorResultOwner } from '@/types/studio-assistant-operator'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { LoraAspectRatioChip } from '@/components/business/studio/lora/LoraAspectRatioChip'
import { LoraBaseModelModal } from '@/components/business/studio/lora/LoraBaseModelModal'
import {
  LoraCollocationBar,
  LoraCollocationChip,
  LoraCollocationStatusBar,
} from '@/components/business/studio/lora/LoraCollocationStatusBar'
import { AssistantLoraParametersSchema } from '@/types/assistant-operator'
import { PromptTriggerHighlight } from '@/components/business/studio/lora/PromptTriggerHighlight'
import { LoraReferenceImageCards } from '@/components/business/studio/lora/LoraReferenceImageCards'
import { LoraStageProvider } from '@/components/business/studio/lora/lora-stage-context'
import { LoraScaleChip } from '@/components/business/studio/lora/LoraScaleChip'
import type { TriggerChipEntry } from '@/components/business/studio/lora/TriggerChipRow'
import {
  StudioChipLookProvider,
  studioOutlineChipClass,
  studioOutlineChipSetClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import {
  buildSavedModelOptionsForModels,
  getTranslatedModelLabel,
  mergeModelOptionsWithPreferredSavedRoutes,
  withProviderKeyCoverage,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/types/model-option'
import {
  civitaiDisplayImageUrl,
  proxyCivitaiImageUrl,
} from '@/lib/civitai-image-url'
import {
  appendPromptFragments,
  prependPromptFragments,
  promptHasFragments,
  removePromptFragments,
} from '@/lib/prompt-text-append'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { hasVerifiedLoraTrigger } from '@/lib/lora-trigger-clean'
import { compilePromptTags } from '@/lib/prompt-tag-compiler'
import { cn } from '@/lib/utils'

import '@/app/lora.css'

export function LoraWorkbench() {
  const t = useTranslations('LoraWorkbench')
  const [assistantOpen, setAssistantOpen] = useState(false)
  /**
   * 两套骨架按断点二选一（lora-generate.md §2 / §6）：≥1024 是生成台 B（顶上一行
   * + 舞台白卡 + 输入框白卡，与图片台同一副外壳）；<1024 仍是 09-03 的单卡形态
   * （卡内页头 + 结果流 + 输入条，装配在抽屉里）。
   */
  const isMobile = useIsMobile()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    trainedAssets,
    favoriteAssets,
    discoverAssets,
    isLoadingMine,
    errorMine,
    refresh,
    setVisibility,
    favoriteExternalLora,
    favoriteCivitaiLora,
    unfavoriteAsset,
    unfavoriteByUrl,
    deleteAsset,
    isFavorited,
  } = useLoraAssets()

  // 手机（<1024）的库：搜索框的 DOM 落点。搜索 state 仍留在各源 pane 的 hook
  // 里（civitai / HF 各一套），只把输入框 portal 进这个常驻槽，保住「这一格不随
  // 内层 crossfade 闪、只结果区淡入」。桌面是库 B（LoraLibraryStage），不走这里。
  const [librarySearchSlot, setLibrarySearchSlot] =
    useState<HTMLDivElement | null>(null)

  const sectionParam = searchParams.get(LORA_WORKBENCH_SEARCH_PARAM)
  const activeSection = isLoraWorkbenchSection(sectionParam)
    ? sectionParam
    : DEFAULT_LORA_WORKBENCH_SECTION

  const setActiveSection = useCallback(
    (nextSection: LoraWorkbenchSection) => {
      const params = new URLSearchParams(searchParams.toString())
      if (nextSection === DEFAULT_LORA_WORKBENCH_SECTION) {
        params.delete(LORA_WORKBENCH_SEARCH_PARAM)
      } else {
        params.set(LORA_WORKBENCH_SEARCH_PARAM, nextSection)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

  const handleTabChange = useCallback(
    (value: string) => {
      if (isLoraWorkbenchSection(value)) {
        setActiveSection(value)
      }
    },
    [setActiveSection],
  )

  /**
   * 桌面顶上那排液态分段：点下去**当场**就走，不等路由换完 —— 路由报回来之前先按
   * 点中的那一格画，报回来就以路由为准（与图片台写法切换同一写法）。
   */
  const [pendingSection, setPendingSection] =
    useState<LoraWorkbenchSection | null>(null)
  const [routedSection, setRoutedSection] = useState(activeSection)
  if (routedSection !== activeSection) {
    setRoutedSection(activeSection)
    setPendingSection(null)
  }

  // owner 2026-08-07：「我的」从库内的 公开/我的 segmented 提升为一等 tab（改名
  // 「收藏」），公开那半随之取消——库 tab 本身就是公开源，不必再给一个二选一。
  // 于是 section 与 tab 值一一对应，不再需要把 mine 折回 community。
  const tabValue = activeSection
  const isLibrary =
    activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ||
    activeSection === LORA_WORKBENCH_SECTIONS.MINE
  const isGenerate = activeSection === LORA_WORKBENCH_SECTIONS.GENERATE

  // D7⑦: 壳（tab 行）不动，body crossfade。四段（生成 / 库 / 收藏 / 训练）
  // 每次切换都整块 body 淡入。key 变化触发 React 重挂载 → animate-in fade
  // 播放；reduced-motion 由 globals.css 的全局 media 块降级为直切。
  const bodyKey = activeSection

  /**
   * 桌面助手展开时工作台让位（lora-generate.md §2.5，与图片台同一根弹簧）：
   * `studioOperatorYield` 由 Dock 驱动，这里只把它绑到地台的右内边距。
   * ⚠ 恒绑同一个 motion 值、在变换里取值 —— ⛔ 不在 style 上把它换成
   *   `undefined`（motion 的 style 从 motion 值换成静态值时不解绑）。
   */
  const operatorYield = useStudioOperatorYield()
  const groundPaddingRight = useTransform(operatorYield, (reserve) =>
    reserve > 0
      ? `max(var(--workbench-pad), ${reserve}px)`
      : 'var(--workbench-pad)',
  )

  const libraryBody = isLibrary ? (
    <section
      className={cn(
        'space-y-2',
        activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY &&
          'flex min-h-0 flex-1 flex-col',
      )}
    >
      {/* 手机的库：搜索框由 pane portal 进这一格（来源 / 排序 / 筛选在 pane 自己的
          筛选 sheet 里）。「收藏」没有这一格。 */}
      {activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ? (
        <div ref={setLibrarySearchSlot} className="min-w-0" />
      ) : null}

      {/* 公开↔我的：顶栏是壳保持不动，只让内层结果 crossfade。 */}
      <div
        key={activeSection}
        className={cn(
          'animate-in fade-in duration-200',
          activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY &&
            'flex min-h-0 flex-1 flex-col',
        )}
      >
        {activeSection === LORA_WORKBENCH_SECTIONS.MINE ? (
          <MyLoraBranch
            trained={trainedAssets}
            favorites={favoriteAssets}
            discoverAssets={discoverAssets}
            isLoading={isLoadingMine}
            error={errorMine}
            onRefresh={refresh}
            onSwitchSection={setActiveSection}
            onVisibilityChange={setVisibility}
            onUnfavorite={unfavoriteAsset}
            onDelete={deleteAsset}
            onFavoriteDiscover={favoriteCivitaiLora}
            isFavorited={isFavorited}
          />
        ) : (
          <CommunitySourceBranch
            onFavorite={favoriteCivitaiLora}
            onImport={favoriteExternalLora}
            onUnfavoriteByUrl={unfavoriteByUrl}
            isFavorited={isFavorited}
            searchSlotNode={librarySearchSlot}
          />
        )}
      </div>
    </section>
  ) : null

  const generateBranch = isGenerate ? (
    <GenerateBranch
      assistantOpen={assistantOpen}
      onAssistantOpenChange={setAssistantOpen}
      onOpenLibrary={() => setActiveSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)}
    />
  ) : null

  if (!isMobile) {
    return (
      <motion.div
        style={{ paddingRight: groundPaddingRight }}
        // ⚠ 顶上一行定高 `h-9`、行距 `gap-3`：助手面板按这两个数对齐舞台顶边
        //   （`STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR`），改这里必须改那边。
        className="domain-lora lora-locked-height flex w-full min-h-0 flex-col gap-3 overflow-hidden"
      >
        <div className="flex h-9 shrink-0 items-center gap-3.5">
          <h1 className="text-sm font-semibold text-muted-foreground">
            {t('pageTitle')}
          </h1>
          <LiquidSegmented
            ariaLabel={t('tabsLabel')}
            value={pendingSection ?? activeSection}
            items={[
              {
                value: LORA_WORKBENCH_SECTIONS.GENERATE,
                label: t('tabs.generate'),
              },
              {
                value: LORA_WORKBENCH_SECTIONS.COMMUNITY,
                label: t('tabs.library'),
              },
              {
                value: LORA_WORKBENCH_SECTIONS.MINE,
                label: t('tabs.favorites'),
              },
              {
                value: LORA_WORKBENCH_SECTIONS.TRAIN,
                label: t('tabs.train'),
              },
            ]}
            onChange={(section) => {
              setPendingSection(section)
              setActiveSection(section)
            }}
          />
        </div>
        {isGenerate || isLibrary ? (
          // 生成 ↔ 库 / 收藏 是同一副舞台（lora-library.md §2）：⛔ 不按 section 重挂，
          // 换场由 GenerateBranch 自己演（竖条 · 交叉淡 · 输入框收起）。
          <div className="flex min-h-0 flex-1 animate-in flex-col gap-3 fade-in duration-200">
            <GenerateBranch
              assistantOpen={assistantOpen}
              onAssistantOpenChange={setAssistantOpen}
              onOpenLibrary={() => {
                setPendingSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)
                setActiveSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)
              }}
              library={
                isLibrary
                  ? {
                      key: activeSection,
                      content:
                        activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ? (
                          <LoraLibraryStage
                            onFavorite={favoriteCivitaiLora}
                            onImport={favoriteExternalLora}
                            onUnfavoriteByUrl={unfavoriteByUrl}
                            isFavorited={isFavorited}
                          />
                        ) : (
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
                            onGoLibrary={() => {
                              setPendingSection(
                                LORA_WORKBENCH_SECTIONS.COMMUNITY,
                              )
                              setActiveSection(
                                LORA_WORKBENCH_SECTIONS.COMMUNITY,
                              )
                            }}
                            onGoTrain={() => {
                              setPendingSection(LORA_WORKBENCH_SECTIONS.TRAIN)
                              setActiveSection(LORA_WORKBENCH_SECTIONS.TRAIN)
                            }}
                          />
                        ),
                    }
                  : null
              }
              onReturnToGenerate={() => {
                setPendingSection(LORA_WORKBENCH_SECTIONS.GENERATE)
                setActiveSection(LORA_WORKBENCH_SECTIONS.GENERATE)
              }}
            />
          </div>
        ) : (
          <div
            key={bodyKey}
            className="workbench-card min-h-0 flex-1 animate-in fade-in duration-200"
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <TrainWizard />
            </div>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <div
      className={cn(
        // 手机（<1024，owner 2026-09-03 契约）：整页一张 workbench-card，卡内页头
        // tab 行 + 助手在顶。四个 tab 统一锁高——卡片始终撑满地台，内容区自己滚。
        // ⚠ 不能直接用 `h-dvh`：`/studio/lora` 在 <1024 上方还有一条 App 顶栏，
        // `.lora-locked-height`（lora.css）扣掉它。
        'domain-lora lora-locked-height flex w-full min-h-0 flex-col overflow-hidden',
      )}
    >
      <div className="lora-ground flex min-h-0 flex-1 flex-col">
        <div className="workbench-card lora-card flex min-w-0 flex-1 flex-col">
          <div className="lora-bar flex w-full shrink-0 items-center gap-2 border-b border-border">
            <Tabs value={tabValue} onValueChange={handleTabChange}>
              <TabsList variant="line" className="h-8">
                <TabsTrigger
                  value={LORA_WORKBENCH_SECTIONS.GENERATE}
                  className="px-3 text-sm"
                >
                  {t('tabs.generate')}
                </TabsTrigger>
                <TabsTrigger
                  value={LORA_WORKBENCH_SECTIONS.COMMUNITY}
                  className="px-3 text-sm"
                >
                  {t('tabs.library')}
                </TabsTrigger>
                <TabsTrigger
                  value={LORA_WORKBENCH_SECTIONS.MINE}
                  className="px-3 text-sm"
                >
                  {t('tabs.favorites')}
                </TabsTrigger>
                <TabsTrigger
                  value={LORA_WORKBENCH_SECTIONS.TRAIN}
                  className="px-3 text-sm"
                >
                  {t('tabs.train')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div
            key={bodyKey}
            className={cn(
              'min-h-0 flex-1 animate-in fade-in duration-200',
              isGenerate
                ? 'flex min-h-0 flex-col overflow-hidden'
                : activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY
                  ? 'flex flex-col overflow-hidden p-3'
                  : 'overflow-y-auto p-3',
            )}
          >
            {generateBranch}
            {libraryBody}
            {activeSection === LORA_WORKBENCH_SECTIONS.TRAIN ? (
              <TrainWizard />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 「Use LoRA」回放 `?aspectRatio=` 合法值——与 use-studio-replay-from-url.ts 的
 *  VALID_ASPECT_RATIOS 保持一致（两处状态形态不同，没法共用同一份实现）。 */
const REPLAY_ASPECT_RATIOS: readonly AspectRatio[] = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
]

/** D7③ + G3d: one entry in the session result filmstrip. `scale`/`seed` drive
 *  the corner label; `width`/`height`/`steps`/`sampler`/`cfg`/`baseName`/
 *  `loraName` are captured at generate-time for the result meta line (only
 *  what was actually sent — a blank Runner field stays null, never a guessed
 *  default). All may be null. */
interface LoraResultHistoryItem {
  id: string
  url: string
  scale: number | null
  seed: string | null
  width: number | null
  height: number | null
  steps: number | null
  sampler: string | null
  cfg: number | null
  baseName: string | null
  loraName: string | null
  /** 这一张出图那一刻的整套（「存成模板」存它，⛔ 读当前装配台 —— pages/prompts.md）。 */
  setup: RecipeLoraSetup | null
}

/** Preserve exact uint64 seeds in the filmstrip instead of rounding via Number. */
function normalizeRecordSeed(
  seed: bigint | string | number | null | undefined,
): string | null {
  if (seed == null) return null
  if (typeof seed === 'bigint') return seed.toString()
  if (typeof seed === 'number') {
    return Number.isFinite(seed) ? String(seed) : null
  }
  return seed.trim() || null
}

const RUNNER_DEFAULT_SELECT_VALUE = '__model_default__'

/**
 * 本次 Runner 出图是不是这个底模在本会话里的**第一次**（= worker 多半是冷的，
 * 要先把底模权重加载进 GPU）。读完就标记成已跑过——同一次点击里只调一次。
 *
 * 后端没有任何可用的 cold-start 信号（见 `LORA_RUNNER_WARM_STORAGE_PREFIX`
 * 的注），所以这里是纯客户端判据；sessionStorage 在无痕/禁用存储下会抛，
 * 抛了就按「不是首次」处理——宁可少提示一次，也不要让出图整条炸掉。
 */
function consumeRunnerColdStart(baseModelId: string): boolean {
  if (typeof window === 'undefined') return false
  const key = `${LORA_RUNNER_WARM_STORAGE_PREFIX}${baseModelId}`
  try {
    const warm = window.sessionStorage.getItem(key) === '1'
    window.sessionStorage.setItem(key, '1')
    return !warm
  } catch {
    return false
  }
}

function parseOptionalRunnerNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// 与 Worker 的默认尺寸同一张表：DiT 系（Anima · Z-Image）约 1MP，SDXL 系沿用通用尺寸。
function getRunnerPreviewDimensions(
  aspectRatio: AspectRatio,
  isDit: boolean,
): { width: number; height: number } {
  if (isDit) {
    switch (aspectRatio) {
      case '16:9':
        return { width: 1344, height: 768 }
      case '9:16':
        return { width: 768, height: 1344 }
      case '4:3':
        return { width: 1152, height: 864 }
      case '3:4':
        return { width: 864, height: 1152 }
      default:
        return { width: 1024, height: 1024 }
    }
  }
  switch (aspectRatio) {
    case '16:9':
      return { width: 1792, height: 1024 }
    case '9:16':
      return { width: 1024, height: 1792 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    default:
      return { width: 1024, height: 1024 }
  }
}

/**
 * 给定底模的 providerModelId，判断当前用户有没有可用的 key 路由（保存的 key）。
 * 纯函数——GenerateBranch 用它算当前选中底模的状态，
 * handleSelectBase 用它算"即将切换到的底模"的状态，避免两处各写一份。
 */
function resolveBaseKeySetup(
  modelId: string | null,
  modelOptions: StudioModelOption[],
): { needsKeySetup: boolean; workspaceOption?: StudioModelOption } {
  if (!modelId) return { needsKeySetup: false }
  const options = modelOptions.filter((option) => option.modelId === modelId)
  const hasUsableRoute = options.some(
    (option) =>
      option.sourceType === 'saved' ||
      // Comfy Runner has no BYOK path — it's always the platform's own
      // RUNPOD_KEY, resolved server-side. There's nothing to configure, so
      // it never needs the "add an API key" QuickSetupDialog.
      option.adapterType === AI_ADAPTER_TYPES.RUNNER,
  )
  return {
    needsKeySetup: !hasUsableRoute,
    workspaceOption:
      options.find((option) => option.sourceType === 'workspace') ?? options[0],
  }
}

// ── 生成分支（3b-ii-a 最小出图核心）──────────────────────────────────
// 脊柱条（当前 LoRA / 底模）+ ivory 提示词纸 + 出图：把脊柱条的 LoRA 注入
// advancedParams.loras、选中底模的 providerModelId 作 modelId、打
// sourceSurface=LORA_WORKBENCH，复用 useUnifiedGenerate 发图 → 落素材。
// recipe 源图/模式 + 暗房视觉为后续增量。
interface GenerateBranchProps {
  /** 助手面板开关——手机那颗按钮在卡内页头（root 持有状态），面板本体在这里。 */
  assistantOpen: boolean
  onAssistantOpenChange: (open: boolean) => void
  /**
   * 库 / 收藏（lora-library.md §2，只桌面）：给了就在同一张舞台卡里换成库 ——
   * 装配列让成竖条、来源图带与结果淡出、输入框收起；`key` 换了（库 ↔ 收藏）
   * 内容先淡出再淡入另一边的。⭐ 生成台不卸载：提示词、这一轮的图都还在。
   */
  library?: { key: string; content: ReactNode } | null
  /** 竖条顶上那颗「回到生成」。 */
  onReturnToGenerate?: () => void
  /**
   * 装配列「＋ 添加 LoRA」= 切到「库」（库 B 定案：⛔ 另开库弹窗）。手机切到库那一栏。
   */
  onOpenLibrary: () => void
}

function GenerateBranch({
  assistantOpen,
  onAssistantOpenChange,
  library = null,
  onReturnToGenerate,
  onOpenLibrary,
}: GenerateBranchProps) {
  const { user } = useUser()
  const t = useTranslations('LoraWorkbench')
  const tModels = useTranslations('Models')
  const router = useRouter()
  const pathname = usePathname()
  // 做同款 / 补挂额外 LoRA 的结果 toast（文案与旧 inline 配方面板共用）。
  const tExtra = useTranslations('LoraPromptControl.generate')
  // 输入框里的参考图条（与图片台同一套文案）。
  const tImageChip = useTranslations('ImageChip')
  const tImageUpload = useTranslations('ImageUpload')
  const stack = useActiveLoraStack()
  const {
    generate,
    isGenerating,
    lastGeneration,
    elapsedSeconds,
    error: generateError,
    activeRun,
    cancelRunItem,
  } = useUnifiedGenerate()
  const tStudioV3 = useTranslations('StudioV3')
  const tCancel = useTranslations('GenerationCancel')
  // LoRA 出图是单次无批次，`activeRun.items[0]` 即这次请求的 pending 项——
  // 有值时它的 `executionStage`（runner 冷启动排队 / GPU 出图中）压过按
  // 已用时长猜的阶段词，见 `resolveGeneratingStageKey`。
  const activeGenerateItem =
    activeRun?.mode === 'single' ? activeRun.items[0] : undefined
  const activeExecutionStage =
    activeGenerateItem && 'executionStage' in activeGenerateItem
      ? activeGenerateItem.executionStage
      : undefined
  const generatingStageLabel = tStudioV3(
    `generatingOverlayStages.${resolveGeneratingStageKey(
      elapsedSeconds,
      activeExecutionStage,
    )}` as const,
  )

  // 完成节拍：isGenerating→false 后把进度多留一拍，播 合拢→停→淡出
  // （docs/references/loading.md「出图」）。与 GenerationPreview 同款「渲染期调整
  // state」模式——响应 prop 变迁，非同步外部系统，不走 useEffect。
  // 线开始淡出那一刻（`completionReleased`）白纱同一拍撤掉，新图在底下显出。
  const [isCompletingGeneration, setIsCompletingGeneration] = useState(false)
  const [completionReleased, setCompletionReleased] = useState(false)
  const [prevIsGenerating, setPrevIsGenerating] = useState(isGenerating)
  if (isGenerating !== prevIsGenerating) {
    setPrevIsGenerating(isGenerating)
    if (prevIsGenerating && !isGenerating && lastGeneration && !generateError) {
      setIsCompletingGeneration(true)
      setCompletionReleased(false)
    }
  }
  const showGeneratingOverlay = isGenerating || isCompletingGeneration
  // 本轮是不是该底模在本会话的首次 Runner 出图（冷启动要先加载底模，明显更慢）。
  // 在点「出图」那一刻定下来并锁住整轮——否则提示会在生成中途自己变脸。
  const [isRunnerColdStart, setIsRunnerColdStart] = useState(false)
  // 「自己搭配」词库（docs/references/domains/lora.md）读写的就是
  // 这份共享的 prompt-tag stack——引擎（compiler/search/stack）本来就是
  // 全域共享的，只是此前唯一的宿主 UI（TagLibrary）被删了，这里是词库导入后
  // 第一个真正接上的消费端。
  const promptTags = usePromptTagStack()

  // Issue 2 (Hard Rule 8): 缺 key 时不禁用出图按钮，改路由到 QuickSetupDialog。
  // 不能借用 useImageModelOptions() —— 它内部调 useStudioForm()，而
  // /studio/lora 页面故意不挂 <StudioProvider>（QuickSetupDialog 的 JSDoc
  // 也是这么说的），会直接抛 "useStudioForm must be used within
  // <StudioProvider>"。这里只需要它的合并逻辑，不需要 selectedOptionId
  // 解析，所以直接复用底层的 buildSavedModelOptionsForModels /
  // mergeModelOptionsWithPreferredSavedRoutes，跳过 StudioForm 依赖。
  const { keys, healthMap } = useApiKeysContext()
  const imageModels = useMemo(() => getAvailableImageModels(), [])
  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = imageModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      sourceType: 'workspace',
    }))
    const activeKeys = keys.filter((k) => k.isActive)
    const saved = buildSavedModelOptionsForModels(activeKeys, imageModels)
    return withProviderKeyCoverage(
      mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap),
      activeKeys,
    )
  }, [healthMap, imageModels, keys])

  const loraFamily = stack.items[0]?.asset.baseModelFamily ?? null
  const baseOnlyBases = useMemo(() => getBaseOnlyGenerationBases(), [])
  const compatibleBases = useMemo(
    () => (loraFamily ? getCompatibleBases(loraFamily) : baseOnlyBases),
    [baseOnlyBases, loraFamily],
  )
  const defaultBase = loraFamily
    ? getDefaultBase(loraFamily)
    : getDefaultBaseOnlyGenerationBase()
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null)
  const selectedBase =
    compatibleBases.find((b) => b.id === selectedBaseId) ?? defaultBase

  // §4.1 兼容度圆点 / 警示行：判定/互斥逻辑抽成纯函数
  // summarizeLoraStackCompatibility（lib/lora-model-compatibility.ts），脱离
  // dropdown 的 compatibleBases 作用域单独可测——见该函数注释。
  const mountFamilies = useMemo(
    () => stack.items.map((it) => it.asset.baseModelFamily),
    [stack.items],
  )
  const { incompatibleCount, mutuallyExclusive: mountsMutuallyExclusive } =
    useMemo(
      () =>
        summarizeLoraStackCompatibility(
          mountFamilies,
          selectedBase?.family ?? null,
        ),
      [mountFamilies, selectedBase],
    )
  const suggestedBase =
    !mountsMutuallyExclusive && incompatibleCount > 0 && loraFamily
      ? getDefaultBase(loraFamily)
      : null
  // 不给假建议：只有推荐目标真的可用（非"即将"占位）才展示可点击的切换动作。
  const canSuggestBaseSwitch = suggestedBase?.available === true
  const suggestedBaseLabel =
    canSuggestBaseSwitch && suggestedBase
      ? suggestedBase.translationKey
        ? t(`spine.${suggestedBase.translationKey}`)
        : suggestedBase.displayName
      : null

  // 主动提示：选中底模时拉全站月度额度，让用户点前就知道「本月剩余 N/300」而不是
  // 撞上限才弹错。底模全是 Runner（09-17 托管通道退役）。
  const isRunnerBase = selectedBase != null
  const { usage: runnerUsage } = useRunnerUsage(isRunnerBase)

  const baseModelId = selectedBase?.providerModelId ?? null
  const { needsKeySetup, workspaceOption: workspaceOptionForBase } = useMemo(
    () => resolveBaseKeySetup(baseModelId, modelOptions),
    [baseModelId, modelOptions],
  )

  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    modelId: string
    modelLabel: string
    adapterType: AI_ADAPTER_TYPES
    optionId: string
  } | null>(null)

  const openKeySetupFor = useCallback(
    (option: StudioModelOption) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: getTranslatedModelLabel(tModels, option.modelId),
        adapterType: option.adapterType,
        optionId: option.optionId,
      })
    },
    [tModels],
  )

  // API key 配置入口挂在「选底模」这一步（用户反馈：不该挂在出图按钮上）：
  // 切换底模时立即检查新底模是否有可用 key 路由，没有就弹 QuickSetupDialog——
  // 这是用户自己触发的选择动作，不是无来由的自动弹窗。
  const handleSelectBase = useCallback(
    (id: string) => {
      setSelectedBaseId(id)
      const base = compatibleBases.find((b) => b.id === id)
      const { needsKeySetup: nextNeedsSetup, workspaceOption } =
        resolveBaseKeySetup(base?.providerModelId ?? null, modelOptions)
      if (nextNeedsSetup && workspaceOption) {
        openKeySetupFor(workspaceOption)
      }
    },
    [compatibleBases, modelOptions, openKeySetupFor],
  )

  // §4.1 警示行「切到 {建议底模}」动作——复用 handleSelectBase，切完底模后
  // incompatibleMounts 会随 selectedBase 重算，警示行自动消失。
  const handleSwitchToSuggestedBase = useCallback(() => {
    if (suggestedBase) handleSelectBase(suggestedBase.id)
  }, [suggestedBase, handleSelectBase])

  // 触发词写在正文里（owner 2026-09-28「直接放到提示词框那边」）：看得见的那份就是
  // 发出去的那份，⛔ 出图时不再往正文前面偷偷拼一遍 —— 看不见就会自己再写一次。
  const [prompt, setPrompt] = useState('')
  // §5 PromptTagAutocomplete 只拿 ref 挂监听，不拥有这两个 textarea 的 JSX
  // ——它们本来就长在下面的纸区里，改动面收在"加一个 ref 属性"。
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const negativePromptTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 挂载里带触发词的那几把（无触发词的不占位）。entries 直接从 stack.items 派生，
  // 挂载即现、卸载即删，不额外持久化。
  const triggerChipEntries = useMemo(
    () =>
      stack.items
        .map((item) => ({
          assetId: item.asset.id,
          enabled: item.enabled !== false,
          verified: hasVerifiedLoraTrigger(item.asset),
          name: item.asset.name,
          triggerWord: item.asset.triggerWord?.trim() ?? '',
        }))
        .filter((entry) => entry.triggerWord.length > 0),
    [stack.items],
  )
  // 生效中的挂载 → 它的触发词。
  const activeTriggers = useMemo(
    () =>
      new Map(
        triggerChipEntries
          .filter((entry) => entry.enabled)
          .map((entry) => [entry.assetId, entry] as const),
      ),
    [triggerChipEntries],
  )
  // 挂载变了的那一拍才动正文，别的时候正文完全归用户（删掉的触发词不会被写回来）：
  // - 挂上：作者认过的触发词写到正文开头（猜出来的留给输入框下面那颗「＋」）；
  // - 停用 / 卸下：从正文里拿掉；停用的记住它原来在不在正文里（`parked`），
  //   重新启用时照原样写回 —— 停用再启用 = 什么都没发生。
  // ⚠ 起点是空的：刷新后挂载栈读回来，也照样写进（空的）正文。
  // 按内容比（哪几把、开没开、触发词是什么），⛔ 按引用 —— 引用不稳时会每一拍都重跑。
  const triggerKey = triggerChipEntries
    .map(
      (entry) =>
        `${entry.assetId}:${entry.enabled ? 1 : 0}:${entry.verified ? 1 : 0}:${entry.triggerWord}`,
    )
    .join('|')
  const [triggerSync, setTriggerSync] = useState<{
    key: string
    entries: typeof triggerChipEntries
    parked: ReadonlySet<string>
  }>(() => ({ key: '', entries: [], parked: new Set() }))
  // 这一拍正在改正文：下面按正文算的那几样都还是旧的，别拿它们记状态。
  let triggerTextSyncing = false
  if (triggerSync.key !== triggerKey) {
    const before = new Map(
      triggerSync.entries.map((entry) => [entry.assetId, entry] as const),
    )
    const after = new Map(
      triggerChipEntries.map((entry) => [entry.assetId, entry] as const),
    )
    const parked = new Set(triggerSync.parked)
    let next = prompt
    for (const entry of triggerSync.entries) {
      if (!entry.enabled || after.get(entry.assetId)?.enabled) continue
      const inText = promptHasFragments(next, entry.triggerWord)
      if (inText) next = removePromptFragments(next, entry.triggerWord)
      if (inText && after.has(entry.assetId)) parked.add(entry.assetId)
    }
    for (const entry of triggerChipEntries) {
      const was = before.get(entry.assetId)
      if (!entry.enabled) {
        // 读回来 / 挂上时就是停用的：等它启用时按「挂上」对待。
        if (!was && entry.verified) parked.add(entry.assetId)
        continue
      }
      if (was?.enabled) continue
      if (was ? parked.has(entry.assetId) : entry.verified)
        next = prependPromptFragments(next, entry.triggerWord)
      parked.delete(entry.assetId)
    }
    for (const id of parked) if (!after.has(id)) parked.delete(id)
    setTriggerSync({ key: triggerKey, entries: triggerChipEntries, parked })
    if (next !== prompt) {
      setPrompt(next)
      triggerTextSyncing = true
    }
  }
  // 「不在正文里」的那几把（手机那排 chip 画成关着，桌面输入框上出一颗「＋」）。
  const disabledTriggerIds = useMemo(
    () =>
      new Set(
        triggerChipEntries
          .filter((entry) => !promptHasFragments(prompt, entry.triggerWord))
          .map((entry) => entry.assetId),
      ),
    [triggerChipEntries, prompt],
  )
  // 点一枚触发词 = 在正文里写进 / 拿掉它，⛔ 没有第二份「开关」状态。
  const handleToggleTriggerChip = useCallback(
    (assetId: string) => {
      const entry = triggerChipEntries.find((item) => item.assetId === assetId)
      if (!entry) return
      setPrompt((prev) =>
        promptHasFragments(prev, entry.triggerWord)
          ? removePromptFragments(prev, entry.triggerWord)
          : prependPromptFragments(prev, entry.triggerWord),
      )
    },
    [triggerChipEntries],
  )
  // 桌面输入框下面那一行「触发词 ＋词」：生效中、但正文里没有的那几把。
  const missingTriggers = useMemo(
    () =>
      [...activeTriggers.values()].filter((entry) =>
        disabledTriggerIds.has(entry.assetId),
      ),
    [activeTriggers, disabledTriggerIds],
  )
  // 那一行收起的那一拍还画着上一排字（只在换了哪几把时才记，打字不重记）。
  const [lastMissingTriggers, setLastMissingTriggers] = useState<
    typeof missingTriggers
  >([])
  if (
    !triggerTextSyncing &&
    missingTriggers.length > 0 &&
    missingTriggers.map((entry) => entry.assetId).join('|') !==
      lastMissingTriggers.map((entry) => entry.assetId).join('|')
  ) {
    setLastMissingTriggers(missingTriggers)
  }
  // 机器整段改写正文（做同款 · 还原 · 助手）时，原来就在正文里的触发词留着 ——
  // 缺哪段补回开头。⛔ 不补用户自己删掉的那些（它们本来就不在正文里）。
  const keepPromptTriggers = useCallback(
    (current: string, next: string) => {
      let out = next
      for (const entry of activeTriggers.values()) {
        if (
          promptHasFragments(current, entry.triggerWord) &&
          !promptHasFragments(out, entry.triggerWord)
        )
          out = prependPromptFragments(out, entry.triggerWord)
      }
      return out
    },
    [activeTriggers],
  )
  // CD④：正文里要高亮的触发词 = 生效中的挂载的那些。
  const triggerHighlightPhrases = useMemo(
    () =>
      [...activeTriggers.values()].flatMap((entry) =>
        entry.triggerWord.split(',').map((phrase) => ({
          phrase: phrase.trim(),
          ownerName: entry.name,
        })),
      ),
    [activeTriggers],
  )
  // 背板层不是 textarea，自己不会跟着滚：正文超出可视区时手动同步 scrollTop。
  // 直接改 DOM 而不是走 state——滚动每帧都触发，走 state 会把整棵树重渲染。
  const promptBackdropRef = useRef<HTMLDivElement>(null)
  const handlePromptScroll = useCallback(
    (event: React.UIEvent<HTMLTextAreaElement>) => {
      const backdrop = promptBackdropRef.current
      if (backdrop) backdrop.scrollTop = event.currentTarget.scrollTop
    },
    [],
  )

  // 忠实还原：用 LoRA 的推荐/源图匹配提示词一键填充 + 套用推荐 scale + 负向。
  const activeAsset = stack.items[0]?.asset ?? null
  const [negativePrompt, setNegativePrompt] = useState('')
  // 用户反馈：一键同款/忠实还原/URL 回放都会把负面 prompt 写进这个 state，
  // 但 composer 之前只有一个正向文本框——负面词悄悄生效但用户看不见、改不了。
  // 默认折叠，一旦有内容（无论是手动展开还是套用配方带出来的）就一直显示。
  const [negativePromptExpanded, setNegativePromptExpanded] = useState(false)

  // 输入框平时收薄（lora-generate §2.4，owner 2026-09-29 第二轮 A 的共用约定）：没在写字时
  // 提示词只露 2 行、负面收成一行预览、触发词行与「搭配」条收起；点进提示词 / 负面 /
  // 「搭配」长回，点输入框以外（chip 弹层与标签补全除外）、焦点离开或按出图就缩回。
  // 桌面才用（手机那套输入条不变）。
  const composerCardRef = useRef<HTMLDivElement>(null)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [promptClamped, setPromptClamped] = useState(false)
  const collapseComposer = useCallback(() => {
    setComposerExpanded(false)
    // 点开「负面」却没写：收回时一起合上（写了的收成一行预览）。
    setNegativePromptExpanded(false)
  }, [])
  const isInsideComposer = useCallback(
    (target: EventTarget | null) =>
      target instanceof Element &&
      (composerCardRef.current?.contains(target) === true ||
        target.closest(
          '[data-radix-popper-content-wrapper], [role="listbox"]',
        ) !== null),
    [],
  )
  useEffect(() => {
    if (!composerExpanded) return
    const onPointerDown = (event: PointerEvent) => {
      if (!isInsideComposer(event.target)) collapseComposer()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [collapseComposer, composerExpanded, isInsideComposer])
  // 收薄时回到开头两行；真的截断了才挂下沿渐隐（刚好两行不糊掉第二行）。按行高算
  // 两行的高度，⛔ 读 clientHeight —— 收回那 240 里它还在变。
  useLayoutEffect(() => {
    const el = promptTextareaRef.current
    if (!el || composerExpanded) {
      setPromptClamped(false)
      return
    }
    el.scrollTop = 0
    if (promptBackdropRef.current) promptBackdropRef.current.scrollTop = 0
    const style = getComputedStyle(el)
    const restHeight =
      2 * parseFloat(style.lineHeight) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom)
    setPromptClamped(el.scrollHeight > restHeight + 1)
  }, [composerExpanded, prompt])

  const handleRestore = useCallback(() => {
    if (!activeAsset) return
    const matched = buildSourceMatchedLoraPrompt(activeAsset)
    setPrompt((prev) => keepPromptTriggers(prev, matched.prompt))
    setNegativePrompt(matched.negativePrompt)
    stack.setScale(activeAsset.id, matched.scale)
  }, [activeAsset, keepPromptTriggers, stack])

  // B10 (D7④/§2①) 多挂载配方分组：来源图 strip 一次只展示一个挂载的源图集，
  // 上方分组 chips 切换（单挂时隐藏）。recipeGroupAsset = 当前被选中的分组，
  // 默认第一个挂载；指向已卸载的 LoRA 时回落到 items[0]。
  const [recipeGroupAssetId, setRecipeGroupAssetId] = useState<string | null>(
    null,
  )
  const recipeGroupAsset =
    stack.items.find((it) => it.asset.id === recipeGroupAssetId)?.asset ??
    activeAsset

  // 源图配方：按当前分组 LoRA 的 Civitai provenance 取源图，点某张「一键同款」。
  const mined = useCivitaiMinedPrompts(
    recipeGroupAsset
      ? {
          modelId: recipeGroupAsset.modelId,
          modelVersionId: recipeGroupAsset.modelVersionId,
          fileHashAutoV3: recipeGroupAsset.fileHashAutoV3,
        }
      : null,
  )
  // §4.2「常与它同挂」：聚合当前分组全部来源图配方的 extraLoras 共现计数，
  // 零新后端——数据源与来源图 strip 的「叠加 N 个其他 LoRA」是同一份。
  const oftenMountedExtras = useMemo(
    () => aggregateOftenMountedExtras(mined.recipes),
    [mined.recipes],
  )
  // H1 生成侧「样例参考」（lora-workbench.md §13）：当前分组挂载是不是 HF
  // 资产，用 provider 判定（收藏/导入时写死的字段，比正则嗅探 loraUrl 更
  // 可靠）；是的话再从 loraUrl（HF resolve 直链）反解析 repoId/revision。
  // useMemo 稳住对象引用——同一挂载重渲染不应该让下面的懒取 effect 重新
  // 判断依赖变化。civitai 挂载 / 未挂载 LoRA 时 hfSource=null，hook 直接
  // 空转不发请求。
  const hfSource = useMemo(
    () =>
      recipeGroupAsset?.provider === 'huggingface'
        ? parseHuggingFaceLoraSourceUrl(recipeGroupAsset.loraUrl)
        : null,
    [recipeGroupAsset],
  )
  const hfShowcase = useHuggingFaceLoraShowcase(hfSource)
  const recipeGroupKey = recipeGroupAsset?.id ?? null
  // G3b：来源图缩略带点开即进共享 modal，主台不再有内联配方面板——原先的
  // selectedImageUrl / 默认选中第一张来源图都随内联面板退役。做同款的 seed
  // 策略（用原图 seed）由共享 modal 内的勾选自持（G3b-seed），不再父级托管。
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  // 出图卡新生成那一行参数 — "{elapsed}s · {底模名} · {比例}"（加载态 A）。
  const generatingParamsLine = selectedBase?.displayName
    ? `${Math.floor(elapsedSeconds)}s · ${selectedBase.displayName} · ${aspectRatio}`
    : undefined
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [runnerSeed, setRunnerSeed] = useState('')
  const [runnerSteps, setRunnerSteps] = useState('')
  const [runnerCfg, setRunnerCfg] = useState('')
  const [runnerSampler, setRunnerSampler] = useState('')
  const [runnerScheduler, setRunnerScheduler] = useState('')
  const [runnerWidth, setRunnerWidth] = useState('')
  const [runnerHeight, setRunnerHeight] = useState('')
  const [runnerUpscaler, setRunnerUpscaler] = useState<
    'none' | '4x-AnimeSharp'
  >('none')
  // G3b-2b 搭配状态条：appliedRecipe 除了给生成携带高级参数（params），还兼作
  // 「已应用来源配方」的状态源——加 assetName（摘要显示）、appliedParamLabels
  // （展开列出的配方参数名）、snapshot（做同款前的输入快照，撤销回滚用）。
  const [appliedRecipe, setAppliedRecipe] = useState<{
    groupAssetId: string
    assetName: string
    recipe: CivitaiImageRecipe
    params: AdvancedParams
    includeSeed: boolean
    extraLoras: readonly CivitaiRecipeExtraLora[]
    appliedParamLabels: readonly string[]
    snapshot: {
      prompt: string
      negativePrompt: string
      negativePromptExpanded: boolean
      aspectRatio: AspectRatio
      seed: number | undefined
      runnerSeed: string
      runnerSteps: string
      runnerCfg: string
      runnerSampler: string
      runnerScheduler: string
      runnerWidth: string
      runnerHeight: string
      scale: number | undefined
      selectedBaseId: string | null
    }
  } | null>(null)
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false)

  // 精确宽高单独一份：它的错说在「比例」弹层里（尺寸在那儿改），其余参数的错说在
  // 「参数」弹层里；出图键只看合起来那一份。
  const runnerDimensionError = useMemo(() => {
    if (!isRunnerBase) return null
    const hasWidth = runnerWidth.trim().length > 0
    const hasHeight = runnerHeight.trim().length > 0
    if (hasWidth !== hasHeight) {
      return t('generate.advanced.dimensionPairError')
    }
    if (hasWidth && hasHeight) {
      const width = parseOptionalRunnerNumber(runnerWidth)
      const height = parseOptionalRunnerNumber(runnerHeight)
      const max = selectedBase?.family === 'anima-dit' ? 1536 : 2048
      const isValidDimension = (value: number | undefined) =>
        value !== undefined &&
        Number.isInteger(value) &&
        value >= 512 &&
        value <= max &&
        value % 8 === 0
      if (!isValidDimension(width) || !isValidDimension(height)) {
        return t('generate.advanced.dimensionError', { max })
      }
    }
    return null
  }, [isRunnerBase, runnerHeight, runnerWidth, selectedBase?.family, t])

  const runnerSamplingError = useMemo(() => {
    if (!isRunnerBase) return null
    if (
      runnerSeed.trim() &&
      !RunnerSeedStringSchema.safeParse(runnerSeed.trim()).success
    ) {
      return t('generate.advanced.seedError')
    }
    const steps = parseOptionalRunnerNumber(runnerSteps)
    if (
      runnerSteps.trim() &&
      !AdvancedParamsSchema.shape.steps.safeParse(steps).success
    ) {
      return t('generate.advanced.stepsError')
    }
    const cfg = parseOptionalRunnerNumber(runnerCfg)
    if (
      runnerCfg.trim() &&
      !AdvancedParamsSchema.shape.guidanceScale.safeParse(cfg).success
    ) {
      return t('generate.advanced.cfgError')
    }
    return null
  }, [isRunnerBase, runnerCfg, runnerSeed, runnerSteps, t])

  const runnerParameterError = runnerSamplingError ?? runnerDimensionError

  const advancedCustomCount = [
    runnerSeed,
    runnerSteps,
    runnerCfg,
    runnerSampler,
    runnerScheduler,
    runnerWidth && runnerHeight ? 'size' : '',
    runnerUpscaler === '4x-AnimeSharp' ? runnerUpscaler : '',
  ].filter(Boolean).length

  const previewDimensions = useMemo(() => {
    const exactWidth = parseOptionalRunnerNumber(runnerWidth)
    const exactHeight = parseOptionalRunnerNumber(runnerHeight)
    if (exactWidth && exactHeight && !runnerParameterError) {
      return { width: exactWidth, height: exactHeight }
    }
    return getRunnerPreviewDimensions(
      aspectRatio,
      selectedBase != null &&
        getLoraBaseArchitectureGroup(selectedBase.family) === 'dit',
    )
  }, [
    aspectRatio,
    runnerHeight,
    runnerParameterError,
    runnerWidth,
    selectedBase?.family,
  ])
  const upscaleFinalWidth = previewDimensions.width * 4
  const upscaleFinalHeight = previewDimensions.height * 4
  const upscaleOutputIsLarge =
    upscaleFinalWidth > 6144 || upscaleFinalHeight > 6144

  // CFG 恰好是 1 的底模（Anima Turbo 一类）负面词不起作用：负面那行收起、chip 让开，
  // 写的内容留着，CFG 调上去或换回来原样还在（④ 画板 N1–N3）。出图也不带它。
  const negativeInert =
    selectedBase != null &&
    isRunnerNegativePromptInert(
      selectedBase.runnerCheckpointId,
      parseOptionalRunnerNumber(runnerCfg),
    )
  // 底模自带的出图默认（清单写了才有）；来源图底模那一档的实际默认看来源图，不写。
  const baseSamplingDefaults = useMemo(() => {
    if (!selectedBase || selectedBase.recipeCheckpointMode === 'source')
      return null
    const checkpoint = getRunnerCheckpointById(selectedBase.runnerCheckpointId)
    if (checkpoint?.recommendedSteps == null) return null
    return {
      sampler: checkpoint.recommendedSampler,
      steps: checkpoint.recommendedSteps,
      cfg: checkpoint.recommendedCfg,
    }
  }, [selectedBase])

  // CD 装配栏参数行：摘要当前生效值（尺寸恒有——来自比例/自定义宽高；步数/CFG/
  // 采样器只在用户设过时才进，缺省走底模默认不显示）。全真值，不编造。
  const runnerSummaryLine = isRunnerBase
    ? [
        `${previewDimensions.width}×${previewDimensions.height}`,
        runnerSteps.trim() ? `Steps ${runnerSteps.trim()}` : null,
        runnerCfg.trim() ? `CFG ${runnerCfg.trim()}` : null,
        runnerSampler.trim() || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  // ── B10 (D7③) 结果历史 filmstrip ─────────────────────────────────────
  // 会话级缩略条：每次出图成功后 prepend（新→旧），FIFO 上限
  // LORA_RESULT_HISTORY_MAX。scale/seed 从「本次请求 + 返回的 GenerationRecord」
  // 就地捕获（record.seed 是 provider 真实种子，random 请求也能回读）。选中项
  // 覆盖主图显示；刷新即清空（正片长期归档在素材库/画廊）。
  const [resultHistory, setResultHistory] = useState<LoraResultHistoryItem[]>(
    [],
  )
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)

  // ── B9 (D6) 参考图 img2img ────────────────────────────────────────────
  // imageUpload 在 GenerateBranch own（不是各 chip 各持一份），这样
  // handleGenerate 能读到启用的参考图 URL；chip 是否渲染 / 上限全由底模
  // 能力位数据驱动（FLUX_LORA maxReferenceImages=1；不支持的底模为 0）。
  const imageUpload = useImageUpload({
    scopeKey: JSON.stringify([user?.id ?? null, 'lora']),
  })
  // 输入框里那排参考图收起的那一拍还画着上一排（开合成对，与「触发词 ＋词」同一套）。
  // 按内容记（换了哪几张才记），⛔ 按引用 —— 引用不稳时会每一拍都重记。
  const referenceKey = imageUpload.referenceEntries
    .map((entry) => entry.url)
    .join('\n')
  const [lastReferences, setLastReferences] = useState({
    key: '',
    entries: imageUpload.referenceEntries,
  })
  const referenceOwner = useRef(user?.id ?? null)
  const clearReferences = imageUpload.clearAllImages
  useLayoutEffect(() => {
    const owner = user?.id ?? null
    if (referenceOwner.current === owner) return
    referenceOwner.current = owner
    clearReferences()
    setLastReferences({ key: '', entries: [] })
  }, [clearReferences, user?.id])
  if (
    imageUpload.referenceEntries.length > 0 &&
    referenceKey !== lastReferences.key
  ) {
    setLastReferences({
      key: referenceKey,
      entries: imageUpload.referenceEntries,
    })
  }
  const referenceAdapter = baseModelId ? resolveAdapterType(baseModelId) : null
  // Base-model capability config drives the paper's reference-image chip (B9)
  // and the spine-bar scale popover (B10 D7②) — resolve it once per base.
  const baseCapability = useMemo(
    () =>
      referenceAdapter && baseModelId
        ? getCapabilityConfig(referenceAdapter, baseModelId)
        : null,
    [referenceAdapter, baseModelId],
  )
  const maxReferenceImages =
    referenceAdapter && baseModelId
      ? getMaxReferenceImages(referenceAdapter, baseModelId)
      : 0
  const referenceStrengthConfig = baseCapability?.referenceStrength
  const loraScaleConfig = baseCapability?.loraScale
  // 挂载数量不设上限（owner 2026-08-07）——三个后端都不限，见 use-active-lora-stack
  // 里 MAX_STACK 退役处的依据。做同款的补挂因此也不传 maxStack（默认无上限）。
  const [referenceStrength, setReferenceStrength] = useState(
    referenceStrengthConfig?.default ?? 0.7,
  )
  // 底模切换时把上限同步给 useImageUpload——切到 maxRef=0 的底模，已传条目
  // 标 disabled 但不删；切回自动恢复（§3.5）。setMaxImages 稳定且无变化时
  // 自动 bail，安全放进 effect。
  const setMaxReferenceImages = imageUpload.setMaxImages
  useEffect(() => {
    setMaxReferenceImages(maxReferenceImages)
  }, [setMaxReferenceImages, maxReferenceImages])

  // 「Use LoRA」回放：网关卡片的「Use LoRA」按钮跳到
  // /studio/lora?prompt=&seed=&negativePrompt=&aspectRatio=（不再跳
  // /studio/image）。只挂载时应用一次，避免覆盖用户后续编辑——和 Image
  // Studio 的 useStudioReplayFromUrl 同一套约定；这里状态是本地
  // useState 而非 StudioFormContext dispatch，形态不同没法直接复用那个
  // hook，就地写一份等量的解析逻辑。
  const replaySearchParams = useSearchParams()
  const hasAppliedReplayRef = useRef(false)
  useEffect(() => {
    if (hasAppliedReplayRef.current) return
    const promptParam = replaySearchParams.get('prompt')
    const seedParam = replaySearchParams.get('seed')
    const negativePromptParam = replaySearchParams.get('negativePrompt')
    const aspectRatioParam = replaySearchParams.get('aspectRatio')
    const hasAnyReplayParam =
      promptParam || seedParam || negativePromptParam || aspectRatioParam
    if (!hasAnyReplayParam) return
    hasAppliedReplayRef.current = true
    // 一次性从 URL 回放参数灌进本地 state——ref 守卫保证只跑一次，不会级联
    // 覆盖用户后续编辑；QuickSetupDialog.tsx 里也是同一个理由禁用这条规则。

    if (promptParam && promptParam.trim()) setPrompt(promptParam)
    if (negativePromptParam && negativePromptParam.trim()) {
      setNegativePrompt(negativePromptParam)
    }
    if (
      aspectRatioParam &&
      REPLAY_ASPECT_RATIOS.includes(aspectRatioParam as AspectRatio)
    ) {
      setAspectRatio(aspectRatioParam as AspectRatio)
    }
    if (seedParam && /^-?\d+$/.test(seedParam)) {
      setSeed(Number(seedParam))
    }
  }, [replaySearchParams])

  // 提示词页「使用」一个 LoRA 模板 → `?template=<id>`（pages/prompts.md）：底模 · 挂载 ·
  // 权重 · 参数 · 提示词 · 负面原样装好，⛔ 不出图、⛔ 不带种子（回到随机）。挂载栈
  // 整个换掉，触发词的增删交给上面那段同步：旧的那几把从正文里拿掉，新的缺哪段补回
  // 开头，已经在模板正文里的不重写。
  // 标签台存的与提示词页新建的只换提示词和负面：挂载、底模、参数都不动，正文里原有
  // 的触发词留着；加过权重的标签按当前底模的写法落。
  const baseFamily = selectedBase?.family ?? null
  const applyLoraTemplate = useCallback(
    (recipe: RecipeRecord) => {
      if (getTagTemplateSource(recipe) !== 'lora') {
        // 还没有底模（挂的 LoRA 家族没有可用底模）：认不认括号不知道，先去掉权重。
        const weighted = baseFamily
          ? LORA_PROMPT_DIALECTS[baseFamily].weightedParens
          : false
        const tags = tagPromptTextForLoraBase(recipe.compiledPrompt, weighted)
        const negative = tagPromptTextForLoraBase(
          readRecipeNegativePrompt(recipe),
          weighted,
        )
        setAppliedRecipe(null)
        setPrompt((current) => keepPromptTriggers(current, tags))
        setNegativePrompt(negative)
        setNegativePromptExpanded(negative.length > 0)
        return
      }
      const read = readRecipeLoraSetup(recipe.params)
      const base =
        LORA_BASE_MODELS.find((entry) => entry.id === read?.baseId) ??
        LORA_BASE_MODELS.find(
          (entry) =>
            entry.providerModelId === recipe.modelId && entry.available,
        ) ??
        LORA_BASE_MODELS.find(
          (entry) => entry.providerModelId === recipe.modelId,
        ) ??
        null
      stack.clear()
      for (const item of read?.items ?? []) {
        stack.push(
          item.asset ??
            templateLoraAssetFromUrl({
              url: item.url,
              scale: item.scale,
              name: null,
              baseModelFamily: base?.family ?? 'unknown',
            }),
          item.scale,
        )
      }
      if (base) setSelectedBaseId(base.id)
      setAppliedRecipe(null)
      setPrompt(recipe.compiledPrompt)
      const negative = recipe.negativePrompt?.trim() ?? ''
      setNegativePrompt(negative)
      setNegativePromptExpanded(negative.length > 0)
      const ratio = readRecipeAspectRatio(recipe.params)
      if (ratio && REPLAY_ASPECT_RATIOS.includes(ratio as AspectRatio)) {
        setAspectRatio(ratio as AspectRatio)
      }
      const parameters = readRecipeRunnerParameters(recipe.params)
      setRunnerSteps(parameters.steps == null ? '' : String(parameters.steps))
      setRunnerCfg(
        parameters.guidanceScale == null
          ? ''
          : String(parameters.guidanceScale),
      )
      setRunnerSampler(parameters.runnerSampler ?? '')
      setRunnerScheduler(parameters.runnerScheduler ?? '')
      setRunnerWidth(
        parameters.runnerWidth == null ? '' : String(parameters.runnerWidth),
      )
      setRunnerHeight(
        parameters.runnerHeight == null ? '' : String(parameters.runnerHeight),
      )
      setRunnerUpscaler(parameters.runnerUpscaler ?? 'none')
      setRunnerSeed('')
      setSeed(undefined)
    },
    [baseFamily, keepPromptTriggers, stack],
  )
  const templateParam = replaySearchParams.get('template')
  const appliedTemplateRef = useRef<string | null>(null)
  useEffect(() => {
    if (!templateParam || appliedTemplateRef.current === templateParam) return
    appliedTemplateRef.current = templateParam
    void getRecipeAPI(templateParam).then((response) => {
      // 装一次就把 `?template=` 拿掉：刷新不再重装一遍、盖掉后来的改动。
      const query = new URLSearchParams(replaySearchParams.toString())
      query.delete('template')
      const rest = query.toString()
      router.replace(rest ? `${pathname}?${rest}` : pathname, {
        scroll: false,
      })
      if (response.success && response.data) applyLoraTemplate(response.data)
      else toast.error(t('generate.templateLoadFailed'))
    })
  }, [
    applyLoraTemplate,
    pathname,
    replaySearchParams,
    router,
    t,
    templateParam,
  ])

  // 一键补挂配方里叠加的其他 LoRA：解析（本地库→Civitai）→ push 进挂载栈，
  // 状态（loading/mounted/failed）回写驱动「常与它同挂」行内反馈 + toast。
  // 「做同款」与行内「补挂」按钮共用这一份（owner 2026-07-20：做同款要把额外
  // LoRA 一起挂上，才是真还原）。baseModelFamily 用当前主 LoRA 的家族做解析
  // 提示，挑对底模变体；架构不兼容的额外 LoRA 会被兼容闸拦下不挂。
  const extraMountsPending = useRef(0)
  const [isMountingExtras, setIsMountingExtras] = useState(false)
  const [extraMountStatusByKey, setExtraMountStatusByKey] = useState<
    Record<string, ExtraMountStatus>
  >({})
  const [extraMountedIdsByKey, setExtraMountedIdsByKey] = useState<
    Record<string, string | undefined>
  >({})
  const reportExtraMountResult = useCallback(
    (result: RecipeExtraMountResult) => {
      if (result.newlyMounted > 0) {
        toast.success(
          tExtra('recipeExtraAutoMounted', { count: result.newlyMounted }),
        )
      }
      // overCapacity 恒为 0：挂载不设上限，mountExtras 不传 maxStack。留在算式里
      // 是为了「哪天想给做同款加个软上限」时只改传参那一行，这里不用再动。
      const unresolved =
        result.missing + result.incompatible + result.overCapacity
      if (unresolved > 0) {
        // 「为什么没挂上」要说清——补救动作不一样：架构不兼容要换底模，定位不到
        // 只能去 Civitai 找。以前两种都只报一句「仍有 N 个未挂载」，做同款看上去
        // 就像凭空把多挂载弄坏了。
        toast.warning(
          tExtra('recipeExtraApplyLimited', { count: unresolved }),
          result.incompatible > 0
            ? { description: tExtra('recipeExtraIncompatible') }
            : undefined,
        )
      }
    },
    [tExtra],
  )
  const mountExtras = useCallback(
    async (extras: readonly CivitaiRecipeExtraLora[], base = selectedBase) => {
      if (extras.length === 0) return
      extraMountsPending.current += 1
      setIsMountingExtras(true)
      try {
        const result = await mountRecipeExtraLoras({
          extras,
          stackItems: stack.items,
          baseModelFamily: loraFamily,
          resolveLora: resolveCivitaiLoraAPI,
          pushLora: stack.push,
          setLoraScale: stack.setScale,
          setLoraEnabled: stack.setEnabled,
          setStatus: (key, status, assetId) => {
            setExtraMountStatusByKey((prev) => ({ ...prev, [key]: status }))
            setExtraMountedIdsByKey((prev) => ({ ...prev, [key]: assetId }))
          },
          isBaseCompatible: base
            ? (fam) => isLoraBaseModelMountCompatible(fam, base.family)
            : undefined,
        })
        reportExtraMountResult(result)
      } finally {
        extraMountsPending.current -= 1
        setIsMountingExtras(extraMountsPending.current > 0)
      }
    },
    [stack, loraFamily, selectedBase, reportExtraMountResult],
  )

  // CD③ 搭配审阅：做同款把值直接写进主台（不改），但标成「待审阅」并自动摊开
  // 变更卡；用户点「应用」才转成「已应用」，点「撤销」整批回滚。展开态提到这
  // 一层，因为落台那一刻要能替用户把卡摊开。
  const [collocationPending, setCollocationPending] = useState(false)
  const [collocationExpanded, setCollocationExpanded] = useState(false)
  const handleApplyPendingCollocation = useCallback(() => {
    setCollocationPending(false)
    setCollocationExpanded(false)
  }, [])

  const handleApplyRecipe = useCallback(
    (recipe: CivitaiImageRecipe, options: ApplyRecipeOptions) => {
      if (extraMountsPending.current > 0) return
      const recipeBase =
        (recipe.checkpointVersionId ||
          recipe.checkpointHash ||
          recipe.checkpoint) &&
        recipeGroupAsset
          ? (getCompatibleBases(recipeGroupAsset.baseModelFamily).find(
              (base) => base.available && base.recipeCheckpointMode !== 'fixed',
            ) ?? selectedBase)
          : selectedBase
      const plan = buildCivitaiRecipeGenerationPlan(recipe)
      const params = applyRecipePlanToAdvancedParams(undefined, plan, options)
      // G3b-2b：应用前快照当前输入（+ 该分组当前 scale），撤销时整批回滚。
      // 直接读闭包内的输入 state（在任何 set* 之前）——输入 vars 已进 deps，
      // 每次输入变更都会重建本 callback，闭包里就是最新值。
      const prevScale = recipeGroupAsset
        ? stack.items.find((entry) => entry.asset.id === recipeGroupAsset.id)
            ?.scale
        : undefined
      const snapshot = {
        prompt,
        negativePrompt,
        negativePromptExpanded,
        aspectRatio,
        seed,
        runnerSeed,
        runnerSteps,
        runnerCfg,
        runnerSampler,
        runnerScheduler,
        runnerWidth,
        runnerHeight,
        scale: prevScale,
        selectedBaseId,
      }
      // 配方文本原样写进正文；原来就在正文里的触发词留着（配方里写成
      // `aemeath \(wuwa\)` 也认得出，不会再写一遍）。
      setPrompt((prev) => keepPromptTriggers(prev, plan.prompt))
      if (recipeBase) setSelectedBaseId(recipeBase.id)
      setNegativePrompt(params.negativePrompt ?? '')
      // 配方带负面时展开负面框——做同款改了它，就让用户直接看见（CD 的负面条
      // 平时折叠 + 内容预览，这里是「有变更就摊开」的例外）。
      if (params.negativePrompt?.trim()) setNegativePromptExpanded(true)
      if (plan.aspectRatio) setAspectRatio(plan.aspectRatio)
      // Scale applies to the group the recipe came from (per-mount), not
      // always the primary — multi-mount tunes each LoRA independently.
      if (plan.loraScale != null && recipeGroupAsset) {
        stack.setScale(recipeGroupAsset.id, plan.loraScale)
      }
      if (recipeGroupAsset) stack.setEnabled(recipeGroupAsset.id, true)
      setSeed(options.includeSeed ? params.seed : undefined)
      setRunnerSeed(params.runnerSeed ?? '')
      setRunnerSteps(params.steps != null ? String(params.steps) : '')
      setRunnerCfg(
        params.guidanceScale != null ? String(params.guidanceScale) : '',
      )
      setRunnerSampler(params.runnerSampler ?? '')
      setRunnerScheduler(params.runnerScheduler ?? '')
      setRunnerWidth(
        params.runnerWidth != null ? String(params.runnerWidth) : '',
      )
      setRunnerHeight(
        params.runnerHeight != null ? String(params.runnerHeight) : '',
      )
      if (recipeGroupAsset) {
        setAppliedRecipe({
          groupAssetId: recipeGroupAsset.id,
          assetName: recipeGroupAsset.name,
          recipe,
          params,
          includeSeed: options.includeSeed,
          extraLoras: options.extraLoras,
          // 展开时列出的「配方带来的参数」（seed 仅在锁原图 seed 时计入）。
          appliedParamLabels: plan.appliedParams.filter(
            (param) => param !== 'seed' || options.includeSeed,
          ),
          snapshot,
        })
      }
      // owner 2026-07-20：做同款 = 真还原——除了 prompt/参数/底模引用，还把配方
      // 里叠加的其他 LoRA 一起挂上（架构不兼容的仍会被兼容闸拦下）。结果 toast
      // 异步回报成功/失败数，避免静默失败。
      // owner 2026-08-07：挂哪些由 modal 的勾选决定（默认全选），不再无条件用
      // plan.extraLoras 全量——所以这里读 options 而不是 plan。
      void mountExtras(options.extraLoras, recipeBase)
      // CD③：落台即进「待审阅」，并把变更卡摊开——用户得先看见改了什么。
      if (recipeGroupAsset) {
        setCollocationPending(true)
        setCollocationExpanded(true)
      }
    },
    [
      recipeGroupAsset,
      stack,
      mountExtras,
      keepPromptTriggers,
      prompt,
      negativePrompt,
      negativePromptExpanded,
      aspectRatio,
      seed,
      runnerSeed,
      runnerSteps,
      runnerCfg,
      runnerSampler,
      runnerScheduler,
      runnerWidth,
      runnerHeight,
      selectedBase,
      selectedBaseId,
    ],
  )

  // G3b-2b 撤销：把做同款前的输入快照整批写回（prompt/negative/aspect/seed/
  // runner 各参数 + 该分组 scale），清空 appliedRecipe。范围=输入回滚；做同款
  // 挂上的额外 LoRA 不自动卸载（由装配行 chip 单独管，避免撤销牵动挂载栈）。
  const handleUndoRecipe = useCallback(() => {
    const applied = appliedRecipe
    if (!applied) return
    const snap = applied.snapshot
    setPrompt(snap.prompt)
    setNegativePrompt(snap.negativePrompt)
    setNegativePromptExpanded(snap.negativePromptExpanded)
    setAspectRatio(snap.aspectRatio)
    setSeed(snap.seed)
    setRunnerSeed(snap.runnerSeed)
    setRunnerSteps(snap.runnerSteps)
    setRunnerCfg(snap.runnerCfg)
    setRunnerSampler(snap.runnerSampler)
    setRunnerScheduler(snap.runnerScheduler)
    setRunnerWidth(snap.runnerWidth)
    setRunnerHeight(snap.runnerHeight)
    setSelectedBaseId(snap.selectedBaseId)
    if (snap.scale != null) stack.setScale(applied.groupAssetId, snap.scale)
    setAppliedRecipe(null)
    setCollocationPending(false)
    setCollocationExpanded(false)
  }, [appliedRecipe, stack])

  // G3b-2b：仅当 appliedRecipe 的来源分组仍挂载时才算「已应用」（卸载后失效，
  // 与生成侧 activeAppliedRecipe 同判据）——搭配状态条据此显示「已应用/撤销」。
  const collocationRecipe =
    appliedRecipe &&
    stack.items.some((entry) => entry.asset.id === appliedRecipe.groupAssetId)
      ? appliedRecipe
      : null

  // S5 变更审阅卡（CD 配屏 5「配方·已还原」）：把「做同款改了什么」算成结构化
  // diff——做同款前快照 vs 当前值，逐项 from→to；没变的收进「保留项」。全部取真
  // 实值，不构造假 diff（无快照 = 不渲染）。
  const collocationChanges = useMemo(() => {
    const snap = collocationRecipe?.snapshot
    if (!snap) return { changed: [], kept: [] as string[], addedPrompt: null }
    const changed: { label: string; from: string; to: string }[] = []
    const kept: string[] = []
    const pushParam = (label: string, from: string, to: string) => {
      const f = from.trim()
      const to2 = to.trim()
      if (f === to2) return
      changed.push({
        label,
        from: f || t('generate.advanced.modelDefault'),
        to: to2 || t('generate.advanced.modelDefault'),
      })
    }
    pushParam(t('generate.advanced.steps'), snap.runnerSteps, runnerSteps)
    pushParam(t('generate.advanced.cfg'), snap.runnerCfg, runnerCfg)
    pushParam(t('generate.advanced.sampler'), snap.runnerSampler, runnerSampler)
    pushParam(
      t('generate.advanced.scheduler'),
      snap.runnerScheduler,
      runnerScheduler,
    )
    // Prompt：算新增的逗号分片（配方还原是往正文里并入词，不是整段替换）。
    const splitTags = (text: string) =>
      text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    const before = new Set(splitTags(snap.prompt))
    const added = splitTags(prompt).filter((tag) => !before.has(tag))
    const addedPrompt = added.length > 0 ? added : null
    // 保留项：做同款没动的输入面（让用户确认「我原来的东西还在」）。
    if (snap.negativePrompt.trim() === negativePrompt.trim()) {
      kept.push(t('generate.negativePromptLabel'))
    }
    if (snap.aspectRatio === aspectRatio) {
      kept.push(t('generate.collocation.keptAspectRatio'))
    }
    if (
      snap.runnerWidth.trim() === runnerWidth.trim() &&
      snap.runnerHeight.trim() === runnerHeight.trim()
    ) {
      kept.push(t('generate.collocation.keptSize'))
    }
    return { changed, kept, addedPrompt }
  }, [
    collocationRecipe,
    prompt,
    negativePrompt,
    aspectRatio,
    runnerSteps,
    runnerCfg,
    runnerSampler,
    runnerScheduler,
    runnerWidth,
    runnerHeight,
    t,
  ])

  // 行内「补挂」单个额外 LoRA——与做同款共用 mountExtras（含 toast）。
  const handleMountExtraLora = useCallback(
    (extra: CivitaiRecipeExtraLora) => {
      void mountExtras([extra])
    },
    [mountExtras],
  )

  // ── 助手（P4-C 起是**操作员面板**，见下方 `operatorHost`）────────────────
  // 开关状态在 root（按钮在模块 tab 行最右），这里只收 props；面板宽度由
  // `StudioOperatorDock` 自己订阅（正文不按宽度让位，见下方「恒覆盖态」注）。
  // S7：移动端装配 sheet（紧凑摘要条唤起）。
  const [assemblySheetOpen, setAssemblySheetOpen] = useState(false)
  // 装配列收起成 48px 竖条（桌面，lora-generate.md §2.1）；手机装配抽屉里那条
  // 脊柱也读它（两套骨架不同屏）。
  const [assemblyCollapsed, setAssemblyCollapsed] = useState(false)
  // 来源图带：出图中与出过图后收成一行，点它长回整条（§2.2）。每点一次出图收回去。
  const [bandExpanded, setBandExpanded] = useState(false)
  // 两套骨架的分界（≥1024 生成台 B / <1024 手机单卡），与 root 同一个判据。
  const isMobile = useIsMobile()

  const handleAssistantAppendPrompt = useCallback((text: string) => {
    setPrompt((prev) => appendPromptFragments(prev, text))
  }, [])
  // 助手整段改写正文：已经在正文里的触发词留着（它看得见正文，但不保证照抄）。
  const handleAssistantSetPrompt = useCallback(
    (value: string) => setPrompt((prev) => keepPromptTriggers(prev, value)),
    [keepPromptTriggers],
  )
  const handleAssistantFillNegative = useCallback((text: string) => {
    setNegativePrompt(text)
    setNegativePromptExpanded(true)
  }, [])
  /**
   * 操作员在**装配台**这个宿主上的那一份（P4-C）。
   *
   * ⚠ 底模标签用**界面上那一行**（`spine.<translationKey>` 优先）：助手在日志里
   * 说的底模名与用户在装配栏上看到的必须逐字一致，否则「它说切到 XX 了」而画面上
   * 写着另一个词。
   * ⚠ `availableBases` 就是 `compatibleBases` —— 那正是 `LoraBaseModelModal` 里
   * 列的那些（拍板 19：只给它界面上点得到的选项）。
   */
  const operatorBaseLabel = useCallback(
    (base: LoraBaseModel) =>
      base.translationKey
        ? t(`spine.${base.translationKey}`)
        : base.displayName,
    [t],
  )
  const operatorBases = useMemo(
    () =>
      compatibleBases.map((base) => ({
        id: base.id,
        label: operatorBaseLabel(base),
      })),
    [compatibleBases, operatorBaseLabel],
  )
  // 库 / 收藏住在这副舞台里：它们判断「装不装得上」要的底模从这里给（lora-library.md §4）。
  const stageContext = useMemo(
    () => ({
      base: selectedBase,
      baseLabel: selectedBase ? operatorBaseLabel(selectedBase) : null,
    }),
    [operatorBaseLabel, selectedBase],
  )
  /**
   * 装配台自己那条结果列 → 结果行卡（§2.11，切片 3b）。
   *
   * ⚠ `useMemo` 不是洁癖：`operatorHost` 内部按 `results` 的引用做 memo，这里每次
   * render 新建一个数组会让整个宿主对象跟着换引用，面板的每一条都白重渲染一遍。
   * ⚠ 映射函数在 hook 那边（宿主契约的一部分），⛔ 别把「收哪些」的判据抄到这里。
   */
  const operatorResults = useMemo(
    () => toLoraOperatorResults(resultHistory),
    [resultHistory],
  )
  /**
   * 挂载栈 → 宿主入参：逐条带上**它的触发词现在在不在正文里**（§3.1）。
   *
   * ⭐ 按正文算好的 `disabledTriggerIds` 只有这里够得着 —— 所以它沿入参走一遍，
   * ⛔ 不让 hook 或快照照着挂载栈再算一份。
   */
  const operatorStack = useMemo(
    () => ({
      items: stack.items.map((item) => ({
        ...item,
        triggerEnabled: !disabledTriggerIds.has(item.asset.id),
      })),
      push: stack.push,
      setScale: stack.setScale,
      remove: stack.remove,
    }),
    [stack.items, stack.push, stack.setScale, stack.remove, disabledTriggerIds],
  )
  const operatorParameters = AssistantLoraParametersSchema.safeParse({
    steps: parseOptionalRunnerNumber(runnerSteps) ?? null,
    guidanceScale: parseOptionalRunnerNumber(runnerCfg) ?? null,
    runnerSeed: runnerSeed.trim() || null,
    runnerWidth: parseOptionalRunnerNumber(runnerWidth) ?? null,
    runnerHeight: parseOptionalRunnerNumber(runnerHeight) ?? null,
    runnerSampler: runnerSampler || null,
    runnerScheduler: runnerScheduler || null,
  })
  // 库页现在的排序 / 分级 / 类型 —— 进助手快照，它照同一组条件当面搜（lora-assistant §13）。
  const libraryFilters = useLoraLibraryFilterSnapshot()
  // 助手那一枪按的就是这颗出图键 —— `handleGenerateClick` 定义在下面，走 ref。
  const generateClickRef = useRef<(owner?: StudioOperatorResultOwner) => void>(
    () => {},
  )
  const assistantGenerateBlockedReason =
    isGenerating || isMountingExtras
      ? t('generate.assistantBusy')
      : !selectedBase?.available || !selectedBase.providerModelId
        ? ''
        : runnerParameterError
  const operatorHost = useLoraOperatorHost({
    loraParameters:
      isRunnerBase && operatorParameters.success
        ? operatorParameters.data
        : undefined,
    sourceRecipe: collocationRecipe?.recipe,
    setLoraParameters: (parameters) => {
      if ('steps' in parameters)
        setRunnerSteps(parameters.steps == null ? '' : String(parameters.steps))
      if ('guidanceScale' in parameters)
        setRunnerCfg(
          parameters.guidanceScale == null
            ? ''
            : String(parameters.guidanceScale),
        )
      if ('runnerSeed' in parameters) setRunnerSeed(parameters.runnerSeed ?? '')
      if ('runnerWidth' in parameters)
        setRunnerWidth(
          parameters.runnerWidth == null ? '' : String(parameters.runnerWidth),
        )
      if ('runnerHeight' in parameters)
        setRunnerHeight(
          parameters.runnerHeight == null
            ? ''
            : String(parameters.runnerHeight),
        )
      if ('runnerSampler' in parameters)
        setRunnerSampler(parameters.runnerSampler ?? '')
      if ('runnerScheduler' in parameters)
        setRunnerScheduler(parameters.runnerScheduler ?? '')
    },
    prompt,
    setPrompt: handleAssistantSetPrompt,
    appendPrompt: handleAssistantAppendPrompt,
    negativePrompt,
    setNegativePrompt: handleAssistantFillNegative,
    base: selectedBase
      ? {
          id: selectedBase.id,
          label: operatorBaseLabel(selectedBase),
          family: selectedBase.family ?? null,
        }
      : null,
    availableBases: operatorBases,
    selectBase: handleSelectBase,
    stack: operatorStack,
    imageUpload,
    results: operatorResults,
    generate: {
      run: (owner) => generateClickRef.current(owner),
      blockedReason: assistantGenerateBlockedReason,
    },
    activeRun,
    libraryFilters,
    openLibrary: onOpenLibrary,
    // 库 / 收藏开着时才给：助手写装配台先回到生成台，你才看得见它改了什么。
    ...(library && onReturnToGenerate
      ? { returnToBench: onReturnToGenerate }
      : {}),
    open: assistantOpen,
    setOpen: onAssistantOpenChange,
  })

  const hasLora = stack.items.length > 0
  // 配方里的额外 LoRA 只在「正在补挂」时锁出图。定位不到（作者私有、Civitai
  // 上没有）或与底模不兼容的，重试也挂不上——由 toast 与「去 Civitai 找」说清，
  // ⛔ 不锁生成键（配方图 135139750 的 superiorAnima 曾把按钮永久锁死）。
  const canGenerate =
    !isMountingExtras &&
    !!selectedBase?.available &&
    !!selectedBase.providerModelId &&
    !isGenerating &&
    runnerParameterError === null &&
    // 缺 key 时按钮仍可点——点击路由到 QuickSetupDialog（Hard Rule 8），
    // 不强求先填提示词。触发词就写在正文里，只有触发词也算有内容。
    (needsKeySetup || prompt.trim().length > 0)

  const handleGenerate = useCallback(
    async (operatorResultOwner?: StudioOperatorResultOwner) => {
      if (extraMountsPending.current > 0) return
      const providerModelId = selectedBase?.providerModelId
      if (!providerModelId) return
      // 时间提示（owner 2026-09-12）：Runner 线路才有冷启动，hosted 线路不提。
      setIsRunnerColdStart(
        isRunnerBase ? consumeRunnerColdStart(selectedBase.id) : false,
      )
      // 停用（enabled === false）的挂载留在栈里但不送去出图——启停开关的语义就是
      // "先按住这个 LoRA 不参与本次出图"，见 useActiveLoraStack.StoredEntry.enabled。
      const enabledEntries = stack.items
        .filter((entry) => entry.enabled !== false)
        .map((entry) => ({
          asset: entry.asset,
          scale: entry.scale ?? entry.asset.defaultScale,
        }))
      const loras = enabledEntries.map((entry) => ({
        url: entry.asset.loraUrl,
        scale: entry.scale,
      }))
      // 「自己搭配」选中的标签在这里并入最终 prompt——compiler 只读不写
      // selections，负向标签走 compiledNegativePrompt，和已有的 negativePrompt
      // 文本框合并去重，不互相覆盖。触发词已经在正文里，⛔ 这里不再拼。
      const compiled = compilePromptTags({
        freePrompt: prompt,
        selectedTags: promptTags.allSelections(),
        existingNegativePrompt: negativePrompt,
      })
      const activeAppliedRecipe =
        appliedRecipe &&
        stack.items.some(
          (entry) => entry.asset.id === appliedRecipe.groupAssetId,
        )
          ? appliedRecipe
          : null
      const recipeParams = activeAppliedRecipe?.params
      const advanced: Record<string, unknown> = { ...recipeParams }
      // These are supplied by the visible prompt/negative/seed controls below.
      delete advanced.negativePrompt
      delete advanced.seed
      if (loras.length > 0) advanced.loras = loras
      if (compiled.negativePrompt && !negativeInert)
        advanced.negativePrompt = compiled.negativePrompt
      // B9: reference-image img2img — only when the base supports it (enabled
      // urls) and one was attached. Strength drives fal's denoising inversion.
      const referenceImages = imageUpload.referenceImages
      if (referenceImages.length > 0) {
        advanced.referenceStrength = referenceStrength
      }
      // v3：runner + 源图配方时，把配方记录的底模引用传给服务端分级（T1 下对底模
      // 忠实还原 / T2 近似 / T3 拦）。非 runner 或无配方不传 → 维持现状用预烤底模。
      if (isRunnerBase) {
        delete advanced.runnerSeed
        delete advanced.runnerSampler
        delete advanced.runnerScheduler
        delete advanced.runnerWidth
        delete advanced.runnerHeight
        delete advanced.runnerUpscaler
        delete advanced.steps
        delete advanced.guidanceScale

        const exactSeed = runnerSeed.trim()
        const steps = parseOptionalRunnerNumber(runnerSteps)
        const cfg = parseOptionalRunnerNumber(runnerCfg)
        const width = parseOptionalRunnerNumber(runnerWidth)
        const height = parseOptionalRunnerNumber(runnerHeight)
        if (exactSeed) advanced.runnerSeed = exactSeed
        if (steps !== undefined) advanced.steps = steps
        if (cfg !== undefined) advanced.guidanceScale = cfg
        if (runnerSampler) advanced.runnerSampler = runnerSampler
        if (runnerScheduler) advanced.runnerScheduler = runnerScheduler
        if (width !== undefined && height !== undefined) {
          advanced.runnerWidth = width
          advanced.runnerHeight = height
        }
        if (runnerUpscaler === '4x-AnimeSharp') {
          advanced.runnerUpscaler = runnerUpscaler
        }

        const activeRecipe = activeAppliedRecipe?.recipe
        if (
          activeRecipe?.checkpointHash &&
          selectedBase?.recipeCheckpointMode !== 'fixed'
        ) {
          advanced.checkpointHash = activeRecipe.checkpointHash
        }
        // Runner-only fields never leak into hosted provider payloads.
        if (
          activeRecipe?.checkpointVersionId != null &&
          selectedBase?.recipeCheckpointMode !== 'fixed'
        ) {
          advanced.checkpointVersionId = activeRecipe.checkpointVersionId
        }
        if (
          activeRecipe?.checkpoint &&
          selectedBase?.recipeCheckpointMode !== 'fixed'
        ) {
          advanced.checkpointName = activeRecipe.checkpoint
        }
        // 带上 LoRA 的 baseModel 作权威架构信号：无精确底模时服务端按它判 T2/T3，
        // 既能正确拦 DiT，又不会因配方 checkpoint 名字含 "anima"(如 Animagine) 误拦
        // 合法 SDXL 生成。
        if (
          (advanced.checkpointVersionId ||
            advanced.checkpointHash ||
            advanced.checkpointName) &&
          loraFamily
        )
          advanced.loraBaseModel = loraFamily
      } else {
        delete advanced.runnerHires
        delete advanced.runnerSeed
        delete advanced.runnerSampler
        delete advanced.runnerScheduler
        delete advanced.runnerWidth
        delete advanced.runnerHeight
        delete advanced.runnerUpscaler
      }
      // 点「出图」这一刻结果卡就是主角：来源图带先收成一行，把高度让给它（§2.2）。
      setBandExpanded(false)
      const record = await generate({
        mode: 'image',
        operatorResultOwner,
        image: {
          modelId: providerModelId,
          freePrompt: compiled.freePrompt ?? prompt,
          aspectRatio,
          seed,
          referenceImages:
            referenceImages.length > 0 ? referenceImages : undefined,
          advancedParams:
            Object.keys(advanced).length > 0 ? advanced : undefined,
          sourceSurface: 'LORA_WORKBENCH',
        },
      })
      // D7③: on success, prepend to the session filmstrip and select it as the
      // shown result. Scale is the primary LoRA's (loras[0]); seed comes from the
      // record (real provider seed) with the requested seed as fallback.
      if (record) {
        const primaryScale = loras[0]?.scale ?? null
        setResultHistory((prev) =>
          [
            {
              id: record.id,
              url: record.url,
              scale: primaryScale,
              seed:
                normalizeRecordSeed(record.seed) ??
                (seed != null ? String(seed) : null),
              // G3d 结果列元信息（gen-time 快照，反映本次出图而非当前面板值）。
              width: previewDimensions.width,
              height: previewDimensions.height,
              steps: parseOptionalRunnerNumber(runnerSteps) ?? null,
              sampler: isRunnerBase ? runnerSampler || null : null,
              cfg: isRunnerBase
                ? (parseOptionalRunnerNumber(runnerCfg) ?? null)
                : null,
              baseName: selectedBase?.displayName ?? null,
              loraName: stack.items[0]?.asset.name ?? null,
              setup: buildRecipeLoraSetup(
                selectedBase?.id ?? null,
                enabledEntries,
              ),
            },
            ...prev.filter((item) => item.id !== record.id),
          ].slice(0, LORA_RESULT_HISTORY_MAX),
        )
        setSelectedResultId(record.id)
      }
    },
    [
      aspectRatio,
      appliedRecipe,
      generate,
      imageUpload.referenceImages,
      isRunnerBase,
      loraFamily,
      negativeInert,
      negativePrompt,
      previewDimensions,
      prompt,
      promptTags,
      referenceStrength,
      runnerCfg,
      runnerHeight,
      runnerSampler,
      runnerScheduler,
      runnerSeed,
      runnerSteps,
      runnerUpscaler,
      runnerWidth,
      seed,
      selectedBase,
      stack,
    ],
  )

  // 换比例：Runner 底模同时把精确宽高换成这个比例的出图尺寸（与出图请求一致）。
  const handleAspectRatioChange = useCallback(
    (ratio: AspectRatio) => {
      setAspectRatio(ratio)
      if (isRunnerBase) {
        const dimensions = getRunnerPreviewDimensions(
          ratio,
          selectedBase != null &&
            getLoraBaseArchitectureGroup(selectedBase.family) === 'dit',
        )
        setRunnerWidth(String(dimensions.width))
        setRunnerHeight(String(dimensions.height))
      }
    },
    [isRunnerBase, selectedBase?.family],
  )

  // 主入口已经挪到「选底模」（见 handleSelectBase）。这里只是兜底：万一用户
  // 从没碰过底模选择器（比如默认底模本来就缺 key），点出图不能直接静默失败
  // ——但按钮外观不再随 needsKeySetup 变化，保持一直是「出图」。
  const handleGenerateClick = useCallback(
    (operatorResultOwner?: StudioOperatorResultOwner) => {
      if (needsKeySetup && workspaceOptionForBase) {
        openKeySetupFor(workspaceOptionForBase)
        return
      }
      collapseComposer()
      void handleGenerate(operatorResultOwner)
    },
    [
      collapseComposer,
      handleGenerate,
      needsKeySetup,
      openKeySetupFor,
      workspaceOptionForBase,
    ],
  )
  // ⚠ layout effect：宿主那只出图 effect 声明在前、同一次提交里先跑，passive
  //   effect 换 ref 会让它按到上一拍的出图键（读的是助手改之前的表单）。
  useLayoutEffect(() => {
    generateClickRef.current = handleGenerateClick
  }, [handleGenerateClick])

  // D7③: which result the main image shows — the filmstrip selection, falling
  // back to the newest entry, then to the hook's lastGeneration (covers a
  // result that predates any filmstrip entry, e.g. a still-processing resolve).
  const selectedResult =
    resultHistory.find((item) => item.id === selectedResultId) ??
    resultHistory[0] ??
    null
  const displayedResultUrl = selectedResult?.url ?? lastGeneration?.url ?? null

  // 「存成模板」（pages/prompts.md）：存的是这一张出图那一刻的整套；这一轮存过的
  // 记着，键换成「已存成模板」。整套对不上（旧记录缺格）就只存链接与权重。
  const [templateSaves, setTemplateSaves] = useState<
    Record<string, 'saving' | 'saved'>
  >({})
  const handleSaveTemplate = useCallback(
    async (item: LoraResultHistoryItem) => {
      if (templateSaves[item.id]) return
      setTemplateSaves((prev) => ({ ...prev, [item.id]: 'saving' }))
      const setup = RecipeLoraSetupSchema.safeParse(item.setup)
      const response = await createRecipeFromGenerationAPI({
        generationId: item.id,
        ...(setup.success ? { loraSetup: setup.data } : {}),
      })
      if (response.success) {
        setTemplateSaves((prev) => ({ ...prev, [item.id]: 'saved' }))
        toast.success(t('generate.templateSaved'), {
          action: {
            label: t('generate.templateSavedOpen'),
            onClick: () => router.push(ROUTES.PROMPTS),
          },
        })
        return
      }
      setTemplateSaves((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      toast.error(response.error ?? t('generate.templateSaveFailed'))
    },
    [router, t, templateSaves],
  )

  /**
   * 移动端自动滚动（owner 2026-09-03「结果在眼前、输入在拇指区」）。
   *
   * 手机上结果卡排在 composer **上面**，按下「出图」时它已经滚出视口——不滚的话
   * 用户按完看不到任何东西在动。所以生成**开始**时把结果卡顶到视口顶（那一刻卡
   * 里已经是 `StudioGeneratingProgress`：边上的进度线 + 百分比 + 参数行）。
   *
   * ⚠ 一轮只滚一次：依赖里只有 `isGenerating`，翻到 `true` 才进这一支，翻回
   * `false`（完成/失败）直接 return——完成时结果已在原位，二次滚动会打断正在读
   * 元信息或缩略历史的人。
   * ⚠ 桌面（≥1024）整条不生效：那边是 60/40 并排，结果一直在视野里。
   */
  const resultCardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isMobile || !isGenerating) return
    const card = resultCardRef.current
    if (!card) return
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
    card.scrollIntoView(
      prefersReducedMotion
        ? LORA_MOBILE_RESULT_SCROLL_OPTIONS_REDUCED
        : LORA_MOBILE_RESULT_SCROLL_OPTIONS,
    )
  }, [isMobile, isGenerating])

  const handleAskAssistantAboutResult = useCallback(
    (url: string) => {
      if (!url) return
      requestOperatorAttachment({
        id: `lora-result:${url}`,
        url,
        label: url.split('/').pop() || url,
        kind: 'image',
      })
      onAssistantOpenChange(true)
    },
    [onAssistantOpenChange],
  )

  // G3d 结果列：主图纵横比取自选中结果的 gen-time 快照（无则退回方形），
  // 元信息两行——① 尺寸 · 步数 · 种子（缺项自动省略）② 主 LoRA×强度 · 底模。
  const displayedAspect =
    selectedResult?.width && selectedResult?.height
      ? selectedResult.width / selectedResult.height
      : undefined
  const resultMetaParts = selectedResult
    ? [
        selectedResult.width != null && selectedResult.height != null
          ? t('generate.resultMetaSize', {
              width: selectedResult.width,
              height: selectedResult.height,
            })
          : null,
        selectedResult.steps != null
          ? t('generate.resultMetaSteps', { steps: selectedResult.steps })
          : null,
        selectedResult.seed != null
          ? t('generate.resultMetaSeed', { seed: selectedResult.seed })
          : null,
      ].filter((part): part is string => part !== null)
    : []
  const resultAssemblyLine =
    selectedResult?.loraName && selectedResult.baseName
      ? t('generate.resultMetaAssembly', {
          lora: selectedResult.loraName,
          scale:
            selectedResult.scale != null
              ? selectedResult.scale.toFixed(2)
              : '—',
          base: selectedResult.baseName,
        })
      : (selectedResult?.baseName ?? null)

  // S2精修①-B：Runner 高级参数从中创作面迁到左装配栏（②锁高后左栏内滚·高度
  // 被兜住）。300px 窄栏 → 网格 reflow 成 1col（原 sm:grid-cols-2 lg:grid-cols-4
  // 按视口触发·塞 300px 会压爆）。isRunnerBase gated（仅 runner 底模有参数）。
  // 抽成 const 闭包本地 state（零 props），在左装配栏渲染。
  const runnerParamsPanel = isRunnerBase ? (
    <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--lora-shadow-panel)] lg:rounded-none lg:border-0 lg:border-t lg:border-border/60 lg:bg-transparent lg:p-0 lg:pt-3 lg:shadow-none">
      <button
        type="button"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
        className="flex w-full items-center gap-2 py-1 text-left text-xs font-medium text-foreground"
      >
        {/* CD 装配栏参数行：图标 + 生效值摘要（1024×1360 · Steps 30 · CFG 7 ·
            采样器）+ 收合角标——不再挂「Runner 参数」标题，值本身就是标题；缺省
            项落底模默认不显示。无摘要（非 runner/无值）时才退回文字摘要。 */}
        <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-2xs font-normal text-muted-foreground">
          {runnerSummaryLine ??
            (advancedCustomCount > 0
              ? t('generate.advanced.customSummary', {
                  count: advancedCustomCount,
                })
              : t('generate.advanced.defaultSummary'))}
        </span>
        <span className="sr-only">{t('generate.advanced.title')}</span>
        <ChevronDown
          className={cn(
            'ml-auto size-3.5 transition-transform',
            advancedOpen && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {/* 展开/收起走 grid-rows 过渡（.lora-reveal）。 */}
      <div className="lora-reveal" data-open={advancedOpen ? 'true' : 'false'}>
        <div inert={!advancedOpen}>
          {/* CD：展开态是一块凹槽 well（比面板更沉的表面），把参数从「面板上的
              一堆输入」变成「陷进去的调节区」。 */}
          <div className="mt-2 space-y-3 rounded-lg bg-[var(--lora-well)] p-2.5">
            {runnerParameterError ? (
              <p
                role="alert"
                className="rounded-md bg-status-risk-surface px-2.5 py-2 text-2xs text-status-risk"
              >
                {runnerParameterError}
              </p>
            ) : null}

            {/* 窄栏 reflow：单列堆叠（原 sm:grid-cols-2 lg:grid-cols-4）。 */}
            <div className="grid grid-cols-1 gap-2">
              <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                <span>{t('generate.advanced.seed')}</span>
                <div className="flex gap-1.5">
                  <Input
                    value={runnerSeed}
                    onChange={(event) => {
                      setRunnerSeed(event.target.value.trim())
                      setSeed(undefined)
                    }}
                    inputMode="numeric"
                    placeholder={t('generate.advanced.modelDefault')}
                    aria-label={t('generate.advanced.seed')}
                    className="h-8 border-border bg-transparent font-mono text-base md:text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setRunnerSeed('')
                      setSeed(undefined)
                    }}
                    title={t('generate.advanced.randomSeed')}
                    aria-label={t('generate.advanced.randomSeed')}
                    className="size-8 shrink-0"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </label>

              <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                <span>{t('generate.advanced.steps')}</span>
                {/* CD：well 内滑杆。滑杆负责快调，数字框保留精确输入（也是
                    「手改参数进请求」那条测试的抓手）。留空=底模默认，此时滑杆
                    停在默认位但不写值。 */}
                <div className="flex items-center gap-2">
                  <Slider
                    aria-label={t('generate.advanced.sliderLabel', {
                      label: t('generate.advanced.steps'),
                    })}
                    min={1}
                    max={100}
                    step={1}
                    value={[Number(runnerSteps) || 30]}
                    onValueChange={([v]) => setRunnerSteps(String(v))}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={runnerSteps}
                    onChange={(event) => setRunnerSteps(event.target.value)}
                    placeholder={t('generate.advanced.modelDefault')}
                    aria-label={t('generate.advanced.steps')}
                    className="h-8 w-24 shrink-0 border-border bg-transparent text-base md:w-16 md:text-xs"
                  />
                </div>
              </label>

              <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                <span>{t('generate.advanced.cfg')}</span>
                <div className="flex items-center gap-2">
                  <Slider
                    aria-label={t('generate.advanced.sliderLabel', {
                      label: t('generate.advanced.cfg'),
                    })}
                    min={0}
                    max={30}
                    step={0.1}
                    value={[Number(runnerCfg) || 7]}
                    onValueChange={([v]) => setRunnerCfg(String(v))}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    value={runnerCfg}
                    onChange={(event) => setRunnerCfg(event.target.value)}
                    placeholder={t('generate.advanced.modelDefault')}
                    aria-label={t('generate.advanced.cfg')}
                    className="h-8 w-24 shrink-0 border-border bg-transparent text-base md:w-16 md:text-xs"
                  />
                </div>
              </label>

              <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                <span>{t('generate.advanced.sampler')}</span>
                <Select
                  value={runnerSampler || RUNNER_DEFAULT_SELECT_VALUE}
                  onValueChange={(value) =>
                    setRunnerSampler(
                      value === RUNNER_DEFAULT_SELECT_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={t('generate.advanced.sampler')}
                    className="h-8 border-border bg-transparent text-base md:text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RUNNER_DEFAULT_SELECT_VALUE}>
                      {t('generate.advanced.modelDefault')}
                    </SelectItem>
                    {RUNNER_SAMPLERS.map((sampler) => (
                      <SelectItem key={sampler} value={sampler}>
                        {sampler}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                <span>{t('generate.advanced.scheduler')}</span>
                <Select
                  value={runnerScheduler || RUNNER_DEFAULT_SELECT_VALUE}
                  onValueChange={(value) =>
                    setRunnerScheduler(
                      value === RUNNER_DEFAULT_SELECT_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={t('generate.advanced.scheduler')}
                    className="h-8 border-border bg-transparent text-base md:text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RUNNER_DEFAULT_SELECT_VALUE}>
                      {t('generate.advanced.modelDefault')}
                    </SelectItem>
                    {RUNNER_SCHEDULERS.map((scheduler) => (
                      <SelectItem key={scheduler} value={scheduler}>
                        {scheduler}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                  <span>{t('generate.advanced.width')}</span>
                  <Input
                    type="number"
                    min={512}
                    max={selectedBase?.family === 'anima-dit' ? 1536 : 2048}
                    step={8}
                    value={runnerWidth}
                    onChange={(event) => setRunnerWidth(event.target.value)}
                    placeholder={String(previewDimensions.width)}
                    aria-label={t('generate.advanced.width')}
                    className="h-8 border-border bg-transparent text-base md:text-xs"
                  />
                </label>

                <label className="space-y-1 text-2xs font-medium text-muted-foreground">
                  <span>{t('generate.advanced.height')}</span>
                  <Input
                    type="number"
                    min={512}
                    max={selectedBase?.family === 'anima-dit' ? 1536 : 2048}
                    step={8}
                    value={runnerHeight}
                    onChange={(event) => setRunnerHeight(event.target.value)}
                    placeholder={String(previewDimensions.height)}
                    aria-label={t('generate.advanced.height')}
                    className="h-8 border-border bg-transparent text-base md:text-xs"
                  />
                </label>
              </div>
            </div>

            {collocationRecipe?.params.runnerHires ? (
              <p className="rounded-lg border border-border p-2.5 text-2xs text-muted-foreground">
                {t('generate.advanced.sourceHiresSummary', {
                  scale: collocationRecipe.params.runnerHires.scale,
                  denoise: collocationRecipe.params.runnerHires.denoise,
                  steps:
                    collocationRecipe.params.runnerHires.steps ??
                    (runnerSteps || t('generate.advanced.modelDefault')),
                  cfg:
                    collocationRecipe.params.runnerHires.cfg ??
                    (runnerCfg || t('generate.advanced.modelDefault')),
                })}
              </p>
            ) : null}
            <div className="rounded-lg border border-border p-2.5">
              <div className="flex flex-col gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    {t('generate.advanced.postprocess')}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {t('generate.advanced.upscalerHint')}
                  </p>
                </div>
                <Select
                  value={runnerUpscaler}
                  onValueChange={(value) =>
                    setRunnerUpscaler(
                      value === '4x-AnimeSharp' ? '4x-AnimeSharp' : 'none',
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={t('generate.advanced.upscaler')}
                    className="h-8 w-full border-border bg-transparent text-base md:text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('generate.advanced.upscalerNone')}
                    </SelectItem>
                    <SelectItem value="4x-AnimeSharp">4x-AnimeSharp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {runnerUpscaler === '4x-AnimeSharp' ? (
                <p
                  className={cn(
                    'mt-2 text-2xs',
                    upscaleOutputIsLarge
                      ? 'text-status-warning'
                      : 'text-muted-foreground',
                  )}
                >
                  {t('generate.advanced.upscaleSummary', {
                    width: previewDimensions.width,
                    height: previewDimensions.height,
                    outputWidth: upscaleFinalWidth,
                    outputHeight: upscaleFinalHeight,
                  })}
                  {upscaleOutputIsLarge
                    ? ` ${t('generate.advanced.upscaleLargeWarning')}`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null

  // 额度提示：平台总闸（platformEnabled）优先于余额。桌面落在装配列底，手机落在
  // 装配抽屉底 —— ⛔ 不挤进输入框（窄屏会把出图键顶出视口）。
  const runnerBudgetNote =
    isRunnerBase && runnerUsage?.enabled ? (
      <p
        className={cn(
          'text-2xs',
          !runnerUsage.platformEnabled || runnerUsage.remaining <= 0
            ? 'text-status-warning'
            : 'text-muted-foreground',
        )}
      >
        {!runnerUsage.platformEnabled
          ? t('generate.runnerUnavailable')
          : runnerUsage.remaining <= 0
            ? t('generate.runnerBudgetExhausted')
            : t('generate.runnerBudgetRemaining', {
                remaining: runnerUsage.remaining,
                limit: runnerUsage.limit,
              })}
      </p>
    ) : null

  // 手机装配抽屉里的整条装配（桌面走舞台里的 `LoraAssemblyColumn`，参数进工具行
  // 的「参数」chip）。两套骨架不同屏，⛔ 不会出现两份挂载栈 UI 同时在场。
  const mobileAssemblyColumn = (
    <>
      <LoraSpineBar
        compatibleBases={compatibleBases}
        selectedBase={selectedBase}
        onSelectBase={handleSelectBase}
        needsKeySetup={needsKeySetup}
        onRequestKeySetup={() =>
          workspaceOptionForBase && openKeySetupFor(workspaceOptionForBase)
        }
        loraScaleConfig={loraScaleConfig}
        activeRecipeGroupId={recipeGroupKey}
        onSelectRecipeGroup={setRecipeGroupAssetId}
        onAddLora={onOpenLibrary}
        triggerEntries={triggerChipEntries}
        disabledTriggerIds={disabledTriggerIds}
        onToggleTrigger={handleToggleTriggerChip}
        collapsed={assemblyCollapsed}
        onToggleCollapsed={() => setAssemblyCollapsed(!assemblyCollapsed)}
      />
      {/* 折叠态只留 rail（脊柱条本体），参考图/参数两块收起来。 */}
      {/* S2精修①：参考图（能力位驱动·仅底模支持参考图 + 有强度配置时渲染）。 */}
      {!assemblyCollapsed &&
      maxReferenceImages > 0 &&
      referenceStrengthConfig ? (
        <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--lora-shadow-panel)] lg:rounded-none lg:border-0 lg:border-t lg:border-border/60 lg:bg-transparent lg:p-0 lg:pt-3 lg:shadow-none">
          <LoraReferenceImageCards
            imageUpload={imageUpload}
            strength={referenceStrength}
            onStrengthChange={setReferenceStrength}
            strengthConfig={referenceStrengthConfig}
            disabled={!selectedBase?.available || isGenerating}
          />
        </div>
      ) : null}
      {/* S2精修①-B：Runner 高级参数 disclosure（reflow 1col·isRunnerBase gated）。 */}
      {assemblyCollapsed ? null : runnerParamsPanel}
      {/* rail 底部额度提示（mock「本月 Runner 剩余 N/300」）：`mt-auto` 吃掉
          `.lora-rail` 的 flex-col 剩余高度，把它钉在栏底——折叠态列宽缩到
          56px 放不下这行字，跟其余装配内容一起收起。 */}
      {assemblyCollapsed ? null : (
        <div className="mt-auto">{runnerBudgetNote}</div>
      )}
    </>
  )

  /**
   * 结果卡第四态「失败」——**仅移动端**（owner 2026-09-03）。
   *
   * 手机上 composer 排在结果卡**下面**（composer 里那条 `role="alert"` 仍在）：
   * 出图失败时用户眼前是结果卡，报错在屏幕外，等于「按了没反应」。所以手机上把
   * 失败**也**画进结果卡，并给一颗就地
   * 「重试」——调的是同一个 `handleGenerateClick`（含缺 key 时路由到
   * QuickSetupDialog 的兜底），不是第二条生成链路。
   *
   * ⚠ 不加 `role="alert"`：composer 里那条已经是 alert 且始终在 DOM 里，这里再
   * 挂一个等于同一条错误读屏播两遍。这块只补**可见**的动作。
   * ⚠ 额度文案只说「按已发起的任务计、失败不返还」——`getRunnerMonthlyGenerationCount`
   * 数的是本月创建的 `generationJob` 行数，全仓没有任何回退/返还路径；派发前就
   * 被拒的失败（缺 key / 总闸关 / 撞上限）根本没建 job，也就无从「扣」。写
   * 「未扣次数」或「本次已计入」都会在另一半情况里说谎。
   * ⛔ 不放「做同款 / 重出 / 更多菜单」（`lora-generate.md:57`）——重试是失败态
   * 专属动作，不是普通结果上的再生成入口。
   */
  const mobileGenerateFailure =
    isMobile && generateError ? (
      <div className="w-full space-y-2 rounded-lg border border-status-risk/40 bg-status-risk-surface p-3 text-left">
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{generateError}</span>
        </p>
        {isRunnerBase && runnerUsage?.enabled ? (
          <p className="text-2xs text-muted-foreground">
            {t('generate.resultFailedQuotaNote')}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 w-full text-sm"
          disabled={!canGenerate}
          onClick={() => handleGenerateClick()}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('generate.resultFailedRetry')}
        </Button>
      </div>
    ) : null

  // 真空态：没在生成、没有结果图、也没有（移动端）失败态——三者都不是才是
  // mock 里那种「卡内一句居中小字，没有框」的空态。生成中/失败仍要虚线框出
  // 占位范围，判据与 `.lora-result-media--empty` 的高度封顶共用同一条。
  const isTrueResultEmptyState =
    !showGeneratingOverlay && !displayedResultUrl && !mobileGenerateFailure

  // 样例查看器（§5）：点来源图那一张，在舞台右侧原位展开，关上缩回当前那张。
  const stageRightRef = useRef<HTMLDivElement | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  // 库 / 收藏在场（lora-library.md §2）：进库那一拍把样例大图关掉 —— 它挂在看不见
  // 的那一层里，还开着就还在吃 Esc / ← →。
  const libraryActive = library !== null
  const [libraryWasActive, setLibraryWasActive] = useState(libraryActive)
  if (libraryWasActive !== libraryActive) {
    setLibraryWasActive(libraryActive)
    if (libraryActive) setViewerOpen(false)
  }
  // 输入框收起 / 长回（320）的那一段里裁掉溢出（卡片阴影平时要露出来）。
  const [composerFolding, setComposerFolding] = useState(false)
  const reduceMotion = useReducedMotion()
  const [viewerOrigin, setViewerOrigin] = useState<LoraRecipeViewerOrigin>({
    x: 0,
    y: 0,
  })
  const originOf = useCallback((element: Element | null) => {
    const container = stageRightRef.current
    if (!element || !container) return null
    const box = container.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2 - box.left,
      y: rect.top + rect.height / 2 - box.top,
    }
  }, [])
  const openViewer = useCallback(
    (index: number, trigger: HTMLElement) => {
      const origin = originOf(trigger)
      if (origin) setViewerOrigin(origin)
      setViewerIndex(index)
      setViewerOpen(true)
    },
    [originOf],
  )
  const closeViewer = useCallback(() => {
    // 缩回**当前这一张**的缩略图（翻过页就不是打开时那一张了），焦点也还给它。
    const thumb = stageRightRef.current?.querySelector<HTMLElement>(
      `[data-recipe-thumb="${viewerIndex}"]`,
    )
    const origin = originOf(thumb ?? null)
    if (origin) setViewerOrigin(origin)
    setViewerOpen(false)
    thumb?.focus({ preventScroll: true })
  }, [originOf, viewerIndex])
  // 换了一组来源图（点了别的挂载）：查看器里那一组已经不在了，收起。
  const [viewerGroupKey, setViewerGroupKey] = useState(recipeGroupKey)
  if (viewerGroupKey !== recipeGroupKey) {
    setViewerGroupKey(recipeGroupKey)
    setViewerOpen(false)
  }
  const mountedExtraKeys = new Set(
    Object.entries(extraMountedIdsByKey)
      .filter(
        ([, assetId]) =>
          assetId !== undefined &&
          stack.items.some((item) => item.asset.id === assetId),
      )
      .map(([key]) => key),
  )

  // 两套骨架共用的弹层：缺 key 快速配置 · 结果大图 · 库。
  const sharedDialogs = (
    <>
      {quickSetup && (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={(open) =>
            setQuickSetup((prev) => (prev ? { ...prev, open } : prev))
          }
          modelId={quickSetup.modelId}
          modelLabel={quickSetup.modelLabel}
          adapterType={quickSetup.adapterType}
          optionId={quickSetup.optionId}
        />
      )}

      <Dialog
        open={resultPreviewOpen && !!displayedResultUrl}
        onOpenChange={setResultPreviewOpen}
      >
        <DialogContent
          className="left-0 top-0 h-svh max-h-svh w-dvw max-w-none translate-x-0 translate-y-0 place-items-center rounded-none border-none bg-transparent p-3 shadow-none sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-auto sm:max-w-[min(90vw,72rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {t('generate.resultPreviewLabel')}
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              className="absolute right-3 top-3 z-10 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:hidden"
              aria-label={t('coverPreviewBack')}
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span>{t('coverPreviewBack')}</span>
            </button>
          </DialogClose>
          {displayedResultUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayedResultUrl}
              alt={t('generate.resultPreviewLabel')}
              className="block max-h-full max-w-full rounded-xl object-contain sm:max-h-[90svh] sm:max-w-[90vw]"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )

  /**
   * 桌面助手是**让位**不是覆盖（lora-generate.md §2.5，与图片台同一套）：头像留在
   * 顶上一行右端当开关，面板顶边对齐舞台、从右侧滑进来，点舞台与输入框不收。
   */
  const shellHost = useMemo(
    () =>
      isMobile
        ? operatorHost
        : {
            ...operatorHost,
            collapseOnOutsidePointer: false,
            anchor: STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
          },
    [isMobile, operatorHost],
  )

  if (isMobile) {
    return (
      /**
       * 操作员的宿主（P4-C）—— 面板从这里读装配台、往这里落笔。
       *
       * ⚠ 必须包住**创作面**（那里有 ✦ 归属标记与就地确认条）与**面板**两者：
       * 只包面板的话，✦ 那一侧会在运行时抛「must be used within provider」。
       * ⚠ 这一层就是 `/studio/lora` 没有 `<StudioProvider>` 也能跑操作员的原因 ——
       * 详见 `contexts/studio-operator-host.tsx` 的头注。
       */
      <StudioOperatorHostProvider host={shellHost}>
        {/* B 稿真机验证发现（2026-09-03）：`md:` 前缀是旧的「移动端整页自然滚动 +
          底部留白给 fixed 出图条」布局遗留——那条 `.lora-mobile-actionbar` 已经
          退役（见 lora.css 头注），B 稿把生成 tab 在所有断点都锁高，这一层必须
          在 <768 也是 flex-col + overflow-hidden，否则它作为 flowWrap（root 的
          bodyKey 容器）的 flex 子级会用 `min-height:auto` 撑到内容高度，把
          composer 顶出卡片底部（`.workbench-card` 的 overflow:hidden 会把溢出
          的部分悄悄裁掉，出图按钮摸不到却没有任何提示）。 */}
        <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {sharedDialogs}

          {/* S7 移动端装配 sheet：近全屏 Drawer 承载整条装配栏（底模/LoRA栈/参考图/
            参数），由输入条顶上的紧凑摘要条唤起。 */}
          <Drawer open={assemblySheetOpen} onOpenChange={setAssemblySheetOpen}>
            <DrawerContent className="max-h-[88svh]">
              <DrawerTitle className="sr-only">
                {t('spine.currentLora')}
              </DrawerTitle>
              <div className="space-y-3 overflow-y-auto px-4 pb-8 pt-2">
                {mobileAssemblyColumn}
              </div>
            </DrawerContent>
          </Drawer>

          {/* 结果流 + composer：单张卡内垂直堆叠，不再是 60/40 网格——
            桌面/移动只有一套顺序，26ead0d3 那次「结果优先」重排留下的
            order-1/order-2/order-3/md:col-* / md:row-* 已随三栏 grid 一起删除
            （composer 现在靠 flex 天然钉在卡底，不需要 order 补丁）。 */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="lora-flow min-h-0 flex-1 space-y-5 overflow-y-auto">
              {/* 来源图带（flow 内第一块，结果之上）：未挂载时内部全是 null，
                  直接 hidden——flex 列不像 grid 会因为空格子被 gap 顶出多余间距。
                  ⚠ B 稿把桌面/移动统一成一套顺序（来源证据 → 结果），不再是
                  26ead0d3 那套「手机结果优先、桌面来源在上」的双轨——见下方结果
                  块的说明。 */}
              <div className={cn('min-w-0', !hasLora && 'hidden')}>
                {/* 来源图带（中创作面顶）：来源图缩略带常驻（挂载显示 LoRA 效果
                证据，点图开共享配方 modal；未挂载退化成「纯底模 / 去库」引导）。
                （原「自己搭配」词库 LoraTagPicker 2026-07-24 已从生成页移除，
                待迁入助手。） */}
                <div className="space-y-2">
                  {/* B10-8 多挂载配方分组：切换器已移到脊柱条 chip（点挂载名字
                      即切来源图/配方）。这里只留一行说明当前展示的是哪个挂载的
                      来源图，把顶部切换动作和左栏结果连起来。单挂时隐藏。 */}
                  {stack.items.length > 1 && recipeGroupAsset ? (
                    <p className="truncate text-2xs text-muted-foreground">
                      {t('generate.recipeGroupActive', {
                        name: recipeGroupAsset.name,
                      })}
                    </p>
                  ) : null}
                  {hfSource ? (
                    // H1 生成侧「样例参考」（lora-workbench.md §13）：当前
                    // 分组挂载是 HF 资产——civitai 的 mined 配方链对它恒空
                    // （modelId/modelVersionId 未设），换成 HF README
                    // showcase。与下面 civitai 链互斥（hfSource 非空时不会
                    // 落进 mined.* 分支），civitai LoRA 零回归。
                    hfShowcase.isLoading ? (
                      <div className="mt-1 flex gap-1.5" aria-hidden>
                        {Array.from({ length: 4 }).map((_, idx) => (
                          <div
                            key={idx}
                            className="h-24 w-20 shrink-0 animate-pulse rounded-md bg-muted/50"
                          />
                        ))}
                      </div>
                    ) : hfShowcase.images.length > 0 ||
                      hfShowcase.prompts.length > 0 ? (
                      <LoraHuggingFaceShowcaseStrip
                        assetName={recipeGroupAsset?.name ?? ''}
                        images={hfShowcase.images}
                        prompts={hfShowcase.prompts}
                        onFillPrompt={setPrompt}
                      />
                    ) : (
                      <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                        {t('generate.recommendEmpty')}
                      </p>
                    )
                  ) : mined.isLoading ? (
                    <div className="mt-1 flex gap-1.5" aria-hidden>
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-24 w-20 shrink-0 animate-pulse rounded-md bg-muted/50"
                        />
                      ))}
                    </div>
                  ) : mined.recipes.length > 0 ? (
                    <>
                      <LoraSourceRecipeStrip
                        assetName={recipeGroupAsset?.name ?? ''}
                        baseModelFamily={
                          recipeGroupAsset?.baseModelFamily ?? ''
                        }
                        sourceUrl={
                          recipeGroupAsset
                            ? (getLoraAssetSourceUrl(recipeGroupAsset) ?? '')
                            : ''
                        }
                        recipes={mined.recipes}
                        onApplyRecipe={handleApplyRecipe}
                      />
                      {/* §4.2「常与它同挂」：配方面板元信息区下一行，去盒化
                          纯文本——数据不足（无 recipes/extras 全空/计数全 1）
                          时组件自己返回 null，不额外渲染空行。 */}
                      <LoraOftenMountedWithRow
                        extras={oftenMountedExtras}
                        statusByKey={extraMountStatusByKey}
                        onMountExtra={handleMountExtraLora}
                      />
                    </>
                  ) : mined.previewImages.length > 0 ||
                    mined.descriptionText ? (
                    // 无配方兜底：作者示例图没带 prompt 元数据时，把这些静态图
                    // 当纯预览图摆出来（点开看大图）+ 作者描述原样文本+复制，
                    // 别让推荐区空着。
                    <LoraSourceImagePreviewStrip
                      assetName={recipeGroupAsset?.name ?? ''}
                      previewImages={mined.previewImages}
                      descriptionText={mined.descriptionText}
                    />
                  ) : !hasLora ? null : ( // 来源区留空 + 锁高 grid-rows auto 让 row1 收拢，composer 得更多高。 // 不再重复「去库添加」banner（与侧边栏重复，owner 2026-07-25）。 // 无 LoRA 时来源区留空——「＋添加 LoRA」入口已在左装配栏，中栏
                    <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      {t('generate.recommendEmpty')}
                    </p>
                  )}
                </div>
              </div>
              {/* flow 内第二块（来源图带之后）：旧三栏 grid 的
                  order-1/md:order-none/md:col-* / md:row-* 已删——26ead0d3 那次
                  「手机结果优先」重排现在没有对应物了：新结构里来源图带是「参考
                  材料」而不是要跳过的输入项，两块顺序在所有断点保持一致。
                  `resultCardRef` 供生成开始时的自动滚动用（仅移动端）。 */}
              <div
                ref={resultCardRef}
                data-testid="lora-result-card"
                className="min-w-0 scroll-mt-2 space-y-3"
              >
                {/* owner 反馈（2026-09-04）：删掉「结果监视」这个常驻 eyebrow 标签——
                  mock 的结果流不带任何标题行。会话历史计数（>1 张时）保留，改成
                  独占一行右对齐，不再需要标题行陪它撑一个 justify-between。 */}
                {resultHistory.length > 1 ? (
                  <p className="text-right text-2xs text-muted-foreground/70">
                    {t('generate.resultHistoryCount', {
                      count: resultHistory.length,
                    })}
                  </p>
                ) : null}
                {/* 结果图裸浮暗面无底板——去边框/底板，仅圆角裁切；空态套虚线盒占位。
                G3d：有结果时纵横比取自快照，full 图不裁；无快照退回方形。 */}
                <div
                  className={cn(
                    // `lora-result-media`：<1024 给一条 max-height 上限（lora.css），
                    // 否则竖版 1024×1360 在 375 宽上要 500px 高，元信息行和缩略
                    // 历史全被推到折叠线以下。桌面无上限，行为不变。
                    'lora-result-media relative w-full overflow-hidden rounded-xl bg-cover bg-center',
                    // 空态**再收一档**（owner 2026-09-03 追加）：手机上结果卡排第
                    // 一，还没出过图时这个虚线盒会把提示词输入框整个压到折叠线以
                    // 下——用户进页面第一眼看不到能打字的地方。只收空态：生成中要
                    // 给进度卡留位置，完成/失败态那张图是主角，都还按上面那条 480
                    // 的上限走。判据与下面渲染分支同一条，改一处必须改两处。
                    isTrueResultEmptyState && 'lora-result-media--empty',
                    // 生成中且还没有任何结果图时，这个盒子的**全部**子元素都是
                    // absolute（边上的进度线 + 读数），内容高度为 0。旧三栏
                    // 布局里 `md:flex-1` 能从 flex 父级要到高，111bb8c8 重排成单
                    // 卡流之后父级是普通块容器，`md:flex-1` 失效、`md:aspect-auto`
                    // 又把比例撤了 → 桌面上整块塌成 0 高，进度卡直接看不见
                    // （owner 2026-09-12 报「生成中状态没了」）。给这一态一个高度
                    // 下限，结果到达后仍由图片比例接管，空态不受影响。
                    showGeneratingOverlay &&
                      !displayedResultUrl &&
                      'lora-result-media--running',
                    // CD：结果图默认竖版 1024/1360，桌面锁高时 flex-1 吃满列高
                    // （不随列宽变高）；有出图快照时改用快照自身比例。
                    !displayedAspect && 'aspect-[1024/1360] md:aspect-auto',
                    'md:min-h-0 md:flex-1',
                    // owner 反馈（2026-09-04，对照 mock）：真空态不要虚线框/底色——
                    // mock 的空态就是卡内一句居中小字，没有任何占位盒子。虚线边界
                    // 只留给「失败占位」；生成中那一格的边就是进度线（加载态 A，
                    // owner 2026-09-27），⛔ 再套一圈虚线。
                    !displayedResultUrl &&
                      !isTrueResultEmptyState &&
                      !showGeneratingOverlay &&
                      'border border-dashed border-border/50 bg-muted/20',
                  )}
                  style={{
                    ...(displayedAspect
                      ? { aspectRatio: displayedAspect }
                      : {}),
                    ...(displayedResultUrl
                      ? { backgroundImage: `url(${displayedResultUrl})` }
                      : {}),
                  }}
                >
                  {/* 生成中（加载态 A「边即进度」）：卡边就是进度线。无旧图走 full
                  （百分比 + 阶段词 + 参数行）；有旧图（重生成）走 compact，旧图
                  盖一层白纱。出图：合拢 → 停一拍 → 线淡出，白纱同一拍撤掉。与
                  GenerationPreview 同一共享组件。 */}
                  {showGeneratingOverlay && displayedResultUrl && (
                    <div
                      className={cn(
                        'absolute inset-0 bg-background/60 transition-opacity duration-base ease-linear motion-reduce:transition-none',
                        isCompletingGeneration &&
                          completionReleased &&
                          'opacity-0',
                      )}
                      aria-hidden
                    />
                  )}
                  {showGeneratingOverlay ? (
                    <StudioGeneratingProgress
                      elapsedSeconds={elapsedSeconds}
                      stageLabel={generatingStageLabel}
                      paramsLine={
                        displayedResultUrl ? undefined : generatingParamsLine
                      }
                      variant={displayedResultUrl ? 'compact' : 'full'}
                      cornerRadiusVar="--radius-xl"
                      isCompleting={isCompletingGeneration}
                      onEdgeRelease={() => setCompletionReleased(true)}
                      onCompleteAnimationDone={() =>
                        setIsCompletingGeneration(false)
                      }
                    />
                  ) : !displayedResultUrl ? (
                    // 四态之三/四：还没有任何结果时，有失败就画失败（带重试），
                    // 没失败才是空态。⚠ `mobileGenerateFailure` 在桌面恒 null，
                    // 桌面永远走空态那一支，与改动前一致。owner 反馈
                    // （2026-09-04，对照 mock）：真空态不要图标、不要两行标题——
                    // mock 就是卡内居中一句小字，`text-muted-foreground/60`≈mock
                    // 的 `--ink-3`。
                    <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
                      {mobileGenerateFailure ?? (
                        <p className="text-xs text-muted-foreground/60">
                          {t('generate.resultEmptyHint')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setResultPreviewOpen(true)}
                      aria-label={t('generate.resultPreviewLabel')}
                      className="absolute inset-0 cursor-zoom-in"
                    />
                  )}
                  {/* 取消：LoRA 出图是单次无批次（无 variant/compare），
                    `activeRun` 恒为 hook 内部为这次单图请求建的 single-item
                    批次（见 use-unified-generate 的 generateImage），jobId 在
                    提交成功那一刻就登记进 `activeJobIdsRef`——不需要在这里
                    额外补登记。位置/尺寸与 GenerationPreview 的取消键同款，
                    只在生成中显示，与下面「问助手」（生成中不给）互斥不重叠。 */}
                  {showGeneratingOverlay &&
                  activeRun?.mode === 'single' &&
                  activeRun.items[0] ? (
                    <button
                      type="button"
                      onClick={() => cancelRunItem(activeRun.items[0].id)}
                      data-testid="lora-generation-cancel"
                      aria-label={tCancel('cancel')}
                      className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-background/85 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                      <span className="sr-only">{tCancel('cancel')}</span>
                    </button>
                  ) : null}
                  {/* 「问助手」：把**当前展示的**那张结果图挂进助手输入区并把
                      助手展开（§3.0b 第 4 条在装配台的落点）。缩略条切哪张，
                      这里就问哪张——URL 取 displayedResultUrl 而不是最新一张。
                      ⚠ 必须渲染在放大按钮**之后**且 z-10：那个按钮是
                      `absolute inset-0` 盖满整张图的，排在它前面就点不到。
                      ⚠ 不做 hover-only：本页触屏照样渲染，纯触屏没有 hover，
                      hover-only 等于把它从可达变成不可达（与 CompareGrid 同一
                      判据）。生成中不给——那时展示的是上一张的残影，问的和看到
                      的会对不上。 */}
                  {displayedResultUrl && !showGeneratingOverlay ? (
                    <button
                      type="button"
                      aria-label={tStudioV3('toolAskAssistant')}
                      title={tStudioV3('toolAskAssistant')}
                      onClick={() =>
                        handleAskAssistantAboutResult(displayedResultUrl)
                      }
                      className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background hover:text-primary focus-visible:bg-background focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <Bot className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>

                {/* 出图耗时提示（owner 2026-09-12）：Runner 是自托管 GPU worker，
                    首次要先把底模加载进显存，比之后慢一个量级——不说清楚，用户
                    会以为卡死了。常态给保守区间，首次换成「先加载底模」的说法。
                    只在生成中出现，且只给 Runner 线路（hosted 没有冷启动）。 */}
                {showGeneratingOverlay && isRunnerBase ? (
                  <p
                    data-testid="lora-generating-eta"
                    role="status"
                    className="animate-in fade-in-0 text-center text-xs text-muted-foreground duration-base ease-standard motion-reduce:animate-none"
                  >
                    {isRunnerColdStart
                      ? t(
                          'generate.etaColdStart',
                          LORA_RUNNER_COLD_START_MINUTES,
                        )
                      : t('generate.eta', LORA_RUNNER_ETA_SECONDS)}
                  </p>
                ) : null}

                {/* 已有旧图时新一轮失败：旧图保留在上面（还能看、还能问助手），
                    失败与重试排在图下。无旧图那一支画在框内（见上）。 */}
                {displayedResultUrl ? mobileGenerateFailure : null}

                {/* G3d 结果元信息：① 尺寸 · 步数 · 种子 ② 主 LoRA×强度 · 底模。
                取自选中结果的 gen-time 快照；仅有结果时显示。 */}
                {displayedResultUrl &&
                (resultMetaParts.length > 0 || resultAssemblyLine) ? (
                  <div className="space-y-0.5">
                    {resultMetaParts.length > 0 ? (
                      <p className="font-mono text-2xs text-muted-foreground">
                        {resultMetaParts.join(' · ')}
                      </p>
                    ) : null}
                    {resultAssemblyLine ? (
                      <p className="text-2xs text-muted-foreground/70">
                        {resultAssemblyLine}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* D7③: 会话级结果 filmstrip——多于一张时显示，点缩略切主图，
                每张带 s×.×× · seed 角标。会话内存，刷新清空。 */}
                {resultHistory.length > 1 ? (
                  <div
                    className="lora-scrollbar-hide flex gap-2 overflow-x-auto pb-1"
                    role="listbox"
                    aria-label={t('generate.resultHistoryLabel')}
                  >
                    {resultHistory.map((item) => {
                      const isActive = item.id === selectedResult?.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => setSelectedResultId(item.id)}
                          title={
                            item.seed != null
                              ? t('generate.resultHistoryMeta', {
                                  scale:
                                    item.scale != null
                                      ? item.scale.toFixed(2)
                                      : '—',
                                  seed: item.seed,
                                })
                              : undefined
                          }
                          className={cn(
                            'group relative aspect-square h-16 shrink-0 overflow-hidden rounded-lg border bg-muted/30 bg-cover bg-center transition-colors',
                            isActive
                              ? 'border-primary ring-1 ring-primary'
                              : 'border-border/60 hover:border-primary/40',
                          )}
                          style={{ backgroundImage: `url(${item.url})` }}
                        >
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-3xs leading-tight text-white/90">
                            {item.scale != null
                              ? `s${item.scale.toFixed(2)}`
                              : ''}
                            {item.scale != null && item.seed != null
                              ? ' · '
                              : ''}
                            {item.seed != null ? item.seed : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* composer：flow 下方的输入条，border-top + shrink-0，flex 天然钉
              在卡底——不再是 60/40 网格里的一格。深炭工作台输入面，语义色板走
              标准暗主题 token（发丝边框 border-border / 浅灰次文本
              muted-foreground / 白丸出图）——不再依赖已退役、且从未编译进样式表
              的 .lora-generate-input 象牙 token 重定义（G3 contrast 修）。 */}
            <div
              data-testid="lora-composer-card"
              // owner 验收发现（2026-09-04）：composer 重排时漏加了横向内距——
              // `.lora-composer`（lora.css）本身只是定位类，实际间距要靠这里的
              // Tailwind 工具类给，之前一个都没给，导致负面摘要贴着卡边渲染
              // （真机量得只剩 1px）。补回 mock 的量（桌面 12px/16px，手机
              // 10px/10px，`lg` 断点与 `useIsMobile` 同界）。
              className="lora-composer shrink-0 space-y-2.5 border-t border-border px-2.5 py-2.5 lg:px-4 lg:py-3"
            >
              {isMountingExtras && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t('sourceRecipeMounting')}
                </p>
              )}
              {/* S7 移动端：装配摘要 chip 行——B 稿把它从旧的「结果卡上方独立
                小卡」挪到 composer 顶部（mock 的手机版 composer 也是 chips 行
                在输入行之上），点开的仍是同一个 assemblySheetOpen 抽屉。 */}
              <button
                type="button"
                onClick={() => setAssemblySheetOpen(true)}
                aria-label={t('spine.openAssembly')}
                className="flex w-full items-center gap-1.5 overflow-x-auto text-left"
              >
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-2xs text-foreground">
                  <Boxes
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {selectedBase
                    ? selectedBase.translationKey
                      ? t(`spine.${selectedBase.translationKey}`)
                      : selectedBase.displayName
                    : t('spine.baseModelPending')}
                </span>
                {stack.items.map((item) => (
                  <span
                    key={item.asset.id}
                    className="inline-flex max-w-28 shrink-0 items-center gap-1 truncate rounded-full border border-border/60 px-2 py-1 text-2xs text-foreground"
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full bg-status-applied"
                    />
                    <span className="truncate">{item.asset.name}</span>
                  </span>
                ))}
                <span className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground">
                  <Plus className="size-3.5" aria-hidden />
                </span>
              </button>
              {/* G3b-2b 搭配状态条（Prompt 上方单行）：一眼读到已应用来源配方 +
                触发词×N，点查看展开（配方参数 + 可停用的触发词 chip），点撤销把
                做同款前的输入快照整批回滚。触发词 chips 并入其展开，不再独占一行。 */}
              <LoraCollocationStatusBar
                sourceKind="recipe"
                recipeApplied={collocationRecipe != null}
                recipeName={collocationRecipe?.assetName ?? null}
                appliedParamLabels={collocationRecipe?.appliedParamLabels ?? []}
                changedParams={collocationChanges.changed}
                addedPromptTags={collocationChanges.addedPrompt}
                keptLabels={collocationChanges.kept}
                triggerEntries={triggerChipEntries}
                disabledTriggerIds={disabledTriggerIds}
                onToggleTrigger={handleToggleTriggerChip}
                onUndo={handleUndoRecipe}
                pendingReview={collocationPending}
                onApplyPending={handleApplyPendingCollocation}
                expanded={collocationExpanded}
                onExpandedChange={setCollocationExpanded}
              />
              {/* owner 反馈（2026-09-04，对照 lora-b-mock.html 逐条改）：composer
                不再是一张带标签的高输入卡——提示词是单行起随内容增高的行内输入
                （field-sizing: content，见 lora.css `.lora-prompt-input`），出图钮
                挂在它右侧的黑色胶囊，不是压在卡底的通栏大按钮。整条输入条空态
                目标高度 ~90–110px（12px×2 内距 + 单行输入 + chip 行）。 */}
              <div className="flex items-end gap-2">
                {/* CD④：触发词在正文里高亮。背板层排同一段字（透明）只负责画
                      底色 + 下边线，可见文字仍来自压在上面的 textarea——两层的
                      排版与内边距通过共同的 lora-prompt-layout 对齐。 */}
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="lora-prompt" className="sr-only">
                    {t('generate.promptLabel')}
                  </label>
                  <PromptTriggerHighlight
                    text={prompt}
                    phrases={triggerHighlightPhrases}
                    backdropRef={promptBackdropRef}
                  />
                  <textarea
                    id="lora-prompt"
                    ref={promptTextareaRef}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onScroll={handlePromptScroll}
                    placeholder={t('generate.promptPlaceholder')}
                    rows={1}
                    // `.lora-prompt-input`（lora.css）：field-sizing: content 让它
                    // 跟着内容从一行长到约 4 行封顶，超过封顶内部滚动——不用 JS 量
                    // 高度，`field-sizing` 不支持的浏览器退回单行高度（不会更糟）。
                    className="lora-prompt-layout lora-prompt-input relative block w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                  />
                  <PromptTagAutocomplete
                    textareaRef={promptTextareaRef}
                    value={prompt}
                    onChange={setPrompt}
                    polarity="positive"
                  />
                </div>
                {/* 出图 = 黑色胶囊，紧挨提示词右侧（mock「✦ 出图」）——不再是压在
                  composer 最底的通栏大按钮。⚠ 本域是单次出图、没有张数字段
                  （本域单次出图，没有张数控件），
                  所以胶囊上没有 mock 示例图里的「×N」——那是 mock 的示例文案，
                  不是本域真实存在的参数。 */}
                <Button
                  type="button"
                  className="lora-send h-9 shrink-0 rounded-full px-4 text-xs font-semibold"
                  disabled={!canGenerate}
                  onClick={() => handleGenerateClick()}
                >
                  {isGenerating ? (
                    <Spinner size="sm" aria-hidden />
                  ) : (
                    <Sparkles className="size-3.5" aria-hidden />
                  )}
                  {t('generate.run')}
                </Button>
              </div>
              {/* 第二行 chip：忠实还原 / 比例 —— 与 LoraAspectRatioChip 同一套胶囊
                样式（`inline-flex h-8 rounded-full border px-2.5 text-xs`）手写一份，
                这两颗不是 Popover，不值得为了共享 4 行样式再抽组件。负面 Prompt
                收进这一行末尾，内联摘要「负面 bad hands, blurry…」，不再独占一整
                行通栏——点它展开下方的编辑区（同一个 `.lora-reveal` 折叠机制）。 */}
              {/* owner 验收发现（2026-09-04）：负面摘要文字在桌面/手机都溢出卡边。
                根因是 `max-w-[60%]`（Tailwind 任意值，Hard Rule 5 本就不该用）
                在 `flex-wrap` 行里不是可靠的收缩约束——摘要按钮拿到的是内容自身
                宽度，超出卡宽的部分被 `.workbench-card` 的 `overflow:hidden`
                硬裁掉（没有省略号，看起来像文字被卡边切断）。改成标准 flexbox
                收缩链：行给 `min-w-0`，摘要按钮 `flex-1 min-w-0`，容许它在
                「忠实还原/比例」两颗定宽 chip 之后吃剩余空间并在需要时收缩到 0
                触发内部 truncate。 */}
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!activeAsset || isGenerating}
                  onClick={handleRestore}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground disabled:opacity-50"
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  {t('generate.restore')}
                </button>
                <LoraAspectRatioChip
                  value={aspectRatio}
                  onChange={handleAspectRatioChange}
                  disabled={isGenerating}
                />
                <LoraNegativeInertHint
                  inert={negativeInert}
                  hint={t('generate.negativeInert')}
                >
                  <button
                    type="button"
                    aria-expanded={negativePromptExpanded && !negativeInert}
                    aria-disabled={negativeInert}
                    onClick={() => {
                      if (negativeInert) return
                      setNegativePromptExpanded((open) => !open)
                    }}
                    className={cn(
                      'ml-auto flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left text-2xs text-muted-foreground/80 transition-colors duration-fast ease-linear hover:text-foreground',
                      negativeInert &&
                        'cursor-not-allowed text-muted-foreground/50 hover:text-muted-foreground/50',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 font-medium uppercase tracking-wide',
                        negativeInert &&
                          'underline decoration-dashed underline-offset-4',
                      )}
                    >
                      {t('generate.negativePromptLabel')}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground/70">
                      {negativePrompt.trim() ||
                        t('generate.negativePromptPlaceholder')}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-3 shrink-0 transition-transform',
                        negativePromptExpanded &&
                          !negativeInert &&
                          'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                </LoraNegativeInertHint>
              </div>
              {/* 展开/收起走 grid-rows 过渡（.lora-reveal），收起时 inert 挡住焦点
                与读屏。视觉上退成一个圈起来的小面板，紧贴在 chip 行下面。CFG 1 底模
                时收起（内容留着，换回来原样展开）。 */}
              <div
                className="lora-reveal"
                data-open={
                  negativePromptExpanded && !negativeInert ? 'true' : 'false'
                }
              >
                <div inert={!negativePromptExpanded || negativeInert}>
                  <div className="space-y-1 rounded-xl border border-border bg-muted/20 px-3 py-2">
                    <textarea
                      ref={negativePromptTextareaRef}
                      value={negativePrompt}
                      onChange={(event) =>
                        setNegativePrompt(event.target.value)
                      }
                      placeholder={t('generate.negativePromptPlaceholder')}
                      rows={2}
                      className="w-full resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-xs"
                    />
                    <PromptTagAutocomplete
                      textareaRef={negativePromptTextareaRef}
                      value={negativePrompt}
                      onChange={setNegativePrompt}
                      polarity="negative"
                    />
                  </div>
                </div>
              </div>
              {/* §4.1 不兼容挂载警示：不阻断出图，与 runner 额度提示同区同形制
                （琥珀 text-2xs）。互斥时退化成"卸载其一"，不给假建议。 */}
              {incompatibleCount > 0 ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-status-warning">
                  <AlertTriangle className="size-3 shrink-0" aria-hidden />
                  <span>
                    {t('generate.incompatibleMountsWarning', {
                      n: incompatibleCount,
                    })}
                  </span>
                  {mountsMutuallyExclusive ? (
                    <span>{t('generate.mountsMutuallyExclusive')}</span>
                  ) : canSuggestBaseSwitch && suggestedBaseLabel ? (
                    <button
                      type="button"
                      onClick={handleSwitchToSuggestedBase}
                      className="underline underline-offset-2 hover:text-status-warning"
                    >
                      {t('generate.switchToSuggestedBase', {
                        base: suggestedBaseLabel,
                      })}
                    </button>
                  ) : null}
                </p>
              ) : null}
              {/* B 稿：主动额度提示已迁到 rail 底部（`runnerBudgetNote`，见
                assemblyColumn 定义处）——不再挤在 composer 里，composer 是卡内
                固定钉底的输入条，多一行文字在窄屏会把它顶出卡/视口。 */}
              {/* S2精修①-B：Runner 高级参数已迁到左装配栏（runnerParamsPanel）。 */}
              {generateError ? (
                <p role="alert" className="text-xs text-destructive">
                  {generateError}
                </p>
              ) : null}
            </div>
          </div>
        </section>
        <StudioOperatorDock />
      </StudioOperatorHostProvider>
    )
  }

  // ── 桌面（≥1024）：生成台 B（lora-generate.md §2）──────────────────────────
  // 来源图带（§2.2）：没挂 LoRA 不出现；出图中与出过图都收成一行（结果卡是主角，
  // owner 09-29「图片太小了」），点它长回整条。
  // 失败也留在原地说为什么（加载态 A），同样是结果卡在说话。
  const stageHasResult =
    displayedResultUrl !== null ||
    showGeneratingOverlay ||
    Boolean(generateError)
  const bandMode: LoraSourceBandMode = !hasLora
    ? 'hidden'
    : stageHasResult && !bandExpanded
      ? 'line'
      : 'open'
  const bandKind = hfSource
    ? hfShowcase.isLoading
      ? 'loading'
      : hfShowcase.images.length > 0 || hfShowcase.prompts.length > 0
        ? 'showcase'
        : 'empty'
    : mined.isLoading
      ? 'loading'
      : mined.recipes.length > 0
        ? 'recipes'
        : mined.previewImages.length > 0 || mined.descriptionText
          ? 'previews'
          : 'empty'
  const bandImages =
    bandKind === 'showcase'
      ? hfShowcase.images
      : bandKind === 'recipes'
        ? mined.recipes.map((recipe) =>
            civitaiDisplayImageUrl(recipe.imageUrl, LORA_CHIP_THUMBNAIL_WIDTH),
          )
        : bandKind === 'previews'
          ? mined.previewImages.map((image) =>
              civitaiDisplayImageUrl(image.imageUrl, LORA_CHIP_THUMBNAIL_WIDTH),
            )
          : []
  const bandContent =
    bandKind === 'loading' ? (
      <div className="flex gap-2.5" aria-hidden>
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-22 w-16.5 shrink-0 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    ) : bandKind === 'showcase' ? (
      <LoraHuggingFaceShowcaseStrip
        size="band"
        assetName={recipeGroupAsset?.name ?? ''}
        images={hfShowcase.images}
        prompts={hfShowcase.prompts}
        onFillPrompt={setPrompt}
      />
    ) : bandKind === 'recipes' ? (
      <LoraSourceRecipeStrip
        size="band"
        onOpenViewer={openViewer}
        assetName={recipeGroupAsset?.name ?? ''}
        baseModelFamily={recipeGroupAsset?.baseModelFamily ?? ''}
        sourceUrl={
          recipeGroupAsset
            ? (getLoraAssetSourceUrl(recipeGroupAsset) ?? '')
            : ''
        }
        recipes={mined.recipes}
        onApplyRecipe={handleApplyRecipe}
      />
    ) : bandKind === 'previews' ? (
      <LoraSourceImagePreviewStrip
        size="band"
        assetName={recipeGroupAsset?.name ?? ''}
        previewImages={mined.previewImages}
        descriptionText={mined.descriptionText}
      />
    ) : (
      <p className="pb-1 text-xs text-muted-foreground">
        {t('generate.band.empty')}
      </p>
    )

  // 图下右侧那行元信息：只写这一张真的带着的值（快照里空着的格子省略）。
  const resultMetaLine = selectedResult
    ? [
        selectedResult.width != null && selectedResult.height != null
          ? `${selectedResult.width}×${selectedResult.height}`
          : null,
        selectedResult.sampler,
        selectedResult.steps != null
          ? t('generate.resultMetaSteps', { steps: selectedResult.steps })
          : null,
        selectedResult.cfg != null ? `CFG ${selectedResult.cfg}` : null,
        selectedResult.seed != null
          ? t('generate.resultMetaSeed', { seed: selectedResult.seed })
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · ') || null
    : null

  // 「比例」chip：与图片台同一颗 `SpecChip`，只有比例一段；Runner 底模在虚线下多一格
  // 精确宽高。本域一次出一张，⛔ 不画张数。
  const specModel: SpecChipModel = {
    ratios: LORA_GENERATE_ASPECT_RATIOS.map((value) => ({
      value,
      supported: true,
    })),
    ratioLocked: false,
    resolutions: [],
    durations: [],
    durationSeconds: null,
    pricePerSecond: null,
    totalPrice: null,
    summary: aspectRatio,
    resolutionNote: null,
    isEmpty: false,
  }
  const exactSizeSet =
    isRunnerBase &&
    runnerWidth.trim().length > 0 &&
    runnerHeight.trim().length > 0 &&
    runnerDimensionError === null
  const exactSizeFields = isRunnerBase ? (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('generate.exactSizeLabel')}
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={512}
          max={selectedBase?.family === 'anima-dit' ? 1536 : 2048}
          step={8}
          value={runnerWidth}
          onChange={(event) => setRunnerWidth(event.target.value)}
          placeholder={String(previewDimensions.width)}
          aria-label={t('generate.advanced.width')}
          className="h-8 w-24 border-border bg-transparent font-mono text-xs tabular-nums"
        />
        <span aria-hidden className="text-muted-foreground">
          ×
        </span>
        <Input
          type="number"
          min={512}
          max={selectedBase?.family === 'anima-dit' ? 1536 : 2048}
          step={8}
          value={runnerHeight}
          onChange={(event) => setRunnerHeight(event.target.value)}
          placeholder={String(previewDimensions.height)}
          aria-label={t('generate.advanced.height')}
          className="h-8 w-24 border-border bg-transparent font-mono text-xs tabular-nums"
        />
      </div>
      {runnerDimensionError ? (
        <p role="alert" className="text-xs text-status-risk">
          {runnerDimensionError}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('generate.exactSizeHint', {
            max: selectedBase?.family === 'anima-dit' ? 1536 : 2048,
          })}
        </p>
      )}
    </div>
  ) : undefined

  const negativeShown =
    !negativeInert && (negativePromptExpanded || negativePrompt.trim() !== '')
  // 参考图只在底模吃参考图时出现（能力位驱动，与手机装配抽屉同一个判据）。
  const referencesSupported =
    maxReferenceImages > 0 && referenceStrengthConfig !== undefined
  const shownMissingTriggers =
    missingTriggers.length > 0 ? missingTriggers : lastMissingTriggers
  const collocationRecipeApplied = collocationRecipe != null
  const collocationVisible =
    hasLora && (collocationRecipeApplied || incompatibleCount > 0)
  // 「搭配」条平时收成工具行最左一颗；有装不上的、待审阅、或点开了明细时照常整行（§2.4）。
  const collocationSlim =
    collocationRecipeApplied &&
    incompatibleCount === 0 &&
    !collocationPending &&
    !collocationExpanded
  const negativePreviewShown =
    negativeShown && !composerExpanded && negativePrompt.trim() !== ''

  return (
    <StudioOperatorHostProvider host={shellHost}>
      {sharedDialogs}

      {/* 舞台（§2.1–2.3）：左边装配列，右边 来源图带 → 结果。 */}
      <section
        aria-label={t('stageLabel')}
        className="workbench-card min-h-0 flex-row"
      >
        <LoraAssemblyColumn
          compatibleBases={compatibleBases}
          selectedBase={selectedBase}
          onSelectBase={handleSelectBase}
          needsKeySetup={needsKeySetup}
          onRequestKeySetup={() =>
            workspaceOptionForBase && openKeySetupFor(workspaceOptionForBase)
          }
          loraScaleConfig={loraScaleConfig}
          onAddLora={onOpenLibrary}
          // 在库里整列让成竖条；回到生成台时回到你自己收没收的那一档。
          collapsed={libraryActive || assemblyCollapsed}
          onCollapsedChange={setAssemblyCollapsed}
          onReturn={libraryActive ? onReturnToGenerate : undefined}
          oftenMounted={
            <LoraOftenMountedWithRow
              variant="column"
              extras={oftenMountedExtras}
              statusByKey={extraMountStatusByKey}
              onMountExtra={handleMountExtraLora}
            />
          }
          budget={runnerBudgetNote ?? undefined}
        />
        <div className="relative min-w-0 flex-1">
          {/* 生成这一层：进库 120 淡出，回来等 120 再 200 淡入；看不见时挂 inert。 */}
          <div
            ref={stageRightRef}
            inert={libraryActive}
            aria-hidden={libraryActive || undefined}
            className={cn(
              'absolute inset-0 flex min-w-0 flex-col transition-opacity ease-linear',
              libraryActive
                ? 'pointer-events-none opacity-0 duration-fast'
                : 'opacity-100 delay-120 duration-base motion-reduce:delay-0 motion-reduce:duration-fast',
            )}
          >
            <LoraSourceBand
              mode={bandMode}
              onExpand={() => setBandExpanded(true)}
              onFold={() => setBandExpanded(false)}
              canFold={stageHasResult}
              // 出过图之后点开是浮层，盖在图上不推图（§2.2，owner 09-29 第二轮 A）；
              // 样例大图开着时点外面 / Esc 交给大图，浮层留着接着挑。
              overlay={stageHasResult}
              dismissible={!viewerOpen}
              groups={stack.items.map((item) => ({
                id: item.asset.id,
                name: item.asset.name,
                cover: item.asset.coverImageUrl ?? null,
              }))}
              activeGroupId={recipeGroupKey}
              onSelectGroup={setRecipeGroupAssetId}
              count={bandKind === 'loading' ? null : bandImages.length}
              note={
                bandKind === 'recipes'
                  ? t('generate.band.noteRecipe')
                  : bandKind === 'showcase' || bandKind === 'previews'
                    ? t('generate.band.noteShowcase')
                    : ''
              }
              lineThumbs={bandImages.slice(0, 3)}
            >
              {bandContent}
            </LoraSourceBand>
            <LoraResultStage
              resultUrl={displayedResultUrl}
              resultRatio={displayedAspect}
              pendingRatio={previewDimensions.width / previewDimensions.height}
              generating={showGeneratingOverlay}
              isCompleting={isCompletingGeneration}
              completionReleased={completionReleased}
              onEdgeRelease={() => setCompletionReleased(true)}
              onCompleteAnimationDone={() => setIsCompletingGeneration(false)}
              elapsedSeconds={elapsedSeconds}
              stageLabel={generatingStageLabel}
              paramsLine={generatingParamsLine}
              failure={
                !isGenerating && generateError
                  ? {
                      message: generateError,
                      retryLabel: t('generate.resultFailedRetry'),
                      ...(canGenerate ? { onRetry: handleGenerateClick } : {}),
                    }
                  : null
              }
              onCancel={
                isGenerating && activeGenerateItem
                  ? () => cancelRunItem(activeGenerateItem.id)
                  : undefined
              }
              onOpenPreview={() => setResultPreviewOpen(true)}
              onAskAssistant={() =>
                displayedResultUrl &&
                handleAskAssistantAboutResult(displayedResultUrl)
              }
              templateSave={
                selectedResult && selectedResult.url === displayedResultUrl
                  ? {
                      state: templateSaves[selectedResult.id] ?? 'idle',
                      onSave: () => void handleSaveTemplate(selectedResult),
                    }
                  : undefined
              }
              hint={
                hasLora ? t('generate.hintWithLora') : t('generate.hintPure')
              }
              round={resultHistory}
              selectedId={selectedResult?.id ?? null}
              onSelect={setSelectedResultId}
              meta={resultMetaLine}
              eta={
                isGenerating && isRunnerBase
                  ? isRunnerColdStart
                    ? t('generate.etaColdStart', LORA_RUNNER_COLD_START_MINUTES)
                    : t('generate.eta', LORA_RUNNER_ETA_SECONDS)
                  : null
              }
            />
            <LoraRecipeViewer
              open={viewerOpen && bandKind === 'recipes'}
              origin={viewerOrigin}
              recipes={mined.recipes}
              index={Math.min(
                viewerIndex,
                Math.max(0, mined.recipes.length - 1),
              )}
              onIndexChange={setViewerIndex}
              onClose={closeViewer}
              assetName={recipeGroupAsset?.name ?? ''}
              sourceUrl={
                recipeGroupAsset
                  ? (getLoraAssetSourceUrl(recipeGroupAsset) ?? '')
                  : ''
              }
              mountedExtraKeys={mountedExtraKeys}
              extraStatusByKey={extraMountStatusByKey}
              onApplyRecipe={(recipe, includeSeed, extraLoras) =>
                handleApplyRecipe(recipe, { includeSeed, extraLoras })
              }
            />
          </div>
          {/* 库这一层：进来等生成那层淡出（120）再 200 淡入，离开 120 淡出；库 ↔ 收藏
            外壳不动，只有内容先淡出再淡入另一边的（动效表「库 ↔ 收藏」）。 */}
          <AnimatePresence initial={false}>
            {library ? (
              <motion.div
                key="library"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: {
                    duration: DURATION.base,
                    delay: reduceMotion ? 0 : DURATION.fast,
                    ease: 'linear',
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: DURATION.fast, ease: 'linear' },
                }}
                className="absolute inset-0 flex min-w-0 flex-col"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={library.key}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { duration: DURATION.base, ease: 'linear' },
                    }}
                    exit={{
                      opacity: 0,
                      transition: { duration: DURATION.fast, ease: 'linear' },
                    }}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <LoraStageProvider value={stageContext}>
                      {library.content}
                    </LoraStageProvider>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </section>

      {/* 输入框（§2.4）：搭配状态条 → 提示词 → 负面词（原位展开）→ 工具行。
          进库时收起（320，连同上面那道 12px 行距 = 外层 gap-3 一起收），回来长回。 */}
      <motion.div
        initial={false}
        animate={
          libraryActive
            ? { height: 0, marginTop: -12, opacity: 0 }
            : { height: 'auto', marginTop: 0, opacity: 1 }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: DURATION.slow, ease: EASE_STANDARD }
        }
        onAnimationStart={() => setComposerFolding(true)}
        onAnimationComplete={() => setComposerFolding(false)}
        inert={libraryActive}
        aria-hidden={libraryActive || undefined}
        className={cn(
          'shrink-0',
          (libraryActive || composerFolding) && 'overflow-hidden',
        )}
      >
        <div
          ref={composerCardRef}
          data-testid="lora-composer-card"
          data-expanded={composerExpanded ? 'true' : 'false'}
          onBlur={(event) => {
            // 键盘 Tab 出输入框也算「离开」；焦点进 chip 弹层 / 标签补全不算。
            if (
              composerExpanded &&
              event.relatedTarget &&
              !isInsideComposer(event.relatedTarget)
            ) {
              collapseComposer()
            }
          }}
          onDragEnter={
            referencesSupported ? imageUpload.handleDragEnter : undefined
          }
          onDragOver={
            referencesSupported ? imageUpload.handleDragOver : undefined
          }
          onDragLeave={
            referencesSupported ? imageUpload.handleDragLeave : undefined
          }
          onDrop={
            referencesSupported
              ? (event) => void imageUpload.handleDrop(event)
              : undefined
          }
          className={cn(
            '@container/composer relative flex shrink-0 flex-col gap-2.5 rounded-2xl bg-card px-4.5 pt-3.5 pb-3 shadow-float transition-shadow duration-fast',
            composerExpanded && 'ring-1 ring-foreground',
            referencesSupported &&
              imageUpload.isDragging &&
              'ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
          )}
        >
          {isMountingExtras ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t('sourceRecipeMounting')}
            </p>
          ) : null}
          {collocationVisible ? (
            <div
              className="lora-mixwrap lora-mixwrap--composer"
              data-open={
                composerExpanded || !collocationSlim ? 'true' : 'false'
              }
            >
              <div inert={!(composerExpanded || !collocationSlim)}>
                <div className="flex flex-col gap-2.5">
                  <LoraCollocationBar
                    sourceKind="recipe"
                    recipeApplied={collocationRecipeApplied}
                    recipeName={collocationRecipe?.assetName ?? null}
                    appliedParamLabels={
                      collocationRecipe?.appliedParamLabels ?? []
                    }
                    changedParams={collocationChanges.changed}
                    addedPromptTags={collocationChanges.addedPrompt}
                    keptLabels={collocationChanges.kept}
                    onUndo={handleUndoRecipe}
                    pendingReview={collocationPending}
                    onApplyPending={handleApplyPendingCollocation}
                    expanded={collocationExpanded}
                    onExpandedChange={setCollocationExpanded}
                    incompatibleCount={incompatibleCount}
                    mutuallyExclusive={mountsMutuallyExclusive}
                    onSwitchBase={
                      canSuggestBaseSwitch
                        ? handleSwitchToSuggestedBase
                        : undefined
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          {/* 参考图住在输入框里（owner 09-28）：挂了才出现，排在提示词上方；粘贴 /
            拖进输入框 / 工具行「参考图」三条来路落到同一份 imageUpload。 */}
          {referencesSupported ? (
            <>
              <div
                className="lora-mixwrap"
                data-open={
                  imageUpload.referenceEntries.length > 0 ? 'true' : 'false'
                }
              >
                <div inert={imageUpload.referenceEntries.length === 0}>
                  <ImageAttachmentPreviewStrip
                    entries={
                      imageUpload.referenceEntries.length > 0
                        ? imageUpload.referenceEntries
                        : lastReferences.entries
                    }
                    previewAlt={tImageChip('referenceLabel')}
                    previewLabel={(index) =>
                      tImageChip('previewReferenceImage', { index })
                    }
                    previewDescription={tImageChip(
                      'previewReferenceDescription',
                    )}
                    previewCloseLabel={tImageChip('closeReferencePreview')}
                    removeLabel={(index) =>
                      tImageChip('removeReferenceImage', { index })
                    }
                    onRemove={imageUpload.removeReferenceImage}
                    overLimitTooltip={tImageChip('disabledOverLimit')}
                    unsupportedTooltip={tImageChip('disabledUnsupported')}
                    variant="composer"
                    className="px-0.5 pt-0 pb-0"
                  />
                </div>
              </div>
              {imageUpload.isUploading ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Spinner aria-hidden="true" className="size-3.5 shrink-0" />
                  {tImageUpload('uploading')}
                </p>
              ) : null}
            </>
          ) : null}
          {/* 提示词：触发词就写在这里（owner 09-28），在正文里高亮（背板与 textarea
            逐字对齐，两边同一套字号 / 行高 / 内边距）；跟着内容长高，写字时封顶 4 行后
            内部滚动 —— 输入框再高就把舞台挤没了；平时只露 2 行（§2.4 收薄）。 */}
          <div
            className={cn(
              'relative min-w-0',
              promptClamped && 'lora-prompt-clamped',
            )}
          >
            <label htmlFor="lora-prompt" className="sr-only">
              {t('generate.promptLabel')}
            </label>
            <PromptTriggerHighlight
              text={prompt}
              phrases={triggerHighlightPhrases}
              backdropRef={promptBackdropRef}
              className="text-md leading-6 md:text-md"
            />
            <textarea
              id="lora-prompt"
              ref={promptTextareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onScroll={handlePromptScroll}
              onFocus={() => setComposerExpanded(true)}
              onPaste={
                referencesSupported
                  ? (event) => {
                      const file = getImageFileFromDataTransfer(
                        event.clipboardData,
                      )
                      if (!file) return
                      event.preventDefault()
                      void imageUpload.handleFileChange(file)
                    }
                  : undefined
              }
              placeholder={t('generate.promptPlaceholder')}
              rows={2}
              className={cn(
                'lora-prompt-layout lora-prompt-slim relative block min-h-15 w-full resize-none bg-transparent text-md leading-6 text-foreground outline-none field-sizing-content placeholder:text-muted-foreground/70',
                composerExpanded
                  ? 'max-h-27 overflow-y-auto'
                  : 'max-h-15 cursor-text overflow-y-hidden',
              )}
            />
            <PromptTagAutocomplete
              textareaRef={promptTextareaRef}
              value={prompt}
              onChange={setPrompt}
              polarity="positive"
            />
          </div>
          {/* 没写进正文的触发词（作者没认过的那种、或被你删掉的）：提示词下面一小行
            「触发词 ＋词」，点一下写到正文开头。⛔ 出图时不会替你偷偷加。开合与
            负面词那一行同一套（.lora-mixwrap）；关的那一拍留着上一排字。 */}
          <div
            className="lora-mixwrap lora-mixwrap--composer"
            data-open={
              missingTriggers.length > 0 && composerExpanded ? 'true' : 'false'
            }
          >
            <div inert={missingTriggers.length === 0 || !composerExpanded}>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                <span className="mr-0.5 text-muted-foreground">
                  {t('spine.triggerWords')}
                </span>
                {shownMissingTriggers.map((entry) => (
                  <button
                    key={entry.assetId}
                    type="button"
                    onClick={() => handleToggleTriggerChip(entry.assetId)}
                    aria-label={t('generate.triggerAdd', {
                      word: entry.triggerWord,
                    })}
                    title={t('generate.triggerAdd', {
                      word: entry.triggerWord,
                    })}
                    className="inline-flex h-6.5 min-w-0 max-w-64 items-center gap-1 rounded-full border border-dashed border-foreground/25 px-2.5 text-muted-foreground transition-colors duration-fast hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-3 shrink-0" aria-hidden />
                    <span className="truncate font-mono">
                      {entry.triggerWord}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* 负面词：点工具行「负面」才出现，写了内容就一直在（与图片台同一条）；
            平时收成下面那一行预览，写字时才整块展开。 */}
          <div
            className="lora-mixwrap lora-mixwrap--composer"
            data-open={negativeShown && composerExpanded ? 'true' : 'false'}
          >
            <div inert={!(negativeShown && composerExpanded)}>
              <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2">
                <label
                  htmlFor="lora-negative-prompt"
                  className="shrink-0 pt-0.5 text-2xs font-medium text-muted-foreground"
                >
                  {t('generate.negativePromptLabel')}
                </label>
                <div className="relative min-w-0 flex-1">
                  <textarea
                    id="lora-negative-prompt"
                    ref={negativePromptTextareaRef}
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                    onFocus={() => setComposerExpanded(true)}
                    placeholder={t('generate.negativePromptPlaceholder')}
                    rows={1}
                    className="block max-h-24 min-h-5 w-full resize-none bg-transparent text-2sm leading-5 outline-none field-sizing-content placeholder:text-muted-foreground/60"
                  />
                  <PromptTagAutocomplete
                    textareaRef={negativePromptTextareaRef}
                    value={negativePrompt}
                    onChange={setNegativePrompt}
                    polarity="negative"
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            className="lora-mixwrap lora-mixwrap--composer"
            data-open={negativePreviewShown ? 'true' : 'false'}
          >
            <div inert={!negativePreviewShown}>
              <button
                type="button"
                data-testid="lora-negative-preview"
                onClick={() => {
                  setComposerExpanded(true)
                  requestAnimationFrame(() =>
                    negativePromptTextareaRef.current?.focus(),
                  )
                }}
                className="flex h-5.5 w-full min-w-0 cursor-text items-center gap-2.5 text-left text-2sm whitespace-nowrap text-muted-foreground"
              >
                <span className="shrink-0 font-semibold text-foreground/70">
                  {t('generate.negativeShort')}
                </span>
                <span className="min-w-0 truncate">{negativePrompt}</span>
                <ChevronRight className="size-3 shrink-0" aria-hidden />
              </button>
            </div>
          </div>
          {/* 工具行：左（搭配）· 参考图 · 还原 · 负面；右 比例 · 参数 · 出图。整行一种
            外观（描边药丸），弹层从 chip 长出来（与图片台工具行同一套）。 */}
          <StudioChipLookProvider value="outline">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {collocationVisible && collocationSlim && !composerExpanded ? (
                  <LoraCollocationChip
                    sourceKind="recipe"
                    onClick={() => setComposerExpanded(true)}
                  />
                ) : null}
                {referencesSupported && referenceStrengthConfig ? (
                  <LoraReferenceImageCards
                    layout="chip"
                    imageUpload={imageUpload}
                    strength={referenceStrength}
                    onStrengthChange={setReferenceStrength}
                    strengthConfig={referenceStrengthConfig}
                    disabled={!selectedBase?.available || isGenerating}
                  />
                ) : null}
                <button
                  type="button"
                  aria-disabled={!activeAsset || isGenerating}
                  aria-label={
                    activeAsset
                      ? t('generate.restoreHint')
                      : t('generate.restoreNeedsLora')
                  }
                  title={
                    activeAsset
                      ? t('generate.restoreHint')
                      : t('generate.restoreNeedsLora')
                  }
                  onClick={() => {
                    if (!activeAsset || isGenerating) return
                    handleRestore()
                  }}
                  className={cn(
                    studioOutlineChipClass,
                    !activeAsset &&
                      'cursor-not-allowed border-dashed text-muted-foreground hover:border-border',
                    activeAsset && isGenerating && 'opacity-50',
                  )}
                >
                  <Wand2 className="size-4" aria-hidden />
                  {t('generate.restoreShort')}
                </button>
                <LoraNegativeInertHint
                  inert={negativeInert}
                  hint={t('generate.negativeInert')}
                >
                  <button
                    type="button"
                    aria-pressed={negativeShown}
                    aria-disabled={negativeInert}
                    aria-controls="lora-negative-prompt"
                    aria-label={t('generate.negativePromptLabel')}
                    onClick={() => {
                      if (negativeInert) return
                      if (
                        composerExpanded &&
                        negativeShown &&
                        negativePrompt.trim() === ''
                      ) {
                        setNegativePromptExpanded(false)
                        return
                      }
                      // 平时（收薄）点它 = 输入框长回、负面整块展开再聚焦；⛔ 只翻负面
                      // 那一格 —— 收薄时整块挂着 inert，聚焦会落空。
                      setNegativePromptExpanded(true)
                      setComposerExpanded(true)
                      requestAnimationFrame(() =>
                        negativePromptTextareaRef.current?.focus(),
                      )
                    }}
                    className={cn(
                      studioOutlineChipClass,
                      'ease-linear',
                      negativeShown && studioOutlineChipSetClass,
                      negativeInert &&
                        'cursor-not-allowed border-dashed text-muted-foreground hover:border-border',
                    )}
                  >
                    <Ban className="size-4" aria-hidden />
                    {t('generate.negativeShort')}
                  </button>
                </LoraNegativeInertHint>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <SpecChip
                  model={specModel}
                  aspectRatio={aspectRatio}
                  onAspectRatioChange={(next) => {
                    if (
                      (
                        LORA_GENERATE_ASPECT_RATIOS as readonly string[]
                      ).includes(next)
                    ) {
                      handleAspectRatioChange(next as AspectRatio)
                    }
                  }}
                  resolution={null}
                  onResolutionChange={() => undefined}
                  resolutionLabel={t('generate.exactSizeLabel')}
                  more={exactSizeFields}
                  disabled={isGenerating}
                  ariaLabel={t('generate.aspectRatioLabel')}
                  summarySuffix={
                    exactSizeSet
                      ? `${runnerWidth.trim()}×${runnerHeight.trim()}`
                      : undefined
                  }
                  popoverAlign="end"
                />
                {isRunnerBase ? (
                  <LoraParamsChip
                    baseLabel={
                      selectedBase ? operatorBaseLabel(selectedBase) : ''
                    }
                    sampler={runnerSampler}
                    onSamplerChange={setRunnerSampler}
                    scheduler={runnerScheduler}
                    onSchedulerChange={setRunnerScheduler}
                    steps={runnerSteps}
                    onStepsChange={setRunnerSteps}
                    cfg={runnerCfg}
                    onCfgChange={setRunnerCfg}
                    seed={runnerSeed}
                    onSeedChange={(value) => {
                      setRunnerSeed(value)
                      setSeed(undefined)
                    }}
                    seedToFix={() =>
                      selectedResult?.seed ??
                      String(Math.floor(Math.random() * 4_294_967_295))
                    }
                    upscaler={runnerUpscaler}
                    onUpscalerChange={setRunnerUpscaler}
                    upscaleNote={
                      runnerUpscaler === '4x-AnimeSharp'
                        ? {
                            text: `${t('generate.advanced.upscaleSummary', {
                              width: previewDimensions.width,
                              height: previewDimensions.height,
                              outputWidth: upscaleFinalWidth,
                              outputHeight: upscaleFinalHeight,
                            })}${
                              upscaleOutputIsLarge
                                ? ` ${t('generate.advanced.upscaleLargeWarning')}`
                                : ''
                            }`,
                            warn: upscaleOutputIsLarge,
                          }
                        : null
                    }
                    hiresNote={
                      collocationRecipe?.params.runnerHires
                        ? t('generate.advanced.sourceHiresSummary', {
                            scale: collocationRecipe.params.runnerHires.scale,
                            denoise:
                              collocationRecipe.params.runnerHires.denoise,
                            steps:
                              collocationRecipe.params.runnerHires.steps ??
                              (runnerSteps ||
                                t('generate.advanced.modelDefault')),
                            cfg:
                              collocationRecipe.params.runnerHires.cfg ??
                              (runnerCfg ||
                                t('generate.advanced.modelDefault')),
                          })
                        : null
                    }
                    error={runnerSamplingError}
                    customCount={advancedCustomCount}
                    defaults={baseSamplingDefaults}
                    disabled={isGenerating}
                  />
                ) : null}
                <StudioGenerateButton
                  variant="round"
                  label={t('generate.run')}
                  busyLabel={t('generate.busy')}
                  ariaLabel={t('generate.run')}
                  isGenerating={isGenerating}
                  elapsedSeconds={elapsedSeconds}
                  canGenerate={canGenerate}
                  disabled={!canGenerate}
                  onGenerate={handleGenerateClick}
                  onStop={
                    activeGenerateItem
                      ? () => cancelRunItem(activeGenerateItem.id)
                      : undefined
                  }
                  stopLabel={tCancel('cancel')}
                />
              </div>
            </div>
          </StudioChipLookProvider>
        </div>
      </motion.div>

      {/* 助手：与图片台同一颗 Dock；桌面展开时 root 把工作台让出来（§2.5）。 */}
      <StudioOperatorDock />
    </StudioOperatorHostProvider>
  )
}

interface LoraSpineBarProps {
  compatibleBases: LoraBaseModel[]
  selectedBase: LoraBaseModel | null
  onSelectBase: (id: string) => void
  /** 当前选中底模缺可用 API key 路由——用户反馈：配置入口该挂在选底模这一步，
   *  不该挂在出图按钮上。 */
  needsKeySetup: boolean
  onRequestKeySetup: () => void
  /** 当前底模的 LoRA scale 值域（0.1–2.0）——驱动 chip 的 scale popover。
   *  底模未选或不支持 LoRA 时 undefined，此时 chip 退回静态文本。 */
  loraScaleConfig: NumericRange | undefined
  /** B10-8：当前激活的配方分组（=正在展示来源图/配方的挂载）。多挂载时脊柱条
   *  chip 点名字即切换到该 LoRA 的来源图集与配方面板。 */
  activeRecipeGroupId: string | null
  onSelectRecipeGroup: (assetId: string) => void
  /** G1（R3 装配行）：容量位「+添加」路由去库挑 LoRA。 */
  onAddLora: () => void
  /** CD 装配栏「触发词」段：挂载 LoRA 的触发词 chips，可单独停用（虚线 + 删除
   *  线）。与搭配审阅卡里那份共用同一套 disabled 状态，两处互为镜像。 */
  triggerEntries: readonly TriggerChipEntry[]
  disabledTriggerIds: ReadonlySet<string>
  onToggleTrigger: (assetId: string) => void
  /** CD：折叠成竖向图标 rail（收起时只留底模/挂载/容量的图标摘要）。 */
  collapsed: boolean
  onToggleCollapsed: () => void
}

// 常驻脊柱条：当前 LoRA stack（自取）+ 被 LoRA 家族约束的底模扁平选择器。
// 选中态由 GenerateBranch 持有（受控），便于出图读取。
function LoraSpineBar({
  compatibleBases,
  selectedBase,
  onSelectBase,
  needsKeySetup,
  onRequestKeySetup,
  loraScaleConfig,
  activeRecipeGroupId,
  onSelectRecipeGroup,
  onAddLora,
  triggerEntries,
  disabledTriggerIds,
  onToggleTrigger,
  collapsed,
  onToggleCollapsed,
}: LoraSpineBarProps) {
  const t = useTranslations('LoraWorkbench')
  const tSetup = useTranslations('QuickSetup')
  const stack = useActiveLoraStack()
  // 拖拽排序（原生 HTML5 DnD·仅从 grip 起手：armedId 门控 draggable，避免
  // 滑杆/按钮/文本误触发拖拽）。dragId=正在拖的项，overId=悬停目标（画插入提示）。
  const [armedId, setArmedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const endDrag = () => {
    setDragId(null)
    setOverId(null)
    setArmedId(null)
  }
  // S4：换底模 modal 开关；有挂载 LoRA 才有家族约束（modal 的「仅显示兼容」开关）。
  const [baseModalOpen, setBaseModalOpen] = useState(false)
  const hasMountedLora = stack.items.length > 0

  const baseDisplayName = (b: LoraBaseModel) =>
    b.translationKey ? t(`spine.${b.translationKey}`) : b.displayName
  // S4：两层分组选择逻辑（云端/Runner·SDXL/DiT）已搬进 LoraBaseModelModal，
  // 脊柱条这里只留一张「底模卡」唤起 modal。

  // CD 收起态：竖向图标 rail——折叠开关 / 底模方块 / 挂载缩略图（带兼容点）/
  // ＋添加 / 已挂 N。点缩略图切来源图分组、点底模开换底模 modal，信息不丢。
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-1.5 py-2.5 shadow-[var(--lora-shadow-panel)] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t('spine.expandAssembly')}
          title={t('spine.expandAssembly')}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setBaseModalOpen(true)}
          aria-label={
            selectedBase
              ? baseDisplayName(selectedBase)
              : t('spine.baseModelPending')
          }
          title={
            selectedBase
              ? baseDisplayName(selectedBase)
              : t('spine.baseModelPending')
          }
          className="flex size-9 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          {selectedBase ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedBase.coverImage}
              alt=""
              className={cn(
                'size-full',
                selectedBase.coverImage.endsWith('.svg')
                  ? 'object-contain p-1.5'
                  : 'object-cover',
              )}
            />
          ) : (
            <Boxes className="size-4" aria-hidden />
          )}
        </button>
        {stack.items.map((item) => {
          const compatible = selectedBase
            ? isLoraBaseModelMountCompatible(
                item.asset.baseModelFamily,
                selectedBase.family,
              )
            : null
          return (
            <button
              key={item.asset.id}
              type="button"
              onClick={() => onSelectRecipeGroup(item.asset.id)}
              aria-pressed={item.asset.id === activeRecipeGroupId}
              title={item.asset.name}
              className={cn(
                'relative flex size-9 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground transition-colors',
                item.asset.id === activeRecipeGroupId
                  ? 'border-primary'
                  : 'border-border/60 hover:border-border',
                item.enabled === false && 'opacity-50',
              )}
            >
              {item.asset.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyCivitaiImageUrl(item.asset.coverImageUrl)}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <ImageIcon className="size-3.5" aria-hidden />
              )}
              {/* 兼容点：收起态也要能一眼看出哪个挂载会被忽略。 */}
              {compatible !== null ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-0.5 top-0.5 size-1.5 rounded-full ring-1 ring-card',
                    compatible ? 'bg-status-applied/80' : 'bg-status-warning',
                  )}
                />
              ) : null}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onAddLora}
          aria-label={t('spine.addLoraFull')}
          title={t('spine.addLoraFull')}
          className="flex size-9 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <span className="text-center text-3xs leading-tight text-muted-foreground">
          {t('spine.mountedCount', { count: stack.items.length })}
        </span>
      </div>
    )
  }

  return (
    // CD 装配台（近炭暖灰）：脊柱条升为浮起纸面面板——左装配栏雏形，S2b 竖化成
    // 竖向 LoRA 栈 + 底模卡 + 触发词。（原 D8「去盒化·底部白 8% 发丝线」为冷瓷前
    // 旧线，深底上白发丝线本就近隐形，此处反转成 bg-card 浮起面板 + token 发丝边。）
    <div
      data-testid="lora-spine-bar"
      className="flex flex-col items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-[var(--lora-shadow-panel)] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      {/* CD 装配栏：面板标题（「装配栏」）+ 折叠开关同行；下面按 底模 → LoRA 栈 →
          添加 → 触发词 的顺序（先定底模·再挂 LoRA）。 */}
      <div className="flex w-full items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('spine.assemblyTitle')}
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t('spine.collapseAssembly')}
          title={t('spine.collapseAssembly')}
          className="-mr-1 ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftClose className="size-3.5" aria-hidden />
        </button>
      </div>
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
        {t('spine.baseModel')}
      </span>
      {compatibleBases.length > 0 ? (
        <>
          {/* S4 底模卡：显当前底模摘要（名 + 族·通道·忠实/快 mono），点开换底模
              modal（两层分组 + 仅显示兼容开关）。取代原两层分组 Select 下拉。 */}
          <button
            type="button"
            onClick={() => setBaseModalOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left transition-colors hover:border-border"
          >
            {selectedBase ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedBase.coverImage}
                alt=""
                className={cn(
                  'size-10 shrink-0 rounded-md bg-muted',
                  selectedBase.coverImage.endsWith('.svg')
                    ? 'object-contain p-1.5'
                    : 'object-cover',
                )}
              />
            ) : (
              <Boxes
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <span className="min-w-0 flex-1">
              {selectedBase ? (
                <>
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {baseDisplayName(selectedBase)}
                  </span>
                  {/* CD：族 · 通道合成一行 meta。300px 窄栏放不下「Runner · 唯一
                      通道」全称，通道用短标，全称进 title。 */}
                  <span
                    className="block truncate text-2xs text-muted-foreground"
                    title={t('spine.executorRunner')}
                  >
                    {selectedBase.family} · {t('baseModal.channelRunner')}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t('spine.baseModelPending')}
                </span>
              )}
            </span>
            <ArrowLeftRight
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>
          {needsKeySetup ? (
            <button
              type="button"
              onClick={onRequestKeySetup}
              className="inline-flex items-center gap-1 rounded-full border border-status-warning/40 bg-status-warning-surface px-2 py-1 text-2xs font-medium text-status-warning transition-colors hover:bg-status-warning-surface"
            >
              <Key className="size-3" aria-hidden />
              {tSetup('needsKey')}
            </button>
          ) : null}
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
          {t('spine.baseModelPending')}
        </span>
      )}
      {/* 执行通道已并入上面底模卡的 mono meta 行（CD），不再单独占一行。 */}
      {/* LoRA 栈（在底模下面）。CD：标题行右侧给「已挂 N」计数。 */}
      <div
        className="mt-1 flex w-full items-baseline gap-2"
        // 助手挂 / 摘 / 调权重时这一行闪一次（进度表 21）——整栈共用一格，
        // 与登记簿的 `loras` 那一格逐字同源。
        data-assistant-field="loras"
      >
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
          {t('spine.stackTitle')}
        </span>
        <span className="ml-auto text-2xs text-muted-foreground">
          {t('spine.mountedCount', { count: stack.items.length })}
        </span>
      </div>
      {stack.items.length > 0 ? (
        stack.items.map((item) => {
          // 聚焦态 = 当前展示来源图/配方的分组（单挂时回落到唯一项，见
          // GenerateBranch recipeGroupKey）。封面按钮点击切换分组。
          const isActiveGroup = item.asset.id === activeRecipeGroupId
          // §4.1 兼容度圆点：底模未选 → 不判定不渲染；兼容 → 淡绿信号
          // （owner 2026-07-17 拍板"兼容也给淡信号"，与"未判定"区分）；
          // 不兼容 → 琥珀点 + 整行琥珀底 + 警示行（CD 装配栏权重条整行）。
          const compatible = selectedBase
            ? isLoraBaseModelMountCompatible(
                item.asset.baseModelFamily,
                selectedBase.family,
              )
            : null
          const effectiveScale = item.scale ?? item.asset.defaultScale
          // enabled 缺省（旧快照/新挂载）视为启用；停用 = 留在栈里不参与出图。
          const enabled = item.enabled !== false
          return (
            // CD 权重条整行：栈项由 pill 升为整行卡（拖拽柄 + 封面聚焦 + 兼容点 +
            // 名 + ×weight popover + 启停开关 + 移除× + 常驻权重滑杆 + 不兼容琥珀
            // 警示）。启停/拖拽走 useActiveLoraStack 新增 enabled/reorder（owner
            // 2026-07-25 放行的 additive 增量）。
            <div
              key={item.asset.id}
              draggable={armedId === item.asset.id}
              onDragStart={(e) => {
                setDragId(item.asset.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (dragId && dragId !== item.asset.id) {
                  e.preventDefault()
                  if (overId !== item.asset.id) setOverId(item.asset.id)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dragId !== item.asset.id) {
                  stack.reorder(dragId, item.asset.id)
                }
                endDrag()
              }}
              onDragEnd={endDrag}
              className={cn(
                'w-full rounded-lg border p-2.5 transition-colors',
                compatible === false
                  ? 'border-status-warning/40 bg-status-warning-surface'
                  : isActiveGroup
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/60 bg-background',
                dragId === item.asset.id && 'opacity-50',
                overId === item.asset.id &&
                  dragId !== item.asset.id &&
                  'border-primary/60',
                !enabled && 'opacity-60',
              )}
            >
              <div className="flex items-center gap-1.5">
                {/* 拖拽柄：仅从此起手（onPointerDown 武装 draggable，onPointerUp
                    未拖走则解除），避免滑杆/按钮误触发。原生 DnD 无键盘等价，
                    排序为鼠标增强项，启停/权重/移除均可键盘操作。 */}
                <button
                  type="button"
                  aria-label={t('spine.dragReorder')}
                  title={t('spine.dragReorder')}
                  onPointerDown={() => setArmedId(item.asset.id)}
                  onPointerUp={() =>
                    setArmedId((cur) => (cur === item.asset.id ? null : cur))
                  }
                  className="flex shrink-0 cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5" aria-hidden />
                </button>
                {/* 封面聚焦按钮：点击切到该 LoRA 的来源图/配方分组，聚焦时石墨描边。 */}
                <button
                  type="button"
                  onClick={() => onSelectRecipeGroup(item.asset.id)}
                  title={t('spine.focusSourceImages')}
                  aria-pressed={isActiveGroup}
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground transition-colors',
                    isActiveGroup
                      ? 'border-primary'
                      : 'border-border/60 hover:border-border',
                  )}
                >
                  {item.asset.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyCivitaiImageUrl(item.asset.coverImageUrl)}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <ImageIcon className="size-3.5" aria-hidden />
                  )}
                </button>
                {compatible === true ? (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-status-applied"
                  />
                ) : compatible === false ? (
                  <span
                    role="img"
                    aria-label={t('spine.compatDotWarning')}
                    title={t('spine.compatDotWarning')}
                    className="size-1.5 shrink-0 rounded-full bg-status-warning"
                  />
                ) : null}
                {/* B10-8：长名（Civitai 全名带 | 段）截断，全名进 title；停用划删。 */}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs font-medium',
                    enabled
                      ? 'text-foreground'
                      : 'text-muted-foreground line-through',
                  )}
                  title={item.asset.name}
                >
                  {item.asset.name}
                </span>
                {loraScaleConfig ? (
                  <LoraScaleChip
                    name={item.asset.name}
                    value={effectiveScale}
                    onChange={(scale) => stack.setScale(item.asset.id, scale)}
                    config={loraScaleConfig}
                    disabled={!enabled}
                  />
                ) : (
                  <span className="font-mono text-2xs text-muted-foreground">
                    ×{effectiveScale.toFixed(2)}
                  </span>
                )}
                {/* 启停开关：停用留在栈里不参与出图（stack.setEnabled）。 */}
                <Switch
                  size="sm"
                  checked={enabled}
                  onCheckedChange={(v) => stack.setEnabled(item.asset.id, v)}
                  aria-label={t(
                    enabled ? 'spine.disableLora' : 'spine.enableLora',
                    { name: item.asset.name },
                  )}
                  className="shrink-0"
                />
                <button
                  type="button"
                  onClick={() => stack.remove(item.asset.id)}
                  aria-label={t('spine.removeLora', { name: item.asset.name })}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              {/* 权重条整行：常驻滑杆，拖动即调该 LoRA 强度（写回 entry.scale）。
                  仅当底模支持 LoRA scale 值域时渲染；否则退回上面的静态 ×N。
                  停用时禁用（视觉降档，避免调一个不参与出图的权重）。 */}
              {loraScaleConfig ? (
                <div className="mt-2">
                  <Slider
                    aria-label={t('spine.weightBarLabel', {
                      name: item.asset.name,
                    })}
                    min={loraScaleConfig.min}
                    max={loraScaleConfig.max}
                    step={loraScaleConfig.step}
                    value={[effectiveScale]}
                    onValueChange={([v]) => stack.setScale(item.asset.id, v)}
                    disabled={!enabled}
                  />
                </div>
              ) : null}
              {/* 不兼容警示行（CD：整行琥珀 + 说明「出图时该 LoRA 不会生效」）。 */}
              {compatible === false ? (
                <p className="mt-1.5 text-2xs text-status-warning">
                  {t('spine.compatDotWarning')}
                </p>
              ) : null}
            </div>
          )
        })
      ) : (
        <span className="text-xs text-muted-foreground">
          {t('spine.empty')}
        </span>
      )}
      {/* CD：「＋ 添加 LoRA」是整宽虚线按钮（栈的收尾位·点开库 modal）。原先按钮
          下方那行 `N/M` 余量小字已删——挂载不设上限后没有 M 可言，而「已挂 N」
          在本栏顶部早就有了，再放一个只会让人以为还有个上限。 */}
      <button
        type="button"
        onClick={onAddLora}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="size-3.5" aria-hidden />
        {t('spine.addLoraFull')}
      </button>
      {/* CD 装配栏「触发词」段：可单独停用的高亮 chips（停用=虚线 + 删除线，
          不进编译）。与搭配审阅卡里那份共用同一套 disabled 状态。 */}
      {triggerEntries.length > 0 ? (
        <>
          <span className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
            {t('spine.triggerWords')}
          </span>
          <div className="flex w-full flex-wrap gap-1.5">
            {triggerEntries.map((entry) => {
              const isDisabled = disabledTriggerIds.has(entry.assetId)
              return (
                <button
                  key={entry.assetId}
                  type="button"
                  onClick={() => onToggleTrigger(entry.assetId)}
                  aria-pressed={!isDisabled}
                  // 与搭配审阅卡里的同名 chip 区分可访问名（那份用 LoRA 名），
                  // 免得两处同名控件互相干扰。
                  aria-label={t('spine.toggleTriggerWord', {
                    word: entry.triggerWord,
                  })}
                  title={entry.name}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-2xs font-medium transition-colors',
                    isDisabled
                      ? 'border-dashed border-border text-muted-foreground/60 line-through'
                      : 'border-primary/25 bg-primary/10 text-foreground hover:border-primary/40',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-1 shrink-0 rounded-full',
                      isDisabled
                        ? 'bg-muted-foreground/40'
                        : 'bg-status-applied/80',
                    )}
                  />
                  {entry.triggerWord}
                </button>
              )
            })}
          </div>
        </>
      ) : null}
      {/* 助手开关已按 CD 移到模块 tab 行最右（owner 2026-07-25），装配栏不再重复。 */}
      {/* S4 换底模 modal（底模卡唤起）——Dialog 走 portal，放这里不受左栏内滚裁切。 */}
      <LoraBaseModelModal
        open={baseModalOpen}
        onOpenChange={setBaseModalOpen}
        compatibleBases={compatibleBases}
        selectedBaseId={selectedBase?.id}
        onSelect={onSelectBase}
        hasMountedLora={hasMountedLora}
      />
    </div>
  )
}

interface LoraOftenMountedWithRowProps {
  extras: readonly OftenMountedExtra[]
  statusByKey: Record<string, ExtraMountStatus>
  onMountExtra: (extra: CivitaiRecipeExtraLora) => void
  /**
   * `row` = 手机结果流里那一行（名字 ×N + 「挂载」字链）；`column` = 桌面装配列里
   * 的一排小 chip（lora-generate.md §2.1）：「＋ 名字」点了就补挂，只露两个、
   * 余下收成「+N」—— ⛔ 一整段长名字铺在窄列里。
   */
  variant?: 'row' | 'column'
}

// §4.2「常与它同挂」：配方面板元信息区下一行，去盒化纯文本——不套卡片/边框，
// 与 v1 暗房工作台的「说明性内容不进盒子」约定一致。每项复用配方面板既有
// extras 挂载路径的同一套状态语义（loading/mounted/failed+逃生口），只是把
// ExtraLoraList 的块状列表压成一行紧凑文字。
function LoraOftenMountedWithRow({
  extras,
  statusByKey,
  onMountExtra,
  variant = 'row',
}: LoraOftenMountedWithRowProps) {
  const t = useTranslations('LoraWorkbench')
  const tExtra = useTranslations('LoraPromptControl.generate')
  // 装配列那一排只露两个，余下的收成「+N」，点它全摊开。
  const [showAll, setShowAll] = useState(false)

  if (extras.length === 0) return null

  if (variant === 'column') {
    const visible = showAll ? extras : extras.slice(0, 2)
    const hiddenCount = extras.length - visible.length
    const chipClass =
      'inline-flex h-6 max-w-24 items-center gap-1 rounded-md px-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
        {/* 标签独占一行：272 的列里「标签 + 两颗 chip」放不下，⛔ 折成参差的两行。 */}
        <span className="w-full">{t('generate.oftenMountedShort')}</span>
        {visible.map(({ extra, count }) => {
          const key = extraLoraKey(extra)
          const status = statusByKey[key]
          const label = extraLoraLabel(extra)
          const full = `${label} ×${count}`
          return status === 'mounted' ? (
            <span
              key={key}
              title={full}
              className={cn(
                chipClass,
                'bg-status-applied-surface text-foreground',
              )}
            >
              <Check
                className="size-3 shrink-0 text-status-applied"
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </span>
          ) : status === 'failed' ? (
            <a
              key={key}
              href={`${CIVITAI_MODEL_SEARCH_URL}?query=${encodeURIComponent(
                toCivitaiModelSearchQuery(label),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`${tExtra('recipeExtraSearchLink')} · ${full}`}
              className={cn(chipClass, 'underline underline-offset-2')}
            >
              <span className="truncate">{label}</span>
            </a>
          ) : (
            <button
              key={key}
              type="button"
              disabled={status === 'loading'}
              onClick={() => onMountExtra(extra)}
              title={`${tExtra('recipeExtraMount')} · ${full}`}
              aria-label={`${tExtra('recipeExtraMount')} · ${full}`}
              className={cn(
                chipClass,
                'bg-muted text-foreground hover:bg-surface-fill-hover disabled:cursor-wait disabled:opacity-60',
              )}
            >
              {status === 'loading' ? (
                <Spinner size="sm" aria-hidden />
              ) : (
                <Plus className="size-3 shrink-0" aria-hidden />
              )}
              <span className="truncate">{label}</span>
            </button>
          )
        })}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="h-6 rounded-md px-1 tabular-nums text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{hiddenCount}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-2xs text-muted-foreground">
      <span>{t('generate.oftenMountedWith')}</span>
      {extras.map(({ extra, count }, idx) => {
        const key = extraLoraKey(extra)
        const status = statusByKey[key]
        return (
          <span key={key} className="inline-flex items-center gap-1">
            {idx > 0 ? <span aria-hidden>·</span> : null}
            <span className="font-medium text-foreground/80">
              {extraLoraLabel(extra)} ×{count}
            </span>
            {status === 'mounted' ? (
              <Check className="size-3 text-status-applied" aria-hidden />
            ) : status === 'failed' ? (
              <a
                href={`${CIVITAI_MODEL_SEARCH_URL}?query=${encodeURIComponent(
                  toCivitaiModelSearchQuery(extraLoraLabel(extra)),
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {tExtra('recipeExtraSearchLink')}
              </a>
            ) : (
              <button
                type="button"
                disabled={status === 'loading'}
                onClick={() => onMountExtra(extra)}
                className="underline underline-offset-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              >
                {status === 'loading'
                  ? tExtra('recipeExtraResolving')
                  : tExtra('recipeExtraMount')}
              </button>
            )}
          </span>
        )
      })}
    </p>
  )
}

type MineSort = 'newest' | 'oldest' | 'nameAsc'
type MineSection = 'trained' | 'favorites'

interface MyLoraBranchProps {
  trained: LoraAssetRecord[]
  favorites: LoraAssetRecord[]
  discoverAssets: LoraAssetRecord[]
  isLoading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onSwitchSection: (section: LoraWorkbenchSection) => void
  onVisibilityChange: (assetId: string, isPublic: boolean) => Promise<boolean>
  onUnfavorite: (assetId: string) => Promise<boolean>
  onDelete: (assetId: string) => Promise<boolean>
  onFavoriteDiscover: (item: LoraAssetRecord) => Promise<LoraAssetRecord | null>
  isFavorited: (loraUrl: string) => boolean
}

// 推荐行最多展示几张 —— 对齐 wireframes §5 的 5 列网格。
const RECOMMEND_FAVORITE_LIMIT = 5

function MyLoraBranch({
  trained,
  favorites,
  discoverAssets,
  isLoading,
  error,
  onRefresh,
  onSwitchSection,
  onVisibilityChange,
  onUnfavorite,
  onDelete,
  onFavoriteDiscover,
  isFavorited,
}: MyLoraBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<MineSort>('newest')
  // Favorites are the common browsing surface for this branch; trained LoRAs
  // remain one click away for users who have their own fine-tunes.
  const [section, setSection] = useState<MineSection>('favorites')

  const totalCount = trained.length + favorites.length

  const { filteredTrained, filteredFavorites } = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase()
    const matchQuery = (a: LoraAssetRecord) =>
      !trimmedQuery ||
      a.name.toLowerCase().includes(trimmedQuery) ||
      a.triggerWord.toLowerCase().includes(trimmedQuery)

    const sortFn = (a: LoraAssetRecord, b: LoraAssetRecord) => {
      switch (sort) {
        case 'oldest':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        case 'nameAsc':
          return a.name.localeCompare(b.name)
        case 'newest':
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
      }
    }

    return {
      filteredTrained: trained.filter(matchQuery).sort(sortFn),
      filteredFavorites: favorites.filter(matchQuery).sort(sortFn),
    }
  }, [trained, favorites, query, sort])

  // 用户在某个 section 搜索没结果时不直接显示「无匹配」整页空，
  // 而是显示当前 section 内的「无匹配」迷你空状态，让 toggle 的
  // 计数对照仍然可见。
  const activeAssets =
    section === 'trained' ? filteredTrained : filteredFavorites
  const activeOriginalCount =
    section === 'trained' ? trained.length : favorites.length
  const activeSectionEmptyKey =
    section === 'trained'
      ? 'myLorasTrainedSectionEmpty'
      : 'myLorasFavoritesSectionEmpty'

  // discoverAssets 已经在收藏里的条目要滤掉，否则「推荐你收藏」会推荐
  // 用户已经收藏过的 LoRA —— 对齐 wireframes §5「推荐你收藏」条的用途。
  const recommendedAssets = useMemo(
    () =>
      discoverAssets
        .filter((a) => !isFavorited(a.loraUrl))
        .slice(0, RECOMMEND_FAVORITE_LIMIT),
    [discoverAssets, isFavorited],
  )

  return (
    <section className="space-y-6">
      <MineHeader
        totalCount={totalCount}
        isLoading={isLoading}
        onRefresh={onRefresh}
      />

      {error ? (
        <ErrorBlock error={error} onRetry={onRefresh} />
      ) : isLoading ? (
        <SkeletonGrid />
      ) : totalCount === 0 ? (
        <>
          <EmptyHero onSwitchSection={onSwitchSection} />
          {recommendedAssets.length > 0 ? (
            <RecommendFavoritesRow
              assets={recommendedAssets}
              onFavorite={onFavoriteDiscover}
              onSwitchSection={onSwitchSection}
            />
          ) : null}
        </>
      ) : (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <MineSectionToggle
              section={section}
              onSectionChange={setSection}
              trainedCount={trained.length}
              favoritesCount={favorites.length}
            />
            <MineToolbar
              query={query}
              onQueryChange={setQuery}
              sort={sort}
              onSortChange={setSort}
            />
          </div>

          {/* 用 section 当 key 强制 React 重新挂载，避免 grid 在切换时
              用旧节点动画过去（card 是 keyed 的，复用会造成错位）。
              section 切换时整组淡入。 */}
          <div
            key={section}
            className="animate-in fade-in slide-in-from-top-1 duration-300"
          >
            {activeOriginalCount === 0 ? (
              <EmptyHint text={t(activeSectionEmptyKey)} />
            ) : activeAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-10 text-center text-sm text-muted-foreground">
                {t('myLorasSearchEmpty', { query: query.trim() })}
              </div>
            ) : (
              <AssetGrid>
                {activeAssets.map((asset) =>
                  section === 'trained' ? (
                    <LoraAssetCard
                      key={asset.id}
                      asset={asset}
                      showVisibilityToggle={asset.isOwn}
                      onVisibilityChange={onVisibilityChange}
                      onDelete={onDelete}
                    />
                  ) : (
                    <LoraAssetCard
                      key={asset.id}
                      asset={asset}
                      onUnfavorite={onUnfavorite}
                    />
                  ),
                )}
              </AssetGrid>
            )}
          </div>

          {recommendedAssets.length > 0 ? (
            <RecommendFavoritesRow
              assets={recommendedAssets}
              onFavorite={onFavoriteDiscover}
              onSwitchSection={onSwitchSection}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

interface RecommendFavoritesRowProps {
  assets: LoraAssetRecord[]
  onFavorite: (item: LoraAssetRecord) => Promise<LoraAssetRecord | null>
  onSwitchSection: (section: LoraWorkbenchSection) => void
}

/**
 * 「推荐你收藏」回填条（wireframes §5）—— 封面 + 悬浮心形图标，点击
 * 直接收藏，不是完整的 LoraAssetCard（那个卡片承载太多我的页专属操作，
 * 这里只是引流到公开库的轻量预览）。
 */
function RecommendFavoritesRow({
  assets,
  onFavorite,
  onSwitchSection,
}: RecommendFavoritesRowProps) {
  const t = useTranslations('LoraWorkbench')
  const [favoritingId, setFavoritingId] = useState<string | null>(null)

  const handleFavorite = useCallback(
    async (asset: LoraAssetRecord) => {
      if (favoritingId) return
      setFavoritingId(asset.id)
      try {
        await onFavorite(asset)
      } finally {
        setFavoritingId(null)
      }
    },
    [favoritingId, onFavorite],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground">
          {t('recommendFavoriteTitle')}
        </span>
        <span className="h-px flex-1 bg-border/60" aria-hidden />
        <button
          type="button"
          onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('recommendFavoriteGoLibrary')}
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => void handleFavorite(asset)}
            disabled={favoritingId === asset.id}
            className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-muted disabled:cursor-wait"
            aria-label={t('recommendFavoriteAction', { name: asset.name })}
            title={asset.name}
          >
            {asset.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyCivitaiImageUrl(asset.coverImageUrl)}
                alt={asset.name}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
                <Sparkles className="size-8 opacity-30" strokeWidth={1.25} />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            {favoritingId === asset.id ? (
              <Spinner
                size="sm"
                className="absolute right-1.5 top-1.5 text-white drop-shadow"
                aria-hidden
              />
            ) : (
              <Heart
                className="absolute right-1.5 top-1.5 size-3.5 text-white drop-shadow transition-transform group-hover:scale-110"
                aria-hidden
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

interface MineSectionToggleProps {
  section: MineSection
  onSectionChange: (next: MineSection) => void
  trainedCount: number
  favoritesCount: number
}

/**
 * 分段切换控件 —— 把原本两段堆叠的 section 改成单视图 + toggle。
 * pill 风格的 rounded-full segmented control，配合品牌色高亮选中态。
 * 跟顶部主 Tabs (我的/训练/LoRA 库) 在视觉上不冲突 ——
 * 主 Tabs 是 height-9 / text-xs / 灰 muted；这里是 height-10 / text-sm /
 * 选中态浮起阴影，作为「内容一级导航」的存在感。
 */
function MineSectionToggle({
  section,
  onSectionChange,
  trainedCount,
  favoritesCount,
}: MineSectionToggleProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <div
      role="tablist"
      aria-label={t('mineSectionToggleLabel')}
      className="inline-flex h-10 items-center gap-1 rounded-full bg-muted/40 p-1"
    >
      <SectionToggleButton
        active={section === 'favorites'}
        onClick={() => onSectionChange('favorites')}
        label={t('myLorasFavoritesSection')}
        count={favoritesCount}
      />
      <SectionToggleButton
        active={section === 'trained'}
        onClick={() => onSectionChange('trained')}
        label={t('myLorasTrainedSection')}
        count={trainedCount}
      />
    </div>
  )
}

interface SectionToggleButtonProps {
  active: boolean
  onClick: () => void
  label: string
  count: number
}

function SectionToggleButton({
  active,
  onClick,
  label,
  count,
}: SectionToggleButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'group inline-flex h-8 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-2xs tabular-nums transition-colors',
          active
            ? 'bg-primary/15 text-primary'
            : 'bg-muted/60 text-muted-foreground group-hover:bg-muted',
        )}
      >
        {count}
      </span>
    </button>
  )
}

interface MineHeaderProps {
  totalCount: number
  isLoading: boolean
  onRefresh: () => Promise<void>
}

function MineHeader({ totalCount, isLoading, onRefresh }: MineHeaderProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <header className="flex flex-row items-start justify-between gap-3 sm:items-end">
      <div className="min-w-0 space-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('myLorasTitle')}
          </h2>
          {!isLoading && totalCount > 0 ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              {totalCount}
            </span>
          ) : null}
        </div>
        {/* Subtitle hidden on mobile — title is self-explanatory and we
            want the cards above the fold. */}
        <p className="hidden text-sm text-muted-foreground sm:block">
          {t('myLorasSubtitle')}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void onRefresh()}
        disabled={isLoading}
        aria-label={t('refresh')}
        className="shrink-0"
      >
        <RefreshCw
          className={cn('size-3.5', isLoading && 'animate-spin')}
          aria-hidden
        />
        <span className="hidden sm:inline">{t('refresh')}</span>
      </Button>
    </header>
  )
}

interface MineToolbarProps {
  query: string
  onQueryChange: (next: string) => void
  sort: MineSort
  onSortChange: (next: MineSort) => void
}

function MineToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
}: MineToolbarProps) {
  const t = useTranslations('LoraWorkbench')

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('myLorasSearchPlaceholder')}
          className="h-9 pl-9 pr-9 text-base md:text-xs"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('clearSearch')}
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
      <Select value={sort} onValueChange={(v) => onSortChange(v as MineSort)}>
        <SelectTrigger
          size="sm"
          className="w-full border-border/60 text-base sm:w-40 md:text-xs"
          aria-label={t('myLorasSortLabel')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">{t('myLorasSortNewest')}</SelectItem>
          <SelectItem value="oldest">{t('myLorasSortOldest')}</SelectItem>
          <SelectItem value="nameAsc">{t('myLorasSortNameAsc')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

interface ErrorBlockProps {
  error: string
  onRetry: () => Promise<void>
}

function ErrorBlock({ error, onRetry }: ErrorBlockProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-status-risk/30 bg-status-risk-surface p-4">
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-foreground">
          {t('myLorasErrorTitle')}
        </p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void onRetry()}
        className="shrink-0"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        {t('myLorasErrorRetry')}
      </Button>
    </div>
  )
}

function SkeletonGrid() {
  // 8 张 skeleton card — 模拟 trained + favorites 各 4 张的常见形态，
  // 让用户对「内容长什么样」有视觉预期，比空 spinner 体感专业。
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={`s-trained-${i}`} />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={`s-fav-${i}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
        <div className="h-7 w-full animate-pulse rounded bg-muted/60" />
      </div>
    </div>
  )
}

interface EmptyHeroProps {
  onSwitchSection: (section: LoraWorkbenchSection) => void
}

/** 我的 LoRA 空库 —— 走全站空态原语（ui-defaults §7）。 */
function EmptyHero({ onSwitchSection }: EmptyHeroProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <EmptyState
      icon={<Sparkles aria-hidden />}
      title={t('myLorasEmptyTitle')}
      description={t('myLorasEmptyDescription')}
      action={
        <Button
          type="button"
          className="rounded-full"
          onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.TRAIN)}
        >
          <Sparkles className="size-4" aria-hidden />
          {t('myLorasEmptyCtaTrain')}
        </Button>
      }
      secondaryAction={
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)}
        >
          <Compass className="size-4" aria-hidden />
          {t('myLorasEmptyCtaBrowse')}
        </Button>
      }
    />
  )
}

function AssetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {children}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  // Section 内空状态用同款 card/40 + rounded-2xl 表面（无 dashed），
  // 让两类空状态在同一份视觉语言里：page-empty 是大号版，
  // section-empty 是迷你版。dashed 给人「未实现 / 占位」的暗示，
  // 这里我们要的是「这格暂时是空的，不要紧」。
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
