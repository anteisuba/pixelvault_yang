'use client'

import { useMemo, useState } from 'react'
import { Search } from '@/components/icons'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import type { NodeAssistantHistorySession } from '@/lib/node-assistant-history'
import { cn } from '@/lib/utils'

interface CanvasAssistantHistoryProps {
  sessions: NodeAssistantHistorySession[]
  activeSessionId: string | null
  onSelect(sessionId: string): void
}

interface CanvasAssistantHistoryPanelProps extends CanvasAssistantHistoryProps {
  fill?: boolean
}

/**
 * 画布左侧玻璃面板「历史对话」那一格（owner 2026-10-08 原型四格），走画布脊柱 token，
 * 素 / 暗房两档都跟着玻璃走。（助手头部那颗传送门浮层的字面色皮随第 9c 步没了消费者，
 * 暗色主题模块 2026-10-24 一并删掉。）
 */
export function CanvasAssistantHistoryPanel({
  sessions,
  activeSessionId,
  onSelect,
  fill = false,
}: CanvasAssistantHistoryPanelProps) {
  const t = useTranslations('StudioNode.history')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sessions
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(needle),
    )
  }, [query, sessions])

  return (
    <div className={cn('flex min-h-0 flex-col gap-2 p-3', fill && 'h-full')}>
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-node-muted" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
          className="h-9 border-node-panel-inner bg-node-panel-inner pl-8 text-node-foreground placeholder:text-node-muted"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-node-panel-inner px-3 py-6 text-center text-xs text-node-muted">
          {t('empty')}
        </div>
      ) : (
        <ul
          className={cn(
            'space-y-1 overflow-y-auto',
            fill ? 'min-h-0 flex-1' : 'max-h-64',
          )}
        >
          {filtered.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left text-node-muted transition-colors duration-fast ease-standard hover:bg-node-panel-inner hover:text-node-foreground',
                  session.id === activeSessionId &&
                    'bg-node-panel-inner text-node-foreground',
                )}
              >
                <span className="truncate text-sm font-medium">
                  {session.title}
                </span>
                <span className="text-2xs tabular-nums text-node-muted">
                  {new Date(session.updatedAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
