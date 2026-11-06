/**
 * 镜头表「素材 · 各管什么」列（H2a，owner 2026-11-07，`docs/design/canvas-shotlist.md` 第 21–24 条）。
 * **纯函数**：不碰 DOM、不发请求、不读时钟。
 *
 * ── 列里是什么 ────────────────────────────────────────────────────────
 * ⭐ 列 = 这一镜**真实挂着的**东西（第 21 条）：首帧 / 参考 / 语音三种槽上的边，加上正文 `@`
 * 到的角色库人物（那条路不建边，`node-character-mentions.ts` 头注）。⛔ 表上不另存一份标注。
 *
 * 角色字（第 22 条）不加边字段，现推：首帧槽 = 首；参考槽按**素材卡类型** —— 角色卡 = 角、
 * 背景卡 = 场、其它图 / 视频 = 参；语音槽 = 声；角色库的人 = 角。
 *
 * ── 改列 = 改边，一律编成 op ──────────────────────────────────────────
 * 「列里加的写回成 `@`」（第 11 条）：加素材 = 在说明末尾写一个 `@名字`，`set_prompt` 的
 * `@` 同步（`node-mentions-to-slots.ts`）自己把边建上 —— ⛔ 这里不再连第二遍。
 * 移除 / 换槽对称：正文里指着它的 `@` 一起删 / 改前缀；手拖的边（没有 `via`）另发
 * `disconnect` / `connect`，因为 `@` 同步「只断自己建的边」。
 */

import {
  NODE_EDGE_VIA_IDS,
  NODE_SLOT_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { characterCoverUrl } from '@/lib/card-bus'
import { mentionedCharacters } from '@/lib/node-character-mentions'
import {
  defaultMentionSlot,
  isCharacterCardNode,
  resolveMentionsToSlots,
} from '@/lib/node-mentions-to-slots'
import { parseMentions } from '@/lib/node-parse-mentions'
import type { CharacterCardRecord, CharacterImagePick } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/** 列里认的三种槽（第 21 条）；尾帧 / 文本 / 音色不算素材。 */
export const SHOT_MATERIAL_SLOTS = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.reference,
  NODE_SLOT_IDS.voice,
] as const
export type ShotMaterialSlot = (typeof SHOT_MATERIAL_SLOTS)[number]

/** 角色字，按这个顺序排（mock：首 / 角 / 场 / 参 / 声）。 */
export const SHOT_MATERIAL_ROLES = [
  'first',
  'character',
  'scene',
  'reference',
  'voice',
] as const
export type ShotMaterialRole = (typeof SHOT_MATERIAL_ROLES)[number]

/** 素材「是什么」（不看它在这镜挂哪个槽）：「+」列表、换槽后的参考字都用它。 */
export type ShotMaterialKindRole = Exclude<ShotMaterialRole, 'first'>

export interface ShotTableMaterial {
  /** 列里的 key：边 id，或 `lib:<角色卡 id>`。 */
  readonly key: string
  readonly origin: 'edge' | 'library'
  /** 边的来源节点 id，或角色库卡 id。 */
  readonly sourceId: string
  readonly edgeId?: string
  readonly slot?: ShotMaterialSlot
  /** 这条边是正文里的 `@` 建的。 */
  readonly viaMention: boolean
  readonly role: ShotMaterialRole
  readonly kindRole: ShotMaterialKindRole
  readonly name: string
  readonly thumbUrl?: string
  readonly mediaKind: NodeWorkflowMediaKind
}

/** 全片素材里的一项（「+」/「换一张…」的候选）。 */
export type ShotFilmMaterial = Pick<
  ShotTableMaterial,
  'origin' | 'sourceId' | 'kindRole' | 'name' | 'thumbUrl' | 'mediaKind'
>

function isMaterialSlot(slot: NodeSlotId): slot is ShotMaterialSlot {
  return (SHOT_MATERIAL_SLOTS as readonly NodeSlotId[]).includes(slot)
}

