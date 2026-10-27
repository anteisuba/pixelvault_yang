import 'server-only'

import { randomUUID } from 'node:crypto'

import { after } from 'next/server'
import {
  APICallError,
  streamText,
  type ModelMessage,
  type ToolResultPart,
} from 'ai'

import {
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOL_VERBS,
} from '@/constants/assistant-operator'
import type { AssistantRouteModel } from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  ASSISTANT_TURN_RECORD_LIMITS,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS as TURN_OUTCOME,
} from '@/constants/assistant-turn-record'
import {
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
  type AssistantV3Tool,
} from '@/constants/assistant-v3'
import { getGenerationErrorI18nKey } from '@/constants/generation-errors'
import { isGenerationError, ProviderError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { voiceCueRules } from '@/lib/chat-voice'
import { openCharacterImages } from '@/lib/assistant-v3-cards-board'
import {
  assistantV3HistoryMessages,
  pinnedAssistantV3History,
  planAssistantV3History,
  splitAssistantV3History,
} from '@/lib/assistant-v3-history'
import type { PromptAssistantResponseLanguage } from '@/types'
import type {
  AssistantOperatorEvent,
  AssistantOperatorRequest,
  AssistantOperatorWebSearchResult,
} from '@/types/assistant-operator'
import type { AssistantTurnRecordOutcome } from '@/types/assistant-turn-record'
import type {
  AssistantV3PictureRef,
  AssistantV3Transcript,
} from '@/types/assistant-v3'
import {
  recordAssistantTurn,
  type AssistantTurnDraft,
} from '@/services/assistant-turn-record.service'
import { listNextAssistantMemoriesForPrompt } from '@/services/assistant-memory.service'
import { getHomeChatCharacterId } from '@/services/assistant-persona.service'
import {
  learnCreatorPhrases,
  shouldLearnPhrases,
} from '@/services/cards/character-learned-phrases.service'
import {
  reflectOnChat,
  shouldReflect,
} from '@/services/cards/character-reflection.service'
import { loadAssistantSkills } from '@/services/assistant-skill.service'
import { startCallLog } from '@/services/kernel/assistant-completion.service'
import {
  loadAssistantV3HistorySummaries,
  scheduleAssistantV3HistorySummary,
} from '@/services/kernel/assistant-v3-history.service'
import {
  closeRoundV3,
  closeRoundV3BeforeStop,
  isFatalOperatorToolError,
  operatorCacheKey,
  prepareOperatorTurn,
  requestProjectId,
  resolveResponseLanguage,
  runWithOperatorTimeBudget,
  toStepEvent,
  type AssistantOperatorRunOptions,
  type OperatorTurnOptions,
} from '@/services/kernel/assistant-operator.service'
import { loadPicture } from '@/services/kernel/assistant-v3-look.service'
import { refused } from '@/services/kernel/assistant-v3-bench.service'
import {
  joinPhrases,
  planSafely,
  settlePlan,
  TITLE_TEXT,
  type V3Context,
} from '@/services/kernel/assistant-v3-steps.service'
import {
  landedCanvasResult,
  type CanvasBatch,
} from '@/features/assistant/canvas'
import {
  benchContext,
  benchFaceOf,
  isHomeDraftSnapshot,
  boardEntry,
  renderBench,
  runAsk,
  runEdit,
  runGenerate,
  runFind,
  runLook,
  type BenchResult,
} from '@/features/assistant/bench'
import { benchAliases } from '@/features/assistant/workspace.service'
import {
  ASSISTANT_NEXT_LIMITS,
  ASSISTANT_NEXT_PROMPT_VERSION,
  ASSISTANT_NEXT_TOOL_IDS,
} from '@/features/assistant/constants'
import {
  clearOldToolResults,
  historyMessages,
  hydratePictures,
  lookedPicturesMessage,
  openingUserMessage,
  stripForFallback,
} from '@/features/assistant/messages'
import { resolveNextModel, type NextModel } from '@/features/assistant/models'
import {
  buildNextSystemPrompt,
  chatCharacterOf,
  chatReminder,
  workMoodReminder,
} from '@/features/assistant/prompt'
import {
  BUILTIN_SKILLS,
  renderCalledSkills,
  skillsSettingsNote,
} from '@/features/assistant/skills'
import {
  loadTurnState,
  saveTurnState,
  type NextTurnState,
  type PendingCanvasEdit,
} from '@/features/assistant/state'
import {
  AskInputSchema,
  assistantNextTools,
  EditInputSchema,
  GenerateInputSchema,
  FindInputSchema,
  LookInputSchema,
  OpenInputSchema,
  parseToolInput,
} from '@/features/assistant/tools'
import {
  openedOutput,
  planOpen,
  type BenchOpening,
} from '@/features/assistant/open'

/**
 * 助手新内核的主循环（总设计第一节的流程图）：
 *
 *   调模型 → 模型要用工具就执行 → 结果原样接在后面 → 再调模型 …… 直到模型不再要工具（说完了）、
 *   停在卡上（问你 / 出图确认）、或创作者按停。⛔ 没有步数上限、⛔ 没有「同一错 N 次就停」。
 *
 * 一次请求最多跑到软线（约 2 分钟）：在两步之间把这一轮的样子存到服务端（`state.ts`），交给浏览器
 * 一张只带轮号的接力条，浏览器自动接着发下一次，从这里接着跑（所有台都接力）。
 *
 * 和 v3 不同的几处（都为了不绊住模型，见 model-interfaces.md）：
 *  · 每一步把模型的**完整回复**原样接回去（思考、签名、自带联网的结果），思路接得上；
 *  · 各家**自带的联网 / 读网页**直接挂上，搜不搜、搜几次模型自己定；
 *  · 看过的图一直留在眼前（超过上限才把最早的换成一行字）；
 *  · 思考档整轮用创作者选的那一档；
 *  · 工具入参宽进（`parseToolInput`），读不懂才回一句哪一格不对，⛔ 不按家族判死。
 *
 * ⛔ 钱闸不变：`generate` 只出确认卡；扳机在浏览器——「交给 AI 出图」开着时浏览器替创作者按
 *   （一句话最多 4 张），关着时创作者自己按。出完都停下问「按这个方向继续吗？」（第 5b 步）。
 */

const EMPTY_REPLY: Record<PromptAssistantResponseLanguage, string> = {
  chinese: '这一步模型没有给出任何回复。再说一次，或者换个说法。',
  japanese:
    'このステップではモデルから返答がありませんでした。もう一度、または言い方を変えてお願いします。',
  english:
    'The model gave no reply this time. Say it again, or put it another way.',
}

const CONTENT_FILTERED: Record<PromptAssistantResponseLanguage, string> = {
  chinese:
    '这一步被模型服务商的内容审核拦下了。换一个助手模型再试，或者告诉我先避开哪些内容。',
  japanese:
    'このステップはモデル提供元のコンテンツ審査で止められました。モデルを切り替えるか、避けたい内容を教えてください。',
  english:
    "This step was stopped by the model provider's content filter. Switch the assistant to another model, or tell me what to leave out.",
}

const NOT_RUN_AFTER_STOP =
  'Not run: this turn stopped on a card to wait for the creator.'
/** 画布：同一步里前面的 edit 还在落，板子还不是新的样子。 */
const NOT_RUN_WHILE_BOARD_CHANGES =
  'Not run: an edit earlier in this step is still landing on the board. Call it again in your next step if you still need it.'
/** 画布那一批交出去了、接力条没存下：落没落这一跳不知道。 */
const LANDING_UNKNOWN =
  'BOARD — sent to the board; whether it landed is not known yet. Look at the cards you changed before you build on them.'
/** 同一步里改动没落下还出图，确认卡上就是旧配方（评测里撞见过）。 */
/** 开台（第 9e 步）：同一步里排在 `open` 后面的调用 —— 到了新台再做。 */
const NOT_RUN_AFTER_OPEN =
  'Not run: you opened another bench in this step. Do it there, after the result shows the new bench.'
/** 接力条没存下：这一次开不了台。 */
const OPEN_NOT_KEPT =
  'Could not open it right now. Tell the creator which bench to switch to, or carry on here.'
const NOT_RUN_AFTER_FAILED_EDIT =
  'Not shown: an edit earlier in this step did not land, so the bench is not what you meant to generate. Fix that edit first, then call generate again.'

const NEXT_HISTORY_WINDOW = {
  maxChars: ASSISTANT_NEXT_LIMITS.maxHistoryChars,
  maxMessages: ASSISTANT_NEXT_LIMITS.maxHistoryMessages,
  blockTurns: ASSISTANT_NEXT_LIMITS.historyBlockTurns,
} as const

/**
 * 记得的事（第 6 步，owner 10-23）：「关于你」+ 角色页上开着的那位自己那份。隐身不读；读不出来就当没有
 * （记忆是锦上添花，⛔ 掀翻这一轮）。
 */
async function nextMemories(
  userId: string,
  clerkId: string,
  request: AssistantOperatorRequest,
  chatCharacterId: string | null,
) {
  if (request.incognito === true) return []
  try {
    return await listNextAssistantMemoriesForPrompt(userId, {
      // 和角色聊天：读的是正在聊的那位那份（第 7a 步 D）；否则角色页上开着的那位。
      characterCardId:
        chatCharacterId ?? request.snapshot.cards?.open?.id ?? null,
      // 画布：这个项目自己那份（第 9a 步）。
      projectId:
        request.domain === ASSISTANT_V3_FACE_IDS.canvas
          ? requestProjectId(request)
          : null,
      limit: ASSISTANT_NEXT_LIMITS.maxMemoriesInPrompt,
    })
  } catch (error) {
    logger.warn('assistant next memories not loaded', {
      userId: clerkId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

interface NextTurnRecording {
  turn?: Omit<AssistantTurnDraft, 'request' | 'outcome' | 'errorCode'>
  ending?: AssistantTurnRecordOutcome
}

export async function* runAssistantNext(
  clerkId: string,
  request: AssistantOperatorRequest,
  options: AssistantOperatorRunOptions = {},
): AsyncIterable<AssistantOperatorEvent> {
  const recording: NextTurnRecording = {}
  let outcome: AssistantTurnRecordOutcome = TURN_OUTCOME.aborted
  let errorCode: string | undefined
  try {
    for await (const event of runWithOperatorTimeBudget(
      options,
      (turnOptions) =>
        runNextTurn(
          clerkId,
          request,
          turnOptions,
          recording,
          options.routeModel,
        ),
    )) {
      outcome = turnOutcomeOf(event, recording, outcome)
      if (event.type === ASSISTANT_OPERATOR_EVENTS.error)
        errorCode = event.errorCode
      yield event
    }
  } catch (error) {
    outcome = TURN_OUTCOME.error
    errorCode = isGenerationError(error)
      ? error.errorCode
      : ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE
    throw error
  } finally {
    // 每一跳收尾都记一笔（过程记录表，与 v3 同一张）：⛔ 不等、不抛；隐身那一轮不记。
    const turn = recording.turn
    if (turn && !request.incognito)
      recordAssistantTurn({
        ...turn,
        request,
        outcome,
        ...(errorCode ? { errorCode } : {}),
      })
  }
}

function turnOutcomeOf(
  event: AssistantOperatorEvent,
  recording: NextTurnRecording,
  current: AssistantTurnRecordOutcome,
): AssistantTurnRecordOutcome {
  if (event.type === ASSISTANT_OPERATOR_EVENTS.done)
    return recording.ending ?? TURN_OUTCOME.done
  if (event.type === ASSISTANT_OPERATOR_EVENTS.error) return TURN_OUTCOME.error
  if (event.type !== ASSISTANT_OPERATOR_EVENTS.stopped) return current
  switch (event.reason) {
    case ASSISTANT_OPERATOR_STOP_REASONS.timeBudget:
    case ASSISTANT_OPERATOR_STOP_REASONS.canvasSync:
      return TURN_OUTCOME.relay
    case ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm:
      return TURN_OUTCOME.awaitingConfirm
    default:
      return TURN_OUTCOME.aborted
  }
}

/** 浏览器带回来的接力条：v3 形状的本轮记录，只有板子那一条、只带轮号。 */
function relayTokenOf(request: AssistantOperatorRequest) {
  const head = request.v3?.transcript?.[0]
  return head?.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board && head.turn
    ? head.turn
    : null
}

function relayToken(turnId: string, hop: number): AssistantV3Transcript {
  return [
    {
      type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board,
      text: '',
      images: [],
      turn: { id: turnId, hop },
    },
  ]
}

/** 第一次调用就被厂商拒掉（参数、工具、接口不认）：值得换成保守接法再试。key / 额度 / 限流不算。 */
function isRejectedByProvider(error: unknown): boolean {
  if (!APICallError.isInstance(error)) return false
  const status = error.statusCode
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![401, 402, 403, 408, 429].includes(status)
  )
}

/**
 * 厂商的真话在 responseBody 里（`message` 往往只有一句 `Forbidden`）：拿它按出图同一张
 * 码表认原因，认出来就带上对应文案（余额 / key / 限流…），⛔ 不再一律「模型调用失败」。
 */
function providerReasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!APICallError.isInstance(error) || !error.responseBody) return message
  try {
    const body = JSON.parse(error.responseBody) as unknown
    const reason =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).error
        : undefined
    if (typeof reason === 'string') return `${message}: ${reason}`
    if (typeof reason === 'object' && reason !== null) {
      const inner = (reason as Record<string, unknown>).message
      if (typeof inner === 'string') return `${message}: ${inner}`
    }
  } catch {
    // 不是 JSON：原样截一段。
  }
  return `${message}: ${error.responseBody.slice(0, 300)}`
}

function toProviderError(provider: string, error: unknown): unknown {
  if (error instanceof ProviderError || isFatalOperatorToolError(error))
    return error
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  const message = providerReasonOf(error)
  logger.warn('assistant next model call failed', { provider, status, message })
  const i18nKey = getGenerationErrorI18nKey(message, {
    hasReferenceImage: false,
  })
  return new ProviderError(provider, message, {
    ...(status === undefined ? {} : { status }),
    ...(i18nKey ? { i18nKey } : {}),
  })
}

/** 一次调用的两只表：首个分片前、分片之间静默多久算卡住。 */
function watchCall() {
  const controller = new AbortController()
  let fired = false
  const fire = () => {
    fired = true
    controller.abort()
  }
  let idle = setTimeout(fire, ASSISTANT_NEXT_LIMITS.firstChunkMs)
  return {
    signal: controller.signal,
    onChunk() {
      clearTimeout(idle)
      idle = setTimeout(fire, ASSISTANT_NEXT_LIMITS.silenceMs)
    },
    timedOut: () => fired,
    dispose: () => clearTimeout(idle),
  }
}

interface ClientCall {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: unknown
}

interface SearchStep {
  readonly id: string
  readonly title: string
  readonly query: string
}

function queryOf(input: unknown): string {
  if (typeof input === 'string') {
    try {
      return queryOf(JSON.parse(input) as unknown)
    } catch {
      return input
    }
  }
  if (typeof input === 'object' && input !== null) {
    const record = input as Record<string, unknown>
    if (typeof record.query === 'string') return record.query
    if (typeof record.url === 'string') return record.url
    if (typeof record.action === 'object') return queryOf(record.action)
  }
  return ''
}

/**
 * 入参读不懂的调用，SDK 会自己在回复里补一条报错结果；我们随后还要交回自己的那条（说清哪里
 * 不对），两条同 id 的结果厂商会拒收（Claude：each tool_use must have a single result）。
 * 所以 SDK 补的那条拿掉，只留我们的。
 */
function withoutSdkResults(
  messages: readonly ModelMessage[],
  calls: readonly { toolCallId: string }[],
): ModelMessage[] {
  const ours = new Set(calls.map((call) => call.toolCallId))
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role !== 'tool') return [message]
    const content = message.content.filter(
      (part) => part.type !== 'tool-result' || !ours.has(part.toolCallId),
    )
    return content.length > 0 ? [{ ...message, content }] : []
  })
}

