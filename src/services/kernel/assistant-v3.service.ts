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
import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import { ProviderError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { fetchAsBuffer } from '@/services/storage/r2'
import {
  assistantV3CanvasNodes,
  buildAssistantV3Handles,
  formatScriptShotKey,
  renderAssistantV3Board,
  renderAssistantV3Card,
  type AssistantV3Handles,
} from '@/lib/assistant-v3-board'
import {
  checkShotBeforeGenerate,
  promptTimelineEnd,
} from '@/lib/assistant-v3-shot-checks'
import { parseScriptShots } from '@/lib/node-script-shots'
import {
  translateAssistantV3Edit,
  translateAssistantV3Write,
} from '@/lib/assistant-v3-ops'
import type { PromptAssistantResponseLanguage } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorEvent,
  AssistantOperatorGenerationRequest,
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
  planCritiqueResult,
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
      'Put a generation confirm card in front of the creator. It spends nothing until they press it. List every card they asked to generate in this one call: they all go on one confirm card.',
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

/**
 * 一条回复里叫了两次 generate：第一张确认卡一出这一轮就停了，模型没机会再说话
 * （T15：回复里没提只出了一张）。由服务端补这一句，等 S2 的多卡确认上了再删。
 */
const SKIPPED_GENERATE_MESSAGES: Record<
  PromptAssistantResponseLanguage,
  (names: string) => string
> = {
  chinese: (names) =>
    `这次只摆出了一张确认卡，${names} 还没放——现在一次只能确认一张，这张处理完再叫我。`,
  japanese: (names) =>
    `今回出した確認カードは1枚だけで、${names} はまだです。今は1枚ずつなので、これが済んだらまた声をかけてください。`,
  english: (names) =>
    `Only one confirm card went up; ${names} did not. It is one card at a time for now — ask again once this one is done.`,
}

const CONTENT_FILTER_MESSAGES: Record<PromptAssistantResponseLanguage, string> =
  {
    chinese:
      '这一步被模型服务商的内容审核拦下了，什么都没改。多半是画布上的内容触发了它的安全规则；换一个助手模型再试，或者告诉我先避开哪些内容。',
    japanese:
      'このステップはモデル提供元のコンテンツ審査で止められ、何も変更していません。キャンバス上の内容が安全ルールに触れた可能性が高いので、アシスタントのモデルを切り替えて試すか、避けたい内容を教えてください。',
    english:
      "This step was stopped by the model provider's content filter, so nothing changed. Something on the board most likely tripped its safety rules — switch the assistant to another model and try again, or tell me what to leave out.",
  }

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
const CHECKED_BEFORE_GENERATE = 'Not put up yet — checked first:'
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
    inspect: string
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
    inspect: '核对参考图',
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
    inspect: '参照画像を確認',
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
    inspect: 'Check references',
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
  /** 本轮记录（同一个数组，回合循环往里追加）—— 出片前核对过没有，从这里看。 */
  readonly transcript: AssistantV3Transcript
}

/**
 * 过程行里怎么称呼一张卡：剧本投出来的镜头卡叫镜号（S04b，卡名是整段镜头描述），
 * 同一批里刚建的卡叫它的名字（⛔ 不露临时 ref，T03 的过程行写成了 test_batch）。
 */
function nameOf(
  context: V3Context,
  handleOrRef: string,
  refNames?: ReadonlyMap<string, string>,
): string {
  const added = refNames?.get(handleOrRef)
  if (added) return `「${shortName(added)}」`
  const id = context.handles.idOf(handleOrRef)
  const node = id
    ? context.nodes.find((candidate) => candidate.id === id)
    : null
  if (!node) return handleOrRef
  if (node.fromScript) return formatScriptShotKey(node.fromScript.shotKey)
  return `「${shortName(node.name)}」`
}

