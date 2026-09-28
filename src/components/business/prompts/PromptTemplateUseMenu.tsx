'use client'

import { useTranslations } from 'next-intl'

import { Layers, Tag } from '@/components/icons'
import type { PromptTemplateDestination } from '@/hooks/use-prompt-template-use'
import type { TagTemplateSource } from '@/lib/recipe-template-kind'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'

interface PromptTemplateUseMenuProps {
  source: TagTemplateSource
  onUse: (destination: PromptTemplateDestination) => void
  onOpenChange?: (open: boolean) => void
  /** 往哪边长：卡片上键在左边（`start`），详情头部键在右边（`end`）。 */
  align?: 'start' | 'end'
  triggerClassName?: string
}

/**
 * 标签模板的「使用」（owner 2026-09-28：每次问一句去哪，画板 `TgA_Use`）：从键长出一个
 * 小下拉，两行各写一句会换掉什么；存出来的那一台标「存自这里」。
 */
export function PromptTemplateUseMenu({
  source,
  onUse,
  onOpenChange,
  align = 'end',
  triggerClassName,
}: PromptTemplateUseMenuProps) {
  const t = useTranslations('PromptLibrary')
  const zoom = getChipZoomMotion({ side: 'bottom', align, sideOffset: 8 })
  const rows = [
    {
      destination: 'tags' as const,
      Icon: Tag,
      title: t('useOnTagBench'),
      hint:
        source === 'tags' ? t('useOnTagBenchWhole') : t('useOnTagBenchTags'),
      home: source === 'tags',
    },
    {
      destination: 'lora' as const,
      Icon: Layers,
      title: t('useOnLoraBench'),
      hint:
        source === 'lora'
          ? t('useOnLoraBenchWhole')
          : t('useOnLoraBenchPrompt'),
      home: source === 'lora',
    },
  ]

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" className={triggerClassName}>
          {t('useAction')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={8}
        aria-label={t('useWhere')}
        className={cn('w-85 rounded-2xl p-1.5', zoom.className)}
        style={zoom.style}
      >
        {rows.map(({ destination, Icon, title, hint, home }) => (
          <DropdownMenuItem
            key={destination}
            onSelect={() => onUse(destination)}
            className={cn(
              'items-start gap-2.5 rounded-xl px-3 py-2.5',
              home && 'bg-muted',
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background ring-1 ring-border">
              <Icon aria-hidden className="size-3.5 text-foreground" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-2sm font-semibold text-foreground">
                {title}
                {home ? (
                  <span className="text-2xs font-medium text-muted-foreground">
                    {t('useHome')}
                  </span>
                ) : null}
              </span>
              <span className="text-xs leading-4.25 text-muted-foreground">
                {hint}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
