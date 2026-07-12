'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Download,
  ExternalLink,
  GraduationCap,
  Heart,
  History,
  Info,
  Key,
  Library,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_LORA_SORT_OPTIONS,
  DEFAULT_LORA_NSFW_FILTER,
  DEFAULT_LORA_WORKBENCH_SECTION,
  LORA_LIBRARY_FAMILY_PARAM,
  LORA_LIBRARY_NSFW_PARAM,
  LORA_LIBRARY_SEARCH_PARAM,
  LORA_LIBRARY_SORT_PARAM,
  LORA_NSFW_FILTER_VALUES,
  LORA_RESULT_HISTORY_MAX,
  LORA_TOAST_DURATION_MS,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraBaseModel,
  isCivitaiLoraSort,
  isLoraNsfwFilter,
  isLoraWorkbenchSection,
  type CivitaiLoraBaseModel,
  type LoraNsfwFilter,
  type LoraWorkbenchSection,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import {
  getCompatibleBases,
  getDefaultBase,
  type LoraBaseModel,
} from '@/constants/lora-base-models'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { AspectRatio } from '@/constants/config'
import type {
  CivitaiImageRecipe,
  CivitaiLoraLibraryItem,
  CivitaiMinedPromptsResult,
  LoraAssetRecord,
} from '@/types'
import {
  LORA_STACK_MAX,
  useActiveLoraStack,
} from '@/hooks/use-active-lora-stack'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import { useCivitaiModelDescription } from '@/hooks/prompts/use-civitai-model-description'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
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
import { LoraCoverTile } from '@/components/business/studio/lora/LoraCoverTile'
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
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from '@/lib/civitai-search-history'
import { buildLoraPromptTemplate } from '@/lib/lora-prompt-template'
import { appendMissingTriggers } from '@/lib/lora-prompt-triggers'
import { buildSourceMatchedLoraPrompt } from '@/lib/lora-source-match-prompt'
import { buildCivitaiRecipeGenerationPlan } from '@/lib/civitai-recipe-to-generation'
import { LoraSourceImagePreviewStrip } from '@/components/business/studio/prompt-tags/LoraSourceImagePreviewStrip'
import { LoraSourceRecipeStrip } from '@/components/business/studio/prompt-tags/LoraSourceRecipeStrip'
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
import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  buildSavedModelOptionsForModels,
  getTranslatedModelLabel,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { compilePromptTags } from '@/lib/prompt-tag-compiler'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import type { PromptPolarity } from '@/types/prompt-tags'
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
    favoriteCivitaiLora,
    unfavoriteAsset,
    unfavoriteByUrl,
    deleteAsset,
    isFavorited,
  } = useLoraAssets()

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
          <section className="space-y-4">
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
                onClick={() => setActiveSection(LORA_WORKBENCH_SECTIONS.MINE)}
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

            {/* 公开↔我的：pills 是壳保持不动，只让内层内容 crossfade。 */}
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
                <CivitaiCommunityBranch
                  onFavorite={favoriteCivitaiLora}
                  onUnfavoriteByUrl={unfavoriteByUrl}
                  isFavorited={isFavorited}
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
  seed: number | null
}

/** GenerationRecord.seed is bigint|string|number|null (bigint from DB, string
 *  after JSON). Normalize to a finite number for the filmstrip label, or null. */
