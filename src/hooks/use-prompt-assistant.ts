'use client'

import { useState, useCallback } from 'react'
import type { PromptAssistantMessage } from '@/types'
import { chatPromptAssistantAPI } from '@/lib/api-client'

/** Style preset shortcuts — must stay in sync with prompt-assistant.service */
export const STYLE_SHORTCUTS = {
  detailed:
    'Enhance with rich environment, lighting, material, and texture details.',
  artistic:
    'Enhance with art style references, medium descriptions, and color palette.',
  photorealistic:
    'Enhance with camera parameters, lens specs, lighting setup, and film stock.',
  anime:
    'Enhance with anime descriptors, character design details, and atmosphere.',
  tags: 'Convert to danbooru-style comma-separated tags for NovelAI.',
} as const

interface PromptAssistantState {
  messages: PromptAssistantMessage[]
  isLoading: boolean
  error: string | null
}

const INITIAL_STATE: PromptAssistantState = {
  messages: [],
  isLoading: false,
  error: null,
}

export function usePromptAssistant() {
  const [state, setState] = useState<PromptAssistantState>(INITIAL_STATE)

  const send = useCallback(
    async (
      text: string,
      opts?: {
        modelId?: string
        referenceImageData?: string
        currentPrompt?: string
        apiKeyId?: string
      },
    ) => {
      if (!text.trim()) return

      const userMessage: PromptAssistantMessage = {
        role: 'user',
        content: text.trim(),
      }

      // Optimistically add user message
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
      }))

      const allMessages = [...state.messages, userMessage]

      const result = await chatPromptAssistantAPI({
        messages: allMessages,
        modelId: opts?.modelId,
        referenceImageData: opts?.referenceImageData,
        currentPrompt: opts?.currentPrompt,
        apiKeyId: opts?.apiKeyId,
      })

      if (result.success && result.data) {
        const assistantMessage: PromptAssistantMessage = {
          role: 'assistant',
          content: result.data.prompt,
        }
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
          isLoading: false,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error ?? 'Failed to generate prompt',
        }))
      }
    },
    [state.messages],
  )

  const applyPreset = useCallback(
    (
      style: keyof typeof STYLE_SHORTCUTS,
      opts?: {
        modelId?: string
        referenceImageData?: string
        currentPrompt?: string
        apiKeyId?: string
      },
    ) => {
      const text = STYLE_SHORTCUTS[style]
      if (text) {
        void send(text, opts)
      }
    },
    [send],
  )

  const clear = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    send,
    applyPreset,
    clear,
  }
}
