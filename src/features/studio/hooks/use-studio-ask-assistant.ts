'use client'

import { useCallback } from 'react'

import { useAskAssistantAboutImage } from '@/features/assistant/hooks'
import { expandStudioShellConversation } from '@/hooks/use-studio-shell-avatar'
import type { GenerationRecord } from '@/types'

/** 面板展开后最多等这么多帧去找输入框（展开是一段平移，输入框要挂上才有得聚焦）。 */
const FOCUS_MAX_FRAMES = 30
const OPERATOR_INPUT_SELECTOR =
  '[data-testid="operator-panel"] [contenteditable="true"]'

/** 把光标放进助手输入框末尾（胶囊收进正文末尾，用户接着打字）。 */
function focusOperatorInputWhenReady(frame = 0): void {
  if (typeof document === 'undefined') return
  const input = document.querySelector<HTMLElement>(OPERATOR_INPUT_SELECTOR)
  if (!input) {
    if (frame < FOCUS_MAX_FRAMES)
      requestAnimationFrame(() => focusOperatorInputWhenReady(frame + 1))
    return
  }
  input.focus()
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(input)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * 台上「问助手」「交给助手」的统一入口（11-19 真机走查：对话收起时点了没反应）。
 *
 * 根因：`useAskAssistantAboutImage` 只把图递进收件箱 + `OPEN_PANEL 'enhance'`；而工作台
 * 上助手住在 `StudioShell` 的对话栏里，收起 / 展开是外壳自己的 `conversationCollapsed`，
 * 不看 `panels.enhance` —— 图递进去了，栏没拉回来，用户看不到任何变化。
 * 这里在递图之后再让外壳把对话拉回来（`expandStudioShellConversation`，对话本来开着时
 * 什么都不做），然后把焦点交给输入框。
 */
export function useStudioAskAssistant(): (
  generation: GenerationRecord,
) => void {
  const askAssistantAboutImage = useAskAssistantAboutImage()
  return useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      askAssistantAboutImage(generation)
      expandStudioShellConversation()
      focusOperatorInputWhenReady()
    },
    [askAssistantAboutImage],
  )
}
