'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import type {
  LoraAssistantContext,
  PromptAssistantLoraResult,
  PromptAssistantMessage,
  PromptAssistantMode,
  PromptAssistantDomain,
  PromptAssistantResponseLanguage,
} from '@/types'
import type { AssistantMediaReference } from '@/types/assistant-media'
import type {
  AssistantAskedPair,
  AssistantClarifyingQuestion,
  AssistantNextStep,
} from '@/types/assistant-protocol'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import type {
  AssistantConversationSummary,
  AssistantSurfaceId,
} from '@/types/assistant-conversation'
import {
  chatPromptAssistantAPI,
  getAssistantConversationAPI,
  listAssistantConversationsAPI,
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
  mediaReferences?: AssistantMediaReference[]
  /**
   * A2 对话协议的两个块。与 `lora` 同性质：**只活在客户端**，`toWireMessages` /
   * `toStoredMessages` 都不带它们走。
   *
   * 不持久化是有意的 —— 反问选项和收敛按钮是**那一轮的交互态**，恢复历史时把
   * 三轮前的按钮重新点亮，点下去只会把一句过期的答复发出去。要回看问过什么，看
   * 的是历史里用户自己那条答复消息，那才是事实。
   */
  ask?: AssistantClarifyingQuestion[]
  next?: AssistantNextStep
  protocolMalformed?: boolean
  /**
   * A2c：这条用户消息回答了哪几个问题。挂在**用户**消息上（`ask` 挂在助手消息
   * 上），「已询问」折叠块由它聚合而成。
   *
   * 同样不持久化：它是**派生数据**，事实源是用户那条答复消息本身，那条是持久化
   * 的。恢复历史后折叠块为空而答复原文仍在 —— 少一个便利视图，不丢任何事实。
   */
  askedPairs?: AssistantAskedPair[]
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
  sessions: AssistantConversationSummary[]
}

const INITIAL_STATE: PromptAssistantState = {
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
  errorCode: null,
  sessions: [],
}

function toWireMessages(
  messages: readonly PromptAssistantDisplayMessage[],
): PromptAssistantMessage[] {
  return messages.map(({ role, content }) => ({ role, content }))
}

function toStoredMessages(messages: readonly PromptAssistantDisplayMessage[]) {
  return messages.map(({ role, content, mediaReferences }) => ({
    role,
    content,
    ...(mediaReferences?.length ? { mediaReferences } : {}),
  }))
}

function collectConversationMediaReferences(
  messages: readonly PromptAssistantDisplayMessage[],
  currentReferences: readonly AssistantMediaReference[] = [],
): AssistantMediaReference[] {
  const candidates = [
    ...currentReferences,
    ...[...messages]
      .reverse()
      .flatMap((message) => message.mediaReferences ?? []),
  ]
  const unique = new Map<string, AssistantMediaReference>()
  for (const reference of candidates) {
    if (!unique.has(reference.url)) unique.set(reference.url, reference)
    if (unique.size >= ASSISTANT_MEDIA_LIMITS.maxReferences) break
  }
  return Array.from(unique.values())
}

/** Shared `send`/`applyPreset`/`retry` options. `loraContext` is the F2 LoRA
 *  persona's opt-in (docs/plans/lora-assistant-nl2tag-2026-07.md §1.2) — only
 *  meaningful together with `mode: 'lora'`; omitting it keeps the legacy
 *  `mode:'lora'` code-block behavior (F1 zero-regression contract). */
export interface PromptAssistantSendOptions {
  modelId?: string
  references?: AssistantMediaReference[]
  assistantDomain?: PromptAssistantDomain
  currentPrompt?: string
  apiKeyId?: string
  responseLanguage?: PromptAssistantResponseLanguage
  mode?: PromptAssistantMode
  useInspirationContext?: boolean
  research?: boolean
  loraContext?: LoraAssistantContext
  /** A2c：这一发是反问卡的答复时，带上结构化的问答对（见 `AssistantAskedPair`）。 */
  askedPairs?: AssistantAskedPair[]
}

// ─── Module-level store，按 surface 分槽 ─────────────────────────────
// StudioAssistantDock returns null when closed (and the mobile drawer
// unmounts its content too), so a plain useState here loses the
// conversation on every close. Hoisting to module scope — same
// useSyncExternalStore pattern as the dock width store in
// StudioAssistantDock.tsx — lets the conversation survive close/reopen.
//
// ⚠ A1：原来这里是**一个**单例，注释写的理由是「同一时刻只挂一个 panel，所以单例
// 安全」。那句话对「一个 panel」成立，对「一份对话」不成立 —— 图片 / 视频 / LoRA
// 三处共用它，切页面时上一页的对话原样躺在下一页里。分槽后每个域各存各的；
// 「关掉浮卡不丢对话」这个原始诉求不受影响，因为槽是按 surface 而不是按挂载。

const promptAssistantStates = new Map<
  AssistantSurfaceId,
  PromptAssistantState
>()
const promptAssistantListeners = new Map<AssistantSurfaceId, Set<() => void>>()

function readState(surface: AssistantSurfaceId): PromptAssistantState {
  return promptAssistantStates.get(surface) ?? INITIAL_STATE
}

function getServerPromptAssistantSnapshot(): PromptAssistantState {
  return INITIAL_STATE
}

function setPromptAssistantState(
  surface: AssistantSurfaceId,
  updater: (prev: PromptAssistantState) => PromptAssistantState,
): void {
  promptAssistantStates.set(surface, updater(readState(surface)))
  for (const listener of promptAssistantListeners.get(surface) ?? []) {
    listener()
  }
}

