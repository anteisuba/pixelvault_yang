'use client'

import { useEffect } from 'react'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'

interface UseStudioShortcutsOptions {
  enabled?: boolean
  onGenerate?: () => void
  onGenerateVariants?: () => void
}

export function useStudioShortcuts({
  enabled = true,
  onGenerate,
  onGenerateVariants,
}: UseStudioShortcutsOptions) {
  const { state, dispatch } = useStudioForm()

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip during IME composition (CJK input methods use Enter/Escape internally)
      if (event.isComposing) return

      const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''

      if (!key) {
        return
      }

      const hasModifier = event.metaKey || event.ctrlKey

      if (hasModifier && event.shiftKey && key === 'enter') {
        event.preventDefault()
        onGenerateVariants?.()
        return
      }

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

      // `/` focuses prompt (only when not already in an input/textarea)
      if (
        key === '/' &&
        !hasModifier &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
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
  }, [
    dispatch,
    enabled,
    onGenerate,
    onGenerateVariants,
    state.panels,
    state.prompt,
  ])
}
