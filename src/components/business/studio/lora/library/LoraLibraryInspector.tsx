'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  Heart,
  Info,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraCommerciallyUsable,
} from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { buildLoraPromptTemplate } from '@/lib/lora-prompt-template'
import { cn } from '@/lib/utils'
import { useCivitaiModelDescription } from '@/hooks/prompts/use-civitai-model-description'
import type {
  CivitaiLoraLibraryItem,
  CivitaiMinedPromptsResult,
  HuggingFaceLoraFile,
  HuggingFaceLoraSearchItem,
} from '@/types'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

// S3 统一详情抽屉（docs/references/pages/lora-workbench.md §2.4）：以现状
// CivitaiLoraInspector 为基底抽象，双源消费；区块按「有数据才渲染」装配。
// civitai 分支的行为/逻辑保留（重构收敛，非重设计——零回归）；HF 分支新增
// 「去生成」（家族可生成时）+「收藏」（=现 import 语义）+ 文件选择（从卡面
// 迁入，未选时主/次动作按钮引导选择，绝不静默选第一个）。

interface CivitaiInspectorProps {
  source: 'civitai'
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

interface HuggingFaceInspectorProps {
  source: 'huggingface'
  item: HuggingFaceLoraSearchItem | null
  /** Per-URL favorite lookup (same shape as the civitai pane's) — HF repos
   *  can carry multiple files, each with its own loraUrl, so the inspector
   *  checks the *selected* file rather than the caller precomputing a
   *  single boolean. */
  isFavorited: (loraUrl: string) => boolean
  /** 主「去生成」：调用方（HuggingFaceLoraLibrary）内部组合 import + 挂载
   *  栈 push + 跳转生成，与 civitai 的 onUse 语义对齐。 */
  onUse: (item: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => void
  /** 次「收藏」（拍板②：HF import 语义统一为收藏）。 */
  onFavorite: (
    item: HuggingFaceLoraSearchItem,
    file: HuggingFaceLoraFile,
  ) => void
  onUnfavorite: (file: HuggingFaceLoraFile) => void
  onCopyTrigger: (trigger: string) => Promise<void>
  onPreviewCover: (item: HuggingFaceLoraSearchItem) => void
}

export type LoraLibraryInspectorProps =
  | CivitaiInspectorProps
  | HuggingFaceInspectorProps

export function LoraLibraryInspector(props: LoraLibraryInspectorProps) {
  if (props.source === 'huggingface') {
    return <HuggingFaceInspectorBody {...props} />
  }
  return <CivitaiInspectorBody {...props} />
}

// ── 共享子件 ────────────────────────────────────────────────────────

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

function InspectorEmptyState() {
  const t = useTranslations('LoraWorkbench')
  // Hide the empty-state inspector on phone-portrait: it just shows a
  // "select a LoRA" placeholder card that wastes a screenful of vertical
  // space before the user can scroll back up to pick something.
  return (
    <aside className="hidden min-h-0 items-center justify-center rounded-xl border border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground lg:flex">
      {t('communityNoSelection')}
    </aside>
  )
}

// ── civitai 分支（现状 CivitaiLoraInspector 逻辑原样保留，新增 P0-2 授权
//    徽标行——lora-workbench.md §2.4「授权徽标行(P0-2规范)」，此前数据已有
//    但从未渲染，本片一并补齐）───────────────────────────────────────────

function CivitaiInspectorBody({
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
}: CivitaiInspectorProps) {
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
    return <InspectorEmptyState />
  }

