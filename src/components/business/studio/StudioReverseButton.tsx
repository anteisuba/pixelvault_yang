'use client'

import { Loader2, ScanText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

const ReverseEngineerPanel = dynamic(
  () =>
    import('@/components/business/ReverseEngineerPanel').then(
      (mod) => mod.ReverseEngineerPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

interface StudioReverseButtonProps {
  disabled?: boolean
}

/**
 * StudioReverseButton — toolbar popover hosting the ReverseEngineerPanel.
 * Same unify-with-other-popovers reasoning as StudioEnhanceButton.
 */
export function StudioReverseButton({ disabled }: StudioReverseButtonProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const open = state.panels.reverse

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'reverse',
        })
      }
    >
      <PopoverTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('reverse')}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            open && 'bg-muted/30 text-primary',
          )}
        >
          <ScanText className="size-4" />
          <span className="hidden sm:inline">{t('reverse')}</span>
        </Toolbar.Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
        className="w-[min(520px,calc(100vw-2rem))] !p-0 overflow-hidden"
      >
        <div className="flex max-h-[min(560px,72vh)] flex-col overflow-y-auto p-4">
          <ReverseEngineerPanel
            onUsePrompt={(prompt) => {
              dispatch({ type: 'SET_PROMPT', payload: prompt })
              dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
