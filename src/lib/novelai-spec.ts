import {
  getNovelAiPreciseReferenceContract,
  type NovelAiPreciseReferenceKind,
} from '../constants/novelai'
import type { NovelAiPreciseReference, NovelAiSpec } from '../types/novelai'

/**
 * 将角色卡造型槽的语义 role 映射到 NovelAI 精确参考的 kind。
 *
 * - `identity` / `faceCloseup` → `character`
 * - `costume` → `outfit`（仅在当前模型支持 `outfit` 时映射，不在 V4.5 上误标成 `character`）
 * - `style` → `style`
 * - 主图（`isPrimary`）若挂了其余角色（如 `custom`），兜底映射为 `character`。
 */
export function mapCharacterSlotRoleToNovelAiKind(
  role: string,
  supportedKinds: readonly NovelAiPreciseReferenceKind[],
  isPrimary = false,
): NovelAiPreciseReferenceKind | null {
  if (role === 'identity' || role === 'faceCloseup') {
    return supportedKinds.includes('character') ? 'character' : null
  }
  if (role === 'costume') {
    return supportedKinds.includes('outfit') ? 'outfit' : null
  }
  if (role === 'style') {
    return supportedKinds.includes('style') ? 'style' : null
  }
  if (isPrimary && supportedKinds.includes('character')) {
    return 'character'
  }
  return null
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 将领域层 `NovelAiPreciseReference` 翻译为 NovelAI `director_reference_descriptions[].caption.base_caption`
 * 真实线格式串（2026-11-26 核自 `novelai.net/image` 模块 `39706` / `67314` / `09aajvaad_e63`）：
 *
 * - `outfit` → `"costume"`
 * - `style` → `"style"`
 * - `character`: 默认 `"character"`；V5 开 `preferSameOutfit: true` → `"character_mainoutfit"`
 * - `character&style`: 默认（含 `preferSameOutfit: true`）`"character&style"`；
 *   V5 显式关 `preferSameOutfit: false` → `"character&style_anyoutfit"`
 */
export function resolveNovelAiPreciseReferenceBaseCaption(
  ref: Pick<NovelAiPreciseReference, 'kind' | 'preferSameOutfit'>,
  supportsPreferSameOutfit: boolean,
): string {
  if (ref.kind === 'outfit') return 'costume'
  if (ref.kind === 'style') return 'style'
  if (ref.kind === 'character') {
    return supportsPreferSameOutfit && ref.preferSameOutfit === true
      ? 'character_mainoutfit'
      : 'character'
  }
  return supportsPreferSameOutfit && ref.preferSameOutfit === false
    ? 'character&style_anyoutfit'
    : 'character&style'
}

/**
 * 按目标模型的精确参考契约裁剪 / 钳制一组精确参考（切模型、跨模型对比、保存前共读）。
 *
 * - 不支持精确参考（如 V5 Full Medium / 非 NAI）→ 返回空数组。
 * - 剔除目标模型不支持的 `kind`（例如从 V5 切回 V4.5 时去掉 `outfit`）。
 * - 钳制 `strength` 到 `[min, max]`；按目标模型补齐或剥离 `fidelity` 与 `preferSameOutfit`。
 * - 超出 `maxCount` 时保留前面几张。
 */
export function normalizeNovelAiPreciseReferencesForModel(
  refs: readonly NovelAiPreciseReference[] | undefined,
  modelId: string | undefined,
): NovelAiPreciseReference[] {
  if (!refs?.length) return []
  const contract = getNovelAiPreciseReferenceContract(modelId)
  if (!contract) return []

  const normalized: NovelAiPreciseReference[] = []
  for (const ref of refs) {
    if (normalized.length >= contract.maxCount) break
    if (!contract.kinds.includes(ref.kind)) continue
    const strength = clampNumber(
      Number.isFinite(ref.strength) ? ref.strength : contract.strength.default,
      contract.strength.min,
      contract.strength.max,
    )
    const entry: NovelAiPreciseReference = {
      ...(ref.id ? { id: ref.id } : {}),
      url: ref.url,
      kind: ref.kind,
      strength,
      ...(contract.fidelity
        ? {
            fidelity: clampNumber(
              ref.fidelity !== undefined && Number.isFinite(ref.fidelity)
                ? ref.fidelity
                : contract.fidelity.default,
              contract.fidelity.min,
              contract.fidelity.max,
            ),
          }
        : {}),
      ...(contract.supportsPreferSameOutfit &&
      ref.preferSameOutfit !== undefined &&
      (ref.kind === 'character' || ref.kind === 'character&style')
        ? { preferSameOutfit: ref.preferSameOutfit }
        : {}),
      ...(ref.source ? { source: ref.source } : {}),
    }
    normalized.push(entry)
  }
  return normalized
}

/**
 * 归一化整份 `NovelAiSpec`；裁空后返回 `undefined`（调用方可干净删除 `advancedParams.novelAi`）。
 */
export function normalizeNovelAiSpecForModel(
  spec: NovelAiSpec | undefined,
  modelId: string | undefined,
): NovelAiSpec | undefined {
  if (!spec) return undefined
  const preciseReferences = normalizeNovelAiPreciseReferencesForModel(
    spec.preciseReferences,
    modelId,
  )
  if (preciseReferences.length === 0) return undefined
  return { preciseReferences }
}

function sameSource(
  a: NovelAiPreciseReference['source'],
  b: NovelAiPreciseReference['source'],
): boolean {
  if (a === b) return true
  if (!a || !b || a.type !== b.type) return false
  if (a.type === 'user' && b.type === 'user') return true
  if (a.type === 'canvas' && b.type === 'canvas') return a.nodeId === b.nodeId
  if (a.type === 'card' && b.type === 'card') {
    return (
      a.cardId === b.cardId && a.lookId === b.lookId && a.slotId === b.slotId
    )
  }
  return false
}

/** 比较两份 `NovelAiSpec` 是否值等价，供切模型裁剪避免多余状态写回。 */
export function areNovelAiSpecsEqual(
  a: NovelAiSpec | undefined,
  b: NovelAiSpec | undefined,
): boolean {
  if (a === b) return true
  const refsA = a?.preciseReferences ?? []
  const refsB = b?.preciseReferences ?? []
  if (refsA.length !== refsB.length) return false
  return refsA.every((itemA, index) => {
    const itemB = refsB[index]!
    return (
      itemA.id === itemB.id &&
      itemA.url === itemB.url &&
      itemA.kind === itemB.kind &&
      itemA.strength === itemB.strength &&
      itemA.fidelity === itemB.fidelity &&
      itemA.preferSameOutfit === itemB.preferSameOutfit &&
      sameSource(itemA.source, itemB.source)
    )
  })
}

export type NovelAiPreciseReferenceValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string }