function normalizeRecordSeed(
  seed: bigint | string | number | null | undefined,
): number | null {
  if (seed == null) return null
  const n = typeof seed === 'bigint' ? Number(seed) : Number(seed)
  return Number.isFinite(n) ? n : null
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
  const compatibleBases = useMemo(
    () => (loraFamily ? getCompatibleBases(loraFamily) : []),
    [loraFamily],
  )
  const defaultBase = loraFamily ? getDefaultBase(loraFamily) : null
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null)
  const selectedBase =
    compatibleBases.find((b) => b.id === selectedBaseId) ?? defaultBase

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

  // 提示词默认填当前 LoRA 触发词（保证 LoRA 被激活）；切 LoRA 时更新。
  // 用 render 时条件 setState（React 推荐的"随 prop 重置 state"），避免 effect 级联。
  const loraId = stack.items[0]?.asset.id ?? null
  const loraTrigger = stack.items[0]?.asset.triggerWord ?? ''
  // §2②: 纸的初始预填 = 全部挂载触发词逗号连接（不只 primary），保证多挂载
  // 首次出图不漏别的 LoRA 激活词。reset 只在 primary 变化时触发（key=loraId），
  // 中途新增挂载不清空用户已编辑的正文——那条缺口由「一键同款补齐触发词」兜底。
  const mountedTriggersPrefill = stack.items
    .map((it) => it.asset.triggerWord?.trim())
    .filter((word): word is string => !!word)
    .join(', ')
  const [prompt, setPrompt] = useState('')
  const [promptLoraId, setPromptLoraId] = useState<string | null>(null)
  if (promptLoraId !== loraId) {
    setPromptLoraId(loraId)
    setPrompt(mountedTriggersPrefill)
  }

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
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  // B10 (D7④)：进推荐 tab / 切分组后默认选中第一张来源图，消灭左栏空态。
  // 每个分组只默认一次（recipeDefaultedFor 记住已默认过的分组 key）——用户手动
  // 关闭配方面板后不再自动弹回；切到别的分组才重新默认。render 时条件 setState
  // 是本文件既有惯例（见上方 promptLoraId）。
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
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false)

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
      // B10 (D7④/§2②) 一键同款自动补齐触发词：配方来自某个分组 LoRA，但纸上
      // 还挂着其他 LoRA——把它们缺失的触发词 append 到配方 prompt 末尾，否则
      // 多挂载出图会漏掉别的 LoRA 的激活词。语义只承诺还原单主体（§2③）。
      const appended = appendMissingTriggers(
        plan.prompt,
        stack.items.map((it) => it.asset.triggerWord),
      )
      setPrompt(appended.prompt)
      setNegativePrompt(plan.advancedParams?.negativePrompt ?? '')
      if (plan.aspectRatio) setAspectRatio(plan.aspectRatio)
      // Scale applies to the group the recipe came from (per-mount), not
      // always the primary — multi-mount tunes each LoRA independently.
      if (plan.loraScale != null && recipeGroupAsset) {
        stack.setScale(recipeGroupAsset.id, plan.loraScale)
      }
      setSeed(options.includeSeed ? plan.advancedParams?.seed : undefined)
      // Undoable toast when we actually appended other mounts' triggers
      // (single-mount → nothing appended → no toast).
      if (appended.appendedTriggers.length > 0) {
        const previousPrompt = prompt
        toast.success(
          t('generate.recipeTriggersAppended', {
            triggers: appended.appendedTriggers.join(', '),
          }),
          {
            duration: LORA_TOAST_DURATION_MS,
            action: {
              label: t('generate.recipeTriggersUndo'),
              onClick: () => setPrompt(previousPrompt),
            },
          },
        )
      }
    },
    [prompt, recipeGroupAsset, stack, t],
  )

  const hasLora = stack.items.length > 0
  const canGenerate =
    hasLora &&
    !!selectedBase?.available &&
    !!selectedBase.providerModelId &&
    !isGenerating &&
    // 缺 key 时按钮仍可点——点击路由到 QuickSetupDialog（Hard Rule 8），
    // 不强求先填提示词。
    (needsKeySetup || prompt.trim().length > 0)

  const handleGenerate = useCallback(async () => {
    const providerModelId = selectedBase?.providerModelId
    if (!providerModelId) return
    const loras = stack.items.map((entry) => ({
      url: entry.asset.loraUrl,
      scale: entry.scale ?? entry.asset.defaultScale,
    }))
    // 「自己搭配」选中的标签在这里并入最终 prompt——compiler 只读不写
    // selections，负向标签走 compiledNegativePrompt，和已有的
    // negativePrompt 文本框合并去重，不互相覆盖。
    const compiled = compilePromptTags({
      freePrompt: prompt,
      selectedTags: promptTags.allSelections(),
      existingNegativePrompt: negativePrompt,
    })
    const advanced: Record<string, unknown> = {}
    if (loras.length > 0) advanced.loras = loras
    if (compiled.negativePrompt)
      advanced.negativePrompt = compiled.negativePrompt
    // B9: reference-image img2img — only when the base supports it (enabled
    // urls) and one was attached. Strength drives fal's denoising inversion.
    const referenceImages = imageUpload.referenceImages
    if (referenceImages.length > 0) {
      advanced.referenceStrength = referenceStrength
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
            seed: normalizeRecordSeed(record.seed) ?? seed ?? null,
          },
          ...prev.filter((item) => item.id !== record.id),
        ].slice(0, LORA_RESULT_HISTORY_MAX),
      )
      setSelectedResultId(record.id)
    }
  }, [
    aspectRatio,
    generate,
    imageUpload.referenceImages,
    negativePrompt,
    prompt,
    promptTags,
    referenceStrength,
    seed,
    selectedBase,
    stack,
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

  // §2② 面板预告行：配方来自当前分组 LoRA，其他挂载的触发词在「一键同款」时
  // 会被自动补上——把它们列给 strip 提示用户（前瞻性提示，不判断是否已在词里）。
  const otherMountTriggers = stack.items
    .filter((it) => it.asset.id !== recipeGroupKey)
    .map((it) => it.asset.triggerWord?.trim())
    .filter((word): word is string => !!word)

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
                  {mined.isLoading ? (
                    <div className="mt-1 flex gap-1.5" aria-hidden>
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-24 w-20 shrink-0 animate-pulse rounded-md bg-muted/50"
                        />
                      ))}
                    </div>
                  ) : mined.recipes.length > 0 ? (
                    <LoraSourceRecipeStrip
                      assetName={recipeGroupAsset?.name ?? ''}
                      recipes={mined.recipes}
                      selectedImageUrl={selectedImageUrl}
                      includeSeed={includeSeed}
                      extraMountStatusByKey={{}}
                      extraStackFull={stack.items.length >= LORA_STACK_MAX}
                      otherMountTriggers={otherMountTriggers}
                      onSelectedImageUrlChange={setSelectedImageUrl}
                      onIncludeSeedChange={setIncludeSeed}
                      onMountExtraLora={() => undefined}
                      onApplyRecipe={handleApplyRecipe}
                    />
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
                    <Loader2
                      className="size-6 animate-spin text-muted-foreground"
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
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={loraTrigger || t('generate.promptPlaceholder')}
              rows={3}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-surface-composer-foreground/40"
            />
            {negativePromptExpanded || negativePrompt.trim().length > 0 ? (
              <div className="space-y-1 border-t border-surface-composer-foreground/10 pt-2">
                <p className="text-2xs font-medium uppercase tracking-wide text-surface-composer-foreground/50">
                  {t('generate.negativePromptLabel')}
                </p>
                <textarea
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder={t('generate.negativePromptPlaceholder')}
                  rows={2}
                  className="w-full resize-none bg-transparent text-xs outline-none placeholder:text-surface-composer-foreground/40"
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
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
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
              {compatibleBases.map((base) => (
                <SelectItem
                  key={base.id}
                  value={base.id}
                  disabled={!base.available}
                >
                  {base.displayName} · {fidelityLabel(base)}
                  {base.available ? '' : ` · ${t('spine.comingSoon')}`}
                </SelectItem>
              ))}
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
              <Loader2
                className="absolute right-1.5 top-1.5 size-3.5 animate-spin text-white drop-shadow"
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

interface CivitaiCommunityBranchProps {
  onFavorite: (item: CivitaiLoraLibraryItem) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

const NSFW_FILTER_LABEL_KEYS: Record<LoraNsfwFilter, string> = {
  unrestricted: 'nsfwFilterUnrestricted',
  nsfwOnly: 'nsfwFilterNsfwOnly',
  safe: 'nsfwFilterSafe',
}

function CivitaiCommunityBranch({
  onFavorite,
  onUnfavoriteByUrl,
  isFavorited,
}: CivitaiCommunityBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stack = useActiveLoraStack()
  // P1-5 方案 A：family/q/sort/nsfw 全部入 URL query（白名单校验，未知值
  // 静默按默认处理，不透传给 civitai API）。只在挂载时读一次做初始种子——
  // 后续变更由下面的 effect 写回 URL，与 section 参数同一套「值等于默认
  // 就从 query 里删掉」的约定。
  const initialFamilyParam = searchParams.get(LORA_LIBRARY_FAMILY_PARAM)
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  const initialNsfwParam = searchParams.get(LORA_LIBRARY_NSFW_PARAM)
  const library = useCivitaiLoraLibrary({
    initialBaseModel:
      initialFamilyParam && isCivitaiLoraBaseModel(initialFamilyParam)
        ? initialFamilyParam
        : undefined,
    initialSort:
      initialSortParam && isCivitaiLoraSort(initialSortParam)
        ? initialSortParam
        : undefined,
    initialSearch:
      searchParams.get(LORA_LIBRARY_SEARCH_PARAM)?.trim() || undefined,
    initialNsfwFilter:
      initialNsfwParam && isLoraNsfwFilter(initialNsfwParam)
        ? initialNsfwParam
        : undefined,
  })

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (library.baseModel === 'all') {
      params.delete(LORA_LIBRARY_FAMILY_PARAM)
    } else {
      params.set(LORA_LIBRARY_FAMILY_PARAM, library.baseModel)
    }
    if (library.debouncedSearch) {
      params.set(LORA_LIBRARY_SEARCH_PARAM, library.debouncedSearch)
    } else {
      params.delete(LORA_LIBRARY_SEARCH_PARAM)
    }
    if (library.sort === 'Highest Rated') {
      params.delete(LORA_LIBRARY_SORT_PARAM)
    } else {
      params.set(LORA_LIBRARY_SORT_PARAM, library.sort)
    }
    if (library.nsfwFilter === DEFAULT_LORA_NSFW_FILTER) {
      params.delete(LORA_LIBRARY_NSFW_PARAM)
    } else {
      params.set(LORA_LIBRARY_NSFW_PARAM, library.nsfwFilter)
    }
    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    const currentQuery = searchParams.toString()
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname
    if (nextUrl === currentUrl) return
    router.replace(nextUrl, { scroll: false })
  }, [
    library.baseModel,
    library.sort,
    library.debouncedSearch,
    library.nsfwFilter,
    pathname,
    router,
    searchParams,
  ])
  // Phase-2 enrichment: mine the activation prompt from user generations
  // for the currently-selected LoRA. Lazy + cached per (model, version,
  // hash); covers the ~34% of LoRAs that ship neither trainedWords nor
  // description code blocks.
  const minedPrompts = useCivitaiMinedPrompts(library.selectedItem)
  const isMobile = useIsMobile()
  const [coverPreview, setCoverPreview] = useState<{
    url: string
    name: string
  } | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  // 库模块重做（lora-domain-wireframes.md §4）：详情从常驻的第三栏改成
  // 按需抽屉——桌面端右侧滑入 Sheet，手机端底部 Drawer（Vaul），两者共用
  // 同一个 open 状态，点卡才出现，不占网格空间。
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  // Clerk scopes the history slot so A's searches never surface in B's
  // dropdown after a sign-out / sign-in on the same browser.
  const { isLoaded, userId } = useAuth()
  const activeClerkId: string | null = isLoaded ? userId : null

  useEffect(() => {
    // Defer the hydrate so React doesn't see a synchronous setState in
    // the effect body — same pattern useCivitaiLoraLibrary uses for its
    // initial refresh.
    return deferEffectTask(() => {
      setHistory(readSearchHistory(activeClerkId))
    })
  }, [activeClerkId])

  // Commit a search term to history on debounce-completion (i.e. when
  // the active search the API is actually using stabilises). We hook
  // off `library.search` ≥ 2 chars to avoid logging every keystroke.
  useEffect(() => {
    const trimmed = library.search.trim()
    if (trimmed.length < 2) return
    const id = setTimeout(() => {
      setHistory(recordSearchTerm(trimmed, activeClerkId))
    }, 800)
    return () => clearTimeout(id)
  }, [activeClerkId, library.search])

  // Close history dropdown on outside click.
  useEffect(() => {
    if (!historyOpen) return
    const handler = (e: MouseEvent) => {
      if (!searchWrapperRef.current?.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [historyOpen])

  const handleUse = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      // External base models (Pony / SD 1.5 / Anima): PixelVault has no
      // working inference endpoint or the license forbids third-party
      // hosted generation. Send the user to Civitai to generate there
      // rather than dispatching them into a guaranteed-failure path.
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      // 去生成：切到 LoRA 域生成 tab（Image Studio 已不消费 LoRA）。
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
    },
    [router, stack, t],
  )

  // B10 (D7⑤) 带词去生成：与 handleUse 同一挂载路径，额外把试用词段带进生成
  // 纸——走 ?prompt= 回放注入（GenerateBranch 的 replay effect 会读它填 prompt）。
  // 只对可生成家族有意义；外源家族在 UI 层已不显示这个入口。
  const handleUseWithPrompt = useCallback(
    (item: CivitaiLoraLibraryItem, promptText: string) => {
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) return
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      const params = new URLSearchParams({
        [LORA_WORKBENCH_SEARCH_PARAM]: LORA_WORKBENCH_SECTIONS.GENERATE,
      })
      if (promptText.trim()) params.set('prompt', promptText)
      router.push(`${ROUTES.STUDIO_LORA}?${params.toString()}`)
    },
    [router, stack, t],
  )

  const handleFavoriteToggle = useCallback(
    async (item: CivitaiLoraLibraryItem) => {
      if (isFavorited(item.loraUrl)) {
        await onUnfavoriteByUrl(item.loraUrl)
      } else {
        await onFavorite(item)
      }
    },
    [isFavorited, onFavorite, onUnfavoriteByUrl],
  )

  const handleSelectItem = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      library.selectItem(item)
      // 网格卡片点了就该打开详情——桌面/手机都是按需抽屉了，不再有常驻的
      // 桌面第三栏。
      setInspectorOpen(true)
    },
    [library],
  )

  const handleSortChange = useCallback(
    (value: string) => {
      if (isCivitaiLoraSort(value)) {
        library.setSort(value)
      }
    },
    [library],
  )

  const handleBaseModelChange = useCallback(
    (value: CivitaiLoraBaseModel) => {
      library.setBaseModel(value)
    },
    [library],
  )

  // P1-6（三态循环）：不设限 → 仅NSFW → 安全 → 不设限。
  const handleNsfwToggle = useCallback(() => {
    const currentIndex = LORA_NSFW_FILTER_VALUES.indexOf(library.nsfwFilter)
    const nextValue =
      LORA_NSFW_FILTER_VALUES[
        (currentIndex + 1) % LORA_NSFW_FILTER_VALUES.length
      ]
    library.setNsfwFilter(nextValue)
  }, [library])

  // P2-6：空结果时补「清除筛选」——只在真的有筛选在生效时才有意义显示。
  const hasActiveFilters =
    library.baseModel !== 'all' ||
    library.debouncedSearch !== '' ||
    library.nsfwFilter !== DEFAULT_LORA_NSFW_FILTER
  const handleClearFilters = useCallback(() => {
    library.setBaseModel('all')
    library.setSearch('')
    library.setNsfwFilter(DEFAULT_LORA_NSFW_FILTER)
  }, [library])

  const handleHistoryPick = useCallback(
    (term: string) => {
      library.setSearch(term)
      setHistoryOpen(false)
    },
    [library],
  )

  const handleHistoryClear = useCallback(() => {
    setHistory(clearSearchHistory(activeClerkId))
    setHistoryOpen(false)
  }, [activeClerkId])

  const handleCopyTryPrompt = useCallback(
    // overridePrompt lets the inspector pass the currently-selected outfit
    // when a LoRA has multiple variants; fallback path keeps the original
    // single-prompt behaviour for non-Civitai callers and back-compat.
    async (item: CivitaiLoraLibraryItem, overridePrompt?: string) => {
      const text = overridePrompt ?? buildLoraPromptTemplate(item)
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('tryPromptCopied'), {
          duration: LORA_TOAST_DURATION_MS,
        })
      } catch {
        toast.error(t('tryPromptCopyFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
      }
    },
    [t],
  )

  const handleCopyTrigger = useCallback(
    async (trigger: string) => {
      // Just the trigger token — the common case when the user already has a
      // prompt and only needs to glue the activation word in. Splitting this
      // out avoids the "copy template" pattern dumping 100+ chars on top of
      // an existing prompt.
      try {
        await navigator.clipboard.writeText(trigger)
        toast.success(t('triggerCopied'), { duration: LORA_TOAST_DURATION_MS })
      } catch {
        toast.error(t('tryPromptCopyFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
      }
    },
    [t],
  )

  return (
    <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      {/* 用户反馈：标题栏（含"LoRA 库"大标题 + 独立 border-bottom 一整行）
          跟外层公开/我的切换重复，还有筛选提示句都在挤占竖向空间。收成
          一行：家族 chip 靠左，刷新图标钉在最右，没有独立标题行了。 */}
      <div className="flex min-h-0 flex-col gap-2.5">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <BaseModelChipRow
              value={library.baseModel}
              onChange={handleBaseModelChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void library.refresh()}
              aria-label={t('refresh')}
              className="ml-auto shrink-0"
            >
              <RefreshCw className="size-3.5" aria-hidden />
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div ref={searchWrapperRef} className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={library.search}
                onChange={(event) => library.setSearch(event.target.value)}
                onFocus={() => setHistoryOpen(true)}
                placeholder={t('communitySearch')}
                className="h-9 pl-9 pr-8 text-xs"
              />
              {/* Inline revalidation indicator — replaces the old "blank the
                  whole list and show a center loader" behaviour. Stale items
                  stay visible underneath while this spins, so the user keeps
                  context instead of seeing a 300–900 ms white flash. */}
              {library.isRevalidating && library.items.length > 0 ? (
                <Loader2
                  className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              {historyOpen && history.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
                  <div className="flex items-center justify-between px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <History className="size-3" aria-hidden />
                      {t('searchHistoryTitle')}
                    </span>
                    <button
                      type="button"
                      onClick={handleHistoryClear}
                      className="text-2xs text-muted-foreground hover:text-foreground"
                    >
                      {t('searchHistoryClear')}
                    </button>
                  </div>
                  <ul className="max-h-48 overflow-y-auto">
                    {history.map((entry) => (
                      <li key={entry}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            // Use mousedown so we beat the input's blur,
                            // which would close the popup before click fires.
                            e.preventDefault()
                            handleHistoryPick(entry)
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          <Search
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="truncate">{entry}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <Select value={library.sort} onValueChange={handleSortChange}>
              <SelectTrigger
                size="sm"
                className="w-full border-border/60 text-xs sm:w-40"
                aria-label={t('communitySortFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CIVITAI_LORA_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* B11 兜底：meilisearch 挂了回落 REST 搜索路径，此时排序请求
                被 civitai 静默忽略——如实告知，别让用户以为选的排序生效了。 */}
            {library.sortFellBackToRelevance ? (
              <span
                className="inline-flex h-9 shrink-0 items-center whitespace-nowrap text-2xs text-muted-foreground"
                title={t('sortFallbackHint')}
              >
                {t('sortFallbackLabel')}
              </span>
            ) : null}
            {/* P1-6（三态循环，2026-07-04 改稿）：不设限（默认）→ 仅NSFW
                （过滤掉安全内容）→ 安全 → 循环。仅 NSFW 态琥珀描边示警，
                安全态用与其它筛选 chip 一致的 primary 高亮。 */}
            <button
              type="button"
              onClick={handleNsfwToggle}
              aria-label={`${t('nsfwToggleHint')}：${t(
                NSFW_FILTER_LABEL_KEYS[library.nsfwFilter],
              )}`}
              title={t('nsfwToggleHint')}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors',
                library.nsfwFilter === 'nsfwOnly'
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : library.nsfwFilter === 'safe'
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
              )}
            >
              {library.nsfwFilter === 'nsfwOnly' ? (
                <ShieldAlert className="size-3.5" aria-hidden />
              ) : library.nsfwFilter === 'safe' ? (
                <ShieldCheck className="size-3.5" aria-hidden />
              ) : (
                <Shield className="size-3.5" aria-hidden />
              )}
              {t(NSFW_FILTER_LABEL_KEYS[library.nsfwFilter])}
            </button>
          </div>

          <div
            className={cn(
              'min-h-0 transition-opacity',
              // Dim stale items slightly while a background fetch is running
              // so the spinner in the search input has a visual partner. Keep
              // them rendered (no `display: none`) — the whole point is that
              // the user keeps reading the previous result.
              library.isRevalidating && library.items.length > 0
                ? 'opacity-60'
                : 'opacity-100',
            )}
            aria-busy={library.isRevalidating}
          >
            {library.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : library.error && library.items.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{t('communityLoadFailed')}</span>
              </div>
            ) : library.items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center text-xs text-muted-foreground">
                <span>{t('communityEmpty')}</span>
                {hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                    className="h-8 text-xs"
                  >
                    {t('clearFilters')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {library.items.map((item) => (
                  <CivitaiLoraCard
                    key={item.id}
                    item={item}
                    // P2-5：ring 只在抽屉/侧栏真正打开时标记对应卡，不然首屏
                    // 第一张卡永远带 ring 却不指向任何打开的状态。
                    isSelected={
                      inspectorOpen && library.selectedItem?.id === item.id
                    }
                    isFavorited={isFavorited(item.loraUrl)}
                    onSelect={handleSelectItem}
                    onFavorite={handleFavoriteToggle}
                  />
                ))}
              </div>
            )}
          </div>

          <CommunityPagination
            page={library.page}
            total={library.total}
            hasNextPage={library.hasNextPage}
            isBusy={library.isRevalidating}
            onPreviousPage={library.previousPage}
            onNextPage={library.nextPage}
          />
        </div>
      </div>

      {/* 详情按需抽屉——手机端 Vaul 底部 Drawer，桌面端右侧滑入 Sheet
          （lora-domain-wireframes.md §4.5 动效规范：320ms 滑入 + scrim，
          网格不被推开）。两者共用 inspectorOpen，按 isMobile 二选一挂载。 */}
      <Drawer
        open={isMobile && inspectorOpen && !!library.selectedItem}
        onOpenChange={setInspectorOpen}
      >
        {/* aria-describedby explicitly unset — Radix otherwise warns about a
            missing Description, but the drawer body already contains all the
            details and a verbose description would just be noise for screen
            readers. */}
        <DrawerContent
          aria-describedby={undefined}
          className="max-h-[85vh]"
          style={{
            maxHeight:
              'min(85vh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
          }}
        >
          <DrawerTitle className="sr-only">
            {library.selectedItem?.name ?? ''}
          </DrawerTitle>
          <div className="overflow-y-auto px-4 pb-6 pt-2">
            <CivitaiLoraInspector
              // Same remount-on-id-change pattern as the desktop instance.
              key={library.selectedItem?.id ?? 'empty'}
              item={library.selectedItem}
              isFavorited={
                library.selectedItem
                  ? isFavorited(library.selectedItem.loraUrl)
                  : false
              }
              onUse={(item) => {
                handleUse(item)
                setInspectorOpen(false)
              }}
              onUseWithPrompt={(item, promptText) => {
                handleUseWithPrompt(item, promptText)
                setInspectorOpen(false)
              }}
              onFavorite={handleFavoriteToggle}
              onCopyTryPrompt={handleCopyTryPrompt}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                const fullUrl = item.coverImageUrlOriginal ?? item.coverImageUrl
                if (fullUrl) {
                  setCoverPreview({
                    url: proxyCivitaiImageUrl(fullUrl),
                    name: item.name,
                  })
                }
              }}
              minedOutfits={minedPrompts.outfits}
              minedTotalSampled={minedPrompts.totalSampled}
              minedIsLoading={minedPrompts.isLoading}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <Sheet
        open={!isMobile && inspectorOpen && !!library.selectedItem}
        onOpenChange={setInspectorOpen}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-sm"
        >
          <SheetTitle className="sr-only">
            {library.selectedItem?.name ?? ''}
          </SheetTitle>
          <div className="px-4 pb-6 pt-2">
            <CivitaiLoraInspector
              key={library.selectedItem?.id ?? 'empty'}
              item={library.selectedItem}
              isFavorited={
                library.selectedItem
                  ? isFavorited(library.selectedItem.loraUrl)
                  : false
              }
              onUse={(item) => {
                handleUse(item)
                setInspectorOpen(false)
              }}
              onUseWithPrompt={(item, promptText) => {
                handleUseWithPrompt(item, promptText)
                setInspectorOpen(false)
              }}
              onFavorite={handleFavoriteToggle}
              onCopyTryPrompt={handleCopyTryPrompt}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                const fullUrl = item.coverImageUrlOriginal ?? item.coverImageUrl
                if (fullUrl) {
                  setCoverPreview({
                    url: proxyCivitaiImageUrl(fullUrl),
                    name: item.name,
                  })
                }
              }}
              minedOutfits={minedPrompts.outfits}
              minedTotalSampled={minedPrompts.totalSampled}
              minedIsLoading={minedPrompts.isLoading}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={coverPreview !== null}
        onOpenChange={(open) => {
          if (!open) setCoverPreview(null)
        }}
      >
        <DialogContent
          className="left-0 top-0 h-svh max-h-svh w-dvw max-w-none translate-x-0 translate-y-0 place-items-center rounded-none border-none bg-transparent p-3 shadow-none sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-auto sm:max-w-[min(90vw,72rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {coverPreview?.name ?? ''}
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
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverPreview.url}
              alt={coverPreview.name}
              className="block max-h-full max-w-full rounded-xl object-contain sm:max-h-[90svh] sm:max-w-[90vw]"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

interface CommunityPaginationProps {
  page: number
  total: number | null
  hasNextPage: boolean
  isBusy: boolean
  onPreviousPage: () => void
  onNextPage: () => void
}

function CommunityPagination({
  page,
  total,
  hasNextPage,
  isBusy,
  onPreviousPage,
  onNextPage,
}: CommunityPaginationProps) {
  const t = useTranslations('LoraWorkbench')
  const pageStatus = total
    ? t('communityPageStatusKnown', { page, total })
    : t('communityPageStatus', { page })

  return (
    <nav
      aria-label={pageStatus}
      className="mt-1 flex shrink-0 flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1 || isBusy}
        onClick={onPreviousPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {t('communityPrevious')}
      </Button>

      <span
        className="inline-flex h-9 items-center justify-center rounded-lg bg-background px-3 text-xs font-medium text-foreground ring-1 ring-border/60"
        aria-live="polite"
      >
        {pageStatus}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNextPage || isBusy}
        onClick={onNextPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        {t('communityNext')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  )
}

interface CivitaiLoraCardProps {
  item: CivitaiLoraLibraryItem
  isSelected: boolean
  isFavorited: boolean
  onSelect: (item: CivitaiLoraLibraryItem) => void
  onFavorite: (item: CivitaiLoraLibraryItem) => void
}

// 封面优先密集网格卡片（lora-domain-wireframes.md §4）：取代旧的
// CivitaiLoraRow 行列表。「去生成」不再放卡片上——按文档，主行动移进详情
// 抽屉，卡片只留家族角标 + 收藏，点开才看配方/触发词/去生成。
function CivitaiLoraCard({
  item,
  isSelected,
  isFavorited,
  onSelect,
  onFavorite,
}: CivitaiLoraCardProps) {
  const t = useTranslations('LoraWorkbench')
  const isGeneratable = isCivitaiBaseModelGeneratable(item.baseModelFamily)
  // 450px 网格卡专用档位优先，缺失才退回 640px cover（P0-3：96px 缩略拉伸到
  // ~200px 卡上系统性发糊，96 档保留给挂载栈 chip/facepile）。
  const src = item.cardImageUrl ?? item.coverImageUrl

  return (
    <div className="min-w-0">
      <LoraCoverTile
        coverUrl={src}
        alt=""
        fallbackIcon={<Sparkles className="size-6" aria-hidden />}
        badgeLabel={item.baseModelFamily}
        badgeIcon={
          isGeneratable ? undefined : (
            <ExternalLink className="size-3" aria-hidden />
          )
        }
        badgeTitle={isGeneratable ? undefined : t('externalBadgeHint')}
        selected={isSelected}
        onClick={() => onSelect(item)}
        interactiveLabel={item.name}
        topRight={
          // P1-9: 视觉 16px 心，触屏（coarse pointer）下用透明 ::before 把点击
          // 区扩到 44px（16 + 2×14），鼠标端保持精确小目标不抢卡片点击。
          <button
            type="button"
            onClick={() => onFavorite(item)}
            aria-label={isFavorited ? t('unfavorite') : t('favorite')}
            title={isFavorited ? t('unfavorite') : t('favorite')}
            className="text-white drop-shadow transition-transform hover:scale-110 coarse:before:absolute coarse:before:-inset-3.5 coarse:before:content-['']"
          >
            <Heart
              className={cn(
                'size-4',
                isFavorited ? 'fill-rose-500 text-rose-500' : 'fill-black/25',
              )}
              aria-hidden
            />
          </button>
        }
      />
      <p className="mt-1.5 truncate text-xs text-foreground">{item.name}</p>
    </div>
  )
}

interface CivitaiLoraInspectorProps {
  item: CivitaiLoraLibraryItem | null
  isFavorited: boolean
  onUse: (item: CivitaiLoraLibraryItem) => void
  /** B10 (D7⑤): mount the LoRA + carry the shown try-prompt into the generate
   *  paper (via ?prompt= replay), then jump to the generate section. */
  onUseWithPrompt: (item: CivitaiLoraLibraryItem, prompt: string) => void
  onFavorite: (item: CivitaiLoraLibraryItem) => void
  onCopyTryPrompt: (
    item: CivitaiLoraLibraryItem,
    overridePrompt?: string,
  ) => Promise<void>
  onCopyTrigger: (trigger: string) => Promise<void>
  onPreviewCover: (item: CivitaiLoraLibraryItem) => void
  /**
   * Mined activation prompts from /api/v1/images (Phase 2 enrichment).
   * Surfaced as extra chips in the outfit picker, badged so users know
   * they came from community generations rather than the author.
   */
  minedOutfits: CivitaiMinedPromptsResult['outfits']
  minedTotalSampled: number
  minedIsLoading: boolean
}

function CivitaiLoraInspector({
  item,
  isFavorited,
  onUse,
  onUseWithPrompt,
  onFavorite,
  onCopyTryPrompt,
  onCopyTrigger,
  onPreviewCover,
  minedOutfits,
  minedTotalSampled,
  minedIsLoading,
}: CivitaiLoraInspectorProps) {
  const t = useTranslations('LoraWorkbench')
  const isGeneratable = item
    ? isCivitaiBaseModelGeneratable(item.baseModelFamily)
    : true
  // P1-1：抽屉大封面同样有数秒空白灰框的窗口——caller 用 `key={item.id}`
  // 整体重挂载这个组件，所以这个 state 天然随选中项切换重置。
  const [coverLoaded, setCoverLoaded] = useState(false)

  // Multi-outfit LoRAs: Civitai authors stash per-costume activation
  // prompts in description <pre><code> blocks; we surface them as a chip
  // selector inside the Try-Prompt panel. Caller passes `key={item.id}`
  // on this component so a new LoRA fully remounts and this state resets
  // to 0 — React's official "reset state with a key" pattern, simpler
  // than tracking prevId in render or running a setState effect.
  const [selectedOutfitIndex, setSelectedOutfitIndex] = useState(0)

  // 方向 A：懒加载作者描述（对任何 LoRA 都可拉，与「有没有配方」无关；面板打开时
  // 才发一次 /models/:id）。默认折叠——描述可能很长，不占默认版面。组件按
  // key={item.id} 整体重挂载，所以折叠态天然随选中项重置。
  const { descriptionText: authorDescription } = useCivitaiModelDescription(
    item?.modelId ?? null,
  )
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const handleCopyDescription = useCallback(async () => {
    if (!authorDescription) return
    try {
      await navigator.clipboard.writeText(authorDescription)
      toast.success(t('authorDescriptionCopied'))
    } catch {
      toast.error(t('authorDescriptionCopyFailed'))
    }
  }, [authorDescription, t])

  // outfits[0] is the primary; alternates [1..] include author-written
  // variants first, then community-mined variants. Source tag drives
  // which badge to show on each chip. Single-outfit (no alts at all)
  // LoRAs keep the original flat (no chips) layout.
  type Outfit = {
    label: string
    prompt: string
    source: 'author' | 'mined'
    minedSource?: 'model_version_image' | 'community_image' | 'ai_inferred'
    sampleCount?: number
  }
  const outfits = useMemo<Outfit[]>(() => {
    if (!item) return []
    const authorAlts = item.recommendedPromptAlternates
    const hasAuthorPrompt = Boolean(item.recommendedPrompt)
    if (
      !hasAuthorPrompt &&
      authorAlts.length === 0 &&
      minedOutfits.length === 0
    )
      return []

    const seen = new Set<string>()
    const result: Outfit[] = []

    if (hasAuthorPrompt) {
      const first: Outfit = {
        label:
          authorAlts.length + minedOutfits.length > 0
            ? t('outfitDefaultLabel', { n: 1 })
            : '',
        prompt: item.recommendedPrompt ?? buildLoraPromptTemplate(item),
        source: 'author',
      }
      result.push(first)
      seen.add(first.prompt.trim().toLowerCase())
    }

    authorAlts.forEach((alt) => {
      const key = alt.prompt.trim().toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      result.push({
        label: alt.label || t('outfitDefaultLabel', { n: result.length + 1 }),
        prompt: alt.prompt,
        source: 'author',
      })
    })

    minedOutfits.forEach((mined) => {
      const key = mined.prompt.trim().toLowerCase()
      if (seen.has(key)) return // skip if identical to an author prompt
      seen.add(key)
      result.push({
        label:
          mined.label ||
          t(
            mined.source === 'model_version_image'
              ? 'sourceImageDefaultLabel'
              : 'communityPromptDefaultLabel',
            { n: result.length + 1 },
          ),
        prompt: mined.prompt,
        source: 'mined',
        minedSource: mined.source,
        sampleCount: mined.sampleCount,
      })
    })

    // If we ended up with mined-only outfits (no author prompt) and just
    // one of them, the chip selector is unnecessary — flatten to a
    // single-outfit display.
    return result
  }, [item, t, minedOutfits])

  const hasOutfitTabs = outfits.length > 1
  const displayedPrompt = item
    ? (outfits[selectedOutfitIndex]?.prompt ?? buildLoraPromptTemplate(item))
    : ''

  if (!item) {
    // Hide the empty-state inspector on phone-portrait: it just shows a
    // "select a LoRA" placeholder card that wastes a screenful of vertical
    // space before the user can scroll back up to pick something.
    return (
      <aside className="hidden min-h-0 items-center justify-center rounded-xl border border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground lg:flex">
        {t('communityNoSelection')}
      </aside>
    )
  }

  return (
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-4">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onPreviewCover(item)}
          disabled={!item.coverImageUrl}
          aria-label={t('viewCover')}
          className={cn(
            'block w-full overflow-hidden rounded-lg border border-border/60 bg-muted',
            item.coverImageUrl && !coverLoaded && 'animate-pulse',
            item.coverImageUrl
              ? 'cursor-zoom-in transition-opacity hover:opacity-90'
              : 'cursor-default',
          )}
        >
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyCivitaiImageUrl(item.coverImageUrl)}
              alt={item.name}
              width={640}
              height={360}
              onLoad={() => setCoverLoaded(true)}
              className={cn(
                'aspect-video w-full object-cover transition-opacity duration-200',
                coverLoaded ? 'opacity-100' : 'opacity-0',
              )}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-muted-foreground">
              <Sparkles className="size-8" aria-hidden />
            </div>
          )}
        </button>

        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold leading-tight">
            {item.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {item.creatorName ?? t('communityUnknownCreator')} ·{' '}
            {item.versionName}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric
            icon={<Download className="size-3.5" aria-hidden />}
            label={t('communityDownloads')}
            value={String(item.downloadCount)}
          />
          <Metric
            icon={<Heart className="size-3.5" aria-hidden />}
            label={t('communityLikes')}
            value={String(item.thumbsUpCount)}
          />
        </div>

        <dl className="space-y-3 text-xs">
          <div>
            <dt className="text-muted-foreground">{t('communityBaseModel')}</dt>
            <dd className="mt-1 font-medium text-foreground">
              {item.baseModelFamily}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {t('communityTriggerWord')}
              {/* When trigger had to be inferred from model name (no Civitai
                  trainedWords), warn the user that activation may not work
                  perfectly — better to surface uncertainty than ship a
                  silently-wrong "character" / "anime" trigger. */}
              {item.triggerSource === 'inferred' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300"
                  title={t('triggerSourceInferredHint')}
                >
                  <Info className="size-2.5" aria-hidden />
                  {t('triggerSourceInferredBadge')}
                </span>
              ) : null}
            </dt>
            <dd className="mt-1 flex items-center gap-1.5">
              {/* break-all so long trainedWords[0] tokens (e.g.
                  "sigrika (wuthering waves)") don't overflow the inspector
                  on narrow viewports. font-mono keeps SD-style _ tokens
                  legible. title= exposes full text on hover for truncated
                  views. */}
              <code
                className="flex-1 break-all rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-foreground"
                title={item.triggerWord}
              >
                {item.triggerWord}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void onCopyTrigger(item.triggerWord)}
                aria-label={t('copyTrigger')}
                title={t('copyTrigger')}
              >
                <Copy className="size-3.5" aria-hidden />
              </Button>
            </dd>
            {item.triggerAlternates.length > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="text-2xs text-muted-foreground">
                  {t('triggerAlternatesLabel')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.triggerAlternates.map((alt) => (
                    <button
                      key={alt}
                      type="button"
                      onClick={() => void onCopyTrigger(alt)}
                      title={t('copyTrigger')}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 font-mono text-2xs text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                    >
                      <span className="break-all">{alt}</span>
                      <Copy
                        className="size-2.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {item.tags.length > 0 ? (
            <div>
              <dt className="text-muted-foreground">{t('communityTags')}</dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="rounded-lg border border-border/60 bg-background/60 p-2">
          <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Wand2 className="size-3" aria-hidden />
              {t('tryPromptLabel')}
              {/* Badge reflects the *currently selected* outfit's source.
                  Author-supplied (trainedWords / description), direct
                  source-image meta, and community-mined prompts are labelled
                  separately so users know the confidence tier. */}
              {outfits[selectedOutfitIndex]?.source === 'author' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-2xs font-medium text-primary">
                  <Sparkles className="size-2.5" aria-hidden />
                  {t('tryPromptAuthorParsedBadge')}
                </span>
              ) : outfits[selectedOutfitIndex]?.minedSource ===
                'model_version_image' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300"
                  title={t('tryPromptSourceImageHint')}
                >
                  <Sparkles className="size-2.5" aria-hidden />
                  {t('tryPromptSourceImageBadge')}
                </span>
              ) : outfits[selectedOutfitIndex]?.source === 'mined' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-2xs font-medium text-sky-700 dark:text-sky-300"
                  title={t('tryPromptMinedHint', {
                    sampled: minedTotalSampled,
                  })}
                >
                  <Users className="size-2.5" aria-hidden />
                  {t('tryPromptMinedBadge', {
                    count: outfits[selectedOutfitIndex]?.sampleCount ?? 0,
                  })}
                </span>
              ) : null}
              {minedIsLoading && outfits.length <= 1 ? (
                <Loader2
                  className="size-3 animate-spin text-muted-foreground"
                  aria-label={t('tryPromptMinedLoading')}
                />
              ) : null}
            </span>
            <div className="flex shrink-0 items-center gap-2.5">
              {/* B10 (D7⑤): 带词去生成——挂载 + 把这段试用词带进生成纸。
                  仅可生成家族显示（外源家族无内部生成路径）。 */}
              {isGeneratable ? (
                <button
                  type="button"
                  onClick={() => onUseWithPrompt(item, displayedPrompt)}
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-primary hover:text-primary/80"
                >
                  <Sparkles className="size-3" aria-hidden />
                  {t('tryPromptUseWithPrompt')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onCopyTryPrompt(item, displayedPrompt)}
                className="text-2xs font-medium text-foreground hover:text-primary"
              >
                {t('tryPromptCopy')}
              </button>
            </div>
          </div>
          {/* Multi-outfit chip selector: lets the user flip between e.g.
              costume1 / costume2 of a character LoRA before copying. Only
              renders when alternates exist — single-outfit LoRAs keep the
              flat layout. Mined outfits get a subtle color shift so users
              can tell author chips from community-mined ones at a glance. */}
          {hasOutfitTabs ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {outfits.map((outfit, idx) => {
                const isActive = idx === selectedOutfitIndex
                const isSourceImage =
                  outfit.minedSource === 'model_version_image'
                const isMined = outfit.source === 'mined'
                return (
                  <button
                    key={`${outfit.label}-${idx}`}
                    type="button"
                    onClick={() => setSelectedOutfitIndex(idx)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors',
                      isActive
                        ? isSourceImage
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : isMined
                            ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                            : 'bg-primary/20 text-primary'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {isSourceImage ? (
                      <Sparkles className="size-2.5" aria-hidden />
                    ) : isMined ? (
                      <Users className="size-2.5" aria-hidden />
                    ) : null}
                    {outfit.label}
                  </button>
                )
              })}
            </div>
          ) : null}
          <p className="mt-1.5 max-h-32 overflow-y-auto break-words font-mono text-2xs leading-relaxed text-foreground">
            {displayedPrompt}
          </p>
        </div>

        {/* 方向 A：作者描述折叠区。仅在真的拉到描述时出现（无描述/失败则整块隐藏），
            默认折叠只占一行，展开才显滚动全文 + 复制。放在试用提示词卡之后、动作钮
            之前——和其它「作者提供的文本」归在一起，又不把主 CTA 推太远。 */}
        {authorDescription ? (
          <div className="rounded-lg border border-border/60 bg-background/60">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setDescriptionExpanded((v) => !v)}
                aria-expanded={descriptionExpanded}
                className="inline-flex items-center gap-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight
                  className={cn(
                    'size-3.5 transition-transform',
                    descriptionExpanded && 'rotate-90',
                  )}
                  aria-hidden
                />
                {t('authorDescriptionLabel')}
              </button>
              {descriptionExpanded ? (
                <button
                  type="button"
                  onClick={() => void handleCopyDescription()}
                  className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-foreground hover:text-primary"
                >
                  <Copy className="size-3" aria-hidden />
                  {t('authorDescriptionCopy')}
                </button>
              ) : null}
            </div>
            {descriptionExpanded ? (
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-2 pb-2 text-2xs leading-relaxed text-foreground/90">
                {authorDescription}
              </p>
            ) : null}
          </div>
        ) : null}

        {!isGeneratable ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-2xs leading-relaxed text-amber-700 dark:text-amber-300">
            {t('externalInspectorHint', { family: item.baseModelFamily })}
          </div>
        ) : null}

        <div className="grid gap-2 pt-2">
          <Button type="button" onClick={() => onUse(item)}>
            {isGeneratable ? (
              <Sparkles className="size-4" aria-hidden />
            ) : (
              <ExternalLink className="size-4" aria-hidden />
            )}
            {isGeneratable
              ? t('communityUseInStudio')
              : t('communityOpenInCivitai')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onFavorite(item)}
          >
            <Heart
              className={cn(
                'size-4',
                isFavorited && 'fill-rose-500 text-rose-500',
              )}
              aria-hidden
            />
            {isFavorited ? t('unfavorite') : t('favorite')}
          </Button>
          {isGeneratable ? (
            <Button type="button" variant="ghost" asChild>
              <a href={item.modelPageUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-4" aria-hidden />
                {t('communityOpenSource')}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

interface MetricProps {
  icon: ReactNode
  label: string
  value: string
}

function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
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

interface BaseModelChipRowProps {
  value: CivitaiLoraBaseModel
  onChange: (value: CivitaiLoraBaseModel) => void
}

function BaseModelChipRow({ value, onChange }: BaseModelChipRowProps) {
  const t = useTranslations('LoraWorkbench')

  // Split chips by generatability so the user sees "things I can run here"
  // vs "things that send me to Civitai" at a glance. The separator anchors
  // the visual grouping; external chips also pick up the ExternalLink icon
  // + amber active color used elsewhere on LoRA cards for the same families.
  const generatableChips = CIVITAI_LORA_BASE_MODEL_VALUES.filter(
    (v) => v !== 'all' && isCivitaiBaseModelGeneratable(v),
  )
  const externalChips = CIVITAI_LORA_BASE_MODEL_VALUES.filter(
    (v) => v !== 'all' && !isCivitaiBaseModelGeneratable(v),
  )

  const renderChip = (option: CivitaiLoraBaseModel) => {
    const isActive = option === value
    const isExternal =
      option !== 'all' && !isCivitaiBaseModelGeneratable(option)
    const label =
      option === 'all'
        ? t('baseModelFilterAll')
        : option === 'other'
          ? t('baseModelFilterOther')
          : option
    return (
      <button
        key={option}
        type="button"
        role="radio"
        aria-checked={isActive}
        onClick={() => {
          if (isCivitaiLoraBaseModel(option)) onChange(option)
        }}
        title={isExternal ? t('externalBadgeHint') : undefined}
        className={cn(
          // Smaller chip + tighter padding on mobile so the 7 base-model
          // chips (+ separator) wrap to at most 2 rows on iPhone-portrait
          // instead of overflowing horizontally.
          'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-2xs font-medium transition-colors sm:px-2.5',
          // P1-9: 视觉尺寸不变，触屏下用透明 ::before 把点击区纵向扩到 44px
          // （h-7=28 + 2×8）。`inset-x-0` 让 ::before 撑满 chip 宽度。
          "relative coarse:before:absolute coarse:before:-inset-y-2 coarse:before:inset-x-0 coarse:before:content-['']",
          isActive
            ? isExternal
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
        )}
      >
        {isExternal ? <ExternalLink className="size-3" aria-hidden /> : null}
        {label}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('baseModelFilterLabel')}
      // `min-w-0` lets this shrink inside the flex row next to the refresh
      // button; `flex-wrap` still activates instead of overflowing on
      // narrow viewports.
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
    >
      {renderChip('all')}
      {generatableChips.map(renderChip)}
      {externalChips.length > 0 ? (
        <span className="mx-1 h-4 w-px shrink-0 bg-border/60" aria-hidden />
      ) : null}
      {externalChips.map(renderChip)}
    </div>
  )
}