/**
 * @param surface 这段对话归哪个域。**没有默认值是有意的** —— 猜错的表现是「对话
 * 安静地进了别的域的历史」，而那正是 A1 要修的病。
 */
export function usePromptAssistant(surface: AssistantSurfaceId) {
  const t = useTranslations('PromptAssistant')
  const tErrors = useTranslations('Errors')
  const subscribe = useCallback(
    (listener: () => void) => {
      const listeners =
        promptAssistantListeners.get(surface) ?? new Set<() => void>()
      listeners.add(listener)
      promptAssistantListeners.set(surface, listeners)
      return () => {
        listeners.delete(listener)
      }
    },
    [surface],
  )
  const getSnapshot = useCallback(() => readState(surface), [surface])
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerPromptAssistantSnapshot,
  )

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getAssistantConversationAPI({ surface }),
      listAssistantConversationsAPI({ surface, limit: 30 }),
    ]).then(([result, list]) => {
      if (cancelled) return
      setPromptAssistantState(surface, (prev) => {
        const sessions = list.success ? list.data : prev.sessions
        if (!result.success || !result.data || prev.messages.length > 0) {
          return { ...prev, sessions }
        }
        const conversation = result.data
        return {
          ...prev,
          sessions,
          sessionId: conversation.id,
          messages: conversation.messages.map(
            ({ role, content, mediaReferences }) => ({
              role,
              content,
              mediaReferences: mediaReferences ?? [],
            }),
          ),
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [surface])

  const refreshSessions = useCallback(async () => {
    const result = await listAssistantConversationsAPI({
      surface,
      limit: 30,
    })
    if (result.success) {
      setPromptAssistantState(surface, (prev) => ({
        ...prev,
        sessions: result.data,
      }))
    }
  }, [surface])

  // Runs the actual completion + persistence for a fully-assembled message
  // list — shared by `send` (which first optimistically appends the new
  // user turn) and `retry` (which reuses the trailing user message already
  // in state instead of pushing a duplicate bubble).
  const runTurn = useCallback(
    async (
      allMessages: PromptAssistantDisplayMessage[],
      opts?: PromptAssistantSendOptions,
    ) => {
      setPromptAssistantState(surface, (prev) => ({
        ...prev,
        messages: allMessages,
        isLoading: true,
        error: null,
        errorCode: null,
      }))

      const result = await chatPromptAssistantAPI({
        messages: toWireMessages(allMessages),
        modelId: opts?.modelId,
        references: collectConversationMediaReferences(
          allMessages,
          opts?.references,
        ),
        assistantDomain: opts?.assistantDomain,
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
          ask: result.data.ask,
          next: result.data.next,
          protocolMalformed: result.data.protocolMalformed,
        }
        const nextMessages = [...allMessages, assistantMessage]
        setPromptAssistantState(surface, (prev) => ({
          ...prev,
          messages: nextMessages,
          isLoading: false,
        }))
        const currentSessionId = readState(surface).sessionId
        const persisted = await upsertAssistantConversationAPI({
          ...(currentSessionId ? { id: currentSessionId } : {}),
          surface,
          projectId: null,
          messages: toStoredMessages(nextMessages),
        })
        if (persisted.success) {
          setPromptAssistantState(surface, (prev) => ({
            ...prev,
            sessionId: persisted.data.id,
          }))
          void refreshSessions()
        }
      } else {
        setPromptAssistantState(surface, (prev) => ({
          ...prev,
          isLoading: false,
          error: getApiErrorMessage(tErrors, result, t('failed')),
          errorCode: result.errorCode ?? null,
        }))
      }
    },
    [refreshSessions, surface, t, tErrors],
  )

  const send = useCallback(
    async (text: string, opts?: PromptAssistantSendOptions) => {
      if (!text.trim()) return

      const userMessage: PromptAssistantDisplayMessage = {
        role: 'user',
        content: text.trim(),
        mediaReferences: opts?.references?.slice(
          0,
          ASSISTANT_MEDIA_LIMITS.maxReferences,
        ),
        ...(opts?.askedPairs?.length ? { askedPairs: opts.askedPairs } : {}),
      }
      await runTurn([...readState(surface).messages, userMessage], opts)
    },
    [runTurn, surface],
  )

  // §6 状态规范：引擎失败/输出验证失败的重试文字链——复用最后一条已在
  // state 里的用户消息，不重新 push（避免重试把同一句话的用户气泡复制
  // 一份）。只有「最后一条是用户消息且带着错误」时才有意义，否则是 no-op。
  const retry = useCallback(
    async (opts?: PromptAssistantSendOptions) => {
      const current = readState(surface).messages
      const last = current[current.length - 1]
      if (!last || last.role !== 'user') return
      await runTurn(current, opts)
    },
    [runTurn, surface],
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
    setPromptAssistantState(surface, (prev) => ({
      ...INITIAL_STATE,
      sessions: prev.sessions,
    }))
  }, [surface])

  const selectSession = useCallback(
    async (id: string) => {
      const result = await getAssistantConversationAPI({ surface, id })
      if (!result.success || !result.data) return
      const conversation = result.data
      setPromptAssistantState(surface, (prev) => ({
        ...prev,
        sessionId: conversation.id,
        messages: conversation.messages.map(
          ({ role, content, mediaReferences }) => ({
            role,
            content,
            mediaReferences: mediaReferences ?? [],
          }),
        ),
        error: null,
        errorCode: null,
      }))
    },
    [surface],
  )

  return {
    ...state,
    send,
    retry,
    applyPreset,
    clear,
    selectSession,
    refreshSessions,
  }
}
