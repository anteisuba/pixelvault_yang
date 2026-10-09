import 'server-only'

import {
  streamText,
  tool,
  type ModelMessage,
  type ToolResultPart,
  type UserContent,
} from 'ai'

import { assistantAdapterSupportsImage } from '@/constants/assistant'
import {
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  type AssistantOperatorRejectReason,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_EDIT_OP_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_TOOLS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
  ASSISTANT_V3_WRITE_MODE_IDS,
  type AssistantV3Tool,
} from '@/constants/assistant-v3'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { ProviderError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { fetchAsBuffer } from '@/services/storage/r2'
import {
  assistantV3CanvasNodes,
  buildAssistantV3Handles,
  renderAssistantV3Board,
  renderAssistantV3Card,
  type AssistantV3Handles,
} from '@/lib/assistant-v3-board'
import {
  translateAssistantV3Edit,
  translateAssistantV3Write,
} from '@/lib/assistant-v3-ops'
import type { PromptAssistantResponseLanguage } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorEvent,
  AssistantOperatorPriorStep,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import {
  AssistantV3AskInputSchema,
  AssistantV3EditInputSchema,
  AssistantV3GenerateInputSchema,
  AssistantV3LookInputSchema,
  AssistantV3ReadInputSchema,
  AssistantV3SearchLibraryInputSchema,
  AssistantV3SearchWebInputSchema,
  AssistantV3WriteInputSchema,
  type AssistantV3EditOpInput,
  type AssistantV3Transcript,
  type AssistantV3TranscriptCall,
  type AssistantV3TranscriptEntry,
  type AssistantV3WriteEntry,
} from '@/types/assistant-v3'
import { startCallLog } from '@/services/kernel/assistant-completion.service'
import {
  closeRound,
  closeRoundBeforeStop,
  isFatalOperatorToolError,
  normalizePlanQuestions,
  OPERATOR_OUT_OF_STEPS_MESSAGES,
  OPERATOR_SAME_FAILURE_MESSAGES,
  operatorCacheKey,
  planTool,
  prepareOperatorTurn,
  recordLedgerStep,
  rememberStepArtifacts,
  resolveResponseLanguage,
  runOperatorTurn,
  runWithOperatorTimeBudget,
  TOOL_FAILED_DETAIL,
  toStepEvent,
  type AssistantOperatorRunOptions,
  type OperatorTurnOptions,
  type PreparedOperatorTurn,
  type ToolPlan,
} from '@/services/kernel/assistant-operator.service'
import { resolveAssistantV3Model } from '@/services/kernel/assistant-v3-model.service'
import { buildAssistantV3SystemPrompt } from '@/services/kernel/assistant-v3-prompt.service'

/**
 * 助手新内核（v3 S1）：AI SDK 原生工具调用 + 只追加的消息。
 *
 * ── 一轮怎么走 ───────────────────────────────────────────────
 * 开轮时把板子冻结进本轮记录（transcript）；每一步把「历史 + 冻结的板子与这句话 +
 * 本轮记录」原样发给模型，拿回文本或工具调用。读类工具在服务端跑完、结果追加进
 * 记录、接着下一步；改画布的工具交给前端落（`canvas_batch` 步），本次请求停在
 * `canvas_sync`，前端落完带着记录与新快照再来 —— 那时才知道落没落、新卡叫什么，
 * 结果在那一跳补进记录。
 *
 * ── 工具真正执行在哪 ──────────────────────────────────────────
 * 全部交给旧内核的执行函数（`planTool`）：建卡、连线、写提示词、生成确认、联网查、
 * 看图都是磨过的。这里只做三件事：句柄 ↔ id、v3 入参 → 旧动作、结果 → 工具结果。
 *
 * ⛔ 钱闸不变：没有任何一条工具能建 generation，`generate` 只出确认卡。
 */

export async function* runAssistantV3(
  clerkId: string,
  request: AssistantOperatorRequest,
  options: AssistantOperatorRunOptions = {},
): AsyncIterable<AssistantOperatorEvent> {
  yield* runWithOperatorTimeBudget(options, (turnOptions) =>
    runV3Turn(clerkId, request, turnOptions),
  )
}

const tools = (strict: boolean) => ({
  [ASSISTANT_V3_TOOL_IDS.read]: tool({
    description:
      'Read cards in full: text, inputs and parameters. Pass card handles from the board.',
    inputSchema: AssistantV3ReadInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.look]: tool({
    description:
      "Look at a card's output picture (or images the creator attached) and answer one specific question about it.",
    inputSchema: AssistantV3LookInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.edit]: tool({
    description:
      'Change the board: add cards (with model, params and prompt), set name / model / params, connect, disconnect, delete, move a card to a lane, reorder lanes, project a script. All ops of one request in ONE call; later ops can name a card added earlier by its ref.',
    inputSchema: AssistantV3EditInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.write]: tool({
    description:
      'Write prompts (image / video / audio cards) or text (text and script cards) on one or more cards. mode "edit" replaces exact {find, replace} pairs and touches nothing else; "replace" rewrites the whole text; "append" adds to the end.',
    inputSchema: AssistantV3WriteInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.generate]: tool({
    description:
      'Put a generation confirm card for a card in front of the creator. It spends nothing until they press it. One card per call for now.',
    inputSchema: AssistantV3GenerateInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.searchWeb]: tool({
    description:
      'Look something up on the web: a work, a character, a technique, a model. Give a goal and the names it turns on.',
    inputSchema: AssistantV3SearchWebInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.searchLibrary]: tool({
    description: "Search the creator's own asset library.",
    inputSchema: AssistantV3SearchLibraryInputSchema,
    strict,
  }),
  [ASSISTANT_V3_TOOL_IDS.ask]: tool({
    description:
      'Ask the creator when you cannot go on without their choice. Every option needs a one-line description of what it means.',
    inputSchema: AssistantV3AskInputSchema,
    strict,
  }),
})

type MutatingTool =
  | typeof ASSISTANT_V3_TOOL_IDS.edit
  | typeof ASSISTANT_V3_TOOL_IDS.write

/** 改画布、要前端落的那两样（同一条回复里合成一批）。 */
function isMutatingTool(tool: AssistantV3Tool): tool is MutatingTool {
  return (
    tool === ASSISTANT_V3_TOOL_IDS.edit || tool === ASSISTANT_V3_TOOL_IDS.write
  )
}

const MAX_HISTORY_MESSAGES = 24
const MAX_INLINE_IMAGE_BYTES = 20_000_000

const EMPTY_REPLY_MESSAGES: Record<PromptAssistantResponseLanguage, string> = {
  chinese: '这一步模型没有给出任何回复，什么都没改。再说一次，或者换个说法。',
  japanese:
    'このステップではモデルから返答がなく、何も変更していません。もう一度、または言い方を変えてお願いします。',
  english:
    'The model gave no reply this time, so nothing changed. Say it again, or put it another way.',
}

const NOT_RUN_WHILE_BOARD_CHANGES =
  'Not run: an edit in this same reply is still landing on the board. Call it again in your next step if you still need it.'
const NOT_RUN_AFTER_STOP = 'Not run: this turn stopped to wait for the creator.'
const WAITING_FOR_CREATOR =
  'Waiting for the creator: the card is in front of them now. This turn ends here.'

const TITLE_TEXT: Record<
  PromptAssistantResponseLanguage,
  {
    read: string
    look: string
    add: string
    set: string
    connect: string
    disconnect: string
    delete: string
    move: string
    reorder: string
    project: string
    write: string
    edit: string
    generate: string
    searchWeb: string
    searchLibrary: string
    more: (count: number) => string
  }
> = {
  chinese: {
    read: '读取',
    look: '查看',
    add: '新建',
    set: '设置',
    connect: '连接',
    disconnect: '断开',
    delete: '删除',
    move: '移动',
    reorder: '调整镜头顺序',
    project: '投影剧本',
    write: '改写',
    edit: '修改',
    generate: '准备生成',
    searchWeb: '联网查',
    searchLibrary: '素材库找',
    more: (count) => `等 ${count} 项`,
  },
  japanese: {
    read: '読み込み',
    look: '確認',
    add: '作成',
    set: '設定',
    connect: '接続',
    disconnect: '切断',
    delete: '削除',
    move: '移動',
    reorder: 'ショット順を変更',
    project: '脚本を展開',
    write: '書き換え',
    edit: '修正',
    generate: '生成を準備',
    searchWeb: 'Web 検索',
    searchLibrary: '素材検索',
    more: (count) => `ほか ${count} 件`,
  },
  english: {
    read: 'Read',
    look: 'Look at',
    add: 'Add',
    set: 'Set',
    connect: 'Connect',
    disconnect: 'Disconnect',
    delete: 'Delete',
    move: 'Move',
    reorder: 'Reorder shots',
    project: 'Project script',
    write: 'Rewrite',
    edit: 'Edit',
    generate: 'Prepare',
    searchWeb: 'Search the web for',
    searchLibrary: 'Search the library for',
    more: (count) => `+${count} more`,
  },
}

function clampTitle(value: string): string {
  const max = ASSISTANT_OPERATOR_LIMITS.maxTitleChars
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function shortName(name: string): string {
  return name.length > 24 ? `${name.slice(0, 24)}…` : name
}

type V3Outcome =
  | { kind: 'result'; output: string; error: boolean; failureKey?: string }
  /** 交给前端落了，结果等接力那一跳再补。 */
  | { kind: 'pending' }
  /** 停在问题卡 / 确认卡上，等创作者。 */
  | { kind: 'stop'; todo: string }

interface V3Context {
  readonly clerkId: string
  readonly prepared: PreparedOperatorTurn
  readonly request: AssistantOperatorRequest
  readonly nodes: readonly AssistantOperatorCanvasNode[]
  readonly handles: AssistantV3Handles
  readonly language: PromptAssistantResponseLanguage
  readonly stepPrefix: string
}

function nameOf(context: V3Context, handleOrRef: string): string {
  const id = context.handles.idOf(handleOrRef)
  const node = id
    ? context.nodes.find((candidate) => candidate.id === id)
    : null
  return node ? `「${shortName(node.name)}」` : handleOrRef
}

function editTitle(context: V3Context, ops: readonly AssistantV3EditOpInput[]) {
  const text = TITLE_TEXT[context.language]
  const phrases = ops.map((op) => {
    switch (op.op) {
      case ASSISTANT_V3_EDIT_OP_IDS.add:
        return `${text.add}「${shortName(op.name)}」`
      case ASSISTANT_V3_EDIT_OP_IDS.set:
        return `${text.set} ${nameOf(context, op.card)}`
      case ASSISTANT_V3_EDIT_OP_IDS.connect:
        return `${text.connect} ${nameOf(context, op.from)} → ${nameOf(context, op.to)}`
      case ASSISTANT_V3_EDIT_OP_IDS.disconnect:
        return `${text.disconnect} ${nameOf(context, op.from)} → ${nameOf(context, op.to)}`
      case ASSISTANT_V3_EDIT_OP_IDS.delete:
        return `${text.delete} ${nameOf(context, op.card)}`
      case ASSISTANT_V3_EDIT_OP_IDS.moveToShot:
        return `${text.move} ${nameOf(context, op.card)}`
      case ASSISTANT_V3_EDIT_OP_IDS.reorderShot:
        return text.reorder
      case ASSISTANT_V3_EDIT_OP_IDS.projectScript:
        return `${text.project} ${nameOf(context, op.script)}`
    }
  })
  return joinPhrases(context, phrases)
}

function joinPhrases(context: V3Context, phrases: readonly string[]): string {
  const text = TITLE_TEXT[context.language]
  const head = phrases.slice(0, 2).join('；')
  return clampTitle(
    phrases.length > 2 ? `${head} ${text.more(phrases.length - 2)}` : head,
  )
}

function writeTitle(
  context: V3Context,
  writes: readonly AssistantV3WriteEntry[],
) {
  const text = TITLE_TEXT[context.language]
  return joinPhrases(
    context,
    writes.map(
      (entry) =>
        `${entry.mode === ASSISTANT_V3_WRITE_MODE_IDS.edit ? text.edit : text.write} ${nameOf(context, entry.card)}`,
    ),
  )
}

/* ─────────────────────────────────────────────────────────────────────────
 * 本轮记录 → 消息
 * ───────────────────────────────────────────────────────────────────────── */

function parseInput(call: AssistantV3TranscriptCall): unknown {
  try {
    return JSON.parse(call.input) as unknown
  } catch {
    return {}
  }
}

function transcriptMessages(
  entries: readonly AssistantV3TranscriptEntry[],
): ModelMessage[] {
  const out: ModelMessage[] = []
  let results: ToolResultPart[] = []
  const flush = () => {
    if (results.length === 0) return
    out.push({ role: 'tool', content: results })
    results = []
  }
  for (const entry of entries) {
    if (entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant) {
      flush()
      out.push({
        role: 'assistant',
        content: [
          ...(entry.text ? [{ type: 'text' as const, text: entry.text }] : []),
          ...entry.calls.map((call) => ({
            type: 'tool-call' as const,
            toolCallId: call.id,
            toolName: call.tool,
            input: parseInput(call),
          })),
        ],
      })
    } else if (entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result) {
      results.push({
        type: 'tool-result',
        toolCallId: entry.id,
        toolName: entry.tool,
        output: entry.error
          ? { type: 'error-text', value: entry.output }
          : { type: 'text', value: entry.output },
      })
    }
  }
  flush()
  return out
}

function historyMessages(request: AssistantOperatorRequest): {
  history: ModelMessage[]
  latest: string
} {
  const lastUser = request.messages.findLastIndex(
    (message) => message.role === 'user',
  )
  const history = request.messages
    .slice(0, Math.max(lastUser, 0))
    .filter((message) => message.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map(
      (message): ModelMessage =>
        message.role === 'user'
          ? { role: 'user', content: message.content }
          : { role: 'assistant', content: message.content },
    )
  return {
    history,
    latest: lastUser >= 0 ? request.messages[lastUser].content : '',
  }
}

/**
 * 被点名的图在服务端下载成内联数据再发（与旧内核同一条：`fetchAsBuffer` 走防 SSRF
 * 的 safeFetch）。⛔ 不把地址直接交给 AI SDK：有的 provider 不收地址，SDK 会在我们
 * 的服务器上替它去下载一个前端给的地址。下不来的那张照样留一行字，不让整轮挂掉。
 */
async function inlineImages(
  images: Extract<AssistantV3TranscriptEntry, { type: 'board' }>['images'],
  signal: AbortSignal,
): Promise<({ data: Buffer; mediaType: string } | null)[]> {
  return Promise.all(
    images.map(async (image) => {
      try {
        const { buffer, mimeType } = await fetchAsBuffer(image.url, {
          maxBytes: MAX_INLINE_IMAGE_BYTES,
          signal,
        })
        return { data: buffer, mediaType: mimeType }
      } catch (error) {
        signal.throwIfAborted()
        logger.warn('assistant v3 image not inlined', {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }),
  )
}

function currentUserMessage(
  board: Extract<AssistantV3TranscriptEntry, { type: 'board' }>,
  images: readonly ({ data: Buffer; mediaType: string } | null)[],
  latest: string,
  autoReview: boolean,
): ModelMessage {
  const content: Exclude<UserContent, string> = [
    { type: 'text', text: board.text },
  ]
  if (board.images.length) {
    content.push({
      type: 'text',
      text: `IMAGES THE CREATOR POINTED AT (in order): ${board.images
        .map(
          (image, index) =>
            `${index + 1} = 「${image.label}」${images[index] ? '' : ' (could not be loaded)'}`,
        )
        .join(' · ')}`,
    })
    for (const image of images)
      if (image)
        content.push({
          type: 'image',
          image: image.data,
          mediaType: image.mediaType,
        })
  }
  content.push({
    type: 'text',
    text: autoReview
      ? `AUTO REVIEW — the app attached a fresh result the creator set to run automatically. Look at it once against its references and prompt, then say in one or two sentences whether it matches and, if not, the one or two things most off. Change nothing unless they ask.\n\n${latest}`
      : `THE CREATOR SAYS:\n${latest}`,
  })
  return { role: 'user', content }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 接力：上一跳交给前端落的那几次调用，现在补上结果。
 * ───────────────────────────────────────────────────────────────────────── */

function pendingCallsOf(
  transcript: AssistantV3Transcript,
): AssistantV3TranscriptCall[] {
  const lastAssistant = transcript.findLastIndex(
    (entry) => entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant,
  )
  if (lastAssistant < 0) return []
  const entry = transcript[lastAssistant]
  if (entry.type !== ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant) return []
  const answered = new Set(
    transcript
      .slice(lastAssistant + 1)
      .flatMap((later) =>
        later.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result
          ? [later.id]
          : [],
      ),
  )
  return entry.calls.filter((call) => !answered.has(call.id))
}

/** 本轮的画布步（前端落完、带着成败回来的那几条）。 */
function thisTurnCanvasSteps(
  priorSteps: readonly AssistantOperatorPriorStep[],
): AssistantOperatorPriorStep[] {
  return priorSteps.filter(
    (step) =>
      step.thisTurn &&
      (step.tool === TOOL.canvasBatch || step.tool === TOOL.canvasApply),
  )
}

function touchedCards(
  call: AssistantV3TranscriptCall,
  refIds: ReadonlyMap<string, string>,
  handles: AssistantV3Handles,
): string[] {
  const input = parseInput(call) as {
    ops?: { card?: string; from?: string; to?: string; script?: string }[]
    writes?: { card?: string }[]
  }
  const names = [
    ...(input.ops ?? []).flatMap((op) =>
      [op.card, op.from, op.to, op.script].filter(
        (value): value is string => typeof value === 'string',
      ),
    ),
    ...(input.writes ?? []).flatMap((entry) =>
      typeof entry.card === 'string' ? [entry.card] : [],
    ),
  ]
  const ids = names.flatMap((name) => {
    const id = refIds.get(name.trim()) ?? handles.idOf(name)
    return id ? [id] : []
  })
  return [...new Set([...ids, ...refIds.values()])]
}

function landedOutput(
  call: AssistantV3TranscriptCall,
  step: AssistantOperatorPriorStep | undefined,
  nodes: readonly AssistantOperatorCanvasNode[],
  handles: AssistantV3Handles,
): { output: string; error: boolean } {
  if (!step) {
    return {
      output:
        'Unknown: the board came back without word on this edit. Read the cards you changed before you build on them.',
      error: true,
    }
  }
  if (
    step.status === STATUS.error &&
    step.rejectReason !== REJECT.canvasBatchPartial
  ) {
    return {
      output: `Did NOT land — ${step.detail ?? step.rejectReason ?? 'the board refused it'}. Nothing from this call changed.`,
      error: true,
    }
  }
  const lines = [
    step.status === STATUS.error
      ? `Landed only in part — ${step.detail ?? ''}`
      : 'Landed.',
  ]
  const refIds = new Map<string, string>()
  if (call.knownIds) {
    const known = new Set(call.knownIds)
    const fresh = nodes.filter((node) => !known.has(node.id))
    const adds = (
      (parseInput(call) as { ops?: AssistantV3EditOpInput[] }).ops ?? []
    ).filter((op) => op.op === ASSISTANT_V3_EDIT_OP_IDS.add)
    const left = [...fresh]
    for (const add of adds) {
      if (add.op !== ASSISTANT_V3_EDIT_OP_IDS.add) continue
      const match =
        left.find((node) => node.name === add.name) ??
        left.find((node) => node.kind === add.type.split('/')[0])
      if (!match) continue
      left.splice(left.indexOf(match), 1)
      refIds.set(add.ref.trim(), match.id)
    }
    if (refIds.size)
      lines.push(
        `New cards: ${[...refIds]
          .map(([ref, id]) => `${ref} → ${handles.handleOf(id)}`)
          .join(', ')}`,
      )
  }
  const names = new Map(nodes.map((node) => [node.id, node.name]))
  const cards = touchedCards(call, refIds, handles).flatMap((id) => {
    const node = nodes.find((candidate) => candidate.id === id)
    return node
      ? [
          renderAssistantV3Card(node, handles, (other) => names.get(other), {
            textLimit: ASSISTANT_V3_LIMITS.maxResultCardTextChars,
          }),
        ]
      : []
  })
  if (cards.length) lines.push('Cards now:', ...cards)
  return { output: lines.join('\n'), error: false }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 一轮
 * ───────────────────────────────────────────────────────────────────────── */

async function* runV3Turn(
  clerkId: string,
  initialRequest: AssistantOperatorRequest,
  options: OperatorTurnOptions,
): AsyncIterable<AssistantOperatorEvent> {
  const signal = options.signal
  if (signal.aborted) {
    yield {
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
    }
    return
  }
  const prepared = await prepareOperatorTurn(clerkId, initialRequest, signal)
  const { request, user, persona, rules, route, modelId, run } = prepared
  const canvas = request.snapshot.canvas
  const model = modelId ? resolveAssistantV3Model(route, modelId) : null
  if (!model || !modelId || !canvas) {
    yield* runOperatorTurn(clerkId, request, options, prepared)
    return
  }

  const nodes = assistantV3CanvasNodes(canvas)
  const handles = buildAssistantV3Handles(nodes.map((node) => node.id))
  const language = resolveResponseLanguage(request, persona)
  const { history, latest } = historyMessages(request)
  const transcript: AssistantV3Transcript = [...(request.v3?.transcript ?? [])]
  const context: V3Context = {
    clerkId,
    prepared,
    request,
    nodes,
    handles,
    language,
    stepPrefix: `v3s${transcript.length}`,
  }

  if (transcript[0]?.type !== ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board) {
    transcript.length = 0
    const supportsImages = assistantAdapterSupportsImage(
      route.adapterType,
      modelId,
    )
    const mentioned = request.mentionedAssets ?? []
    const mentionedIds = mentioned.flatMap((asset) => {
      const node = nodes.find((candidate) => candidate.name === asset.label)
      return node ? [node.id] : []
    })
    transcript.push({
      type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board,
      text: renderAssistantV3Board({
        canvas,
        handles,
        latestUserText: latest,
        mentionedIds,
      }).slice(0, ASSISTANT_V3_LIMITS.maxBoardChars),
      images: supportsImages
        ? mentioned.slice(0, ASSISTANT_V3_LIMITS.maxLookCards).map((asset) => ({
            url: asset.url,
            label: asset.label ?? asset.id,
          }))
        : [],
    })
  } else {
    const pending = pendingCallsOf(transcript)
    /** 这一批合成了一个画布步：本轮最后那一条就是它（前端落完写回了成败）。 */
    const landedStep = thisTurnCanvasSteps(request.priorSteps ?? []).at(-1)
    for (const call of pending) {
      const landed = landedOutput(call, landedStep, nodes, handles)
      transcript.push({
        type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
        id: call.id,
        tool: call.tool,
        output: landed.output.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
        error: landed.error,
      })
    }
  }
  const board = transcript[0]
  if (board.type !== ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board) return

  const system = buildAssistantV3SystemPrompt({
    request,
    persona,
    rules,
    accountName: user.displayName ?? user.username ?? null,
  })
  const baseMessages: ModelMessage[] = [
    ...history,
    currentUserMessage(
      board,
      await inlineImages(board.images, signal),
      latest,
      request.autoReview === true,
    ),
  ]
  const toolSet = tools(model.strictTools)
  const cacheKey = operatorCacheKey(run, 'v3')
  const budget = Math.min(
    request.stepBudget ?? ASSISTANT_V3_LIMITS.maxSteps,
    ASSISTANT_V3_LIMITS.maxSteps,
  )
  const lastFailure = { key: '', strikes: 0, title: '' }
  let emptyRetried = false

  for (let step = 0; step < budget; step += 1) {
    if (signal.aborted) {
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      }
      return
    }
    if (step > 0 && options.pastSoftBudget()) {
      // ⚠ 先交本轮记录：画布接着发下一次请求时从这里续，⛔ 不从头再来一遍。
      yield { type: ASSISTANT_OPERATOR_EVENTS.transcript, transcript }
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.timeBudget,
      }
      return
    }

    const callLog = startCallLog(
      {
        callLog: { purpose: 'v3', domain: request.domain, step },
        route,
        modelId,
      },
      1,
    )
    let text = ''
    let restart = true
    const calls: {
      toolCallId: string
      toolName: string
      input: unknown
      invalid: boolean
      error?: unknown
    }[] = []
    try {
      const result = streamText({
        model: model.model,
        system,
        messages: [...baseMessages, ...transcriptMessages(transcript.slice(1))],
        tools: toolSet,
        toolChoice: 'auto',
        maxRetries: 2,
        abortSignal: signal,
        providerOptions: model.providerOptions(cacheKey),
      })
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (!part.text) continue
          text += part.text
          yield {
            type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
            delta: part.text,
            ...(restart ? { restart: true as const } : {}),
          }
          restart = false
        } else if (part.type === 'tool-call') {
          calls.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            invalid: part.invalid === true,
            ...(part.invalid ? { error: part.error } : {}),
          })
        } else if (part.type === 'error') {
          throw part.error
        }
      }
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
      })
      callLog.finish('ok')
    } catch (error) {
      callLog.finish(signal.aborted ? 'aborted' : 'error')
      if (signal.aborted) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
        }
        return
      }
      throw toProviderError(route.adapterType, error)
    }

    const knownTools = new Set<string>(ASSISTANT_V3_TOOLS)
    const entryCalls: AssistantV3TranscriptCall[] = calls.map((call) => ({
      id: call.toolCallId.slice(0, ASSISTANT_V3_LIMITS.maxCallIdChars),
      tool: knownTools.has(call.toolName)
        ? (call.toolName as AssistantV3Tool)
        : ASSISTANT_V3_TOOL_IDS.read,
      input: JSON.stringify(call.input ?? {}).slice(
        0,
        ASSISTANT_V3_LIMITS.maxEntryChars,
      ),
    }))
    const assistantEntry: Extract<
      AssistantV3TranscriptEntry,
      { type: 'assistant' }
    > = {
      type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant,
      text: text.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
      calls: entryCalls.slice(0, ASSISTANT_V3_LIMITS.maxCallsPerMessage),
    }
    transcript.push(assistantEntry)

    /**
     * 模型一个字都没回（10-09 Gemini 回放 T15：工具调用写坏、被接口吞掉，0 token）：
     * 撤掉这一条、原样再问一次；还是空就如实说，⛔ 不拿「步数用完了」顶替。
     */
    if (calls.length === 0 && !text.trim()) {
      transcript.pop()
      if (!emptyRetried) {
        emptyRetried = true
        continue
      }
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.message,
        text: EMPTY_REPLY_MESSAGES[language],
      }
      yield { type: ASSISTANT_OPERATOR_EVENTS.done }
      return
    }

    if (calls.length === 0) {
      const closing = text.trim()
      yield { type: ASSISTANT_OPERATOR_EVENTS.message, text: closing }
      const roundSummary = await closeRound(run, {
        clerkId,
        userId: user.id,
        closingMessage: closing,
        allowTextOnly: true,
      })
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.done,
        ...(roundSummary ? { roundSummary } : {}),
      }
      return
    }
    if (text.trim())
      yield { type: ASSISTANT_OPERATOR_EVENTS.message, text: text.trim() }

    let pending = false
    let stopTodo: string | null = null
    const failures: string[] = []
    /**
     * 同一条回复里的改动（edit / write）**合成一批**：一个过程行、一次落、一次接力。
     * ⚠ 分开落的话，接力时就得按「最后几步」去对哪条结果属于哪次调用 —— 中间夹一条
     *   被拒的草稿就对错位。
     */
    const mutations: {
      entryCall: AssistantV3TranscriptCall
      ops: NodeAssistantOpV4[]
      title: string
      adds: boolean
    }[] = []
    for (const [index, call] of calls.entries()) {
      const entryCall = assistantEntry.calls[index]
      if (!entryCall) break
      const pushResult = (output: string, error: boolean) =>
        transcript.push({
          type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
          id: entryCall.id,
          tool: entryCall.tool,
          output: output.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
          error,
        })
      if (stopTodo !== null) {
        pushResult(NOT_RUN_AFTER_STOP, true)
        continue
      }
      if (call.invalid || !knownTools.has(call.toolName)) {
        const detail = call.invalid
          ? `The arguments do not match the ${call.toolName} schema: ${call.error instanceof Error ? call.error.message : 'invalid input'}`
          : `There is no tool called ${call.toolName}.`
        pushResult(detail, true)
        failures.push(`${call.toolName}:invalid`)
        continue
      }
      const tool = entryCall.tool
      if (isMutatingTool(tool)) {
        const translated = translateMutation(context, tool, call.input)
        if (!translated.ok) {
          const outcome = yield* rejectedStep(
            context,
            TOOL.canvasBatch,
            translated.title,
            REJECT.noSuchControl,
            translated.error,
            true,
          )
          if (outcome.kind === 'result') {
            pushResult(outcome.output, true)
            if (outcome.failureKey) failures.push(outcome.failureKey)
          }
          continue
        }
        mutations.push({ entryCall, ...translated })
        continue
      }
      if (mutations.length > 0) {
        pushResult(NOT_RUN_WHILE_BOARD_CHANGES, true)
        continue
      }
      const outcome = yield* executeCall(context, tool, call.input)
      if (outcome.kind === 'stop') {
        stopTodo = outcome.todo
        pushResult(WAITING_FOR_CREATOR, false)
        continue
      }
      if (outcome.kind === 'result') {
        pushResult(outcome.output, outcome.error)
        if (outcome.error && outcome.failureKey)
          failures.push(outcome.failureKey)
      }
    }

    if (mutations.length > 0 && stopTodo === null) {
      const ops = mutations.flatMap((mutation) => mutation.ops)
      const title = joinPhrases(
        context,
        mutations.map((mutation) => mutation.title),
      )
      const outcome =
        ops.length > ASSISTANT_OPERATOR_CANVAS_LIMITS.maxBatchOps
          ? yield* rejectedStep(
              context,
              TOOL.canvasBatch,
              title,
              REJECT.malformedArgs,
              `That is ${ops.length} board changes at once; at most ${ASSISTANT_OPERATOR_CANVAS_LIMITS.maxBatchOps} land together. Split it into two edits.`,
              true,
            )
          : yield* settlePlan(
              context,
              TOOL.canvasBatch,
              title,
              await planSafely(context, TOOL.canvasBatch, { ops }),
            )
      for (const mutation of mutations) {
        const pushResult = (output: string, error: boolean) =>
          transcript.push({
            type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
            id: mutation.entryCall.id,
            tool: mutation.entryCall.tool,
            output: output.slice(0, ASSISTANT_V3_LIMITS.maxEntryChars),
            error,
          })
        if (outcome.kind === 'pending') {
          pending = true
          if (mutation.adds)
            mutation.entryCall.knownIds = context.nodes.map((node) => node.id)
        } else if (outcome.kind === 'stop') {
          stopTodo = outcome.todo
          pushResult(WAITING_FOR_CREATOR, false)
        } else {
          pushResult(outcome.output, outcome.error)
          if (outcome.error && outcome.failureKey)
            failures.push(outcome.failureKey)
        }
      }
    } else if (mutations.length > 0) {
      for (const mutation of mutations)
        transcript.push({
          type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result,
          id: mutation.entryCall.id,
          tool: mutation.entryCall.tool,
          output: NOT_RUN_AFTER_STOP,
          error: true,
        })
    }

    if (stopTodo !== null) {
      const roundSummary = await closeRoundBeforeStop(run, {
        clerkId,
        userId: user.id,
        todo: stopTodo,
      })
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
        ...(roundSummary ? { roundSummary } : {}),
      }
      return
    }
    if (pending) {
      yield { type: ASSISTANT_OPERATOR_EVENTS.transcript, transcript }
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.canvasSync,
      }
      return
    }

    /**
     * 同一件事因同一个原因连着失败：停下来说清楚，⛔ 不让模型换着写法硬撞第三次
     * （与旧内核同一道闸，T09 是它的反例 —— 那次是协议记不住，这里靠 schema 拦）。
     */
    if (failures.length === calls.length && failures.length > 0) {
      const key = failures.join('|')
      lastFailure.strikes =
        lastFailure.key === key ? lastFailure.strikes + 1 : 1
      lastFailure.key = key
      lastFailure.title = entryCalls[0]?.tool ?? ''
      if (lastFailure.strikes >= ASSISTANT_V3_LIMITS.maxSameRejections) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: OPERATOR_SAME_FAILURE_MESSAGES[language](lastFailure.title),
        }
        const roundSummary = await closeRound(run, { clerkId, userId: user.id })
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.done,
          ...(roundSummary ? { roundSummary } : {}),
        }
        return
      }
    } else {
      lastFailure.key = ''
      lastFailure.strikes = 0
    }
  }

  yield {
    type: ASSISTANT_OPERATOR_EVENTS.message,
    text: OPERATOR_OUT_OF_STEPS_MESSAGES[language],
  }
  const roundSummary = await closeRound(run, { clerkId, userId: user.id })
  yield {
    type: ASSISTANT_OPERATOR_EVENTS.stopped,
    reason: ASSISTANT_OPERATOR_STOP_REASONS.maxSteps,
    ...(roundSummary ? { roundSummary } : {}),
  }
}

