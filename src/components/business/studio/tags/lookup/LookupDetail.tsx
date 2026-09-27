'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'

import { Check, ExternalLink } from '@/components/icons'
import { cn } from '@/lib/utils'

/**
 * 查资料右栏（owner 2026-09-27 查资料 B）：选中那一个的详情，常驻不返回。
 * 角色 = 三张样图 + 要加入的标签（点选）+ 加到哪 + 加入；
 * 画师 = 三张样图 + 常画的（只是参考）+ 加入 artist:名字。
 */

export interface LookupShot {
  id: number
  url: string
  alt: string
  href: string
}

/**
 * 三张样图；点开 Danbooru 原帖。
 * ⭐ 图**整张看得见**（owner 2026-09-27「预览图看不全」，与参考图「等比、不裁切」同一条）：
 *   桌面每张按自己的比例放在三分之一宽里、居中，⛔ 铺满裁切，也⛔ 塞进灰框缩成小图。
 *   这一排最高 240（与画板里三个 4:3 框同高），屏幕稍矮时整排等比缩 —— 下面的标签那一段
 *   有保底高度，⛔ 把要点的标签挤到看不见；再矮（`short:`）就和标签左右排，占左半、
 *   高度撑满（owner 选「矮屏左右排」）。
 * 手机是一条横滑的 3:4 框（竖图正好铺满，横图上下留浅底）。
 */