const KNOWN_TOOLS: ReadonlySet<string> = new Set(
  Object.values(ASSISTANT_NEXT_TOOL_IDS),
)

/** 本轮记录那一列用 v3 的工具枚举（线格式不变）：`find` 记成 `search_library`，认不出的记成 `read`。 */
function transcriptTool(name: string): AssistantV3Tool {
  if (name === ASSISTANT_NEXT_TOOL_IDS.find)
    return ASSISTANT_V3_TOOL_IDS.searchLibrary
  return (
    KNOWN_TOOLS.has(name) ? name : ASSISTANT_V3_TOOL_IDS.read
  ) as AssistantV3Tool
}

/** 你在这段里说了第几句：正好是间隔的倍数就排一次学说法（`after`，⛔ 拖慢这一轮）。 */
function learnPhrasesAfterTurn(input: {
  userId: string
  cardId: string
  messages: AssistantOperatorRequest['messages']
  assistant: Parameters<typeof learnCreatorPhrases>[0]['assistant']
}) {
  const said = input.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  if (!shouldLearnPhrases(said.length)) return
  try {
    after(() =>
      learnCreatorPhrases({
        userId: input.userId,
        cardId: input.cardId,
        said,
        assistant: input.assistant,
      }),
    )
  } catch (error) {
    // 不在请求里（单测 / 脚本）：学不了就算了。
    logger.warn('assistant next phrase learning not scheduled', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 你在这段里说的第 30 句（的倍数）：响应发完之后她整理一次（C：日记、关系、记忆、改卡）。
 * ⚠ 和学说法同一种触发（⛔ 定时任务，owner 10-26）。
 */
function reflectAfterTurn(input: {
  userId: string
  cardId: string
  messages: AssistantOperatorRequest['messages']
  assistant: Parameters<typeof reflectOnChat>[0]['assistant']
  conversationId?: string | undefined
}) {
  const said = input.messages.filter((message) => message.role === 'user')
  if (!shouldReflect(said.length)) return
  try {
    after(() =>
      reflectOnChat({
        userId: input.userId,
        cardId: input.cardId,
        messages: input.messages,
        assistant: input.assistant,
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
      }),
    )
  } catch (error) {
    logger.warn('assistant next reflection not scheduled', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 没开台 = 和现在这位聊天（用户 10-26：她的对话只有一份，收台聊天、开台工作，⛔ 开关）。会话自己盖过章的
 * 旧聊天照它自己的。读不出来就照工作口吻答（⛔ 掀翻这一轮）。
 */
async function homeChatCharacter(clerkId: string): Promise<string | null> {
  try {
    return await getHomeChatCharacterId(clerkId)
  } catch (error) {
    logger.warn('assistant next home chat character not loaded', {
      userId: clerkId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function* runNextTurn(
  clerkId: string,
  initialRequest: AssistantOperatorRequest,
  options: OperatorTurnOptions,
  recording: NextTurnRecording,
  routeModel?: AssistantRouteModel,
): AsyncIterable<AssistantOperatorEvent> {
  const signal = options.signal
  if (signal.aborted) {
    yield {
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
    }
    return
  }
  // 片子由浏览器抽好帧随 `videoClips` 上来；附件里的视频不交给准备那一步（同 v3）。
  /**
   * 首页带着一份小配方（第 9g 步）：对话里直接出图。台上那一套（改法、确认卡、出图那一枪）照图片台走，
   * 会话仍记在首页（`workspaceKey` 不变）；系统提示那一段按首页写。
   */
  const homeDraft =
    initialRequest.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.home &&
    isHomeDraftSnapshot(initialRequest.snapshot)
  const homeChatCharacterId =
    initialRequest.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.home &&
    !initialRequest.chatCharacterId
      ? await homeChatCharacter(clerkId)
      : null
  const request: AssistantOperatorRequest = {
    ...initialRequest,
    ...(homeChatCharacterId ? { chatCharacterId: homeChatCharacterId } : {}),
    ...(homeDraft ? { domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.image } : {}),
    ...(initialRequest.mediaAttachments
      ? {
          mediaAttachments: initialRequest.mediaAttachments.filter(
            (item) => item.kind !== 'video',
          ),
        }
      : {}),
  }
  const prepared = await prepareOperatorTurn(clerkId, request, signal, {
    skipPriorRounds: true,
    homeDraft,
    ...(routeModel ? { routeModel } : {}),
  })
  const { user, persona, rules, route, run, modelId } = prepared
  // 和角色聊天（第 7a 步 D）：自己的系统提示、记忆挂她身上、故事向摘要、每轮末尾一句「别出戏」。
  const chat = chatCharacterOf(persona)
  /**
   * 她说的那几段带记号（②c-2）：在聊天 = 界面拆成一行一个气泡；用着角色 = 🔊 开着时念出来
   * （聊天整段念、开着台只念首尾段）。
   */
  const chatReply = {
    ...(chat ? { chat: true as const } : {}),
    ...(persona.characterCardId ? { spoken: true as const } : {}),
  }
  const face = benchFaceOf(request.domain)
  const resolved = modelId ? resolveNextModel(route, modelId) : null
  // 板子画不出来（LoRA 台没带 LoRA 那一块、角色页没带角色、画布没带画面）：各台宿主都会带，缺了是请求坏了。
  const benchReady =
    face === ASSISTANT_V3_FACE_IDS.lora
      ? Boolean(request.snapshot.loras)
      : face === ASSISTANT_V3_FACE_IDS.cards
        ? Boolean(request.snapshot.cards)
        : face === ASSISTANT_V3_FACE_IDS.canvas
          ? Boolean(request.snapshot.canvas)
          : true
  if (!face || !resolved || !modelId || !benchReady) {
    // 旧内核第 9c 步已删，⛔ 没有退路：说清是哪一样没对上（厂商都在 `resolveNextModel` 里）。
    logger.warn('assistant next cannot run this request', {
      userId: clerkId,
      domain: request.domain,
      face,
      adapterType: route.adapterType,
      benchReady,
    })
    yield {
      type: ASSISTANT_OPERATOR_EVENTS.error,
      error: 'The assistant cannot work on this page yet',
      errorCode: ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE,
    }
    return
  }
  run.skipReferenceReview = true
  run.mainModelLooks = true
  run.nextKernel = true
  const language = resolveResponseLanguage(request, persona)

  const token = relayTokenOf(request)
  const saved = token ? await loadTurnState(user.id, token.id) : null
  if (token && !saved)
    logger.warn('assistant next relay state missing, starting the turn again', {
      userId: clerkId,
      turnId: token.id,
    })
  const turnId = saved?.turnId ?? randomUUID()
  const hop = saved
    ? Math.min(saved.hop + 1, ASSISTANT_TURN_RECORD_LIMITS.maxHops)
    : 1

  const { turns, latest } = splitAssistantV3History(request.messages)
  const latestUserText = saved?.latestUserText ?? latest
  // 和她聊天：你每说第 8 句，响应发完之后学一次你的说法（原在聊天页，用户 10-26 并进对话）。
  if (chat && !saved && request.incognito !== true) {
    learnPhrasesAfterTurn({
      userId: user.id,
      cardId: chat.id,
      messages: request.messages,
      assistant: { route, modelId },
    })
    reflectAfterTurn({
      userId: user.id,
      cardId: chat.id,
      messages: request.messages,
      assistant: { route, modelId },
      conversationId: request.conversationId,
    })
  }
  // 这个人眼前的技能（内置 + 改版 / 关掉 + 自己写的，第 7b 步）；读不出来就只有内置的。
  const skills = await loadAssistantSkills(user.id).catch((error) => {
    logger.warn('assistant skills load failed, using built-ins', {
      userId: clerkId,
      error: error instanceof Error ? error.message : String(error),
    })
    return [...BUILTIN_SKILLS]
  })
  const mentioned = (request.mentionedAssets ?? []).slice(
    0,
    ASSISTANT_V3_LIMITS.maxLookCards,
  )
  const attachedNames =
    saved?.attachedNames ?? mentioned.map((asset) => asset.label ?? asset.id)
  const context: V3Context = benchContext({
    face,
    clerkId,
    prepared,
    request,
    language,
    stepPrefix: `n${hop}`,
    board: boardEntry('', []),
    modelId,
  })
  run.stepSeq = saved?.stepSeq ?? 0

  let model: NextModel = resolved
  while (saved && model.path !== saved.modelPath && model.fallback)
    model = model.fallback

  const transcript: AssistantV3Transcript = saved ? [...saved.transcript] : []
  // 台上的参考图 / 结果各自是哪一张（ref-N / result-N ↔ 图_N），每一跳现读。
  const aliases = await benchAliases(user.id, request.snapshot).catch(() => '')
  let messages: ModelMessage[]
  if (saved) {
    // 做到一半换了型号（或换了接法）：旧型号的思考块与它自己跑的联网，新型号多半读不懂、
    // 厂商会拒收 —— 先拿掉，只留说的话与改动记录，⛔ 不等报错再退。
    const switched =
      model.path !== saved.modelPath ||
      (saved.modelId !== undefined && saved.modelId !== modelId)
    messages = switched ? stripForFallback(saved.messages) : [...saved.messages]
  } else {
    const bench = renderBench(context, attachedNames, latestUserText, aliases)
    const pictures: AssistantV3PictureRef[] = context.seesImages
      ? [
          ...(face === ASSISTANT_V3_FACE_IDS.lora &&
          request.snapshot.viewingRecipe
            ? [
                {
                  url: request.snapshot.viewingRecipe.recipe.imageUrl,
                  label: 'sample',
                },
              ]
            : []),
          // 角色页：打开那位的图跟着板子给模型看（card-1 …），与 v3 同一个叫法。
          ...(face === ASSISTANT_V3_FACE_IDS.cards
            ? openCharacterImages(request.snapshot.cards?.open)
                .slice(0, ASSISTANT_V3_LIMITS.maxLookCards)
                .map((url, index) => ({ url, label: `card-${index + 1}` }))
            : []),
          ...mentioned.map((asset) => ({
            url: asset.url,
            label: asset.label ?? asset.id,
          })),
        ]
      : []
    // 「别出戏」放在这一轮的消息里（⛔ 进系统提示：每轮都变会废掉缓存）。
    const userTurns = request.messages.filter(
      (message) => message.role === 'user',
    ).length
    // 工作台用角色：这一轮的口吻只管开头和收尾（10-26「三处怎么说话」）。
    const reminder = chat
      ? chatReminder(persona, userTurns)
      : workMoodReminder(persona, userTurns)
    // 会被念出来（聊天页开着声音）：方括号语气提示的写法，和薄管子同一段（⛔ 进系统提示：开关随时会变）。
    const voice = request.chatVoice
      ? `HOW YOUR VOICE SOUNDS\n${voiceCueRules(request.chatVoice.expressive)}\n- These cues are not stage directions: they are allowed, and they are how the voice gets its feeling.${
          chat
            ? ''
            : '\n- While a bench is open only your first and last paragraphs are read aloud: put the cues there, never in the report between them.'
        }`
      : null
    // 「/」点名的技能：全文直接进这一轮的消息，不等模型自己去读。
    const called = renderCalledSkills(latestUserText, skills)
    messages = [
      openingUserMessage(
        [bench, called, voice, reminder].filter(Boolean).join('\n\n'),
        pictures,
      ),
    ]
    transcript.push({
      type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board,
      text: bench.slice(0, ASSISTANT_V3_LIMITS.maxBoardChars),
      images: pictures.slice(0, ASSISTANT_V3_LIMITS.maxLookCards * 2),
      turn: { id: turnId, hop },
    })
  }
  const opening = transcript[0]
  if (opening?.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board) {
    transcript[0] = { ...opening, turn: { id: turnId, hop } }
    context.transcript[0] = { ...opening, turn: { id: turnId, hop } }
  }
  // 画布：上一跳交给浏览器落的那一批，这一跳按落没落、新画面补上结果，再接着跑。
  if (saved?.pending) {
    const landed: ToolResultPart[] = saved.pending.canvas.map((edit) => {
      const result = landedCanvasResult({
        context,
        priorSteps: request.priorSteps ?? [],
        callId: edit.toolCallId,
        batchInput: edit.input,
        ...(edit.knownIds ? { knownIds: edit.knownIds } : {}),
      })
      const output = `${edit.lines}\nBOARD — ${result.output}`
      transcript.push({
        type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
        id: edit.toolCallId.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
        tool: transcriptTool(edit.toolName),
        output: output.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
        error: result.error,
      })
      return {
        type: 'tool-result',
        toolCallId: edit.toolCallId,
        toolName: edit.toolName,
        output: result.error
          ? { type: 'error-text', value: output }
          : { type: 'text', value: output },
      }
    })
    // 开台（第 9e 步）：到了新台，这次 open 的结果就是新台的板子。
    const opened: ToolResultPart[] = []
    const open = saved.pending.open
    if (open) {
      const result = openedOutput(context, open.opening, () =>
        renderBench(context, attachedNames, latestUserText, aliases),
      )
      transcript.push({
        type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
        id: open.toolCallId.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
        tool: transcriptTool(open.toolName),
        output: result.output.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
        error: result.error,
      })
      opened.push({
        type: 'tool-result',
        toolCallId: open.toolCallId,
        toolName: open.toolName,
        output: result.error
          ? { type: 'error-text', value: result.output }
          : { type: 'text', value: result.output },
      })
    }
    messages = clearOldToolResults([
      ...messages,
      {
        role: 'tool',
        content: [...saved.pending.results, ...landed, ...opened],
      },
      ...(saved.pending.looked.length && context.seesImages
        ? [lookedPicturesMessage(saved.pending.looked)]
        : []),
    ])
  }

  /**
   * ⭐ 之前几轮（第 6 步）：按块开窗，滑出去的那几轮用后台写好的摘要接在系统提示里；缺口交给后台补
   *   （这一轮回完才跑，用这一轮的型号与 key、低档思考）。接力那几跳照第一跳定下的窗口与摘要，逐字不变。
   */
  const historyOwner = {
    userId: user.id,
    clerkId,
    conversationId: request.conversationId,
    incognito: request.incognito === true,
  }
  const historyPlan = saved?.history
    ? pinnedAssistantV3History(turns, saved.history)
    : planAssistantV3History({
        turns,
        ...(await loadAssistantV3HistorySummaries(historyOwner)),
        window: NEXT_HISTORY_WINDOW,
      })
  if (!saved)
    scheduleAssistantV3HistorySummary({
      owner: historyOwner,
      plan: historyPlan,
      turns,
      route,
      modelId,
      domain: request.domain,
      cacheKey: operatorCacheKey(run, 'historySummary'),
      ...(chat ? { kind: 'story' as const } : {}),
    })
  const pinnedHistory = {
    turns: turns.length - historyPlan.start,
    ...(historyPlan.summary ? { summary: historyPlan.summary } : {}),
  }
  const history = historyMessages(
    assistantV3HistoryMessages(turns, historyPlan.start),
  )
  const system = buildNextSystemPrompt({
    face: homeDraft ? ASSISTANT_V3_FACE_IDS.home : face,
    request,
    persona,
    rules,
    memories: await nextMemories(user.id, clerkId, request, chat?.id ?? null),
    historySummary: historyPlan.summary,
    accountName: user.displayName ?? user.username ?? null,
    language,
    skillsNote: skillsSettingsNote(skills),
  })
  recording.turn = {
    userId: user.id,
    turnId,
    hop,
    transcript,
    adapterType: route.adapterType,
    modelId,
    routeModel: persona.routeModel,
    apiKeyId: run.apiKeyId ?? null,
    systemPrompt: system.text,
    promptVersion: ASSISTANT_NEXT_PROMPT_VERSION,
  }
  const cacheKey = operatorCacheKey(run, 'next')
  const loadBytes = async (url: string) => {
    const picture = await loadPicture(context.pictures, url, signal)
    return picture ? { data: picture.data, mediaType: picture.mediaType } : null
  }
  const text = TITLE_TEXT[language]
  const keepState = (pending?: NextTurnState['pending']) =>
    saveTurnState(user.id, {
      turnId,
      hop,
      messages,
      transcript,
      modelPath: model.path,
      modelId,
      attachedNames,
      latestUserText,
      stepSeq: run.stepSeq,
      history: pinnedHistory,
      ...(pending ? { pending } : {}),
    })
  let emptyRetried = false
  let timeoutRetried = false
  let succeededOnce = Boolean(saved)

  for (let step = 0; ; step += 1) {
    if (signal.aborted) {
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      }
      return
    }
    if (step > 0 && options.pastSoftBudget()) {
      // 先存好这一轮的样子，再交接力条：浏览器接着发下一次，从这里接着跑。
      const kept = await keepState()
      if (kept)
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.transcript,
          transcript: relayToken(turnId, hop),
        }
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.timeBudget,
      }
      return
    }

    const callLog = startCallLog(
      {
        callLog: {
          purpose: 'next',
          domain: request.domain,
          step,
          effort: persona.reasoningEffort,
        },
        route,
        modelId,
      },
      1,
    )
    const watch = watchCall()
    let reply = ''
    let restart = true
    let filtered = false
    let chunks = 0
    const calls: ClientCall[] = []
    const searches = new Map<string, SearchStep>()
    const sources: AssistantOperatorWebSearchResult[] = []
    let response: { messages: ModelMessage[] }
    try {
      const result = streamText({
        model: model.model,
        system: model.system(system),
        messages: model.messages([
          ...history,
          ...(await hydratePictures(messages, loadBytes)),
        ]),
        tools: {
          ...assistantNextTools(model.strictTools),
          ...model.nativeTools,
        },
        toolChoice: 'auto',
        maxRetries: 2,
        ...(model.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: model.maxOutputTokens }),
        abortSignal: AbortSignal.any([signal, watch.signal]),
        providerOptions: model.providerOptions(
          cacheKey,
          persona.reasoningEffort,
        ),
      })
      for await (const part of result.fullStream) {
        watch.onChunk()
        chunks += 1
        switch (part.type) {
          case 'text-delta':
            if (!part.text) break
            reply += part.text
            yield {
              type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
              delta: part.text,
              ...(restart ? { restart: true as const } : {}),
              ...chatReply,
            }
            restart = false
            break
          case 'tool-call':
            if (part.providerExecuted) {
              // 厂商自己跑的联网 / 读网页：时间线上一行「联网查 …」，结果由模型自己读。
              // 没有查询词也没有网址的（Claude 联网时自己跑的整理代码）不出行。
              const query = queryOf(part.input)
              if (!query) break
              run.stepSeq += 1
              const search: SearchStep = {
                id: `${context.stepPrefix}-${run.stepSeq}`,
                title: `${text.searchWeb} ${query}`.slice(
                  0,
                  ASSISTANT_OPERATOR_LIMITS.maxTitleChars,
                ),
                query,
              }
              searches.set(part.toolCallId, search)
              yield searchStepEvent(search, STATUS.running)
            } else {
              calls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
              })
            }
            break
          case 'tool-error':
            // SDK 认不出的入参（不是合法 JSON）：它先发一条 `invalid` 的 tool-call、再发这条
            // tool-error —— 同一个调用只收一次，交给我们自己的解析再判。
            if (
              !part.providerExecuted &&
              !calls.some((call) => call.toolCallId === part.toolCallId)
            ) {
              calls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
              })
            }
            break
          case 'source':
            if (
              part.sourceType === 'url' &&
              sources.length < ASSISTANT_OPERATOR_LIMITS.maxWebSearchResults
            )
              sources.push({
                title: (part.title ?? part.url).slice(
                  0,
                  ASSISTANT_OPERATOR_LIMITS.maxTitleChars,
                ),
                url: part.url,
                snippet: '',
              })
            break
          case 'error':
            throw part.error
          case 'finish':
            if (!reply && calls.length === 0)
              filtered = part.finishReason === 'content-filter'
            break
          default:
            break
        }
      }
      if (watch.timedOut())
        throw new ProviderError('assistant-next', 'Model call timed out.', {
          timeout: true,
        })
      response = await result.response
      const usage = await result.usage
      callLog.onUsage({
        ...(usage.inputTokens === undefined
          ? {}
          : { inputTokens: usage.inputTokens }),
        ...(usage.outputTokens === undefined
          ? {}
          : { outputTokens: usage.outputTokens }),
        ...(usage.outputTokenDetails.reasoningTokens === undefined
          ? {}
          : { reasoningTokens: usage.outputTokenDetails.reasoningTokens }),
        ...(usage.inputTokenDetails.cacheReadTokens === undefined
          ? {}
          : { cachedInputTokens: usage.inputTokenDetails.cacheReadTokens }),
        ...(usage.inputTokenDetails.cacheWriteTokens === undefined
          ? {}
          : { cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens }),
      })
      callLog.finish('ok')
    } catch (error) {
      callLog.finish(signal.aborted ? 'aborted' : 'error')
      watch.dispose()
      if (signal.aborted) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
        }
        return
      }
      if (watch.timedOut() && !timeoutRetried) {
        timeoutRetried = true
        logger.warn('assistant next model call timed out, asking again', {
          userId: clerkId,
          step,
          modelId,
        })
        continue
      }
      // 新接法被厂商拒了（参数 / 工具不认）：整轮换成保守接法，从这一步重来。
      if (
        model.fallback &&
        isRejectedByProvider(error) &&
        (!succeededOnce || chunks === 0)
      ) {
        logger.warn('assistant next falling back to the plain path', {
          userId: clerkId,
          from: model.path,
          to: model.fallback.path,
          status: APICallError.isInstance(error) ? error.statusCode : undefined,
          message:
            error instanceof Error
              ? error.message.slice(0, 300)
              : String(error),
        })
        model = model.fallback
        messages = stripForFallback(messages)
        continue
      }
      throw toProviderError(route.adapterType, error)
    }
    watch.dispose()
    succeededOnce = true
    timeoutRetried = false

    for (const search of searches.values())
      yield searchStepEvent(search, STATUS.done, sources)
    if (searches.size === 0 && sources.length > 0) {
      // Gemini 的联网不出调用分片，只出来源：补一行，让创作者看得到它查过。
      run.stepSeq += 1
      yield searchStepEvent(
        {
          id: `${context.stepPrefix}-${run.stepSeq}`,
          title: text.searchWeb,
          query: 'web',
        },
        STATUS.done,
        sources,
      )
    }

    // 模型的完整回复原样接上（思考、签名、联网结果都在里面），下一步原样交回。
    messages = [...messages, ...withoutSdkResults(response.messages, calls)]
    transcript.push({
      type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant,
      text: reply.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
      // 我们的工具调用排前面：一步里联网多了也不会把它们挤出记录。
      calls: [
        ...calls.map((call) => ({
          id: call.toolCallId.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
          tool: transcriptTool(call.toolName),
          input: JSON.stringify(call.input ?? {}).slice(
            0,
            ASSISTANT_V3_LIMITS.maxEntryChars,
          ),
        })),
        ...[...searches.entries()].map(([id, search]) => ({
          id: id.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
          tool: ASSISTANT_V3_TOOL_IDS.searchWeb as AssistantV3Tool,
          input: JSON.stringify({ query: search.query }).slice(
            0,
            ASSISTANT_V3_LIMITS.maxEntryChars,
          ),
        })),
      ].slice(0, ASSISTANT_V3_LIMITS.maxCallsPerMessage),
    })
    for (const [id] of searches)
      transcript.push({
        type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
        id: id.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
        tool: ASSISTANT_V3_TOOL_IDS.searchWeb,
        // 标题也记上：过程记录与评测判分只看得到这一行（摘要是厂商加密的，读不到）。
        output: sources
          .map((source) => `${source.title} — ${source.url}`)
          .join('\n')
          .slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
        error: false,
      })

    if (calls.length === 0) {
      const closing = reply.trim()
      if (!closing) {
        if (filtered) {
          recording.ending = TURN_OUTCOME.contentFilter
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.message,
            text: CONTENT_FILTERED[language],
          }
          yield { type: ASSISTANT_OPERATOR_EVENTS.done }
          return
        }
        // 一个字都没回：原样再问一次（只多问一次）；还是空就如实说。
        if (!emptyRetried && run.ledgerSteps === 0) {
          emptyRetried = true
          messages = messages.slice(
            0,
            messages.length - response.messages.length,
          )
          transcript.pop()
          continue
        }
        recording.ending =
          run.ledgerSteps > 0 ? TURN_OUTCOME.quiet : TURN_OUTCOME.empty
        if (run.ledgerSteps === 0)
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.message,
            text: EMPTY_REPLY[language],
          }
      } else {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: closing,
          ...chatReply,
        }
      }
      const roundSummary = await closeRoundV3(run, {
        clerkId,
        userId: user.id,
        ...(closing ? { closingMessage: closing } : {}),
      })
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.done,
        ...(roundSummary ? { roundSummary } : {}),
      }
      return
    }

    if (reply.trim())
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.message,
        text: reply.trim(),
        ...chatReply,
      }
    context.replyText.current = reply

    const results: ToolResultPart[] = []
    const looked: AssistantV3PictureRef[] = []
    let stopped = false
    let editFailed = false
    /** 画布：这一步里交给浏览器落的那几次 edit（合成一批，落完再接着跑）。 */
    const boardEdits: {
      call: ClientCall
      lines: string
      batch: CanvasBatch
    }[] = []
    /** 开台（第 9e 步）：这一步里那次 open（排在最后跑，存好再停）。 */
    let opening: { call: ClientCall; opening: BenchOpening } | null = null
    for (const call of calls) {
      const settle = (result: BenchResult) => {
        results.push({
          type: 'tool-result',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: result.error
            ? { type: 'error-text', value: result.output }
            : { type: 'text', value: result.output },
        })
        transcript.push({
          type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
          id: call.toolCallId.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
          tool: transcriptTool(call.toolName),
          output: result.output.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
          error: result.error,
          ...(result.pictures?.length
            ? {
                images: result.pictures.slice(
                  0,
                  ASSISTANT_V3_LIMITS.maxLookCards,
                ),
              }
            : {}),
          ...(result.finds?.length ? { finds: [...result.finds] } : {}),
        })
        // 画布出图前的核对按本轮记录认「已经报过」；联网找到的 `#n` 也按它换回那一张
        // （v3 执行函数读 context 那一份）。
        if (face === ASSISTANT_V3_FACE_IDS.canvas || result.finds?.length)
          context.transcript.push(transcript[transcript.length - 1]!)
      }
      if (stopped) {
        settle({ output: NOT_RUN_AFTER_STOP, error: true })
        continue
      }
      if (opening) {
        settle({ output: NOT_RUN_AFTER_OPEN, error: true })
        continue
      }
      if (editFailed && call.toolName === ASSISTANT_NEXT_TOOL_IDS.generate) {
        settle({ output: NOT_RUN_AFTER_FAILED_EDIT, error: true })
        continue
      }
      if (
        boardEdits.length > 0 &&
        call.toolName !== ASSISTANT_NEXT_TOOL_IDS.edit
      ) {
        settle({ output: NOT_RUN_WHILE_BOARD_CHANGES, error: true })
        continue
      }
      const result = yield* runTool(
        context,
        call,
        attachedNames,
        latestUserText,
        aliases,
      )
      if (result.canvas) {
        boardEdits.push({ call, lines: result.output, batch: result.canvas })
        continue
      }
      if (result.opening) {
        opening = { call, opening: result.opening }
        continue
      }
      settle(result)
      if (result.pictures?.length) looked.push(...result.pictures)
      if (result.stop) stopped = true
      if (result.error && call.toolName === ASSISTANT_NEXT_TOOL_IDS.edit)
        editFailed = true
    }
    if (boardEdits.length > 0) {
      const settleBoard = (
        edit: (typeof boardEdits)[number],
        board: BenchResult,
      ) => {
        results.push({
          type: 'tool-result',
          toolCallId: edit.call.toolCallId,
          toolName: edit.call.toolName,
          output: board.error
            ? { type: 'error-text', value: `${edit.lines}\n${board.output}` }
            : { type: 'text', value: `${edit.lines}\n${board.output}` },
        })
        transcript.push({
          type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
          id: edit.call.toolCallId.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
          tool: transcriptTool(edit.call.toolName),
          output: `${edit.lines}\n${board.output}`.slice(
            0,
            ASSISTANT_V3_LIMITS.maxEntryChars,
          ),
          error: board.error,
        })
      }
      if (stopped) {
        for (const edit of boardEdits)
          settleBoard(edit, {
            output: `BOARD — ${NOT_RUN_AFTER_STOP}`,
            error: true,
          })
      } else {
        const ops = boardEdits.flatMap((edit) => edit.batch.ops)
        const title = joinPhrases(
          context,
          boardEdits.map((edit) => edit.batch.title),
        )
        const outcome =
          ops.length > ASSISTANT_OPERATOR_CANVAS_LIMITS.maxBatchOps
            ? yield* refused(
                context,
                ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch,
                title,
                `That is ${ops.length} board changes at once; at most ${ASSISTANT_OPERATOR_CANVAS_LIMITS.maxBatchOps} land together. Split them over two edits.`,
              )
            : yield* settlePlan(
                context,
                ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch,
                title,
                await planSafely(
                  context,
                  ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch,
                  { ops },
                ),
              )
        if (outcome.kind === 'pending') {
          // 交给浏览器落：存好这一步（结果待补），交接力条，停在 canvas_sync。
          const knownIds = context.nodes.map((node) => node.id)
          const pending: PendingCanvasEdit[] = boardEdits.map((edit) => ({
            toolCallId: edit.call.toolCallId,
            toolName: edit.call.toolName,
            lines: edit.lines,
            input: edit.batch.input,
            ...(edit.batch.createsCards ? { knownIds } : {}),
          }))
          const kept = await keepState({ results, looked, canvas: pending })
          if (kept) {
            yield {
              type: ASSISTANT_OPERATOR_EVENTS.transcript,
              transcript: relayToken(turnId, hop),
            }
            yield {
              type: ASSISTANT_OPERATOR_EVENTS.stopped,
              reason: ASSISTANT_OPERATOR_STOP_REASONS.canvasSync,
            }
            return
          }
          // 存不下：浏览器照样落，这一跳接着跑，结果写「还不知道」。
          for (const edit of boardEdits)
            settleBoard(edit, { output: LANDING_UNKNOWN, error: false })
        } else if (outcome.kind === 'stop') {
          stopped = true
          for (const edit of boardEdits)
            settleBoard(edit, {
              output: `BOARD — waiting for the creator: ${outcome.todo}`,
              error: false,
            })
        } else {
          const output = outcome.kind === 'result' ? outcome.output : ''
          const error = outcome.kind === 'result' && outcome.error
          for (const edit of boardEdits)
            settleBoard(edit, { output: `BOARD — ${output}`, error })
        }
      }
    }

    if (opening) {
      const settleOpen = (output: string) => {
        results.push({
          type: 'tool-result',
          toolCallId: opening.call.toolCallId,
          toolName: opening.call.toolName,
          output: { type: 'error-text', value: output },
        })
        transcript.push({
          type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
          id: opening.call.toolCallId.slice(
            0,
            ASSISTANT_V3_LIMITS.maxCallIdChars,
          ),
          tool: transcriptTool(opening.call.toolName),
          output,
          error: true,
        })
      }
      if (stopped) settleOpen(NOT_RUN_AFTER_STOP)
      else {
        // 交给浏览器换台：存好这一步（open 的结果待补），交接力条，停在 bench_open。
        const kept = await keepState({
          results,
          looked,
          canvas: [],
          open: {
            toolCallId: opening.call.toolCallId,
            toolName: opening.call.toolName,
            opening: opening.opening,
          },
        })
        if (kept) {
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.transcript,
            transcript: relayToken(turnId, hop),
          }
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.stopped,
            reason: ASSISTANT_OPERATOR_STOP_REASONS.benchOpen,
            open: opening.opening.target,
          }
          return
        }
        settleOpen(OPEN_NOT_KEPT)
      }
    }

    // 工具结果攒多了就清掉旧的长结果（一次清到底，之后前缀不动）；要细节模型自己再查。
    messages = clearOldToolResults([
      ...messages,
      { role: 'tool', content: results },
      ...(looked.length && context.seesImages
        ? [lookedPicturesMessage(looked)]
        : []),
    ])

    if (stopped) {
      const roundSummary = await closeRoundV3BeforeStop(run, {
        clerkId,
        userId: user.id,
      })
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
        ...(roundSummary ? { roundSummary } : {}),
      }
      return
    }
  }
}

