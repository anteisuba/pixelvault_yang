'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Check, ChevronLeft, RefreshCw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Switch } from '@/components/ui/switch'
import {
  isCivitaiBaseModelGeneratable,
  LORA_TOAST_DURATION_MS,
} from '@/constants/lora'
import { useCharacterLoras } from '@/features/cards/hooks'
import { useActiveLoraStack } from '@/features/lora/hooks/use-active-lora-stack'
import { useCivitaiDownloadGate } from '@/features/lora/hooks/use-civitai-download-gate'
import { useCivitaiLoraLibrary } from '@/features/lora/hooks/use-civitai-lora-library'
import { useCivitaiMinedPrompts } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { useLoraAssets } from '@/features/lora/hooks/use-lora-assets'
import { characterLorasToMount } from '@/features/lora/lib/character-lora-mount'
import { proxyCivitaiImageUrl } from '@/features/lora/lib/civitai-image-url'
import { isLoraBaseModelMountCompatible } from '@/features/lora/lib/lora-model-compatibility'
import { cn } from '@/lib/utils'
import type {
  CharacterLoraGroup,
  CivitaiImageRecipe,
  CivitaiLoraLibraryItem,
  LoraAssetRecord,
} from '@/types'

import { FAMILY_LABEL_KEYS } from '../LoraMountPills'
import type { LoraStageContextValue } from '../lora-stage-context'

export type LoraBenchLibraryTab = 'favorites' | 'characters' | 'trained' | 'all'

/** 详情里那一把：`civitai` = 从「全部」（Civitai 库）点进来的，挂之前要过下载闸。 */
interface Picked {
  asset: LoraAssetRecord
  civitai: CivitaiLoraLibraryItem | null
}

const EXAMPLE_LIMIT = 6

/**
 * LoRA 台「+ LoRA」（11-18 工作台里开库）：盖在舞台上的一块，左边卡片格、右边详情。
 * 收藏 / 角色 / 自训 / 全部 四栏；「只看能配当前底模的」默认开、能关，关了之后装不上的那把
 * 在详情里写清「给 X 用，当前是 Y，挂上不生效」且「挂上」不可点。点卡片 = 开详情（⛔ 选中）；
 * 详情给示例大图（每张「做同款」走台上原有的 `handleApplyRecipe`，由 `onMakeSame` 接）、
 * 触发词、单独的挂上 / 卸下。「全部」是 Civitai 库，取失败只在那一栏给重试。
 * 手机由宿主装进底部抽屉（`variant="sheet"`，详情盖住格子、左上角返回）。
 */
