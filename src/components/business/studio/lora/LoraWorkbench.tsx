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
  RefreshCw,
  Search,
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
  DEFAULT_LORA_WORKBENCH_SECTION,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraBaseModel,
  isCivitaiLoraSort,
  isLoraWorkbenchSection,
  type CivitaiLoraBaseModel,
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
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from '@/lib/civitai-search-history'
import { buildLoraPromptTemplate } from '@/lib/lora-prompt-template'
import { buildSourceMatchedLoraPrompt } from '@/lib/lora-source-match-prompt'
import { buildCivitaiRecipeGenerationPlan } from '@/lib/civitai-recipe-to-generation'
import { LoraSourceRecipeStrip } from '@/components/business/studio/prompt-tags/LoraSourceRecipeStrip'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

export function LoraWorkbench() {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    trainedAssets,
    favoriteAssets,
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Tabs value={tabValue} onValueChange={handleTabChange}>
        <TabsList className="grid h-9 w-full grid-cols-3 bg-muted/40 sm:inline-grid sm:w-auto">
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

          {activeSection === LORA_WORKBENCH_SECTIONS.MINE ? (
            <MyLoraBranch
              trained={trainedAssets}
              favorites={favoriteAssets}
              isLoading={isLoadingMine}
              error={errorMine}
              onRefresh={refresh}
              onSwitchSection={setActiveSection}
              onVisibilityChange={setVisibility}
              onUnfavorite={unfavoriteAsset}
              onDelete={deleteAsset}
            />
          ) : (
            <CivitaiCommunityBranch
              onFavorite={favoriteCivitaiLora}
              onUnfavoriteByUrl={unfavoriteByUrl}
              isFavorited={isFavorited}
            />
          )}
        </section>
      ) : null}

      {activeSection === LORA_WORKBENCH_SECTIONS.TRAIN ? (
        <TrainingBranch />
      ) : null}
    </div>
  )
}