function toProviderError(provider: string, error: unknown): unknown {
  if (error instanceof ProviderError) return error
  if (isFatalOperatorToolError(error)) return error
  const status =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : undefined
  const message = error instanceof Error ? error.message : String(error)
  logger.warn('assistant v3 model call failed', { provider, status, message })
  return new ProviderError(provider, message, {
    ...(status === undefined ? {} : { status }),
  })
}

/* ─────────────────────────────────────────────────────────────────────────
 * 一次工具调用
 * ───────────────────────────────────────────────────────────────────────── */

function nextStep(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
) {
  const run = context.prepared.run
  run.stepSeq += 1
  return {
    id: `${context.stepPrefix}-${run.stepSeq}`,
    tool,
    verb: ASSISTANT_OPERATOR_TOOL_VERBS[tool],
    title: clampTitle(title || tool),
  }
}

async function planSafely(
  context: V3Context,
  tool: AssistantOperatorTool,
  args: unknown,
): Promise<ToolPlan> {
  const run = context.prepared.run
  try {
    const plan = await planTool(run, tool, args, context.prepared.user.id)
    run.signal?.throwIfAborted()
    return plan
  } catch (error) {
    run.signal?.throwIfAborted()
    if (isFatalOperatorToolError(error)) throw error
    logger.warn('assistant v3 tool failed while planning', {
      userId: context.clerkId,
      tool,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      kind: 'rejected',
      reason: REJECT.toolFailed,
      detail: TOOL_FAILED_DETAIL,
    }
  }
}

/** 写提示词时规划器顺手复核过参考图：那一步也要在时间线上留一行。 */
function* flushInspectedReferences(
  context: V3Context,
): Generator<AssistantOperatorEvent> {
  const run = context.prepared.run
  if (!run.inspectedCanvasReferences) return
  const analysis = run.inspectedCanvasReferences
  run.inspectedCanvasReferences = null
  const step = nextStep(context, TOOL.analyzeReferences, TOOL.analyzeReferences)
  yield toStepEvent({
    ...step,
    status: STATUS.done,
    payload: {},
    result: analysis,
  })
}

function* rejectedStep(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
  reason: AssistantOperatorRejectReason,
  detail: string,
  draft: boolean,
): Generator<AssistantOperatorEvent, V3Outcome> {
  yield toStepEvent({
    ...nextStep(context, tool, title),
    status: STATUS.error,
    error: {
      reason,
      detail: detail.slice(0, ASSISTANT_OPERATOR_LIMITS.maxReasonChars),
    },
    ...(draft ? { draft: true } : {}),
  })
  return {
    kind: 'result',
    output: detail,
    error: true,
    failureKey: `${tool}:${reason}`,
  }
}

/** 旧执行器给回来的那份计划 → 时间线上的步 + 给模型的结果。 */
async function* settlePlan(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
  plan: ToolPlan,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const run = context.prepared.run
  yield* flushInspectedReferences(context)
  switch (plan.kind) {
    case 'rejected':
      return yield* rejectedStep(
        context,
        tool,
        title,
        plan.reason,
        plan.detail ?? plan.reason,
        plan.quiet === true,
      )
    case 'read': {
      const step = nextStep(context, tool, title)
      yield toStepEvent({
        ...step,
        status: STATUS.running,
        payload: plan.payload,
        result: null,
      })
      let outcome: Awaited<ReturnType<typeof plan.run>>
      try {
        outcome = await plan.run()
      } catch (error) {
        run.signal?.throwIfAborted()
        if (isFatalOperatorToolError(error)) throw error
        yield toStepEvent({
          ...step,
          status: STATUS.error,
          error: { reason: REJECT.toolFailed },
        })
        return {
          kind: 'result',
          output: TOOL_FAILED_DETAIL,
          error: true,
          failureKey: `${tool}:${REJECT.toolFailed}`,
        }
      }
      const done = {
        ...step,
        status: STATUS.done,
        payload: plan.payload,
        result: outcome.result,
      }
      yield toStepEvent(done)
      rememberStepArtifacts(run, done)
      recordLedgerStep(run, step.verb, step.title, outcome.observation)
      return { kind: 'result', output: outcome.observation, error: false }
    }
    case 'mutate': {
      const step = nextStep(context, tool, title)
      const applied = { ...step, payload: plan.payload, inverse: plan.inverse }
      yield toStepEvent({ ...applied, status: STATUS.running })
      plan.apply()
      yield toStepEvent({ ...applied, status: STATUS.done })
      recordLedgerStep(run, step.verb, step.title, plan.observation)
      return { kind: 'pending' }
    }
    case 'ask':
      yield { type: ASSISTANT_OPERATOR_EVENTS.ask, questions: [plan.question] }
      return { kind: 'stop', todo: plan.todo }
    case 'confirmGenerate':
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.confirm,
        confirm: {
          kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
          request: plan.request,
        },
      }
      return {
        kind: 'stop',
        todo: plan.request.canvasNode
          ? `等你确认生成「${plan.request.canvasNode.name}」`
          : `等你确认生成 ${plan.request.count} 张`,
      }
    default:
      return yield* rejectedStep(
        context,
        tool,
        title,
        REJECT.noSuchControl,
        'This step is not available in this assistant yet.',
        false,
      )
  }
}

