'use client'

import { useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import { Check, Plus, Sparkles } from '@/components/icons'
import { cn } from '@/lib/utils'

interface LoraLibraryTileProps {
  name: string
  /** 名字下面那一行：库里写下载 · 点赞，收藏里写触发词。 */
  meta: string
  coverUrl: string | null
  /** 封面的平均色（Civitai blurhash）：图到之前先铺这块颜色。 */
  coverColor?: string | null
  mounted: boolean
  /** 挂载前的下载闸在飞（约 300ms）：这一下不给反应会像点空了。 */
  mounting?: boolean
  onOpen: () => void
  /** 不给 = 这张卡没有「挂载」（例如只能在 Civitai 站内出图的）。 */
  onMount?: () => void
}

/**
 * 库 B 的一格（lora-library.md §3）：只有封面、名字、一行元信息。
 *
 * ⭐ 点卡开详情 = 垫在最底下、铺满整格的一颗按钮；「挂载」浮在封面右下（悬停 /
 *   键盘进到这一格才出现），与它是两颗按钮 —— ⛔ 按钮套按钮，读屏与 Tab 序都会乱。
 * ⭐ 挂了留在原地：键变黑「✓ 已挂载」，封面右上一个 ✓；⛔ toast、⛔ 跳页。
 * ⚠ 封面先铺平均色、真图解码好了再由糊变清（200）；⛔ 灰骨架一闪。
 */
export function LoraLibraryTile({
  name,
  meta,
  coverUrl,
  coverColor,
  mounted,
  mounting = false,
  onOpen,
  onMount,
}: LoraLibraryTileProps) {
  const t = useTranslations('LoraWorkbench.browse')
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const loaded = coverUrl !== null && loadedUrl === coverUrl
  const coverStyle = coverColor
    ? ({ backgroundColor: coverColor } as CSSProperties)
    : undefined

  return (
    <div className="group relative flex min-w-0 flex-col gap-1.5">
      {/* 整格就是「打开详情」：铺满的一颗按钮垫在最底下。 */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={name}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      />
      {/* 封面整块不接指针（点它落到下面那颗「打开」上），只有「挂载」接。 */}
      <span
        style={coverStyle}
        className="pointer-events-none relative block aspect-3/4 overflow-hidden rounded-xl bg-muted transition-shadow duration-fast ease-linear group-hover:shadow-float"
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setLoadedUrl(coverUrl)}
            className={cn(
              'absolute inset-0 size-full object-cover transition-[filter,scale,opacity] duration-base ease-standard motion-reduce:transition-none',
              loaded ? 'opacity-100' : 'scale-118 opacity-0 blur-md',
            )}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Sparkles className="size-6" aria-hidden />
          </span>
        )}
        {mounted ? (
          <span
            role="img"
            aria-label={t('mounted')}
            className="absolute right-2 top-2 grid size-5.5 animate-in place-items-center rounded-full bg-background/95 text-status-applied fade-in duration-base"
          >
            <Check className="size-3" aria-hidden />
          </span>
        ) : null}
        {onMount ? (
          <button
            type="button"
            onClick={() => {
              if (!mounted && !mounting) onMount()
            }}
            aria-disabled={mounted || mounting || undefined}
            aria-busy={mounting || undefined}
            aria-label={
              mounted ? t('mountedLabel', { name }) : t('mountLabel', { name })
            }
            className={cn(
              'pointer-events-auto absolute bottom-2 right-2 inline-flex h-7 items-center gap-1 rounded-full px-2.75 text-xs font-semibold shadow-md transition-[opacity,translate,background-color,color] ease-standard',
              'translate-y-1 opacity-0 duration-base group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:translate-y-0',
              mounted
                ? 'cursor-default bg-foreground text-background'
                : 'bg-background/95 text-foreground hover:bg-background',
              mounting && 'opacity-70',
            )}
          >
            {mounted ? (
              <Check className="size-3" aria-hidden />
            ) : (
              <Plus className="size-3" aria-hidden />
            )}
            {mounted ? t('mounted') : t('mount')}
          </button>
        ) : null}
      </span>
      <b className="pointer-events-none truncate text-2sm font-semibold leading-4.25 text-foreground">
        {name}
      </b>
      <small className="pointer-events-none truncate font-mono text-2xs text-muted-foreground">
        {meta}
      </small>
    </div>
  )
}
