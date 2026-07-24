'use client'

import { Boxes, Download, Heart, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useHuggingFaceShowcaseCover } from '@/hooks/use-huggingface-showcase-cover'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'
import type { CivitaiLoraLibraryItem, HuggingFaceLoraSearchItem } from '@/types'

// S3 库 modal：双源同卡（配屏 3 设计）——封面 + 族角标 + 源角标(CIV/HF) +
// runner-only 标 + 名 + 下载/喜欢 mono + 使用/已挂键。取代 LoraLibraryRow 的
// 行形制（行留给旧「库」tab，本卡只在库 modal 用）。唯一源差异 = 源角标 + HF
// 封面渐进增强。纯展示件，挂载/收藏动作由 onUse 上抛。

interface LoraLibraryCardBaseProps {
  /** 已挂进当前栈——使用键降级为「已挂」禁用态。 */
  mounted: boolean
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

function formatCount(value: number): string {
  return value.toLocaleString()
}

export function LoraLibraryCard(props: LoraLibraryCardProps) {
  const t = useTranslations('LoraWorkbench')
  const { mounted, onUse } = props
  const isCivitai = props.source === 'civitai'

  // HF 封面渐进增强（同 LoraLibraryRow）：hook 无条件调用；civitai 传空跳过。
  const showcase = useHuggingFaceShowcaseCover(
    isCivitai ? '' : props.item.repoId,
    isCivitai ? '' : props.item.revision,
    isCivitai ? null : props.item.coverImageUrl,
  )

  const civitaiThumb = isCivitai
    ? (props.item.thumbImageUrl ??
      props.item.cardImageUrl ??
      props.item.coverImageUrl)
    : null
  const thumbUrl = isCivitai
    ? civitaiThumb
      ? proxyCivitaiImageUrl(civitaiThumb)
      : null
    : showcase.coverUrl
  const name = props.item.name
  const familyLabel = props.item.baseModelFamily
  const downloadCount = isCivitai
    ? props.item.downloadCount
    : props.item.downloads
  const likeCount = isCivitai ? props.item.thumbsUpCount : props.item.likes

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--lora-shadow-panel)] transition-colors hover:border-border">
      <div
        ref={isCivitai ? undefined : showcase.setObservedElement}
        className="relative aspect-[3/4] w-full overflow-hidden bg-muted"
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
            {isCivitai ? (
              <Sparkles className="size-6" aria-hidden />
            ) : (
              <Boxes className="size-6" aria-hidden />
            )}
          </span>
        )}
        {/* 族角标（左上）+ 源角标（右上·CIV/HF）。 */}
        <span className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-px text-2xs font-medium text-foreground backdrop-blur-sm">
          {familyLabel}
        </span>
        <span className="absolute right-1.5 top-1.5 rounded bg-background/80 px-1.5 py-px text-2xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
          {isCivitai
            ? t('librarySourceCivitaiShort')
            : t('librarySourceHfShort')}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
        <p
          className="truncate text-xs font-medium text-foreground"
          title={name}
        >
          {name}
        </p>
        <div className="flex items-center gap-3 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Download className="size-3" aria-hidden />
            <span className="font-mono">{formatCount(downloadCount)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" aria-hidden />
            <span className="font-mono">{formatCount(likeCount)}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onUse}
          disabled={mounted}
          className={cn(
            'mt-0.5 inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            mounted
              ? 'cursor-default border-border/60 bg-muted text-muted-foreground'
              : 'border-primary bg-primary text-primary-foreground hover:bg-[var(--lora-primary-hi)]',
          )}
        >
          {mounted ? t('library.mounted') : t('library.use')}
        </button>
      </div>
    </div>
  )
}
