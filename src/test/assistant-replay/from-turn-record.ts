/**
 * 一行过程记录（`AssistantTurnRecord`，owner 2026-10-15「建表」）→ 一道回放题的草稿。
 *
 * ⭐ 纯函数：进来的是**一行**的 JSON（库里导出的 `row_to_json`、或回放自己写下的那一行），
 *   出去的是 `fixtures/boards/<board>.json` + `fixtures/cases/<id>.json` 两份，过同一套 schema。
 *   ⛔ 这里不连库、不取数：拿哪一行由人决定，导出也由人做。
 * ⭐ 补得出来的：起始画布（开轮那一跳的快照里展开的那几面镜）、创作者这一句与之前的对话、
 *   `@` 到的卡、选中的卡、片子的片长、上一轮找到的东西（`#n`，`input.priorFinds` 原样带进
 *   `turn.priorFinds`）、选的那一家与型号、模型每一次的回复（整轮，按顺序）、跳数与怎么收的。
 * ⚠ 找到的东西的地址照原样、⛔ 不换到假主机上：模型只读编号那一行（标题 / 域名 / 尺寸），能不能
 *   当参考按 `domain` / `pageUrl` 判。回放里真有一步去取那张图，会记成意外的网络（`fake-network.ts`）。
 * ⚠ 补不出来的一律进 `gaps`（写题的人要补或核对）：折叠的镜、读不全的正文、记录里没有地址的
 *   产出（换成假主机上的占位地址）、库外的 `@`、联网答复、被截过的那几段……还有 `expect` 里
 *   除了「怎么收、发了几次请求」以外的格 —— 落了什么、出没出卡、回复说了什么，先拿这份草稿跑
 *   一遍 `REPLAY_DEBUG=1 npm run test:replay` 再照实填。
 * ⚠ 一轮里新建的卡在回放里拿到的是确定的假 id（`runner.ts` 的 `createMintId`），与线上那张的
 *   句柄不同：模型后面的回复若按句柄指新卡，那几处要改成回放里的句柄。
 */