export function LoraBenchLibraryPanel({
  stage,
  initialAsset = null,
  onClose,
  onMakeSame,
  variant = 'stage',
}: {
  stage: LoraStageContextValue
  /** 从输入框药丸「看详情」进来：直接开这一把。 */
  initialAsset?: LoraAssetRecord | null
  onClose: () => void
  /** 示例图「做同款」：这把已经挂上了（面板先挂），宿主按原有做同款那条路填参数。 */
  onMakeSame: (asset: LoraAssetRecord, recipe: CivitaiImageRecipe) => void
  variant?: 'stage' | 'sheet'
}) {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  const tw = useTranslations('LoraWorkbench')
  const sheet = variant === 'sheet'
  const stack = useActiveLoraStack()
  const assets = useLoraAssets()
  const characterLoras = useCharacterLoras()
  const { ensureMountable, checkingVersionId } = useCivitaiDownloadGate()
  const [tab, setTab] = useState<LoraBenchLibraryTab>('favorites')
  const [fitOnly, setFitOnly] = useState(true)
  const [picked, setPicked] = useState<Picked | null>(
    initialAsset ? { asset: initialAsset, civitai: null } : null,
  )

  const base = stage.base
  // 「来源图底模（自动）」不是一个能配的名字：按它实际解析到的家族说（如 Anima）；
  // 认不出家族就说「当前模型」（11-18 真机：原来读成「只看能配 来源图底模（自动） 的」）。
  const autoFamilyKey =
    base?.translationKey === 'sourceCheckpointAuto'
      ? FAMILY_LABEL_KEYS[base.family]
      : undefined
  const resolvedBaseLabel =
    base?.translationKey === 'sourceCheckpointAuto'
      ? autoFamilyKey
        ? tw(`familyLabel.${autoFamilyKey}`)
        : null
      : stage.baseLabel
  const baseLabel = resolvedBaseLabel ?? t('currentBase')
  const familyOf = useCallback(
    (asset: LoraAssetRecord) => {
      const key = FAMILY_LABEL_KEYS[asset.baseModelFamily]
      return key ? tw(`familyLabel.${key}`) : asset.baseModelFamily
    },
    [tw],
  )
  const fits = useCallback(
    (asset: LoraAssetRecord) =>
      base
        ? isLoraBaseModelMountCompatible(asset.baseModelFamily, base.family)
        : true,
    [base],
  )
  const isMounted = useCallback(
    (asset: LoraAssetRecord) =>
      stack.items.some(
        (entry) =>
          entry.asset.id === asset.id ||
          entry.asset.loraUrl === asset.loraUrl ||
          (asset.modelVersionId != null &&
            asset.modelVersionId > 0 &&
            entry.asset.modelVersionId === asset.modelVersionId),
      ),
    [stack.items],
  )

  // 角色那一栏：同一把收进好几位只算一张；挂的时候连同那套造型一起（只认得出一位时）。
  const characterAssets = useMemo(() => {
    const seen = new Set<string>()
    const out: LoraAssetRecord[] = []
    for (const group of characterLoras.groups) {
      for (const lora of group.loras) {
        if (seen.has(lora.loraUrl)) continue
        seen.add(lora.loraUrl)
        out.push(lora)
      }
    }
    return out
  }, [characterLoras.groups])
  const characterMountList = useCallback(
    (asset: LoraAssetRecord): LoraAssetRecord[] => {
      const owners: CharacterLoraGroup[] = characterLoras.groups.filter(
        (group) => group.loras.some((lora) => lora.id === asset.id),
      )
      const group = owners.length === 1 ? owners[0] : undefined
      const one = group?.loras.find((lora) => lora.id === asset.id)
      return group && one ? characterLorasToMount(group, one) : [asset]
    },
    [characterLoras.groups],
  )

  /** 挂上；挂不上（下载闸拦了 / 只能去 Civitai 用）返回 false。 */
  const mount = useCallback(
    async (target: Picked): Promise<boolean> => {
      if (isMounted(target.asset)) return true
      const version = target.civitai
      if (version) {
        if (!(await ensureMountable(version))) return false
        if (!isCivitaiBaseModelGeneratable(version.baseModelFamily)) {
          window.open(version.modelPageUrl, '_blank', 'noopener,noreferrer')
          toast.info(tw('externalUseRedirect', { name: version.name }), {
            duration: LORA_TOAST_DURATION_MS,
          })
          return false
        }
        stack.push(version)
        return true
      }
      const list =
        tab === 'characters' ? characterMountList(target.asset) : [target.asset]
      for (const item of list) if (!isMounted(item)) stack.push(item)
      return true
    },
    [characterMountList, ensureMountable, isMounted, stack, tab, tw],
  )

  const tabs: { value: LoraBenchLibraryTab; label: string }[] = [
    { value: 'favorites', label: t('tabFavorites') },
    { value: 'characters', label: t('tabCharacters') },
    { value: 'trained', label: t('tabTrained') },
    { value: 'all', label: t('tabAll') },
  ]
  const fitLabel = resolvedBaseLabel
    ? t('fitOnly', { base: resolvedBaseLabel })
    : t('fitOnlyNoBase')

  const openDetail = (
    asset: LoraAssetRecord,
    civitai: Picked['civitai'] = null,
  ) => setPicked({ asset, civitai })

  const grid =
    tab === 'all' ? (
      <LoraBenchCivitaiGrid
        fitOnly={fitOnly}
        fits={fits}
        familyOf={familyOf}
        isMounted={isMounted}
        pickedId={picked?.asset.id ?? null}
        onPick={(item) => openDetail(item, item)}
      />
    ) : (
      <LoraBenchMineGrid
        tab={tab}
        items={
          tab === 'favorites'
            ? assets.favoriteAssets
            : tab === 'trained'
              ? assets.trainedAssets
              : characterAssets
        }
        isLoading={
          tab === 'characters' ? characterLoras.isLoading : assets.isLoadingMine
        }
        error={tab === 'characters' ? characterLoras.error : assets.errorMine}
        onRetry={() =>
          void (tab === 'characters'
            ? characterLoras.refresh()
            : assets.refresh())
        }
        fitOnly={fitOnly}
        fits={fits}
        familyOf={familyOf}
        isMounted={isMounted}
        pickedId={picked?.asset.id ?? null}
        onPick={(asset) => openDetail(asset)}
      />
    )

  const detail = picked ? (
    <LoraBenchDetail
      key={picked.asset.id}
      asset={picked.asset}
      alternates={picked.civitai?.triggerAlternates ?? []}
      family={familyOf(picked.asset)}
      baseLabel={baseLabel}
      compatible={fits(picked.asset)}
      mounted={isMounted(picked.asset)}
      busy={
        picked.civitai != null &&
        checkingVersionId === picked.civitai.modelVersionId
      }
      onBack={sheet ? () => setPicked(null) : undefined}
      onMount={() => void mount(picked)}
      onUnmount={() => {
        const entry = stack.items.find(
          (item) =>
            item.asset.id === picked.asset.id ||
            item.asset.loraUrl === picked.asset.loraUrl,
        )
        if (entry) stack.remove(entry.asset.id)
      }}
      onMakeSame={async (recipe) => {
        if (!(await mount(picked))) return
        const mountedAsset =
          stack.items.find(
            (item) => item.asset.loraUrl === picked.asset.loraUrl,
          )?.asset ??
          picked.civitai ??
          picked.asset
        onMakeSame(mountedAsset, recipe)
        onClose()
      }}
    />
  ) : (
    <p className="text-2sm text-muted-foreground">{t('pickHint')}</p>
  )

  return (
    <section
      aria-labelledby="lora-bench-library-title"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-3',
        sheet ? 'px-4 pt-2 pb-4' : 'p-4 lg:px-5',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2
          id="lora-bench-library-title"
          tabIndex={-1}
          className="text-md font-semibold outline-none"
        >
          {t('title')}
        </h2>
        <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
          {t('hint')}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 lg:min-h-0"
          onClick={onClose}
        >
          {t('close')}
        </Button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <LiquidSegmented
          items={tabs}
          value={tab}
          onChange={setTab}
          ariaLabel={t('tabsLabel')}
        />
        <label className="flex min-h-11 items-center gap-2 text-2sm text-ink-2 lg:min-h-0">
          <Switch checked={fitOnly} onCheckedChange={setFitOnly} />
          {fitLabel}
        </label>
      </div>
      {sheet ? (
        picked ? (
          <div className="flex min-h-0 flex-1 flex-col">{detail}</div>
        ) : (
          <div className="@container min-h-0 flex-1 overflow-y-auto">
            {grid}
          </div>
        )
      ) : (
        // 没选中：格子铺满、右边一窄条提示；选中：详情占一半以上（格子收成 2–3 列）。
        <div className="flex min-h-0 flex-1 gap-5">
          <div
            className={cn(
              '@container min-h-0 min-w-0 overflow-y-auto',
              picked ? 'w-2/5 shrink-0' : 'flex-1',
            )}
          >
            {grid}
          </div>
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col border-l border-border pl-5',
              picked ? 'flex-1' : 'w-64 shrink-0',
            )}
            aria-live="polite"
          >
            {detail}
          </div>
        </div>
      )}
    </section>
  )
}

