'use client'

import { Check, Image as ImageIcon, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { cn } from '@/lib/utils'

export type CanvasAssistantModality = 'image' | 'video'

interface CanvasAssistantModalityMenuProps {
  value: CanvasAssistantModality
  onChange(value: CanvasAssistantModality): void
}

/**
 * Haivis generation-modality switch (image / video). Video stays selectable
 * as architecture, even when the node assistant remains text-orchestrating;
 * callers can branch on the mode for starters and routing hints.
 */
export function CanvasAssistantModalityMenu({
  value,
  onChange,
}: CanvasAssistantModalityMenuProps) {
  const t = useTranslations('StudioNode.modality')

  return (
    <ResponsivePopover>
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('label')}
          title={t('label')}
          className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
        >
          {value === 'video' ? (
            <Video className="size-4" />
          ) : (
            <ImageIcon className="size-4" />
          )}
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={t('label')}
        align="start"
        sideOffset={8}
        className="w-44 border-node-panel-inner bg-node-panel p-1.5 text-node-foreground shadow-node-panel"
      >
        {(
          [
            { id: 'image' as const, icon: ImageIcon },
            { id: 'video' as const, icon: Video },
          ] as const
        ).map((option) => {
          const Icon = option.icon
          const selected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                selected
                  ? 'bg-node-panel-inner text-node-foreground'
                  : 'text-node-muted hover:bg-node-panel-inner/70 hover:text-node-foreground',
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left font-medium">
                {t(option.id)}
              </span>
              {selected ? <Check className="size-3.5" /> : null}
            </button>
          )
        })}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