function kindRoleOf(node: NodeV4): ShotMaterialKindRole {
  if (node.data.kind === NODE_MEDIA_KIND_IDS.audio) return 'voice'
  if (node.data.kind === NODE_MEDIA_KIND_IDS.image) {
    if (node.data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character)
      return 'character'
    if (node.data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.background)
      return 'scene'
  }
  return 'reference'
}

function thumbOf(node: NodeV4): string | undefined {
  if (node.data.kind === NODE_MEDIA_KIND_IDS.image) return node.data.url
  if (node.data.kind === NODE_MEDIA_KIND_IDS.video) {
    return node.data.videoThumbnailUrl ?? undefined
  }
  return undefined
}

/** 这张画布卡绑的是哪位角色库的人（同一个人不在列里出现两次）。 */
function boundCharacterId(node: NodeV4): string | undefined {
  if (node.data.kind !== NODE_MEDIA_KIND_IDS.image) return undefined
  return node.data.characterId ?? node.data.contextCardId ?? undefined
}

/** 一镜的素材列：真边 + `@` 到的角色库人物，按 首 / 角 / 场 / 参 / 声 排。 */
export function readShotMaterials(input: {
  readonly prompt: string
  readonly incoming: readonly NodeWorkflowEdgeV4[]
  readonly byId: ReadonlyMap<string, NodeV4>
  readonly characterCards: readonly CharacterCardRecord[]
  readonly characterPicks?: Readonly<
    Record<string, readonly CharacterImagePick[]>
  >
}): ShotTableMaterial[] {
  const out: ShotTableMaterial[] = []
  const boundIds = new Set<string>()
  for (const edge of input.incoming) {
    if (!isMaterialSlot(edge.slot)) continue
    const source = input.byId.get(edge.source)
    if (!source) continue
    const kindRole = kindRoleOf(source)
    const bound = boundCharacterId(source)
    if (bound) boundIds.add(bound)
    const thumbUrl = thumbOf(source)
    out.push({
      key: edge.id,
      origin: 'edge',
      sourceId: source.id,
      edgeId: edge.id,
      slot: edge.slot,
      viaMention: edge.data?.via === NODE_EDGE_VIA_IDS.mention,
      role:
        edge.slot === NODE_SLOT_IDS.firstFrame
          ? 'first'
          : edge.slot === NODE_SLOT_IDS.voice
            ? 'voice'
            : kindRole,
      kindRole,
      name: source.data.name,
      ...(thumbUrl ? { thumbUrl } : {}),
      mediaKind: source.data.kind,
    })
  }
  for (const { card } of mentionedCharacters(
    input.prompt,
    input.characterCards,
    input.characterPicks,
  )) {
    if (boundIds.has(card.id)) continue
    const thumbUrl = characterCoverUrl(card) ?? undefined
    out.push({
      key: `lib:${card.id}`,
      origin: 'library',
      sourceId: card.id,
      viaMention: true,
      role: 'character',
      kindRole: 'character',
      name: card.name,
      ...(thumbUrl ? { thumbUrl } : {}),
      mediaKind: NODE_MEDIA_KIND_IDS.image,
    })
  }
  const rank = (role: ShotMaterialRole) => SHOT_MATERIAL_ROLES.indexOf(role)
  // 稳定排序：同一个角色字里保持边表 / 出场先后。
  return out
    .map((material, index) => ({ material, index }))
    .sort(
      (a, b) =>
        rank(a.material.role) - rank(b.material.role) || a.index - b.index,
    )
    .map(({ material }) => material)
}

/**
 * 全片素材 = 任何一镜在用的素材（第 23 条；拖到表上存的 `shotlist.materials` 是 H2b）。
 * 同一个来源只出现一次，顺序按镜号 → 列内顺序。
 */
