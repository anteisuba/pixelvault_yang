'use client'

/**
 * 助手输入框的 `@` 菜单（设计方案 §10b「菜单与搜索」+「移动端与无障碍」）。
 *
 * ⭐ **贴在输入框上方**（输入区里绝对定位，⛔ 不 portal、⛔ 不跟着光标飘）：手机上
 * 键盘弹起时它跟着输入框一起上移，不会被键盘盖住，也不会因为视口变矮被关掉。
 * ⭐ 一个 listbox、分组用 `role="group"`；高亮靠输入框上的 `aria-activedescendant`
 * （焦点始终留在输入框里，读屏念的是高亮那一行）。
 * ⚠ 每一行 `onMouseDown` 都 preventDefault：否则点下去输入框先失焦、菜单被关，
 * click 永远等不到（手机上同一个道理）。
 *
 * 悬停 / 方向键停在一行上时，右侧出大图（窄的时候不出 —— 容器查询 `@md:`）。
 */

import { useTranslations } from 'next-intl'

import { ASSISTANT_MENTION_GROUP_IDS } from '@/constants/assistant-mention'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Folder,
  Layers,
} from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'
import type { UseAssistantMentionMenuResult } from '@/hooks/use-assistant-mention-menu'
import {
  MENTION_MENU_MATCHES,
  type MentionMenuRow,
} from '@/lib/assistant-mention-menu'
import { cn } from '@/lib/utils'
import type {
  AssistantMentionCandidate,
  AssistantMentionGroupId,
} from '@/types/assistant-mention'

const ROW_CLASS =
  'flex min-h-11 w-full shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors duration-fast'

export interface StudioOperatorMentionMenuProps {
  readonly menu: UseAssistantMentionMenuResult
  /** 菜单根上额外挂的属性（收放法则的豁免标记）。 */
  readonly rootAttributes?: Record<string, string>
}

function Thumb({ candidate }: { candidate: AssistantMentionCandidate }) {
  if (candidate.thumb)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={candidate.thumb}
        alt=""
        draggable={false}
        className="size-9 shrink-0 rounded object-cover"
      />
    )
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded bg-muted text-2xs text-muted-foreground"
    >
      {candidate.label.slice(0, 1)}
    </span>
  )
}

export function StudioOperatorMentionMenu({
  menu,
  rootAttributes,
}: StudioOperatorMentionMenuProps) {
  const t = useTranslations('StudioOperator.mention')
  if (!menu.open) return null
  const { view, activeIndex } = menu
  const activeRow = view.rows[activeIndex]
  const preview =
    activeRow?.type === 'option' &&
    (activeRow.candidate.thumb || activeRow.candidate.preview)
      ? activeRow.candidate
      : null
  const searching = menu.query.trim().length > 0

  const rowLabel = (row: MentionMenuRow) => {
    switch (row.type) {
      case 'option':
        return row.candidate.label
      case 'more':
        return t('viewAll', { count: row.count })
      case 'less':
        return t('showLess')
      case 'mentionAll':
        return t('mentionAll')
      case 'folder':
        return t('openFolder', { name: row.folder.name })
      case 'back':
        return t('back')
    }
  }

  const indexOf = new Map(view.rows.map((row, index) => [row, index]))
  const renderRow = (row: MentionMenuRow) => {
    const rowIndex = indexOf.get(row) ?? 0
    const active = rowIndex === activeIndex
    const common = {
      id: menu.optionId(rowIndex),
      role: 'option' as const,
      'aria-selected': active,
      'data-active': active ? 'true' : undefined,
      onMouseEnter: () => menu.setActiveIndex(rowIndex),
      onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
      onClick: () => menu.activate(row),
    }
    if (row.type === 'option') {
      const { candidate } = row
      return (
        <div
          key={row.key}
          {...common}
          data-testid="operator-mention-option"
          data-mention-key={`${candidate.kind}:${candidate.id}`}
          className={cn(
            ROW_CLASS,
            'cursor-pointer hover:bg-accent',
            active && 'bg-accent text-accent-foreground',
          )}
        >
          <Thumb candidate={candidate} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{candidate.label}</span>
            {candidate.subtitle ? (
              <span className="truncate text-xs text-muted-foreground">
                {candidate.subtitle}
              </span>
            ) : null}
          </span>
          {typeof candidate.seq === 'number' ? (
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">
              #{candidate.seq}
            </span>
          ) : null}
        </div>
      )
    }
    const Icon =
      row.type === 'folder'
        ? Folder
        : row.type === 'back'
          ? ArrowLeft
          : row.type === 'less'
            ? ChevronUp
            : row.type === 'mentionAll'
              ? Layers
              : ChevronDown
    return (
      <div
        key={row.key}
        {...common}
        data-testid={`operator-mention-${row.type}`}
        className={cn(
          ROW_CLASS,
          'cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground',
          active && 'bg-accent text-foreground',
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center"
        >
          <Icon className="size-4" />
        </span>
        <span className="truncate">{rowLabel(row)}</span>
      </div>
    )
  }

  const sectionTitle = (id: string) =>
    id === MENTION_MENU_MATCHES
      ? t('matches')
      : id === ASSISTANT_MENTION_GROUP_IDS.library && menu.folder
        ? menu.folder.name
        : t(`groups.${id as AssistantMentionGroupId}`)

  const empty = view.rows.length === 0
  return (
    <div
      {...rootAttributes}
      data-testid="operator-mention-menu"
      className="assistant-mention-menu @container absolute inset-x-0 bottom-full z-30 mb-2 flex overflow-hidden rounded-12 bg-popover text-popover-foreground shadow-pop"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        id={menu.binding.listId}
        role="listbox"
        aria-label={t('pickerLabel')}
        className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1"
      >
        {view.sections.map((section) => (
          <div
            key={section.id}
            role="group"
            aria-label={sectionTitle(section.id)}
            className="flex flex-col gap-0.5"
          >
            <div
              aria-hidden
              className="flex items-center justify-between px-2 pb-0.5 pt-1.5 text-2xs font-medium text-muted-foreground"
            >
              <span>{sectionTitle(section.id)}</span>
              {section.id === ASSISTANT_MENTION_GROUP_IDS.library &&
              menu.library.loading ? (
                <Spinner size="sm" />
              ) : null}
            </div>
            {section.rows.map(renderRow)}
          </div>
        ))}
        {empty ? (
          <p className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground">
            {menu.library.loading ? (
              <>
                <Spinner size="sm" />
                {t('searching')}
              </>
            ) : searching ? (
              t('empty')
            ) : (
              t('libraryHint')
            )}
          </p>
        ) : !searching && !menu.folder && !menu.expanded ? (
          <p className="px-2 pb-1 pt-1.5 text-2xs text-muted-foreground">
            {t('libraryHint')}
          </p>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {t('results', { count: view.optionCount })}
        </span>
      </div>
      {preview ? (
        <aside
          aria-hidden
          data-testid="operator-mention-preview"
          className="hidden w-44 shrink-0 flex-col gap-1.5 border-l border-border p-2 @md:flex"
        >
          {preview.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.thumb}
              alt=""
              draggable={false}
              className="aspect-square w-full rounded-md bg-muted object-contain"
            />
          ) : null}
          <span className="truncate text-xs font-medium">{preview.label}</span>
          {preview.preview ? (
            <span className="line-clamp-6 text-xs text-muted-foreground">
              {preview.preview}
            </span>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
