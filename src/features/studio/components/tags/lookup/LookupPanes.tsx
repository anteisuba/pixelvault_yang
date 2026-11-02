'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { DURATION_MS } from '@/constants/motion'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
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

/**
 * 角色 / 作品 / 特征详情：样图 · Wiki 那一段 · 要加入的标签 · 加到哪 + 加入。
 * 没有 `addBar`（标签库没开标签台）：标签只是参考，⛔ 点选。
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
  tags: readonly { name: string; count: string | null; main: boolean }[]
  chosen: readonly string[]
  onToggle: (name: string) => void
  texts: {
    tagsTitle: string
    tagsHint: string
    note: string
    addTo: string
    targets: string
    noComposition: string
    whole: string
  }
  addBar: TagPaneAddBar | null
}) {
  const body = (
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
      <span className="text-2xs leading-4.5 text-muted-foreground/70">
        {texts.note}
      </span>
    </LookupSection>
  )
  const where = !addBar ? null : addBar.composition ? (
    <LiquidSegmented
      ariaLabel={texts.targets}
      value={addBar.targetValue}
      onChange={addBar.onTarget}
      items={addBar.targetItems}
    />
  ) : (
    <span className="truncate text-xs text-muted-foreground">
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
                  className="text-xs leading-5 text-muted-foreground"
                >
                  {line}
                </span>
              ))}
          </div>
          {about ? <LookupAbout text={about} /> : null}
          {body}
        </div>
        {addBar ? (
          <div className="flex shrink-0 flex-col gap-2.5 border-t border-border/60 pt-2.5">
            <div className="flex items-center gap-2.5 overflow-x-auto">
              <span className="shrink-0 text-xs font-semibold text-foreground/80">
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
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <LookupHead
        title={title}
        kind={kind}
        favorite={favorite}
        lines={lines}
        link={link}
      />
      {about ? <LookupAbout text={about} /> : null}
      {/* 样图在上、标签在下；屏幕矮（`short:`）就左右排（owner 选「矮屏左右排」）。
          ⚠ 标签至少留两行的高：稍矮时让样图缩（`LookupShots`），⛔ 把标签挤没。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 short:flex-row short:gap-6">
        <LookupShots shots={shots} />
        <div className="flex min-h-28 flex-1 flex-col gap-2.5 overflow-y-auto short:min-h-0">
          {body}
        </div>
      </div>
      {addBar ? (
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="shrink-0 text-xs font-semibold text-foreground/80">
            {texts.addTo}
          </span>
          <div className="min-w-0 overflow-x-auto">{where}</div>
          <span className="flex-1" />
          <LookupAddButton {...addBar.add} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * 画风详情（画师 / 画法）：样图 · Wiki 那一段 · 常画的 / 常一起出现的（只是参考）·
 * 加入（开关）。没有 `add`（标签库没开标签台）就只看。
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
  refs: readonly { text: string; count: string }[]
  texts: {
    refsTitle: string
    refsHint: string
    addTo: string
    whole: string
    where: string
  }
  add: PaneAdd | null
}) {
  const body = (
    <LookupSection title={texts.refsTitle} hint={texts.refsHint}>
      <div className="flex flex-wrap content-start gap-1.5">
        {refs.map((ref) => (
          <LookupRef key={ref.text} text={ref.text} count={ref.count} />
        ))}
      </div>
    </LookupSection>
  )
  const where = (
    <span className="truncate text-xs text-muted-foreground">
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
                className="text-xs leading-5 text-muted-foreground"
              >
                {line}
              </span>
            ))}
          </div>
          {about ? <LookupAbout text={about} /> : null}
          {body}
        </div>
        {add ? (
          <div className="flex shrink-0 flex-col gap-2.5 border-t border-border/60 pt-2.5">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-xs font-semibold text-foreground/80">
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
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <LookupHead
        title={title}
        kind={kind}
        favorite={favorite}
        lines={lines}
        link={link}
        mono
      />
      {about ? <LookupAbout text={about} /> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 short:flex-row short:gap-6">
        <LookupShots shots={shots} />
        <div className="flex min-h-28 flex-1 flex-col gap-2.5 overflow-y-auto short:min-h-0">
          {body}
        </div>
      </div>
      {add ? (
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="shrink-0 text-xs font-semibold text-foreground/80">
            {texts.addTo}
          </span>
          {where}
          <span className="flex-1" />
          <LookupAddButton {...add} />
        </div>
      ) : null}
    </div>
  )
}
