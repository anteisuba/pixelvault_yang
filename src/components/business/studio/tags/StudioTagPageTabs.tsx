'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { springTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'
import { MoreHorizontal, Plus } from '@/components/icons'
import { ConfirmDeleteButton } from '@/components/ui/feedback-button'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { Switch } from '@/components/ui/switch'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverBaseClass,
  studioToolSurfaceMobileClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'

export interface StudioTagPageTab {
  /** 这一页有几格标签（页签上那个灰色小数）。 */
  readonly count: number
  /** 停用的角色（这次不出场）：页签变淡。 */
  readonly enabled?: boolean
  /** 查资料刚往这一位里加了标签：数字前亮一下小点。 */
  readonly flashing?: boolean
}

const tabClass =
  'relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-2xs whitespace-nowrap transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none'

/**
 * 标签台 A 的那一排页签（owner 2026-10-09「一个框 + 一排页签」）：
 * `整体 n · 角色 1 n ⋯ · 角色 2 n · ＋ ………… 负向 n`。
 *
 * - 下面那个框只放当前这一页的标签；换页 = 同一个框换内容。
 * - 选中底块是**同一个元素滑过去**（layoutId），⛔ 不是每格各自淡入淡出。
 * - 「加人」只有这一颗 ＋（构图面板里不再有第二套）。
 * - 停用 / 删除收进当前角色页签上的 ⋯（owner 2026-10-09 通过的默认）。
 * - 负向是最右边单独一格；进了负向，「写给谁」由框下面那一行切（宿主画）。
 */
export function StudioTagPageTabs({
  whole,
  characters,
  activeIndex,
  negative,
  negativeCount,
  canAdd,
  disabled,
  onSelect,
  onNegative,
  onAdd,
  onEnabledChange,
  onRemove,
}: {
  whole: StudioTagPageTab
  /** 空数组 = 这个模型没有角色（PixAI）：只剩「整体 · 负向」。 */
  characters: readonly StudioTagPageTab[]
  activeIndex: number | null
  negative: boolean
  negativeCount: number
  /** null = 不能加人（模型没有角色）；false = 满了。 */
  canAdd: boolean | null
  disabled: boolean
  onSelect: (index: number | null) => void
  onNegative: () => void
  onAdd: () => void
  onEnabledChange: (index: number, enabled: boolean) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('StudioTags')
  const reducedMotion = useReducedMotion()
  const thumb = (on: boolean) =>
    on ? (
      <motion.span
        aria-hidden
        layoutId="studio-tag-page-thumb"
        className="absolute inset-0 rounded-lg bg-muted"
        transition={springTransition('slot', reducedMotion)}
      />
    ) : null
  const tabTone = (on: boolean) =>
    on
      ? 'font-medium text-foreground'
      : 'text-muted-foreground hover:text-foreground'

  return (
    <div
      role="tablist"
      aria-label={t('characterTitle')}
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!negative && activeIndex === null}
        disabled={disabled}
        onClick={() => onSelect(null)}
        className={cn(tabClass, tabTone(!negative && activeIndex === null))}
      >
        {thumb(!negative && activeIndex === null)}
        <span className="relative">{t('wholeTab')}</span>
        <Count value={whole.count} />
      </button>
      {characters.map((character, index) => {
        const on = !negative && activeIndex === index
        const who = t('workbench.characterNumber', { number: index + 1 })
        return (
          <span key={index} className="relative inline-flex shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={on}
              disabled={disabled}
              onClick={() => onSelect(index)}
              className={cn(
                tabClass,
                tabTone(on),
                on && 'pr-8',
                character.enabled === false && 'opacity-50',
              )}
            >
              {thumb(on)}
              {character.flashing ? (
                <span
                  aria-hidden
                  className="relative size-1.5 rounded-full bg-foreground"
                />
              ) : null}
              <span
                className={cn(
                  'relative',
                  character.enabled === false && 'line-through',
                )}
              >
                {who}
              </span>
              <Count value={character.count} />
            </button>
            {on ? (
              <CharacterMenu
                who={who}
                index={index}
                enabled={character.enabled !== false}
                disabled={disabled}
                onEnabledChange={onEnabledChange}
                onRemove={onRemove}
              />
            ) : null}
          </span>
        )
      })}
      {canAdd !== null ? (
        <button
          type="button"
          aria-label={t('addCharacter')}
          title={t('addCharacter')}
          disabled={disabled || !canAdd}
          onClick={onAdd}
          className={cn(
            tabClass,
            'w-7 justify-center px-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40',
          )}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      ) : null}
      <span className="min-w-2 flex-1" />
      <button
        type="button"
        role="tab"
        aria-selected={negative}
        disabled={disabled}
        onClick={onNegative}
        className={cn(tabClass, tabTone(negative))}
      >
        {thumb(negative)}
        <span className="relative">{t('tabs.negative')}</span>
        <Count value={negativeCount} />
      </button>
    </div>
  )
}

function Count({ value }: { value: number }) {
  return (
    <span className="relative font-mono text-3xs tabular-nums text-muted-foreground">
      {value}
    </span>
  )
}

/** 当前角色页签上的 ⋯：这次出场（开关）· 删除（按钮拉长确认）。从 ⋯ 长出来。 */
function CharacterMenu({
  who,
  index,
  enabled,
  disabled,
  onEnabledChange,
  onRemove,
}: {
  who: string
  index: number
  enabled: boolean
  disabled: boolean
  onEnabledChange: (index: number, enabled: boolean) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('StudioTags')
  const [open, setOpen] = useState(false)
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'start',
    sideOffset: 8,
  })
  return (
    <StudioToolSurface open={open} onOpenChange={setOpen}>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('tabs.more', { who })}
          className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        label={who}
        side="top"
        align="start"
        sideOffset={8}
        style={popoverMotion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'w-56 p-2',
          popoverMotion.className,
        )}
        mobileClassName={studioToolSurfaceMobileClass.small}
      >
        <div className="flex flex-col gap-0.5">
          <span className="px-2 pt-1 pb-1.5 text-2xs font-semibold">{who}</span>
          <label className="flex h-9 items-center justify-between gap-3 rounded-md px-2 text-2xs">
            {t('tabs.appear')}
            <Switch
              checked={enabled}
              onCheckedChange={(next) => onEnabledChange(index, next)}
            />
          </label>
          <ConfirmDeleteButton
            confirmLabel={t('tabs.removeConfirm')}
            onConfirm={() => {
              setOpen(false)
              onRemove(index)
            }}
            className="h-9 justify-start rounded-md px-2 text-2xs text-status-risk hover:bg-status-risk-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('removeCharacter', { number: index + 1 })}
          </ConfirmDeleteButton>
        </div>
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}
