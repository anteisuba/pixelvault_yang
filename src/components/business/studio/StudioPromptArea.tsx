'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { Textarea } from '@/components/ui/textarea'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { modelSupportsLora } from '@/constants/models'

export const StudioPromptArea = memo(function StudioPromptArea() {
  const { state, dispatch } = useStudioForm()
  const { styles } = useStudioData()
  const t = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')

  const selectedStyleCard = styles.activeCard

  return (
    <Textarea
      id={STUDIO_PROMPT_TEXTAREA_ID}
      aria-label={tForm('promptLabel')}
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
      className="min-h-48 resize-y rounded-2xl border-border/60 bg-background/60 px-4 py-3 font-serif text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary/40 focus-visible:ring-primary/20 lg:min-h-56"
      rows={8}
    />
  )
})
