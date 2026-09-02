'use client'

import { useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import type { NodeAssistantHistorySession } from '@/types/node-assistant'
import { cn } from '@/lib/utils'

interface CanvasAssistantHistoryProps {
  sessions: NodeAssistantHistorySession[]
  activeSessionId: string | null
  onSelect(sessionId: string): void
}

interface CanvasAssistantHistoryPanelProps extends CanvasAssistantHistoryProps {
  fill?: boolean
}

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
        <Search className="canvas-assistant-popover-subtle pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
          className="canvas-assistant-popover-input h-9 pl-8 text-xs"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="canvas-assistant-popover-empty rounded-xl px-3 py-6 text-center text-xs">
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
                  'canvas-assistant-popover-item flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left',
                  session.id === activeSessionId &&
                    'canvas-assistant-popover-item--active',
                )}
              >
                <span className="truncate text-sm font-medium">
                  {session.title}
                </span>
                <span className="canvas-assistant-popover-subtle text-2xs tabular-nums">
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

export function CanvasAssistantHistory({
  sessions,
  activeSessionId,
  onSelect,
}: CanvasAssistantHistoryProps) {
  const t = useTranslations('StudioNode.history')
  const [open, setOpen] = useState(false)

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('title')}
          title={t('title')}
          className="canvas-assistant-ghost-btn rounded-xl"
        >
          <History className="size-4" />
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={t('title')}
        // Start alignment lets Radix collision handling keep the panel inside
        // the assistant rail instead of pinning its right edge to the history
        // icon (which made it float over the canvas on narrow rails).
        align="start"
        sideOffset={8}
        className="canvas-assistant-popover w-80 p-0"
      >
        <div className="canvas-assistant-popover-divider border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{t('title')}</p>
        </div>
        <CanvasAssistantHistoryPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={(sessionId) => {
            onSelect(sessionId)
            setOpen(false)
          }}
        />
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
