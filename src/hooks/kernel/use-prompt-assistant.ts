'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import type {
  AssistantWorkbenchState,
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
  AssistantPromptBlock,
  AssistantSetupBlock,
} from '@/types/assistant-protocol'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import { RESEARCH_MODES, type ResearchMode } from '@/constants/research'
import type { ResearchReceipt } from '@/types/research'
import type {
  AssistantConversationMessageStored,
  AssistantConversationSummary,
  AssistantSurfaceId,
} from '@/types/assistant-conversation'
import {
  chatPromptAssistantAPI,
  streamPromptAssistantAPI,
  getAssistantConversationAPI,
  listAssistantConversationsAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { extractAssistantProtocolBlocks } from '@/lib/assistant-protocol-blocks'
import { createAssistantTypewriter } from '@/lib/assistant-typewriter'

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
  /** 档 3 的提示词载荷 —— 回填按钮的唯一来源，见 `lib/assistant-protocol-blocks`。 */
  promptDraft?: AssistantPromptBlock
  /**
   * 工作台配置提案（选模型 / 设张数）。**任何档位都可能有** —— 「该换个模型」
   * 在讨论阶段就成立，不必等到交付提示词。与 `promptDraft` 同样持久化：
   * 它也是交付物，不是那一轮的交互态。
   */
  setup?: AssistantSetupBlock
  /**
   * 这条回答背后那次检索的 `ResearchRun.id`（AI 导演内核切片 1）。
   *
   * **只存 id，证据本体不进 messages** —— 证据包动辄几十 KB，塞进去会让每次会话
   * 读写都拖着它走，而且同一份证据在历史里复制 N 份。要看来源就按 id 水合。
   * 持久化的判据同 `promptDraft`：三轮前那次检索的来源清单今天点开依然是那些来源。
   */
  researchRunId?: string
  /**
   * 这一轮的检索回执（源级状态 / 查询 / 证据条数）。
   *
   * **只活在客户端**，和 `ask` / `next` 同性质：它是 `ResearchRun` 那一行的一个
   * 视图，持久化的是 `researchRunId`。刷新之后回执卡走懒加载重新水合 ——
   * 把同一份状态在 messages 里再存一遍，只会得到两份可能对不上的事实。
   *
   * ⚠ **`undefined` ≠ `grounded:false`**：整体缺席表示这一轮根本没检索（用户
   * 关了，或规划器判定不需要），此时**不渲染回执卡**；`grounded:false` 是打了
   * 源没拿到证据，那要明示「未取得联网证据」。
   *
   * ⚠ `quota_exceeded` 的回执 `runId` 是 `null` —— 所以判「有没有回执」只能看
   * 这个字段，不能看 `researchRunId`。
   */
  research?: ResearchReceipt
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
  /**
   * 「检索中」过渡态 —— 请求已发出、回执还没到的那一段。
   *
   * ⚠ **只在 `researchMode:'forced'` 时为 true**，这是刻意的：`auto` 档要不要
   * 打源由服务端规划器当轮决定，客户端在响应头到达之前**无从得知**。给每一轮
   * 都亮「检索中」，等于让不检索的那些轮先撒一次谎再默默收回。
   */
  researchPending: boolean
}

const INITIAL_STATE: PromptAssistantState = {
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
  errorCode: null,
  sessions: [],
  researchPending: false,
}

function toWireMessages(
  messages: readonly PromptAssistantDisplayMessage[],
): PromptAssistantMessage[] {
  return messages.map(({ role, content }) => ({ role, content }))
}

function toStoredMessages(messages: readonly PromptAssistantDisplayMessage[]) {
  return messages.map(
    ({
      role,
      content,
      mediaReferences,
      promptDraft,
      setup,
      researchRunId,
    }) => ({
      role,
      content,
      ...(mediaReferences?.length ? { mediaReferences } : {}),
      // ⚠ `promptDraft` / `setup` / `researchRunId` 走，`ask` / `next` 不走 ——
      // 判据见 `AssistantConversationMessageSchema.promptDraft` 的注释：
      // 交付物 vs 交互态。
      ...(promptDraft ? { promptDraft } : {}),
      ...(setup ? { setup } : {}),
      ...(researchRunId ? { researchRunId } : {}),
    }),
  )
}

/**
 * 存储形态 → 展示形态。**必须和 `toStoredMessages` 逐字段对着看**。
 *
 * 抽成函数是因为回读原本在两处（首屏水合 / 切历史会话）各写了一份一模一样的
 * 映射 —— 加 `promptDraft` 时漏掉任一处，表现都是「刷新后回填按钮消失」，
 * 而且只在其中一条路上复现，最难查。
 */
