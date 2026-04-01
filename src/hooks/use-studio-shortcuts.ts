'use client'

import { useEffect } from 'react'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'

interface UseStudioShortcutsOptions {
  enabled?: boolean
  onGenerate?: () => void
}

export function useStudioShortcuts({
  enabled = true,
  onGenerate,
}: UseStudioShortcutsOptions) {
  const { state, dispatch } = useStudioForm()

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const hasModifier = event.metaKey || event.ctrlKey

      if (hasModifier && key === 'enter') {
        event.preventDefault()
        onGenerate?.()
        return
      }

      if (hasModifier && key === 'e') {
        if (!state.prompt.trim()) {
          return
        }

        event.preventDefault()
        dispatch({ type: 'OPEN_PANEL', payload: 'enhance' })
        return
      }

      if (hasModifier && key === 'k') {
        event.preventDefault()
        const promptField = document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)
        if (promptField instanceof HTMLTextAreaElement) {
          promptField.focus()
          promptField.select()
        }
        return
      }

      if (key === 'escape' && Object.values(state.panels).some(Boolean)) {
        event.preventDefault()
        dispatch({ type: 'CLOSE_ALL_PANELS' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch, enabled, onGenerate, state.panels, state.prompt])
}
