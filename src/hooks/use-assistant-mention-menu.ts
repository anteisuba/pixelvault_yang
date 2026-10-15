'use client'

/**
 * 助手输入框那一份 `@` 菜单的状态（设计方案 §10b）：查询、高亮、「查看全部」、
 * 素材库下钻、键盘。菜单长什么样由 `lib/assistant-mention-menu.ts` 算，这里只管
 * 「此刻开着哪一页、高亮第几行、按键做什么」。
 *
 * ⚠ 绑定（`binding`）原样交给 `MentionInput.mentionMenu`：输入框负责认出 `@查询`
 * 与挂 combobox 的 ARIA，导航键交回这里。
 */

import { useCallback, useId, useMemo, useState } from 'react'

import { ASSISTANT_MENTION_LIMITS } from '@/constants/assistant-mention'
import type {
  MentionMenuBinding,
  MentionMenuKey,
} from '@/components/ui/mention-input'
import {
  useMentionLibrarySearch,
  type AssistantMentionGroup,
  type MentionLibraryState,
} from '@/hooks/use-assistant-mention-composer'
import {
  buildMentionMenu,
  type MentionMenuRow,
  type MentionMenuView,
} from '@/lib/assistant-mention-menu'
import type {
  AssistantMentionCandidate,
  AssistantMentionGroupId,
  AssistantMentionLibraryFolder,
} from '@/types/assistant-mention'

export interface UseAssistantMentionMenuInput {
  readonly groups: readonly AssistantMentionGroup[]
  readonly recentKeys: readonly string[]
  /** 正文里已经有的胶囊（不再列）。 */
  readonly excludeKeys: ReadonlySet<string>
  /** 选中了（一条或「全部 @」那几条）。 */
  onPick(candidates: readonly AssistantMentionCandidate[]): void
}

export interface UseAssistantMentionMenuResult {
  readonly binding: MentionMenuBinding
  readonly open: boolean
  readonly query: string
  readonly view: MentionMenuView
  readonly library: MentionLibraryState
  readonly folder: AssistantMentionLibraryFolder | null
  readonly expanded: AssistantMentionGroupId | null
  /** 高亮那一行（越界时夹回来）。 */
  readonly activeIndex: number
  optionId(index: number): string
  setActiveIndex(index: number): void
  activate(row: MentionMenuRow): void
  /** 菜单是不是**该放掉这个 `@`**：多词查询一条都没中、素材库也问完了。 */
  readonly exhausted: boolean
}

export function useAssistantMentionMenu({
  groups,
  recentKeys,
  excludeKeys,
  onPick,
}: UseAssistantMentionMenuInput): UseAssistantMentionMenuResult {
  const listId = useId()
  const [query, setQuery] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<AssistantMentionGroupId | null>(null)
  const [folder, setFolder] = useState<AssistantMentionLibraryFolder | null>(
    null,
  )
  const [active, setActive] = useState(0)
  const open = query !== null

  const library = useMentionLibrarySearch({
    enabled: open,
    query: query ?? '',
    folderId: folder?.id ?? null,
  })

  const view = useMemo(
    () =>
      buildMentionMenu({
        groups,
        library,
        query: query ?? '',
        recentKeys,
        expanded,
        folder,
        excludeKeys,
      }),
    [excludeKeys, expanded, folder, groups, library, query, recentKeys],
  )
  const rowCount = view.rows.length
  const activeIndex = rowCount ? Math.min(active, rowCount - 1) : 0

  const reset = useCallback(() => {
    setExpanded(null)
    setFolder(null)
    setActive(0)
  }, [])

  const activate = useCallback(
    (row: MentionMenuRow) => {
      switch (row.type) {
        case 'option':
          onPick([row.candidate])
          reset()
          return
        case 'mentionAll':
          onPick(row.items)
          reset()
          return
        case 'more':
          setExpanded(row.group)
          setActive(0)
          return
        case 'less':
          setExpanded(null)
          setActive(0)
          return
        case 'folder':
          setFolder(row.folder)
          setActive(0)
          return
        case 'back':
          setFolder(null)
          setActive(0)
          return
      }
    },
    [onPick, reset],
  )

  const onQueryChange = useCallback(
    (next: string | null) => {
      setQuery(next)
      // 换了查询 = 换了一页：高亮回到第一行；关掉菜单 = 下次从头来。
      if (next === null) reset()
      else setActive(0)
    },
    [reset],
  )

  const onKey = useCallback(
    (key: MentionMenuKey): boolean => {
      if (!open) return false
      switch (key) {
        case 'ArrowDown':
          setActive(rowCount ? (activeIndex + 1) % rowCount : 0)
          return true
        case 'ArrowUp':
          setActive(rowCount ? (activeIndex - 1 + rowCount) % rowCount : 0)
          return true
        case 'Home':
          setActive(0)
          return true
        case 'End':
          setActive(Math.max(0, rowCount - 1))
          return true
        case 'Enter':
        case 'Tab': {
          const row = view.rows[activeIndex]
          if (!row) return false
          activate(row)
          return true
        }
        case 'Escape':
          reset()
          return true
      }
    },
    [activate, activeIndex, open, reset, rowCount, view.rows],
  )

  const optionId = useCallback(
    (index: number) => `${listId}-option-${index}`,
    [listId],
  )

  const binding = useMemo(
    (): MentionMenuBinding => ({
      listId,
      ...(open && rowCount ? { activeOptionId: optionId(activeIndex) } : {}),
      open,
      onQueryChange,
      onKey,
      queryLimits: {
        chars: ASSISTANT_MENTION_LIMITS.maxQueryChars,
        terms: ASSISTANT_MENTION_LIMITS.maxQueryTerms,
      },
    }),
    [activeIndex, listId, onKey, onQueryChange, open, optionId, rowCount],
  )

  const exhausted =
    open &&
    /\s/.test((query ?? '').trim()) &&
    view.optionCount === 0 &&
    !library.loading

  return {
    binding,
    open,
    query: query ?? '',
    view,
    library,
    folder,
    expanded,
    activeIndex,
    optionId,
    setActiveIndex: setActive,
    activate,
    exhausted,
  }
}
