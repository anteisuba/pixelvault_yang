'use client'

import { Boxes, Download, Heart, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useHuggingFaceShowcaseCover } from '@/hooks/use-huggingface-showcase-cover'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'
import type {
  CivitaiLoraLibraryItem,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'

// S3 库 modal：三源同卡（配屏 3 设计）——封面 + 族角标 + 源角标(CIV/HF·「我的」
// 无) + 名 + 下载/喜欢 mono(「我的」无社区计数) + 使用/已挂键。取代 LoraLibraryRow
// 的行形制（行留给旧「库」tab，本卡只在库 modal 用）。源差异 = 源角标 + HF 封面
// 渐进增强 + 计数有无。纯展示件，挂载动作由 onUse 上抛。

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
  | ({
      source: 'mine'
      item: LoraAssetRecord
    } & LoraLibraryCardBaseProps)

function formatCount(value: number): string {
  return value.toLocaleString()
}

export function LoraLibraryCard(props: LoraLibraryCardProps) {
  const t = useTranslations('LoraWorkbench')
  const { mounted, onUse } = props

  // HF 封面渐进增强（同 LoraLibraryRow）：hook 无条件调用；非 HF 传空跳过。
  const showcase = useHuggingFaceShowcaseCover(
    props.source === 'huggingface' ? props.item.repoId : '',
    props.source === 'huggingface' ? props.item.revision : '',
    props.source === 'huggingface' ? props.item.coverImageUrl : null,
  )

  // 缩略图三源分派：civitai 三档回退→代理；HF 走 showcase；「我的」用记录封面
  // （civitai 来源的封面同样过代理，非 civitai URL 透传）。
  let thumbUrl: string | null = null
  if (props.source === 'civitai') {
    // ⚠ 顺序不能写成 thumb → card：`thumbImageUrl` 是 **96px 宽**的档位，是给
    // LoraLibraryRow 那种 size-14(56px) 的小方块用的；这里的卡是
    // `aspect-[3/4] w-full`（栅格里约 200px 宽），拿 96px 去铺等于放大 2 倍，
    // 糊得很明显（owner 2026-08-07 实拍）。`cardImageUrl` 正好是 450px 档。
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

  const name = props.item.name
  const familyLabel = props.item.baseModelFamily
  // 社区计数仅 civitai/HF；「我的」无。
  const counts =
    props.source === 'civitai'
      ? { downloads: props.item.downloadCount, likes: props.item.thumbsUpCount }
      : props.source === 'huggingface'
        ? { downloads: props.item.downloads, likes: props.item.likes }
        : null
  const sourceBadge =
    props.source === 'civitai'
      ? t('librarySourceCivitaiShort')
      : props.source === 'huggingface'
        ? t('librarySourceHfShort')
        : null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--lora-shadow-panel)] transition-colors hover:border-border">
      <div
        ref={
          props.source === 'huggingface'
            ? showcase.setObservedElement
            : undefined
        }
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
            {props.source === 'huggingface' ? (
              <Boxes className="size-6" aria-hidden />
            ) : (
              <Sparkles className="size-6" aria-hidden />
            )}
          </span>
        )}
        {/* 族角标（左上）+ 源角标（右上·CIV/HF·「我的」无）。 */}
        <span className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-px text-2xs font-medium text-foreground backdrop-blur-sm">
          {familyLabel}
        </span>
        {sourceBadge ? (
          <span className="absolute right-1.5 top-1.5 rounded bg-background/80 px-1.5 py-px text-2xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
            {sourceBadge}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
        <p
          className="truncate text-xs font-medium text-foreground"
          title={name}
        >
          {name}
        </p>
        {counts ? (
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" aria-hidden />
              <span className="font-mono">{formatCount(counts.downloads)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              <span className="font-mono">{formatCount(counts.likes)}</span>
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onUse}
          disabled={mounted}
          className={cn(
            'mt-auto inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition-colors',
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
