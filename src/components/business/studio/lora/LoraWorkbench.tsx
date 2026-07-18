'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Compass,
  GraduationCap,
  Heart,
  Key,
  Library,
  Minus,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  CIVITAI_MODEL_SEARCH_URL,
  DEFAULT_LORA_WORKBENCH_SECTION,
  LORA_RESULT_HISTORY_MAX,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  isLoraWorkbenchSection,
  type LoraWorkbenchSection,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import {
  getBaseOnlyGenerationBases,
  getCompatibleBases,
  getDefaultBaseOnlyGenerationBase,
  getDefaultBase,
  getLoraBaseArchitectureGroup,
  type LoraBaseModel,
} from '@/constants/lora-base-models'
import { RUNNER_SAMPLERS, RUNNER_SCHEDULERS } from '@/constants/runner-sampling'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { AspectRatio } from '@/constants/config'
import {
  AdvancedParamsSchema,
  RunnerSeedStringSchema,
  type AdvancedParams,
  type CivitaiImageRecipe,
  type CivitaiRecipeExtraLora,
  type LoraAssetRecord,
} from '@/types'
import {
  LORA_STACK_MAX,
  useActiveLoraStack,
} from '@/hooks/use-active-lora-stack'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { CommunitySourceBranch } from '@/components/business/studio/lora/library/LoraLibraryTabs'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import { useHuggingFaceLoraShowcase } from '@/hooks/use-huggingface-lora-showcase'
import { useRunnerUsage } from '@/hooks/prompts/use-runner-usage'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import {
  LoraTrainingForm,
  LoraTrainingHistorySidebar,
} from '@/components/business/LoraTrainingDialog'
import { PresetGrid } from '@/components/business/studio/lora/training/PresetGrid'
import dynamic from 'next/dynamic'
import { useIsMobile } from '@/hooks/use-mobile'
import type { LoraTrainingPresetId } from '@/constants/lora'

// Lazy-loaded so the Vaul-backed Drawer doesn't bloat the desktop SSR
// payload. Mobile-only entry point.
const MobileTrainingSheet = dynamic(
  () =>
    import('@/components/business/studio/lora/training/MobileTrainingSheet').then(
      (m) => m.MobileTrainingSheet,
    ),
  { ssr: false },
)
import { LoraAssetCard } from '@/components/business/studio/lora/LoraAssetCard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildSourceMatchedLoraPrompt } from '@/lib/lora-source-match-prompt'
import {
  applyRecipePlanToAdvancedParams,
  buildCivitaiRecipeGenerationPlan,
} from '@/lib/civitai-recipe-to-generation'
import { resolveCivitaiLoraAPI } from '@/lib/api-client/lora-assets'
import {
  aggregateOftenMountedExtras,
  extraLoraKey,
  extraLoraLabel,
  mountRecipeExtraLoras,
  type ExtraMountStatus,
  type OftenMountedExtra,
} from '@/lib/lora-recipe-extra-mount'
import {
  isLoraBaseModelMountCompatible,
  summarizeLoraStackCompatibility,
} from '@/lib/lora-model-compatibility'
import { toCivitaiModelSearchQuery } from '@/lib/civitai-lora-reference'
import { parseHuggingFaceLoraSourceUrl } from '@/lib/huggingface-lora-source'
import { LoraHuggingFaceShowcaseStrip } from '@/components/business/studio/prompt-tags/LoraHuggingFaceShowcaseStrip'
import { LoraSourceImagePreviewStrip } from '@/components/business/studio/prompt-tags/LoraSourceImagePreviewStrip'
import { LoraSourceRecipeStrip } from '@/components/business/studio/prompt-tags/LoraSourceRecipeStrip'
import { PromptTagAutocomplete } from '@/components/business/studio/prompt-tags/PromptTagAutocomplete'
import { PromptTagTray } from '@/components/business/studio/prompt-tags/PromptTagTray'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getAvailableImageModels, resolveAdapterType } from '@/constants/models'
import {
  getCapabilityConfig,
  getMaxReferenceImages,
  type NumericRange,
} from '@/constants/provider-capabilities'
import { PROMPT_TAG_DEFINITIONS } from '@/constants/prompt-tags'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useImageUpload } from '@/hooks/use-image-upload'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { LoraAspectRatioChip } from '@/components/business/studio/lora/LoraAspectRatioChip'
import { LoraReferenceImageChip } from '@/components/business/studio/lora/LoraReferenceImageChip'
import { LoraScaleChip } from '@/components/business/studio/lora/LoraScaleChip'
import { TriggerChipRow } from '@/components/business/studio/lora/TriggerChipRow'
import {
  buildSavedModelOptionsForModels,
  getTranslatedModelLabel,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { compilePromptTags } from '@/lib/prompt-tag-compiler'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import type { PromptPolarity, PromptTagSelection } from '@/types/prompt-tags'
import { cn } from '@/lib/utils'

export function LoraWorkbench() {
  const t = useTranslations('LoraWorkbench')
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

  // §12 行A 压缩：源 segmented（导航）+ 排序/NSFW/刷新（控件）两个槽由本
  // 组件持有，常驻渲染在不随 section 重挂载的行A 里；`CommunitySourceBranch`
  // 及更深的两个 pane 通过这两个节点 portal 内容进来，state 仍留在原本层级
  // （不上提 hook），只有 DOM 落点挪到这里——保住「pills 壳不动，只内层
  // crossfade」的既有动效约定，行A 的源 tab/控件不属于内层，不应跟着闪。
  const [librarySourceNavSlot, setLibrarySourceNavSlot] =
    useState<HTMLDivElement | null>(null)
  const [libraryControlsSlot, setLibraryControlsSlot] =
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

  // 「库」tab 同时覆盖 community(公开)/mine(我的) 两个子态：tabValue 把 mine
  // 折回 community，使 community trigger 在两态下都高亮。
  const tabValue =
    activeSection === LORA_WORKBENCH_SECTIONS.MINE
      ? LORA_WORKBENCH_SECTIONS.COMMUNITY
      : activeSection
  const isLibrary =
    activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ||
    activeSection === LORA_WORKBENCH_SECTIONS.MINE

  // D7⑦: 壳（tab bar）不动，body crossfade。顶层三段（生成 / 库 / 训练）
  // 切换时整块 body 淡入；库内公开↔我的属同一壳，只让内层内容淡入、pills
  // 不动。key 变化触发 React 重挂载 → animate-in fade 播放；reduced-motion
  // 由 globals.css 的全局 media 块降级为直切。
  const bodyKey = isLibrary ? 'library' : activeSection

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* P2-4: 模块 tab 从三个全宽大块收成紧凑居中 segmented pill——
          `items-center` 把 content-width 的 TabsList 在 flex-col 里水平居中，
          去掉 `w-full grid-cols-3` 让它自适应内容宽度。Radix Tabs 已带
          role=tab / 键盘导航（P2-7 语义无需另接）。 */}
      <Tabs
        value={tabValue}
        onValueChange={handleTabChange}
        className="items-center"
      >
        <TabsList className="h-9 bg-muted/40">
          <TabsTrigger
            value={LORA_WORKBENCH_SECTIONS.GENERATE}
            className="h-7 px-3 text-xs"
          >
            <Sparkles className="size-3.5" aria-hidden />
            {t('tabs.generate')}
          </TabsTrigger>
          <TabsTrigger
            value={LORA_WORKBENCH_SECTIONS.COMMUNITY}
            className="h-7 px-3 text-xs"
          >
            <Compass className="size-3.5" aria-hidden />
            {t('tabs.library')}
          </TabsTrigger>
          <TabsTrigger
            value={LORA_WORKBENCH_SECTIONS.TRAIN}
            className="h-7 px-3 text-xs"
          >
            <GraduationCap className="size-3.5" aria-hidden />
            {t('tabs.train')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div key={bodyKey} className="animate-in fade-in duration-200">
        {activeSection === LORA_WORKBENCH_SECTIONS.GENERATE ? (
          <GenerateBranch />
        ) : null}

        {isLibrary ? (
          <section className="space-y-3">
            {/* §12 行A 导航合流：公开/我的 pills + 竖发丝线 + 源 segmented
                左簇，控件槽（排序/NSFW/刷新）右簇——这整行常驻不随 section
                切换重挂载（下面 crossfade 只包内层内容），源 segmented/
                控件槽两个节点空的时候（「我的」子态）不占视觉空间，行A
                自然只剩 pills，无需额外分支渲染。 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex gap-1 rounded-lg bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors',
                      activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Compass className="size-3.5" aria-hidden />
                    {t('library.public')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSection(LORA_WORKBENCH_SECTIONS.MINE)
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors',
                      activeSection === LORA_WORKBENCH_SECTIONS.MINE
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Library className="size-3.5" aria-hidden />
                    {t('tabs.mine')}
                  </button>
                </div>
                {activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ? (
                  <span
                    className="hidden h-5 w-px shrink-0 bg-border/60 sm:block"
                    aria-hidden
                  />
                ) : null}
                <div
                  ref={setLibrarySourceNavSlot}
                  className="flex shrink-0 flex-wrap items-center gap-2"
                />
              </div>
              <div
                ref={setLibraryControlsSlot}
                className="flex shrink-0 flex-wrap items-center gap-2"
              />
            </div>

            {/* 公开↔我的：行A 是壳保持不动，只让内层内容 crossfade。 */}
            <div
              key={activeSection}
              className="animate-in fade-in duration-200"
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
                  navSlotNode={librarySourceNavSlot}
                  controlsSlotNode={libraryControlsSlot}
                />
              )}
            </div>
          </section>
        ) : null}

        {activeSection === LORA_WORKBENCH_SECTIONS.TRAIN ? (
          <TrainingBranch />
        ) : null}
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

