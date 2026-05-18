'use client'

import { Loader2, Wand2 } from 'lucide-react'
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

const StudioTransformPanel = dynamic(
  () =>
    import('@/components/business/studio/StudioTransformPanel').then(
      (mod) => mod.StudioTransformPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

interface StudioTransformButtonProps {
  disabled?: boolean
}

/**
 * StudioTransformButton — toolbar popover hosting StudioTransformPanel.
 * Same unify-with-other-popovers reasoning as StudioEnhanceButton.
 */
export function StudioTransformButton({
  disabled,
}: StudioTransformButtonProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const open = state.panels.transform

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'transform',
        })
      }
    >
      <PopoverTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('transform')}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            open && 'bg-muted/30 text-primary',
          )}
        >
          <Wand2 className="size-4" />
          <span className="hidden sm:inline">{t('transform')}</span>
        </Toolbar.Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
        className="w-[min(520px,calc(100vw-2rem))] !p-0 overflow-hidden"
      >
        <div className="flex max-h-[min(600px,76vh)] flex-col overflow-y-auto p-4">
          <StudioTransformPanel />
        </div>
      </PopoverContent>
    </Popover>
  )
}