/** edit / write → 这一批的 v4 op 与过程行标题。⛔ 不落：由回合循环合成一批再落。 */
function translateMutation(
  context: V3Context,
  name: MutatingTool,
  input: unknown,
):
  | { ok: true; ops: NodeAssistantOpV4[]; title: string; adds: boolean }
  | { ok: false; error: string; title: string } {
  if (name === ASSISTANT_V3_TOOL_IDS.edit) {
    const parsed = AssistantV3EditInputSchema.parse(input)
    const title = editTitle(context, parsed.ops)
    const translated = translateAssistantV3Edit(parsed.ops, context)
    return translated.ok
      ? {
          ok: true,
          ops: translated.ops,
          title,
          adds: parsed.ops.some((op) => op.op === ASSISTANT_V3_EDIT_OP_IDS.add),
        }
      : { ok: false, error: translated.error, title }
  }
  const parsed = AssistantV3WriteInputSchema.parse(input)
  const title = writeTitle(context, parsed.writes)
  const translated = translateAssistantV3Write(parsed, context)
  return translated.ok
    ? { ok: true, ops: translated.ops, title, adds: false }
    : { ok: false, error: translated.error, title }
}

async function* executeCall(
  context: V3Context,
  name: Exclude<AssistantV3Tool, MutatingTool>,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  switch (name) {
    case ASSISTANT_V3_TOOL_IDS.read: {
      const parsed = AssistantV3ReadInputSchema.parse(input)
      const cards = parsed.cards.slice(0, ASSISTANT_V3_LIMITS.maxReadCards)
      const unknown = cards.filter((card) => !context.handles.idOf(card))
      const title = joinPhrases(
        context,
        cards.map((card) => `${text.read} ${nameOf(context, card)}`),
      )
      if (cards.length === 0 || unknown.length)
        return yield* rejectedStep(
          context,
          TOOL.readState,
          title,
          REJECT.noSuchControl,
          cards.length === 0
            ? 'cards is empty'
            : unknown
                .map((card) => {
                  const nearest = context.handles
                    .nearest(card)
                    .map((id) => context.handles.handleOf(id))
                  return `no card "${card}"${nearest.length ? ` — did you mean ${nearest.join(', ')}?` : ''}`
                })
                .join('; '),
          true,
        )
      const ids = cards.map((card) => context.handles.idOf(card)!)
      const names = new Map(context.nodes.map((node) => [node.id, node.name]))
      const output = ids
        .map((id) => context.nodes.find((node) => node.id === id))
        .filter((node): node is AssistantOperatorCanvasNode => Boolean(node))
        .map((node) =>
          renderAssistantV3Card(
            node,
            context.handles,
            (other) => names.get(other),
            { textLimit: null },
          ),
        )
        .join('\n')
      const step = nextStep(context, TOOL.readState, title)
      yield toStepEvent({
        ...step,
        status: STATUS.done,
        payload: { nodeIds: ids },
        result: {
          digest: ids
            .map((id) => names.get(id) ?? id)
            .join(' · ')
            .slice(0, ASSISTANT_OPERATOR_LIMITS.maxMessageChars),
        },
      })
      recordLedgerStep(
        context.prepared.run,
        step.verb,
        step.title,
        `read ${ids.length} card(s)`,
      )
      return { kind: 'result', output, error: false }
    }
    case ASSISTANT_V3_TOOL_IDS.generate: {
      const parsed = AssistantV3GenerateInputSchema.parse(input)
      const title = joinPhrases(
        context,
        parsed.cards.map((card) => `${text.generate} ${nameOf(context, card)}`),
      )
      if (parsed.cards.length !== ASSISTANT_V3_LIMITS.maxGenerateCards)
        return yield* rejectedStep(
          context,
          TOOL.canvasGenerate,
          title,
          REJECT.noSuchControl,
          'generate takes exactly one card per call for now. Put up the first card; the creator can ask for the next one after confirming.',
          true,
        )
      const id = context.handles.idOf(parsed.cards[0])
      if (!id)
        return yield* rejectedStep(
          context,
          TOOL.canvasGenerate,
          title,
          REJECT.noSuchControl,
          `no card "${parsed.cards[0]}" on the board`,
          true,
        )
      const plan = await planSafely(context, TOOL.canvasGenerate, {
        target: id,
      })
      return yield* settlePlan(context, TOOL.canvasGenerate, title, plan)
    }
    case ASSISTANT_V3_TOOL_IDS.look:
      return yield* executeLook(
        context,
        AssistantV3LookInputSchema.parse(input),
      )
    case ASSISTANT_V3_TOOL_IDS.searchWeb: {
      const parsed = AssistantV3SearchWebInputSchema.parse(input)
      const title = `${text.searchWeb} ${parsed.goal}`
      const plan = await planSafely(context, TOOL.research, {
        goal: parsed.goal,
        ...(parsed.entities.length ? { entities: parsed.entities } : {}),
        ...(parsed.onlySources?.length
          ? { onlySources: parsed.onlySources }
          : {}),
      })
      return yield* settlePlan(context, TOOL.research, title, plan)
    }
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3SearchLibraryInputSchema.parse(input)
      const title = `${text.searchLibrary} ${parsed.query}`
      const plan = await planSafely(context, TOOL.searchAssets, {
        query: parsed.query,
        ...(parsed.kind ? { kind: parsed.kind } : {}),
      })
      return yield* settlePlan(context, TOOL.searchAssets, title, plan)
    }
    case ASSISTANT_V3_TOOL_IDS.ask: {
      const parsed = AssistantV3AskInputSchema.parse(input)
      const questions = normalizePlanQuestions(
        {
          questions: parsed.questions
            .slice(0, ASSISTANT_V3_LIMITS.maxQuestions)
            .map((question) => ({
              header: question.header,
              question: question.question.slice(
                0,
                ASSISTANT_V3_LIMITS.maxQuestionChars,
              ),
              multiSelect: question.multiSelect,
              allowOther: question.allowOther,
              options: question.options
                .slice(0, ASSISTANT_V3_LIMITS.maxOptions)
                .map((option) => ({
                  label: option.label,
                  description: option.description,
                  recommended: option.recommended,
                })),
            })),
        },
        context.clerkId,
      )
      if (questions.length === 0)
        return {
          kind: 'result',
          output:
            'The question was not shown: every question needs at least two options, each with a one-line description.',
          error: true,
          failureKey: 'ask:invalid',
        }
      yield { type: ASSISTANT_OPERATOR_EVENTS.ask, questions }
      return {
        kind: 'stop',
        todo: questions.map((question) => question.question).join('；'),
      }
    }
  }
}