import { ASSISTANT_TURN_RECORD_CUT_IDS } from '@/constants/assistant-turn-record'
import { ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS } from '@/constants/assistant-v3'
import { getModelById } from '@/constants/models'
import { NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { ASSISTANT_MENTION_SCOPE_IDS } from '@/constants/assistant-mention'
import {
  AssistantTurnRecordSchema,
  type AssistantTurnRecord,
} from '@/types/assistant-turn-record'
import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'
import {
  NodeV4Schema,
  NodeWorkflowEdgeV4Schema,
  NodeWorkflowStateV4Schema,
  type NodeV4,
  type NodeWorkflowEdgeV4,
  type NodeWorkflowModelSelection,
} from '@/types/node-workflow'

import {
  ReplayBoardSchema,
  ReplayCaseSchema,
  ReplayProviderSchema,
  type ReplayBoard,
  type ReplayCase,
  type ReplayReply,
} from './fixture'

export const REPLAY_TURN_RECORD_ASSET_HOST = 'cdn.replay.test'

export interface ReplayFromTurnRecordOptions {
  /** 题号（`T26`、`K02`…，见 `ReplayCaseSchema.id`）。 */
  readonly id: string
  /** 起始画布存成哪个文件（`fixtures/boards/<board>.json`）。 */
  readonly board: string
  readonly title?: string
  /** 板上图 / 片子的地址一律换到这台假主机上（`fake-network.ts` 按扩展名现做字节）。 */
  readonly assetHost?: string
  /** 回放里的项目 id（缺席 = 记录里的那个，没有就用 `turn-record`）。 */
  readonly projectId?: string
}

export interface ReplayFromTurnRecord {
  readonly board: ReplayBoard
  readonly testCase: ReplayCase
  /** 一行记录补不出来、写题的人要自己补或核对的那几样（空 = 没有）。 */
  readonly gaps: string[]
}

const ENTRY = ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS
const OUTCOME_END: Record<
  AssistantTurnRecord['outcome'],
  ReplayCase['expect']['end'] | null
> = {
  done: 'done',
  quiet: 'done',
  empty: 'done',
  content_filter: 'done',
  same_failure: 'done',
  awaiting_confirm: 'awaiting_confirm',
  max_steps: 'max_steps',
  error: 'error',
  relay: null,
  aborted: null,
}

/** 收尾那一步模型空着回的次数（空回复从本轮记录里撤掉了，只剩收尾方式能说明）。 */
const TRAILING_EMPTY_REPLIES: Partial<
  Record<AssistantTurnRecord['outcome'], number>
> = { quiet: 1, empty: 2 }

const MEDIA_EXTENSION: Record<string, string> = {
  [NODE_MEDIA_KIND_IDS.image]: 'png',
  [NODE_MEDIA_KIND_IDS.video]: 'mp4',
  [NODE_MEDIA_KIND_IDS.audio]: 'mp3',
}

/** 记录里的地址 → 假主机上的同一条路径（`data:` 与认不出的 → `null`）。 */
function relocate(url: string, assetHost: string): string | null {
  if (/^data:/i.test(url)) return null
  try {
    const parsed = new URL(url)
    return `https://${assetHost}${parsed.pathname}`
  } catch {
    return null
  }
}

/** 快照里只有型号 id：家、渠道从内置名册补（与工作区选择器同一个 `optionId` 写法）。 */
function modelSelection(
  modelId: string | undefined,
): NodeWorkflowModelSelection | undefined {
  if (!modelId) return undefined
  const model = getModelById(modelId)
  if (!model) return undefined
  return {
    optionId: `workspace:${model.id}`,
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: {
      label: model.providerConfig.label,
      baseUrl: model.providerConfig.baseUrl,
    },
  }
}

/** 镜头卡的标签：卡名去掉 `S04b ` 这样的镜号前缀。 */
function shotLabel(name: string): string {
  return name.replace(/^S\d+[a-z]?\s+/i, '').trim() || name
}

function statusOf(node: AssistantOperatorCanvasNode): string {
  if (node.generating) return NODE_STATUS_IDS.running
  if (node.lastFailure) return NODE_STATUS_IDS.failed
  return NODE_STATUS_IDS.idle
}

interface OrderHint {
  readonly shot: number | null
  /** 在参考位上排第几（`referenceImageIndex`）。 */
  readonly reference?: number
}

/**
 * 卡在画布上的先后：快照按镜分组（镜里保留原来的先后），参考位与剪辑台的素材列按画布上
 * 卡的先后排。几条一起排回去，参考位、镜里、素材列的先后就都与线上一样。
 * ⚠ 创作者手动调过参考位的顺序时两条可能对不上：按快照的先后排，记一条缺口。
 */
function boardOrder(
  nodes: readonly NodeV4[],
  hints: ReadonlyMap<string, OrderHint>,
  /** 剪辑台那一列素材（`buildTimelineAssets`）：也是按卡在画布上的先后。 */
  assets: readonly string[],
  gaps: string[],
): NodeV4[] {
  const after = new Map<string, string[]>(nodes.map((node) => [node.id, []]))
  const waiting = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  const chain = (ids: readonly string[]) => {
    for (let index = 1; index < ids.length; index += 1) {
      after.get(ids[index - 1]!)!.push(ids[index]!)
      waiting.set(ids[index]!, waiting.get(ids[index]!)! + 1)
    }
  }
  const byShot = new Map<number | null, string[]>()
  for (const node of nodes) {
    const shot = hints.get(node.id)?.shot ?? null
    byShot.set(shot, [...(byShot.get(shot) ?? []), node.id])
  }
  for (const ids of byShot.values()) chain(ids)
  chain(
    nodes
      .filter((node) => hints.get(node.id)?.reference !== undefined)
      .sort((a, b) => hints.get(a.id)!.reference! - hints.get(b.id)!.reference!)
      .map((node) => node.id),
  )
  chain(assets.filter((id) => after.has(id)))

  const placed = new Set<string>()
  const ordered: NodeV4[] = []
  let conflict = false
  while (ordered.length < nodes.length) {
    const next =
      nodes.find(
        (node) => !placed.has(node.id) && waiting.get(node.id) === 0,
      ) ?? nodes.find((node) => !placed.has(node.id))!
    if (waiting.get(next.id) !== 0) conflict = true
    placed.add(next.id)
    ordered.push(next)
    for (const id of after.get(next.id) ?? [])
      waiting.set(id, Math.max(0, waiting.get(id)! - 1))
  }
  if (conflict)
    gaps.push(
      'the reference order differs from the card order: the replay lists references in card order',
    )
  return ordered
}

function rebuildBoard(
  record: AssistantTurnRecord,
  options: { assetHost: string; projectId: string },
  gaps: string[],
): { board: ReplayBoard; namesById: Map<string, string> } {
  const snapshot = record.snapshot
  const canvas = snapshot?.canvas
  if (!canvas)
    throw new Error(
      snapshot
        ? 'turn record: the opening snapshot has no canvas (only canvas turns replay)'
        : `turn record: no opening snapshot (${record.truncated.join(', ') || 'none stored'})`,
    )
  const references = snapshot.references?.items ?? []
  const createdAt =
    record.createdAt instanceof Date
      ? record.createdAt.toISOString()
      : (record.createdAt ?? '2026-10-15T00:00:00.000Z')
  const nodes: NodeV4[] = []
  const hints = new Map<string, OrderHint>()
  const inputsByTarget = new Map<
    string,
    AssistantOperatorCanvasNode['inputs']
  >()

  for (const shot of canvas.shots) {
    if (!shot.expanded) {
      gaps.push(
        `shot ${shot.title} was collapsed in the snapshot: its ${shot.nodeCount} card(s) are not on the board`,
      )
      continue
    }
    if (shot.omittedCount)
      gaps.push(
        `shot ${shot.title}: ${shot.omittedCount} card(s) were left out of the snapshot`,
      )
    shot.nodes.forEach((node, index) => {
      const base = {
        name: node.name,
        createdAt,
        status: statusOf(node),
        ...(shot.shotNo === null ? {} : { shotNo: shot.shotNo }),
      }
      const failure = node.lastFailure
        ? {
            generationFailure: {
              ...(node.lastFailure.code
                ? { errorCode: node.lastFailure.code }
                : {}),
              ...(node.lastFailure.message
                ? { error: node.lastFailure.message }
                : {}),
            },
          }
        : {}
      if (node.textTruncated)
        gaps.push(`card ${node.name}: its text was cut in the snapshot`)
      const model = modelSelection(node.model)
      if (node.model && !model)
        gaps.push(
          `card ${node.name}: model ${node.model} is not a built-in model (left off)`,
        )
      const params = node.parameters?.values
      const placeholder = `https://${options.assetHost}/turn-record/${node.id}.${MEDIA_EXTENSION[node.kind] ?? 'bin'}`
      const outputUrl = (known: string | undefined): string | undefined => {
        const moved = known ? relocate(known, options.assetHost) : null
        if (moved) return moved
        if (!node.hasOutput) return undefined
        gaps.push(
          `card ${node.name}: the record has no address for its output (placeholder ${placeholder})`,
        )
        return placeholder
      }

      let data: Record<string, unknown>
      if (node.kind === NODE_MEDIA_KIND_IDS.text) {
        data = {
          ...base,
          kind: node.kind,
          subtype: node.subtype,
          body: node.text ?? '',
        }
      } else if (node.kind === NODE_MEDIA_KIND_IDS.image) {
        const url = outputUrl(
          node.referenceImageIndex === undefined
            ? undefined
            : references[node.referenceImageIndex]?.url,
        )
        data = {
          ...base,
          ...failure,
          kind: node.kind,
          subtype: node.subtype,
          ...(url ? { url } : {}),
          ...(model ? { model } : {}),
          ...(node.text === undefined ? {} : { prompt: node.text }),
          ...(params ? { params } : {}),
        }
      } else if (node.kind === NODE_MEDIA_KIND_IDS.video) {
        const url = outputUrl(node.videoUrl)
        data = {
          ...base,
          ...failure,
          kind: node.kind,
          subtype: node.subtype,
          ...(node.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
            ? { label: shotLabel(node.name) }
            : {}),
          ...(url ? { url } : {}),
          ...(model ? { model } : {}),
          ...(node.text === undefined ? {} : { prompt: node.text }),
          ...(params ? { params } : {}),
        }
      } else {
        const url = outputUrl(undefined)
        data = {
          ...base,
          ...failure,
          kind: node.kind,
          subtype: node.subtype,
          ...(url ? { url } : {}),
          ...(model ? { model } : {}),
          ...(node.text === undefined ? {} : { prompt: node.text }),
        }
      }
      if (node.fromScript)
        gaps.push(
          `card ${node.name}: projected from a script (the projection link is not rebuilt)`,
        )
      const parsed = NodeV4Schema.safeParse({
        id: node.id,
        position: node.position ?? { x: index * 300, y: 0 },
        data,
      })
      if (!parsed.success) {
        gaps.push(
          `card ${node.name}: could not be rebuilt (${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')})`,
        )
        return
      }
      nodes.push(parsed.data)
      hints.set(node.id, {
        shot: shot.shotNo,
        ...(node.referenceImageIndex === undefined
          ? {}
          : { reference: node.referenceImageIndex }),
      })
      if (node.inputs?.length) inputsByTarget.set(node.id, node.inputs)
    })
  }

  const ordered = boardOrder(
    nodes,
    hints,
    canvas.editDesk?.assets.map((asset) => asset.nodeId) ?? [],
    gaps,
  )
  const onBoard = new Set(ordered.map((node) => node.id))
  const edges: NodeWorkflowEdgeV4[] = []
  for (const [target, inputs] of inputsByTarget)
    for (const input of inputs ?? []) {
      if (!onBoard.has(input.from)) {
        gaps.push(
          `edge ${input.edgeId}: its source card ${input.from} is not on the board`,
        )
        continue
      }
      const edge = NodeWorkflowEdgeV4Schema.safeParse({
        id: input.edgeId,
        source: input.from,
        sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
        target,
        slot: input.slot,
      })
      if (edge.success) edges.push(edge.data)
      else
        gaps.push(`edge ${input.edgeId}: slot ${input.slot} is not a v4 slot`)
    }

  const board = ReplayBoardSchema.parse({
    projectId: options.projectId,
    assetHost: options.assetHost,
    state: NodeWorkflowStateV4Schema.parse({
      version: 4,
      nodes: ordered,
      edges,
    }),
  })
  return {
    board,
    namesById: new Map(ordered.map((node) => [node.id, node.data.name])),
  }
}

/** 正文末尾那段 `[mentioned: …]`（`describeMentionNote`）是 `@` 那一套加的：回放会重加。 */
function stripMentionNote(content: string): string {
  const at = content.lastIndexOf('\n[mentioned: ')
  return at >= 0 && content.endsWith(']') ? content.slice(0, at) : content
}

/** 创作者这一句 → 回放题的 `say`：`@` 到的画布卡写成 `@{名字}`。 */
function sayOf(
  record: AssistantTurnRecord,
  content: string,
  namesById: ReadonlyMap<string, string>,
  gaps: string[],
): string {
  let say = stripMentionNote(content)
  for (const mention of record.input.mentions ?? []) {
    const name =
      mention.scope === ASSISTANT_MENTION_SCOPE_IDS.canvas && mention.nodeId
        ? namesById.get(mention.nodeId)
        : undefined
    if (!name) {
      gaps.push(
        `@${mention.label} (${mention.scope}) is not a card on the rebuilt board`,
      )
      continue
    }
    const forms = [`「${mention.label}」`, `@${mention.label}`]
    const form = forms.find((candidate) => say.includes(candidate))
    if (!form) {
      gaps.push(`@${mention.label}: not found in the message text`)
      continue
    }
    say = say.split(form).join(`@{${name}}`)
  }
  return say
}

function callInput(
  input: string,
  tool: string,
  gaps: string[],
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
  } catch {
    // 落到下面
  }
  gaps.push(`a ${tool} call has input that is not a JSON object (kept as {})`)
  return {}
}

