import { AI_MODELS, getModelById } from '@/constants/models'

/**
 * LoRA 域底模目录（surface 层组织视图，不重复造模型定义）。
 *
 * 「底模是 LoRA 的插槽属性」：一个 LoRA 自带它要求的家族，底模选择器被该家族
 * 约束（见 docs/references/domains/lora.md）。每个条目是一个 Runner 底模（09-17 托管
 * 通道全部退役后 Runner 是唯一出路），available 跟随它的 `AI_MODELS` 条目。
 * flux / sd15 家族留在 `LORA_BASE_FAMILIES` 里只为给 LoRA 归类，没有底模可选。
 *
 * 注：本文件的 family 是**细粒度**（Illustrious/Pony/SDXL 分开），用于底模选择器；
 * 挂载兼容另按权重架构判（`lora-model-compatibility.ts`：SDXL 系家族互通但
 * Illustrious ↔ Pony 互拦，anima-dit / flux 各自独立，sd15 永不兼容）。
 */

export const LORA_BASE_FAMILIES = [
  'flux',
  'sdxl',
  'illustrious',
  'pony',
  'sd15',
  // SDXL 的「Anima Pencil」系（名字含 anima 但架构是 SDXL）。
  'anima',
  // v4：DiT「Anima」（Cosmos-Predict2，baseModel 值精确为 "Anima"）——独立架构，走
  // runner 的 Qwen-Image 工作流。与上面的 SDXL 'anima' 是两回事。
  'anima-dit',
] as const
export type LoraBaseFamily = (typeof LORA_BASE_FAMILIES)[number]

export type LoraRecipeCheckpointMode = 'source' | 'fixed'

export interface LoraBaseModel {
  /** 选择器 option 值（底模×后端 唯一） */
  id: string
  displayName: string
  translationKey?: 'sourceCheckpointAuto'
  family: LoraBaseFamily
  available: boolean
  providerModelId: AI_MODELS
  /** RUNNER_CHECKPOINTS 的 id —— 出图默认（步数 / CFG）从这一条读。 */
  runnerCheckpointId: string
  /** source = use the selected Civitai image checkpoint when available. */
  recipeCheckpointMode?: LoraRecipeCheckpointMode
  /** 挂了该家族 LoRA 时的推荐默认（纯底模时推荐的是 LORA_BASE_ONLY_DEFAULT_ID）。 */
  recommended?: boolean
  /** Local catalog artwork shared with the homepage model rail. */
  coverImage: string
  /** 步数蒸馏（turbo / lightning / hyper / LCM / schnell）；FLUX.1-dev 的 guidance 蒸馏不算 */
  distilled: boolean
}

/**
 * 底模可用性跟随其 AI_MODELS 条目（available 由 FEATURE_FLAGS.comfyRunner 门控，
 * 见 constants/models/image.ts），避免双份维护。
 */
function runnerAvailable(id: AI_MODELS): boolean {
  return getModelById(id)?.available ?? false
}

export const LORA_BASE_MODELS: readonly LoraBaseModel[] = [
  {
    id: 'illustrious-runner',
    displayName: 'WAI-Illustrious-SDXL v15.0',
    family: 'illustrious',
    available: runnerAvailable(AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE),
    providerModelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
    runnerCheckpointId: 'waiIllustriousSDXL_v150',
    coverImage:
      '/homepage/production/models/image/illustrious-recipe-clone.webp',
    distilled: false,
  },
  {
    id: 'sdxl-runner',
    displayName: 'SDXL 1.0 (VAE Fix)',
    family: 'sdxl',
    available: runnerAvailable(AI_MODELS.SDXL_10_RUNNER),
    providerModelId: AI_MODELS.SDXL_10_RUNNER,
    runnerCheckpointId: 'sdXL_v10VAEFix',
    coverImage: '/homepage/production/models/image/sdxl-10-runner.webp',
    distilled: false,
  },
  {
    id: 'pony-runner',
    displayName: 'Pony Diffusion V6',
    family: 'pony',
    available: runnerAvailable(AI_MODELS.PONY_DIFFUSION_V6),
    providerModelId: AI_MODELS.PONY_DIFFUSION_V6,
    runnerCheckpointId: 'ponyDiffusionV6XL',
    recommended: true,
    coverImage: '/homepage/production/models/image/pony-diffusion-v6.webp',
    distilled: false,
  },
  {
    id: 'anima-runner',
    displayName: 'Anima Pencil-XL v5.0.0',
    family: 'anima',
    available: runnerAvailable(AI_MODELS.ANIMA_PENCIL_XL_RUNNER),
    providerModelId: AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
    runnerCheckpointId: 'animaPencilXL_v500',
    recommended: true,
    coverImage: '/homepage/production/models/image/anima-pencil-xl-runner.webp',
    distilled: false,
  },
  // v4：DiT「Anima」（Cosmos-Predict2）的唯一出路——runner 的 Qwen-Image 工作流。
  // baseModel 值 "Anima" 的 LoRA（本月最热 ~47%，如心月狐）归此家族。
  {
    id: 'anima-dit-runner',
    displayName: '来源图底模（自动）',
    translationKey: 'sourceCheckpointAuto',
    family: 'anima-dit',
    available: runnerAvailable(AI_MODELS.ANIMA_DIT_RUNNER),
    providerModelId: AI_MODELS.ANIMA_DIT_RUNNER,
    runnerCheckpointId: 'animaBase_v10',
    recipeCheckpointMode: 'source',
    recommended: true,
    coverImage: '/homepage/production/models/image/anima-dit-runner.webp',
    distilled: false,
  },
  {
    id: 'anima-dit-base-v10-runner',
    displayName: 'Anima Base v1.0',
    family: 'anima-dit',
    available: runnerAvailable(AI_MODELS.ANIMA_DIT_RUNNER),
    providerModelId: AI_MODELS.ANIMA_DIT_RUNNER,
    runnerCheckpointId: 'animaBase_v10',
    recipeCheckpointMode: 'fixed',
    coverImage: '/homepage/production/models/image/anima-dit-runner.webp',
    distilled: false,
  },
  {
    id: 'anima-dit-turbo-v11-runner',
    displayName: 'Anima Turbo v1.1',
    family: 'anima-dit',
    available: runnerAvailable(AI_MODELS.ANIMA_TURBO_RUNNER),
    providerModelId: AI_MODELS.ANIMA_TURBO_RUNNER,
    runnerCheckpointId: 'animaTurbo_v11',
    recipeCheckpointMode: 'fixed',
    coverImage: '/homepage/production/models/image/anima-dit-runner.webp',
    distilled: true,
  },
]

