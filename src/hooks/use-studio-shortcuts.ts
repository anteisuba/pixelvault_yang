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

/**
 * 焦点是不是落在**别的**输入框里（提示词框自己不算）。
 *
 * ⚠ 这个判据只给 Cmd/Ctrl+Enter 用。2026-08-22 真机撞到：在助手输入框里按
 * Cmd/Ctrl+Enter 发消息，**同一下按键顺带真出了一张图** —— 监听挂在 window 上，
 * 而这条分支此前完全不看焦点在哪。代价不是难看，是**花钱**。
 *
 * ⛔ 不能简单写成「在 textarea 里就不触发」：提示词框本身就是 textarea，
 *    Cmd/Ctrl+Enter 在那里出图正是这条快捷键存在的理由。所以判据是
 *    「可编辑 **且不是**提示词框」。
 *
 * 同文件里 `/` 那条早就守了 input/textarea —— 说明这件事一直知道，只是漏了这一支。
 */
function isTypingOutsidePromptField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.id === STUDIO_PROMPT_TEXTAREA_ID) return false
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target.isContentEditable
  )
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
        // 助手输入框、重命名框、标签输入…… 里的 Cmd/Ctrl+Enter 是那个控件自己的
        // 发送键，不该同时触发一次出图（见 `isTypingOutsidePromptField`）。
        // ⚠ 这里 `return` 时**不 preventDefault** —— 要把这下按键原样还给那个控件。
        if (isTypingOutsidePromptField(event.target)) return
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
