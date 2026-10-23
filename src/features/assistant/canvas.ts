import 'server-only'

import {
  ASSISTANT_V3_EDIT_OP_IDS,
  ASSISTANT_V3_GUIDE_ITEM_PREFIX,
  ASSISTANT_V3_LANE_ITEM_PREFIX,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_WRITE_FIELD_IDS,
} from '@/constants/assistant-v3'
import { NODE_SCRIPT_PROJECTION_MODE_IDS } from '@/constants/node-script'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { renderAssistantV3Board } from '@/lib/assistant-v3-board'
import { renderAssistantV3MentionTable } from '@/lib/assistant-v3-mentions'
import type { AssistantOperatorPriorStep } from '@/types/assistant-operator'
import {
  AssistantV3EditInputSchema,
  AssistantV3WriteInputSchema,
  type AssistantV3EditOpInput,
  type AssistantV3ParamsInput,
  type AssistantV3TranscriptCall,
  type AssistantV3WriteEntry,
} from '@/types/assistant-v3'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  landedOutput,
  mentionHandleOf,
  thisTurnCanvasSteps,
  translateMutation,
} from '@/services/kernel/assistant-v3.service'
import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'
import {
  ASSISTANT_NEXT_EDIT_OP_IDS as OP,
  type AssistantNextEditOp,
} from '@/features/assistant/constants'
import type { EditChange } from '@/features/assistant/tools'

/**
 * 画布这一台（第 9a 步）：板子、改法、落完之后的结果，都借 v3 画布那一套（`assistant-v3.service`）。
 *
 * ── 和别的台不一样的地方 ─────────────────────────────────────────
 * 画布的改动由浏览器落（新卡落了才有 id），所以一步里的画布改动合成一批（`canvas_batch`），
 * 这一跳停在 `canvas_sync`；浏览器落完带着新画面再来，结果（落没落、新卡叫什么、卡现在的样子）
 * 在那一跳补上。前端那条通道 v3 已经在用，一行不改。
 * ⚠ 9c 删旧内核时，这里借的几样（板子、翻译、落地结果）搬进 `features/assistant/`。
 */

/** 画布上 `edit` 能用的改法（改库、改设置、记忆那几种照旧任何台都能用）。 */
export const CANVAS_OPS: readonly AssistantNextEditOp[] = [
  OP.prompt,
  OP.addCard,
  OP.setCard,
  OP.connect,
  OP.disconnect,
  OP.deleteCard,
  OP.moveToShot,
  OP.reorderShot,
  OP.projectScript,
  OP.handOff,
]

/** 一次 edit 里要交给浏览器落的那一份（v3 的 v4 op + 过程行标题 + 接力时认结果用的那一次调用）。 */
export interface CanvasBatch {
  readonly ops: NodeAssistantOpV4[]
  readonly title: string
  /** v3 形状的入参（`{ops, writes}`）：接力时据它认新卡、列出改过的卡。 */
  readonly input: {
    ops: AssistantV3EditOpInput[]
    writes: AssistantV3WriteEntry[]
  }
  readonly createsCards: boolean
}

type CanvasPiece =
  | { kind: 'edit'; op: AssistantV3EditOpInput }
  | { kind: 'write'; entry: AssistantV3WriteEntry }
  | { kind: 'error'; error: string }

const need = (op: string, field: string): CanvasPiece => ({
  kind: 'error',
  error: `${op} needs ${field}.`,
})

/** 卡的参数那几格：一格都没给 = null（不动）。 */
function paramsOf(change: EditChange): AssistantV3ParamsInput | null {
  const given = [
    change.aspectRatio,
    change.resolution,
    change.quality,
    change.duration,
    change.count,
    change.generateAudio,
    change.template,
  ].some((value) => value !== null && value !== undefined)
  if (!given) return null
  return {
    aspectRatio: change.aspectRatio ?? null,
    resolution: change.resolution ?? null,
    quality: change.quality ?? null,
    duration:
      typeof change.duration === 'number' ? String(change.duration) : null,
    count: typeof change.count === 'number' ? Math.round(change.count) : null,
    generateAudio: change.generateAudio ?? null,
    promptTemplate: change.template ?? null,
  }
}

const shotOf = (value: number | null | undefined) =>
  typeof value === 'number' ? Math.round(value) : null