// ── 生成分支（3b-ii-a 最小出图核心）──────────────────────────────────
// 脊柱条（当前 LoRA / 底模）+ ivory 提示词纸 + 出图：把脊柱条的 LoRA 注入
// advancedParams.loras、选中底模的 providerModelId 作 modelId、打
// sourceSurface=LORA_WORKBENCH，复用 useUnifiedGenerate 发图 → 落素材。
// recipe 源图/模式 + 暗房视觉为后续增量。
function GenerateBranch() {
  const t = useTranslations('LoraWorkbench')
  const tModels = useTranslations('Models')
  const tSetup = useTranslations('QuickSetup')
  const router = useRouter()
  const stack = useActiveLoraStack()
  const { generate, isGenerating, lastGeneration } = useUnifiedGenerate()
  const { modelOptions } = useImageModelOptions()

  const loraFamily = stack.items[0]?.asset.baseModelFamily ?? null
  const compatibleBases = loraFamily ? getCompatibleBases(loraFamily) : []
  const defaultBase = loraFamily ? getDefaultBase(loraFamily) : null
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null)
  const selectedBase =
    compatibleBases.find((b) => b.id === selectedBaseId) ?? defaultBase

  // Issue 2 (Hard Rule 8): 缺 key 时不禁用出图按钮，改路由到 QuickSetupDialog。
  // useImageModelOptions 已经把「built-in workspace 路由 + 用户保存的 key 路由」
  // 合并成同一份 StudioModelOption[]（含 freeTier / sourceType 标记），复用它
  // 而不是重新拼一份 hasKey 判断。
  const baseModelId = selectedBase?.providerModelId ?? null
  const baseModelOptions = useMemo(
    () =>
      baseModelId
        ? modelOptions.filter((option) => option.modelId === baseModelId)
        : [],
    [modelOptions, baseModelId],
  )
  const hasUsableRoute = baseModelOptions.some(
    (option) => option.freeTier || option.sourceType === 'saved',
  )
  const needsKeySetup = !!baseModelId && !hasUsableRoute
  const workspaceOptionForBase =
    baseModelOptions.find((option) => option.sourceType === 'workspace') ??
    baseModelOptions[0]

  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    modelId: string
    modelLabel: string
    adapterType: AI_ADAPTER_TYPES
    optionId: string
  } | null>(null)

  // 提示词默认填当前 LoRA 触发词（保证 LoRA 被激活）；切 LoRA 时更新。
  // 用 render 时条件 setState（React 推荐的"随 prop 重置 state"），避免 effect 级联。
  const loraId = stack.items[0]?.asset.id ?? null
  const loraTrigger = stack.items[0]?.asset.triggerWord ?? ''
  const [prompt, setPrompt] = useState('')
  const [promptLoraId, setPromptLoraId] = useState<string | null>(null)
  if (promptLoraId !== loraId) {
    setPromptLoraId(loraId)
    setPrompt(loraTrigger)
  }

  // 忠实还原：用 LoRA 的推荐/源图匹配提示词一键填充 + 套用推荐 scale + 负向。
  const activeAsset = stack.items[0]?.asset ?? null
  const [negativePrompt, setNegativePrompt] = useState('')
  const handleRestore = useCallback(() => {
    if (!activeAsset) return
    const matched = buildSourceMatchedLoraPrompt(activeAsset)
    setPrompt(matched.prompt)
    setNegativePrompt(matched.negativePrompt)
    stack.setScale(activeAsset.id, matched.scale)
  }, [activeAsset, stack])

  // 源图配方：按当前 LoRA 的 Civitai provenance 取源图，点某张「一键同款」。
  const mined = useCivitaiMinedPrompts(
    activeAsset
      ? {
          modelId: activeAsset.modelId,
          modelVersionId: activeAsset.modelVersionId,
          fileHashAutoV3: activeAsset.fileHashAutoV3,
        }
      : null,
  )
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [includeSeed, setIncludeSeed] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const handleApplyRecipe = useCallback(
    (recipe: CivitaiImageRecipe, options: { includeSeed: boolean }) => {
      const plan = buildCivitaiRecipeGenerationPlan(recipe)
      setPrompt(plan.prompt)
      setNegativePrompt(plan.advancedParams?.negativePrompt ?? '')
      if (plan.aspectRatio) setAspectRatio(plan.aspectRatio)
      if (plan.loraScale != null && activeAsset) {
        stack.setScale(activeAsset.id, plan.loraScale)
      }
      setSeed(options.includeSeed ? plan.advancedParams?.seed : undefined)
    },
    [activeAsset, stack],
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
    const advanced: Record<string, unknown> = {}
    if (loras.length > 0) advanced.loras = loras
    if (negativePrompt.trim()) advanced.negativePrompt = negativePrompt.trim()
    await generate({
      mode: 'image',
      image: {
        modelId: providerModelId,
        freePrompt: prompt,
        aspectRatio,
        seed,
        advancedParams: Object.keys(advanced).length > 0 ? advanced : undefined,
        sourceSurface: 'LORA_WORKBENCH',
      },
    })
  }, [aspectRatio, generate, negativePrompt, prompt, seed, selectedBase, stack])

  const handleGenerateClick = useCallback(() => {
    if (needsKeySetup) {
      if (workspaceOptionForBase) {
        setQuickSetup({
          open: true,
          modelId: workspaceOptionForBase.modelId,
          modelLabel: getTranslatedModelLabel(
            tModels,
            workspaceOptionForBase.modelId,
          ),
          adapterType: workspaceOptionForBase.adapterType,
          optionId: workspaceOptionForBase.optionId,
        })
      }
      return
    }
    void handleGenerate()
  }, [handleGenerate, needsKeySetup, tModels, workspaceOptionForBase])

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

      <LoraSpineBar
        compatibleBases={compatibleBases}
        selectedBase={selectedBase}
        onSelectBase={setSelectedBaseId}
      />

      {!hasLora ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center">
          <Sparkles className="size-7 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-base font-medium">
              {t('generate.placeholderTitle')}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t('generate.placeholderBody')}
            </p>
          </div>
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
        <div
          className={cn(
            'grid min-w-0 gap-4 md:items-start',
            mined.recipes.length > 0 && 'md:grid-cols-12',
          )}
        >
          {mined.recipes.length > 0 ? (
            <div className="min-w-0 md:col-span-5">
              <LoraSourceRecipeStrip
                assetName={activeAsset?.name ?? ''}
                recipes={mined.recipes}
                selectedImageUrl={selectedImageUrl}
                includeSeed={includeSeed}
                extraMountStatusByKey={{}}
                extraStackFull={stack.items.length >= LORA_STACK_MAX}
                onSelectedImageUrlChange={setSelectedImageUrl}
                onIncludeSeedChange={setIncludeSeed}
                onMountExtraLora={() => undefined}
                onApplyRecipe={handleApplyRecipe}
              />
            </div>
          ) : null}
          <div
            className={cn(
              'min-w-0 space-y-3',
              mined.recipes.length > 0 && 'md:col-span-7',
            )}
          >
            <div
              className="aspect-square w-full rounded-2xl border border-border/60 bg-muted/30 bg-cover bg-center"
              style={
                lastGeneration
                  ? { backgroundImage: `url(${lastGeneration.url})` }
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
              ) : !lastGeneration ? (
                <div className="flex size-full items-center justify-center">
                  <Sparkles
                    className="size-7 text-muted-foreground/40"
                    aria-hidden
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-2xl bg-surface-composer p-3 text-surface-composer-foreground">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={loraTrigger || t('generate.promptPlaceholder')}
                rows={3}
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-surface-composer-foreground/40"
              />
              <div className="flex items-center justify-between gap-2">
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
                <Button
                  type="button"
                  size="sm"
                  disabled={!canGenerate}
                  onClick={handleGenerateClick}
                >
                  {isGenerating ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : needsKeySetup ? (
                    <Key className="size-3.5" aria-hidden />
                  ) : (
                    <Sparkles className="size-3.5" aria-hidden />
                  )}
                  {needsKeySetup ? tSetup('needsKey') : t('generate.run')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

interface LoraSpineBarProps {
  compatibleBases: LoraBaseModel[]
  selectedBase: LoraBaseModel | null
  onSelectBase: (id: string) => void
}

// 常驻脊柱条：当前 LoRA stack（自取）+ 被 LoRA 家族约束的底模扁平选择器。
// 选中态由 GenerateBranch 持有（受控），便于出图读取。
function LoraSpineBar({
  compatibleBases,
  selectedBase,
  onSelectBase,
}: LoraSpineBarProps) {
  const t = useTranslations('LoraWorkbench')
  const stack = useActiveLoraStack()

  const fidelityLabel = (b: LoraBaseModel) =>
    b.fidelity === 'faithful' ? t('spine.faithful') : t('spine.fast')

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('spine.currentLora')}
      </span>
      {stack.items.length > 0 ? (
        stack.items.map((item) => (
          <span
            key={item.asset.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs"
          >
            {item.asset.name}
            <span className="text-muted-foreground">
              ×{(item.scale ?? item.asset.defaultScale).toFixed(1)}
            </span>
          </span>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">
          {t('spine.empty')}
        </span>
      )}
      <span className="grow" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('spine.baseModel')}
      </span>
      {compatibleBases.length > 0 ? (
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
  isLoading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onSwitchSection: (section: LoraWorkbenchSection) => void
  onVisibilityChange: (assetId: string, isPublic: boolean) => Promise<boolean>
  onUnfavorite: (assetId: string) => Promise<boolean>
  onDelete: (assetId: string) => Promise<boolean>
}

function MyLoraBranch({
  trained,
  favorites,
  isLoading,
  error,
  onRefresh,
  onSwitchSection,
  onVisibilityChange,
  onUnfavorite,
  onDelete,
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
        <EmptyHero onSwitchSection={onSwitchSection} />
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
        </div>
      )}
    </section>
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

function CivitaiCommunityBranch({
  onFavorite,
  onUnfavoriteByUrl,
  isFavorited,
}: CivitaiCommunityBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const stack = useActiveLoraStack()
  const library = useCivitaiLoraLibrary()
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
  // Phone-portrait pattern: tapping a LoRA row opens a bottom drawer with the
  // inspector. Without this, the inspector stacks below the list on mobile
  // (lg:grid-cols-3 collapses to 1 col) which forced a long scroll just to see
  // details / hit the "Use in Studio" button.
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)
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
        toast.info(t('externalUseRedirect', { name: item.name }))
        return
      }
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }))
      // 去生成：切到 LoRA 域生成 tab（Image Studio 已不消费 LoRA）。
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
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
      // On phone-portrait, tapping a row should *go somewhere* — open the
      // bottom drawer with the inspector. On desktop the inline inspector
      // already updates, so no drawer is needed.
      if (isMobile) {
        setMobileInspectorOpen(true)
      }
    },
    [isMobile, library],
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
        toast.success(t('tryPromptCopied'))
      } catch {
        toast.error(t('tryPromptCopyFailed'))
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
        toast.success(t('triggerCopied'))
      } catch {
        toast.error(t('tryPromptCopyFailed'))
      }
    },
    [t],
  )

  return (
    <section className="rounded-2xl border border-border bg-card p-3 sm:p-5">
      {/* Mobile: title + refresh on the same row so the section header doesn't
          eat ~88px of vertical space before any content shows. sm+ gets the
          original taller layout with refresh aligned to the bottom-right. */}
      <header className="flex flex-row items-center justify-between gap-2 border-b border-border/60 pb-3 sm:items-end sm:pb-4">
        <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">
          {t('communityTitle')}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void library.refresh()}
          aria-label={t('refresh')}
          className="shrink-0"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{t('refresh')}</span>
        </Button>
      </header>

      {/* `grid-cols-1` matters even though there's only one mobile child —
          Tailwind's `grid-cols-1` resolves to `minmax(0, 1fr)`, which lets the
          single column shrink to the section's content box. Without it, the
          implicit grid track sizes to min-content, and any long unbreakable
          string inside a row (e.g. a Civitai trigger word) blows the section
          past the viewport edge. Repro: viewport <lg, search a LoRA whose
          trigger word is one long token. */}
      <div className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <BaseModelChipRow
            value={library.baseModel}
            onChange={handleBaseModelChange}
          />

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
          </div>

          <div
            className={cn(
              'min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 transition-opacity',
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
              <div className="py-12 text-center text-xs text-muted-foreground">
                {t('communityEmpty')}
              </div>
            ) : (
              library.items.map((item) => (
                <CivitaiLoraRow
                  key={item.id}
                  item={item}
                  isSelected={library.selectedItem?.id === item.id}
                  isActive={stack.items.some(
                    (entry) => entry.asset.id === item.id,
                  )}
                  isFavorited={isFavorited(item.loraUrl)}
                  onSelect={handleSelectItem}
                  onUse={handleUse}
                  onFavorite={handleFavoriteToggle}
                />
              ))
            )}
          </div>

          <CommunityPagination
            page={library.page}
            total={library.total}
            hasNextPage={library.hasNextPage}
            isLoading={library.isLoading}
            onPreviousPage={library.previousPage}
            onNextPage={library.nextPage}
          />
        </div>

        {/* Desktop: inline right-column inspector. Hidden on phone-portrait —
            the drawer below takes over so the user doesn't have to scroll past
            a full list to see a selected LoRA's details. */}
        <div className="hidden lg:block">
          <CivitaiLoraInspector
            // key forces a remount when the selected LoRA changes, which
            // resets the inspector's outfit-picker state to index 0 without
            // any setState-in-render or effect dance.
            key={library.selectedItem?.id ?? 'empty'}
            item={library.selectedItem}
            isFavorited={
              library.selectedItem
                ? isFavorited(library.selectedItem.loraUrl)
                : false
            }
            onUse={handleUse}
            onFavorite={handleFavoriteToggle}
            onCopyTryPrompt={handleCopyTryPrompt}
            onCopyTrigger={handleCopyTrigger}
            minedOutfits={minedPrompts.outfits}
            minedTotalSampled={minedPrompts.totalSampled}
            minedIsLoading={minedPrompts.isLoading}
            onPreviewCover={(item) => {
              // 放大对话框需要原图：inspector 的 coverImageUrl 已经被 service
              // 层 rewrite 成 640px，放大到 max-w-4xl (≥896px) 会糊。回退到
              // rewrite 后的 cover 是兜底。
              const fullUrl = item.coverImageUrlOriginal ?? item.coverImageUrl
              if (fullUrl) {
                setCoverPreview({ url: fullUrl, name: item.name })
              }
            }}
          />
        </div>
      </div>

      {/* Mobile-only bottom drawer for inspector. Vaul-backed so it gets the
          native iOS swipe-to-dismiss + scaled-background feel. Triggered by
          handleSelectItem, dismissed by drag, overlay tap, or the X button. */}
      <Drawer
        open={isMobile && mobileInspectorOpen && !!library.selectedItem}
        onOpenChange={setMobileInspectorOpen}
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
                setMobileInspectorOpen(false)
              }}
              onFavorite={handleFavoriteToggle}
              onCopyTryPrompt={handleCopyTryPrompt}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                const fullUrl = item.coverImageUrlOriginal ?? item.coverImageUrl
                if (fullUrl) {
                  setCoverPreview({ url: fullUrl, name: item.name })
                }
              }}
              minedOutfits={minedPrompts.outfits}
              minedTotalSampled={minedPrompts.totalSampled}
              minedIsLoading={minedPrompts.isLoading}
            />
          </div>
        </DrawerContent>
      </Drawer>

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
  isLoading: boolean
  onPreviousPage: () => void
  onNextPage: () => void
}

