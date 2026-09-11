import {
  LORA_BASE_FAMILIES,
  normalizeToLoraBaseFamily,
  type LoraBaseFamily,
} from '@/constants/lora-base-models'

type LoraArchitecture = 'sdxl' | 'dit' | 'flux'

/**
 * Weight architecture per fine-grained family. Mount compatibility is decided
 * here, not by family name: illustrious/pony/sdxl and Anima Pencil XL
 * (`anima`) are all SDXL checkpoints; DiT Anima (`anima-dit`,
 * Cosmos-Predict2, UNET-only) and flux are distinct architectures whose LoRA
 * tensors don't map onto an SDXL checkpoint (→ melted/garbage output). `null`
 * = never compatible (sd1.5 is out of runner scope).
 */
const LORA_FAMILY_ARCHITECTURE: Record<
  LoraBaseFamily,
  LoraArchitecture | null
> = {
  sdxl: 'sdxl',
  illustrious: 'sdxl',
  pony: 'sdxl',
  anima: 'sdxl',
  'anima-dit': 'dit',
  flux: 'flux',
  sd15: null,
}

/**
 * SDXL finetune lineages that load onto each other but blur / artifact when
 * crossed — blocked by default (lora.md §7.1.1, owner 2026-09-11). Plain
 * sdxl and Anima Pencil stay neutral within the SDXL architecture.
 */
const EXCLUSIVE_SDXL_LINEAGES: readonly LoraBaseFamily[] = [
  'illustrious',
  'pony',
]

function isLoraBaseFamily(value: string): value is LoraBaseFamily {
  return (LORA_BASE_FAMILIES as readonly string[]).includes(value)
}

function isFamilyPairCompatible(
  loraFamily: LoraBaseFamily,
  baseFamily: LoraBaseFamily,
): boolean {
  const architecture = LORA_FAMILY_ARCHITECTURE[loraFamily]
  if (!architecture || architecture !== LORA_FAMILY_ARCHITECTURE[baseFamily]) {
    return false
  }
  return !(
    loraFamily !== baseFamily &&
    EXCLUSIVE_SDXL_LINEAGES.includes(loraFamily) &&
    EXCLUSIVE_SDXL_LINEAGES.includes(baseFamily)
  )
}

/**
 * Whether a LoRA (given its raw baseModel string — Civitai value /
 * `LoraAsset.baseModelFamily`) can be mounted onto a base of the given
 * `LoraBaseFamily` (`selectedBase.family`).
 *
 * The two sides are read differently on purpose: raw `"Anima"` on a LoRA is
 * the DiT family, while the base family value `'anima'` is Anima Pencil XL
 * (SDXL) — so only the LoRA side goes through `normalizeToLoraBaseFamily`.
 * Unrecognized values on either side never match.
 */
export function isLoraBaseModelMountCompatible(
  loraRawBaseModel: string,
  baseFamily: string,
): boolean {
  const loraFamily = normalizeToLoraBaseFamily(loraRawBaseModel)
  if (!loraFamily || !isLoraBaseFamily(baseFamily)) return false
  return isFamilyPairCompatible(loraFamily, baseFamily)
}

/**
 * §4.1 挂载栈 vs 选中底模的兼容摘要（lora-workbench.md §4.1/§4.2）：脊柱条
 * 圆点 + 出图键上方警示行共用同一份判定，抽成纯函数方便脱离 UI 单测。
 *
 * - `incompatibleCount`：挂载栈里有多少项与 `selectedBaseFamily` 不兼容
 *   （见 isLoraBaseModelMountCompatible）。
 * - `mutuallyExclusive`：挂载之间两两存在冲突（跨权重架构，或 Illustrious +
 *   Pony 同挂）。无法识别 / sd1.5 的挂载不计入，因为它本来就永不兼容任何
 *   底模，不构成"家族冲突"——此时警示行退化成"卸载其一"而不是给一个只能救
 *   一半的假建议。
 *
 * `selectedBaseFamily` 为 null（底模未选）时不判定，两个字段都归零/false。
 */
export interface LoraStackCompatibilitySummary {
  incompatibleCount: number
  mutuallyExclusive: boolean
}

export function summarizeLoraStackCompatibility(
  mountBaseModelFamilies: readonly string[],
  selectedBaseFamily: string | null,
): LoraStackCompatibilitySummary {
  if (!selectedBaseFamily) {
    return { incompatibleCount: 0, mutuallyExclusive: false }
  }
  const incompatibleCount = mountBaseModelFamilies.filter(
    (family) => !isLoraBaseModelMountCompatible(family, selectedBaseFamily),
  ).length
  const classifiedFamilies = mountBaseModelFamilies
    .map((family) => normalizeToLoraBaseFamily(family))
    .filter(
      (family): family is LoraBaseFamily =>
        family !== null && LORA_FAMILY_ARCHITECTURE[family] !== null,
    )
  return {
    incompatibleCount,
    mutuallyExclusive: classifiedFamilies.some((a) =>
      classifiedFamilies.some((b) => !isFamilyPairCompatible(a, b)),
    ),
  }
}
