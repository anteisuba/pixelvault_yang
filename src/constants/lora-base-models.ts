import { AI_MODELS, getModelById } from '@/constants/models'

/**
 * LoRA 域底模目录（surface 层组织视图，不重复造模型定义）。
 *
 * 「底模是 LoRA 的插槽属性」：一个 LoRA 自带它要求的家族，底模选择器被该家族
 * 约束（见 docs/plans/lora-domain-split-2026-06.md §2.2/§3）。每个 `底模×后端`
 * 组合是一个扁平可选条目，带 family · backend(hosted 快/runner 忠实) · available。
 *
 * - hosted 条目复用既有 `AI_MODELS`（available 跟随模型自身开关，不另维护）。
 * - runner 条目指向未来的 RUNNER_CHECKPOINTS（comfy-runner 任务包），当前 available=false。
 *
 * 注：本文件的 family 是**细粒度**（Illustrious/Pony/SDXL 分开），用于底模选择器；
 * 与 `lora-model-compatibility.ts` 里的粗粒度 `LoraFamilyBucket`(flux/sdxl/anima/other)
 * 各司其职——粗的用于 hosted 路由，细的用于"可选底模"展示。
 */

export const LORA_BASE_FAMILIES = [
  'flux',
  'sdxl',
  'illustrious',
  'pony',
  'sd15',
  'anima',
] as const
export type LoraBaseFamily = (typeof LORA_BASE_FAMILIES)[number]

export type LoraBaseBackend = 'hosted' | 'runner'
export type LoraBaseFidelity = 'fast' | 'faithful'

export interface LoraBaseModel {
  /** 选择器 option 值（底模×后端 唯一） */
  id: string
  displayName: string
  family: LoraBaseFamily
  backend: LoraBaseBackend
  fidelity: LoraBaseFidelity
  available: boolean
  /** hosted → 复用 AI_MODELS */
  providerModelId?: AI_MODELS
  /** runner → 未来 RUNNER_CHECKPOINTS（暂未实现） */
  runnerCheckpointId?: string
  /** 该家族的推荐默认 */
  recommended?: boolean
}

/** hosted 底模可用性跟随 AI_MODELS 自身开关，避免双份维护。 */
function hostedAvailable(id: AI_MODELS): boolean {
  return getModelById(id)?.available ?? false
}

/**
 * runner 底模可用性同样跟随其 AI_MODELS 条目（available 由
 * FEATURE_FLAGS.comfyRunner 门控，见 constants/models/image.ts）。单独命名
 * 只为可读性——底层逻辑与 hostedAvailable 一致。
 */
function runnerAvailable(id: AI_MODELS): boolean {
  return getModelById(id)?.available ?? false
}

