import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import { ASSISTANT_V3_HANDLE } from '@/constants/assistant-v3'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasSnapshot,
} from '@/types/assistant-operator'
import {
  referenceRoleLegendCount,
  withoutReferenceRoleLegend,
} from '@/lib/studio-reference-mentions'

/**
 * v3 给模型看的画布：短句柄 + 一行一张卡的文本，⛔ 不是 JSON。
 *
 * 三处与旧内核不同，各对一道回放题：
 * · 卡用句柄（`img-6db120`）不用 36 位 UUID —— T17 / T20 / T25 抄错一位就整步作废；
 * · 连线不给 edgeId，按「从哪张到哪张、哪个槽」指认 —— I56；
 * · 镜号只印剧本里的（S04a），镜头带只印位置号（LANE 5）—— T23 把两套都叫 S，
 *   报出了不存在的 S13 / S14。
 */

const UUID_ID =
  /^(image|video|text|audio)([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})$/i

export interface AssistantV3Handles {
  /** 节点 id → 句柄；不认识的 id 原样返回。 */
  handleOf(id: string): string
  /** 句柄（或模型照抄的真 id）→ 节点 id；对不上是 `null`。 */
  idOf(handle: string): string | null
  /** 对不上时给的最近三个句柄。 */
  nearest(handle: string): string[]
}

function handleStem(id: string): { prefix: string; body: string } {
  const match = UUID_ID.exec(id)
  if (match) {
    const kind =
      match[1].toLowerCase() as keyof typeof ASSISTANT_V3_HANDLE.kindPrefixes
    return {
      prefix: ASSISTANT_V3_HANDLE.kindPrefixes[kind],
      body: match[2].replace(/-/g, '').toLowerCase(),
    }
  }
  return {
    prefix: ASSISTANT_V3_HANDLE.fallbackPrefix,
    body: id.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }
}

export function buildAssistantV3Handles(
  ids: readonly string[],
): AssistantV3Handles {
  const stems = new Map(ids.map((id) => [id, handleStem(id)]))
  const byId = new Map<string, string>()
  const pending = [...stems.keys()]
  for (
    let length = ASSISTANT_V3_HANDLE.minHexChars;
    pending.length > 0;
    length += 1
  ) {
    const candidates = new Map<string, string[]>()
    for (const id of pending) {
      const stem = stems.get(id)!
      const handle = `${stem.prefix}-${stem.body.slice(0, length) || id}`
      candidates.set(handle, [...(candidates.get(handle) ?? []), id])
    }
    pending.length = 0
    for (const [handle, owners] of candidates) {
      const exhausted = owners.every(
        (id) => stems.get(id)!.body.length <= length,
      )
      if (owners.length === 1 || exhausted) {
        owners.forEach((id, index) =>
          byId.set(id, index === 0 ? handle : `${handle}~${index + 1}`),
        )
      } else {
        pending.push(...owners)
      }
    }
  }
  const byHandle = new Map(
    [...byId].map(([id, handle]) => [handle.toLowerCase(), id]),
  )
  const idsLower = new Map(ids.map((id) => [id.toLowerCase(), id]))
  return {
    handleOf: (id) => byId.get(id) ?? id,
    idOf: (handle) => {
      const key = handle.trim().toLowerCase()
      return byHandle.get(key) ?? idsLower.get(key) ?? null
    },
    nearest: (handle) => {
      const key = handle.trim().toLowerCase()
      const score = (candidate: string) => {
        let shared = 0
        while (
          shared < key.length &&
          shared < candidate.length &&
          key[shared] === candidate[shared]
        )
          shared += 1
        return shared
      }
      return [...byHandle.keys()]
        .map((candidate) => ({ candidate, shared: score(candidate) }))
        .filter((entry) => entry.shared >= 4)
        .sort((left, right) => right.shared - left.shared)
        .slice(0, 3)
        .map((entry) => byId.get(byHandle.get(entry.candidate)!)!)
    },
  }
}