export function listFilmMaterials(
  rows: readonly { readonly materials: readonly ShotTableMaterial[] }[],
): ShotFilmMaterial[] {
  const seen = new Set<string>()
  const out: ShotFilmMaterial[] = []
  for (const row of rows) {
    for (const material of row.materials) {
      const key = `${material.origin}:${material.sourceId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        origin: material.origin,
        sourceId: material.sourceId,
        kindRole: material.kindRole,
        name: material.name,
        ...(material.thumbUrl ? { thumbUrl: material.thumbUrl } : {}),
        mediaKind: material.mediaKind,
      })
    }
  }
  return out
}

/* ── 改列 → op ──────────────────────────────────────────────────────── */

/**
 * 写回正文时「当首帧」的前缀（`@首帧 名字`）。⚠ 必须是 `NODE_MENTION_ROLE_LABELS` 的键，
 * 否则解析器不认、边建不上（单测锁住）。
 */
export const SHOT_MATERIAL_FIRST_FRAME_PREFIX = {
  zh: '首帧',
  ja: '開始フレーム',
  en: 'first',
} as const

export interface ShotMaterialPlanContext {
  readonly state: NodeWorkflowStateV4
  readonly shotId: string
  readonly locale: string
}

interface Range {
  readonly start: number
  readonly end: number
}

function shotPrompt(ctx: ShotMaterialPlanContext): string {
  const shot = ctx.state.nodes.find((node) => node.id === ctx.shotId)
  return shot && 'prompt' in shot.data ? (shot.data.prompt ?? '') : ''
}

function firstFramePrefix(locale: string): string {
  return (
    SHOT_MATERIAL_FIRST_FRAME_PREFIX[
      locale as keyof typeof SHOT_MATERIAL_FIRST_FRAME_PREFIX
    ] ?? SHOT_MATERIAL_FIRST_FRAME_PREFIX.zh
  )
}

function mentionToken(
  name: string,
  slot: NodeSlotId | undefined,
  locale: string,
) {
  return slot === NODE_SLOT_IDS.firstFrame
    ? `@${firstFramePrefix(locale)} ${name}`
    : `@${name}`
}

/** 正文里指着这项素材的 `@`（边：同来源同槽；角色库：同名）。 */
function tokensOf(
  ctx: ShotMaterialPlanContext,
  material: ShotTableMaterial,
  prompt: string,
): Range[] {
  if (material.origin === 'library') {
    return parseMentions(prompt, { names: [material.name] }).flatMap(
      (segment) =>
        segment.type === 'mention' && segment.name === material.name
          ? [{ start: segment.start, end: segment.end }]
          : [],
    )
  }
  return resolveMentionsToSlots(ctx.state, ctx.shotId, prompt).bindings.flatMap(
    (binding) =>
      binding.sourceNodeId === material.sourceId &&
      binding.slot === material.slot
        ? [{ start: binding.start, end: binding.end }]
        : [],
  )
}

/**
 * 按区间改写正文（`replace(i)` 给第 i 个区间的新串）；删成空串的那个 `@` 顺带吃掉一侧的
 * 一个空格，免得留双空格。单遍从后往前改，前面的区间不会被挪位。
 */
function rewrite(
  prompt: string,
  ranges: readonly Range[],
  replace: (index: number) => string,
): string {
  let next = prompt
  const ordered = ranges
    .map((range, index) => ({ range, index }))
    .sort((a, b) => b.range.start - a.range.start)
  for (const { range, index } of ordered) {
    const replacement = replace(index)
    let { start, end } = range
    if (!replacement) {
      if (next[start - 1] === ' ') start -= 1
      else if (next[end] === ' ') end += 1
    }
    next = next.slice(0, start) + replacement + next.slice(end)
  }
  return next.trim()
}

function appendToken(prompt: string, token: string): string {
  const base = prompt.trimEnd()
  return base ? `${base} ${token}` : token
}

/**
 * 这个来源能不能靠写 `@名字` 连上：角色卡（绑了角色库）不走 `@` 连线、重名会连到别人，
 * 这两种直接发 `connect`。
 */
function mentionable(state: NodeWorkflowStateV4, node: NodeV4): boolean {
  if (isCharacterCardNode(node)) return false
  return (
    state.nodes.filter(
      (other) =>
        !isCharacterCardNode(other) && other.data.name === node.data.name,
    ).length === 1
  )
}

function setPromptOp(ctx: ShotMaterialPlanContext, prompt: string) {
  return {
    op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
    target: ctx.shotId,
    prompt,
    mode: 'replace',
  } as const satisfies NodeAssistantOpV4
}

function disconnectOp(edgeId: string) {
  return {
    op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
    edgeId,
  } as const satisfies NodeAssistantOpV4
}

interface Composed {
  readonly prompt: string
  readonly ops: NodeAssistantOpV4[]
}

/** 「拿掉这一项」的半步：正文里的 `@` 删掉，手拖的边另断。 */
function composeRemove(
  ctx: ShotMaterialPlanContext,
  material: ShotTableMaterial,
  prompt: string,
): Composed {
  const ranges = tokensOf(ctx, material, prompt)
  const ops: NodeAssistantOpV4[] = []
  const next = ranges.length > 0 ? rewrite(prompt, ranges, () => '') : prompt
  if (material.edgeId) {
    // `@` 建的边由同步去断；但正文里已经没有指着它的 `@`（或删完正文就空了、
    // `set_prompt` 发不出去）时，同步不会再来，只能自己断。
    const syncWillDrop = material.viaMention && ranges.length > 0 && next !== ''
    if (!syncWillDrop) ops.push(disconnectOp(material.edgeId))
  }
  return { prompt: next, ops }
}

/** 「加一项」的半步：能写 `@` 就写（同步建边），否则直接连。 */
function composeAdd(
  ctx: ShotMaterialPlanContext,
  film: ShotFilmMaterial,
  slot: ShotMaterialSlot | undefined,
  prompt: string,
): Composed {
  if (film.origin === 'library') {
    return { prompt: appendToken(prompt, `@${film.name}`), ops: [] }
  }
  const source = ctx.state.nodes.find((node) => node.id === film.sourceId)
  const target = ctx.state.nodes.find((node) => node.id === ctx.shotId)
  if (!source || !target) return { prompt, ops: [] }
  if (mentionable(ctx.state, source)) {
    return {
      prompt: appendToken(
        prompt,
        mentionToken(source.data.name, slot, ctx.locale),
      ),
      ops: [],
    }
  }
  const resolved = slot ?? defaultMentionSlot(source.data.kind, target)
  if (!resolved) return { prompt, ops: [] }
  return {
    prompt,
    ops: [
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: source.id,
        target: ctx.shotId,
        slot: resolved,
      },
    ],
  }
}

/** 先断后写：`set_prompt` 放最后，它的 `@` 同步看到的是断完之后的边表。 */
function finish(
  ctx: ShotMaterialPlanContext,
  before: string,
  parts: readonly Composed[],
  prompt: string,
): NodeAssistantOpV4[] {
  const ops = parts.flatMap((part) => part.ops)
  if (prompt !== before && prompt !== '') ops.push(setPromptOp(ctx, prompt))
  return ops
}

/** 从这镜移除（弹层最后一行，红）。 */
export function planMaterialRemove(
  ctx: ShotMaterialPlanContext,
  material: ShotTableMaterial,
): NodeAssistantOpV4[] {
  const before = shotPrompt(ctx)
  const removed = composeRemove(ctx, material, before)
  return finish(ctx, before, [removed], removed.prompt)
}

/** 「+」：从全片素材加进这一镜，按素材默认的槽（图 → 参考、语音 → 语音）。 */
export function planMaterialAdd(
  ctx: ShotMaterialPlanContext,
  film: ShotFilmMaterial,
): NodeAssistantOpV4[] {
  const before = shotPrompt(ctx)
  const added = composeAdd(ctx, film, undefined, before)
  return finish(ctx, before, [added], added.prompt)
}

/** 换一张…：同一个槽里换成另一项素材，一步撤销。 */
export function planMaterialReplace(
  ctx: ShotMaterialPlanContext,
  material: ShotTableMaterial,
  film: ShotFilmMaterial,
): NodeAssistantOpV4[] {
  const before = shotPrompt(ctx)
  const removed = composeRemove(ctx, material, before)
  const added = composeAdd(ctx, film, material.slot, removed.prompt)
  return finish(ctx, before, [removed, added], added.prompt)
}

type ShotMaterialSwitchSlot =
  | typeof NODE_SLOT_IDS.firstFrame
  | typeof NODE_SLOT_IDS.reference

/**
 * 「换槽」的半步：正文里有指着它的 `@` 就改前缀（同步换边，手拖的边另断）；没有就断了再连。
 */
function composeSlot(
  ctx: ShotMaterialPlanContext,
  material: ShotTableMaterial,
  slot: ShotMaterialSwitchSlot,
  prompt: string,
): Composed {
  if (!material.edgeId) return { prompt, ops: [] }
  const ranges = tokensOf(ctx, material, prompt)
  if (ranges.length > 0) {
    // 同一项写了好几个 `@`：第一个改前缀，其余删掉（一个 `@` 一条边）。
    const tidy = rewrite(prompt, ranges, (index) =>
      index === 0 ? mentionToken(material.name, slot, ctx.locale) : '',
    )
    return {
      prompt: tidy,
      ops: material.viaMention ? [] : [disconnectOp(material.edgeId)],
    }
  }
  return {
    prompt,
    ops: [
      disconnectOp(material.edgeId),
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: material.sourceId,
        target: ctx.shotId,
        slot,
      },
    ],
  }
}

/**
 * 当首帧 ↔ 当参考（第 22 条：弹层唯一能改的槽）。
 *
 * 首帧被别的素材（`holder`）占着时选「首帧」= **对调**（owner 2026-11-07 第 25 条）：
 * 占着的那张退成参考，这张进首帧，同一批 op、一步撤销。⚠ 首帧只收一张，所以占位者的
 * 首帧边**一律先断**（哪怕它是 `@` 建的、本该由同步断）——否则手拖边的 `connect` 会排在
 * `set_prompt` 的同步之前撞上容量。
 */
export function planMaterialSlot(
  ctx: ShotMaterialPlanContext,
  material: ShotTableMaterial,
  slot: ShotMaterialSwitchSlot,
  holder?: ShotTableMaterial,
): NodeAssistantOpV4[] {
  if (material.origin !== 'edge' || !material.edgeId || material.slot === slot)
    return []
  const before = shotPrompt(ctx)
  const swapWith =
    slot === NODE_SLOT_IDS.firstFrame &&
    holder?.edgeId &&
    holder.key !== material.key
      ? holder
      : undefined
  if (!swapWith?.edgeId) {
    const moved = composeSlot(ctx, material, slot, before)
    return finish(ctx, before, [moved], moved.prompt)
  }
  const freed = composeSlot(ctx, swapWith, NODE_SLOT_IDS.reference, before)
  const moved = composeSlot(ctx, material, slot, freed.prompt)
  const freeFirst = disconnectOp(swapWith.edgeId)
  return finish(
    ctx,
    before,
    [
      { prompt: before, ops: [freeFirst] },
      {
        prompt: freed.prompt,
        ops: freed.ops.filter(
          (op) =>
            !(
              op.op === NODE_ASSISTANT_OP_V4_IDS.disconnect &&
              op.edgeId === swapWith.edgeId
            ),
        ),
      },
      moved,
    ],
    moved.prompt,
  )
}

/** 这镜的首帧现在是谁（首帧只收一张：被占着时选「首帧」= 和它对调）。 */
export function firstFrameHolder(
  materials: readonly ShotTableMaterial[],
): ShotTableMaterial | undefined {
  return materials.find((material) => material.role === 'first')
}