function searchStepEvent(
  search: SearchStep,
  status: typeof STATUS.running | typeof STATUS.done,
  results: readonly AssistantOperatorWebSearchResult[] = [],
): AssistantOperatorEvent {
  return toStepEvent({
    id: search.id,
    tool: ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
    verb: ASSISTANT_OPERATOR_TOOL_VERBS[ASSISTANT_OPERATOR_TOOL_IDS.searchWeb],
    title: search.title || 'web',
    status,
    payload: {
      query:
        search.query.slice(
          0,
          ASSISTANT_OPERATOR_LIMITS.maxWebSearchQueryChars,
        ) || 'web',
      limit: ASSISTANT_OPERATOR_LIMITS.maxWebSearchResults,
    },
    result:
      status === STATUS.done
        ? { totalFound: results.length, results: [...results] }
        : null,
  })
}

async function* runTool(
  context: V3Context,
  call: ClientCall,
  attachedNames: readonly string[],
  latestUserText: string,
  aliases: string,
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  switch (call.toolName) {
    case ASSISTANT_NEXT_TOOL_IDS.find: {
      const parsed = parseToolInput(FindInputSchema, call.input, call.toolName)
      if (!parsed.ok) return { output: parsed.error, error: true }
      return yield* runFind(context, parsed.value)
    }
    case ASSISTANT_NEXT_TOOL_IDS.look: {
      const parsed = parseToolInput(LookInputSchema, call.input, call.toolName)
      if (!parsed.ok) return { output: parsed.error, error: true }
      return yield* runLook(
        context,
        parsed.value,
        attachedNames,
        latestUserText,
        aliases,
      )
    }
    case ASSISTANT_NEXT_TOOL_IDS.edit: {
      const parsed = parseToolInput(EditInputSchema, call.input, call.toolName)
      if (!parsed.ok) return { output: parsed.error, error: true }
      return yield* runEdit(context, parsed.value.changes)
    }
    case ASSISTANT_NEXT_TOOL_IDS.ask: {
      const parsed = parseToolInput(AskInputSchema, call.input, call.toolName)
      if (!parsed.ok) return { output: parsed.error, error: true }
      return yield* runAsk(context, parsed.value)
    }
    case ASSISTANT_NEXT_TOOL_IDS.generate: {
      const parsed = parseToolInput(
        GenerateInputSchema,
        call.input,
        call.toolName,
      )
      if (!parsed.ok) return { output: parsed.error, error: true }
      return yield* runGenerate(context, parsed.value)
    }
    case ASSISTANT_NEXT_TOOL_IDS.open: {
      const parsed = parseToolInput(OpenInputSchema, call.input, call.toolName)
      if (!parsed.ok) return { output: parsed.error, error: true }
      return await planOpen(context, parsed.value)
    }
    default:
      return {
        output: `There is no tool called ${call.toolName}. The tools are find, look, edit, ask, generate and open.`,
        error: true,
      }
  }
}
