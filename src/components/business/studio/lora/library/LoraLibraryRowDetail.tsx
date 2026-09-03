'use client'

import { useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  ChevronUp,
  Download,
  ExternalLink,
  FileDown,
  Heart,
  Info,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraCommerciallyUsable,
} from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { useCivitaiModelDescription } from '@/hooks/prompts/use-civitai-model-description'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'
import type {
  CivitaiLoraLibraryItem,
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

// R1 库聚焦浏览（docs/references/pages/lora-library.md §3「选中项在原位置展开，
// 不把用户带离当前浏览位置。展开内容按『效果证据 → 判断信息 → 下一步动作』
// 组织」+ §4「行内详情不常驻试用提示词/来源图配方/带词去生成/复制配方」）：
// 原位展开详情——左大效果图、中判断字段、右三动作（使用此 LoRA / 收藏 /
// 打开来源）、下样例带。刻意比抽屉 Inspector 精简：去掉试用提示词面板、
// 一键同款、复制配方等整块；样例图点击交给共享来源配方 modal（R2）。

export interface LoraLibrarySampleImage {
  url: string
  label: string
}

/**
 * 同一份详情内容的两种外壳：
 * - `inline`（默认，桌面 ≥1024）——原位展开卡片，三栏（封面 / 判断字段 / 动作列）。
 * - `drawer`（移动端 <1024）——底部抽屉：内容整段竖排可滚，动作压成底部常驻条。
 *
 * ⚠ 只有**外壳**分叉：封面 / 判断字段 / 样例带 / 动作语义都由同一段分支代码
 * 算出来（HF 的文件选择状态、civitai 的描述懒加载都只有一份），别为了抽屉再
 * 抄一遍——两份会立刻在「哪个按钮该在什么时候变成打开来源」上漂移。
 */
export type LoraLibraryDetailLayout = 'inline' | 'drawer'

interface CivitaiDetailProps {
  source: 'civitai'
  layout?: LoraLibraryDetailLayout
  item: CivitaiLoraLibraryItem
  isFavorited: boolean
  onUse: (item: CivitaiLoraLibraryItem) => void
  onFavorite: (item: CivitaiLoraLibraryItem) => void
  onCollapse: () => void
  /** 样例带（由 pane 从 mined recipes / preview images 解析）。点击交给
   *  onSampleClick（R1 打开封面预览，R2 换共享来源配方 modal）。 */
  sampleImages: readonly LoraLibrarySampleImage[]
  onSampleClick: (index: number) => void
  onPreviewCover: (item: CivitaiLoraLibraryItem) => void
}

interface HuggingFaceDetailProps {
  source: 'huggingface'
  layout?: LoraLibraryDetailLayout
  item: HuggingFaceLoraSearchItem
  isFavorited: (loraUrl: string) => boolean
  onUse: (item: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => void
  onFavorite: (
    item: HuggingFaceLoraSearchItem,
    file: HuggingFaceLoraFile,
  ) => void
  onUnfavorite: (file: HuggingFaceLoraFile) => void
  onCollapse: () => void
  onPreviewCover: (item: HuggingFaceLoraSearchItem) => void
}

export type LoraLibraryRowDetailProps =
  | CivitaiDetailProps
  | HuggingFaceDetailProps

// R1 close-review（owner 2026-07-19「按钮部分最好做点击后的过度动画」）：给
// 详情动作按钮加统一按压过渡。Button 自带 color 过渡，这里只补 transform。
const PRESS_ANIMATION = 'transition-transform active:scale-[0.97]'

export function LoraLibraryRowDetail(props: LoraLibraryRowDetailProps) {
  if (props.source === 'huggingface') {
    return <HuggingFaceRowDetail {...props} />
  }
  return <CivitaiRowDetail {...props} />
}

// ── 共享布局 ────────────────────────────────────────────────────────

function DetailShell({
  onCollapse,
  cover,
  info,
  actions,
  samples,
}: {
  onCollapse: () => void
  cover: ReactNode
  info: ReactNode
  actions: ReactNode
  samples?: ReactNode
}) {
  const t = useTranslations('LoraWorkbench')
  return (
    // 平滑高度揭示由外层 `.lora-detail-reveal`（globals.css）负责——这里只
    // 管卡片本身的视觉。
    <div className="rounded-2xl border border-primary/40 bg-muted/10 p-3 ring-1 ring-primary/20 sm:p-4">
      {/* ⚠ 封面是 4:5 定比，`w-full` 在窄视口下等于「容器多宽它就多高」：
          618 宽实机上它 675px 高，把名称、底模、触发词整块顶出屏外，展开一行
          等于什么都看不见（owner 2026-09-03）。所以两道收窄：
          <640 仍上下堆但封面收到 192px 居中；≥640 就改成封面在左的两栏，
          动作列换行到下面独占一行；≥1024 才回到原来的三栏。 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap lg:flex-nowrap">
        <div className="w-48 shrink-0 max-sm:mx-auto sm:w-40 lg:w-64">
          {cover}
        </div>
        <div className="min-w-0 flex-1">{info}</div>
        {/* 收起控件挪进动作列顶部右对齐——不再 absolute 叠在「使用此 LoRA」
            按钮上（owner 反馈重叠）。 */}
        <div className="flex shrink-0 flex-col gap-2 max-lg:w-full lg:w-44">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCollapse}
              aria-label={t('collapseDetail')}
              title={t('collapseDetail')}
              className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] hover:bg-muted/60 hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
          </div>
          {actions}
        </div>
      </div>
      {samples}
    </div>
  )
}