export const LORA_BASE_MODELS: readonly LoraBaseModel[] = [
  {
    id: 'flux-hosted',
    displayName: 'FLUX.1-dev',
    family: 'flux',
    backend: 'hosted',
    fidelity: 'fast',
    available: hostedAvailable(AI_MODELS.FLUX_LORA),
    providerModelId: AI_MODELS.FLUX_LORA,
    recommended: true,
  },
  {
    id: 'illustrious-hosted',
    displayName: 'Illustrious · NoobAI-XL',
    family: 'illustrious',
    backend: 'hosted',
    fidelity: 'fast',
    available: hostedAvailable(AI_MODELS.ILLUSTRIOUS_XL),
    providerModelId: AI_MODELS.ILLUSTRIOUS_XL,
    recommended: true,
  },
  {
    id: 'illustrious-runner',
    displayName: 'WAI-Illustrious-SDXL v15.0',
    family: 'illustrious',
    backend: 'runner',
    fidelity: 'faithful',
    available: runnerAvailable(AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE),
    providerModelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
    runnerCheckpointId: 'waiIllustriousSDXL_v150',
  },
  {
    id: 'sdxl-hosted',
    displayName: 'SDXL 1.0',
    family: 'sdxl',
    backend: 'hosted',
    fidelity: 'fast',
    available: hostedAvailable(AI_MODELS.ILLUSTRIOUS_XL),
    providerModelId: AI_MODELS.ILLUSTRIOUS_XL,
    recommended: true,
  },
  {
    id: 'sdxl-runner',
    displayName: 'SDXL 1.0 (VAE Fix) · runner',
    family: 'sdxl',
    backend: 'runner',
    fidelity: 'faithful',
    available: runnerAvailable(AI_MODELS.SDXL_10_RUNNER),
    providerModelId: AI_MODELS.SDXL_10_RUNNER,
    runnerCheckpointId: 'sdXL_v10VAEFix',
  },
  {
    id: 'pony-runner',
    displayName: 'Pony Diffusion V6',
    family: 'pony',
    backend: 'runner',
    fidelity: 'faithful',
    available: runnerAvailable(AI_MODELS.PONY_DIFFUSION_V6),
    providerModelId: AI_MODELS.PONY_DIFFUSION_V6,
    runnerCheckpointId: 'ponyDiffusionV6XL',
    recommended: true,
  },
  {
    id: 'sd15-runner',
    displayName: 'SD 1.5',
    family: 'sd15',
    backend: 'runner',
    fidelity: 'faithful',
    // SD 1.5 移出 runner 范围（2026-07-07 拍板）——保持 external 跳转，不再
    // 做第二套分辨率/采样模板档。见 comfy-runner-HANDOFF-2026-07.md §4.2b。
    available: false,
    recommended: true,
  },
  {
    id: 'anima-hosted',
    displayName: 'Anima Pencil XL',
    family: 'anima',
    backend: 'hosted',
    fidelity: 'fast',
    available: hostedAvailable(AI_MODELS.ANIMA_PENCIL_XL),
    providerModelId: AI_MODELS.ANIMA_PENCIL_XL,
  },
  {
    id: 'anima-runner',
    displayName: 'Anima Pencil-XL v5.0.0',
    family: 'anima',
    backend: 'runner',
    fidelity: 'faithful',
    // Anima 的 hosted 端点是死链 + license 不许第三方托管，runner 是唯一
    // 出路——推荐档从 hosted 切到这里。
    available: runnerAvailable(AI_MODELS.ANIMA_PENCIL_XL_RUNNER),
    providerModelId: AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
    runnerCheckpointId: 'animaPencilXL_v500',
    recommended: true,
  },
]

/**
 * 把 LoRA 的原始 baseModel 字符串（Civitai 值 / `LoraAsset.baseModelFamily`）
 * 归一到细粒度家族。**顺序重要**：illustrious/pony/anima 都是 SDXL 系，
 * 必须在 sdxl(xl) 之前命中；sd15 在 sdxl 之前（"sd 1.5" 不含 "xl"）。
 */
export function normalizeToLoraBaseFamily(raw: string): LoraBaseFamily | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s.includes('illustrious') || s.includes('noob')) return 'illustrious'
  // Pony V7 是 AuraFlow 架构，与 V6（SDXL 系）权重不通——不能归 pony 家族，
  // 否则将来会被错误路由到 SDXL 架构的 pony runner checkpoint。
  if (s.includes('pony') && s.includes('v7')) return null
  if (s.includes('pony')) return 'pony'
  if (s.includes('anima')) return 'anima'
  if (s.includes('flux')) return 'flux'
  if (
    s.includes('sd 1.5') ||
    s.includes('sd1.5') ||
    s.includes('sd_1.5') ||
    s === 'sd15'
  ) {
    return 'sd15'
  }
  if (s.includes('sdxl') || s.includes('xl')) return 'sdxl'
  return null
}

/** 给定 LoRA 家族（原始字符串），返回兼容的底模条目（hosted 可用 + runner 即将）。 */
export function getCompatibleBases(rawBaseModel: string): LoraBaseModel[] {
  const family = normalizeToLoraBaseFamily(rawBaseModel)
  if (!family) return []
  return LORA_BASE_MODELS.filter((m) => m.family === family)
}

/** 推荐默认底模：优先 可用+recommended → 可用 → 任意（含即将）。 */
export function getDefaultBase(rawBaseModel: string): LoraBaseModel | null {
  const bases = getCompatibleBases(rawBaseModel)
  return (
    bases.find((m) => m.available && m.recommended) ??
    bases.find((m) => m.available) ??
    bases[0] ??
    null
  )
}