/**
 * 看图：被 @ 的那几张走评审（对着参考与提示词说哪里不对），其余带图的卡走参考
 * 分析（看清画面里有什么）。⛔ 没图的卡不硬看 —— 说清看不到，让创作者 @ 它。
 */
async function* executeLook(
  context: V3Context,
  input: { cards: string[]; question: string },
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const cards = input.cards.slice(0, ASSISTANT_V3_LIMITS.maxLookCards)
  const title = joinPhrases(
    context,
    cards.map((card) => `${text.look} ${nameOf(context, card)}`),
  )
  const mentioned = context.request.mentionedAssets ?? []
  const referenceUrls = context.prepared.run.state.referenceUrls
  const critiqueIds: string[] = []
  const imageIndices: number[] = []
  const missing: string[] = []
  for (const card of cards) {
    const id = context.handles.idOf(card)
    const node = id
      ? context.nodes.find((candidate) => candidate.id === id)
      : null
    const asset = mentioned.find(
      (candidate) =>
        candidate.label === node?.name ||
        candidate.label === card ||
        (node?.referenceImageIndex !== undefined &&
          referenceUrls[node.referenceImageIndex] === candidate.url),
    )
    if (asset) {
      critiqueIds.push(asset.id)
    } else if (
      node?.kind === NODE_MEDIA_KIND_IDS.image &&
      node.referenceImageIndex !== undefined
    ) {
      imageIndices.push(node.referenceImageIndex)
    } else {
      missing.push(card)
    }
  }
  const outputs: string[] = []
  let failed = false
  if (critiqueIds.length) {
    const plan = await planSafely(context, TOOL.critiqueResult, {
      goal: input.question,
      targetIds: critiqueIds,
    })
    const outcome = yield* settlePlan(context, TOOL.critiqueResult, title, plan)
    if (outcome.kind === 'result') {
      outputs.push(outcome.output)
      failed ||= outcome.error
    }
  }
  if (imageIndices.length) {
    const plan = await planSafely(context, TOOL.analyzeReferences, {
      imageIndices: [...new Set(imageIndices)],
    })
    const outcome = yield* settlePlan(
      context,
      TOOL.analyzeReferences,
      title,
      plan,
    )
    if (outcome.kind === 'result') {
      outputs.push(outcome.output)
      failed ||= outcome.error
    }
  }
  if (missing.length)
    outputs.push(
      `Could not see ${missing.join(', ')}: no picture of it reached you. If it has an output, ask the creator to @ it in their message.`,
    )
  return {
    kind: 'result',
    output: outputs.join('\n\n'),
    error: failed || outputs.length === missing.length,
    failureKey: `${TOOL.critiqueResult}:look`,
  }
}