function toDisplayMessages(
  stored: readonly AssistantConversationMessageStored[],
): PromptAssistantDisplayMessage[] {
  return stored.map(
    ({
      role,
      content,
      mediaReferences,
      promptDraft,
      setup,
      researchRunId,
    }) => ({
      role,
      content,
      mediaReferences: mediaReferences ?? [],
      ...(promptDraft ? { promptDraft } : {}),
      ...(setup ? { setup } : {}),
      ...(researchRunId ? { researchRunId } : {}),
    }),
  )
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
    if (!unique.has(reference.url)) {
      unique.set(reference.url, {
        ...reference,
        // label 是**展示用**字符串，schema 限 160 字。素材选择器拿 generation 的
        // 完整 prompt 当 label，随便就超；而且**历史会话里已经存了超长 label**，
        // 只修选择器救不了那些行 —— 所以夹在这个漏斗上，新选的和回放的一起管。
        label: reference.label.slice(0, ASSISTANT_MEDIA_LIMITS.maxLabelLength),
      })
    }
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
  /**
   * 联网检索三态（AI 导演内核 · 切片 1）。
   *
   * ⚠ **替代了旧的 `research: boolean`，没有兼容层**。那个布尔在服务端被映射成
   * `forced`（true）/ `auto`（false），表达不出「明确关闭」—— 用户没有关闭手段。
   * 缺省不发这个字段时服务端仍落到 `auto`，所以 `off` 必须显式送。
   */
  researchMode?: ResearchMode
  loraContext?: LoraAssistantContext
  /**
   * §3.0b：当前工作台状态（挂载的 LoRA、选中模型、规格、最近一批生成…）。
   *
   * ⚠ 这条**必须走普通对话轮**。原来 LoRA 的上下文只挂在 `loraContext` 上，而
   * `loraContext` 只在 `mode:'lora'` 分支才写进请求体 —— 用户在输入框打字发的
   * 那一轮根本不带，服务端收到的是 undefined。「助手看不见工作台」的根因是这条
   * 通道不存在，不是字段不够。
   */
  workbenchState?: AssistantWorkbenchState
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
          messages: toDisplayMessages(conversation.messages),
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
  const persistTurn = useCallback(
    async (nextMessages: PromptAssistantDisplayMessage[]) => {
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
    },
    [refreshSessions, surface],
  )

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
        researchPending: opts?.researchMode === RESEARCH_MODES.forced,
      }))

      const shared = {
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
        useInspirationContext: opts?.useInspirationContext,
        researchMode: opts?.researchMode,
        workbenchState: opts?.workbenchState,
      }

      // LoRA 转换轮出的是结构化载荷（标签数组），不是可以边流边看的文字 ——
      // 它留在 JSON 端点。对话轮走流式端点。两条各有各的载荷形态。
      if (opts?.mode === 'lora') {
        const result = await chatPromptAssistantAPI({
          ...shared,
          mode: 'lora',
          loraContext: opts.loraContext,
        })

        if (!result.success || !result.data) {
          setPromptAssistantState(surface, (prev) => ({
            ...prev,
            isLoading: false,
            researchPending: false,
            error: getApiErrorMessage(tErrors, result, t('failed')),
            errorCode: result.errorCode ?? null,
          }))
          return
        }

        const loraReceipt = result.data.research
        const nextMessages: PromptAssistantDisplayMessage[] = [
          ...allMessages,
          {
            role: 'assistant',
            content: result.data.prompt,
            lora: result.data.lora,
            ...(loraReceipt
              ? {
                  research: loraReceipt,
                  ...(loraReceipt.runId
                    ? { researchRunId: loraReceipt.runId }
                    : {}),
                }
              : {}),
          },
        ]
        setPromptAssistantState(surface, (prev) => ({
          ...prev,
          messages: nextMessages,
          isLoading: false,
          researchPending: false,
        }))
        await persistTurn(nextMessages)
        return
      }

      const result = await streamPromptAssistantAPI(shared)
      if (!result.success) {
        setPromptAssistantState(surface, (prev) => ({
          ...prev,
          isLoading: false,
          researchPending: false,
          error: getApiErrorMessage(tErrors, result, t('failed')),
          errorCode: result.errorCode ?? null,
        }))
        return
      }

      // 回执随响应头到达，在正文第一个字之前 —— 「检索中」的过渡态到此为止，
      // 之后由回执卡自己表达四态。
      setPromptAssistantState(surface, (prev) => ({
        ...prev,
        researchPending: false,
      }))

      // 协议块抽取跑在**已显示的文本**上，不是收到的全文 —— 否则打字机还在写正文，
      // 反问卡就先蹦出来了。抽取本身会把没闭合的标记段藏掉，所以标记字符不会被
      // 当成正文打出来。抽取是纯函数，每帧重跑很便宜。
      // 检索回执来自响应头，在正文第一个字之前就到齐了。这里只把 runId 挂到消息上
      // （证据本体不进 messages —— 要看证据从 ResearchRun 水合）。回执的渲染是下一批。
      const receipt = result.research ?? undefined
      // ⚠ `quota_exceeded` 的回执 `runId` 是 null，但回执本身要渲染（用户得知道
      // 「今天的检索额度用完了」）。所以两个字段各挂各的，不能只挂 runId。
      const researchRunId = receipt?.runId ?? undefined
      const render = (
        text: string,
        streamComplete: boolean,
      ): PromptAssistantDisplayMessage[] => {
        const extracted = extractAssistantProtocolBlocks(text, {
          streamComplete,
        })
        return [
          ...allMessages,
          {
            role: 'assistant',
            ...extracted,
            ...(receipt ? { research: receipt } : {}),
            ...(researchRunId ? { researchRunId } : {}),
          },
        ]
      }

      // 呈现层统一走打字机：上游是逐 token 还是一整块，用户看到的都是一个字一个
      // 字长出来（owner 2026-08-18 定的统一标准）。
      const typewriter = createAssistantTypewriter({
        onUpdate: (visible) => {
          setPromptAssistantState(surface, (prev) => ({
            ...prev,
            messages: render(visible, false),
          }))
        },
      })

      try {
        const reader = result.stream.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            typewriter.push(decoder.decode(value, { stream: true }))
          }
          typewriter.push(decoder.decode())
        } finally {
          reader.releaseLock()
        }
      } catch (streamError) {
        // §3.0 点名要的「已流出文字 + 错误尾巴」：把**已经收到**的全部显示出来再
        // 补错误。出错时不再逐字慢慢打 —— 用户要立刻看到「到此为止 + 出了什么事」。
        // 这里用 raw() 不用 visible()：流可能在打字机第一拍之前就挂了，那时
        // visible() 还是空的，拿它当依据等于把已经到手的文字丢掉，正是「文字凭空
        // 消失」。清空是画布现在的做法，别学。
        typewriter.cancel()
        const shown = typewriter.raw()
        setPromptAssistantState(surface, (prev) => ({
          ...prev,
          messages: shown.trim() ? render(shown, true) : allMessages,
          isLoading: false,
          error:
            streamError instanceof Error ? streamError.message : t('failed'),
          errorCode: 'ASSISTANT_STREAM_INTERRUPTED',
        }))
        return
      }

      // 上游结束不等于该显示完了：等打字机把 buffer 打完再收尾。落库、去掉
      // loading、渲染最终协议块都排在这之后 —— 否则会出现「按钮先亮出来、文字还在
      // 往外爬」。
      await typewriter.finish()

      // 这一次抽取知道「不会再有 chunk 了」，才敢对没闭合的载荷下判断（读出来
      // or 报 malformed），而不是继续藏着。
      const finalMessages = render(typewriter.raw(), true)
      const assistantContent = finalMessages.at(-1)?.content ?? ''

      if (!assistantContent.trim()) {
        setPromptAssistantState(surface, (prev) => ({
          ...prev,
          messages: allMessages,
          isLoading: false,
          error: t('failed'),
          errorCode: 'ASSISTANT_EMPTY_STREAM',
        }))
        return
      }

      setPromptAssistantState(surface, (prev) => ({
        ...prev,
        messages: finalMessages,
        isLoading: false,
      }))
      await persistTurn(finalMessages)
    },
    [persistTurn, surface, t, tErrors],
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
        messages: toDisplayMessages(conversation.messages),
        error: null,
        errorCode: null,
      }))
    },
    [surface],
  )

  // 「思考中」和「在写」是两个状态，UI 要分得开：第一个字出现之前转圈，出现之后
  // 转圈就该让位给正在长出来的文字，否则会同时看到「思考中…」和已经写了一半的
  // 回答，读起来像卡住了。
  const lastMessage = state.messages.at(-1)
  const isThinking =
    state.isLoading &&
    !(
      lastMessage?.role === 'assistant' && lastMessage.content.trim().length > 0
    )

  return {
    ...state,
    isThinking,
    send,
    retry,
    applyPreset,
    clear,
    selectSession,
    refreshSessions,
  }
}
