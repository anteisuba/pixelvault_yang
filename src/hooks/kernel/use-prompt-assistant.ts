'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import type {
  LoraAssistantContext,
  PromptAssistantLoraResult,
  PromptAssistantMessage,
  PromptAssistantMode,
  PromptAssistantResponseLanguage,
} from '@/types'
import {
  chatPromptAssistantAPI,
  getAssistantConversationAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'

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

/**
 * Display-only superset of `PromptAssistantMessage` — carries the F2
 * structured LoRA result (docs/plans/lora-assistant-nl2tag-2026-07.md §1.2)
 * alongside the plain-text `content` fallback so `PromptAssistantPanel` can
 * render a result card instead of a text bubble. `lora` never leaves the
 * client: `toWireMessages` strips it before every network call (server
 * schemas only know `{role, content}` and would silently drop it anyway —
 * stripping client-side just avoids re-serializing tag arrays on every
 * subsequent turn).
 */
export interface PromptAssistantDisplayMessage extends PromptAssistantMessage {
  lora?: PromptAssistantLoraResult
}

interface PromptAssistantState {
  messages: PromptAssistantDisplayMessage[]
  sessionId: string | null
  isLoading: boolean
  error: string | null
  /** Set alongside `error` when the last request failed — lets callers
   *  distinguish the F1 structured-output validation failure (escape-hatch
   *  eligible, §6) from generic engine/network failures (retry only). */
  errorCode: string | null
}

const INITIAL_STATE: PromptAssistantState = {
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
  errorCode: null,
}

function toWireMessages(
  messages: readonly PromptAssistantDisplayMessage[],
): PromptAssistantMessage[] {
  return messages.map(({ role, content }) => ({ role, content }))
}

/** Shared `send`/`applyPreset`/`retry` options. `loraContext` is the F2 LoRA
 *  persona's opt-in (docs/plans/lora-assistant-nl2tag-2026-07.md §1.2) — only
 *  meaningful together with `mode: 'lora'`; omitting it keeps the legacy
 *  `mode:'lora'` code-block behavior (F1 zero-regression contract). */
export interface PromptAssistantSendOptions {
  modelId?: string
  referenceImageData?: string
  currentPrompt?: string
  apiKeyId?: string
  responseLanguage?: PromptAssistantResponseLanguage
  mode?: PromptAssistantMode
  useInspirationContext?: boolean
  research?: boolean
  loraContext?: LoraAssistantContext
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
  const tErrors = useTranslations('Errors')
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

  // Runs the actual completion + persistence for a fully-assembled message
  // list — shared by `send` (which first optimistically appends the new
  // user turn) and `retry` (which reuses the trailing user message already
  // in state instead of pushing a duplicate bubble).
  const runTurn = useCallback(
    async (
      allMessages: PromptAssistantDisplayMessage[],
      opts?: PromptAssistantSendOptions,
    ) => {
      setPromptAssistantState((prev) => ({
        ...prev,
        messages: allMessages,
        isLoading: true,
        error: null,
        errorCode: null,
      }))

      const result = await chatPromptAssistantAPI({
        messages: toWireMessages(allMessages),
        modelId: opts?.modelId,
        referenceImageData: opts?.referenceImageData,
        currentPrompt: opts?.currentPrompt,
        apiKeyId: opts?.apiKeyId,
        responseLanguage: opts?.responseLanguage,
        mode: opts?.mode,
        useInspirationContext: opts?.useInspirationContext,
        research: opts?.research,
        loraContext: opts?.loraContext,
      })

      if (result.success && result.data) {
        const assistantMessage: PromptAssistantDisplayMessage = {
          role: 'assistant',
          content: result.data.prompt,
          lora: result.data.lora,
        }
        const nextMessages = [...allMessages, assistantMessage]
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
          messages: toWireMessages(nextMessages),
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
          error: getApiErrorMessage(tErrors, result, t('failed')),
          errorCode: result.errorCode ?? null,
        }))
      }
    },
    [t, tErrors],
  )

  const send = useCallback(
    async (text: string, opts?: PromptAssistantSendOptions) => {
      if (!text.trim()) return

      const userMessage: PromptAssistantDisplayMessage = {
        role: 'user',
        content: text.trim(),
      }
      await runTurn([...promptAssistantState.messages, userMessage], opts)
    },
    [runTurn],
  )

  // §6 状态规范：引擎失败/输出验证失败的重试文字链——复用最后一条已在
  // state 里的用户消息，不重新 push（避免重试把同一句话的用户气泡复制
  // 一份）。只有「最后一条是用户消息且带着错误」时才有意义，否则是 no-op。
  const retry = useCallback(
    async (opts?: PromptAssistantSendOptions) => {
      const current = promptAssistantState.messages
      const last = current[current.length - 1]
      if (!last || last.role !== 'user') return
      await runTurn(current, opts)
    },
    [runTurn],
  )

  const applyPreset = useCallback(
    (
      style: keyof typeof STYLE_SHORTCUTS,
      opts?: PromptAssistantSendOptions,
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
    retry,
    applyPreset,
    clear,
  }
}
