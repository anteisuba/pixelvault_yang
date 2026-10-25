'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronRight, ImageIcon } from '@/components/icons'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'

export type LoraSourceBandMode = 'hidden' | 'line' | 'open'

export interface LoraSourceBandGroup {
  readonly id: string
  readonly name: string
  /** 这把 LoRA 的封面；没有时画一格占位。 */
  readonly cover: string | null
}

interface LoraSourceBandProps {
  /** `hidden` = 没挂 LoRA；`line` = 顶上那一行；`open` = 从那一行长出来的浮层。 */
  mode: LoraSourceBandMode
  onExpand: () => void
  onFold: () => void
  /** 浮层开着时点外面 / Esc 收回；样例大图开着时交给大图（不收）。 */
  dismissible?: boolean
  groups: readonly LoraSourceBandGroup[]
  activeGroupId: string | null
  onSelectGroup: (id: string) => void
  /** 当前那组出过几张；还在取的时候是 `null`。 */
  count: number | null
  /** 那一行左边的三张小圆图。 */
  lineThumbs: readonly string[]
  /** 浮层里的内容（缩略图排 / 样例与提示词 / 没有样例那一句）。 */
  children: ReactNode
}

/**
 * 台面顶上一行（ui-spec ㊲）：「水彩 v3 出过的图 24 ›」，左边三张小圆图；点它从这一行
 * 长出浮层（分组 + 张数 + 缩略图；10-25 用户嫌字多，去掉标题和提示句），盖在下面的图上（⛔ 推图），点外面 / Esc 收回。
 *
 * ⭐ 长出 = 下落 8px + 0.96 放大 + 由糊变清；收回反过来。看不见时挂 `inert`。
 */
export function LoraSourceBand({
  mode,
  onExpand,
  onFold,
  dismissible = true,
  groups,
  activeGroupId,
  onSelectGroup,
  count,
  lineThumbs,
  children,
}: LoraSourceBandProps) {
  const t = useTranslations('LoraWorkbench.generate.band')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const floating = mode === 'open'
  useEffect(() => {
    if (!floating || !dismissible) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) onFold()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFold()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [dismissible, floating, onFold])

  if (mode === 'hidden') return null

  const activeName =
    groups.find((group) => group.id === activeGroupId)?.name ??
    groups[0]?.name ??
    ''

  return (
    <div
      ref={wrapperRef}
      data-testid="lora-source-band"
      data-mode={mode}
      className="relative z-20 min-w-0"
    >
      <button
        type="button"
        onClick={floating ? onFold : onExpand}
        aria-expanded={floating}
        className={cn(
          'flex h-9 max-w-full items-center gap-2 rounded-full bg-muted pr-3 pl-1.5 text-2sm text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus',
          floating && 'bg-fill-strong',
        )}
      >
        {lineThumbs.length > 0 ? (
          <span className="flex shrink-0 items-center">
            {lineThumbs.slice(0, 3).map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className={cn(
                  'size-6 shrink-0 rounded-full bg-muted object-cover ring-2 ring-muted',
                  index > 0 && '-ml-2',
                )}
              />
            ))}
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          {count === 0
            ? t('lineEmpty', { name: activeName })
            : t('lineTitle', { name: activeName })}
        </span>
        {count ? (
          <b className="shrink-0 font-semibold tabular-nums text-foreground">
            {count}
          </b>
        ) : null}
        <ChevronRight
          className={cn(
            'size-3 shrink-0 transition-transform duration-base ease-standard motion-reduce:transition-none',
            floating && 'rotate-90',
          )}
          aria-hidden
        />
      </button>

      <div
        role="dialog"
        aria-label={t('title')}
        aria-hidden={!floating}
        inert={!floating}
        data-testid="lora-source-band-overlay"
        className={cn(
          'absolute top-full left-0 mt-1.5 flex w-full min-w-120 origin-top-left flex-col gap-2.5 rounded-16 bg-popover px-4 pt-3.5 pb-4 shadow-pop transition-[opacity,translate,scale,filter] duration-base ease-standard motion-reduce:transition-opacity',
          floating
            ? 'translate-y-0 scale-100 opacity-100 blur-none'
            : 'pointer-events-none -translate-y-2 scale-96 opacity-0 blur-xs',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* 分组 = 挂着的那几把，靠封面认（名字常常很长、截掉一半）；选中的那一格浅底。 */}
          <div
            role="group"
            aria-label={t('groupsLabel')}
            className="lora-scrollbar-hide flex min-w-0 gap-1 overflow-x-auto"
          >
            {groups.map((group) => {
              const active = group.id === (activeGroupId ?? groups[0]?.id)
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={active}
                  title={group.name}
                  onClick={() => onSelectGroup(group.id)}
                  className={cn(
                    'inline-flex h-7 max-w-44 shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {group.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyCivitaiImageUrl(group.cover)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        'size-6 shrink-0 rounded-full bg-muted object-cover transition-opacity duration-fast',
                        !active && 'opacity-70',
                      )}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                    >
                      <ImageIcon className="size-3" />
                    </span>
                  )}
                  <span className="min-w-0 truncate">{group.name}</span>
                </button>
              )
            })}
          </div>
          {count !== null ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t('groupCount', { count })}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
