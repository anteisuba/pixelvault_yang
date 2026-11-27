/**
 * Canvas v4 × NovelAI 纯编译与路由模块（Slice 3）。
 *
 * 职责：
 * 1. 把画布图片节点 `reference` 槽连入的上游图（含角色卡 1 跳特写）按节点上的
 *    `params.novelAiRefConfig` 分流到两条正交轨：
 *    - **底图轨（Base Canvas）**：0–1 张 → `referenceImages`（img2img / inpaint）
 *    - **精确参考轨（Precise Reference）**：0–16 张 → `advancedParams.novelAi.preciseReferences[]`
 *    ⛔ 存量老项目未写 `novelAiRefConfig` 时一律默认 `base`（不静默变精确参考扣 Anlas）。
 * 2. 新建连线落到支持精确参考的 NovelAI 节点时给出默认分轨建议：
 *    - `image.character` 节点 → 默认入 `precise (character&style)`；
 *    - 已有底图时再连第 2+ 张 → 默认入 `precise (style)`，避免被 1 张底图上限静默吞掉；
 *    - 首张非角色图 → 默认 `base`（img2img）。
 * 3. 收敛节点上的 `novelAiLayout`（多角色构图草稿）与 `novelAiSceneTexts`（画面文字草稿）
 *    为符合 `NOVELAI_GENERATION_CONTRACT[modelId]` 的合法发送载荷。
 */

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  type NodeV4ImageSubtype,
} from '@/constants/node-types'
import {
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
  getNovelAiPreciseReferenceAnlasCost,
  getNovelAiPreciseReferenceContract,
  snapToNovelAiGrid,
  type NovelAiPreciseReferenceKind,
} from '@/constants/novelai'
import { defaultLook } from '@/lib/card-bus'
import {
  mapCharacterSlotRoleToNovelAiKind,
  normalizeNovelAiPreciseReferencesForModel,
} from '@/lib/novelai-spec'
import type { NodeCharacterMention } from '@/lib/node-character-mentions'
import { readNodeUrl, readSlotSources } from '@/lib/node-slot-payload'
import type {
  NodeV4,
  NodeV4NovelAiRefOverride,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'
import type {
  NovelAiCharacterLayout,
  NovelAiPreciseReference,
  NovelAiSceneText,
} from '@/types/novelai'

export interface CanvasImageRefSource {
  readonly nodeId: string
  readonly edgeId: string
  readonly name: string
  readonly url: string
  readonly subtype: NodeV4ImageSubtype
  readonly isCloseup?: boolean
}

export interface CanvasNovelAiRefEntry {
  readonly source: CanvasImageRefSource
  /** 实际生效轨道（模型不支持精确参考时一律降级为 `base`）。 */
  readonly mode: 'base' | 'precise'
  /** 用户配置的原始轨道（供 UI 展示不兼容提示）。 */
  readonly configuredMode: 'base' | 'precise'
  readonly kind: NovelAiPreciseReferenceKind
  readonly kindSupported: boolean
  readonly strength: number
  readonly fidelity?: number
  readonly preferSameOutfit?: boolean
  /** 该条是否会实际进入本次请求载荷（第 2 张未切换为精参的 base 不会进入底图轨）。 */
  readonly activeInRequest: boolean
}

export interface CompiledCanvasNovelAiRefs {
  readonly entries: readonly CanvasNovelAiRefEntry[]
  readonly baseUrls: readonly string[]
  readonly preciseReferences: readonly NovelAiPreciseReference[]
  readonly preciseCount: number
  readonly anlasCost: number
}

/** 收集画布图片节点 `reference` 槽上的全部可用上游图片（含 `image.character` 的 1 跳特写）。 */
export function collectCanvasImageReferenceNodes(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): CanvasImageRefSource[] {
  const result: CanvasImageRefSource[] = []
  const seenUrls = new Set<string>()

  const push = (
    sourceNode: NodeV4,
    edgeId: string,
    isCloseup = false,
  ): void => {
    if (sourceNode.data.kind !== NODE_MEDIA_KIND_IDS.image) return
    const url = readNodeUrl(sourceNode.data)
    if (!url || seenUrls.has(url)) return
    seenUrls.add(url)
    result.push({
      nodeId: sourceNode.id,
      edgeId,
      name: sourceNode.data.name,
      url,
      subtype: sourceNode.data.subtype,
      ...(isCloseup ? { isCloseup: true } : {}),
    })
  }

  for (const source of readSlotSources(
    node,
    NODE_SLOT_IDS.reference,
    edges,
    nodes,
  )) {
    push(source.node, source.edgeId)
    if (
      source.node.data.kind === NODE_MEDIA_KIND_IDS.image &&
      source.node.data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character
    ) {
      for (const closeup of readSlotSources(
        source.node,
        NODE_SLOT_IDS.closeup,
        edges,
        nodes,
      )) {
        push(closeup.node, closeup.edgeId, true)
      }
    }
  }

  return result
}

function defaultPreciseKindForSubtype(
  subtype: NodeV4ImageSubtype,
  supportedKinds: readonly NovelAiPreciseReferenceKind[],
): NovelAiPreciseReferenceKind {
  if (subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character) {
    if (supportedKinds.includes('character&style')) return 'character&style'
    if (supportedKinds.includes('character')) return 'character'
  }
  if (supportedKinds.includes('style')) return 'style'
  return supportedKinds[0] ?? 'character&style'
}

/**
 * 将画布图片节点的上游参考图与 `params.novelAiRefConfig` 编译为底图轨 + 精确参考轨。
 *
 * - 未登记在 `refConfig` 的上游图默认走 `base`（100% 保护存量老画布不静默烧 Anlas）。
 * - 精确参考项统一过 `normalizeNovelAiPreciseReferencesForModel`，确保 V4.5 / V5 字段合法。
 */
export function resolveCanvasNovelAiReferences(input: {
  readonly sources: readonly CanvasImageRefSource[]
  readonly refConfig?: Readonly<Record<string, NodeV4NovelAiRefOverride>>
  readonly modelId?: string
}): CompiledCanvasNovelAiRefs {
  const contract = getNovelAiPreciseReferenceContract(input.modelId)
  const rawPrecise: NovelAiPreciseReference[] = []
  const baseUrls: string[] = []
  const entries: CanvasNovelAiRefEntry[] = []

  for (const source of input.sources) {
    const override = input.refConfig?.[source.nodeId]
    const configuredMode: 'base' | 'precise' = override?.mode ?? 'base'
    const mode: 'base' | 'precise' =
      configuredMode === 'precise' && contract ? 'precise' : 'base'

    const defaultKind = contract
      ? defaultPreciseKindForSubtype(source.subtype, contract.kinds)
      : 'character&style'
    const kind = override?.kind ?? defaultKind
    const kindSupported = contract ? contract.kinds.includes(kind) : false
    const strength = override?.strength ?? contract?.strength.default ?? 1
    const fidelity = contract?.fidelity
      ? (override?.fidelity ?? contract.fidelity.default)
      : undefined
    const preferSameOutfit = contract?.supportsPreferSameOutfit
      ? (override?.preferSameOutfit ?? kind === 'character&style')
      : undefined

    if (mode === 'precise' && contract) {
      const normalizedOne = normalizeNovelAiPreciseReferencesForModel(
        [
          {
            id: `canvas-${source.nodeId}`,
            url: source.url,
            kind,
            strength,
            ...(fidelity !== undefined ? { fidelity } : {}),
            ...(preferSameOutfit !== undefined ? { preferSameOutfit } : {}),
            source: { type: 'canvas', nodeId: source.nodeId },
          },
        ],
        input.modelId,
      )[0]
      const canInclude =
        normalizedOne !== undefined && rawPrecise.length < contract.maxCount
      if (canInclude && normalizedOne) {
        rawPrecise.push(normalizedOne)
      }
      entries.push({
        source,
        mode,
        configuredMode,
        kind,
        kindSupported,
        strength: normalizedOne?.strength ?? strength,
        ...(normalizedOne?.fidelity !== undefined
          ? { fidelity: normalizedOne.fidelity }
          : fidelity !== undefined
            ? { fidelity }
            : {}),
        ...(preferSameOutfit !== undefined ? { preferSameOutfit } : {}),
        activeInRequest: canInclude,
      })
    } else {
      const activeInRequest = baseUrls.length === 0
      if (activeInRequest) {
        baseUrls.push(source.url)
      }
      entries.push({
        source,
        mode: 'base',
        configuredMode,
        kind,
        kindSupported,
        strength,
        ...(fidelity !== undefined ? { fidelity } : {}),
        ...(preferSameOutfit !== undefined ? { preferSameOutfit } : {}),
        activeInRequest,
      })
    }
  }

  return {
    entries,
    baseUrls,
    preciseReferences: rawPrecise,
    preciseCount: rawPrecise.length,
    anlasCost: getNovelAiPreciseReferenceAnlasCost(rawPrecise.length),
  }
}

/**
 * 新连一条图进 NovelAI 节点时的默认路由建议：
 * - 角色节点（`image.character`）→ 自动走精确参考（`character&style`）；
 * - 已有底图时新连第 2+ 张 → 自动走精确参考（`style`），避免被底图单槽吞掉；
 * - 首张非角色图 → 返回 `undefined`（落默认 `base` 底图轨）。
 */
export function defaultNovelAiRefOverrideForConnection(input: {
  readonly sourceSubtype: NodeV4ImageSubtype
  readonly existingBaseCount: number
  readonly modelId?: string
}): NodeV4NovelAiRefOverride | undefined {
  const contract = getNovelAiPreciseReferenceContract(input.modelId)
  if (!contract) return undefined

  if (input.sourceSubtype === NODE_V4_IMAGE_SUBTYPE_IDS.character) {
    const kind = defaultPreciseKindForSubtype(
      input.sourceSubtype,
      contract.kinds,
    )
    return {
      mode: 'precise',
      kind,
      strength: contract.strength.default,
      ...(contract.fidelity ? { fidelity: contract.fidelity.default } : {}),
      ...(contract.supportsPreferSameOutfit ? { preferSameOutfit: true } : {}),
    }
  }

  if (input.existingBaseCount >= 1) {
    const kind = contract.kinds.includes('style')
      ? 'style'
      : (contract.kinds[0] ?? 'character&style')
    return {
      mode: 'precise',
      kind,
      strength: contract.strength.default,
      ...(contract.fidelity ? { fidelity: contract.fidelity.default } : {}),
    }
  }

  return undefined
}

/**
 * 收敛画布节点上的 NovelAI 多角色构图草稿为可发送的 `NovelAiCharacterLayout`：
 * - 过滤空提示词角色；
 * - 按当前模型上限裁齐（V4.5 ≤6 / V5 ≤22）；
 * - V4.5 网格档自动吸附坐标到 5×5 格心；
 * - 重映射互动目标下标，剔除指向被过滤角色的悬空互动。
 */
export function sanitizeCanvasNovelAiLayout(
  draft:
    | {
        readonly positioning: 'auto' | 'manual'
        readonly characters: readonly {
          readonly enabled?: boolean
          readonly prompt: string
          readonly negativePrompt: string
          readonly position: { readonly x: number; readonly y: number }
          readonly interactions?: readonly {
            readonly tag: string
            readonly target: number
            readonly mutual?: boolean
          }[]
          readonly dialogue?: string
          readonly label?: string
          readonly origin?: {
            readonly cardId: string
            readonly lookId: string
            readonly tags: string
          }
        }[]
      }
    | undefined,
  modelId?: string,
): NovelAiCharacterLayout | undefined {
  if (!draft || draft.characters.length === 0) return undefined
  const mode = getNovelAiCharacterLayoutMode(modelId)
  const maxChars = getNovelAiMaxCharacters(modelId)
  if (!mode || maxChars <= 0) return undefined

  const keptIndexes: number[] = []
  const indexMap = new Map<number, number>()
  draft.characters.forEach((character, index) => {
    if (keptIndexes.length >= maxChars) return
    if (character.prompt.trim().length === 0) return
    indexMap.set(index, keptIndexes.length)
    keptIndexes.push(index)
  })

  if (keptIndexes.length === 0) return undefined

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const characters: NovelAiCharacterLayout['characters'] = keptIndexes.map(
    (origIndex, newIndex) => {
      const ch = draft.characters[origIndex]!
      const position =
        mode === 'grid'
          ? {
              x: snapToNovelAiGrid(ch.position.x),
              y: snapToNovelAiGrid(ch.position.y),
            }
          : {
              x: clamp01(ch.position.x),
              y: clamp01(ch.position.y),
            }
      const interactions = ch.interactions?.flatMap((interaction) => {
        const mappedTarget = indexMap.get(interaction.target)
        const tag = interaction.tag.trim()
        if (
          mappedTarget === undefined ||
          mappedTarget === newIndex ||
          tag.length === 0
        ) {
          return []
        }
        return [
          {
            tag,
            target: mappedTarget,
            ...(interaction.mutual ? { mutual: true } : {}),
          },
        ]
      })
      const dialogue = ch.dialogue?.trim()
      const label = ch.label?.trim()
      return {
        ...(ch.enabled === undefined ? {} : { enabled: ch.enabled }),
        prompt: ch.prompt.trim(),
        negativePrompt: ch.negativePrompt,
        position,
        ...(interactions && interactions.length > 0 ? { interactions } : {}),
        ...(dialogue ? { dialogue } : {}),
        ...(label ? { label } : {}),
        ...(ch.origin ? { origin: ch.origin } : {}),
      }
    },
  )

  return {
    positioning: draft.positioning,
    characters,
  }
}

/** 收敛画布节点上的 NovelAI 画面文字草稿，过滤空行。 */
export function sanitizeCanvasNovelAiSceneTexts(
  drafts:
    | readonly {
        readonly kind: NovelAiSceneText['kind']
        readonly text: string
      }[]
    | undefined,
): NovelAiSceneText[] | undefined {
  if (!drafts?.length) return undefined
  const clean = drafts
    .map((entry) => ({ kind: entry.kind, text: entry.text.trim() }))
    .filter((entry) => entry.text.length > 0)
  return clean.length > 0 ? clean : undefined
}

/** 估算正文 `@角色卡` 在开启「造型图做精确参考」时将注入的精确参考张数（用于实时 Anlas 与 Opus 成本预估）。 */
export function countCanvasNovelAiCardPreciseRefs(
  mentions: readonly NodeCharacterMention[],
  enabled: boolean,
  modelId?: string,
): number {
  if (!enabled || mentions.length === 0) return 0
  const contract = getNovelAiPreciseReferenceContract(modelId)
  if (!contract) return 0

  let count = 0
  for (const mention of mentions) {
    const look = defaultLook(mention.card)
    const slots = mention.card.looks.flatMap((l) => l.referenceSlots)
    const slotById = new Map(slots.map((s) => [s.id, s]))
    if (mention.picks.length > 0) {
      for (const pick of mention.picks) {
        if ('slotId' in pick) {
          const slot = slotById.get(pick.slotId)
          if (
            slot &&
            mapCharacterSlotRoleToNovelAiKind(
              slot.role,
              contract.kinds,
              slot.isPrimary,
            ) !== null
          ) {
            count += 1
          }
        } else {
          // 历史生成挑图兜底视为 character 参考。
          count += 1
        }
      }
    } else {
      const hasPrimary = look.referenceSlots.some(
        (slot) =>
          mapCharacterSlotRoleToNovelAiKind(
            slot.role,
            contract.kinds,
            slot.isPrimary,
          ) !== null,
      )
      if (hasPrimary) count += 1
    }
  }
  return Math.min(count, contract.maxCount)
}
