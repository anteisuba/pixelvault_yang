'use client'

import { useEffect } from 'react'

import { ROUTES } from '@/constants/routes'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'
import { useRouter } from '@/i18n/navigation'

interface UseStudioShortcutsOptions {
  enabled?: boolean
  onGenerate?: () => void
}

// Cmd/Ctrl + Shift + 1/2/3 jumps between the per-media Studio routes.
// Shift is required so we don't collide with the browser's native Cmd+1/2/3
// tab-switch binding — Krea uses the same pattern.
const MODE_SHORTCUT_ROUTES: Record<string, string> = {
  '1': ROUTES.STUDIO_IMAGE,
  '2': ROUTES.STUDIO_VIDEO,
  '3': ROUTES.STUDIO_AUDIO,
}

export function useStudioShortcuts({
  enabled = true,
  onGenerate,
}: UseStudioShortcutsOptions) {
  const { state, dispatch } = useStudioForm()
  const router = useRouter()

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

      if (hasModifier && event.shiftKey && key in MODE_SHORTCUT_ROUTES) {
        event.preventDefault()
        router.push(MODE_SHORTCUT_ROUTES[key])
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
  }, [dispatch, enabled, onGenerate, router, state.panels, state.prompt])
}
