import 'server-only'

import { randomUUID } from 'node:crypto'

import {
  APICallError,
  streamText,
  type ModelMessage,
  type ToolResultPart,
} from 'ai'

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOL_VERBS,
} from '@/constants/assistant-operator'
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
import { isGenerationError, ProviderError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { openCharacterImages } from '@/lib/assistant-v3-cards-board'
import { splitAssistantV3History } from '@/lib/assistant-v3-history'
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
import { startCallLog } from '@/services/kernel/assistant-completion.service'
import {
  closeRoundV3,
  closeRoundV3BeforeStop,
  isFatalOperatorToolError,
  operatorCacheKey,
  prepareOperatorTurn,
  resolveResponseLanguage,
  runOperatorTurn,
  runWithOperatorTimeBudget,
  toStepEvent,
  type AssistantOperatorRunOptions,
  type OperatorTurnOptions,
} from '@/services/kernel/assistant-operator.service'
import { loadPicture } from '@/services/kernel/assistant-v3-look.service'
import {
  TITLE_TEXT,
  type V3Context,
} from '@/services/kernel/assistant-v3-steps.service'
import {
  benchContext,
  benchFaceOf,
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
  historyMessages,
  hydratePictures,
  lookedPicturesMessage,
  openingUserMessage,
  stripForFallback,
} from '@/features/assistant/messages'
import { resolveNextModel, type NextModel } from '@/features/assistant/models'
import { buildNextSystemPrompt } from '@/features/assistant/prompt'
import { loadTurnState, saveTurnState } from '@/features/assistant/state'
import {
  AskInputSchema,
  assistantNextTools,
  EditInputSchema,
  GenerateInputSchema,
  FindInputSchema,
  LookInputSchema,
  parseToolInput,
} from '@/features/assistant/tools'

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
/** 同一步里改动没落下还出图，确认卡上就是旧配方（评测里撞见过）。 */
const NOT_RUN_AFTER_FAILED_EDIT =
  'Not shown: an edit earlier in this step did not land, so the bench is not what you meant to generate. Fix that edit first, then call generate again.'

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
      (turnOptions) => runNextTurn(clerkId, request, turnOptions, recording),
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

function toProviderError(provider: string, error: unknown): unknown {
  if (error instanceof ProviderError || isFatalOperatorToolError(error))
    return error
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  const message = error instanceof Error ? error.message : String(error)
  logger.warn('assistant next model call failed', { provider, status, message })
  return new ProviderError(provider, message, {
    ...(status === undefined ? {} : { status }),
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

async function* runNextTurn(
  clerkId: string,
  initialRequest: AssistantOperatorRequest,
  options: OperatorTurnOptions,
  recording: NextTurnRecording,
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
  const request: AssistantOperatorRequest = {
    ...initialRequest,
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
  })
  const { user, persona, rules, route, run, modelId } = prepared
  const face = benchFaceOf(request.domain)
  const resolved = modelId ? resolveNextModel(route, modelId) : null
  // 板子画不出来（LoRA 台没带 LoRA 那一块、角色页没带角色）同 v3：交回旧执行器。
  const benchReady =
    face === ASSISTANT_V3_FACE_IDS.lora
      ? Boolean(request.snapshot.loras)
      : face === ASSISTANT_V3_FACE_IDS.cards
        ? Boolean(request.snapshot.cards)
        : true
  if (!face || !resolved || !modelId || !benchReady) {
    // 新内核接不了的厂商 / 台：交回旧执行器（与 v3 同一条退路）。
    yield* runOperatorTurn(clerkId, request, options, prepared)
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
    messages = [openingUserMessage(bench, pictures)]
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

  const history = historyMessages(turns.flatMap((turn) => turn.messages))
  const system = buildNextSystemPrompt({
    face,
    request,
    persona,
    rules,
    memories: prepared.assistantMemories,
    accountName: user.displayName ?? user.username ?? null,
    language,
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
      const kept = await saveTurnState(user.id, {
        turnId,
        hop,
        messages,
        transcript,
        modelPath: model.path,
        modelId,
        attachedNames,
        latestUserText,
        stepSeq: run.stepSeq,
      })
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
        yield { type: ASSISTANT_OPERATOR_EVENTS.message, text: closing }
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
      yield { type: ASSISTANT_OPERATOR_EVENTS.message, text: reply.trim() }
    context.replyText.current = reply

    const results: ToolResultPart[] = []
    const looked: AssistantV3PictureRef[] = []
    let stopped = false
    let editFailed = false
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
        })
      }
      if (stopped) {
        settle({ output: NOT_RUN_AFTER_STOP, error: true })
        continue
      }
      if (editFailed && call.toolName === ASSISTANT_NEXT_TOOL_IDS.generate) {
        settle({ output: NOT_RUN_AFTER_FAILED_EDIT, error: true })
        continue
      }
      const result = yield* runTool(
        context,
        call,
        attachedNames,
        latestUserText,
        aliases,
      )
      settle(result)
      if (result.pictures?.length) looked.push(...result.pictures)
      if (result.stop) stopped = true
      if (result.error && call.toolName === ASSISTANT_NEXT_TOOL_IDS.edit)
        editFailed = true
    }
    messages = [
      ...messages,
      { role: 'tool', content: results },
      ...(looked.length && context.seesImages
        ? [lookedPicturesMessage(looked)]
        : []),
    ]

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
    default:
      return {
        output: `There is no tool called ${call.toolName}. The tools are find, look, edit, ask and generate.`,
        error: true,
      }
  }
}