interface GridCommon {
  fitOnly: boolean
  fits: (asset: LoraAssetRecord) => boolean
  familyOf: (asset: LoraAssetRecord) => string
  isMounted: (asset: LoraAssetRecord) => boolean
  pickedId: string | null
}

function LoraBenchMineGrid({
  tab,
  items,
  isLoading,
  error,
  onRetry,
  onPick,
  ...common
}: GridCommon & {
  tab: Exclude<LoraBenchLibraryTab, 'all'>
  items: readonly LoraAssetRecord[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onPick: (asset: LoraAssetRecord) => void
}) {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  if (isLoading && items.length === 0) return <GridSkeleton />
  if (error && items.length === 0)
    return <GridError text={error} onRetry={onRetry} />
  const shown = common.fitOnly ? items.filter(common.fits) : items
  if (items.length === 0) return <GridEmpty text={t(`empty.${tab}`)} />
  if (shown.length === 0) return <GridEmpty text={t('emptyFiltered')} />
  return <CardGrid items={shown} onPick={onPick} {...common} />
}

function LoraBenchCivitaiGrid({
  onPick,
  ...common
}: GridCommon & { onPick: (item: CivitaiLoraLibraryItem) => void }) {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  const library = useCivitaiLoraLibrary({ accumulate: true })
  if (library.isLoading && library.items.length === 0) return <GridSkeleton />
  if (library.error && library.items.length === 0)
    return (
      <GridError text={library.error} onRetry={() => void library.refresh()} />
    )
  const shown = common.fitOnly
    ? library.items.filter(common.fits)
    : library.items
  return (
    <div className="flex flex-col gap-3">
      {library.items.length === 0 ? (
        <GridEmpty text={t('empty.all')} />
      ) : shown.length === 0 ? (
        <GridEmpty text={t('emptyFiltered')} />
      ) : (
        <CardGrid
          items={shown}
          onPick={(asset) => {
            const item = library.items.find((entry) => entry.id === asset.id)
            if (item) onPick(item)
          }}
          {...common}
        />
      )}
      {library.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 self-center lg:min-h-0"
          disabled={library.isLoadingMore}
          onClick={library.loadMore}
        >
          {library.isLoadingMore ? t('loadingMore') : t('loadMore')}
        </Button>
      ) : null}
    </div>
  )
}