/**
 * Pure-base generation has no source LoRA recipe from which to resolve a
 * checkpoint. Keep its default explicit and stable: Anima Turbo v1.1（owner
 * 09-28：纯底模默认 Turbo，挂 LoRA 仍按家族推荐）。
 */
export const LORA_BASE_ONLY_DEFAULT_ID = 'anima-dit-turbo-v11-runner'

/**
 * Bases that can generate without a mounted LoRA. Source-checkpoint entries
 * are intentionally excluded because they require Civitai image metadata.
 * Keep unavailable entries in the catalog so the selector can explain why a
 * configured base is disabled instead of silently replacing the default.
 */
export function getBaseOnlyGenerationBases(): LoraBaseModel[] {
  return LORA_BASE_MODELS.filter(
    (model) => model.recipeCheckpointMode !== 'source',
  )
}

export function getDefaultBaseOnlyGenerationBase(): LoraBaseModel | null {
  const bases = getBaseOnlyGenerationBases()
  return (
    bases.find((model) => model.id === LORA_BASE_ONLY_DEFAULT_ID) ??
    bases.find((model) => model.available && model.recommended) ??
    bases.find((model) => model.available) ??
    bases[0] ??
    null
  )
}

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
  // baseModel 值 "Anima" 是 Diffusion Transformer 架构（Cosmos-Predict2；Anima /
  // WAI-ANIMA / AnimaYume… 一整个生态），权重 UNET-only、无 CLIP/VAE，跑不了 SDXL 的
  // CheckpointLoaderSimple 图——归独立家族 'anima-dit'，走 runner 的 Qwen-Image 工作流。
  // 与 SDXL 系区分：「Anima Pencil XL」的 baseModel 是 "SDXL 1.0"、「Animagine」也是
  // SDXL——它们名字含 "anima" 但架构是 SDXL，走下面的 includes 归 'anima'（anima_pencil）。
  // 判据用**精确值** s === 'anima'（Civitai 的 DiT baseModel 枚举值），不碰子串，
  // 免误杀 Animagine（超热门 SDXL，名字含 "anima"）。
  if (s === 'anima' || s === 'anima-dit') return 'anima-dit'
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

/** 给定 LoRA 家族（原始字符串），返回兼容的底模条目（含 available=false 的）。 */
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

/**
 * §4.4 底模选择器分组：runner 组内再按架构系分「SDXL 系 / DiT 系」。DiT 家族
 * 显式列举（目前只有 `anima-dit`——Cosmos-Predict2，UNET-only 无 CLIP/VAE，
 * 跑不了 SDXL 的 CheckpointLoaderSimple 图）；其余全部归 SDXL 系，新增架构
 * 家族默认落 SDXL 桶，除非显式加进这张表。
 */
export const LORA_BASE_DIT_FAMILIES: readonly LoraBaseFamily[] = ['anima-dit']

export type LoraBaseArchitectureGroup = 'sdxl' | 'dit'

export function getLoraBaseArchitectureGroup(
  family: LoraBaseFamily,
): LoraBaseArchitectureGroup {
  return LORA_BASE_DIT_FAMILIES.includes(family) ? 'dit' : 'sdxl'
}

/**
 * LoRA 栈总权重护栏：非蒸馏底模 2.0、蒸馏底模（turbo/lightning/hyper/LCM/schnell）1.0。
 * 2.0 = 真实配方里「角色 + 画风」合计的 p75（owner 2026-09-28 从 1.5 抬上来：
 * 1.5 会让六到八成热门配方标红）。
 */
export const LORA_STACK_WEIGHT_BUDGET = {
  default: 2.0,
  distilled: 1.0,
} as const

/** 底模未定（`base` 为 null）时不判——没有底模就没有预算。 */
export function resolveLoraStackWeightBudget(
  base: Pick<LoraBaseModel, 'distilled'> | null,
): number | null {
  if (!base) return null
  return base.distilled
    ? LORA_STACK_WEIGHT_BUDGET.distilled
    : LORA_STACK_WEIGHT_BUDGET.default
}