  // P0-2 授权徽标（lora-workbench.md §2.4）：allowCommercialUse 含
  // Image/Rent/Sell 任一 → 可商用；否则个人使用。allowNoCredit === false
  // → 追加需署名。两者都是说明性状态，不是警示——不占用琥珀色域。
  const isCommercial = isCivitaiLoraCommerciallyUsable(item.allowCommercialUse)
  const needsAttribution = item.allowNoCredit === false

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
          {/* P0-2 授权徽标行——标题/作者行下方，数据已有(allowCommercialUse/
              allowDerivatives/allowNoCredit)只是此前从未渲染。 */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {isCommercial ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="size-2.5" aria-hidden />
                {t('licenseCommercial')}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
                title={t('licensePersonalUseHint')}
              >
                <Shield className="size-2.5" aria-hidden />
                {t('licensePersonalUse')}
              </span>
            )}
            {needsAttribution ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
                title={t('licenseAttributionRequiredHint')}
              >
                <Info className="size-2.5" aria-hidden />
                {t('licenseAttributionRequired')}
              </span>
            ) : null}
          </div>
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
                <Spinner
                  size="sm"
                  className="text-muted-foreground"
                  label={t('tryPromptMinedLoading')}
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

// ── HuggingFace 分支（新，§2.4 表右列）────────────────────────────────

function fileLabel(filename: string): string {
  return filename.split('/').at(-1) ?? filename
}

function HuggingFaceInspectorBody({
  item,
  isFavorited,
  onUse,
  onFavorite,
  onUnfavorite,
  onCopyTrigger,
  onPreviewCover,
}: HuggingFaceInspectorProps) {
  const t = useTranslations('LoraWorkbench')
  const [coverLoaded, setCoverLoaded] = useState(false)
  const needsExplicitPick = (item?.files.length ?? 0) > 1
  // 多文件仓库不预选——「先选择权重文件」而不是静默选 files[0]（拍板②：
  // 多文件 repo 文件差异=不同底模家族，选错会挂错桶）。单文件仓库没有歧义，
  // 直接确定为唯一文件。key={item.id} 由调用方负责，切换选中项时这个 state
  // 天然重置。
  const [selectedFilename, setSelectedFilename] = useState<string | null>(() =>
    item && !needsExplicitPick ? (item.files[0]?.filename ?? null) : null,
  )

  if (!item) {
    return <InspectorEmptyState />
  }

  const selectedFile =
    item.files.find((file) => file.filename === selectedFilename) ?? null
  const isGeneratable = selectedFile
    ? getCompatibleBases(selectedFile.baseModelFamily).some(
        (base) => base.available,
      )
    : false
  const selectedIsFavorited = selectedFile
    ? isFavorited(selectedFile.downloadUrl)
    : false

  const requireSelection = () => {
    toast.error(t('hfSelectFileFirst'))
  }

  const handlePrimaryClick = () => {
    if (!selectedFile) return requireSelection()
    if (!isGeneratable) {
      window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
      return
    }
    onUse(item, selectedFile)
  }

  const handleFavoriteClick = () => {
    if (!selectedFile) return requireSelection()
    if (selectedIsFavorited) {
      onUnfavorite(selectedFile)
    } else {
      onFavorite(item, selectedFile)
    }
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
              src={item.coverImageUrl}
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
          <p
            className="truncate text-xs text-muted-foreground"
            title={item.repoId}
          >
            {item.repoId}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric
            icon={<Download className="size-3.5" aria-hidden />}
            label={t('communityDownloads')}
            value={item.downloads.toLocaleString()}
          />
          <Metric
            icon={<Heart className="size-3.5" aria-hidden />}
            label={t('communityLikes')}
            value={item.likes.toLocaleString()}
          />
        </div>

        <dl className="space-y-3 text-xs">
          {item.license ? (
            <div>
              <dt className="text-muted-foreground">
                {t('huggingFaceLicenseLabel')}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {item.license}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">
              {t('communityTriggerWord')}
            </dt>
            {item.triggerWord ? (
              <dd className="mt-1 flex items-center gap-1.5">
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
            ) : (
              <dd className="mt-1 text-2xs text-muted-foreground">
                {t('huggingFaceNoTrigger')}
              </dd>
            )}
          </div>
        </dl>

        {/* 文件选择——从卡面迁入（§2.4）。单文件仓库没有歧义，不渲染 Select，
            直接显示文件名。 */}
        {needsExplicitPick ? (
          <div className="space-y-1">
            <label
              htmlFor={`hf-inspector-file-${item.repoId}`}
              className="text-2xs font-medium text-muted-foreground"
            >
              {t('huggingFaceSelectFile')}
            </label>
            <Select
              value={selectedFilename ?? undefined}
              onValueChange={setSelectedFilename}
            >
              <SelectTrigger
                id={`hf-inspector-file-${item.repoId}`}
                className="h-9 w-full min-w-0 max-w-full overflow-hidden text-xs [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
              >
                <SelectValue
                  placeholder={t('hfSelectFileFirst')}
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent>
                {item.files.map((file) => (
                  <SelectItem key={file.filename} value={file.filename}>
                    <span
                      className="block max-w-[min(72vw,20rem)] truncate"
                      title={`${fileLabel(file.filename)} · ${file.baseModelFamily}`}
                    >
                      {fileLabel(file.filename)} · {file.baseModelFamily}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : selectedFile ? (
          <p className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
            <FileDown className="size-3 shrink-0" aria-hidden />
            <span className="truncate" title={selectedFile.filename}>
              {fileLabel(selectedFile.filename)}
            </span>
          </p>
        ) : null}

        {selectedFile && !isGeneratable ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-2xs leading-relaxed text-amber-700 dark:text-amber-300">
            {t('huggingFaceExternalInspectorHint', {
              family: selectedFile.baseModelFamily,
            })}
          </div>
        ) : null}

        <div className="grid gap-2 pt-2">
          <Button type="button" onClick={handlePrimaryClick}>
            {selectedFile && !isGeneratable ? (
              <ExternalLink className="size-4" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {selectedFile && !isGeneratable
              ? t('huggingFaceOpenRepo')
              : t('communityUseInStudio')}
          </Button>
          <Button type="button" variant="outline" onClick={handleFavoriteClick}>
            <Heart
              className={cn(
                'size-4',
                selectedIsFavorited && 'fill-rose-500 text-rose-500',
              )}
              aria-hidden
            />
            {selectedIsFavorited ? t('unfavorite') : t('favorite')}
          </Button>
          {!(selectedFile && !isGeneratable) ? (
            <Button type="button" variant="ghost" asChild>
              <a href={item.modelPageUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-4" aria-hidden />
                {t('huggingFaceOpenRepo')}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