/**
 * 一行过程记录 → 一道回放题的草稿（起始画布 + 题目）。记录过不了 schema、不是画布那一轮、
 * 没有开轮的快照、或用的不是助手那五家 → 抛错（这一行做不成回放题）。
 */
export function replayFromTurnRecord(
  raw: unknown,
  options: ReplayFromTurnRecordOptions,
): ReplayFromTurnRecord {
  const record = AssistantTurnRecordSchema.parse(raw)
  const gaps: string[] = []
  const provider = ReplayProviderSchema.safeParse(record.adapterType)
  if (!provider.success)
    throw new Error(
      `turn record: ${record.adapterType} is not one of the assistant providers`,
    )
  const assetHost = options.assetHost ?? REPLAY_TURN_RECORD_ASSET_HOST
  const { board, namesById } = rebuildBoard(
    record,
    {
      assetHost,
      projectId: options.projectId ?? record.projectId ?? 'turn-record',
    },
    gaps,
  )

  const messages = record.input.messages
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  if (lastUser < 0) throw new Error('turn record: no message from the creator')
  const say = sayOf(record, messages[lastUser]!.content, namesById, gaps)
  const history = messages
    .slice(0, lastUser)
    .filter((message) => message.content.trim())
    .map(({ role, content }) => ({ role, content }))

  const selected = (record.snapshot?.canvas?.selectedNodeIds ?? []).flatMap(
    (id) => {
      const name = namesById.get(id)
      if (!name) gaps.push(`selected card ${id} is not on the rebuilt board`)
      return name ? [name] : []
    },
  )
  const clipSeconds = Object.fromEntries(
    (record.input.videoClips ?? []).flatMap((clip) =>
      clip.frameCount > 0 && clip.durationSeconds
        ? [[clip.label, clip.durationSeconds] as const]
        : [],
    ),
  )

  const replies: ReplayReply[] = record.transcript.flatMap((entry) =>
    entry.type === ENTRY.assistant
      ? [
          {
            text: entry.text,
            calls: entry.calls.map((call) => ({
              tool: call.tool,
              input: callInput(call.input, call.tool, gaps),
            })),
          },
        ]
      : [],
  )
  for (
    let index = 0;
    index < (TRAILING_EMPTY_REPLIES[record.outcome] ?? 0);
    index += 1
  )
    replies.push({ text: '', calls: [] })

  const end = OUTCOME_END[record.outcome]
  if (end === null)
    gaps.push(
      `the turn never finished (${record.outcome}): expect.end is a guess`,
    )
  if (record.outcome === 'content_filter')
    gaps.push(
      'the last reply was stopped by the provider content filter: script that reply by hand',
    )
  if (record.input.searchWithGrok)
    gaps.push('web search answers are not recorded: fill `search` by hand')
  // 上一轮找到的图 / 视频（`#n`）：回放题照 `input.priorFinds` 带回去。板子上冻着、`input` 里却没有
  // （超限截掉了，或这一行写在 `input` 记它之前）→ 记一条缺口，⛔ 不从板子上悄悄补。
  const priorFinds = record.input.priorFinds ?? []
  const frozen = record.transcript.flatMap((entry) =>
    entry.type === ENTRY.board ? (entry.finds ?? []) : [],
  )
  if (frozen.length && !priorFinds.length)
    gaps.push(
      `the board carried ${frozen.length} web find(s) from the previous turn (#${frozen[0]!.n}–#${frozen.at(-1)!.n}) but the record input has none (${
        record.truncated.includes(ASSISTANT_TURN_RECORD_CUT_IDS.priorFinds)
          ? 'cut to fit'
          : 'not stored'
      }): copy them from the board entry into turn.priorFinds, or the model will not see them and a number like #2 will not resolve`,
    )
  if (!record.input.responseLanguage)
    gaps.push('no response language on the request: defaulted to chinese')
  for (const cut of record.truncated)
    if (
      cut === ASSISTANT_TURN_RECORD_CUT_IDS.history ||
      cut === ASSISTANT_TURN_RECORD_CUT_IDS.assistantText
    )
      gaps.push(
        `the record was cut to fit (${cut}): check say / history / replies`,
      )
  gaps.push(
    'expect only has end / requests: run it once with REPLAY_DEBUG=1 and fill opKinds, board, cards and answer',
  )

  const createdAt =
    record.createdAt instanceof Date
      ? record.createdAt.toISOString()
      : record.createdAt
  const testCase = ReplayCaseSchema.parse({
    id: options.id,
    title: options.title ?? say.slice(0, 60),
    source: [
      `AssistantTurnRecord ${record.turnId}`,
      ...(createdAt ? [createdAt] : []),
      `prompt ${record.promptVersion}`,
      `${record.adapterType}/${record.modelId}`,
    ].join(' · '),
    board: options.board,
    routes: [
      {
        routeModel: record.routeModel ?? 'auto',
        keys: [provider.data],
        expect: { adapterType: provider.data, modelId: record.modelId },
      },
    ],
    turn: {
      say,
      history,
      ...(record.input.responseLanguage
        ? { responseLanguage: record.input.responseLanguage }
        : {}),
      selected,
      clipSeconds,
      ...(record.input.searchWithGrok ? { searchWithGrok: true } : {}),
      ...(priorFinds.length ? { priorFinds } : {}),
    },
    replies,
    expect: {
      end: end ?? 'done',
      ...(record.outcome === 'error' && record.errorCode
        ? { errorCode: record.errorCode }
        : {}),
      requests: record.hops,
    },
  })
  return { board, testCase, gaps }
}
