'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { modelSupportsLora } from '@/constants/models'

export const StudioPromptArea = memo(function StudioPromptArea() {
  const { state, dispatch } = useStudioForm()
  const { styles } = useStudioData()
  const t = useTranslations('StudioV2')

  const selectedStyleCard = styles.activeCard

  return (
    <textarea
      id={STUDIO_PROMPT_TEXTAREA_ID}
      value={state.prompt}
      onChange={(e) =>
        dispatch({ type: 'SET_PROMPT', payload: e.target.value })
      }
      placeholder={
        state.workflowMode === 'card' &&
        selectedStyleCard?.modelId &&
        modelSupportsLora(selectedStyleCard.modelId)
          ? t('freePromptPlaceholderLora')
          : t('freePromptPlaceholder')
      }
      className="w-full min-h-[100px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-serif text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
      rows={4}
    />
  )
})
