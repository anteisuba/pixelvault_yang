'use client'

import type { ReactNode } from 'react'
import { Boxes, Download, Heart, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useHuggingFaceShowcaseCover } from '@/hooks/use-huggingface-showcase-cover'
import { Spinner } from '@/components/ui/spinner'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { formatCompactNumber } from '@/lib/format-compact-number'
import { cn } from '@/lib/utils'
import type {
  CivitaiLoraLibraryItem,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'

// 三源同卡（封面 + 族角标 + 源角标 CIV/HF + 名 + 下载/喜欢 mono + 动作）。
// 两个消费者，形制同源、动作不同：
//   · `LoraLibraryCard` —— 库 modal（＋添加 LoRA）。卡自带「使用/已挂」键，
//     点它就地挂载，不开详情。
//   · `LoraLibraryGridCard` —— 库 tab 的**移动端**结果区（<1024）。整张卡是
//     一个按钮，点开底部详情抽屉；卡上不放任何第二动作（拇指够不到，也会和
//     「点卡看详情」抢命中区）。桌面（≥1024）结果区仍是 LoraLibraryRow 行形制。
// 源差异 = 源角标 + HF 封面渐进增强 + 计数有无。两者都是纯展示件，动作上抛。

interface LoraLibraryCardBaseProps {
  /** 已挂进当前栈——使用键降级为「已挂」禁用态。 */
  mounted: boolean
  /**
   * 挂载前的服务端闸在飞（Civitai 下载策略约 300ms）。没有它，点完「使用」会
   * 有小半秒什么都不发生——看起来像点空了。
   */
  busy?: boolean
  onUse: () => void
}

export type LoraLibraryCardProps =
  | ({
      source: 'civitai'
      item: CivitaiLoraLibraryItem
    } & LoraLibraryCardBaseProps)
  | ({
      source: 'huggingface'
      item: HuggingFaceLoraSearchItem
    } & LoraLibraryCardBaseProps)
  | ({
      source: 'mine'
      item: LoraAssetRecord
    } & LoraLibraryCardBaseProps)

export type LoraLibraryGridCardProps =
  | { source: 'civitai'; item: CivitaiLoraLibraryItem; onOpen: () => void }
  | {
      source: 'huggingface'
      item: HuggingFaceLoraSearchItem
      onOpen: () => void
    }

interface CardFacts {
  name: string
  familyLabel: string
  counts: { downloads: number; likes: number } | null
  sourceBadge: string | null
}

/** 三源 → 一套展示事实（封面除外——封面自己一个组件，见 CardCover）。 */
function useLoraCardFacts(
  props: LoraLibraryCardProps | LoraLibraryGridCardProps,
): CardFacts {
  const t = useTranslations('LoraWorkbench')

  // 社区计数仅 civitai/HF；「我的」无。
  const counts =
    props.source === 'civitai'
      ? { downloads: props.item.downloadCount, likes: props.item.thumbsUpCount }
      : props.source === 'huggingface'
        ? { downloads: props.item.downloads, likes: props.item.likes }
        : null

  return {
    name: props.item.name,
    familyLabel: props.item.baseModelFamily,
    counts,
    sourceBadge:
      props.source === 'civitai'
        ? t('librarySourceCivitaiShort')
        : props.source === 'huggingface'
          ? t('librarySourceHfShort')
          : null,
  }
}

/**
 * 封面框：三源缩略图分派 + HF 懒加载观察点。
 *
 * ⚠ 观察点（`setObservedElement`）必须在**渲染这个 DOM 节点的组件里**取，
 * 不能由外层 hook 打包成「事实对象」的一个字段返回——react-hooks/refs 会把
 * 整个返回对象判成 ref，之后每一次 `facts.xxx` 都报「Cannot access refs
 * during render」（24 条）。角标由 children 叠上来。
 */
function CardCover({
  className,
  children,
  ...props
}: (LoraLibraryCardProps | LoraLibraryGridCardProps) & {
  className: string
  children?: ReactNode
}) {
  const showcase = useHuggingFaceShowcaseCover(
    props.source === 'huggingface' ? props.item.repoId : '',
    props.source === 'huggingface' ? props.item.revision : '',
    props.source === 'huggingface' ? props.item.coverImageUrl : null,
  )

  let thumbUrl: string | null = null
  if (props.source === 'civitai') {
    // ⚠ 顺序不能写成 thumb → card：`thumbImageUrl` 是 **96px 宽**的档位，是给
    // LoraLibraryRow 那种 size-14(56px) 的小方块用的；这里的卡是
    // `aspect-[3/4] w-full`（栅格里约 170–200px 宽），拿 96px 去铺等于放大
    // 2 倍，糊得很明显（owner 2026-08-07 实拍）。`cardImageUrl` 正好是 450px 档。
    const civitaiThumb =
      props.item.cardImageUrl ??
      props.item.thumbImageUrl ??
      props.item.coverImageUrl
    thumbUrl = civitaiThumb ? proxyCivitaiImageUrl(civitaiThumb) : null
  } else if (props.source === 'huggingface') {
    thumbUrl = showcase.coverUrl
  } else {
    thumbUrl = props.item.coverImageUrl
      ? proxyCivitaiImageUrl(props.item.coverImageUrl)
      : null
  }

  return (
    <span
      ref={props.source === 'huggingface' ? showcase.setObservedElement : null}
      className={className}
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          {props.source === 'huggingface' ? (
            <Boxes className="size-6" aria-hidden />
          ) : (
            <Sparkles className="size-6" aria-hidden />
          )}
        </span>
      )}
      {children}
    </span>
  )
}