/** D7③: one entry in the session result filmstrip. `scale`/`seed` are captured
 *  at generate-time for the s×.×× · seed corner label; both may be null. */
interface LoraResultHistoryItem {
  id: string
  url: string
  scale: number | null
  seed: string | null
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

function parseOptionalRunnerNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getRunnerPreviewDimensions(
  aspectRatio: AspectRatio,
  isAnima: boolean,
): { width: number; height: number } {
  if (isAnima) {
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
 * 给定底模的 providerModelId，判断当前用户有没有可用的 key 路由（保存的 key
 * 或 freeTier 平台额度）。纯函数——GenerateBranch 用它算当前选中底模的状态，
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
      option.freeTier ||
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
function GenerateBranch() {
  const t = useTranslations('LoraWorkbench')
  const tModels = useTranslations('Models')
  const router = useRouter()
  const stack = useActiveLoraStack()
  const { generate, isGenerating, lastGeneration } = useUnifiedGenerate()
  // 「自己搭配」词库（docs/design/pages/lora-domain-wireframes.md §3）读写的就是
  // 这份共享的 prompt-tag stack——引擎（compiler/search/stack）本来就是
  // 全域共享的，只是此前唯一的宿主 UI（TagLibrary）被删了，这里是词库导入后
  // 第一个真正接上的消费端。
  const promptTags = usePromptTagStack()
  const [promptMode, setPromptMode] = useState<'recommend' | 'selfBuild'>(
    'recommend',
  )

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
      freeTier: model.freeTier,
      sourceType: 'workspace',
    }))
    const saved = buildSavedModelOptionsForModels(
      keys.filter((k) => k.isActive),
      imageModels,
    )
    return mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap)
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
      ? `${
          suggestedBase.translationKey
            ? t(`spine.${suggestedBase.translationKey}`)
            : suggestedBase.displayName
        } · ${
          suggestedBase.fidelity === 'faithful'
            ? t('spine.faithful')
            : t('spine.fast')
        }`
      : null

  // 主动提示：选中 runner 底模时拉全站月度额度，让用户点前就知道「本月剩余
  // N/300」而不是撞上限才弹错。非 runner 底模不拉。
  const isRunnerBase = selectedBase?.backend === 'runner'
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

  // §4.3 触发词 chips 化：正文不再 prefill 触发词——旧的
  // mountedTriggersPrefill（render 时条件 setState 随 primary LoRA 重置）
  // 已整个迁到 TriggerChipRow，纸的初始状态回到纯空白。
  const [prompt, setPrompt] = useState('')
  // §5 PromptTagAutocomplete 只拿 ref 挂监听，不拥有这两个 textarea 的 JSX
  // ——它们本来就长在下面的纸区里，改动面收在"加一个 ref 属性"。
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const negativePromptTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 只对"当前挂载 且 带触发词"的 LoRA 生成一枚 chip；无触发词的挂载不占位
  // （无数据不渲染，抽屉里已如实展示"无需触发词"）。entries 直接从
  // stack.items 派生，挂载即现、卸载即删，不额外持久化。
  const triggerChipEntries = useMemo(
    () =>
      stack.items
        .map((item) => ({
          assetId: item.asset.id,
          name: item.asset.name,
          triggerWord: item.asset.triggerWord?.trim() ?? '',
        }))
        .filter((entry) => entry.triggerWord.length > 0),
    [stack.items],
  )
  // chip 可单独禁用：用 assetId 集合而不是逐 chip useState——LoRA 被卸载后
  // id 自然从 triggerChipEntries 过滤掉，Set 里留下的陈旧 id 只是静置不用，
  // 不需要额外清理。
  const [disabledTriggerIds, setDisabledTriggerIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const handleToggleTriggerChip = useCallback((assetId: string) => {
    setDisabledTriggerIds((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }, [])
  // 编译顺序 = 触发词 chips(启用的) → tray 正向 tags → 正文（§4.3）：把触发词
  // 包成 PromptTagSelection，复用 compilePromptTags 既有的 selections 管线
  // （见下方 handleGenerate），不重造合并/去重逻辑。负 orderIndex 保证排在
  // tray 选中项（orderIndex 从 0 起）之前。
  const triggerSelections = useMemo<PromptTagSelection[]>(
    () =>
      triggerChipEntries.map((entry, index) => ({
        id: `lora-trigger:${entry.assetId}`,
        tagId: `lora-trigger:${entry.assetId}`,
        promptText: entry.triggerWord,
        label: entry.name,
        polarity: 'positive',
        source: 'lora_asset',
        type: 'lora_trigger',
        enabled: !disabledTriggerIds.has(entry.assetId),
        orderIndex: index - triggerChipEntries.length,
        insertedAt: '',
      })),
    [triggerChipEntries, disabledTriggerIds],
  )

  // 忠实还原：用 LoRA 的推荐/源图匹配提示词一键填充 + 套用推荐 scale + 负向。
  const activeAsset = stack.items[0]?.asset ?? null
  const [negativePrompt, setNegativePrompt] = useState('')
  // 用户反馈：一键同款/忠实还原/URL 回放都会把负面 prompt 写进这个 state，
  // 但 composer 之前只有一个正向文本框——负面词悄悄生效但用户看不见、改不了。
  // 默认折叠，一旦有内容（无论是手动展开还是套用配方带出来的）就一直显示。
  const [negativePromptExpanded, setNegativePromptExpanded] = useState(false)
  const handleRestore = useCallback(() => {
    if (!activeAsset) return
    const matched = buildSourceMatchedLoraPrompt(activeAsset)
    setPrompt(matched.prompt)
    setNegativePrompt(matched.negativePrompt)
    stack.setScale(activeAsset.id, matched.scale)
  }, [activeAsset, stack])

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
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  // B10 (D7④)：进推荐 tab / 切分组后默认选中第一张来源图，消灭左栏空态。
  // 每个分组只默认一次（recipeDefaultedFor 记住已默认过的分组 key）——用户手动
  // 关闭配方面板后不再自动弹回；切到别的分组才重新默认。render 时条件
  // setState 是本文件既有惯例（"随 prop 重置 state"，避免 effect 级联）。
  const [recipeDefaultedFor, setRecipeDefaultedFor] = useState<string | null>(
    null,
  )
  const recipeGroupKey = recipeGroupAsset?.id ?? null
  if (
    promptMode === 'recommend' &&
    recipeGroupKey &&
    !mined.isLoading &&
    mined.recipes.length > 0 &&
    recipeDefaultedFor !== recipeGroupKey
  ) {
    setRecipeDefaultedFor(recipeGroupKey)
    setSelectedImageUrl(mined.recipes[0].imageUrl)
  }
  const [includeSeed, setIncludeSeed] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
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
  const [appliedRecipe, setAppliedRecipe] = useState<{
    groupAssetId: string
    recipe: CivitaiImageRecipe
    params: AdvancedParams
    includeSeed: boolean
  } | null>(null)
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false)

  const runnerParameterError = useMemo(() => {
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
  }, [
    isRunnerBase,
    runnerCfg,
    runnerHeight,
    runnerSeed,
    runnerSteps,
    runnerWidth,
    selectedBase?.family,
    t,
  ])

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
      selectedBase?.family === 'anima-dit',
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
  const imageUpload = useImageUpload()
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
  const maxLoras = baseCapability?.maxLoras
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const handleApplyRecipe = useCallback(
    (recipe: CivitaiImageRecipe, options: { includeSeed: boolean }) => {
      const plan = buildCivitaiRecipeGenerationPlan(recipe)
      const params = applyRecipePlanToAdvancedParams(undefined, plan, options)
      // §4.3「一键同款只替换正文,不碰 chips 行」：配方文本原样写进 prompt。
      // 旧版这里会把其他挂载缺失的触发词 append 进 plan.prompt（B10
      // D7④/§2② 的 appendMissingTriggers），那是触发词 chips 化之前的补丁——
      // 现在其他挂载的触发词已经由各自启用中的 TriggerChipRow chip 独立进入
      // 编译管线（见 handleGenerate 的 triggerSelections），不用再拼进正文，
      // 拼了反而会在编译后的 prompt 里重复计入一次。
      setPrompt(plan.prompt)
      setNegativePrompt(params.negativePrompt ?? '')
      if (plan.aspectRatio) setAspectRatio(plan.aspectRatio)
      // Scale applies to the group the recipe came from (per-mount), not
      // always the primary — multi-mount tunes each LoRA independently.
      if (plan.loraScale != null && recipeGroupAsset) {
        stack.setScale(recipeGroupAsset.id, plan.loraScale)
      }
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
          recipe,
          params,
          includeSeed: options.includeSeed,
        })
      }
    },
    [recipeGroupAsset, stack],
  )

  // 一键补挂配方里叠加的其他 LoRA：解析（本地库→Civitai）→ push 进挂载栈，
  // 状态（loading/mounted/failed）回写驱动 LoraSourceRecipeStrip 的行内反馈。
  // baseModelFamily 用当前主 LoRA 的家族做解析提示，挑对底模变体。
  const [extraMountStatusByKey, setExtraMountStatusByKey] = useState<
    Record<string, ExtraMountStatus>
  >({})
  const handleMountExtraLora = useCallback(
    (extra: CivitaiRecipeExtraLora) => {
      void mountRecipeExtraLoras({
        extras: [extra],
        stackItems: stack.items,
        maxStack: LORA_STACK_MAX,
        baseModelFamily: loraFamily,
        resolveLora: resolveCivitaiLoraAPI,
        pushLora: stack.push,
        setLoraScale: stack.setScale,
        setStatus: (key, status) =>
          setExtraMountStatusByKey((prev) => ({ ...prev, [key]: status })),
        // 底模架构兼容闸：解析出的额外 LoRA 家族桶要和当前底模一致才挂，
        // 否则（如 SD1.5/Flux LoRA 挂上 SDXL 底模）会污染 checkpoint 出坏图。
        isBaseCompatible: selectedBase
          ? (fam) => isLoraBaseModelMountCompatible(fam, selectedBase.family)
          : undefined,
      })
    },
    [stack, loraFamily, selectedBase],
  )

  const hasLora = stack.items.length > 0
  const canGenerate =
    !!selectedBase?.available &&
    !!selectedBase.providerModelId &&
    !isGenerating &&
    runnerParameterError === null &&
    // 缺 key 时按钮仍可点——点击路由到 QuickSetupDialog（Hard Rule 8），
    // 不强求先填提示词。有启用的触发词 chip 也算"有内容"——旧 prefill 迁到
    // chips 行后，纯靠触发词出图（正文不额外打字）要继续可点。
    (needsKeySetup ||
      prompt.trim().length > 0 ||
      triggerSelections.some((selection) => selection.enabled))

  const handleGenerate = useCallback(async () => {
    const providerModelId = selectedBase?.providerModelId
    if (!providerModelId) return
    const loras = stack.items.map((entry) => ({
      url: entry.asset.loraUrl,
      scale: entry.scale ?? entry.asset.defaultScale,
    }))
    // 「自己搭配」选中的标签 + 触发词 chips 在这里并入最终 prompt——compiler
    // 只读不写 selections，负向标签走 compiledNegativePrompt，和已有的
    // negativePrompt 文本框合并去重，不互相覆盖。§4.3 编译顺序 = 触发词
    // chips(启用的) → tray 正向 tags → 正文：triggerSelections 的负
    // orderIndex 保证排在 tray 选中项前面，compilePromptTags 自己按
    // orderIndex 排序 + 去重，两路只是拼数组，不需要额外逻辑。
    const compiled = compilePromptTags({
      freePrompt: prompt,
      selectedTags: [...triggerSelections, ...promptTags.allSelections()],
      existingNegativePrompt: negativePrompt,
    })
    const activeAppliedRecipe =
      appliedRecipe &&
      stack.items.some((entry) => entry.asset.id === appliedRecipe.groupAssetId)
        ? appliedRecipe
        : null
    const recipeParams = activeAppliedRecipe?.params
    const advanced: Record<string, unknown> = { ...recipeParams }
    // These are supplied by the visible prompt/negative/seed controls below.
    delete advanced.negativePrompt
    delete advanced.seed
    if (loras.length > 0) advanced.loras = loras
    if (compiled.negativePrompt)
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
        (advanced.checkpointVersionId || advanced.checkpointName) &&
        loraFamily
      )
        advanced.loraBaseModel = loraFamily
    } else {
      delete advanced.runnerSeed
      delete advanced.runnerSampler
      delete advanced.runnerScheduler
      delete advanced.runnerWidth
      delete advanced.runnerHeight
      delete advanced.runnerUpscaler
    }
    const record = await generate({
      mode: 'image',
      image: {
        modelId: providerModelId,
        freePrompt: compiled.freePrompt ?? prompt,
        aspectRatio,
        seed,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        advancedParams: Object.keys(advanced).length > 0 ? advanced : undefined,
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
          },
          ...prev.filter((item) => item.id !== record.id),
        ].slice(0, LORA_RESULT_HISTORY_MAX),
      )
      setSelectedResultId(record.id)
    }
  }, [
    aspectRatio,
    appliedRecipe,
    generate,
    imageUpload.referenceImages,
    isRunnerBase,
    loraFamily,
    negativePrompt,
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
    triggerSelections,
  ])

  // 主入口已经挪到「选底模」（见 handleSelectBase）。这里只是兜底：万一用户
  // 从没碰过底模选择器（比如默认底模本来就缺 key），点出图不能直接静默失败
  // ——但按钮外观不再随 needsKeySetup 变化，保持一直是「出图」。
  const handleGenerateClick = useCallback(() => {
    if (needsKeySetup && workspaceOptionForBase) {
      openKeySetupFor(workspaceOptionForBase)
      return
    }
    void handleGenerate()
  }, [handleGenerate, needsKeySetup, openKeySetupFor, workspaceOptionForBase])

  // D7③: which result the main image shows — the filmstrip selection, falling
  // back to the newest entry, then to the hook's lastGeneration (covers a
  // result that predates any filmstrip entry, e.g. a still-processing resolve).
  const selectedResult =
    resultHistory.find((item) => item.id === selectedResultId) ??
    resultHistory[0] ??
    null
  const displayedResultUrl = selectedResult?.url ?? lastGeneration?.url ?? null

  return (
    <section className="space-y-4">
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

      <LoraSpineBar
        compatibleBases={compatibleBases}
        selectedBase={selectedBase}
        onSelectBase={handleSelectBase}
        needsKeySetup={needsKeySetup}
        onRequestKeySetup={() =>
          workspaceOptionForBase && openKeySetupFor(workspaceOptionForBase)
        }
        loraScaleConfig={loraScaleConfig}
        maxLoras={maxLoras}
        activeRecipeGroupId={recipeGroupKey}
        onSelectRecipeGroup={setRecipeGroupAssetId}
      />

      {
        // D8 布局 B：上半双栏（来源/配方 · 结果），象牙提示词纸收成全宽底档。
        // 空态改造：无 LoRA 时不再整块换成占位——composer（提示词框）+ 结果框
        // 常驻，只在推荐列给出「去库挑一个 LoRA」的引导（见下方 !hasLora 分支）。
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid min-w-0 gap-6 md:grid-cols-2 md:items-start">
            <div className="min-w-0">
              {/* 推荐/自己搭配（lora-domain-wireframes.md §3）：推荐=既有来源图
                配方 strip，自己搭配=词库导入后第一个真正接上的浏览/检索
                入口。两者共用左栏空间，之前没有配方时左栏整个不渲染，现在
                自己搭配 tab 总有内容可显示。 */}
              {/* D8 细则②：视图切换一律下划线文字 tab（非胶囊）。用普通 button +
                  aria-pressed 而非 role=tab——没有配套 tabpanel 语义，且要与
                  模块 tab bar 的 role=tab 区分开。 */}
              <div
                aria-label={t('generate.promptModeLabel')}
                className="mb-3 flex items-center gap-4 border-b border-white/[0.08]"
              >
                {(['recommend', 'selfBuild'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={promptMode === mode}
                    onClick={() => setPromptMode(mode)}
                    className={cn(
                      '-mb-px border-b-2 pb-1.5 text-xs font-medium transition-colors',
                      promptMode === mode
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {mode === 'recommend'
                      ? t('generate.promptModeRecommend')
                      : t('generate.promptModeSelfBuild')}
                  </button>
                ))}
              </div>
              {promptMode === 'recommend' ? (
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
                        recipes={mined.recipes}
                        selectedImageUrl={selectedImageUrl}
                        includeSeed={includeSeed}
                        extraMountStatusByKey={extraMountStatusByKey}
                        extraStackFull={stack.items.length >= LORA_STACK_MAX}
                        onSelectedImageUrlChange={setSelectedImageUrl}
                        onIncludeSeedChange={setIncludeSeed}
                        onMountExtraLora={handleMountExtraLora}
                        onApplyRecipe={handleApplyRecipe}
                      />
                      {/* §4.2「常与它同挂」：配方面板元信息区下一行，去盒化
                          纯文本——数据不足（无 recipes/extras 全空/计数全 1）
                          时组件自己返回 null，不额外渲染空行。 */}
                      <LoraOftenMountedWithRow
                        extras={oftenMountedExtras}
                        statusByKey={extraMountStatusByKey}
                        stackFull={stack.items.length >= LORA_STACK_MAX}
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
                  ) : !hasLora ? (
                    // 空态改造：无 LoRA 时把「先挑一个 LoRA」引导收进推荐列
                    // （不再整页占位），composer/结果框保持可见。
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-6 text-center">
                      <p className="text-xs text-muted-foreground">
                        {t('generate.placeholderBody')}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`,
                          )
                        }
                      >
                        <Compass className="size-3.5" aria-hidden />
                        {t('tabs.library')}
                      </Button>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      {t('generate.recommendEmpty')}
                    </p>
                  )}
                </div>
              ) : (
                <LoraTagPicker />
              )}
            </div>
            <div className="mx-auto w-full min-w-0 max-w-md space-y-3">
              {/* D8 细则①：结果图裸浮暗面无底板——去边框/底板，仅圆角裁切；
                空态不套盒，居中占位。 */}
              <div
                className={cn(
                  'relative aspect-square w-full overflow-hidden rounded-xl bg-cover bg-center',
                  // 无结果时（空态/生成中）给结果框加虚线边界 + 微底色，一眼看清
                  // 占多大空间（用户要求）；有结果时保持 D8 细则①「裸浮无底板」。
                  !displayedResultUrl &&
                    'border border-dashed border-border/50 bg-muted/20',
                )}
                style={
                  displayedResultUrl
                    ? { backgroundImage: `url(${displayedResultUrl})` }
                    : undefined
                }
              >
                {isGenerating ? (
                  <div className="flex size-full items-center justify-center">
                    <Spinner
                      size="lg"
                      className="text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                ) : !displayedResultUrl ? (
                  <div className="flex size-full flex-col items-center justify-center gap-2 text-center">
                    <Sparkles
                      className="size-7 text-muted-foreground/40"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('generate.resultEmptyTitle')}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {t('generate.resultEmptyHint')}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResultPreviewOpen(true)}
                    aria-label={t('generate.resultPreviewLabel')}
                    className="absolute inset-0 cursor-zoom-in"
                  />
                )}
              </div>

              {/* D7③: 会话级结果 filmstrip——多于一张时显示，点缩略切主图，
                每张带 s×.×× · seed 角标。会话内存，刷新清空。 */}
              {resultHistory.length > 1 ? (
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
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
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-[9px] leading-tight text-white/90">
                          {item.scale != null
                            ? `s${item.scale.toFixed(2)}`
                            : ''}
                          {item.scale != null && item.seed != null ? ' · ' : ''}
                          {item.seed != null ? item.seed : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {/* D8 布局 B (细则⑤)：象牙提示词纸全宽底档，左右下三边出血贴容器
              边缘；.studio-composer 在其作用域内把语义色板反相成墨色系——出图
              自动成墨块（细则③ 唯一反相 CTA）、chips 纸面形制、忠实还原=象牙
              描边 ghost、禁止灰字上纸。 */}
          <div className="studio-composer -mx-4 -mb-5 space-y-2 rounded-t-2xl border-t border-black/[0.06] px-4 pb-5 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {/* §4.3 触发词 chips 行：textarea 上方，纸面形制小 chips。正文
                不再 prefill 触发词——挂载即现、卸载即删，chip 可单独停用。 */}
            <TriggerChipRow
              entries={triggerChipEntries}
              disabledIds={disabledTriggerIds}
              onToggle={handleToggleTriggerChip}
            />
            <textarea
              ref={promptTextareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('generate.promptPlaceholder')}
              rows={3}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-surface-composer-foreground/40"
            />
            <PromptTagAutocomplete
              textareaRef={promptTextareaRef}
              value={prompt}
              onChange={setPrompt}
              polarity="positive"
            />
            {negativePromptExpanded || negativePrompt.trim().length > 0 ? (
              <div className="space-y-1 border-t border-surface-composer-foreground/10 pt-2">
                <p className="text-2xs font-medium uppercase tracking-wide text-surface-composer-foreground/50">
                  {t('generate.negativePromptLabel')}
                </p>
                <textarea
                  ref={negativePromptTextareaRef}
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder={t('generate.negativePromptPlaceholder')}
                  rows={2}
                  className="w-full resize-none bg-transparent text-xs outline-none placeholder:text-surface-composer-foreground/40"
                />
                <PromptTagAutocomplete
                  textareaRef={negativePromptTextareaRef}
                  value={negativePrompt}
                  onChange={setNegativePrompt}
                  polarity="negative"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNegativePromptExpanded(true)}
                className="inline-flex items-center gap-1 text-2xs text-surface-composer-foreground/50 transition-colors hover:text-surface-composer-foreground"
              >
                <Plus className="size-3" aria-hidden />
                {t('generate.negativePromptAdd')}
              </button>
            )}
            {/* §4.1 不兼容挂载警示：不阻断出图，与 runner 额度提示同区同形制
                （琥珀 text-2xs）。互斥时退化成"卸载其一"，不给假建议。 */}
            {incompatibleCount > 0 ? (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-amber-600 dark:text-amber-400">
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
                    className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
                  >
                    {t('generate.switchToSuggestedBase', {
                      base: suggestedBaseLabel,
                    })}
                  </button>
                ) : null}
              </p>
            ) : null}
            {/* 主动额度提示：选中 runner 底模且额度启用时显示「本月剩余 N/300」，
                快满/满了变琥珀提醒——撞上限前就让用户心里有数。 */}
            {isRunnerBase && runnerUsage?.enabled ? (
              <p
                className={cn(
                  'text-2xs',
                  runnerUsage.remaining <= 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-surface-composer-foreground/50',
                )}
              >
                {runnerUsage.remaining <= 0
                  ? t('generate.runnerBudgetExhausted')
                  : t('generate.runnerBudgetRemaining', {
                      remaining: runnerUsage.remaining,
                      limit: runnerUsage.limit,
                    })}
              </p>
            ) : null}
            {isRunnerBase ? (
              <div className="border-t border-surface-composer-foreground/10 pt-2">
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((open) => !open)}
                  className="flex w-full items-center gap-2 py-1 text-left text-xs font-medium text-surface-composer-foreground"
                >
                  <SlidersHorizontal className="size-3.5" aria-hidden />
                  <span>{t('generate.advanced.title')}</span>
                  <span className="text-2xs font-normal text-surface-composer-foreground/55">
                    {advancedCustomCount > 0
                      ? t('generate.advanced.customSummary', {
                          count: advancedCustomCount,
                        })
                      : t('generate.advanced.defaultSummary')}
                  </span>
                  <ChevronDown
                    className={cn(
                      'ml-auto size-3.5 transition-transform',
                      advancedOpen && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>

                {advancedOpen ? (
                  <div className="space-y-3 pt-2">
                    {runnerParameterError ? (
                      <p
                        role="alert"
                        className="rounded-md bg-destructive/10 px-2.5 py-2 text-2xs text-destructive"
                      >
                        {runnerParameterError}
                      </p>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65 sm:col-span-2">
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
                            className="h-8 border-surface-composer-foreground/15 bg-transparent font-mono text-xs"
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

                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65">
                        <span>{t('generate.advanced.steps')}</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={runnerSteps}
                          onChange={(event) =>
                            setRunnerSteps(event.target.value)
                          }
                          placeholder={t('generate.advanced.modelDefault')}
                          aria-label={t('generate.advanced.steps')}
                          className="h-8 border-surface-composer-foreground/15 bg-transparent text-xs"
                        />
                      </label>

                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65">
                        <span>{t('generate.advanced.cfg')}</span>
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          step={0.1}
                          value={runnerCfg}
                          onChange={(event) => setRunnerCfg(event.target.value)}
                          placeholder={t('generate.advanced.modelDefault')}
                          aria-label={t('generate.advanced.cfg')}
                          className="h-8 border-surface-composer-foreground/15 bg-transparent text-xs"
                        />
                      </label>

                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65 sm:col-span-2">
                        <span>{t('generate.advanced.sampler')}</span>
                        <Select
                          value={runnerSampler || RUNNER_DEFAULT_SELECT_VALUE}
                          onValueChange={(value) =>
                            setRunnerSampler(
                              value === RUNNER_DEFAULT_SELECT_VALUE
                                ? ''
                                : value,
                            )
                          }
                        >
                          <SelectTrigger
                            aria-label={t('generate.advanced.sampler')}
                            className="h-8 border-surface-composer-foreground/15 bg-transparent text-xs"
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

                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65 sm:col-span-2">
                        <span>{t('generate.advanced.scheduler')}</span>
                        <Select
                          value={runnerScheduler || RUNNER_DEFAULT_SELECT_VALUE}
                          onValueChange={(value) =>
                            setRunnerScheduler(
                              value === RUNNER_DEFAULT_SELECT_VALUE
                                ? ''
                                : value,
                            )
                          }
                        >
                          <SelectTrigger
                            aria-label={t('generate.advanced.scheduler')}
                            className="h-8 border-surface-composer-foreground/15 bg-transparent text-xs"
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

                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65">
                        <span>{t('generate.advanced.width')}</span>
                        <Input
                          type="number"
                          min={512}
                          max={
                            selectedBase?.family === 'anima-dit' ? 1536 : 2048
                          }
                          step={8}
                          value={runnerWidth}
                          onChange={(event) =>
                            setRunnerWidth(event.target.value)
                          }
                          placeholder={String(previewDimensions.width)}
                          aria-label={t('generate.advanced.width')}
                          className="h-8 border-surface-composer-foreground/15 bg-transparent text-xs"
                        />
                      </label>

                      <label className="space-y-1 text-2xs font-medium text-surface-composer-foreground/65">
                        <span>{t('generate.advanced.height')}</span>
                        <Input
                          type="number"
                          min={512}
                          max={
                            selectedBase?.family === 'anima-dit' ? 1536 : 2048
                          }
                          step={8}
                          value={runnerHeight}
                          onChange={(event) =>
                            setRunnerHeight(event.target.value)
                          }
                          placeholder={String(previewDimensions.height)}
                          aria-label={t('generate.advanced.height')}
                          className="h-8 border-surface-composer-foreground/15 bg-transparent text-xs"
                        />
                      </label>
                    </div>

                    <div className="rounded-lg border border-surface-composer-foreground/12 p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-surface-composer-foreground">
                            {t('generate.advanced.postprocess')}
                          </p>
                          <p className="text-2xs text-surface-composer-foreground/55">
                            {t('generate.advanced.upscalerHint')}
                          </p>
                        </div>
                        <Select
                          value={runnerUpscaler}
                          onValueChange={(value) =>
                            setRunnerUpscaler(
                              value === '4x-AnimeSharp'
                                ? '4x-AnimeSharp'
                                : 'none',
                            )
                          }
                        >
                          <SelectTrigger
                            aria-label={t('generate.advanced.upscaler')}
                            className="h-8 w-full border-surface-composer-foreground/15 bg-transparent text-xs sm:w-48"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {t('generate.advanced.upscalerNone')}
                            </SelectItem>
                            <SelectItem value="4x-AnimeSharp">
                              4x-AnimeSharp
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {runnerUpscaler === '4x-AnimeSharp' ? (
                        <p
                          className={cn(
                            'mt-2 text-2xs',
                            upscaleOutputIsLarge
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-surface-composer-foreground/60',
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
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!activeAsset || isGenerating}
                  onClick={handleRestore}
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  {t('generate.restore')}
                </Button>
                {/* B10 (D7①): 比例 chip——链路早已通（handleGenerate 一直传
                      aspectRatio），此前页面无控件把用户锁死 1:1。默认 1:1 不动。 */}
                <LoraAspectRatioChip
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  disabled={isGenerating}
                />
                {/* B9: 参考图 chip——能力位驱动，仅当底模支持参考图
                      （maxReferenceImages > 0）且有强度配置时渲染。 */}
                {maxReferenceImages > 0 && referenceStrengthConfig ? (
                  <LoraReferenceImageChip
                    imageUpload={imageUpload}
                    strength={referenceStrength}
                    onStrengthChange={setReferenceStrength}
                    strengthConfig={referenceStrengthConfig}
                    disabled={!selectedBase?.available || isGenerating}
                  />
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!canGenerate}
                onClick={handleGenerateClick}
              >
                {isGenerating ? (
                  <Spinner size="sm" aria-hidden />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden />
                )}
                {t('generate.run')}
              </Button>
            </div>
          </div>
        </div>
      }
    </section>
  )
}

// ── 自己搭配 · 词库魔导书（docs/design/pages/lora-domain-wireframes.md §3）──
// booru 搜索 + 功能分类 chip + 候选列表 + 已选 tray（直接复用
// PromptTagTray，不重造一份选中态展示）。引擎（compiler/search/stack）本来
// 就是全域共享模块，早就写好也测过，之前只是没有 UI 接上去。
//
// 范围收窄说明：文档设想的"发型/眼睛/表情/服装/姿势"等细粒度功能分类需要对
// 每条 danbooru 词条做二次语义分类（文档 M3「配方拆层」，一个独立的
// deterministic token classifier），现在没有那份数据。这里先按
// PromptTagDefinition.category 现有的粗粒度值分（quality/style/scene/
// character/camera/lighting/anatomy/artifacts）——比文档设想的粗，但每个
//分类背后都是真数据，不是摆设 chip。"智能词条"（概念→一捆标签）同理：目前
//没有 prompt_preset 类型的词条数据，先不做假按钮占位。
function LoraTagPicker() {
  const t = useTranslations('LoraWorkbench')
  const tTags = useTranslations('PromptTags')
  const promptTags = usePromptTagStack()
  const [query, setQuery] = useState('')
  const [polarity, setPolarity] = useState<PromptPolarity>('positive')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const tag of PROMPT_TAG_DEFINITIONS) {
      if (tag.polarity === polarity) set.add(tag.category)
    }
    return Array.from(set).sort()
  }, [polarity])

  // 切正/负向时，之前选的分类可能在新极性下不存在——收回避免"选中一个筛不出
  // 东西的分类"死态。render 时条件 reset（本文件已有的惯例模式）。
  if (activeCategory && !categories.includes(activeCategory)) {
    setActiveCategory(null)
  }

  const results = useMemo(() => {
    const base = searchPromptTags({
      query,
      polarity,
      selectedTagIds: promptTags.selectedTagIds,
      limit: 60,
    })
    return activeCategory
      ? base.filter((result) => result.tag.category === activeCategory)
      : base
  }, [activeCategory, polarity, promptTags.selectedTagIds, query])

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tTags('library.searchPlaceholder')}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setPolarity('positive')}
            aria-label={tTags('library.positive')}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full',
              polarity === 'positive'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPolarity('negative')}
            aria-label={tTags('library.negative')}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full',
              polarity === 'negative'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <p className="text-2xs text-muted-foreground">
        {t('generate.tagPickerHint')}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={cn(
            'rounded-full px-2.5 py-1 text-2xs font-medium transition-colors',
            activeCategory === null
              ? 'bg-foreground text-background'
              : 'border border-border/60 text-muted-foreground hover:text-foreground',
          )}
        >
          {t('generate.tagPickerCategoryAll')}
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={cn(
              'rounded-full px-2.5 py-1 text-2xs font-medium transition-colors',
              activeCategory === category
                ? 'bg-foreground text-background'
                : 'border border-border/60 text-muted-foreground hover:text-foreground',
            )}
          >
            {tTags(`category.${category}`)}
          </button>
        ))}
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1.5">
        {results.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {tTags('library.emptyTitle')}
          </p>
        ) : (
          results.map((result) => (
            <button
              key={result.tag.id}
              type="button"
              disabled={result.isSelected}
              onClick={() => promptTags.addTag(result.tag)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
            >
              {result.tag.polarity === 'negative' ? (
                <Minus
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : (
                <Plus
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                {result.tag.label}
              </span>
              <span className="shrink-0 truncate font-mono text-2xs text-muted-foreground/70">
                {result.tag.promptText}
              </span>
            </button>
          ))
        )}
      </div>

      <PromptTagTray />
    </div>
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
  /** 当前底模的多挂载上限（fal 5 / Replicate delta-lock 2）——余量小字用。 */
  maxLoras: number | undefined
  /** B10-8：当前激活的配方分组（=正在展示来源图/配方的挂载）。多挂载时脊柱条
   *  chip 点名字即切换到该 LoRA 的来源图集与配方面板。 */
  activeRecipeGroupId: string | null
  onSelectRecipeGroup: (assetId: string) => void
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
  maxLoras,
  activeRecipeGroupId,
  onSelectRecipeGroup,
}: LoraSpineBarProps) {
  const t = useTranslations('LoraWorkbench')
  const tSetup = useTranslations('QuickSetup')
  const stack = useActiveLoraStack()
  // 多挂载时 chip 名字变成分组切换器（点它切来源图/配方）；单挂无需切换。
  const canSwitchGroup = stack.items.length > 1

  const fidelityLabel = (b: LoraBaseModel) =>
    b.fidelity === 'faithful' ? t('spine.faithful') : t('spine.fast')
  const baseDisplayName = (b: LoraBaseModel) =>
    b.translationKey ? t(`spine.${b.translationKey}`) : b.displayName

  // §4.4 底模选择器两层分组：第一层 backend（云端 API vs runner），runner
  // 组内再按架构系（SDXL/DiT）分——数据来源 getLoraBaseArchitectureGroup，
  // 新增架构自动落 SDXL 桶。空组不渲染（§4.4 拍板）。
  const cloudBases = compatibleBases.filter((b) => b.backend !== 'runner')
  const runnerBases = compatibleBases.filter((b) => b.backend === 'runner')
  const runnerSdxlBases = runnerBases.filter(
    (b) => getLoraBaseArchitectureGroup(b.family) === 'sdxl',
  )
  const runnerDitBases = runnerBases.filter(
    (b) => getLoraBaseArchitectureGroup(b.family) === 'dit',
  )
  const renderBaseItem = (base: LoraBaseModel) => (
    <SelectItem key={base.id} value={base.id} disabled={!base.available}>
      {baseDisplayName(base)} · {fidelityLabel(base)}
      {base.available ? '' : ` · ${t('spine.comingSoon')}`}
    </SelectItem>
  )

  return (
    // D8 细则① 去盒化：脊柱条不再套圆角面板，改底部发丝线（白 8%）+ 留白节奏。
    <div className="flex flex-wrap items-center gap-2.5 border-b border-white/[0.08] px-0.5 pb-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('spine.currentLora')}
      </span>
      {stack.items.length > 0 ? (
        stack.items.map((item) => {
          const isActiveGroup =
            canSwitchGroup && item.asset.id === activeRecipeGroupId
          // §4.1 兼容度圆点：底模未选 → 不判定不渲染；兼容 → 淡绿/中性小点
          // （owner 2026-07-17 拍板"兼容也给淡信号"，与"未判定"区分）；
          // 不兼容 → 琥珀实心点 + tooltip/aria 警示。
          const compatible = selectedBase
            ? isLoraBaseModelMountCompatible(
                item.asset.baseModelFamily,
                selectedBase.family,
              )
            : null
          return (
            <span
              key={item.asset.id}
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full border py-1 pl-1 pr-1 text-xs',
                isActiveGroup
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/60 bg-background',
              )}
            >
              {compatible === true ? (
                <span
                  aria-hidden
                  className="ml-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500/70 dark:bg-emerald-400/70"
                />
              ) : compatible === false ? (
                <span
                  role="img"
                  aria-label={t('spine.compatDotWarning')}
                  title={t('spine.compatDotWarning')}
                  className="ml-0.5 size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
                />
              ) : null}
              {/* B10-8：长名（Civitai 全名带 | 段）截断到固定宽，全名进 title；
                  多挂载时点名字切到该 LoRA 的来源图/配方分组。 */}
              {canSwitchGroup ? (
                <button
                  type="button"
                  onClick={() => onSelectRecipeGroup(item.asset.id)}
                  title={item.asset.name}
                  aria-pressed={isActiveGroup}
                  className={cn(
                    'block max-w-40 truncate rounded-full px-1.5 py-0.5 font-medium transition-colors',
                    isActiveGroup
                      ? 'text-primary'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  {item.asset.name}
                </button>
              ) : (
                <span
                  className="block max-w-52 truncate px-1.5"
                  title={item.asset.name}
                >
                  {item.asset.name}
                </span>
              )}
              {loraScaleConfig ? (
                <LoraScaleChip
                  name={item.asset.name}
                  value={item.scale ?? item.asset.defaultScale}
                  onChange={(scale) => stack.setScale(item.asset.id, scale)}
                  config={loraScaleConfig}
                />
              ) : (
                <span className="text-muted-foreground">
                  ×{(item.scale ?? item.asset.defaultScale).toFixed(2)}
                </span>
              )}
              <button
                type="button"
                onClick={() => stack.remove(item.asset.id)}
                aria-label={t('spine.removeLora', { name: item.asset.name })}
                className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          )
        })
      ) : (
        <span className="text-xs text-muted-foreground">
          {t('spine.empty')}
        </span>
      )}
      {/* D8 细则④：挂载余量用实心/空心圆点替代文字计数（●●○○○）。 */}
      {stack.items.length > 0 && maxLoras && maxLoras > 1 ? (
        <span
          className="flex items-center gap-1"
          role="img"
          aria-label={t('spine.mountCount', {
            current: stack.items.length,
            max: maxLoras,
          })}
        >
          {Array.from({ length: maxLoras }).map((_, idx) => (
            <span
              key={idx}
              aria-hidden
              className={cn(
                'size-1.5 rounded-full',
                idx < stack.items.length
                  ? 'bg-muted-foreground'
                  : 'border border-muted-foreground/50',
              )}
            />
          ))}
        </span>
      ) : null}
      <span className="grow" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('spine.baseModel')}
      </span>
      {compatibleBases.length > 0 ? (
        <>
          <Select value={selectedBase?.id} onValueChange={onSelectBase}>
            <SelectTrigger className="h-7 w-auto gap-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* §4.4 第一层：backend（云端 API 自备 key / runner 平台免费额度）。
                  原先逐项的「免费额度/需 API Key」徽标随组标题上移，组级信息
                  不再逐项重复。 */}
              {cloudBases.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>{t('spine.baseGroupCloud')}</SelectLabel>
                  {cloudBases.map(renderBaseItem)}
                </SelectGroup>
              ) : null}
              {runnerBases.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>{t('spine.baseGroupRunner')}</SelectLabel>
                  {/* 第二层：runner 组内再按架构系分（SDXL 系 / DiT 系）——
                      纯展示子标题，不是独立的 Radix Group，避免未验证过的
                      嵌套 Select.Group 行为。 */}
                  {runnerSdxlBases.length > 0 ? (
                    <>
                      <div className="px-2 pb-0.5 pt-1 text-3xs font-medium uppercase tracking-wide text-muted-foreground/60">
                        {t('spine.baseGroupSdxl')}
                      </div>
                      {runnerSdxlBases.map(renderBaseItem)}
                    </>
                  ) : null}
                  {runnerDitBases.length > 0 ? (
                    <>
                      <div className="px-2 pb-0.5 pt-1 text-3xs font-medium uppercase tracking-wide text-muted-foreground/60">
                        {t('spine.baseGroupDit')}
                      </div>
                      {runnerDitBases.map(renderBaseItem)}
                    </>
                  ) : null}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
          {needsKeySetup ? (
            <button
              type="button"
              onClick={onRequestKeySetup}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
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
    </div>
  )
}

interface LoraOftenMountedWithRowProps {
  extras: readonly OftenMountedExtra[]
  statusByKey: Record<string, ExtraMountStatus>
  stackFull: boolean
  onMountExtra: (extra: CivitaiRecipeExtraLora) => void
}

// §4.2「常与它同挂」：配方面板元信息区下一行，去盒化纯文本——不套卡片/边框，
// 与 v1 暗房工作台的「说明性内容不进盒子」约定一致。每项复用配方面板既有
// extras 挂载路径的同一套状态语义（loading/mounted/failed+逃生口），只是把
// ExtraLoraList 的块状列表压成一行紧凑文字。
function LoraOftenMountedWithRow({
  extras,
  statusByKey,
  stackFull,
  onMountExtra,
}: LoraOftenMountedWithRowProps) {
  const t = useTranslations('LoraWorkbench')
  const tExtra = useTranslations('LoraPromptControl.generate')

  if (extras.length === 0) return null

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
              <Check
                className="size-3 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
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
                disabled={status === 'loading' || stackFull}
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
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
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
          className="h-9 pl-9 pr-9 text-xs"
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
          className="w-full border-border/60 text-xs sm:w-40"
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
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
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

function EmptyHero({ onSwitchSection }: EmptyHeroProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/5 via-card to-card px-6 py-14 text-center sm:px-12 sm:py-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 抽象装饰 — 大圈柔光在右上，配合品牌色，给空状态一点温度，
          不抢主视觉。fixed 单层渐变，不是 AI slop 的 floating blob 阵。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 size-64 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-4">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Sparkles className="size-7" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t('myLorasEmptyTitle')}
          </h3>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('myLorasEmptyDescription')}
          </p>
        </div>

        <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            size="lg"
            onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.TRAIN)}
            className="gap-2"
          >
            <Sparkles className="size-4" aria-hidden />
            {t('myLorasEmptyCtaTrain')}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)}
            className="gap-2"
          >
            <Compass className="size-4" aria-hidden />
            {t('myLorasEmptyCtaBrowse')}
          </Button>
        </div>
      </div>
    </div>
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

interface PresetRailPanelProps {
  presetId: LoraTrainingPresetId | null
  onSelect: (preset: { id: LoraTrainingPresetId }) => void
  /**
   * 'rail' (default): xl+ 右侧 sticky 列,内部用 compact 2-col grid。
   * 'panel': 折叠在主区下方占满宽度,sticky 关闭,内部用 wide 2/3-col grid
   * 以利用横向空间。
   */
  variant?: 'rail' | 'panel'
}

/**
 * Wrapper around PresetGrid. Adds the "Presets" heading + subtitle that
 * the standalone grid doesn't render. In 'rail' variant applies the
 * sticky / scroll constraints shared with the history rail so the two
 * columns visually balance at xl+ breakpoints. In 'panel' variant
 * renders as a static full-width block — used when the form column
 * doesn't have horizontal room for a third rail.
 */
function PresetRailPanel({
  presetId,
  onSelect,
  variant = 'rail',
}: PresetRailPanelProps) {
  const t = useTranslations('LoraTraining')
  return (
    <aside
      className={cn(
        'rounded-2xl border border-border bg-card p-4',
        variant === 'rail' &&
          'xl:max-h-[calc(100svh-7rem)] xl:sticky xl:top-4 xl:overflow-y-auto',
      )}
    >
      <div className="mb-3 space-y-0.5">
        <h3 className="font-display text-sm font-semibold tracking-tight">
          {t('presetRailTitle')}
        </h3>
        <p className="text-2xs text-muted-foreground">
          {t('presetRailSubtitle')}
        </p>
      </div>
      <PresetGrid
        layout={variant === 'rail' ? 'compact' : 'wide'}
        selectedId={presetId}
        onSelect={onSelect}
      />
    </aside>
  )
}

function TrainingBranch() {
  // 训练页对稿（lora-domain-wireframes.md §6）：稿子是两栏——左表单，右
  // 提交卡+训练任务列表，没有独立的历史/预设侧栏。以前是三栏（历史 240px·
  // 表单·预设 280px，xl 才三栏，md..xl- 退成两栏+预设折下面），现在统一
  // 收成两栏：左表单，右边把预设 + 训练任务列表堆在一起——功能都留着，
  // 只是不再各占一条独立的常驻侧栏。
  const isMobile = useIsMobile()
  const [presetId, setPresetId] = useState<LoraTrainingPresetId | null>(null)

  const handleSelectPreset = useCallback(
    (preset: { id: LoraTrainingPresetId }) => {
      setPresetId(preset.id)
    },
    [],
  )

  const handleClearPreset = useCallback(() => {
    setPresetId(null)
  }, [])

  // Form column is just the form. EmptyState + the page heading both
  // got cut — the preset rail next to the form is its own empty state,
  // and the tabs above already say "train", so an h2 saying the same
  // thing is noise.
  const formColumn = (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <LoraTrainingForm
        hideRecentJobs
        selectedPresetId={presetId}
        onPresetClear={handleClearPreset}
      />
    </div>
  )

  const sideColumn = (
    <div className="flex flex-col gap-4">
      <PresetRailPanel
        presetId={presetId}
        onSelect={handleSelectPreset}
        variant="panel"
      />
      <aside className="rounded-2xl border border-border bg-card p-4">
        <LoraTrainingHistorySidebar />
      </aside>
    </div>
  )

  if (isMobile) {
    // Mobile: presets + history stack above; form lives in a Vaul sheet
    // triggered by the floating FAB.
    return (
      <section className="mx-auto max-w-5xl space-y-4 pb-24">
        {sideColumn}
        <MobileTrainingSheet>{formColumn}</MobileTrainingSheet>
      </section>
    )
  }

  // Desktop: always 2 columns from md+ — form 7fr, presets+history 5fr.
  return (
    <section className="mx-auto grid max-w-7xl gap-4 md:grid-cols-12 md:items-start">
      <div className="md:col-span-7">{formColumn}</div>
      <div className="md:col-span-5">{sideColumn}</div>
    </section>
  )
}