function CommunityPagination({
  page,
  total,
  hasNextPage,
  isLoading,
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
        disabled={page <= 1 || isLoading}
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
        disabled={!hasNextPage || isLoading}
        onClick={onNextPage}
        className="h-9 justify-center text-xs sm:min-w-24"
      >
        {t('communityNext')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  )
}

interface CivitaiLoraRowProps {
  item: CivitaiLoraLibraryItem
  isSelected: boolean
  isActive: boolean
  isFavorited: boolean
  onSelect: (item: CivitaiLoraLibraryItem) => void
  onUse: (item: CivitaiLoraLibraryItem) => void
  onFavorite: (item: CivitaiLoraLibraryItem) => void
}

function CivitaiLoraRow({
  item,
  isSelected,
  isActive,
  isFavorited,
  onSelect,
  onUse,
  onFavorite,
}: CivitaiLoraRowProps) {
  const t = useTranslations('LoraWorkbench')
  const isGeneratable = isCivitaiBaseModelGeneratable(item.baseModelFamily)

  return (
    <div
      className={cn(
        // Tighter horizontal padding + gap on phone keeps the 2 trailing icon
        // buttons (heart + use) inside the card and gives the LoRA name an
        // extra ~12-16px before it truncates.
        'flex w-full items-center gap-1.5 rounded-lg border px-2 py-2 text-left transition-all sm:gap-3 sm:px-3 sm:py-2.5',
        isSelected
          ? 'border-primary/30 bg-primary/10'
          : 'border-transparent hover:bg-muted/30',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3"
      >
        <LoraThumb item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {item.name}
            </span>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs',
                isGeneratable
                  ? 'bg-muted/60 text-muted-foreground'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
              title={isGeneratable ? undefined : t('externalBadgeHint')}
            >
              {!isGeneratable ? (
                <ExternalLink className="size-3" aria-hidden />
              ) : null}
              {item.baseModelFamily}
            </span>
          </div>
          <span className="block truncate text-2xs text-muted-foreground">
            {item.creatorName ?? t('communityUnknownCreator')}
          </span>
          <span
            className="block truncate font-mono text-2xs text-muted-foreground/70"
            title={item.triggerWord}
          >
            {item.triggerWord}
          </span>
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onFavorite(item)}
        aria-label={isFavorited ? t('unfavorite') : t('favorite')}
        title={isFavorited ? t('unfavorite') : t('favorite')}
      >
        <Heart
          className={cn(
            'size-3.5',
            isFavorited && 'fill-rose-500 text-rose-500',
          )}
          aria-hidden
        />
      </Button>
      <Button
        type="button"
        variant={isActive && isGeneratable ? 'secondary' : 'ghost'}
        size="icon-sm"
        onClick={() => onUse(item)}
        aria-label={
          !isGeneratable
            ? t('useExternal')
            : isActive
              ? t('alreadyInUse')
              : t('use')
        }
        title={
          !isGeneratable
            ? t('useExternal')
            : isActive
              ? t('alreadyInUse')
              : t('use')
        }
      >
        {!isGeneratable ? (
          <ExternalLink className="size-3.5" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
      </Button>
    </div>
  )
}

interface LoraThumbProps {
  item: CivitaiLoraLibraryItem
}

function LoraThumb({ item }: LoraThumbProps) {
  // Prefer the 96px-wide CDN transform; fall back to the 640px cover if for
  // any reason the thumb URL is missing (e.g. Civitai returned a non-standard
  // URL the rewriter couldn't recognise). Both come from the service layer
  // already sized — never load the 1–5 MB original here.
  const src = item.thumbImageUrl ?? item.coverImageUrl
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={40}
          height={40}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
    </div>
  )
}

interface CivitaiLoraInspectorProps {
  item: CivitaiLoraLibraryItem | null
  isFavorited: boolean
  onUse: (item: CivitaiLoraLibraryItem) => void
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

  // Multi-outfit LoRAs: Civitai authors stash per-costume activation
  // prompts in description <pre><code> blocks; we surface them as a chip
  // selector inside the Try-Prompt panel. Caller passes `key={item.id}`
  // on this component so a new LoRA fully remounts and this state resets
  // to 0 — React's official "reset state with a key" pattern, simpler
  // than tracking prevId in render or running a setState effect.
  const [selectedOutfitIndex, setSelectedOutfitIndex] = useState(0)

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
            item.coverImageUrl
              ? 'cursor-zoom-in transition-opacity hover:opacity-90'
              : 'cursor-default',
          )}
        >
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImageUrl}
              alt={item.name}
              width={640}
              height={360}
              className="aspect-video w-full object-cover"
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
            <button
              type="button"
              onClick={() => void onCopyTryPrompt(item, displayedPrompt)}
              className="text-2xs font-medium text-foreground hover:text-primary"
            >
              {t('tryPromptCopy')}
            </button>
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
  // Three-column page layout (xl+): training history rail · main form ·
  // preset rail. Presets used to sit above the form, which dragged the
  // main column off-screen and left the history rail mostly empty —
  // splitting them across siblings balances the columns and keeps the
  // form short.
  //
  // Breakpoint history: 3-col used to trigger at lg (1024px) but the
  // outer LoraWorkbench wrapper caps at max-w-6xl, and Studio pages
  // also reserve space for the left site sidebar. In the lg..xl- band
  // the form column was getting squeezed under ~280px, which forced
  // the training-type radio labels into vertical CJK columns and
  // generally made the form unusable. Now 3-col only fires at xl+
  // where the form column actually has 400px+ of breathing room.
  //
  // md..xl-: 2-col (history + form), preset folds below both columns
  // as a wide panel (not a thin rail) to use the horizontal space.
  // sm-: form moves into a Vaul bottom-sheet with both rails stacked.
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

  const historyRail = (
    <aside className="rounded-2xl border border-border bg-card p-4 lg:max-h-[calc(100svh-7rem)] lg:sticky lg:top-4 lg:overflow-y-auto">
      <LoraTrainingHistorySidebar />
    </aside>
  )

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

  if (isMobile) {
    // Mobile: history + presets stack above; form lives in a Vaul sheet
    // triggered by the floating FAB.
    return (
      <section className="mx-auto max-w-5xl space-y-4 pb-24">
        {historyRail}
        <div className="rounded-2xl border border-border bg-card p-4">
          <PresetGrid
            layout="wide"
            selectedId={presetId}
            onSelect={handleSelectPreset}
          />
        </div>
        <MobileTrainingSheet>{formColumn}</MobileTrainingSheet>
      </section>
    )
  }

  // Desktop: 3-col at xl+ (rail preset), 2-col at md..xl- (wide preset
  // panel folded below). Two preset panels are rendered, toggled with
  // CSS hidden — keeps the JSX flat and lets Tailwind pick the variant
  // based on viewport without a JS resize listener.
  return (
    <section className="mx-auto grid max-w-7xl gap-4 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
      {historyRail}
      {formColumn}
      <div className="hidden xl:block">
        <PresetRailPanel
          presetId={presetId}
          onSelect={handleSelectPreset}
          variant="rail"
        />
      </div>
      <div className="md:col-span-2 xl:hidden">
        <PresetRailPanel
          presetId={presetId}
          onSelect={handleSelectPreset}
          variant="panel"
        />
      </div>
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
    const label = option === 'all' ? t('baseModelFilterAll') : option
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
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label={t('baseModelFilterLabel')}
        // `max-w-full` + explicit `w-full` ensures the row's intrinsic width
        // never exceeds the parent column, so flex-wrap activates instead of
        // silently overflowing the section card on narrow viewports.
        className="flex w-full max-w-full flex-wrap items-center gap-1.5"
      >
        {renderChip('all')}
        {generatableChips.map(renderChip)}
        {externalChips.length > 0 ? (
          <span className="mx-1 h-4 w-px shrink-0 bg-border/60" aria-hidden />
        ) : null}
        {externalChips.map(renderChip)}
      </div>
      <p className="px-1 text-2xs text-muted-foreground">
        {t('baseModelFilterHint')}
      </p>
    </div>
  )
}