/**
 * 抽屉外壳：上半段内容整段滚动，下半段是常驻动作条。
 * 收起控件不在这里——抽屉自带抓手，下滑或点遮罩即关（`onCollapse` 由抽屉宿主
 * 的 `onOpenChange` 走同一条路）。
 */
function DetailDrawerBody({
  cover,
  info,
  actions,
  samples,
}: {
  cover: ReactNode
  info: ReactNode
  actions: ReactNode
  samples?: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-2">
        {/* 封面在抽屉里收到 192px 居中：4:5 的 `w-full` 在 375 上是 469px 高，
            会把名称/触发词整块顶到折叠线以下（与 DetailShell 同一教训）。 */}
        <div className="mx-auto w-48">{cover}</div>
        {info}
        {samples}
      </div>
      {actions}
    </div>
  )
}

// 动作三件套的语义（两个源各自算出来，两种外壳共用）：主动作在不可生成时
// 翻成「打开来源」，收藏是开关，外链永远是真 `<a>`。
interface DetailActionModel {
  primaryLabel: string
  /** 主动作实际是外跳（不可生成的底模）——图标与语义都换掉。 */
  primaryExternal: boolean
  onPrimary: () => void
  isFavorited: boolean
  favoriteLabel: string
  onFavoriteToggle: () => void
  sourceUrl: string
  sourceLabel: string
  /** 主动作已经是「打开来源」时不再并排放第二个同义外链。 */
  showSource: boolean
}