function CardGrid({
  items,
  onPick,
  fits,
  familyOf,
  isMounted,
  pickedId,
}: GridCommon & {
  items: readonly LoraAssetRecord[]
  onPick: (asset: LoraAssetRecord) => void
}) {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  return (
    <ul className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5">
      {items.map((asset) => {
        const mounted = isMounted(asset)
        const cover = asset.coverImageUrl ?? asset.previewImageUrls[0] ?? null
        return (
          <li key={asset.id}>
            <Button
              type="button"
              variant="ghost"
              aria-current={pickedId === asset.id ? 'true' : undefined}
              aria-label={t('cardLabel', { name: asset.name })}
              onClick={() => onPick(asset)}
              className={cn(
                'h-auto w-full flex-col items-stretch gap-1.5 rounded-xl p-1.5 text-left whitespace-normal',
                pickedId === asset.id && 'bg-highlight-soft',
              )}
            >
              <span className="relative block aspect-3/4 w-full overflow-hidden rounded-lg bg-muted">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 第三方图走代理，同库里其它卡片
                  <img
                    src={proxyCivitaiImageUrl(cover)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover object-top"
                  />
                ) : null}
                {mounted ? (
                  <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-0.5 text-2xs font-semibold text-highlight">
                    <Check className="size-3" aria-hidden />
                    {t('mounted')}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-2sm font-semibold text-foreground">
                {asset.name}
              </span>
              <span
                className={cn(
                  'truncate text-2xs',
                  fits(asset) ? 'text-muted-foreground' : 'text-status-warning',
                )}
              >
                {familyOf(asset)}
              </span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function GridSkeleton() {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  return (
    <div
      role="status"
      aria-label={t('loading')}
      className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <span
          key={index}
          className="block aspect-3/4 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
        />
      ))}
    </div>
  )
}

function GridEmpty({ text }: { text: string }) {
  return (
    <p role="status" className="pt-2 text-2sm text-muted-foreground">
      {text}
    </p>
  )
}

function GridError({ text, onRetry }: { text: string; onRetry: () => void }) {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  return (
    <div role="alert" className="flex flex-col items-start gap-2 pt-2">
      <p className="text-2sm text-foreground">{text}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11 lg:min-h-0"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden />
        {t('retry')}
      </Button>
    </div>
  )
}

function LoraBenchDetail({
  asset,
  alternates,
  family,
  baseLabel,
  compatible,
  mounted,
  busy,
  onBack,
  onMount,
  onUnmount,
  onMakeSame,
}: {
  asset: LoraAssetRecord
  /** Civitai 条目的其它候选触发词。 */
  alternates: readonly string[]
  family: string
  baseLabel: string
  compatible: boolean
  mounted: boolean
  busy: boolean
  onBack?: () => void
  onMount: () => void
  onUnmount: () => void
  onMakeSame: (recipe: CivitaiImageRecipe) => void
}) {
  const t = useTranslations('LoraWorkbench.benchLibrary')
  const mined = useCivitaiMinedPrompts(
    asset.modelId && asset.modelVersionId
      ? {
          modelId: asset.modelId,
          modelVersionId: asset.modelVersionId,
          fileHashAutoV3: asset.fileHashAutoV3,
        }
      : null,
  )
  const recipes = mined.recipes.slice(0, EXAMPLE_LIMIT)
  // 没有带参数的来源图：退到作者示例 / 记录自带的预览 / 封面（只看，没有「做同款」）。
  const plain = recipes.length
    ? []
    : [
        ...new Set(
          [
            ...asset.previewImageUrls,
            ...mined.previewImages.map((image) => image.imageUrl),
            asset.coverImageUrl,
          ].filter((url): url is string => Boolean(url)),
        ),
      ].slice(0, EXAMPLE_LIMIT)
  const triggers = [
    ...new Set(
      [...asset.triggerWord.split(','), ...alternates]
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ]
  const examplesLoading = mined.isLoading && !recipes.length && !plain.length

  const exampleGrid = 'grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3'
  const mountButton = mounted ? (
    <Button
      type="button"
      variant="secondary"
      className="min-h-11 shrink-0 lg:min-h-0"
      onClick={onUnmount}
    >
      {t('unmount')}
    </Button>
  ) : (
    <Button
      type="button"
      className="min-h-11 shrink-0 lg:min-h-0"
      disabled={!compatible || busy}
      onClick={onMount}
    >
      {busy ? t('mounting') : t('mount')}
    </Button>
  )

  // 头部（名字 · 家族 · 挂上/卸下）+ 触发词钉在顶上，示例图在下面单独滚（11-18 真机：
  // 原来挂上 / 触发词被示例挤到折叠线以下）。示例按详情栏宽排 1–3 列，每张不小于约 200px。
  return (
    <article
      aria-label={t('detailLabel', { name: asset.name })}
      className="flex min-h-0 flex-1 flex-col gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-base ease-standard motion-reduce:animate-none"
    >
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-2 size-11 shrink-0"
              aria-label={t('back')}
              onClick={onBack}
            >
              <ChevronLeft aria-hidden />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-foreground">
              {asset.name}
            </h3>
            <p className="truncate text-2xs text-muted-foreground">{family}</p>
          </div>
          {mountButton}
        </div>
        {!compatible ? (
          <p className="rounded-lg bg-status-warning/10 px-3 py-2 text-2sm text-status-warning">
            {t('incompatible', { family, base: baseLabel })}
          </p>
        ) : null}
        <section
          aria-label={t('triggers')}
          className="flex min-w-0 items-start gap-2.5"
        >
          <h4 className="shrink-0 pt-0.5 text-2sm font-semibold text-foreground">
            {t('triggers')}
          </h4>
          {triggers.length ? (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {triggers.map((word) => (
                <span
                  key={word}
                  className="max-w-full truncate rounded-sm bg-highlight-soft px-1.5 py-0.5 font-mono text-2xs text-highlight"
                >
                  {word}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-2sm text-muted-foreground">{t('noTriggers')}</p>
          )}
        </section>
      </div>
      <section
        aria-label={t('examples')}
        className="@container flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
      >
        <h4 className="text-2sm font-semibold text-foreground">
          {t('examples')}
        </h4>
        {examplesLoading ? (
          <div
            role="status"
            aria-label={t('examplesLoading')}
            className={exampleGrid}
          >
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="block aspect-3/4 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : recipes.length ? (
          <ul className={exampleGrid}>
            {recipes.map((recipe) => (
              <li key={recipe.imageUrl} className="flex flex-col gap-1.5">
                <span className="relative block aspect-3/4 overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Civitai 来源图走代理 */}
                  <img
                    src={proxyCivitaiImageUrl(recipe.imageUrl)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover object-top"
                  />
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11 lg:min-h-0"
                  disabled={!compatible || busy}
                  onClick={() => onMakeSame(recipe)}
                >
                  {t('makeSame')}
                </Button>
              </li>
            ))}
          </ul>
        ) : plain.length ? (
          <ul className={exampleGrid}>
            {plain.map((url) => (
              <li
                key={url}
                className="relative block aspect-3/4 overflow-hidden rounded-lg bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Civitai 示例图走代理 */}
                <img
                  src={proxyCivitaiImageUrl(url)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover object-top"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-2sm text-muted-foreground">
            {mined.error ?? t('examplesEmpty')}
          </p>
        )}
        {!recipes.length && plain.length ? (
          <p className="text-2xs text-muted-foreground">{t('noRecipe')}</p>
        ) : null}
      </section>
    </article>
  )
}
