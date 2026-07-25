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
  ArrowLeftRight,
  ArrowUpRight,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  Compass,
  GripVertical,
  Heart,
  ImageIcon,
  Key,
  PanelLeftClose,
  PanelLeftOpen,
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
import {
  getBaseOnlyGenerationBases,
  getCompatibleBases,
  getDefaultBaseOnlyGenerationBase,
  getDefaultBase,
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
import { LoraLibrarySegmented } from '@/components/business/studio/lora/library/LoraLibrarySegmented'
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
// S3 库 modal 懒加载：只在＋添加唤起时才拉进来（含 useCivitaiLoraLibrary /
// dialog / 卡片链），不进生成页主 bundle——既是代码分割优化，也避免主 workbench
// 的 eager import 图变重（会拖慢测试里临界的过渡计时断言）。
const LoraLibraryModal = dynamic(
  () =>
    import('@/components/business/studio/lora/library/LoraLibraryModal').then(
      (m) => m.LoraLibraryModal,
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
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildSourceMatchedLoraPrompt } from '@/lib/lora-source-match-prompt'
import { getGeneratingStageKey } from '@/lib/generation-progress'
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
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { StudioGeneratingProgress } from '@/components/business/studio-shared'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getAvailableImageModels, resolveAdapterType } from '@/constants/models'
import {
  getCapabilityConfig,
  getMaxReferenceImages,
  type NumericRange,
} from '@/constants/provider-capabilities'
import { adapterHasCapability } from '@/constants/llm-capability'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useImageUpload } from '@/hooks/use-image-upload'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { LoraAspectRatioChip } from '@/components/business/studio/lora/LoraAspectRatioChip'
import { LoraAssistantDock } from '@/components/business/studio/lora/LoraAssistantDock'
import { LoraBaseModelModal } from '@/components/business/studio/lora/LoraBaseModelModal'
import { LoraCollocationStatusBar } from '@/components/business/studio/lora/LoraCollocationStatusBar'
import { LoraReferenceImageCards } from '@/components/business/studio/lora/LoraReferenceImageCards'
import { LoraScaleChip } from '@/components/business/studio/lora/LoraScaleChip'
import type { TriggerChipEntry } from '@/components/business/studio/lora/TriggerChipRow'
import {
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import {
  buildSavedModelOptionsForModels,
  getTranslatedModelLabel,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { appendPromptFragments } from '@/lib/prompt-text-append'
import { compilePromptTags } from '@/lib/prompt-tag-compiler'
import type { LoraAssistantMount } from '@/types'
import type { PromptTagSelection } from '@/types/prompt-tags'
import { cn } from '@/lib/utils'

import '@/app/lora.css'

export function LoraWorkbench() {
  const t = useTranslations('LoraWorkbench')
  const tStudioV2 = useTranslations('StudioV2')
  // CD：助手开关移到模块 tab 行最右 → 状态提到 root，GenerateBranch 收 props
  // （dock 本体仍挂在 GenerateBranch 里，那里才有 persona 上下文）。
  const [assistantOpen, setAssistantOpen] = useState(false)
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
  // R1 库聚焦浏览（lora-library.md §3）：确认图把搜索与低层级控件收进同一条
  // 顶栏——搜索占左侧主位（flex-1），公开/我的、来源、排序/安全/刷新在右侧
  // 低层级。搜索 state 仍留在各源 pane 的 hook 里（civitai/HF 各一套），
  // 只把搜索框的 DOM 落点 portal 进这个常驻槽，保住「顶栏不随内层 crossfade
  // 闪烁、只结果区淡入」的既有动效约定。
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

  // 「库」tab 同时覆盖 community(公开)/mine(我的) 两个子态：tabValue 把 mine
  // 折回 community，使 community trigger 在两态下都高亮。
  const tabValue =
    activeSection === LORA_WORKBENCH_SECTIONS.MINE
      ? LORA_WORKBENCH_SECTIONS.COMMUNITY
      : activeSection
  const isLibrary =
    activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ||
    activeSection === LORA_WORKBENCH_SECTIONS.MINE
  // S2精修②：仅生成页桌面锁一屏高（三栏各栏内滚·出图键常驻）；库/训练/移动
  // 正常页面流。驱动下方 shell + 三栏的条件 height 链。
  const isGenerate = activeSection === LORA_WORKBENCH_SECTIONS.GENERATE

  // D7⑦: 壳（tab bar）不动，body crossfade。顶层三段（生成 / 库 / 训练）
  // 切换时整块 body 淡入；库内公开↔我的属同一壳，只让内层内容淡入、pills
  // 不动。key 变化触发 React 重挂载 → animate-in fade 播放；reduced-motion
  // 由 globals.css 的全局 media 块降级为直切。
  const bodyKey = isLibrary ? 'library' : activeSection

  // R1 close-review（owner 2026-07-19「左右空出这么大的空间」）：内容容器
  // max-w-6xl→7xl，宽视口下收窄两侧留白。
  return (
    <div
      className={cn(
        'domain-lora w-full px-4 py-5 sm:px-6 lg:px-8',
        // S2精修②：生成页桌面 = flex-col + h-svh + overflow-hidden（链头）；库/
        // 训练/移动保持 min-h-svh 正常滚。
        isGenerate
          ? 'min-h-svh space-y-5 md:flex md:h-svh md:min-h-0 md:flex-col md:space-y-0 md:gap-4 md:overflow-hidden'
          : 'min-h-svh space-y-5',
      )}
    >
      {/* CD 装配台：模块 tab = 左对齐下划线 tabs（无图标·variant=line），助手
          开关在同行最右。原「居中胶囊 segmented + 图标」形制与 CD 不符
          （owner 2026-07-25）。Radix Tabs 自带 role=tab / 键盘导航。 */}
      <Tabs
        value={tabValue}
        onValueChange={handleTabChange}
        className="md:shrink-0"
      >
        <div className="flex w-full items-center gap-3">
          <TabsList variant="line" className="h-9">
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
              value={LORA_WORKBENCH_SECTIONS.TRAIN}
              className="px-3 text-sm"
            >
              {t('tabs.train')}
            </TabsTrigger>
          </TabsList>
          {/* CD：助手开关在 tab 行最右（生成页专属功能，其它 tab 不渲染）。 */}
          {isGenerate ? (
            <button
              type="button"
              aria-label={tStudioV2('enhance')}
              aria-pressed={assistantOpen}
              onClick={() => setAssistantOpen((prev) => !prev)}
              className={cn(
                studioToolTriggerClass,
                'ml-auto h-8 shrink-0 px-3 text-xs',
                assistantOpen && studioChipActiveClass,
              )}
            >
              <Bot className="size-3.5" aria-hidden />
              {tStudioV2('enhance')}
            </button>
          ) : null}
        </div>
      </Tabs>

      <div
        key={bodyKey}
        className={cn(
          'animate-in fade-in duration-200',
          // S2精修②：生成页桌面 body 填满 root 剩余高度（min-h-0 允许内层滚）。
          isGenerate &&
            'md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden',
        )}
      >
        {activeSection === LORA_WORKBENCH_SECTIONS.GENERATE ? (
          <GenerateBranch
            assistantOpen={assistantOpen}
            onAssistantOpenChange={setAssistantOpen}
          />
        ) : null}

        {isLibrary ? (
          <section className="space-y-3">
            {/* R1 顶栏（lora-library.md §3）：搜索占左侧主位，公开/我的 + 来源
                + 排序/安全/刷新在右侧低层级，同一条顶栏。整行常驻不随 section
                切换重挂载（下面 crossfade 只包结果内层）——搜索槽 / 来源槽 /
                控件槽由各源 pane 通过 portal 挂内容进来（state 仍留原层级）；
                「我的」子态无双源无搜索，只剩公开/我的下拉，其余槽不渲染。 */}
            <div className="flex flex-wrap items-center gap-2">
              {activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ? (
                <div ref={setLibrarySearchSlot} className="min-w-0 flex-1" />
              ) : null}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {/* R1 close-review：公开/我的只有两个值，owner「不要下拉」——
                    改紧凑 segmented 切换。 */}
                <LoraLibrarySegmented
                  ariaLabel={t('libraryScopeLabel')}
                  value={
                    activeSection === LORA_WORKBENCH_SECTIONS.MINE
                      ? LORA_WORKBENCH_SECTIONS.MINE
                      : LORA_WORKBENCH_SECTIONS.COMMUNITY
                  }
                  onChange={(value) => setActiveSection(value)}
                  options={[
                    {
                      value: LORA_WORKBENCH_SECTIONS.COMMUNITY,
                      label: t('library.public'),
                      icon: <Compass className="size-3.5" aria-hidden />,
                    },
                    {
                      value: LORA_WORKBENCH_SECTIONS.MINE,
                      label: t('tabs.mine'),
                      icon: <Heart className="size-3.5" aria-hidden />,
                    },
                  ]}
                />
                {activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ? (
                  <>
                    <div
                      ref={setLibrarySourceNavSlot}
                      className="flex shrink-0 flex-wrap items-center gap-2"
                    />
                    <div
                      ref={setLibraryControlsSlot}
                      className="flex shrink-0 flex-wrap items-center gap-2"
                    />
                  </>
                ) : null}
              </div>
            </div>

            {/* 公开↔我的：顶栏是壳保持不动，只让内层结果 crossfade。 */}
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
                  searchSlotNode={librarySearchSlot}
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

/** D7③ + G3d: one entry in the session result filmstrip. `scale`/`seed` drive
 *  the corner label; `width`/`height`/`steps`/`baseName`/`loraName` are captured
 *  at generate-time for the G3d result-column meta line. All may be null. */
interface LoraResultHistoryItem {
  id: string
  url: string
  scale: number | null
  seed: string | null
  width: number | null
  height: number | null
  steps: number | null
  baseName: string | null
  loraName: string | null
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
interface GenerateBranchProps {
  /** 助手 dock 开关——按钮在模块 tab 行最右（root 持有状态），dock 本体在这里。 */
  assistantOpen: boolean
  onAssistantOpenChange: (open: boolean) => void
}

function GenerateBranch({
  assistantOpen,
  onAssistantOpenChange,
}: GenerateBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const tModels = useTranslations('Models')
  // 移动端底部条的助手键复用 studio 各页同一套文案。
  const tStudioV2 = useTranslations('StudioV2')
  const stack = useActiveLoraStack()
  const {
    generate,
    isGenerating,
    lastGeneration,
    elapsedSeconds,
    error: generateError,
  } = useUnifiedGenerate()
  const tStudioV3 = useTranslations('StudioV3')
  const generatingStageLabel = tStudioV3(
    `generatingOverlayStages.${getGeneratingStageKey(elapsedSeconds)}` as const,
  )

  // 完成节拍：isGenerating→false 后把裱框显影多留一拍,播 close→hold→fade
  // (loading-language §2.3)。与 GenerationPreview 同款「渲染期调整 state」
  // 模式——响应 prop 变迁,非同步外部系统,不走 useEffect。
  const [isCompletingGeneration, setIsCompletingGeneration] = useState(false)
  const [prevIsGenerating, setPrevIsGenerating] = useState(isGenerating)
  if (isGenerating !== prevIsGenerating) {
    setPrevIsGenerating(isGenerating)
    if (prevIsGenerating && !isGenerating && lastGeneration && !generateError) {
      setIsCompletingGeneration(true)
    }
  }
  const showGeneratingOverlay = isGenerating || isCompletingGeneration
  // 「自己搭配」词库（docs/design/pages/lora-domain-wireframes.md §3）读写的就是
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
  const recipeGroupKey = recipeGroupAsset?.id ?? null
  // G3b：来源图缩略带点开即进共享 modal，主台不再有内联配方面板——原先的
  // selectedImageUrl / 默认选中第一张来源图都随内联面板退役。做同款的 seed
  // 策略（用原图 seed）由共享 modal 内的勾选自持（G3b-seed），不再父级托管。
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  // 裱框显影参数行 — "{elapsed}s · {底模名} · {比例}"（loading-language §2.1）。
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
    }
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

  // 一键补挂配方里叠加的其他 LoRA：解析（本地库→Civitai）→ push 进挂载栈，
  // 状态（loading/mounted/failed）回写驱动 LoraSourceRecipeStrip 的行内反馈。
  // 「做同款」与行内「补挂」按钮共用这一份（owner 2026-07-20：做同款要把额外
  // LoRA 一起挂上，才是真还原）。baseModelFamily 用当前主 LoRA 的家族做解析
  // 提示，挑对底模变体；架构不兼容的额外 LoRA 会被兼容闸拦下不挂。
  const [extraMountStatusByKey, setExtraMountStatusByKey] = useState<
    Record<string, ExtraMountStatus>
  >({})
  const mountExtras = useCallback(
    (extras: readonly CivitaiRecipeExtraLora[]) => {
      if (extras.length === 0) return
      void mountRecipeExtraLoras({
        extras,
        stackItems: stack.items,
        maxStack: LORA_STACK_MAX,
        baseModelFamily: loraFamily,
        resolveLora: resolveCivitaiLoraAPI,
        pushLora: stack.push,
        setLoraScale: stack.setScale,
        setStatus: (key, status) =>
          setExtraMountStatusByKey((prev) => ({ ...prev, [key]: status })),
        isBaseCompatible: selectedBase
          ? (fam) => isLoraBaseModelMountCompatible(fam, selectedBase.family)
          : undefined,
      })
    },
    [stack, loraFamily, selectedBase],
  )

  // CD③ 搭配审阅：做同款把值直接写进主台（不改），但标成「待审阅」并自动摊开
  // 变更卡；用户点「应用」才转成「已应用」，点「撤销」整批回滚。展开态提到这
  // 一层，因为落台那一刻要能替用户把卡摊开。
  const [collocationPending, setCollocationPending] = useState(false)
  const [collocationExpanded, setCollocationExpanded] = useState(false)

  const handleApplyPendingRecipe = useCallback(() => {
    setCollocationPending(false)
    setCollocationExpanded(false)
  }, [])

  const handleApplyRecipe = useCallback(
    (recipe: CivitaiImageRecipe, options: { includeSeed: boolean }) => {
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
      }
      // §4.3「一键同款只替换正文,不碰 chips 行」：配方文本原样写进 prompt。
      // 旧版这里会把其他挂载缺失的触发词 append 进 plan.prompt（B10
      // D7④/§2② 的 appendMissingTriggers），那是触发词 chips 化之前的补丁——
      // 现在其他挂载的触发词已经由各自启用中的 TriggerChipRow chip 独立进入
      // 编译管线（见 handleGenerate 的 triggerSelections），不用再拼进正文，
      // 拼了反而会在编译后的 prompt 里重复计入一次。
      setPrompt(plan.prompt)
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
          // 展开时列出的「配方带来的参数」（seed 仅在锁原图 seed 时计入）。
          appliedParamLabels: plan.appliedParams.filter(
            (param) => param !== 'seed' || options.includeSeed,
          ),
          snapshot,
        })
      }
      // owner 2026-07-20：做同款 = 真还原——除了 prompt/参数/底模引用，还把配方
      // 里叠加的其他 LoRA 一起挂上（受容量与架构兼容闸约束）。
      mountExtras(plan.extraLoras)
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

  // 行内「补挂」单个额外 LoRA——与做同款共用 mountExtras。
  const handleMountExtraLora = useCallback(
    (extra: CivitaiRecipeExtraLora) => {
      mountExtras([extra])
    },
    [mountExtras],
  )

  // ── F2 LoRA 助手 dock（docs/plans/lora-assistant-nl2tag-2026-07.md §1.2）──
  // 装配 loraContext 的三份实时数据（挂载/tray/底模家族——每次渲染重算，
  // PromptAssistantPanel 的 sendOpts() 在发送那一刻读到的永远是最新值）+
  // 结果卡落地正文/负向框的回调。dock 开关状态在 root（按钮在模块 tab 行最右），
  // 这里只收 props；dock 宽度由 LoraAssistantDock 自己订阅（正文不按宽度让位，
  // 见下方「恒覆盖态」注）。
  // S3 库 modal：＋添加 LoRA / 空态「去库」唤起分类库对话框（覆盖生成页·即筛
  // 即挂），取代原先跳转到「库」tab。库 tab 仍在（HF/我的 全量浏览）。
  const [libraryModalOpen, setLibraryModalOpen] = useState(false)
  // S7：移动端装配 sheet（紧凑摘要条唤起）。
  const [assemblySheetOpen, setAssemblySheetOpen] = useState(false)
  // CD：装配栏可折叠成竖向图标 rail（右上角开关）——收起时左列宽 300px→56px，
  // 把宽度让给创作面；rail 上仍能看清底模 + 挂载 + 容量，点任一图标展回。
  const [assemblyCollapsed, setAssemblyCollapsed] = useState(false)
  const isAssistantMobile = useIsMobile()

  // owner 2026-07-25：助手 dock 恒「覆盖态」——叠在生成区上方，不再挤压正文
  // （原 R4 的「主台扣掉助手宽仍 ≥900px 就停靠 push」阈值逻辑连同宽度测量一并
  // 移除）。dock 本身是 fixed 出流，正文保持全宽即可被盖住。
  const assistantMounts = useMemo<LoraAssistantMount[]>(
    () =>
      stack.items.map((item) => ({
        name: item.asset.name,
        triggerWords: item.asset.triggerWord?.trim()
          ? [item.asset.triggerWord.trim()]
          : [],
        family: item.asset.baseModelFamily ?? undefined,
      })),
    [stack.items],
  )
  const assistantTrayTags = useMemo(
    () =>
      [...promptTags.positive, ...promptTags.negative]
        .filter((selection) => selection.enabled)
        .map((selection) => selection.promptText),
    [promptTags.positive, promptTags.negative],
  )
  const assistantApiKeys = useMemo(
    () =>
      keys
        .filter(
          (key) =>
            key.isActive && adapterHasCapability(key.adapterType, 'enhance'),
        )
        .map((key) => ({ id: key.id, label: key.label || key.adapterType })),
    [keys],
  )
  const handleAssistantAppendPrompt = useCallback((text: string) => {
    setPrompt((prev) => appendPromptFragments(prev, text))
  }, [])
  const handleAssistantFillNegative = useCallback((text: string) => {
    setNegativePrompt(text)
    setNegativePromptExpanded(true)
  }, [])
  const handleAssistantAppendNegative = useCallback((text: string) => {
    setNegativePrompt((prev) => appendPromptFragments(prev, text))
    setNegativePromptExpanded(true)
  }, [])
  const handleAssistantEscapeToSelfBuild = useCallback(() => {
    // 词库（LoraTagPicker）已从生成页移除，待迁入助手（owner 2026-07-24）；
    // 迁入前「自己搭配」escape 暂为空操作。
  }, [])
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
    // 停用（enabled === false）的挂载留在栈里但不送去出图——启停开关的语义就是
    // "先按住这个 LoRA 不参与本次出图"，见 useActiveLoraStack.StoredEntry.enabled。
    const loras = stack.items
      .filter((entry) => entry.enabled !== false)
      .map((entry) => ({
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
            // G3d 结果列元信息（gen-time 快照，反映本次出图而非当前面板值）。
            width: previewDimensions.width,
            height: previewDimensions.height,
            steps: parseOptionalRunnerNumber(runnerSteps) ?? null,
            baseName: selectedBase?.displayName ?? null,
            loraName: stack.items[0]?.asset.name ?? null,
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
    <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--lora-shadow-panel)]">
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
                className="rounded-md bg-destructive/10 px-2.5 py-2 text-2xs text-destructive"
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
                    className="h-8 border-border bg-transparent font-mono text-xs"
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
                    className="h-8 w-16 shrink-0 border-border bg-transparent text-xs"
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
                    className="h-8 w-16 shrink-0 border-border bg-transparent text-xs"
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
                    className="h-8 border-border bg-transparent text-xs"
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
                    className="h-8 border-border bg-transparent text-xs"
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
                    className="h-8 border-border bg-transparent text-xs"
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
                    className="h-8 border-border bg-transparent text-xs"
                  />
                </label>
              </div>
            </div>

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
                    className="h-8 w-full border-border bg-transparent text-xs"
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
                      ? 'text-amber-700 dark:text-amber-400'
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

  // S7 移动端：装配栏内容抽成单实例——桌面挂在常驻左栏，移动端挂进 sheet。
  const assemblyColumn = (
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
        maxLoras={maxLoras}
        activeRecipeGroupId={recipeGroupKey}
        onSelectRecipeGroup={setRecipeGroupAssetId}
        onAddLora={() => setLibraryModalOpen(true)}
        triggerEntries={triggerChipEntries}
        disabledTriggerIds={disabledTriggerIds}
        onToggleTrigger={handleToggleTriggerChip}
        collapsed={assemblyCollapsed}
        onToggleCollapsed={() => setAssemblyCollapsed((prev) => !prev)}
      />
      {/* 折叠态只留 rail（脊柱条本体），参考图/参数两块收起来。 */}
      {/* S2精修①：参考图（能力位驱动·仅底模支持参考图 + 有强度配置时渲染）。 */}
      {!assemblyCollapsed &&
      maxReferenceImages > 0 &&
      referenceStrengthConfig ? (
        <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--lora-shadow-panel)]">
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
    </>
  )

  return (
    <>
      {/* 正文保持全宽——助手 dock 是 fixed 覆盖层，叠在上面而不是把这里挤窄
          （owner 2026-07-25）。 */}
      <section className="space-y-4 pb-24 md:flex md:min-h-0 md:flex-1 md:flex-col md:gap-4 md:space-y-0 md:overflow-hidden md:pb-0">
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

        {/* S3 库 modal（＋添加 LoRA / 空态「去库」唤起）——覆盖生成页即筛即挂。
            只在打开时挂载：useCivitaiLoraLibrary 一挂就拉数据，常驻会让每次进
            生成页都后台打 Civitai（浪费 + 撞限流），故按需挂载（代价=无退场动画）。 */}
        {libraryModalOpen ? (
          <LoraLibraryModal open onOpenChange={setLibraryModalOpen} />
        ) : null}

        {/* S7 移动端装配 sheet：近全屏 Drawer 承载整条装配栏（底模/LoRA栈/参考图/
            参数），由上面的紧凑摘要条唤起。仅移动端挂载（桌面走常驻左栏）。 */}
        {isAssistantMobile ? (
          <Drawer open={assemblySheetOpen} onOpenChange={setAssemblySheetOpen}>
            <DrawerContent className="max-h-[88svh]">
              <DrawerTitle className="sr-only">
                {t('spine.currentLora')}
              </DrawerTitle>
              <div className="space-y-3 overflow-y-auto px-4 pb-8 pt-2">
                {assemblyColumn}
              </div>
            </DrawerContent>
          </Drawer>
        ) : null}

        {/* CD 装配台三栏（近炭暖灰）：外层 grid = 左装配栏(300px) | 右主体（内层
            5col：中来源/输入 + 右结果）。移动端自然堆叠。左装配栏 = 底模/LoRA栈/
            添加(LoraSpineBar) + 参考图（S2精修①：参考图从中栏迁入左栏·组件按 300px
            窄栏 2col 适配）。参数 disclosure 待迁（S2精修①-B）。 */}
        {/* S7 移动端：装配栏收成一条紧凑摘要（底模 + 已挂 LoRA + ＋），点开近全屏
            装配 sheet；桌面走下面的常驻左栏。移动端主创作屏只剩 摘要条 → Prompt →
            结果 → 底部常驻出图条（.lora-mobile-actionbar）。 */}
        {isAssistantMobile ? (
          <button
            type="button"
            onClick={() => setAssemblySheetOpen(true)}
            aria-label={t('spine.openAssembly')}
            className="flex w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-card px-3 py-2 text-left shadow-[var(--lora-shadow-panel)]"
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
                  className="size-1.5 shrink-0 rounded-full bg-emerald-500/70 dark:bg-emerald-400/70"
                />
                <span className="truncate">{item.asset.name}</span>
              </span>
            ))}
            <span className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground">
              <Plus className="size-3.5" aria-hidden />
            </span>
          </button>
        ) : null}

        <div
          className={cn(
            'lora-motion-cols md:grid md:min-h-0 md:flex-1 md:items-stretch md:gap-5 md:overflow-hidden',
            // 折叠时左列收成图标 rail 宽度，创作面吃掉剩余空间（列宽走过渡，
            // 不瞬跳——CD 动效轴「柔顺连续」）。
            assemblyCollapsed
              ? 'md:grid-cols-[56px_minmax(0,1fr)]'
              : 'md:grid-cols-[300px_minmax(0,1fr)]',
          )}
        >
          {/* 左装配栏：桌面常驻（锁高时自身内滚·min-h-0 允许收缩）；移动端此格
              空着，装配内容由上面的紧凑条唤起 sheet 承载（S7）。 */}
          <div className="hidden space-y-3 md:block md:min-h-0 md:overflow-y-auto md:pr-1">
            {/* 单实例：桌面渲染在这里，移动端渲染在 sheet 里（isAssistantMobile
                二选一，避免 LoraSpineBar 被挂两份、内部状态分叉）。 */}
            {!isAssistantMobile ? assemblyColumn : null}
          </div>

          {
            // G3a 布局 A「并排监视台」：装配行下是一张 60/40 网格——左 60% 输入列
            // （临时顶部=推荐/自己搭配面板，G3b 换成来源图带+搭配状态条 → composer
            // 输入），右 40% 结果监视列（跨左列两行）。空态不整块占位：composer+结果
            // 框常驻，只在推荐列给「去库挑一个 LoRA」引导（见 !hasLora 分支）。
            <div className="grid min-w-0 gap-x-6 gap-y-5 md:grid-cols-5 md:items-stretch md:min-h-0 md:h-full md:grid-rows-[auto_minmax(0,1fr)]">
              {/* 来源图带整格只在有挂载时渲染——未挂载时它内部全是 null，留个空
                  格会被 grid 的 gap-y-5 顶出 20px，让中栏比左右两栏矮/低一截
                  （owner 2026-07-25「中间的框和另外两个不一样」）。 */}
              <div
                className={cn(
                  'order-1 min-w-0 md:order-none md:col-span-3 md:row-start-1',
                  !hasLora && 'hidden md:hidden',
                )}
              >
                {/* 来源图带（中创作面顶）：来源图缩略带常驻（挂载显示 LoRA 效果
                证据，点图开共享配方 modal；未挂载退化成「纯底模 / 去库」引导）。
                （原「自己搭配」词库 LoraTagPicker 2026-07-24 已从生成页移除，
                待迁入助手，见 handleAssistantEscapeToSelfBuild 注。） */}
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
                        sourceUrl={recipeGroupAsset?.loraUrl ?? ''}
                        recipes={mined.recipes}
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
                  ) : !hasLora ? null : ( // 来源区留空 + 锁高 grid-rows auto 让 row1 收拢，composer 得更多高。 // 不再重复「去库添加」banner（与侧边栏重复，owner 2026-07-25）。 // 无 LoRA 时来源区留空——「＋添加 LoRA」入口已在左装配栏，中栏
                    <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      {t('generate.recommendEmpty')}
                    </p>
                  )}
                </div>
              </div>
              {/* 桌面锁高时结果列是 flex 列：标题/元信息/缩略历史按内容高，
                  中间的结果图 flex-1 吃满剩余高度（CD：随页面高度伸缩）。 */}
              <div className="order-3 min-w-0 space-y-3 rounded-xl border border-border bg-card p-3 shadow-[var(--lora-shadow-panel)] md:order-none md:col-span-2 md:col-start-4 md:row-span-2 md:row-start-1 md:flex md:min-h-0 md:flex-col md:gap-3 md:space-y-0 md:overflow-y-auto">
                {/* G3d 结果/历史 头：结果标题 + 会话历史计数（>1 张时）。 */}
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('generate.resultLabel')}
                  </p>
                  {resultHistory.length > 1 ? (
                    <p className="text-2xs text-muted-foreground/70">
                      {t('generate.resultHistoryCount', {
                        count: resultHistory.length,
                      })}
                    </p>
                  ) : null}
                </div>
                {/* 结果图裸浮暗面无底板——去边框/底板，仅圆角裁切；空态套虚线盒占位。
                G3d：有结果时纵横比取自快照，full 图不裁；无快照退回方形。 */}
                <div
                  className={cn(
                    'relative w-full overflow-hidden rounded-xl bg-cover bg-center',
                    // CD：结果图默认竖版 1024/1360，桌面锁高时 flex-1 吃满列高
                    // （不随列宽变高）；有出图快照时改用快照自身比例。
                    !displayedAspect && 'aspect-[1024/1360] md:aspect-auto',
                    'md:min-h-0 md:flex-1',
                    // 无结果时（空态/生成中）给结果框加虚线边界 + 微底色，一眼看清
                    // 占多大空间（用户要求）；有结果时保持「裸浮无底板」。
                    !displayedResultUrl &&
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
                  {/* 生成中「裱框显影」——无旧图走 full(shimmer 底 + 参数行),
                  有旧图(重生成)走 compact(dim + 框描在图边)。完成播 close→
                  hold→fade。与 GenerationPreview 同一共享组件。 */}
                  {showGeneratingOverlay && !displayedResultUrl && (
                    <div
                      className="studio-reveal-shimmer absolute inset-0"
                      aria-hidden
                    />
                  )}
                  {showGeneratingOverlay && displayedResultUrl && (
                    <div
                      className="absolute inset-0 bg-background/35 backdrop-blur-[1px]"
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
                      onCompleteAnimationDone={() =>
                        setIsCompletingGeneration(false)
                      }
                    />
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
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-[9px] leading-tight text-white/90">
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

              {/* 布局 A 输入 composer = 左 60% 列第 2 行。深炭工作台输入面，语义色板
              走标准暗主题 token（发丝边框 border-border / 浅灰次文本 muted-foreground
              / 白丸出图）——不再依赖已退役、且从未编译进样式表的 .lora-generate-input
              象牙 token 重定义（G3 contrast 修）。左栏层级/参考图大卡见 G3c。 */}
              <div
                className={cn(
                  'order-2 space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--lora-shadow-panel)] md:order-none md:col-span-3 md:col-start-1 md:min-h-0 md:overflow-y-auto',
                  // 有来源图带 → 占第 2 行；没有 → 跨两行从顶开始，顶边与左右两
                  // 栏齐平（不被空行 + gap 顶下去）。
                  hasLora ? 'md:row-start-2' : 'md:row-span-2 md:row-start-1',
                )}
              >
                {/* G3b-2b 搭配状态条（Prompt 上方单行）：一眼读到已应用来源配方 +
                触发词×N，点查看展开（配方参数 + 可停用的触发词 chip），点撤销把
                做同款前的输入快照整批回滚。触发词 chips 并入其展开，不再独占一行。 */}
                <LoraCollocationStatusBar
                  recipeApplied={collocationRecipe != null}
                  recipeName={collocationRecipe?.assetName ?? null}
                  appliedParamLabels={
                    collocationRecipe?.appliedParamLabels ?? []
                  }
                  changedParams={collocationChanges.changed}
                  addedPromptTags={collocationChanges.addedPrompt}
                  keptLabels={collocationChanges.kept}
                  triggerEntries={triggerChipEntries}
                  disabledTriggerIds={disabledTriggerIds}
                  onToggleTrigger={handleToggleTriggerChip}
                  onUndo={handleUndoRecipe}
                  pendingReview={collocationPending}
                  onApplyPending={handleApplyPendingRecipe}
                  expanded={collocationExpanded}
                  onExpandedChange={setCollocationExpanded}
                />
                {/* 提示词 = 左栏主输入面（confirmed A §3.2）：带标签的高输入框，深炭面
                上用发丝边框 + 微底圈出主编辑区，是这一列的视觉主角，不被触发词 / 参数
                挤成短输入条（min-h ≈ 208px，可纵向拉伸）。 */}
                <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <label
                    htmlFor="lora-prompt"
                    className="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t('generate.promptLabel')}
                  </label>
                  <textarea
                    id="lora-prompt"
                    ref={promptTextareaRef}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={t('generate.promptPlaceholder')}
                    className="min-h-52 w-full resize-y bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <PromptTagAutocomplete
                    textareaRef={promptTextareaRef}
                    value={prompt}
                    onChange={setPrompt}
                    polarity="positive"
                  />
                  {/* owner 2026-07-25：忠实还原 / 画面比例 收进提示词卡底部——它们
                      是「怎么画这段词」的修饰，跟 Prompt 同属一个输入面，不该和主
                      动作抢底栏。 */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={!activeAsset || isGenerating}
                      onClick={handleRestore}
                    >
                      <Wand2 className="size-3.5" aria-hidden />
                      {t('generate.restore')}
                    </Button>
                    <LoraAspectRatioChip
                      value={aspectRatio}
                      onChange={setAspectRatio}
                      disabled={isGenerating}
                    />
                  </div>
                </div>
                {/* CD：负面 Prompt 是一条可折叠的单行摘要（Negative + 内容预览 +
                    角标），不是「＋ 添加负面 Prompt」文字链接。 */}
                <div className="rounded-xl border border-border bg-muted/20">
                  <button
                    type="button"
                    aria-expanded={negativePromptExpanded}
                    onClick={() => setNegativePromptExpanded((open) => !open)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  >
                    <span className="shrink-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('generate.negativePromptLabel')}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground/70">
                      {negativePrompt.trim() ||
                        t('generate.negativePromptPlaceholder')}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-3.5 shrink-0 text-muted-foreground transition-transform',
                        negativePromptExpanded && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                  {/* 展开/收起走 grid-rows 过渡（.lora-reveal），收起时 inert
                      挡住焦点与读屏。 */}
                  <div
                    className="lora-reveal"
                    data-open={negativePromptExpanded ? 'true' : 'false'}
                  >
                    <div inert={!negativePromptExpanded}>
                      <div className="space-y-1 border-t border-border/60 px-3 pb-2.5 pt-2">
                        <textarea
                          ref={negativePromptTextareaRef}
                          value={negativePrompt}
                          onChange={(event) =>
                            setNegativePrompt(event.target.value)
                          }
                          placeholder={t('generate.negativePromptPlaceholder')}
                          rows={2}
                          className="w-full resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground"
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
                        : 'text-muted-foreground',
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
                {/* S2精修①-B：Runner 高级参数已迁到左装配栏（runnerParamsPanel）。 */}
                {/* CD：出图 = 整宽主按钮压在创作面最底（唯一主动作，不与修饰控件
                    同行争位；忠实还原/比例已收进提示词卡）。< md 仍走
                    `.lora-mobile-actionbar` 收成底部常驻条。 */}
                <div className="lora-mobile-actionbar flex items-center gap-2.5">
                  {/* CD 移动端底部常驻条 = mono 摘要（底模·挂载数·比例）+ 助手图标
                      + 右侧定宽出图，一行。桌面（≥1024）退回整宽单主按钮。
                      CD 样图里的「1024」是像素尺寸，本域只有比例档，照实写比例。 */}
                  {isAssistantMobile ? (
                    <>
                      <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
                        {[
                          selectedBase
                            ? selectedBase.translationKey
                              ? t(`spine.${selectedBase.translationKey}`)
                              : selectedBase.displayName
                            : t('spine.baseModelPending'),
                          `×${stack.items.length}`,
                          aspectRatio,
                        ].join(' · ')}
                      </span>
                      <button
                        type="button"
                        aria-pressed={assistantOpen}
                        aria-label={tStudioV2('enhance')}
                        onClick={() => onAssistantOpenChange(!assistantOpen)}
                        className={cn(
                          'inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                          assistantOpen
                            ? 'border-primary/40 bg-primary/10 text-foreground'
                            : 'border-transparent text-muted-foreground',
                        )}
                      >
                        <Bot className="size-4" aria-hidden />
                      </button>
                      <div className="flex-1" />
                    </>
                  ) : null}
                  <Button
                    type="button"
                    className={cn(
                      'h-11 text-sm font-semibold',
                      isAssistantMobile ? 'shrink-0 px-8' : 'w-full',
                    )}
                    disabled={!canGenerate}
                    onClick={handleGenerateClick}
                  >
                    {isGenerating ? (
                      <Spinner size="sm" aria-hidden />
                    ) : (
                      <Sparkles className="size-4" aria-hidden />
                    )}
                    {t('generate.run')}
                  </Button>
                </div>
              </div>
            </div>
          }
        </div>
      </section>
      <LoraAssistantDock
        open={assistantOpen}
        onOpenChange={onAssistantOpenChange}
        currentPrompt={prompt}
        modelId={baseModelId ?? undefined}
        llmApiKeys={assistantApiKeys}
        referenceImageData={imageUpload.referenceImages[0]}
        onUsePrompt={setPrompt}
        onAppendPrompt={handleAssistantAppendPrompt}
        persona={{
          mounts: assistantMounts,
          baseFamily: selectedBase?.family,
          trayTags: assistantTrayTags,
          onUseNegativePrompt: handleAssistantFillNegative,
          onAppendNegativePrompt: handleAssistantAppendNegative,
          onEscapeToSelfBuild: handleAssistantEscapeToSelfBuild,
        }}
      />
    </>
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
  maxLoras,
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

  const fidelityLabel = (b: LoraBaseModel) =>
    b.fidelity === 'faithful' ? t('spine.faithful') : t('spine.fast')
  const baseDisplayName = (b: LoraBaseModel) =>
    b.translationKey ? t(`spine.${b.translationKey}`) : b.displayName
  // S4：两层分组选择逻辑（云端/Runner·SDXL/DiT）已搬进 LoraBaseModelModal，
  // 脊柱条这里只留一张「底模卡」唤起 modal。

  // CD 收起态：竖向图标 rail——折叠开关 / 底模方块 / 挂载缩略图（带兼容点）/
  // ＋添加 / 已挂 N。点缩略图切来源图分组、点底模开换底模 modal，信息不丢。
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-1.5 py-2.5 shadow-[var(--lora-shadow-panel)]">
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
          className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Boxes className="size-4" aria-hidden />
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
                    compatible
                      ? 'bg-emerald-500/80 dark:bg-emerald-400/80'
                      : 'bg-amber-500 dark:bg-amber-400',
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
        <span className="text-center font-mono text-3xs leading-tight text-muted-foreground">
          {t('spine.mountedCount', { count: stack.items.length })}
        </span>
      </div>
    )
  }

  return (
    // CD 装配台（近炭暖灰）：脊柱条升为浮起纸面面板——左装配栏雏形，S2b 竖化成
    // 竖向 LoRA 栈 + 底模卡 + 触发词。（原 D8「去盒化·底部白 8% 发丝线」为冷瓷前
    // 旧线，深底上白发丝线本就近隐形，此处反转成 bg-card 浮起面板 + token 发丝边。）
    <div className="flex flex-col items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-[var(--lora-shadow-panel)]">
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
            {/* CD 底模卡：左侧立方体图标（底模=一个"块"的隐喻）。 */}
            <Boxes
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              {selectedBase ? (
                <>
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {baseDisplayName(selectedBase)}
                  </span>
                  {/* CD：族 · 通道 · 忠实/快 合成一行 mono meta（执行通道不再
                      单独占一行）。300px 窄栏放不下「Runner · 唯一通道」全称，
                      通道用短标（Runner / 云端 API），全称进 title。 */}
                  <span
                    className="block truncate font-mono text-2xs text-muted-foreground"
                    title={
                      selectedBase.backend === 'runner'
                        ? t('spine.executorRunner')
                        : t('spine.executorCloud')
                    }
                  >
                    {selectedBase.family} ·{' '}
                    {selectedBase.backend === 'runner'
                      ? t('baseModal.channelRunner')
                      : t('spine.executorCloud')}{' '}
                    · {fidelityLabel(selectedBase)}
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
      {/* 执行通道已并入上面底模卡的 mono meta 行（CD），不再单独占一行。 */}
      {/* LoRA 栈（在底模下面）。CD：标题行右侧给「已挂 N」计数。 */}
      <div className="mt-1 flex w-full items-baseline gap-2">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
          {t('spine.stackTitle')}
        </span>
        <span className="ml-auto font-mono text-2xs text-muted-foreground">
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
                  ? 'border-amber-500/30 bg-amber-500/10'
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
                    className="size-1.5 shrink-0 rounded-full bg-emerald-500/70 dark:bg-emerald-400/70"
                  />
                ) : compatible === false ? (
                  <span
                    role="img"
                    aria-label={t('spine.compatDotWarning')}
                    title={t('spine.compatDotWarning')}
                    className="size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
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
                <p className="mt-1.5 text-2xs text-amber-600 dark:text-amber-400">
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
      {/* CD：「＋ 添加 LoRA」是整宽虚线按钮（栈的收尾位·点开库 modal），容量
          在下方小字（满栈时才是硬信息，不抢主按钮）。 */}
      <button
        type="button"
        onClick={onAddLora}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="size-3.5" aria-hidden />
        {t('spine.addLoraFull')}
      </button>
      {maxLoras && maxLoras > 1 ? (
        <span className="font-mono text-2xs text-muted-foreground/70">
          {t('spine.mountCount', {
            current: stack.items.length,
            max: maxLoras,
          })}
        </span>
      ) : null}
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
                        : 'bg-emerald-500/80 dark:bg-emerald-400/80',
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

// S8（CD 训练台）：主列步骤编号——训练是有先后的流程（先选预设再填表），编号
// 让顺序一眼可读。绝对定位在卡片左上角外沿，不挤占卡片内容宽度。
function StepBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="absolute -left-1 -top-1 z-10 inline-flex size-5 items-center justify-center rounded-full border border-border bg-background font-mono text-2xs font-semibold text-muted-foreground shadow-sm"
    >
      {n}
    </span>
  )
}

function TrainingBranch() {
  // 训练页对稿（lora-domain-wireframes.md §6）：稿子是两栏——左表单，右
  // 提交卡+训练任务列表，没有独立的历史/预设侧栏。以前是三栏（历史 240px·
  // 表单·预设 280px，xl 才三栏，md..xl- 退成两栏+预设折下面），现在统一
  // 收成两栏：左表单，右边把预设 + 训练任务列表堆在一起——功能都留着，
  // 只是不再各占一条独立的常驻侧栏。
  const isMobile = useIsMobile()
  const tTraining = useTranslations('LoraTraining')
  const [presetId, setPresetId] = useState<LoraTrainingPresetId | null>(null)
  // CD② 空态的「挑一个预设」按钮：表单在步骤 2、预设卡在步骤 1，点了得把人送
  // 回上面那张卡，否则空态一收表单就摊开、预设反而被越过去了。
  const presetPanelRef = useRef<HTMLDivElement>(null)
  const handleRequestPreset = useCallback(() => {
    presetPanelRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [])

  const handleSelectPreset = useCallback(
    (preset: { id: LoraTrainingPresetId }) => {
      setPresetId(preset.id)
    },
    [],
  )

  const handleClearPreset = useCallback(() => {
    setPresetId(null)
  }, [])

  // S8（CD 训练台-组建）：主列 = 有编号的两步——① 选择预设（一键填好类型/底模/
  // 触发词）② 填表单（上传训练图 + 配置 + 提交）。预设从右侧栏移到主列顶部，
  // 因为它是流程第一步、不是参考资料；右栏只留训练历史 + 产物去向说明。
  const formColumn = (
    <div className="space-y-4">
      <div className="relative" ref={presetPanelRef}>
        <StepBadge n={1} />
        <PresetRailPanel
          presetId={presetId}
          onSelect={handleSelectPreset}
          variant="panel"
        />
      </div>
      <div className="relative">
        <StepBadge n={2} />
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <LoraTrainingForm
            hideRecentJobs
            showEmptyState
            selectedPresetId={presetId}
            onPresetClear={handleClearPreset}
            onRequestPreset={handleRequestPreset}
          />
        </div>
      </div>
    </div>
  )

  const sideColumn = (
    <div className="flex flex-col gap-4">
      <aside className="rounded-2xl border border-border bg-card p-4">
        <LoraTrainingHistorySidebar />
        {/* CD：训练产物去向——完成的 LoRA 进「我的资源」，在库 modal 的「我的」
            tab 可挂载（把训练与生成两侧连起来）。 */}
        <p className="mt-3 border-t border-border/60 pt-3 text-2xs leading-relaxed text-muted-foreground">
          {tTraining('historyOutputHint')}
        </p>
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