function editTitle(context: V3Context, ops: readonly AssistantV3EditOpInput[]) {
  const text = TITLE_TEXT[context.language]
  const refNames = new Map(
    ops.flatMap((op) =>
      op.op === ASSISTANT_V3_EDIT_OP_IDS.add
        ? [[op.ref, op.name] as const]
        : [],
    ),
  )
  const name = (card: string) => nameOf(context, card, refNames)
  const phrases = ops.map((op) => {
    switch (op.op) {
      case ASSISTANT_V3_EDIT_OP_IDS.add:
        return `${text.add}「${shortName(op.name)}」`
      case ASSISTANT_V3_EDIT_OP_IDS.set:
        return `${text.set} ${name(op.card)}`
      case ASSISTANT_V3_EDIT_OP_IDS.connect:
        return `${text.connect} ${name(op.from)} → ${name(op.to)}`
      case ASSISTANT_V3_EDIT_OP_IDS.disconnect:
        return `${text.disconnect} ${name(op.from)} → ${name(op.to)}`
      case ASSISTANT_V3_EDIT_OP_IDS.delete:
        return `${text.delete} ${name(op.card)}`
      case ASSISTANT_V3_EDIT_OP_IDS.moveToShot:
        return `${text.move} ${name(op.card)}`
      case ASSISTANT_V3_EDIT_OP_IDS.reorderShot:
        return text.reorder
      case ASSISTANT_V3_EDIT_OP_IDS.projectScript:
        return `${text.project} ${name(op.script)}`
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
  lines.push(...projectionLines(call, nodes, handles))
  lines.push(...timelineLines(call, nodes, handles))
  return { output: lines.join('\n'), error: false }
}

/**
 * 改了镜头时长：提示词里的分段时间码还停在旧时长（v3 回放 T10：时长改成 6 秒，
 * 提示词还写着 0–5 秒，模型反问要不要同步）。
 */
function timelineLines(
  call: AssistantV3TranscriptCall,
  nodes: readonly AssistantOperatorCanvasNode[],
  handles: AssistantV3Handles,
): string[] {
  const ops = (parseInput(call) as { ops?: AssistantV3EditOpInput[] }).ops
  return (ops ?? []).flatMap((op) => {
    if (op.op !== ASSISTANT_V3_EDIT_OP_IDS.set || !op.params?.duration)
      return []
    const id = handles.idOf(op.card)
    const node = nodes.find((candidate) => candidate.id === id)
    const seconds = Number(node?.parameters?.values.duration)
    const end = node ? promptTimelineEnd(node.text ?? '') : null
    if (!node || end === null || !(seconds > 0) || end === seconds) return []
    return [
      `${handles.handleOf(node.id)}: the time codes in its prompt still run to ${end} s but the shot is now ${seconds} s. Bringing them in line is part of the same change, so do it now: change only those numbers (write, mode "edit").`,
    ]
  })
}

/**
 * 投影过剧本：哪几镜是新建的、哪几镜的提示词还跟着旧剧本（v3 回放 T08：剧本改了一句，
 * 镜头卡标了「已变」，提示词里那句台词却没人去改）。
 */
function projectionLines(
  call: AssistantV3TranscriptCall,
  nodes: readonly AssistantOperatorCanvasNode[],
  handles: AssistantV3Handles,
): string[] {
  const ops = (parseInput(call) as { ops?: AssistantV3EditOpInput[] }).ops
  const scripts = (ops ?? []).flatMap((op) =>
    op.op === ASSISTANT_V3_EDIT_OP_IDS.projectScript
      ? [handles.idOf(op.script)]
      : [],
  )
  const known = call.knownIds ? new Set(call.knownIds) : null
  return scripts.flatMap((scriptId) => {
    if (!scriptId) return []
    const shots = nodes.filter((node) => node.fromScript?.nodeId === scriptId)
    const label = (node: AssistantOperatorCanvasNode) =>
      `${handles.handleOf(node.id)} ${formatScriptShotKey(node.fromScript?.shotKey ?? '')}`
    const fresh = known ? shots.filter((node) => !known.has(node.id)) : []
    const changed = shots.filter(
      (node) =>
        node.fromScript?.state === NODE_SCRIPT_SHOT_STATE_IDS.changed &&
        !fresh.includes(node),
    )
    const dropped = shots.filter(
      (node) => node.fromScript?.state === NODE_SCRIPT_SHOT_STATE_IDS.dropped,
    )
    return [
      ...(fresh.length
        ? [
            `New shots: ${fresh.map(label).join(', ')} — each prompt is just its script line. A shot split from an old one took over that shot's model, parameters and reference lines.`,
          ]
        : []),
      ...(changed.length
        ? [
            `Script line changed: ${changed.map(label).join(', ')} — the video prompt still follows the old line. Bringing it in line is part of the same change, so do it now: change only the words that differ (write, mode "edit"); never paste the script line in.`,
          ]
        : []),
      ...(dropped.length
        ? [
            `No longer in the script (kept on the board): ${dropped
              .map((node) =>
                formatScriptShotKey(node.fromScript?.shotKey ?? ''),
              )
              .join(', ')}`,
          ]
        : []),
    ]
  })
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
    transcript,
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
    memories: prepared.assistantMemories,
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
    let filtered = false
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
        } else if (part.type === 'finish' && !text && calls.length === 0) {
          // 空回复（Gemini 回放 T15：0 个输出 token）：记下厂商给的结束原因。
          filtered = part.finishReason === 'content-filter'
          logger.warn('assistant v3 empty reply', {
            userId: clerkId,
            step,
            modelId,
            finishReason: part.finishReason,
            rawFinishReason: part.rawFinishReason,
          })
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
     * 模型一个字都没回：撤掉这一条、原样再问一次；还是空就如实说，⛔ 不拿「步数用完了」
     * 顶替。⚠ 被厂商的内容审核拦下的（10-09 Gemini：PROHIBITED_CONTENT，画布上一年级
     * 角色与「辣妹风」这类词同时在场）不重试 —— 同一份输入再问一次还是拦，直说是审核。
     */
    if (calls.length === 0 && !text.trim()) {
      transcript.pop()
      if (filtered) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: CONTENT_FILTER_MESSAGES[language],
        }
        yield { type: ASSISTANT_OPERATOR_EVENTS.done }
        return
      }
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
    const skippedGenerates: string[] = []
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
      createsCards: boolean
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
        if (entryCall.tool === ASSISTANT_V3_TOOL_IDS.generate) {
          const parsed = AssistantV3GenerateInputSchema.safeParse(call.input)
          if (parsed.success)
            skippedGenerates.push(
              ...parsed.data.cards.map((card) => nameOf(context, card)),
            )
        }
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
          if (mutation.createsCards)
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
      if (skippedGenerates.length > 0)
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: SKIPPED_GENERATE_MESSAGES[language](
            [...new Set(skippedGenerates)].join(
              language === 'english' ? ', ' : '、',
            ),
          ),
        }
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

function planSafely(
  context: V3Context,
  tool: AssistantOperatorTool,
  args: unknown,
): Promise<ToolPlan> {
  return planGuarded(context, tool, () =>
    planTool(context.prepared.run, tool, args, context.prepared.user.id),
  )
}

async function planGuarded(
  context: V3Context,
  tool: AssistantOperatorTool,
  plan: () => Promise<ToolPlan>,
): Promise<ToolPlan> {
  const run = context.prepared.run
  try {
    const planned = await plan()
    run.signal?.throwIfAborted()
    return planned
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
  const step = nextStep(
    context,
    TOOL.analyzeReferences,
    TITLE_TEXT[context.language].inspect,
  )
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
      // 一改什么都没变（要的值卡上本来就是）：不算一步，⛔ 在时间线上留一条红行。
      if (plan.reason === REJECT.repeatedStep)
        return {
          kind: 'result',
          output: plan.detail ?? 'Nothing changed: the board already had that.',
          error: false,
        }
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
  | { ok: true; ops: NodeAssistantOpV4[]; title: string; createsCards: boolean }
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
          createsCards: parsed.ops.some(
            (op) =>
              op.op === ASSISTANT_V3_EDIT_OP_IDS.add ||
              op.op === ASSISTANT_V3_EDIT_OP_IDS.projectScript,
          ),
        }
      : { ok: false, error: translated.error, title }
  }
  const parsed = AssistantV3WriteInputSchema.parse(input)
  const title = writeTitle(context, parsed.writes)
  const translated = translateAssistantV3Write(parsed, context)
  return translated.ok
    ? { ok: true, ops: translated.ops, title, createsCards: false }
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
    case ASSISTANT_V3_TOOL_IDS.generate:
      return yield* executeGenerate(
        context,
        AssistantV3GenerateInputSchema.parse(input).cards,
      )
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
 * 生成：几张卡一张确认卡（方向 C 队列条）。每张先过一遍出片前核对（只报一次，模型改了
 * 或说了再调就放行），再各自走旧执行器那道闸（没模型 / 缺 key 的那张单独报错）；
 * 过了闸的合成一张确认卡。⛔ 钱闸不变：这里只摆卡，按下去的是创作者。
 */
async function* executeGenerate(
  context: V3Context,
  requested: readonly string[],
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const cards = [...new Set(requested)].slice(
    0,
    ASSISTANT_OPERATOR_LIMITS.maxCanvasGenerateCards,
  )
  if (cards.length === 0)
    return {
      kind: 'result',
      output: 'generate needs the cards to put up.',
      error: true,
      failureKey: `${TOOL.canvasGenerate}:empty`,
    }
  const unknown = cards.filter((card) => !context.handles.idOf(card))
  if (unknown.length > 0)
    return yield* rejectedStep(
      context,
      TOOL.canvasGenerate,
      joinPhrases(
        context,
        unknown.map((card) => `${text.generate} ${card}`),
      ),
      REJECT.noSuchControl,
      `no card ${unknown.map((card) => `"${card}"`).join(', ')} on the board`,
      true,
    )
  const issues = cards.flatMap((card) => {
    const id = context.handles.idOf(card)
    const node = context.nodes.find((candidate) => candidate.id === id)
    const found = node ? checkShotBeforeGenerate(node) : []
    const handle = id ? context.handles.handleOf(id) : card
    const checked = context.transcript.some(
      (entry) =>
        entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result &&
        entry.output.startsWith(CHECKED_BEFORE_GENERATE) &&
        entry.output.includes(handle),
    )
    return found.length > 0 && !checked
      ? [`${handle}: ${found.join('; ')}`]
      : []
  })
  if (issues.length > 0)
    return {
      kind: 'result',
      output: `${CHECKED_BEFORE_GENERATE} ${issues.join(' · ')}. Fix what the creator would clearly want fixed, or tell them; then call generate again to put it up.`,
      error: false,
    }

  const ready: AssistantOperatorGenerationRequest[] = []
  const outputs: string[] = []
  for (const card of cards) {
    const plan = await planSafely(context, TOOL.canvasGenerate, {
      target: context.handles.idOf(card),
    })
    if (plan.kind === 'confirmGenerate') {
      // 剧本镜头卡的卡名是整段镜头描述：确认卡上写镜号（S04a）。
      const node = context.nodes.find(
        (candidate) => candidate.id === plan.request.canvasNode?.id,
      )
      ready.push(
        node?.fromScript && plan.request.canvasNode
          ? {
              ...plan.request,
              canvasNode: {
                ...plan.request.canvasNode,
                name: formatScriptShotKey(node.fromScript.shotKey),
              },
            }
          : plan.request,
      )
      continue
    }
    const outcome = yield* settlePlan(
      context,
      TOOL.canvasGenerate,
      `${text.generate} ${nameOf(context, card)}`,
      plan,
    )
    if (outcome.kind === 'result') outputs.push(outcome.output)
  }
  const [first] = ready
  if (!first)
    return {
      kind: 'result',
      output: outputs.join('\n'),
      error: true,
      failureKey: `${TOOL.canvasGenerate}:none`,
    }
  const nodes = ready.flatMap((request) =>
    request.canvasNode ? [request.canvasNode] : [],
  )
  yield {
    type: ASSISTANT_OPERATOR_EVENTS.confirm,
    confirm: {
      kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
      request: nodes.length > 1 ? { ...first, canvasNodes: nodes } : first,
    },
  }
  return {
    kind: 'stop',
    todo: `等你确认生成${nodes.map((node) => `「${node.name}」`).join('')}`,
  }
}

/**
 * 看图：被 @ 的那几张走评审（对着那张卡接的参考与它的提示词说哪里不对），其余带图
 * 的卡走参考分析（看清画面里有什么）。⛔ 没图的卡不硬看 —— 说清看不到，让创作者 @ 它。
 * ⚠ 评审一张一张评：旧执行器一次只看第一张 id，几张一起塞进去后面的会被静默丢掉。
 */
async function* executeLook(
  context: V3Context,
  input: { cards: string[]; question: string },
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const cards = input.cards.slice(0, ASSISTANT_V3_LIMITS.maxLookCards)
  const mentioned = context.request.mentionedAssets ?? []
  const referenceUrls = context.prepared.run.state.referenceUrls
  const critiques: {
    card: string
    assetId: string
    node: AssistantOperatorCanvasNode | null
  }[] = []
  const imageIndices: number[] = []
  const imageCards: string[] = []
  const missing: string[] = []
  for (const card of cards) {
    const id = context.handles.idOf(card)
    const node = id
      ? (context.nodes.find((candidate) => candidate.id === id) ?? null)
      : null
    const asset = mentioned.find(
      (candidate) =>
        candidate.label === node?.name ||
        candidate.label === card ||
        (node?.referenceImageIndex !== undefined &&
          referenceUrls[node.referenceImageIndex] === candidate.url),
    )
    if (asset) {
      critiques.push({ card, assetId: asset.id, node })
    } else if (
      node?.kind === NODE_MEDIA_KIND_IDS.image &&
      node.referenceImageIndex !== undefined
    ) {
      imageIndices.push(node.referenceImageIndex)
      imageCards.push(card)
    } else {
      missing.push(card)
    }
  }
  const outputs: string[] = []
  let failed = false
  const scriptNotes =
    context.nodes
      .filter(
        (node) =>
          node.kind === NODE_MEDIA_KIND_IDS.text &&
          node.subtype === NODE_V4_TEXT_SUBTYPE_IDS.script &&
          !node.textTruncated,
      )
      .map((node) => parseScriptShots(node.text ?? '').outline)
      .filter(Boolean)
      .join('\n\n') || null
  for (const critique of critiques) {
    const title = clampTitle(`${text.look} ${nameOf(context, critique.card)}`)
    const sources = critique.node?.referenceUrls?.length
      ? {
          referenceUrls: critique.node.referenceUrls,
          prompt:
            critique.node.referencePromptContext ?? critique.node.text ?? null,
          scriptNotes,
        }
      : undefined
    const plan = await planGuarded(context, TOOL.critiqueResult, () =>
      planCritiqueResult(
        context.prepared.run,
        { goal: input.question, targetIds: [critique.assetId] },
        context.prepared.user.id,
        sources,
      ),
    )
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
      joinPhrases(
        context,
        imageCards.map((card) => `${text.look} ${nameOf(context, card)}`),
      ),
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
