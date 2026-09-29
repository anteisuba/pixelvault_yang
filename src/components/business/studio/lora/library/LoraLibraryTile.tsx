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
  coverPending = false,
  mountChooses = false,
  agentPick = false,
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
        className={cn(
          'pointer-events-none relative block aspect-3/4 overflow-hidden rounded-xl bg-muted ring-offset-2 ring-offset-card transition-[box-shadow] duration-base ease-linear group-hover:shadow-float motion-reduce:transition-none',
          agentPick ? 'ring-2 ring-foreground' : 'ring-0 ring-transparent',
        )}
      >
        {agentPick ? (
          <span className="absolute left-2 top-2 z-10 inline-flex h-5.5 animate-in items-center gap-1 rounded-full bg-foreground/85 pl-1 pr-2 text-2xs font-semibold text-background fade-in duration-base motion-reduce:animate-none">
            <Sparkles className="size-3" aria-hidden />
            {t('agentPick')}
          </span>
        ) : null}
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
        ) : coverPending ? null : (
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
              mounted
                ? t('mountedLabel', { name })
                : mountChooses
                  ? t('mountChooseLabel', { name })
                  : t('mountLabel', { name })
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
            {mounted
              ? t('mounted')
              : mountChooses
                ? t('mountChoose')
                : t('mount')}
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