/**
 * 服务端与 Execution Worker 共用的精确参考校验（逐条对照 `NOVELAI_GENERATION_CONTRACT`）。
 */
export function validateNovelAiPreciseReferencesForModel(
  refs: readonly NovelAiPreciseReference[] | undefined,
  modelId: string | undefined,
  options: { readonly hasInpaintMask: boolean },
): NovelAiPreciseReferenceValidationResult {
  if (!refs || refs.length === 0) return { valid: true }
  const contract = getNovelAiPreciseReferenceContract(modelId)
  if (!contract) {
    return {
      valid: false,
      reason:
        'Precise Reference is not supported for the selected NovelAI model.',
    }
  }
  if (refs.length > contract.maxCount) {
    return {
      valid: false,
      reason: `Precise Reference accepts at most ${contract.maxCount} images for the selected model.`,
    }
  }
  if (options.hasInpaintMask && !contract.canCombineWithInpaint) {
    return {
      valid: false,
      reason:
        'Precise Reference cannot be combined with inpainting on the selected NovelAI model.',
    }
  }
  for (const ref of refs) {
    if (!contract.kinds.includes(ref.kind)) {
      return {
        valid: false,
        reason: `Unsupported Precise Reference kind "${ref.kind}" for the selected model.`,
      }
    }
    if (
      !Number.isFinite(ref.strength) ||
      ref.strength < contract.strength.min ||
      ref.strength > contract.strength.max
    ) {
      return {
        valid: false,
        reason: `Precise Reference strength must be between ${contract.strength.min} and ${contract.strength.max} for the selected model.`,
      }
    }
    if (ref.fidelity !== undefined) {
      if (!contract.fidelity) {
        return {
          valid: false,
          reason:
            'Precise Reference fidelity is not supported for the selected model.',
        }
      }
      if (
        !Number.isFinite(ref.fidelity) ||
        ref.fidelity < contract.fidelity.min ||
        ref.fidelity > contract.fidelity.max
      ) {
        return {
          valid: false,
          reason: `Precise Reference fidelity must be between ${contract.fidelity.min} and ${contract.fidelity.max}.`,
        }
      }
    }
    if (ref.preferSameOutfit !== undefined) {
      if (!contract.supportsPreferSameOutfit) {
        return {
          valid: false,
          reason:
            'Prefer same outfit is not supported for the selected NovelAI model.',
        }
      }
      if (ref.kind !== 'character' && ref.kind !== 'character&style') {
        return {
          valid: false,
          reason:
            'Prefer same outfit only applies to character or character&style Precise References.',
        }
      }
    }
  }
  return { valid: true }
}