export function assistantV3CanvasNodes(
  canvas: AssistantOperatorCanvasSnapshot,
): AssistantOperatorCanvasNode[] {
  return canvas.shots.flatMap((shot) => (shot.expanded ? shot.nodes : []))
}

/** `s4a` → `S04a`：与剧本卡上印的那一格逐字相同。 */
export function formatScriptShotKey(shotKey: string): string {
  const match = /^s(\d+)([a-z]?)$/i.exec(shotKey)
  if (!match) return shotKey
  return `S${match[1].padStart(2, '0')}${match[2].toLowerCase()}`
}

function clipName(name: string): string {
  const limit = 48
  return name.length > limit ? `${name.slice(0, limit)}…` : name
}

interface BoardTables {
  readonly models: Map<string, string>
  readonly options: Map<string, string>
}

function buildTables(
  nodes: readonly AssistantOperatorCanvasNode[],
): BoardTables {
  const models = new Map<string, string>()
  const options = new Map<string, string>()
  for (const node of nodes) {
    if (node.availableModels?.length) {
      const key = node.availableModels.join(', ')
      if (!models.has(key)) models.set(key, `M${models.size + 1}`)
    }
    if (node.parameters) {
      const key = describeOptions(node.parameters.options)
      if (key && !options.has(key)) options.set(key, `O${options.size + 1}`)
    }
  }
  return { models, options }
}

function describeOptions(
  options: NonNullable<AssistantOperatorCanvasNode['parameters']>['options'],
): string {
  return Object.entries(options)
    .flatMap(([key, values]) =>
      Array.isArray(values) && values.length
        ? [`${key} ${values.map(String).join('|')}`]
        : values === true
          ? [`${key} any`]
          : [],
    )
    .join('; ')
}

function describeValues(
  values: NonNullable<AssistantOperatorCanvasNode['parameters']>['values'],
): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
}

function cardText(node: AssistantOperatorCanvasNode): {
  text: string | null
  legend: number | null
} {
  if (node.text === undefined || node.text === '')
    return { text: null, legend: null }
  const legend = referenceRoleLegendCount(node.text)
  return {
    text: legend === null ? node.text : withoutReferenceRoleLegend(node.text),
    legend,
  }
}

export interface AssistantV3CardRenderOptions {
  /** 正文最多印几字；`null` = 全文。 */
  readonly textLimit: number | null
  readonly selected?: boolean
}

