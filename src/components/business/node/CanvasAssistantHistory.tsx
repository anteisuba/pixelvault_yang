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
import type { NodeAssistantHistorySession } from '@/lib/node-assistant-history'
import { cn } from '@/lib/utils'

interface CanvasAssistantHistoryProps {
  sessions: NodeAssistantHistorySession[]
  activeSessionId: string | null
  onSelect(sessionId: string): void
}

export function CanvasAssistantHistory({
  sessions,
  activeSessionId,
  onSelect,
}: CanvasAssistantHistoryProps) {
  const t = useTranslations('StudioNode.history')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sessions
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(needle),
    )
  }, [query, sessions])

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('title')}
          title={t('title')}
          className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
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
        className="w-80 border-node-panel-inner bg-node-panel p-0 text-node-foreground shadow-node-panel"
      >
        <div className="border-b border-node-panel-inner px-3 py-2.5">
          <p className="text-sm font-semibold">{t('title')}</p>
        </div>
        <div className="space-y-2 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-node-subtle" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search')}
              className="h-9 border-node-panel-inner bg-node-panel-soft pl-8 text-xs text-node-foreground"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-node-panel-soft px-3 py-6 text-center text-xs text-node-muted">
              {t('empty')}
            </div>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filtered.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(session.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      session.id === activeSessionId
                        ? 'bg-node-panel-inner text-node-foreground'
                        : 'hover:bg-node-panel-inner/70 text-node-muted hover:text-node-foreground',
                    )}
                  >
                    <span className="truncate text-sm font-medium">
                      {session.title}
                    </span>
                    <span className="text-2xs tabular-nums text-node-subtle">
                      {new Date(session.updatedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
