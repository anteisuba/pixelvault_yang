'use client'

import { Boxes, Download, ExternalLink, Heart, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { isCivitaiBaseModelGeneratable } from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { useHuggingFaceShowcaseCover } from '@/hooks/use-huggingface-showcase-cover'
import { cn } from '@/lib/utils'
import type { CivitaiLoraLibraryItem, HuggingFaceLoraSearchItem } from '@/types'
import { LoraCoverTile } from '@/components/business/studio/lora/LoraCoverTile'

// S3 统一卡片（docs/references/pages/lora-workbench.md §2.3）：civitai/HF
// 两 tab 共用同一张卡——封面（LoraCoverTile 现状）+ 家族角标 + 收藏心 +
// 名称行（+源角标，双源唯一的视觉差异点）+ 下载/点赞元数据行。HF 卡现状的
// file Select / trigger 行 / import 按钮全部移出卡面进抽屉（§2.4）——卡片
// 只负责「认出它」，点卡=开抽屉，与 civitai 对齐。

interface LoraLibraryCardBaseProps {
  isSelected: boolean
  isFavorited: boolean
  onSelect: () => void
  /** 收藏心点击——具体语义（civitai 直接收藏 / HF 单文件直接收藏、多文件
   *  转去开抽屉选文件）由调用方决定，卡片本身不碰文件选择这类源特定逻辑。 */
  onFavorite: () => void
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
  const { isSelected, isFavorited, onSelect, onFavorite } = props
  const isCivitai = props.source === 'civitai'

  // HF 库侧封面渐进增强（owner 2026-07-18 拍板方案 B）：hook 必须无条件调
  // 用（Rules of Hooks）——civitai 卡传空 repoId/null 封面，让它在
  // `isHuggingFaceSocialThumbnailCoverUrl(null) === false` 分支透传原样、
  // 不发任何请求，civitai 路径零改动。
  const showcase = useHuggingFaceShowcaseCover(
    isCivitai ? '' : props.item.repoId,
    isCivitai ? '' : props.item.revision,
    isCivitai ? null : props.item.coverImageUrl,
  )

  // HF 卡片家族角标/生成性判定用仓库级 baseModelFamily（多文件仓库各文件
  // 家族可能不同，精确的按文件判定留给抽屉的文件选择器；卡面只给一个代表
  // 值——与 HF 家族筛选 chip 用的同一个字段，语义一致）。
  const coverUrl = isCivitai
    ? (props.item.cardImageUrl ?? props.item.coverImageUrl)
    : showcase.coverUrl
  const familyLabel = props.item.baseModelFamily
  const isGeneratable = isCivitai
    ? isCivitaiBaseModelGeneratable(props.item.baseModelFamily)
    : getCompatibleBases(props.item.baseModelFamily).some(
        (base) => base.available,
      )
  const downloadCount = isCivitai
    ? props.item.downloadCount
    : props.item.downloads
  const likeCount = isCivitai ? props.item.thumbsUpCount : props.item.likes

  return (
    <div className="min-w-0">
      <LoraCoverTile
        coverUrl={coverUrl}
        isLoadingCover={!isCivitai && showcase.isPending}
        containerRef={isCivitai ? undefined : showcase.setObservedElement}
        alt=""
        fallbackIcon={
          isCivitai ? (
            <Sparkles className="size-6" aria-hidden />
          ) : (
            <Boxes className="size-6" aria-hidden />
          )
        }
        badgeLabel={familyLabel}
        badgeIcon={
          isGeneratable ? undefined : (
            <ExternalLink className="size-3" aria-hidden />
          )
        }
        badgeTitle={
          isGeneratable
            ? undefined
            : t(
                isCivitai
                  ? 'externalBadgeHint'
                  : 'huggingFaceUnsupportedFamily',
              )
        }
        selected={isSelected}
        onClick={onSelect}
        interactiveLabel={props.item.name}
        topRight={
          // P1-9: 视觉 16px 心，触屏（coarse pointer）下用透明 ::before 把点击
          // 区扩到 44px（16 + 2×14），鼠标端保持精确小目标不抢卡片点击。
          <button
            type="button"
            onClick={onFavorite}
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
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-foreground">
          {props.item.name}
        </p>
        {/* 源角标——双源唯一的视觉差异点（§2.3）。title 带全名。 */}
        <span
          className="shrink-0 rounded border border-border/60 px-1 py-px text-3xs font-medium uppercase leading-tight tracking-wide text-muted-foreground"
          title={t(
            isCivitai ? 'librarySourceCivitai' : 'librarySourceHuggingFace',
          )}
        >
          {t(isCivitai ? 'sourceBadgeCivitai' : 'sourceBadgeHuggingFace')}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-3xs text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <Download className="size-2.5" aria-hidden />
          {formatCount(downloadCount)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Heart className="size-2.5" aria-hidden />
          {formatCount(likeCount)}
        </span>
      </div>
    </div>
  )
}