/** 新工具的一条画布改动 → v3 的一条 edit op 或一条 write。 */
export function toCanvasPiece(
  context: V3Context,
  change: EditChange,
): CanvasPiece {
  switch (change.op) {
    case OP.prompt: {
      if (!change.card)
        return need(change.op, 'card (the handle of the card to write)')
      const id = context.handles.idOf(change.card)
      const node = context.nodes.find((candidate) => candidate.id === id)
      return {
        kind: 'write',
        entry: {
          card: change.card,
          // 文本卡 / 剧本卡写的是正文，别的卡写提示词（模型不必分）。
          field:
            node?.kind === NODE_MEDIA_KIND_IDS.text
              ? ASSISTANT_V3_WRITE_FIELD_IDS.text
              : ASSISTANT_V3_WRITE_FIELD_IDS.prompt,
          mode: (change.mode ??
            (change.edits?.length
              ? 'edit'
              : 'replace')) as AssistantV3WriteEntry['mode'],
          text: change.text ?? null,
          edits: change.edits ?? null,
        },
      }
    }
    case OP.addCard:
      if (!change.ref) return need(change.op, 'ref')
      if (!change.type) return need(change.op, 'type')
      if (!change.name) return need(change.op, 'name')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.add,
          ref: change.ref,
          type: change.type,
          name: change.name,
          model: change.model ?? null,
          params: paramsOf(change),
          text: change.text ?? null,
          shot: shotOf(change.shot),
        },
      }
    case OP.setCard:
      if (!change.card) return need(change.op, 'card')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.set,
          card: change.card,
          name: change.name ?? null,
          model: change.model ?? null,
          params: paramsOf(change),
        },
      }
    case OP.connect:
      if (!change.from) return need(change.op, 'from')
      if (!change.to) return need(change.op, 'to')
      if (!change.port) return need(change.op, 'port')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.connect,
          from: change.from,
          to: change.to,
          slot: change.port,
          role: change.role ?? null,
        },
      }
    case OP.disconnect:
      if (!change.from) return need(change.op, 'from')
      if (!change.to) return need(change.op, 'to')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.disconnect,
          from: change.from,
          to: change.to,
          slot: change.port ?? null,
        },
      }
    case OP.deleteCard:
      if (!change.card) return need(change.op, 'card')
      return {
        kind: 'edit',
        op: { op: ASSISTANT_V3_EDIT_OP_IDS.delete, card: change.card },
      }
    case OP.moveToShot:
      if (!change.card) return need(change.op, 'card')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.moveToShot,
          card: change.card,
          shot: shotOf(change.shot),
        },
      }
    case OP.reorderShot: {
      const from = Number(change.from)
      const to = Number(change.to)
      if (!change.from || Number.isNaN(from))
        return need(change.op, 'from (a lane number)')
      if (!change.to || Number.isNaN(to))
        return need(change.op, 'to (a lane number)')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.reorderShot,
          from: Math.round(from),
          to: Math.round(to),
        },
      }
    }
    case OP.projectScript:
      if (!change.card) return need(change.op, 'card (the script card)')
      return {
        kind: 'edit',
        op: {
          op: ASSISTANT_V3_EDIT_OP_IDS.projectScript,
          script: change.card,
          mode: change.projection ?? NODE_SCRIPT_PROJECTION_MODE_IDS.create,
        },
      }
    case OP.negative:
      return {
        kind: 'error',
        error:
          'Canvas cards have no negative field: write what to leave out into the prompt itself.',
      }
    default:
      return {
        kind: 'error',
        error: `"${change.op}" is not a control on the canvas. It has: ${CANVAS_OPS.join(', ')} (and the library ops, which work everywhere).`,
      }
  }
}

/**
 * 一次 edit 里的画布改动 → 一批 v4 op。加卡与连线一起翻（后面的改动认得前面 add 的 ref），
 * 写词另翻；翻不了的整批不落，回一句哪里不对（与 v3 同一个规矩）。
 */
export function translateCanvasPieces(
  context: V3Context,
  ops: readonly AssistantV3EditOpInput[],
  writes: readonly AssistantV3WriteEntry[],
): { ok: true; batch: CanvasBatch } | { ok: false; error: string } {
  const parts: { ops: NodeAssistantOpV4[]; title: string }[] = []
  let createsCards = false
  if (ops.length) {
    const input = AssistantV3EditInputSchema.safeParse({ ops })
    if (!input.success)
      return { ok: false, error: 'The board changes could not be read.' }
    const translated = translateMutation(
      context,
      ASSISTANT_V3_TOOL_IDS.edit,
      input.data,
    )
    if (!translated.ok) return { ok: false, error: translated.error }
    parts.push(translated)
    createsCards = translated.createsCards
  }
  if (writes.length) {
    const input = AssistantV3WriteInputSchema.safeParse({ writes })
    if (!input.success)
      return { ok: false, error: 'The prompt changes could not be read.' }
    const translated = translateMutation(
      context,
      ASSISTANT_V3_TOOL_IDS.write,
      input.data,
    )
    if (!translated.ok) return { ok: false, error: translated.error }
    parts.push(translated)
  }
  return {
    ok: true,
    batch: {
      ops: parts.flatMap((part) => part.ops),
      title: parts.map((part) => part.title).join('；'),
      input: { ops: [...ops], writes: [...writes] },
      createsCards,
    },
  }
}