function InlineActions({ model }: { model: DetailActionModel }) {
  return (
    <>
      <Button
        type="button"
        onClick={model.onPrimary}
        className={PRESS_ANIMATION}
      >
        {model.primaryExternal ? (
          <ExternalLink className="size-4" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {model.primaryLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={model.onFavoriteToggle}
        className={PRESS_ANIMATION}
      >
        <Heart
          className={cn(
            'size-4',
            model.isFavorited && 'fill-rose-500 text-rose-500',
          )}
          aria-hidden
        />
        {model.favoriteLabel}
      </Button>
      {model.showSource ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          asChild
          className={PRESS_ANIMATION}
        >
          <a href={model.sourceUrl} target="_blank" rel="noreferrer">
            <ArrowUpRight className="size-4" aria-hidden />
            {model.sourceLabel}
          </a>
        </Button>
      ) : null}
    </>
  )
}

/**
 * 抽屉底部常驻动作条：主动作占满剩余宽，收藏与外链各是一个 44px 方钮
 * （ui-defaults §5 coarse 命中区）。sticky 而不是 fixed——`.lora-mobile-actionbar`
 * 是 fixed 到视口的，放进抽屉会脱离抽屉贴到屏幕底、并压住抽屉外的东西。
 */
function DrawerActionBar({ model }: { model: DetailActionModel }) {
  return (
    <div className="keyboard-aware-bottom-padding sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-border bg-background px-4 pt-3">
      <Button
        type="button"
        onClick={model.onPrimary}
        className={cn('h-11 min-h-11 flex-1', PRESS_ANIMATION)}
      >
        {model.primaryExternal ? (
          <ExternalLink className="size-4" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {model.primaryLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={model.favoriteLabel}
        title={model.favoriteLabel}
        onClick={model.onFavoriteToggle}
        className={cn('size-11 shrink-0', PRESS_ANIMATION)}
      >
        <Heart
          className={cn(
            'size-4',
            model.isFavorited && 'fill-rose-500 text-rose-500',
          )}
          aria-hidden
        />
      </Button>
      {model.showSource ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          asChild
          className={cn('size-11 shrink-0', PRESS_ANIMATION)}
        >
          <a
            href={model.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={model.sourceLabel}
            title={model.sourceLabel}
          >
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </Button>
      ) : null}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{children}</dd>
    </div>
  )
}

function Metrics({ downloads, likes }: { downloads: number; likes: number }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Download className="size-3.5" aria-hidden />
        {downloads.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1">
        <Heart className="size-3.5" aria-hidden />
        {likes.toLocaleString()}
      </span>
    </div>
  )
}

// ── civitai 分支 ────────────────────────────────────────────────────

function CivitaiRowDetail({
  item,
  layout = 'inline',
  isFavorited,
  onUse,
  onFavorite,
  onCollapse,
  sampleImages,
  onSampleClick,
  onPreviewCover,
}: CivitaiDetailProps) {
  const t = useTranslations('LoraWorkbench')
  const [coverLoaded, setCoverLoaded] = useState(false)
  const isGeneratable = isCivitaiBaseModelGeneratable(item.baseModelFamily)
  const isCommercial = isCivitaiLoraCommerciallyUsable(item.allowCommercialUse)
  const needsAttribution = item.allowNoCredit === false
  // 作者描述懒加载（面板展开时才拉一次 /models/:id）；无描述/失败则不渲染。
  // 库侧只读展示、不带复制块（复制归 Generate 上下文）。
  const { descriptionText } = useCivitaiModelDescription(item.modelId)

  const cover = (
    <button
      type="button"
      onClick={() => onPreviewCover(item)}
      disabled={!item.coverImageUrl}
      aria-label={t('viewCover')}
      className={cn(
        'block w-full overflow-hidden rounded-xl border border-border/60 bg-muted',
        item.coverImageUrl && !coverLoaded && 'animate-pulse',
        item.coverImageUrl
          ? 'cursor-zoom-in hover:opacity-95'
          : 'cursor-default',
      )}
    >
      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyCivitaiImageUrl(item.coverImageUrl)}
          alt={item.name}
          width={512}
          height={640}
          onLoad={() => setCoverLoaded(true)}
          className={cn(
            'aspect-[4/5] w-full object-cover transition-opacity duration-200',
            coverLoaded ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex aspect-[4/5] items-center justify-center text-muted-foreground">
          <Sparkles className="size-8" aria-hidden />
        </div>
      )}
    </button>
  )

  const info = (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold leading-tight text-foreground">
            {item.name}
          </h3>
          <span className="rounded border border-border/60 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
            {item.baseModelFamily}
          </span>
        </div>
        <Metrics downloads={item.downloadCount} likes={item.thumbsUpCount} />
      </div>

      <dl className="space-y-1.5">
        <FieldRow label={t('communityTriggerWord')}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <code className="break-all rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-2xs">
              {item.triggerWord}
            </code>
            {item.triggerSource === 'inferred' ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-status-warning-surface px-1.5 py-0.5 text-2xs font-medium text-status-warning"
                title={t('triggerSourceInferredHint')}
              >
                <Info className="size-2.5" aria-hidden />
                {t('triggerSourceInferredBadge')}
              </span>
            ) : null}
          </span>
        </FieldRow>
        <FieldRow label={t('communityBaseModel')}>
          {item.baseModelFamily}
        </FieldRow>
        <FieldRow label={t('communitySource')}>
          <a
            href={item.modelPageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:text-primary"
          >
            {t('librarySourceCivitai')}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </FieldRow>
        <FieldRow label={t('licenseLabel')}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {isCommercial ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-applied-surface px-1.5 py-0.5 text-2xs font-medium text-status-applied">
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
          </span>
        </FieldRow>
        <FieldRow label={t('safetyLabel')}>
          {item.isNsfw ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-warning-surface px-1.5 py-0.5 text-2xs font-medium text-status-warning">
              <Shield className="size-2.5" aria-hidden />
              {t('safetySensitive')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-applied-surface px-1.5 py-0.5 text-2xs font-medium text-status-applied">
              <ShieldCheck className="size-2.5" aria-hidden />
              {t('safetySafe')}
            </span>
          )}
        </FieldRow>
      </dl>

      {descriptionText ? (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {descriptionText}
        </p>
      ) : null}

      <p className="text-2xs text-muted-foreground">
        {t('detailAuthor', {
          name: item.creatorName ?? t('communityUnknownCreator'),
        })}
      </p>

      {!isGeneratable ? (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning-surface px-3 py-2 text-2xs leading-relaxed text-status-warning">
          {t('externalInspectorHint', { family: item.baseModelFamily })}
        </div>
      ) : null}
    </div>
  )

  const actionModel: DetailActionModel = {
    primaryLabel: isGeneratable
      ? t('useThisLora')
      : t('communityOpenInCivitai'),
    primaryExternal: !isGeneratable,
    onPrimary: () => onUse(item),
    isFavorited,
    favoriteLabel: isFavorited ? t('unfavorite') : t('favorite'),
    onFavoriteToggle: () => onFavorite(item),
    sourceUrl: item.modelPageUrl,
    sourceLabel: t('communityOpenSource'),
    showSource: isGeneratable,
  }

  const samples =
    sampleImages.length > 0 ? (
      <div className="mt-4 border-t border-border/50 pt-3">
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('sampleStripLabel')}
        </p>
        <div className="lora-scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
          {sampleImages.map((sample, idx) => (
            <button
              key={sample.url}
              type="button"
              onClick={() => onSampleClick(idx)}
              aria-label={sample.label}
              className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/60 outline-none transition-shadow hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyCivitaiImageUrl(sample.url)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-24 w-32 object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    ) : null

  if (layout === 'drawer') {
    return (
      <DetailDrawerBody
        cover={cover}
        info={info}
        actions={<DrawerActionBar model={actionModel} />}
        samples={samples}
      />
    )
  }

  return (
    <DetailShell
      onCollapse={onCollapse}
      cover={cover}
      info={info}
      actions={<InlineActions model={actionModel} />}
      samples={samples}
    />
  )
}

// ── HuggingFace 分支（含文件选择门：多文件仓库先选文件再使用/收藏）──────

function fileLabel(filename: string): string {
  return filename.split('/').at(-1) ?? filename
}

function HuggingFaceRowDetail({
  item,
  layout = 'inline',
  isFavorited,
  onUse,
  onFavorite,
  onUnfavorite,
  onCollapse,
  onPreviewCover,
}: HuggingFaceDetailProps) {
  const t = useTranslations('LoraWorkbench')
  const [coverLoaded, setCoverLoaded] = useState(false)
  const needsExplicitPick = item.files.length > 1
  const [selectedFilename, setSelectedFilename] = useState<string | null>(() =>
    needsExplicitPick ? null : (item.files[0]?.filename ?? null),
  )

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

  const cover = (
    <button
      type="button"
      onClick={() => onPreviewCover(item)}
      disabled={!item.coverImageUrl}
      aria-label={t('viewCover')}
      className={cn(
        'block w-full overflow-hidden rounded-xl border border-border/60 bg-muted',
        item.coverImageUrl && !coverLoaded && 'animate-pulse',
        item.coverImageUrl
          ? 'cursor-zoom-in hover:opacity-95'
          : 'cursor-default',
      )}
    >
      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImageUrl}
          alt={item.name}
          width={512}
          height={640}
          onLoad={() => setCoverLoaded(true)}
          className={cn(
            'aspect-[4/5] w-full object-cover transition-opacity duration-200',
            coverLoaded ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex aspect-[4/5] items-center justify-center text-muted-foreground">
          <Sparkles className="size-8" aria-hidden />
        </div>
      )}
    </button>
  )

  const info = (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold leading-tight text-foreground">
            {item.name}
          </h3>
          <span className="rounded border border-border/60 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
            {item.baseModelFamily}
          </span>
        </div>
        <Metrics downloads={item.downloads} likes={item.likes} />
      </div>

      <dl className="space-y-1.5">
        <FieldRow label={t('communityTriggerWord')}>
          {item.triggerWord ? (
            <code className="break-all rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-2xs">
              {item.triggerWord}
            </code>
          ) : (
            <span className="text-2xs text-muted-foreground">
              {t('huggingFaceNoTrigger')}
            </span>
          )}
        </FieldRow>
        <FieldRow label={t('communitySource')}>
          <a
            href={item.modelPageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 text-foreground hover:text-primary"
            title={item.repoId}
          >
            <span className="truncate">{item.repoId}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </FieldRow>
        {item.license ? (
          <FieldRow label={t('huggingFaceLicenseLabel')}>
            {item.license}
          </FieldRow>
        ) : null}
      </dl>

      {/* 文件选择——多文件仓库不静默选 files[0]（拍板②：文件差异=不同底模
          家族，选错会挂错桶）。 */}
      {needsExplicitPick ? (
        <div className="space-y-1">
          <label
            htmlFor={`hf-detail-file-${item.repoId}`}
            className="text-2xs font-medium text-muted-foreground"
          >
            {t('huggingFaceSelectFile')}
          </label>
          <Select
            value={selectedFilename ?? undefined}
            onValueChange={setSelectedFilename}
          >
            <SelectTrigger
              id={`hf-detail-file-${item.repoId}`}
              className="h-9 w-full min-w-0 max-w-full text-xs [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
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
        <div className="rounded-lg border border-status-warning/40 bg-status-warning-surface px-3 py-2 text-2xs leading-relaxed text-status-warning">
          {t('huggingFaceExternalInspectorHint', {
            family: selectedFile.baseModelFamily,
          })}
        </div>
      ) : null}
    </div>
  )

  // 未选文件时 loud 引导（toast），不静默选 files[0]——多文件 repo 文件差异
  // = 不同底模家族，选错会挂错桶（拍板②）。
  const requireSelection = () => toast.error(t('hfSelectFileFirst'))
  const actionModel: DetailActionModel = {
    primaryLabel:
      selectedFile && !isGeneratable
        ? t('huggingFaceOpenRepo')
        : t('useThisLora'),
    primaryExternal: Boolean(selectedFile) && !isGeneratable,
    onPrimary: () => {
      if (!selectedFile) return requireSelection()
      if (!isGeneratable) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        return
      }
      onUse(item, selectedFile)
    },
    isFavorited: selectedIsFavorited,
    favoriteLabel: selectedIsFavorited ? t('unfavorite') : t('favorite'),
    onFavoriteToggle: () => {
      if (!selectedFile) return requireSelection()
      if (selectedIsFavorited) {
        onUnfavorite(selectedFile)
      } else {
        onFavorite(item, selectedFile)
      }
    },
    sourceUrl: item.modelPageUrl,
    sourceLabel: t('huggingFaceOpenRepo'),
    showSource: true,
  }

  if (layout === 'drawer') {
    return (
      <DetailDrawerBody
        cover={cover}
        info={info}
        actions={<DrawerActionBar model={actionModel} />}
      />
    )
  }

  return (
    <DetailShell
      onCollapse={onCollapse}
      cover={cover}
      info={info}
      actions={<InlineActions model={actionModel} />}
    />
  )
}
