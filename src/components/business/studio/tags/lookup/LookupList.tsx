'use client'

import Image from 'next/image'

import type { DanbooruCatalogKind } from '@/types/danbooru-catalog'
import { Check, ChevronRight, ExternalLink } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * 查资料左栏（owner 2026-09-27 查资料 B）：一行一个候选；角色行头上一张小样图，
 * 别的页行尾三张。
 * ⚠ 行底色 120ms 线性：选中 4%、悬停 7%（动效表）。
 */
export interface LookupRowView {
  name: string
  label: string
  sub: string
  previews: readonly string[]
  added?: boolean
  selected: boolean
}

export function LookupRows({
  kind,
  rows,
  addedLabel,
  phone,
  contained,
  onPick,
}: {
  kind: DanbooruCatalogKind
  rows: readonly LookupRowView[]
  /** 装在外面的滚动区里（收藏页几段同滚），自己不滚。 */
  contained?: boolean
  addedLabel: string
  phone?: boolean
  onPick: (name: string) => void
}) {
  return (
    <ul
      className={cn(
        '-mx-1.5 flex flex-col gap-0.5 pb-1',
        !contained && 'min-h-0 flex-1 overflow-y-auto',
      )}
    >
      {rows.map((row, index) => (
        <li
          key={row.name}
          className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-slow ease-standard motion-reduce:animate-none"
          // 30ms 一档错开，最多错 8 行（动效表）。
          style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
        >
          <button
            type="button"
            aria-current={row.selected ? 'true' : undefined}
            onClick={() => onPick(row.name)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors duration-fast ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              phone && 'min-h-14',
              row.selected
                ? 'bg-surface-fill'
                : 'hover:bg-surface-fill-hover active:bg-surface-fill-hover',
            )}
          >
            {kind === 'character' ? (
              <Thumb url={row.previews[0]} className="size-11 rounded-lg" />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-2sm font-semibold text-foreground">
                {row.label}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.sub}
              </span>
            </span>
            {row.added ? (
              <span className="flex shrink-0 animate-in items-center gap-0.5 text-2xs font-semibold text-foreground fade-in-0 duration-base ease-linear motion-reduce:animate-none">
                {addedLabel}
                <Check className="size-3" aria-hidden />
              </span>
            ) : null}
            {kind !== 'character' ? (
              <span className="grid shrink-0 grid-cols-3 gap-0.75">
                {[0, 1, 2].map((slot) => (
                  <Thumb
                    key={slot}
                    url={row.previews[slot]}
                    className="h-10 w-7.5 rounded-md"
                  />
                ))}
              </span>
            ) : null}
            {phone && kind === 'character' ? (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground/70"
                aria-hidden
              />
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 一张缩略样图；没有就是一块浅底（⛔ 不画破图标）。 */
function Thumb({ url, className }: { url?: string; className: string }) {
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden bg-muted',
        className,
      )}
    >
      {url ? (
        <Image
          unoptimized
          src={url}
          alt=""
          fill
          sizes="48px"
          className="object-cover object-top"
        />
      ) : null}
    </span>
  )
}

/** 搜索中：五行骨架，1.4s 呼吸（与模板 C 骨架同一档）。 */
export function LookupSkeletonRows({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="-mx-1.5 flex flex-col gap-0.5"
    >
      {['w-3/5', 'w-1/2', 'w-2/3', 'w-2/5', 'w-3/5'].map((width, index) => (
        <div key={index} className="flex h-14 items-center gap-3 p-1.5">
          <span className="size-11 shrink-0 rounded-lg bg-muted" />
          <span className="flex flex-1 flex-col gap-1.75">
            <span className={cn('h-2.75 rounded-sm bg-muted', width)} />
            <span className="h-2.25 w-1/3 rounded-sm bg-muted" />
          </span>
        </div>
      ))}
    </div>
  )
}

/** 左栏里一句话的那几种状态：查不到 · 其实在另一页 · 出错。 */
export function LookupSay({
  title,
  text,
  action,
  link,
}: {
  title: string
  text: string
  action?: { label: string; onClick: () => void }
  link?: { label: string; href: string }
}) {
  return (
    <div
      role="status"
      className="flex animate-in flex-col items-start gap-1.5 px-0.5 pt-2.5 fade-in-0 duration-base ease-linear motion-reduce:animate-none"
    >
      <b className="text-sm font-semibold text-foreground">{title}</b>
      <span className="text-xs leading-5 text-muted-foreground">{text}</span>
      {action ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={action.onClick}
        >
          {action.label}
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      ) : null}
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground"
        >
          {link.label}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  )
}
