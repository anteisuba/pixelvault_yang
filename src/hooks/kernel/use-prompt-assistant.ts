'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'

import type {
  PromptAssistantMessage,
  PromptAssistantMode,
  PromptAssistantResponseLanguage,
} from '@/types'
import { chatPromptAssistantAPI } from '@/lib/api-client'

/** Style preset shortcuts — must stay in sync with prompt-assistant.service */
export const STYLE_SHORTCUTS = {
  imageStyle:
    'Extract a reusable image generation style prompt from the reference image. Prioritize recognizable style families, medium, material, shape language, lighting, and rendering cues. Include concrete references when appropriate, such as Apple Memoji, Bitmoji, soft clay figurine, rounded Pixar-like 3D cartoon avatar. Avoid identifying real people; describe visual style only.',
  detailed:
    'Enhance with rich environment, lighting, material, and texture details.',
  artistic:
    'Enhance with art style references, medium descriptions, and color palette.',
  photorealistic:
    'Enhance with camera parameters, lens specs, lighting setup, and film stock.',
  anime:
    'Enhance with anime descriptors, character design details, and atmosphere.',
  lora: 'Convert my request into a LoRA-ready image prompt. Preserve any LoRA trigger words already in the current prompt, then write English comma-separated diffusion tags and short control phrases. If a reference image is attached, use it only for requested visual attributes such as clothing, outfit, materials, colors, and accessories; keep the LoRA character identity from the trigger words. Return the positive prompt only.',
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
  const t = useTranslations('PromptAssistant')
  const [state, setState] = useState<PromptAssistantState>(INITIAL_STATE)

  const send = useCallback(
    async (
      text: string,
      opts?: {
        modelId?: string
        referenceImageData?: string
        currentPrompt?: string
        apiKeyId?: string
        responseLanguage?: PromptAssistantResponseLanguage
        mode?: PromptAssistantMode
        useInspirationContext?: boolean
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
        responseLanguage: opts?.responseLanguage,
        mode: opts?.mode,
        useInspirationContext: opts?.useInspirationContext,
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
          error: result.error ?? t('failed'),
        }))
      }
    },
    [state.messages, t],
  )

  const applyPreset = useCallback(
    (
      style: keyof typeof STYLE_SHORTCUTS,
      opts?: {
        modelId?: string
        referenceImageData?: string
        currentPrompt?: string
        apiKeyId?: string
        responseLanguage?: PromptAssistantResponseLanguage
        mode?: PromptAssistantMode
        useInspirationContext?: boolean
      },
    ) => {
      const text = STYLE_SHORTCUTS[style]
      if (text) {
        void send(text, {
          ...opts,
          mode: style === 'lora' ? 'lora' : opts?.mode,
        })
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
