'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_CONVERSATION_LIMITS } from '@/types/assistant-conversation'
import { Edit3 } from '@/components/icons'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'

/**
 * 板头的标题（ui-spec §1 / §9「板头 `PanelHeader`」）：鼠标放上出铅笔，点了就地改名，
 * 框是 `highlight` 色。回车 / 失焦保存、Esc 取消（与历史行改名同一套判据）。
 *
 * ⚠ 历史在左栏「对话」里，这里 ⛔ 再挂一个历史下拉。
 * ⚠ 还没落库的新对话没有可改的那一条：只写字，⛔ 铅笔。
 */
export function StudioOperatorTitleRename({
  history,
  fallbackTitle,
}: {
  history: UseStudioOperatorHistoryResult
  /** 派生不出标题时显示的那一句（「新对话」）。 */
  fallbackTitle: string
}) {
  const t = useTranslations('StudioOperator')
  const session = history.sessions.find(
    (item) => item.id === history.currentSessionId,
  )
  const derivedTitle = deriveAssistantConversationTitle(session?.title)
  const title = derivedTitle ?? fallbackTitle
  /** `null` = 不在编辑态。 */
  const [draft, setDraft] = useState<string | null>(null)
  /** Esc 之后那一拍的 blur ⛔ 当成保存（`setDraft` 要下一次渲染才生效）。 */
  const cancelledRef = useRef(false)

  const commit = () => {
    const cancelled = cancelledRef.current
    cancelledRef.current = false
    const value = (draft ?? '').trim()
    setDraft(null)
    if (cancelled || !session || !value || value === session.title) return
    void history.renameSession(
      session,
      value.slice(0, ASSISTANT_CONVERSATION_LIMITS.titleMaxLength),
    )
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        type="text"
        data-testid="operator-title-input"
        value={draft}
        disabled={history.renamingSessionId === session?.id}
        maxLength={ASSISTANT_CONVERSATION_LIMITS.titleMaxLength}
        aria-label={t('history.renameLabel', { title })}
        title={t('history.renameHint')}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.stopPropagation()
            cancelledRef.current = true
            event.currentTarget.blur()
          }
        }}
        className="h-8 min-w-0 max-w-full flex-1 rounded-lg border border-highlight bg-background px-2 text-sm font-semibold text-foreground focus:outline-none"
      />
    )
  }

  if (!session) {
    return (
      <span
        data-testid="operator-title"
        className="min-w-0 truncate px-2 text-sm font-semibold text-foreground"
      >
        {title}
      </span>
    )
  }

  return (
    <button
      type="button"
      data-testid="operator-title"
      aria-label={t('history.renameLabel', { title })}
      onClick={() => setDraft(derivedTitle ?? '')}
      className="group/title flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm font-semibold text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
    >
      <span className="min-w-0 truncate">{title}</span>
      <Edit3
        aria-hidden
        className="size-3.5 shrink-0 text-ink-2 opacity-0 transition-opacity duration-fast ease-standard group-hover/title:opacity-100 group-focus-visible/title:opacity-100 motion-reduce:transition-none"
      />
    </button>
  )
}