export function LoraLibraryCard(props: LoraLibraryCardProps) {
  const t = useTranslations('LoraWorkbench')
  const { mounted, busy = false, onUse } = props
  const facts = useLoraCardFacts(props)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--lora-shadow-panel)] transition-colors hover:border-border">
      <CardCover
        {...props}
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
      >
        {/* 族角标（左上）+ 源角标（右上·CIV/HF·「我的」无）。 */}
        <span className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-px text-2xs font-medium text-foreground backdrop-blur-sm">
          {facts.familyLabel}
        </span>
        {facts.sourceBadge ? (
          <span className="absolute right-1.5 top-1.5 rounded bg-background/80 px-1.5 py-px text-2xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
            {facts.sourceBadge}
          </span>
        ) : null}
      </CardCover>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
        <p
          className="truncate text-xs font-medium text-foreground"
          title={facts.name}
        >
          {facts.name}
        </p>
        {facts.counts ? (
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" aria-hidden />
              <span className="font-mono">
                {facts.counts.downloads.toLocaleString()}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              <span className="font-mono">
                {facts.counts.likes.toLocaleString()}
              </span>
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onUse}
          disabled={mounted || busy}
          aria-busy={busy || undefined}
          className={cn(
            'mt-auto inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            mounted
              ? 'cursor-default border-border/60 bg-muted text-muted-foreground'
              : 'border-primary bg-primary text-primary-foreground hover:bg-[var(--lora-primary-hi)]',
            busy && !mounted && 'opacity-70',
          )}
        >
          {busy && !mounted ? <Spinner size="sm" aria-hidden /> : null}
          {mounted ? t('library.mounted') : t('library.use')}
        </button>
      </div>
    </div>
  )
}

/**
 * 移动端结果网格的一格。整张卡 = 一个按钮（`aria-label` 用 LoRA 名，读屏里
 * 就是「anima style, 按钮」），点开详情抽屉。角标压在封面上而不是排在下面：
 * 375 两列时每格只有 171px，底模/来源如果占掉两行文字，名字就只剩一行截断。
 */
export function LoraLibraryGridCard(props: LoraLibraryGridCardProps) {
  const facts = useLoraCardFacts(props)

  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={facts.name}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-transform duration-(--duration-fast) ease-standard',
        'active:scale-[0.98] motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <CardCover
        {...props}
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
      >
        {facts.sourceBadge ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-background/85 px-1.5 py-px text-2xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
            {facts.sourceBadge}
          </span>
        ) : null}
        {/* 底模胶囊：外层给「左右各留 6px」的可用宽，内层才 truncate——
            直接给绝对定位元素设最大宽会变成任意值类。 */}
        <span className="absolute inset-x-1.5 bottom-1.5 flex">
          <span className="truncate rounded-full bg-background/85 px-2 py-0.5 text-2xs font-medium text-foreground backdrop-blur-sm">
            {facts.familyLabel}
          </span>
        </span>
      </CardCover>

      <span className="flex min-w-0 flex-col gap-1 px-2 py-2">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {facts.name}
        </span>
        {facts.counts ? (
          <span className="flex items-center gap-2.5 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" aria-hidden />
              <span className="font-mono">
                {formatCompactNumber(facts.counts.downloads)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              <span className="font-mono">
                {formatCompactNumber(facts.counts.likes)}
              </span>
            </span>
          </span>
        ) : null}
      </span>
    </button>
  )
}
