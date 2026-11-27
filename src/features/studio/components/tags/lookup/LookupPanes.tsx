'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { Check } from '@/components/icons'
import { DURATION_MS } from '@/constants/motion'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { cn } from '@/lib/utils'
import {
  LookupAbout,
  LookupAddButton,
  LookupHead,
  LookupRef,
  LookupSection,
  LookupShots,
  LookupTagToggle,
  type LookupShot,
} from './LookupDetail'

/**
 * 换内容：旧的 120ms 淡出，新的 200ms 淡入（⛔ 不左右滑，动效表）。
 * 减少动态效果时直切 —— 连退场都不等。
 */
export function FadeSwap({
  swapKey,
  reduced,
  className,
  children,
}: {
  swapKey: string
  reduced: boolean
  className: string
  children: ReactNode
}) {
  if (reduced) {
    return (
      <div key={swapKey} className={className}>
        {children}
      </div>
    )
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          transition: { duration: DURATION_MS.base / 1000, ease: 'linear' },
        }}
        exit={{
          opacity: 0,
          transition: { duration: DURATION_MS.fast / 1000, ease: 'linear' },
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export interface PaneFavorite {
  on: boolean
  label: string
  onToggle: () => void
}

export interface PaneAdd {
  label: string
  done: boolean
  disabled: boolean
  onClick: () => void
}

/**
 * 加到哪 + 加入那一条（只有标签台开着才有 —— 标签库没开台时只能看、收藏）。
 */
export interface TagPaneAddBar {
  composition: boolean
  targetValue: string
  targetItems: readonly { value: string; label: string }[]
  onTarget: (value: string) => void
  add: PaneAdd
}

export interface TagPaneItem {
  name: string
  count: string | null
  ratio: number | null
  localName?: string | null
  main: boolean
}

export interface StylePaneRefItem {
  text: string
  localName?: string | null
  count: string
  ratio: number
}

/**
 * 角色 / 作品 / 特征详情（图二方案 B）：
 * 桌面为「中栏 2×2 满高大图墙 + 右栏独立特征选词面板（中文释义 + 共现率进度条 + 一键全选 ≥50% + 吸底加入）」，
 * 窄容器自动退回上下叠排；手机维持原有简洁纵向形态。
 */
export function TagPane({
  phone,
  title,
  kind,
  favorite,
  lines,
  about,
  link,
  shots,
  tags,
  chosen,
  consensusAction,
  onToggle,
  texts,
  addBar,
}: {
  phone: boolean
  title: string
  kind: string
  favorite: PaneFavorite | null
  lines: readonly string[]
  about?: string | null
  link: { label: string; href: string; aria: string }
  shots: readonly LookupShot[]
  tags: readonly TagPaneItem[]
  chosen: readonly string[]
  consensusAction?: {
    label: string
    active: boolean
    onClick: () => void
  } | null
  onToggle: (name: string) => void
  texts: {
    tagsTitle: string
    tagsHint: string
    addTo: string
    targets: string
    noComposition: string
    whole: string
  }
  addBar: TagPaneAddBar | null
}) {
  const phoneBody = (
    <LookupSection
      title={texts.tagsTitle}
      hint={addBar ? texts.tagsHint : undefined}
    >
      <div className="flex flex-wrap content-start gap-1.5">
        {tags.map((tag) =>
          addBar ? (
            <LookupTagToggle
              key={tag.name}
              text={tag.name.replaceAll('_', ' ')}
              count={tag.count}
              main={tag.main}
              on={chosen.includes(tag.name)}
              phone={phone}
              onToggle={() => onToggle(tag.name)}
            />
          ) : tag.main ? null : (
            <LookupRef
              key={tag.name}
              text={tag.name.replaceAll('_', ' ')}
              count={tag.count ?? ''}
            />
          ),
        )}
      </div>
    </LookupSection>
  )
  const where = !addBar ? null : addBar.composition ? (
    <LiquidSegmented
      // ui-spec §9 TagPicker：「加到」是小号切换条。
      size="row"
      ariaLabel={texts.targets}
      value={addBar.targetValue}
      onChange={addBar.onTarget}
      items={addBar.targetItems}
    />
  ) : (
    <span className="truncate text-2xs text-muted-foreground">
      <b className="font-semibold text-foreground">{texts.whole}</b>
      {' · '}
      {texts.noComposition}
    </span>
  )

  if (phone) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <LookupShots shots={shots} phone />
          <div className="flex flex-col gap-0.5">
            {lines
              .filter((line) => line.length > 0)
              .map((line) => (
                <span
                  key={line}
                  className="text-2xs leading-5 text-muted-foreground"
                >
                  {line}
                </span>
              ))}
          </div>
          {about ? <LookupAbout text={about} /> : null}
          {phoneBody}
        </div>
        {addBar ? (
          <div className="flex shrink-0 flex-col gap-2.5 border-t border-border/60 pt-2.5">
            <div className="-my-1 flex items-center gap-2.5 overflow-x-auto py-1">
              <span className="shrink-0 text-2xs font-semibold text-foreground/80">
                {texts.addTo}
              </span>
              {where}
            </div>
            <LookupAddButton phone {...addBar.add} />
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-3">
      <LookupHead
        title={title}
        kind={kind}
        favorite={favorite}
        lines={lines}
        link={link}
      />
      {about ? <LookupAbout text={about} /> : null}

      {/* 图二方案 B：中栏 2×2 满高样图墙 + 右栏独立特征选词与操作面板 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.35fr)_minmax(248px,0.95fr)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <LookupShots shots={shots} />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col gap-2.5 rounded-16 bg-surface-companion p-3 ring-1 ring-inset ring-border/60">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="truncate text-2xs font-semibold text-foreground/85">
              {texts.tagsTitle}
            </span>
            {consensusAction ? (
              <button
                type="button"
                onClick={consensusAction.onClick}
                className={cn(
                  'touch-target-y shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                  consensusAction.active
                    ? 'bg-foreground text-background'
                    : 'bg-card text-foreground/80 shadow-seg hover:text-foreground',
                )}
              >
                {consensusAction.label}
              </button>
            ) : null}
          </div>

          <div className="studio-subtle-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto pr-0.5">
            {tags.map((tag) => {
              const display = tag.name.replaceAll('_', ' ')
              const pct =
                tag.ratio !== null ? Math.round(tag.ratio * 100) : null
              if (!addBar) {
                if (tag.main) return null
                return (
                  <div
                    key={tag.name}
                    title={tag.count ?? undefined}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 text-2xs ring-1 ring-inset ring-border/60"
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span className="truncate font-medium text-foreground">
                        {display}
                      </span>
                      {tag.localName ? (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {tag.localName}
                        </span>
                      ) : null}
                    </span>
                    {pct !== null ? (
                      <CooccurrenceMeter pct={pct} inverted={false} />
                    ) : null}
                  </div>
                )
              }

              const on = chosen.includes(tag.name)
              return (
                <button
                  key={tag.name}
                  type="button"
                  aria-pressed={on}
                  title={tag.count ?? undefined}
                  onClick={() => onToggle(tag.name)}
                  className={cn(
                    'touch-target-y flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-2xs transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus',
                    on
                      ? 'bg-foreground text-background'
                      : 'bg-card text-foreground ring-1 ring-inset ring-border/65 hover:bg-muted/70',
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span
                      className={cn('truncate', tag.main && 'font-semibold')}
                    >
                      {display}
                    </span>
                    {!tag.main && tag.localName ? (
                      <span
                        className={cn(
                          'truncate text-[11px]',
                          on ? 'text-background/70' : 'text-muted-foreground',
                        )}
                      >
                        {tag.localName}
                      </span>
                    ) : null}
                  </span>
                  {tag.main ? (
                    on ? (
                      <Check
                        className="size-3.5 shrink-0 text-background"
                        aria-hidden
                      />
                    ) : null
                  ) : pct !== null ? (
                    <CooccurrenceMeter pct={pct} inverted={on} />
                  ) : null}
                </button>
              )
            })}
          </div>

          {addBar ? (
            <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 pt-2.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-2xs font-semibold text-foreground/80">
                  {texts.addTo}
                </span>
                <div className="scrollbar-none -my-1 min-w-0 overflow-x-auto py-1">
                  {where}
                </div>
              </div>
              <LookupAddButton fullWidth {...addBar.add} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function CooccurrenceMeter({
  pct,
  inverted,
}: {
  pct: number
  inverted: boolean
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-10 overflow-hidden rounded-full',
          inverted ? 'bg-background/25' : 'bg-fill-strong',
        )}
      >
        <span
          className={cn(
            'block h-full rounded-full',
            inverted ? 'bg-background/85' : 'bg-foreground/55',
          )}
          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
        />
      </span>
      <span
        className={cn(
          'w-7 text-right font-mono text-[10.5px] tabular-nums',
          inverted ? 'text-background/75' : 'text-muted-foreground',
        )}
      >
        {pct}%
      </span>
    </span>
  )
}

/**
 * 画风详情（画师 / 画法，图二方案 B 同构分屏）：左 2×2 画风大样图墙 + 右常画参考与加入按钮。
 */
export function StylePane({
  phone,
  title,
  kind,
  favorite,
  lines,
  about,
  link,
  shots,
  refs,
  texts,
  add,
}: {
  phone: boolean
  title: string
  kind: string
  favorite: PaneFavorite | null
  lines: readonly string[]
  about?: string | null
  link: { label: string; href: string; aria: string }
  shots: readonly LookupShot[]
  refs: readonly StylePaneRefItem[]
  texts: {
    refsTitle: string
    refsHint: string
    addTo: string
    whole: string
    where: string
  }
  add: PaneAdd | null
}) {
  const phoneBody = (
    <LookupSection title={texts.refsTitle} hint={texts.refsHint}>
      <div className="flex flex-wrap content-start gap-1.5">
        {refs.map((ref) => (
          <LookupRef key={ref.text} text={ref.text} count={ref.count} />
        ))}
      </div>
    </LookupSection>
  )
  const where = (
    <span className="truncate text-2xs text-muted-foreground">
      <b className="font-semibold text-foreground">{texts.whole}</b>
      {' · '}
      {texts.where}
    </span>
  )

  if (phone) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <LookupShots shots={shots} phone />
          <div className="flex flex-col gap-0.5">
            {lines.map((line) => (
              <span
                key={line}
                className="text-2xs leading-5 text-muted-foreground"
              >
                {line}
              </span>
            ))}
          </div>
          {about ? <LookupAbout text={about} /> : null}
          {phoneBody}
        </div>
        {add ? (
          <div className="flex shrink-0 flex-col gap-2.5 border-t border-border/60 pt-2.5">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-2xs font-semibold text-foreground/80">
                {texts.addTo}
              </span>
              {where}
            </div>
            <LookupAddButton phone {...add} />
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-3">
      <LookupHead
        title={title}
        kind={kind}
        favorite={favorite}
        lines={lines}
        link={link}
        mono
      />
      {about ? <LookupAbout text={about} /> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.35fr)_minmax(248px,0.95fr)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <LookupShots shots={shots} />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col gap-2.5 rounded-16 bg-surface-companion p-3 ring-1 ring-inset ring-border/60">
          <div className="flex shrink-0 flex-col gap-0.5">
            <span className="text-2xs font-semibold text-foreground/85">
              {texts.refsTitle}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {texts.refsHint}
            </span>
          </div>

          <div className="studio-subtle-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto pr-0.5">
            {refs.map((ref) => (
              <div
                key={ref.text}
                title={ref.count}
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 text-2xs ring-1 ring-inset ring-border/60"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="truncate font-medium text-foreground">
                    {ref.text}
                  </span>
                  {ref.localName ? (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {ref.localName}
                    </span>
                  ) : null}
                </span>
                <CooccurrenceMeter
                  pct={Math.round(ref.ratio * 100)}
                  inverted={false}
                />
              </div>
            ))}
          </div>

          {add ? (
            <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 pt-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-2xs font-semibold text-foreground/80">
                  {texts.addTo}
                </span>
                {where}
              </div>
              <LookupAddButton fullWidth {...add} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
