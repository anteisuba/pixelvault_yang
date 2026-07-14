'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import type {
  PromptAssistantMessage,
  PromptAssistantMode,
  PromptAssistantResponseLanguage,
} from '@/types'
import {
  chatPromptAssistantAPI,
  getAssistantConversationAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'

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
  sessionId: string | null
  isLoading: boolean
  error: string | null
}

const INITIAL_STATE: PromptAssistantState = {
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
}

// ─── Module-level store ──────────────────────────────────────────
// StudioAssistantDock returns null when closed (and the mobile drawer
// unmounts its content too), so a plain useState here loses the
// conversation on every close. Hoisting to module scope — same
// useSyncExternalStore pattern as the dock width store in
// StudioAssistantDock.tsx — lets the conversation survive close/reopen.
// Only one PromptAssistantPanel is ever mounted at a time (desktop dock
// XOR mobile drawer), so a singleton is safe.

let promptAssistantState: PromptAssistantState = INITIAL_STATE
const promptAssistantListeners = new Set<() => void>()

function getPromptAssistantSnapshot(): PromptAssistantState {
  return promptAssistantState
}

function getServerPromptAssistantSnapshot(): PromptAssistantState {
  return INITIAL_STATE
}

function subscribePromptAssistant(listener: () => void): () => void {
  promptAssistantListeners.add(listener)
  return () => {
    promptAssistantListeners.delete(listener)
  }
}

function setPromptAssistantState(
  updater: (prev: PromptAssistantState) => PromptAssistantState,
): void {
  promptAssistantState = updater(promptAssistantState)
  for (const listener of promptAssistantListeners) {
    listener()
  }
}

export function usePromptAssistant() {
  const t = useTranslations('PromptAssistant')
  const state = useSyncExternalStore(
    subscribePromptAssistant,
    getPromptAssistantSnapshot,
    getServerPromptAssistantSnapshot,
  )

  useEffect(() => {
    let cancelled = false
    void getAssistantConversationAPI({ surface: 'STUDIO' }).then((result) => {
      if (cancelled || !result.success || !result.data) return
      const conversation = result.data
      setPromptAssistantState((prev) => {
        if (prev.messages.length > 0) return prev
        return {
          ...prev,
          sessionId: conversation.id,
          messages: conversation.messages.map(({ role, content }) => ({
            role,
            content,
          })),
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

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
        research?: boolean
      },
    ) => {
      if (!text.trim()) return

      const userMessage: PromptAssistantMessage = {
        role: 'user',
        content: text.trim(),
      }

      const allMessages = [...promptAssistantState.messages, userMessage]

      // Optimistically add user message
      setPromptAssistantState((prev) => ({
        ...prev,
        messages: allMessages,
        isLoading: true,
        error: null,
      }))

      const result = await chatPromptAssistantAPI({
        messages: allMessages,
        modelId: opts?.modelId,
        referenceImageData: opts?.referenceImageData,
        currentPrompt: opts?.currentPrompt,
        apiKeyId: opts?.apiKeyId,
        responseLanguage: opts?.responseLanguage,
        mode: opts?.mode,
        useInspirationContext: opts?.useInspirationContext,
        research: opts?.research,
      })

      if (result.success && result.data) {
        const assistantMessage: PromptAssistantMessage = {
          role: 'assistant',
          content: result.data.prompt,
        }
        const nextMessages = [
          ...promptAssistantState.messages,
          assistantMessage,
        ]
        setPromptAssistantState((prev) => ({
          ...prev,
          messages: nextMessages,
          isLoading: false,
        }))
        const persisted = await upsertAssistantConversationAPI({
          ...(promptAssistantState.sessionId
            ? { id: promptAssistantState.sessionId }
            : {}),
          surface: 'STUDIO',
          projectId: null,
          messages: nextMessages,
        })
        if (persisted.success) {
          setPromptAssistantState((prev) => ({
            ...prev,
            sessionId: persisted.data.id,
          }))
        }
      } else {
        setPromptAssistantState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error ?? t('failed'),
        }))
      }
    },
    [t],
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
        research?: boolean
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
    setPromptAssistantState(() => INITIAL_STATE)
  }, [])

  return {
    ...state,
    send,
    applyPreset,
    clear,
  }
}
