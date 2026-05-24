'use client'

import { BotMessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function CanvasAssistantToggle() {
  const t = useTranslations('StudioNode')

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            aria-label={t('assistant.toggle')}
            onClick={() =>
              toast.info(t('toasts.notImplemented'), {
                duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
                position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
              })
            }
            className="pointer-events-auto absolute right-4 top-24 h-10 rounded-2xl border border-node-panel-inner/80 bg-node-panel px-3 text-node-foreground shadow-node-panel hover:bg-node-panel-inner md:right-6"
          >
            <BotMessageSquare className="size-4 text-node-amber" />
            <span className="hidden text-xs font-semibold sm:inline">
              {t('assistant.toggle')}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t('assistant.toggle')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
