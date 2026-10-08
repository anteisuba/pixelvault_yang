'use client'

import { useMemo, useState } from 'react'
import { History, Search } from '@/components/icons'
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

interface CanvasAssistantHistoryPanelProps extends CanvasAssistantHistoryProps {
  fill?: boolean
  /**
   * 落在哪种底上。`popover`（缺省）= 助手头部那颗传送门浮层（字面色，见 globals.css
   * `.canvas-assistant-popover*`）；`panel` = 画布左侧玻璃面板「历史对话」那一格
   * （owner 2026-10-08 原型四格），走画布脊柱 token，深浅两档都跟着玻璃走。
   */
  surface?: 'popover' | 'panel'
}

/** 两种底上的皮 —— 结构一份，只换颜色类。 */
const HISTORY_SURFACE_CLASSES = {
  popover: {
    subtle: 'canvas-assistant-popover-subtle',
    input: 'canvas-assistant-popover-input',
    empty: 'canvas-assistant-popover-empty',
    item: 'canvas-assistant-popover-item',
    itemActive: 'canvas-assistant-popover-item--active',
  },
  panel: {
    subtle: 'text-node-muted',
    input:
      'border-node-panel-inner bg-node-panel-inner text-node-foreground placeholder:text-node-muted',
    empty: 'bg-node-panel-inner text-node-muted',
    item: 'text-node-muted transition-colors duration-fast ease-standard hover:bg-node-panel-inner hover:text-node-foreground',
    itemActive: 'bg-node-panel-inner text-node-foreground',
  },
} as const

export function CanvasAssistantHistoryPanel({
  sessions,
  activeSessionId,
  onSelect,
  fill = false,
  surface = 'popover',
}: CanvasAssistantHistoryPanelProps) {
  const t = useTranslations('StudioNode.history')
  const skin = HISTORY_SURFACE_CLASSES[surface]
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
        <Search
          className={cn(
            skin.subtle,
            'pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2',
          )}
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
          className={cn(skin.input, 'h-9 pl-8 text-xs')}
        />
      </div>
      {filtered.length === 0 ? (
        <div
          className={cn(skin.empty, 'rounded-xl px-3 py-6 text-center text-xs')}
        >
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
                  skin.item,
                  'flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left',
                  session.id === activeSessionId && skin.itemActive,
                )}
              >
                <span className="truncate text-sm font-medium">
                  {session.title}
                </span>
                <span className={cn(skin.subtle, 'text-2xs tabular-nums')}>
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
