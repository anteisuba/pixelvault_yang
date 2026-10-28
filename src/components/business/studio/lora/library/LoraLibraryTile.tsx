'use client'

import { useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import { ArrowUpRight, Check, Eye, Plus, Sparkles } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MEDIA_TILE_CLASS,
  MediaTileActions,
  MediaTileCaption,
  MediaTileCheck,
  MediaTileMoreTrigger,
  MediaTileShade,
} from '@/components/ui/media-tile'
import {
  ASSISTANT_MENTION_KIND_IDS,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import { useLoraBenchHandoff } from '@/contexts/studio-library-pick'
import { clampLabel } from '@/lib/assistant-mention'
import { cn } from '@/lib/utils'
import type { AssistantMention } from '@/types/assistant-mention'

import { useLoraPickSelection } from './lora-pick-selection'
import { LoraSampleVideo } from './LoraSampleVideo'

interface LoraLibraryTileProps {
  name: string
  /** 名字下面那一行：库里写下载 · 点赞，收藏里写触发词。 */
  meta: string
  coverUrl: string | null
  /** 封面的平均色（Civitai blurhash）：图到之前先铺这块颜色。 */
  coverColor?: string | null
  /** 封面是视频样例时的片段（`coverUrl` 是它的静帧）：进视野就静音循环。 */
  coverVideoUrl?: string | null
  /** 网格被详情页盖住时为 false：视频停下、让出同屏名额。 */
  coverVideoActive?: boolean
  mounted: boolean
  /** 挂载前的下载闸在飞（约 300ms）：这一下不给反应会像点空了。 */
  mounting?: boolean
  onOpen: () => void
  /** 不给 = 这张卡没有「挂载」（例如只能在 Civitai 站内出图的）。 */
  onMount?: () => unknown
  /** 封面还在找（Hugging Face 的 README 首图懒取）：只铺底色，⛔ 先闪占位图标。 */
  coverPending?: boolean
  /**
   * 挂哪一个要先选（Hugging Face 一个仓库里有好几个权重文件）：键写「挂载…」，
   * 点了由宿主打开详情页选文件 —— ⛔ 替用户挑第一个。
   */
  mountChooses?: boolean
  /**
   * 助手在库页圈的这一把（lora-assistant §13.2）：封面外一圈黑边 + 左上黑底
   * 「助手推荐」小标。⛔ 挪位置、⛔ 放大；挂上后由上层撤掉（换成 ✓）。
   */
  agentPick?: boolean
  /** 收藏那颗书签（库里每一格都有；Hugging Face 收藏要先选文件，不给）。 */
  favorite?: { saved: boolean; pending?: boolean; onToggle: () => void }
  /** 「交给助手」：一枚 `@LoRA` 胶囊挂进助手输入框（库整页才有）。 */
  onHandToAssistant?: () => void
  /** 挑选框里认这一格用的 id（同一把在库与收藏里写法不同，各给各的）。 */
  pickId?: string
}

/** 「交给助手」递过去的那一枚 `@LoRA` 胶囊（同 LoRA 台 `@` 菜单里那一组）。 */
export function loraMention(lora: {
  id: string
  name: string
  coverImageUrl?: string | null
}): AssistantMention {
  return {
    kind: ASSISTANT_MENTION_KIND_IDS.lora,
    id: lora.id,
    label: clampLabel(lora.name),
    scope: ASSISTANT_MENTION_SCOPE_IDS.lora,
    ...(lora.coverImageUrl ? { thumb: lora.coverImageUrl } : {}),
  }
}

/**
 * 库的一格（ui-spec §9「图格」，样件 E S19）：3:4 封面，名字 + 一行灰字在下。
 *
 * ⭐ 点卡开详情 = 垫在最底下、铺满整格的一颗按钮；悬停出「交给助手 · 收藏 · 更多」，
 *   「挂载」收进「更多」（⛔ 按钮套按钮，读屏与 Tab 序都会乱）。
 * ⭐ 挂了留在原地：封面右上一个 ✓；⛔ toast。只有 LoRA 台没开（从左栏进的库）时那一项写
 *   「去 LoRA 台用」，挂上就跳过去（`useLoraBenchHandoff`，owner 2026-10-28）。
 * ⚠ 封面先铺平均色、真图解码好了再由糊变清（200）；⛔ 灰骨架一闪。
 */
export function LoraLibraryTile({
  name,
  meta,
  coverUrl,
  coverColor,
  coverVideoUrl = null,
  coverVideoActive = true,
  mounted,
  mounting = false,
  onOpen,
  onMount,
  coverPending = false,
  mountChooses = false,
  agentPick = false,
  favorite,
  onHandToAssistant,
  pickId,
}: LoraLibraryTileProps) {
  const t = useTranslations('LoraWorkbench.browse')
  const tPicker = useTranslations('LoraWorkbench.picker')
  // 挑选框里（ui-spec ㉔）：整格 = 圈 / 不圈（同素材挑选框），详情收进「更多」；已挂的写「已挂」。
  const pick = useLoraPickSelection()
  // 台没开：「挂载」换成「去 LoRA 台用」，已挂的也能点（直接跳过去）。
  const handoff = useLoraBenchHandoff() !== null && !mountChooses
  const picking = pick !== null && pickId !== undefined
  const pickable = picking && onMount !== undefined && !mountChooses && !mounted
  const picked = pickable && pick.isSelected(pickId)
  const handleClick =
    pickable && onMount
      ? () => pick.toggle({ id: pickId, mount: onMount })
      : onOpen
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const loaded = coverUrl !== null && loadedUrl === coverUrl
  const coverStyle = coverColor
    ? ({ backgroundColor: coverColor } as CSSProperties)
    : undefined

  return (
    <div className="min-w-0">
      <div
        style={coverStyle}
        className={cn(
          MEDIA_TILE_CLASS,
          'aspect-3/4 ring-offset-2 ring-offset-background transition-[box-shadow] duration-base ease-linear motion-reduce:transition-none',
          agentPick ? 'ring-2 ring-foreground' : 'ring-0 ring-transparent',
        )}
      >
        {/* 整格就是「打开详情」：铺满的一颗按钮垫在最底下。 */}
        <button
          type="button"
          onClick={handleClick}
          aria-label={pickable ? tPicker('selectLabel', { name }) : name}
          aria-pressed={pickable ? picked : undefined}
          className="absolute inset-0 z-10 rounded-12 focus-visible:outline-none focus-visible:shadow-focus"
        />
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoadedUrl(coverUrl)}
            className={cn(
              'absolute inset-0 size-full object-cover transition-[filter,scale,opacity] duration-base ease-standard motion-reduce:transition-none',
              loaded ? 'opacity-100' : 'scale-118 opacity-0 blur-md',
            )}
          />
        ) : coverPending ? null : (
          <span className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Sparkles className="size-6" aria-hidden />
          </span>
        )}
        {coverVideoUrl ? (
          <LoraSampleVideo src={coverVideoUrl} active={coverVideoActive} />
        ) : null}
        <MediaTileShade />
        {agentPick ? (
          <span className="pointer-events-none absolute left-2 top-2 z-20 inline-flex h-5.5 animate-in items-center gap-1 rounded-full bg-black/85 pl-1 pr-2 text-2xs font-semibold text-white fade-in duration-base motion-reduce:animate-none">
            <Sparkles className="size-3" aria-hidden />
            {t('agentPick')}
          </span>
        ) : null}
        {pickable ? (
          <MediaTileCheck selected={picked} tone="highlight" />
        ) : null}
        {mounted && picking ? (
          <span className="pointer-events-none absolute right-2 top-2 z-20 inline-flex h-5.5 items-center rounded-full bg-media-chip px-2 text-2xs font-medium text-on-media-chip">
            {tPicker('mounted')}
          </span>
        ) : mounted ? (
          <span
            role="img"
            aria-label={t('mounted')}
            className="pointer-events-none absolute right-2 top-2 z-20 grid size-5.5 animate-in place-items-center rounded-full bg-media-chip text-status-applied fade-in duration-base"
          >
            <Check className="size-3" aria-hidden />
          </span>
        ) : null}
        <MediaTileActions
          handToAssistant={
            onHandToAssistant
              ? { label: t('handToAssistant'), onClick: onHandToAssistant }
              : undefined
          }
          favorite={
            favorite
              ? {
                  saved: favorite.saved,
                  pending: favorite.pending,
                  label: favorite.saved ? t('unfavorite') : t('favorite'),
                  onToggle: favorite.onToggle,
                }
              : undefined
          }
          more={
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <MediaTileMoreTrigger label={t('more')} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-36">
                {onMount ? (
                  handoff ? (
                    <DropdownMenuItem
                      disabled={mounting}
                      onSelect={() => {
                        if (!mounting) onMount()
                      }}
                      aria-label={t('useOnBenchLabel', { name })}
                    >
                      <ArrowUpRight aria-hidden />
                      {t('useOnBench')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={mounted || mounting}
                      onSelect={() => {
                        if (!mounted && !mounting) onMount()
                      }}
                      aria-label={
                        mounted
                          ? t('mountedLabel', { name })
                          : mountChooses
                            ? t('mountChooseLabel', { name })
                            : t('mountLabel', { name })
                      }
                    >
                      {mounted ? <Check aria-hidden /> : <Plus aria-hidden />}
                      {mounted
                        ? t('mounted')
                        : mountChooses
                          ? t('mountChoose')
                          : t('mount')}
                    </DropdownMenuItem>
                  )
                ) : null}
                <DropdownMenuItem onSelect={onOpen}>
                  <Eye aria-hidden />
                  {t('openDetail')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={handleClick}
        className="block w-full min-w-0 text-left"
      >
        <MediaTileCaption name={name} meta={meta} />
      </button>
    </div>
  )
}
