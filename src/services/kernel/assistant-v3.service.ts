import 'server-only'
import { z } from 'zod'
import {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_RESEARCH_LIMITS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_EDIT_OP_IDS,
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
  ASSISTANT_V3_MEMORIES_SEARCH_KIND,
  ASSISTANT_V3_WRITE_MODE_IDS,
  isAssistantV3WebSearchKind,
  type AssistantV3Tool,
} from '@/constants/assistant-v3'
import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NATIVE_SEARCH_FILTER_LIMITS,
  X_HANDLE_PATTERN,
  X_SEARCH_DATE_PATTERN,
} from '@/constants/research'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  formatScriptShotKey,
  parseAssistantV3LaneItem,
  renderAssistantV3BriefCard,
  renderAssistantV3Card,
  type AssistantV3Handles,
} from '@/lib/assistant-v3-board'
import {
  checkShotBeforeGenerate,
  promptTimelineEnd,
} from '@/lib/assistant-v3-shot-checks'
import { ASSISTANT_MENTION_SCOPE_IDS } from '@/constants/assistant-mention'
import type { AssistantMentionRef } from '@/types/assistant-mention'
import {
  translateAssistantV3Edit,
  translateAssistantV3Write,
} from '@/lib/assistant-v3-ops'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorEvent,
  AssistantOperatorGenerationRequest,
  AssistantOperatorPriorStep,
  AssistantOperatorRequest,
  AssistantResearchXSearch,
} from '@/types/assistant-operator'
import {
  AssistantV3AskInputSchema,
  AssistantV3EditInputSchema,
  AssistantV3GenerateInputSchema,
  AssistantV3UpscaleInputSchema,
  AssistantV3LookInputSchema,
  AssistantV3ReadInputSchema,
  AssistantV3SearchLibraryInputSchema,
  AssistantV3SearchWebInputSchema,
  AssistantV3WriteInputSchema,
  type AssistantV3EditOpInput,
  type AssistantV3SearchWebInput,
  type AssistantV3TranscriptCall,
  type AssistantV3WriteEntry,
} from '@/types/assistant-v3'
import { searchMemoriesStep } from '@/services/kernel/assistant-v3-memories.service'
import {
  normalizePlanQuestions,
  recordLedgerStep,
  toStepEvent,
} from '@/services/kernel/assistant-operator.service'
import { executeAssistantV3LoraCall } from '@/services/kernel/assistant-v3-lora.service'
import { openCharacterImages } from '@/lib/assistant-v3-cards-board'
import { executeAssistantV3CardsCall } from '@/services/kernel/assistant-v3-cards.service'
import { executeAssistantV3ImageCall } from '@/services/kernel/assistant-v3-image.service'
import {
  joinPhrases,
  nextStep,
  planSafely,
  rejectedStep,
  settlePlan,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'
import {
  lookTargetOfFind,
  parseResearchSourceHandle,
  v3ResearchSourceOf,
} from '@/services/kernel/assistant-v3-finds.service'
import {
  isAssistantV3VideoModel,
  parseGuideItem,
  renderAssistantV3ModelGuide,
} from '@/services/kernel/assistant-v3-guides.service'
import {
  joinOutcomes,
  referenceIndexOf,
  refused,
  runOldTool,
  runWebFind,
} from '@/services/kernel/assistant-v3-bench.service'
import {
  executeV3Look,
  type V3LookClipTarget,
  type V3LookTarget,
} from '@/services/kernel/assistant-v3-look.service'

export type MutatingTool =
  | typeof ASSISTANT_V3_TOOL_IDS.edit
  | typeof ASSISTANT_V3_TOOL_IDS.write
const CHECKED_BEFORE_GENERATE = 'Not put up yet — checked first:'

/**
 * 一条 `@` 引用在这张脸上的句柄（§10b「按 id 解析到句柄」）：画布的卡按 `nodeId`，
 * 角色页的角色、LoRA 台的 LoRA 按各自的 id。不在这张板子上 = `null`。
 */
export function mentionHandleOf(
  face: string,
  mention: AssistantMentionRef,
  nodes: readonly AssistantOperatorCanvasNode[],
  handles: AssistantV3Handles,
  snapshot: AssistantOperatorRequest['snapshot'],
): string | null {
  if (mention.nodeId && nodes.some((node) => node.id === mention.nodeId))
    return handles.handleOf(mention.nodeId)
  if (
    face === ASSISTANT_V3_FACE_IDS.cards &&
    mention.scope === ASSISTANT_MENTION_SCOPE_IDS.character &&
    snapshot.cards?.characters?.some((item) => item.id === mention.id)
  )
    return handles.handleOf(mention.id)
  if (
    face === ASSISTANT_V3_FACE_IDS.lora &&
    mention.scope === ASSISTANT_MENTION_SCOPE_IDS.lora &&
    snapshot.loras?.items?.some((item) => item.id === mention.id)
  )
    return handles.handleOf(mention.id)
  return null
}

function shortName(name: string): string {
  return name.length > 24 ? `${name.slice(0, 24)}…` : name
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

/** 本轮的画布步（前端落完、带着成败回来的那几条）。 */
export function thisTurnCanvasSteps(
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

/** 画布那一批只落了一部分时结果的开头（模型读的字；`isLandingStep` 也按它认）。 */
const PARTIAL_LANDING = 'Landed only in part'

export function landedOutput(
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
      ? `${PARTIAL_LANDING} — ${step.detail ?? ''}`
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
 * 一次工具调用
 * ───────────────────────────────────────────────────────────────────────── */

/** edit / write → 这一批的 v4 op 与过程行标题。⛔ 不落：由回合循环合成一批再落。 */
export function translateMutation(
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

/**
 * 只留创作者自己说了「只在…查」的来源。⚠ 模型自己填的（「只搜 danbooru」「只搜 web」）
 * 会被旧执行器当成这一轮的来源名单，于是不再走自带联网、改走管线（2026-10-10 回放
 * I1：中文名在 danbooru 里搜不到，自带联网一次就查到）。⚠ 光提到站名不算：「Danbooru
 * 标签是什么」问的是标签，⛔ 不是「只在 Danbooru 查」。
 */
const ONLY_SOURCE_WORDS = /只|仅|僅|だけ|のみ|\bonly\b/i

/**
 * 模型给的 X 收窄 → 能交给 Grok 的那份：账号去掉 `@`、认不得的丢掉，日期不合
 * `YYYY-MM-DD` 的丢掉。⛔ 不为一个写错的日期让整次搜索被拒。
 */
function toXSearch(
  x: NonNullable<AssistantV3SearchWebInput['x']>,
): AssistantResearchXSearch {
  const handles = [
    ...new Set(
      x.handles
        .map((handle) => handle.trim().replace(/^@/, ''))
        .filter((handle) => X_HANDLE_PATTERN.test(handle)),
    ),
  ].slice(0, NATIVE_SEARCH_FILTER_LIMITS.xHandles)
  const fromDate = x.fromDate?.trim()
  const toDate = x.toDate?.trim()
  return {
    handles,
    ...(fromDate && X_SEARCH_DATE_PATTERN.test(fromDate) ? { fromDate } : {}),
    ...(toDate && X_SEARCH_DATE_PATTERN.test(toDate) ? { toDate } : {}),
  }
}

function namedByCreator(
  context: V3Context,
  sources: readonly string[],
): string[] {
  const said = context.request.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n')
    .toLowerCase()
  if (!ONLY_SOURCE_WORDS.test(said)) return []
  return sources.filter((source) => {
    const token = source.trim().toLowerCase()
    return token.length > 0 && said.includes(token.split('.')[0] ?? token)
  })
}

/**
 * 反问选项的缩略图（2026-10-14 恢复缩略图题）—— 模型给句柄，这里换成**这一轮手上
 * 已有的那张图**：附图（名字 / id）· 角色页 card-N · 工作台 ref-N · 画布卡句柄。
 * ⛔ 不收模型写的地址：对不上任何一张已知的图就不画缩略图（外链追踪 / SSRF）。
 */
function askImageUrl(
  context: V3Context,
  handle: string | null,
): string | undefined {
  const key = handle?.trim()
  if (!key) return undefined
  const attached = (context.request.mentionedAssets ?? []).find(
    (asset) => asset.label === key || asset.id === key,
  )
  if (attached) return attached.url
  const lowered = key.toLowerCase()
  const cardImage = /^card-(\d+)$/.exec(lowered)
  if (cardImage && context.face === ASSISTANT_V3_FACE_IDS.cards)
    return openCharacterImages(context.request.snapshot.cards?.open)[
      Number(cardImage[1]) - 1
    ]
  const reference = referenceIndexOf(context, lowered)
  if (reference !== null)
    return context.request.snapshot.references?.items[reference]?.url
  const id = context.handles.idOf(key)
  const node = id
    ? context.nodes.find((candidate) => candidate.id === id)
    : undefined
  if (node?.imageUrl) return node.imageUrl
  return node?.referenceImageIndex !== undefined
    ? (context.prepared.run.state.referenceUrls[node.referenceImageIndex] ??
        undefined)
    : undefined
}

const ReadCardsListSchema = z.object({ cards: z.array(z.string()) })
const ReadItemsListSchema = z.object({ items: z.array(z.string()) })

/**
 * `read` 里的 `"[3]"`（查证的资料号，搜索期第三片）：五张脸的 read 入参形状各不相同（画布
 * `cards`，别的脸 `items`），这里统一摘出来；剩下的照原路读。没有一项是 `[n]` → `null`。
 */
function splitSourceReads(
  input: unknown,
): { cites: number[]; rest: unknown | null } | null {
  const cards = ReadCardsListSchema.safeParse(input)
  const items = cards.success ? null : ReadItemsListSchema.safeParse(input)
  const list = cards.success ? cards.data.cards : items?.data?.items
  if (!list) return null
  const cites = list.map(parseResearchSourceHandle)
  if (cites.every((cite) => cite === null)) return null
  const rest = list.filter((_, index) => cites[index] === null)
  const key = cards.success ? 'cards' : 'items'
  return {
    cites: cites.filter((cite): cite is number => cite !== null),
    rest: rest.length
      ? { ...z.record(z.string(), z.unknown()).parse(input), [key]: rest }
      : null,
  }
}

/**
 * 画布 `read` 里的 `"lane:<n>"`（P2 第二片「板子分级」）：换成那条镜头带上的卡的句柄，照原路读。
 * 没有一项是 → `null`。
 */
function splitLaneReads(
  input: unknown,
): { lanes: number[]; rest: string[] } | null {
  const parsed = ReadCardsListSchema.safeParse(input)
  if (!parsed.success) return null
  const lanes = parsed.data.cards.map(parseAssistantV3LaneItem)
  if (lanes.every((lane) => lane === null)) return null
  return {
    lanes: [...new Set(lanes.filter((lane): lane is number => lane !== null))],
    rest: parsed.data.cards.filter((_, index) => lanes[index] === null),
  }
}

/**
 * `read "lane:<n>"`：那几条带上的卡按原路读（全文；一次最多 `maxReadCards` 张，其余一张一行、
 * 给句柄）。⚠ 读的是**这一跳的快照**（板子是开轮那一刻的）；前端折起来的带（很大的画布）快照里
 * 本来就没有卡，读不到，照实说。
 */
async function* readLanes(
  context: V3Context,
  lanes: readonly number[],
  rest: readonly string[],
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const shots = context.request.snapshot.canvas?.shots ?? []
  const notes: string[] = []
  const wanted = [...rest]
  for (const shotNo of lanes) {
    const lane = shots.find((shot) => shot.shotNo === shotNo)
    if (!lane) notes.push(`There is no LANE ${shotNo} on the board.`)
    else if (!lane.expanded)
      notes.push(
        `LANE ${shotNo} is collapsed on the creator's screen: its ${lane.nodeCount} cards are not available to you. Ask the creator to select a card in it.`,
      )
    else {
      wanted.push(
        ...lane.nodes.map((node) => context.handles.handleOf(node.id)),
      )
      if (lane.omittedCount)
        notes.push(
          `LANE ${shotNo} has ${lane.omittedCount} more cards that are not in your snapshot.`,
        )
    }
  }
  if (!wanted.length && !notes.length)
    notes.push(`LANE ${lanes.join(', ')} has no cards.`)
  const cards = [...new Set(wanted)]
  const now = cards.slice(0, ASSISTANT_V3_LIMITS.maxReadCards)
  const later = cards.flatMap((card) => {
    if (now.includes(card)) return []
    const id = context.handles.idOf(card)
    const node = context.nodes.find((item) => item.id === id)
    return node ? [renderAssistantV3BriefCard(node, context.handles)] : []
  })
  const outcomes: V3Outcome[] = []
  if (now.length)
    outcomes.push(
      yield* executeCall(context, ASSISTANT_V3_TOOL_IDS.read, { cards: now }),
    )
  if (later.length)
    notes.push(
      `${later.length} more cards there, one line each — read them by handle:\n${later.join('\n')}`,
    )
  if (notes.length)
    outcomes.push({
      kind: 'result',
      output: notes.join('\n'),
      error: now.length === 0,
    })
  return joinOutcomes(outcomes)
}

/**
 * 画布 `read` 里的 `"guide:<型号>"`（P2 第二片）：摘出来现给那份写法（⛔ 不出过程行 —— 那是
 * 模型自己的功课，不是创作者要看的一步）。没有一项是 → `null`。
 */
function splitGuideReads(
  input: unknown,
): { models: string[]; rest: string[] } | null {
  const parsed = ReadCardsListSchema.safeParse(input)
  if (!parsed.success) return null
  const models = parsed.data.cards.map(parseGuideItem)
  if (models.every((model) => model === null)) return null
  return {
    models: [
      ...new Set(models.filter((model): model is string => model !== null)),
    ].slice(0, ASSISTANT_V3_LIMITS.maxReadCards),
    rest: parsed.data.cards.filter((_, index) => models[index] === null),
  }
}

/** 把查证的一条资料再读一遍全文（旧执行器的 read_url，地址由服务端按 `[n]` 换回）。 */
async function* readResearchSource(
  context: V3Context,
  cite: number,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const source = v3ResearchSourceOf(context.transcript, cite)
  if (!source)
    return yield* refused(
      context,
      TOOL.readUrl,
      `${text.readPage} [${cite}]`,
      `There is no source [${cite}] with a page to read this turn: use a number from this turn's search_web results (sources without a page — tag lists, the search model's own answer — cannot be read again).`,
    )
  return yield* runOldTool(
    context,
    TOOL.readUrl,
    `${text.readPage} ${source.title}`,
    { url: source.url },
  )
}

export async function* executeCall(
  context: V3Context,
  /** ⚠ `open`（开台）由新内核自己跑，不到这里。 */
  name: Exclude<
    AssistantV3Tool,
    MutatingTool | typeof ASSISTANT_V3_TOOL_IDS.open
  >,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  if (
    name === ASSISTANT_V3_TOOL_IDS.read &&
    context.face === ASSISTANT_V3_FACE_IDS.canvas
  ) {
    const guides = splitGuideReads(input)
    if (guides) {
      // 写法排在前面：结果按 `maxEntryChars` 截时，截掉的是后面的卡，⛔ 不是写法。
      const outcomes: V3Outcome[] = guides.models.map((modelId) => ({
        kind: 'result',
        output: renderAssistantV3ModelGuide(
          modelId,
          isAssistantV3VideoModel(modelId, context.nodes),
        ),
        error: false,
      }))
      if (guides.rest.length)
        outcomes.push(yield* executeCall(context, name, { cards: guides.rest }))
      return joinOutcomes(outcomes)
    }
    const lanes = splitLaneReads(input)
    if (lanes) return yield* readLanes(context, lanes.lanes, lanes.rest)
  }
  if (name === ASSISTANT_V3_TOOL_IDS.read) {
    const sources = splitSourceReads(input)
    if (sources) {
      const outcomes: V3Outcome[] = []
      if (sources.rest !== null)
        outcomes.push(yield* executeCall(context, name, sources.rest))
      for (const cite of sources.cites.slice(
        0,
        ASSISTANT_V3_LIMITS.maxReadCards,
      ))
        outcomes.push(yield* readResearchSource(context, cite))
      return joinOutcomes(outcomes)
    }
  }
  if (
    context.face !== ASSISTANT_V3_FACE_IDS.canvas &&
    (name === ASSISTANT_V3_TOOL_IDS.read ||
      name === ASSISTANT_V3_TOOL_IDS.look ||
      name === ASSISTANT_V3_TOOL_IDS.generate ||
      name === ASSISTANT_V3_TOOL_IDS.searchLibrary)
  )
    return context.face === ASSISTANT_V3_FACE_IDS.lora
      ? yield* executeAssistantV3LoraCall(context, name, input)
      : context.face === ASSISTANT_V3_FACE_IDS.cards &&
          name !== ASSISTANT_V3_TOOL_IDS.generate
        ? yield* executeAssistantV3CardsCall(context, name, input)
        : yield* executeAssistantV3ImageCall(context, name, input)
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
    case ASSISTANT_V3_TOOL_IDS.upscale:
      return yield* executeUpscale(
        context,
        AssistantV3UpscaleInputSchema.parse(input).cards,
      )
    case ASSISTANT_V3_TOOL_IDS.look:
      return yield* executeLook(
        context,
        AssistantV3LookInputSchema.parse(input),
      )
    case ASSISTANT_V3_TOOL_IDS.searchWeb: {
      const parsed = AssistantV3SearchWebInputSchema.parse(input)
      const x = parsed.x ? toXSearch(parsed.x) : null
      /** 创作者按了「用 Grok 搜这一次」、所选又不是 Grok：步骤行写清花的是谁的额度。 */
      const lendsGrok =
        x !== null &&
        context.request.searchWithGrok === true &&
        context.prepared.run.route.adapterType !== AI_ADAPTER_TYPES.XAI
      const title = `${lendsGrok ? text.searchXWithGrok : text.searchWeb} ${parsed.goal}`
      const onlySources = namedByCreator(context, parsed.onlySources ?? [])
      const plan = await planSafely(context, TOOL.research, {
        goal: parsed.goal,
        // 多给的名字截掉，⛔ 不让整次检索因个数超了被拒（DeepSeek 一次给了五个）。
        ...(parsed.entities.length
          ? {
              entities: parsed.entities
                .map((entity) =>
                  entity
                    .trim()
                    .slice(0, ASSISTANT_RESEARCH_LIMITS.maxEntityChars),
                )
                .filter(Boolean)
                .slice(0, ASSISTANT_RESEARCH_LIMITS.maxEntities),
            }
          : {}),
        ...(onlySources.length ? { onlySources } : {}),
        ...(parsed.depth ? { depth: parsed.depth } : {}),
        ...(x ? { x } : {}),
      })
      return yield* settlePlan(context, TOOL.research, title, plan)
    }
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3SearchLibraryInputSchema.parse(input)
      if (parsed.kind === ASSISTANT_V3_MEMORIES_SEARCH_KIND)
        return yield* searchMemoriesStep(context, parsed.query)
      if (isAssistantV3WebSearchKind(parsed.kind))
        return yield* runWebFind(
          context,
          parsed.kind,
          parsed.query,
          parsed.subject,
        )
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
                .map((option) => {
                  const assetUrl = askImageUrl(context, option.image)
                  return {
                    label: option.label,
                    description: option.description,
                    recommended: option.recommended,
                    ...(assetUrl ? { assetUrl } : {}),
                  }
                }),
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
      const why = parsed.why
        ?.trim()
        .slice(0, ASSISTANT_V3_LIMITS.maxQuestionChars)
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        questions,
        ...(why ? { why } : {}),
      }
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
 * 放大（P6，owner 2026-10-16「修到 4K」走放大原图）：几张有图的图片卡一张确认卡。
 * ⛔ 服务端不调放大、不存图：放大由客户端在创作者按下时走画布同一条放大能力（创作者自己的
 *   fal key，不扣积分），结果追加成那张卡的新版本（owner 2026-10-15 手动放大的规矩）。
 */
async function* executeUpscale(
  context: V3Context,
  requested: readonly string[],
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const cards = [...new Set(requested)].slice(
    0,
    ASSISTANT_OPERATOR_LIMITS.maxCanvasGenerateCards,
  )
  if (cards.length === 0)
    return {
      kind: 'result',
      output: 'upscale needs the cards to enlarge.',
      error: true,
      failureKey: `${ASSISTANT_V3_TOOL_IDS.upscale}:empty`,
    }
  const problems: string[] = []
  const nodes: { id: string; name: string }[] = []
  for (const card of cards) {
    const id = context.handles.idOf(card)
    const node = id
      ? context.nodes.find((candidate) => candidate.id === id)
      : undefined
    if (!node) {
      const nearest = context.handles
        .nearest(card)
        .map((other) => context.handles.handleOf(other))
      problems.push(
        `no card "${card}"${nearest.length ? ` — did you mean ${nearest.join(', ')}?` : ''}`,
      )
    } else if (node.kind !== NODE_MEDIA_KIND_IDS.image)
      problems.push(
        `${context.handles.handleOf(node.id)} is not an image card — only pictures can be enlarged`,
      )
    else if (!node.imageUrl)
      problems.push(
        `${context.handles.handleOf(node.id)} has no picture yet — generate it first`,
      )
    else nodes.push({ id: node.id, name: node.name })
  }
  if (nodes.length === 0)
    return {
      kind: 'result',
      output: problems.join('; '),
      error: true,
      failureKey: `${ASSISTANT_V3_TOOL_IDS.upscale}:none`,
    }
  yield {
    type: ASSISTANT_OPERATOR_EVENTS.confirm,
    confirm: {
      kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale,
      request: { nodes },
    },
  }
  return {
    kind: 'stop',
    todo: `等你确认放大${nodes.map((node) => `「${node.name}」`).join('')}${problems.length ? `（没放进来的：${problems.join('; ')}）` : ''}`,
  }
}

/**
 * 看图（画布）：每张卡找出它的图，交给 `executeV3Look` 放到模型眼前。
 * ⭐ 先按卡的 id 找 `@` 带上来的那一张（`nodeId`），再找图片卡自己那张图，最后才按名字认
 *   **没带 `nodeId`** 的老附图（📎 / 答题带上来的图、老客户端）—— 带了 id 的⛔ 不拿名字去撞，
 *   同名卡只认得第一张正是要修的那个病。
 * ⭐ 视频卡（看图期第二段）：被指着的那几段已经在眼前（板子上的 `clips`，按卡 id 认）；没被
 *   指着的交成片地址（`videoUrl`），由 `executeV3Look` 判 Gemini 能不能看片子本体、别家请创作者 @。
 * ⛔ 没图的卡不硬看：说清看不到，让创作者 @ 它。对照参考 = 把它接的参考卡写进同一次 look。
 */
async function* executeLook(
  context: V3Context,
  input: { cards: string[]; question: string },
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const mentioned = context.request.mentionedAssets ?? []
  const referenceUrls = context.prepared.run.state.referenceUrls
  const board = context.transcript[0]
  const boardClips =
    board?.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board
      ? (board.clips ?? [])
      : []
  const targets: V3LookTarget[] = []
  const clips: V3LookClipTarget[] = []
  const nodeIds: string[] = []
  const notes: string[] = []
  for (const card of input.cards) {
    // 联网找到的图（`#n`）：画布上也认。
    const find = lookTargetOfFind(context.transcript, card)
    if (typeof find === 'string') {
      notes.push(find)
      continue
    }
    if (find) {
      targets.push(find)
      continue
    }
    const id = context.handles.idOf(card)
    const node = id
      ? (context.nodes.find((candidate) => candidate.id === id) ?? null)
      : null
    if (!node) {
      // 没有句柄的名字：先认被指着的那几段片子（库里 / 结果里 @ 上来的没有卡）。
      const pointedClip = boardClips.find((clip) => clip.label === card)
      if (pointedClip) {
        clips.push({ ...pointedClip })
        continue
      }
    }
    const name = node
      ? node.fromScript
        ? formatScriptShotKey(node.fromScript.shotKey)
        : shortName(node.name)
      : card
    if (node?.kind === NODE_MEDIA_KIND_IDS.video) {
      const url =
        boardClips.find((clip) => clip.nodeId === node.id)?.url ?? node.videoUrl
      if (!url) {
        notes.push(
          `Could not watch ${nameOf(context, card)}: it has no clip yet.`,
        )
        continue
      }
      clips.push({
        url,
        label: `${context.handles.handleOf(node.id)} ${name}`,
        title: name,
        nodeId: node.id,
      })
      nodeIds.push(node.id)
      continue
    }
    const asset =
      (node && mentioned.find((candidate) => candidate.nodeId === node.id)) ??
      mentioned.find(
        (candidate) =>
          !candidate.nodeId &&
          (candidate.label === card ||
            (node !== null && candidate.label === node.name)),
      )
    // 卡自己带的地址优先：参考名单最多 16 张，画布图一多新出的就排不进去。
    const own =
      node?.kind === NODE_MEDIA_KIND_IDS.image
        ? (node.imageUrl ??
          (node.referenceImageIndex !== undefined
            ? referenceUrls[node.referenceImageIndex]
            : undefined))
        : undefined
    const url = asset?.url ?? own
    if (!url) {
      notes.push(
        `Could not see ${node ? nameOf(context, card) : `"${card}"`}: no picture of it reached you. If it has an output, ask the creator to @ it in their message.`,
      )
      continue
    }
    if (!node) {
      targets.push({ url, label: asset?.label ?? card })
      continue
    }
    // ⚠ 给模型的称呼带句柄（三张「镜头1」分得清），过程行只写名字（⛔ 不露句柄）。
    targets.push({
      url,
      label: `${context.handles.handleOf(node.id)} ${name}`,
      title: name,
    })
    nodeIds.push(node.id)
  }
  return yield* executeV3Look(context, {
    targets,
    clips,
    notes,
    question: input.question,
    nodeIds,
  })
}