export function LookupShots({
  shots,
  phone,
}: {
  shots: readonly LookupShot[]
  phone?: boolean
}) {
  const slots = [0, 1, 2]
  if (phone) {
    return (
      <div className="-mx-3 flex shrink-0 gap-2 overflow-x-auto px-3 pb-0.5">
        {slots.map((slot) => {
          const shot = shots[slot]
          const box =
            'relative block aspect-3/4 w-37 shrink-0 overflow-hidden rounded-xl bg-muted'
          return shot ? (
            <a
              key={shot.id}
              href={shot.href}
              target="_blank"
              rel="noreferrer"
              className={cn(
                box,
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Image
                unoptimized
                src={shot.url}
                alt={shot.alt}
                fill
                sizes="148px"
                className="object-contain"
              />
            </a>
          ) : (
            <span key={`empty-${slot}`} className={box} aria-hidden />
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex h-60 min-h-0 shrink gap-2 short:h-auto short:w-1/2">
      {slots.map((slot) => {
        const shot = shots[slot]
        return shot ? (
          <a
            key={shot.id}
            href={shot.href}
            target="_blank"
            rel="noreferrer"
            // 矮屏左右排时贴顶，与右边「要加入的标签」同一条顶边。
            className="flex h-full min-w-0 flex-1 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring short:items-start"
          >
            {/* ⚠ 不用 next/image 的 fill：要的是图自己的比例，不是一个固定框 —— 图框就是图，
                圆角才落在图上。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.url}
              alt={shot.alt}
              className="max-h-full max-w-full animate-in rounded-xl fade-in-0 duration-base ease-linear motion-reduce:animate-none"
            />
          </a>
        ) : (
          <span key={`empty-${slot}`} className="min-w-0 flex-1" aria-hidden />
        )
      })}
    </div>
  )
}

/**
 * 名字那一块：标题 + 类别小签 + Danbooru 直链，下面两行灰字。
 * 矮屏（`short:`）收成一行：名字 · 类别 · 第一行灰字，其余几行不画（让给样图与标签）。
 */
export function LookupHead({
  title,
  kind,
  lines,
  link,
  mono,
}: {
  title: string
  kind: string
  lines: readonly string[]
  link: { label: string; href: string; aria: string }
  mono?: boolean
}) {
  return (
    <div className="flex shrink-0 items-start gap-3.5 short:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 short:flex-row short:items-center short:gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span
            className={cn(
              'truncate font-semibold tracking-tight text-foreground',
              mono ? 'font-mono text-lg' : 'text-xl',
            )}
          >
            {title}
          </span>
          <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.75 text-2xs font-semibold text-foreground/75">
            {kind}
          </span>
        </div>
        {lines
          .filter((line) => line.length > 0)
          .map((line, index) => (
            <span
              key={line}
              className={cn(
                'truncate text-xs leading-5 text-muted-foreground',
                index > 0 && 'short:hidden',
              )}
            >
              {line}
            </span>
          ))}
      </div>
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        aria-label={link.aria}
        className="mt-1.5 inline-flex shrink-0 items-center gap-1 text-xs text-foreground/75 hover:text-foreground short:mt-0"
      >
        {link.label}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  )
}

/** 一小段的标题 + 灰色补一句。 */
export function LookupSection({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2 text-xs font-semibold text-foreground/80">
        {title}
        <span className="font-normal text-muted-foreground/70">{hint}</span>
      </div>
      {children}
    </section>
  )
}

/** 角色的一格标签：白底描边 ↔ 黑底白字（120ms 线性），小字是出现次数。 */
export function LookupTagToggle({
  text,
  count,
  on,
  main,
  phone,
  onToggle,
}: {
  text: string
  count: string | null
  on: boolean
  main?: boolean
  phone?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap transition-colors duration-fast ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        phone ? 'h-9 px-3.25 text-sm' : 'h-7.5 px-2.75 text-xs',
        main && 'font-semibold',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-foreground hover:border-foreground/30',
      )}
    >
      {text}
      {count ? (
        <small
          className={cn(
            'font-mono text-3xs tabular-nums',
            on ? 'text-background/60' : 'text-muted-foreground/70',
          )}
        >
          {count}
        </small>
      ) : null}
    </button>
  )
}

/** 画师「常画的」：只是参考，⛔ 不是按钮。 */
export function LookupRef({ text, count }: { text: string; count: string }) {
  return (
    <span className="inline-flex h-6.5 items-center gap-1.25 rounded-lg bg-muted px-2.25 text-xs whitespace-nowrap text-foreground/80">
      {text}
      <small className="font-mono text-3xs tabular-nums text-muted-foreground/70">
        {count}
      </small>
    </span>
  )
}

/**
 * 加入键：36px 黑色胶囊；加进去之后 1.2s 写「已加进整体 ✓」（浅底黑字），
 * 画风那一颗是开关、加入后一直停在「已加入 ✓」。
 */
export function LookupAddButton({
  label,
  done,
  disabled,
  phone,
  onClick,
}: {
  label: string
  done: boolean
  disabled?: boolean
  phone?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors duration-base ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default motion-reduce:transition-none',
        phone ? 'h-11 w-full px-4 text-sm' : 'h-9 min-w-33 px-4 text-2sm',
        disabled
          ? 'bg-muted text-muted-foreground/70'
          : done
            ? 'bg-muted text-foreground'
            : 'bg-foreground text-background hover:bg-foreground/85',
      )}
    >
      {label}
      {done ? <Check className="size-3.5" aria-hidden /> : null}
    </button>
  )
}

/** 右栏骨架：名字两行、三张样图、一排标签，1.4s 呼吸。 */
export function LookupDetailSkeleton({ label }: { label: string }) {
  const bar =
    'block animate-skeleton-breathe rounded-md bg-muted motion-reduce:animate-none'
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col gap-3.5"
    >
      <div className="flex flex-col gap-2">
        <span className={cn(bar, 'h-5 w-2/5')} />
        <span className={cn(bar, 'h-2.75 w-1/4')} />
        <span className={cn(bar, 'h-2.75 w-1/2 short:hidden')} />
      </div>
      {/* 与详情同一个矮屏布局（样图占左半、标签在右），加载完 ⛔ 跳一下。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 short:flex-row short:gap-6">
        <div className="grid aspect-4/1 min-h-0 shrink grid-cols-3 gap-2 short:aspect-auto short:w-1/2">
          {[0, 1, 2].map((slot) => (
            <span key={slot} className={cn(bar, 'h-full rounded-xl')} />
          ))}
        </div>
        <div className="flex flex-wrap content-start gap-1.5 short:flex-1">
          {['w-24', 'w-20', 'w-22', 'w-18', 'w-28', 'w-21'].map((width) => (
            <span
              key={width}
              className={cn(bar, 'h-7.5 rounded-full', width)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** 右栏还没东西：还没搜时画三块淡淡的占位 + 一句会出现什么。 */
export function LookupBlank({
  text,
  ghosts,
}: {
  text?: string
  ghosts?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center text-xs text-muted-foreground/70">
      {ghosts ? (
        <div className="grid grid-cols-3 gap-1.5 opacity-60" aria-hidden>
          {[0, 1, 2].map((slot) => (
            <span key={slot} className="aspect-4/3 w-22 rounded-lg bg-muted" />
          ))}
        </div>
      ) : null}
      {text ? <span>{text}</span> : null}
    </div>
  )
}
