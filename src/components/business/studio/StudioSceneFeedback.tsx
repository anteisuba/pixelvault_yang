'use client'

import { memo, type ComponentType } from 'react'
import { ArrowRight, Link2, Palette, Plus, User } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type SceneFeedbackAction =
  | 'keep_character'
  | 'keep_style'
  | 'keep_continuity'
  | 'extend_scene'
  | 'continue_from_last_frame'

interface StudioSceneFeedbackProps {
  sceneIndex: number
  onAction: (action: SceneFeedbackAction) => void
  disabledActions?: SceneFeedbackAction[]
}

const SCENE_FEEDBACK_OPTIONS: Array<{
  action: SceneFeedbackAction
  labelKey: string
  icon: ComponentType<{ className?: string }>
}> = [
  { action: 'keep_character', labelKey: 'keepCharacter', icon: User },
  { action: 'keep_style', labelKey: 'keepStyle', icon: Palette },
  { action: 'keep_continuity', labelKey: 'keepContinuity', icon: Link2 },
  { action: 'extend_scene', labelKey: 'extendScene', icon: Plus },
  {
    action: 'continue_from_last_frame',
    labelKey: 'continueFromLastFrame',
    icon: ArrowRight,
  },
]

export const StudioSceneFeedback = memo(function StudioSceneFeedback({
  sceneIndex,
  onAction,
  disabledActions = [],
}: StudioSceneFeedbackProps) {
  const t = useTranslations('sceneFeedback')

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-scene-index={sceneIndex}
    >
      {SCENE_FEEDBACK_OPTIONS.map(({ action, labelKey, icon: Icon }) => {
        const disabled = disabledActions.includes(action)

        return (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            title={disabled ? t('comingSoon') : undefined}
            className={cn(
              'h-8 gap-1.5 rounded-full border-border/60 bg-background/70 px-3 text-xs shadow-none hover:border-primary/30 hover:text-primary',
              disabled && 'opacity-50',
            )}
            onClick={() => onAction(action)}
          >
            <Icon className="size-3" />
            {t(labelKey)}
          </Button>
        )
      })}
    </div>
  )
})