/** v3 画板文字里的工具名换成新内核的（读一张卡 / 一条镜头带 / 一份写法都是 look）。 */
export function inNextToolWords(text: string): string {
  return text
    .replace(/\bread a card\b/g, 'look at a card')
    .replace(/\bread it before\b/g, 'look at it before')
    .replace(
      new RegExp(
        `\\bread "(${ASSISTANT_V3_LANE_ITEM_PREFIX}|${ASSISTANT_V3_GUIDE_ITEM_PREFIX})`,
        'g',
      ),
      'look "$1',
    )
}

/** 画布的板子：v3 那一块（被 @ 的卡按 id 展开）+ @ 对照表。 */
export function renderCanvasBoard(
  context: V3Context,
  attachedNames: readonly string[],
  latestUserText: string,
): string {
  const { request } = context
  const canvas = request.snapshot.canvas
  if (!canvas) return 'CANVAS — not available.'
  const onBoard = new Set(context.nodes.map((node) => node.id))
  const mentioned = request.mentionedAssets ?? []
  // 没带 id 的老附图只在名字唯一时认卡（同 v3）。
  const byUniqueName = (label: string | undefined) => {
    const hits = label
      ? context.nodes.filter((node) => node.name === label)
      : []
    return hits.length === 1 ? hits[0]!.id : undefined
  }
  const mentionedIds = [
    ...new Set(
      [
        ...mentioned.map((asset) => asset.nodeId ?? byUniqueName(asset.label)),
        ...(request.mentions ?? []).map((mention) => mention.nodeId),
      ].filter((id): id is string => !!id && onBoard.has(id)),
    ),
  ]
  const board = renderAssistantV3Board({
    canvas,
    handles: context.handles,
    latestUserText,
    mentionedIds,
  })
  const table = renderAssistantV3MentionTable({
    mentions: request.mentions ?? [],
    attachedLabels: attachedNames,
    pointedImageCount: mentioned.length,
    handleOf: (mention) =>
      mentionHandleOf(
        context.face,
        mention,
        context.nodes,
        context.handles,
        request.snapshot,
      ),
  })
  return inNextToolWords(table ? `${board}\n${table}` : board)
}

/** look 的名字里哪些交给画布读卡（句柄、`lane:n`、`guide:型号`），哪些要看图 / 看片。 */
export function splitCanvasLook(
  context: V3Context,
  names: readonly string[],
): { read: string[]; see: string[] } {
  const read: string[] = []
  const see: string[] = []
  for (const name of names) {
    const key = name.trim()
    if (
      key.startsWith(ASSISTANT_V3_LANE_ITEM_PREFIX) ||
      key.startsWith(ASSISTANT_V3_GUIDE_ITEM_PREFIX)
    ) {
      read.push(key)
      continue
    }
    const id = context.handles.idOf(key)
    const node = id
      ? context.nodes.find((candidate) => candidate.id === id)
      : undefined
    if (!node) {
      // 附图、被指着的片子、联网找到的图（#n）：只有看。
      see.push(key)
      continue
    }
    read.push(key)
    if (
      node.imageUrl ||
      node.videoUrl ||
      node.referenceImageIndex !== undefined
    )
      see.push(key)
  }
  return { read, see }
}

/**
 * 接力那一跳：上一跳交给浏览器落的那一批落没落、新卡叫什么、改过的卡现在什么样（v3 的那一段）。
 * `knownIds` 是落之前板子上已有的卡（只有加了卡的那批才记）。
 */
export function landedCanvasResult(input: {
  context: V3Context
  priorSteps: readonly AssistantOperatorPriorStep[]
  callId: string
  batchInput: CanvasBatch['input']
  knownIds?: readonly string[]
}): { output: string; error: boolean } {
  const call: AssistantV3TranscriptCall = {
    id: input.callId,
    tool: ASSISTANT_V3_TOOL_IDS.edit,
    input: JSON.stringify(input.batchInput),
    ...(input.knownIds ? { knownIds: [...input.knownIds] } : {}),
  }
  return landedOutput(
    call,
    thisTurnCanvasSteps(input.priorSteps).at(-1),
    input.context.nodes,
    input.context.handles,
  )
}
