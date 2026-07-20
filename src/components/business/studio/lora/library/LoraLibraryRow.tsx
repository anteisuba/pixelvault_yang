'use client'

import {
  Boxes,
  ChevronDown,
  Download,
  ExternalLink,
  Heart,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { useHuggingFaceShowcaseCover } from '@/hooks/use-huggingface-showcase-cover'
import { cn } from '@/lib/utils'
import type { CivitaiLoraLibraryItem, HuggingFaceLoraSearchItem } from '@/types'

// R1 库聚焦浏览（docs/references/pages/lora-library.md §3「结果按单列宽幅节奏
// 呈现。未展开项保持紧凑，展示缩略效果、名称、底模、来源与必要热度信息」）：
// 单列结果流的「未展开行」。整行是一个展开按钮，点击原位置展开详情
// （LoraLibraryRowDetail），不挂载、不跳页。收藏/打开来源/使用等动作只在
// 展开详情里，未展开行保持轻。双源唯一视觉差异 = 源角标（CIV/HF）。

interface LoraLibraryRowBaseProps {
  /** 1-based 序号（确认图未展开行左侧的位次数字）。 */
  index: number
  isExpanded: boolean
  onToggle: () => void
}

export type LoraLibraryRowProps =
  | ({
      source: 'civitai'
      item: CivitaiLoraLibraryItem
    } & LoraLibraryRowBaseProps)
  | ({
      source: 'huggingface'
      item: HuggingFaceLoraSearchItem
    } & LoraLibraryRowBaseProps)

function formatCount(value: number): string {
  return value.toLocaleString()
}

export function LoraLibraryRow(props: LoraLibraryRowProps) {
  const t = useTranslations('LoraWorkbench')
  const { index, isExpanded, onToggle } = props
  const isCivitai = props.source === 'civitai'

  // HF 封面渐进增强（owner 2026-07-18 方案 B）：hook 必须无条件调用；civitai
  // 传空 repoId/null 封面，走透传分支不发请求。
  const showcase = useHuggingFaceShowcaseCover(
    isCivitai ? '' : props.item.repoId,
    isCivitai ? '' : props.item.revision,
    isCivitai ? null : props.item.coverImageUrl,
  )

  // civitai 缩略图三档回退（thumb→card→cover）都可能为 null——先解出再
  // 走代理，避免把 null 传给只接受 string 的 proxyCivitaiImageUrl。
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
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-label={name}
      ref={isCivitai ? undefined : showcase.setObservedElement}
      className={cn(
        // R1 close-review（owner 2026-07-19「这个尺寸下看着这么小」）：整行放大
        // ——更高行、更大缩略图、元数据升到 text-xs，宽视口下更有存在感。
        'group flex w-full items-center gap-3.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors',
        'hover:border-border/60 hover:bg-muted/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground/70">
        {index}
      </span>

      <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
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
              <Sparkles className="size-5" aria-hidden />
            ) : (
              <Boxes className="size-5" aria-hidden />
            )}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="shrink-0 rounded border border-border/60 px-1.5 py-px text-2xs font-medium text-muted-foreground">
            {familyLabel}
          </span>
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-3.5 text-xs text-muted-foreground sm:flex">
        <span className="inline-flex items-center gap-1">
          <Download className="size-3.5" aria-hidden />
          {formatCount(downloadCount)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart className="size-3.5" aria-hidden />
          {formatCount(likeCount)}
        </span>
      </span>

      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline">
          {t(isCivitai ? 'librarySourceCivitai' : 'librarySourceHuggingFace')}
        </span>
        {/* 装饰性外链图标——真正的「打开来源」动作在展开详情里，避免在按钮
            内嵌套 <a>（非法 HTML）。 */}
        <ExternalLink className="size-3.5" aria-hidden />
      </span>

      <ChevronDown
        className={cn(
          'size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200',
          isExpanded && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  )
}