/** 一张卡的完整写法 —— 板子上展开的卡、`read` 读回来的卡与改完回执里的卡同一份。 */
export function renderAssistantV3Card(
  node: AssistantOperatorCanvasNode,
  handles: AssistantV3Handles,
  nameOf: (id: string) => string | undefined,
  options: AssistantV3CardRenderOptions,
  tables?: BoardTables,
): string {
  const head = [
    `${handles.handleOf(node.id)} · ${node.kind}${node.subtype ? `/${node.subtype}` : ''} 「${node.name}」`,
    options.selected ? 'SELECTED' : null,
    node.fromScript
      ? `script ${formatScriptShotKey(node.fromScript.shotKey)} (${node.fromScript.state})`
      : null,
    node.kind === NODE_MEDIA_KIND_IDS.text
      ? null
      : `model ${node.model ?? 'none'}`,
    node.parameters ? describeValues(node.parameters.values) || null : null,
    node.parameters && tables
      ? (tables.options.get(describeOptions(node.parameters.options)) ?? null)
      : node.parameters
        ? `options ${describeOptions(node.parameters.options)}`
        : null,
    node.availableModels?.length && tables
      ? `models ${tables.models.get(node.availableModels.join(', '))}`
      : node.availableModels?.length
        ? `models ${node.availableModels.join(', ')}`
        : null,
    node.hasOutput ? 'has output' : null,
    node.referenceImageIndex === undefined
      ? null
      : `chat image @Image${node.referenceImageIndex + 1}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const lines = [head]
  if (node.inputs?.length) {
    lines.push(
      `  inputs: ${node.inputs
        .map((input) => {
          const name = nameOf(input.from)
          return `${input.slot} ← ${handles.handleOf(input.from)}${name ? `「${clipName(name)}」` : ''}`
        })
        .join(' · ')}`,
    )
  }
  if (node.scriptProjection) {
    const projection = node.scriptProjection
    lines.push(
      `  script: ${projection.shots} shots — projected ${projection.projected}, changed ${projection.changed}, dropped ${projection.dropped}${
        projection.titles?.length
          ? `; titles: ${projection.titles.join(' | ')}`
          : ''
      }`,
    )
  }
  if (node.lastFailure) {
    lines.push(
      `  last failure: ${[node.lastFailure.code, node.lastFailure.message]
        .filter(Boolean)
        .join(' — ')}`,
    )
  }
  const { text, legend } = cardText(node)
  if (text !== null) {
    const label = node.kind === NODE_MEDIA_KIND_IDS.text ? 'body' : 'prompt'
    const clipped =
      options.textLimit !== null && text.length > options.textLimit
    lines.push(
      `  ${label} (${text.length} chars${clipped ? `, first ${options.textLimit} shown — read it before replacing` : ''}${
        node.textTruncated
          ? ', cut by the app — append only, never replace'
          : ''
      }${legend !== null ? `; the app keeps a reference legend for ${legend} images after it` : ''}): ${
        clipped ? `${text.slice(0, options.textLimit!)}…` : text
      }`,
    )
  }
  return lines.join('\n')
}

function renderBriefCard(
  node: AssistantOperatorCanvasNode,
  handles: AssistantV3Handles,
): string {
  const { text } = cardText(node)
  return [
    `${handles.handleOf(node.id)} · ${node.kind}${node.subtype ? `/${node.subtype}` : ''} 「${clipName(node.name)}」`,
    node.fromScript
      ? `script ${formatScriptShotKey(node.fromScript.shotKey)} (${node.fromScript.state})`
      : null,
    node.kind === NODE_MEDIA_KIND_IDS.text
      ? null
      : `model ${node.model ?? 'none'}`,
    node.hasOutput ? 'has output' : null,
    text ? `${text.length} chars` : null,
    node.lastFailure?.code ? `last failure ${node.lastFailure.code}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/** 大画布上展开哪几张：选中的、这句话点了名的、剧本卡、当前镜头带，再加一跳连线两头。 */
function focusIds(
  canvas: AssistantOperatorCanvasSnapshot,
  nodes: readonly AssistantOperatorCanvasNode[],
  latestUserText: string,
  extraIds: readonly string[],
): Set<string> {
  const currentLane = canvas.shots.find(
    (shot) => shot.expanded && shot.shotNo === canvas.currentShotNo,
  )
  const seeds = new Set<string>([
    ...canvas.selectedNodeIds,
    ...extraIds,
    ...nodes
      .filter(
        (node) =>
          (node.name.length >= 2 && latestUserText.includes(node.name)) ||
          (node.fromScript &&
            latestUserText
              .toLowerCase()
              .includes(
                formatScriptShotKey(node.fromScript.shotKey).toLowerCase(),
              )) ||
          node.subtype === NODE_V4_TEXT_SUBTYPE_IDS.script,
      )
      .map((node) => node.id),
    ...(canvas.currentShotNo !== null && currentLane?.expanded
      ? currentLane.nodes.map((node) => node.id)
      : []),
  ])
  const focus = new Set(seeds)
  for (const node of nodes) {
    for (const input of node.inputs ?? []) {
      if (seeds.has(node.id)) focus.add(input.from)
      if (seeds.has(input.from)) focus.add(node.id)
    }
  }
  return focus
}

export interface AssistantV3BoardInput {
  readonly canvas: AssistantOperatorCanvasSnapshot
  readonly handles: AssistantV3Handles
  readonly latestUserText: string
  /** 这句话 @ 的那几张对应的卡（按图找到的），一并展开。 */
  readonly mentionedIds?: readonly string[]
}

/**
 * 开轮那一刻的整块板子（冻结进本轮记录，接力时逐字还原）。
 *
 * ⚠ 卡多于 `boardCatalogMinNodes` 时只展开相关的卡，其余一行；正文合计超过
 *   `boardFullTextChars` 时只有选中 / 点名的卡给全文，其余给开头一段。
 */
export function renderAssistantV3Board(input: AssistantV3BoardInput): string {
  const { canvas, handles, latestUserText } = input
  const nodes = assistantV3CanvasNodes(canvas)
  const names = new Map(nodes.map((node) => [node.id, node.name]))
  const nameOf = (id: string) => names.get(id)
  const tables = buildTables(nodes)
  const selected = new Set(canvas.selectedNodeIds)
  const named = new Set([
    ...selected,
    ...(input.mentionedIds ?? []),
    ...nodes
      .filter(
        (node) => node.name.length >= 2 && latestUserText.includes(node.name),
      )
      .map((node) => node.id),
  ])
  const totalText = nodes.reduce(
    (sum, node) => sum + (node.text?.length ?? 0),
    0,
  )
  const showAllText =
    totalText <= ASSISTANT_OPERATOR_CANVAS_LIMITS.boardFullTextChars
  const focus =
    nodes.length > ASSISTANT_OPERATOR_CANVAS_LIMITS.boardCatalogMinNodes
      ? focusIds(canvas, nodes, latestUserText, input.mentionedIds ?? [])
      : null

  const lines: string[] = [
    `BOARD — ${nodes.length} cards${focus ? `; ${focus.size} shown in full, the rest one line each (read a card for the rest)` : ''}${
      selected.size
        ? `; selected: ${[...selected].map((id) => handles.handleOf(id)).join(', ')}`
        : ''
    }`,
  ]
  if (tables.models.size) {
    lines.push('MODEL LISTS (which models a card can switch to):')
    for (const [list, name] of tables.models) lines.push(`  ${name}: ${list}`)
  }
  if (tables.options.size) {
    lines.push('OPTION SETS (allowed values per parameter):')
    for (const [set, name] of tables.options) lines.push(`  ${name}: ${set}`)
  }
  for (const lane of canvas.shots) {
    const header = lane.shotNo === null ? 'LOOSE CARDS' : `LANE ${lane.shotNo}`
    if (!lane.expanded) {
      lines.push(
        `${header} — ${lane.nodeCount} cards, collapsed (not visible to you)`,
      )
      continue
    }
    lines.push(
      `${header}${lane.omittedCount ? ` — ${lane.omittedCount} more cards not listed` : ''}`,
    )
    for (const node of lane.nodes) {
      if (focus && !focus.has(node.id)) {
        lines.push(`  ${renderBriefCard(node, handles)}`)
        continue
      }
      const card = renderAssistantV3Card(
        node,
        handles,
        nameOf,
        {
          textLimit:
            showAllText || named.has(node.id)
              ? null
              : ASSISTANT_OPERATOR_CANVAS_LIMITS.boardTextPreviewChars,
          selected: selected.has(node.id),
        },
        tables,
      )
      lines.push(
        card
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      )
    }
  }
  if (canvas.characters?.list.length) {
    lines.push(
      `CHARACTERS (${canvas.characters.total}): ${canvas.characters.list
        .map(
          (character) =>
            `${character.name}${character.work ? ` (${character.work})` : ''}${character.onCanvas ? ' · on the board' : ''} · ${character.imageCount} images`,
        )
        .join('; ')}`,
    )
  }
  return lines.join('\n')
}
