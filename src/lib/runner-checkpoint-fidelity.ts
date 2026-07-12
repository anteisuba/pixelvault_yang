import {
  normalizeToLoraBaseFamily,
  type LoraBaseFamily,
} from '@/constants/lora-base-models'
import type { CivitaiCheckpointResolution } from '@/services/civitai-lora.service'

/**
 * Runner v3 — 保真度分级（T1/T2/T3）。给定配方的底模引用，判定 runner 能多忠实
 * 地复刻它，供出图前决定「下对底模 / 近似+提示 / 拦」。
 *
 * 纯逻辑：`resolveCheckpoint` 由调用方注入（服务端才有 server-only 的 Civitai
 * 解析），所以本模块可单测、不碰 server-only。镜像 `mountRecipeExtraLoras` 的注入
 * 风格。设计：docs/plans/comfy-runner-v3-checkpoint-ondemand.md §2/§6。
 */

/**
 * runner 能自托管的底模家族：SDXL 系（illustrious/pony/anima/sdxl）共用 ComfyUI 的
 * `CheckpointLoaderSimple` 图，SD1.5 也原生可跑。flux/krea/qwen/... 是另一套管线，
 * 本期不自托管（flux 由 fal 兜；其余 T3 拦）。
 */
const RUNNER_SUPPORTED_FAMILIES: readonly LoraBaseFamily[] = [
  'illustrious',
  'pony',
  'anima',
  'sdxl',
  'sd15',
]

function isRunnerSupportedFamily(
  family: LoraBaseFamily | null,
): family is LoraBaseFamily {
  return family !== null && RUNNER_SUPPORTED_FAMILIES.includes(family)
}

export type RunnerCheckpointFidelity =
  // T1：精确 checkpoint 解析成功且架构自托管得了 → 下这个底模，忠实还原。
  | {
      tier: 'faithful'
      checkpoint: CivitaiCheckpointResolution
      family: LoraBaseFamily
    }
  // T2：拿不到精确 checkpoint（无 id / gated / 已删），但架构已知且支持 → 用同架构
  //     可用底模近似，并提示用户「结果可能有差异」。
  | {
      tier: 'approximate'
      family: LoraBaseFamily
      requestedName: string | null
    }
  // T3：架构本期不支持自托管（flux 走 fal；krea/qwen/z-image/... 拦）。
  | {
      tier: 'unsupported'
      requestedName: string | null
      baseModelRaw: string | null
    }

export interface RecipeCheckpointReference {
  /** civitaiResources[type=checkpoint].modelVersionId（v3-1 捕获）— 精确定位。 */
  checkpointVersionId?: number | null
  /** meta.Model — checkpoint 名，无 versionId 时按名归一底架构兜底。 */
  checkpointName?: string | null
}

/**
 * 判定 runner 对配方底模的保真度层级。`resolveCheckpoint` 注入
 * （`resolveCivitaiCheckpointByReference` 的服务端实现），保持本函数纯净可测。
 */
export async function determineRunnerCheckpointFidelity(
  recipe: RecipeCheckpointReference,
  resolveCheckpoint: (
    versionId: number,
  ) => Promise<CivitaiCheckpointResolution | null>,
): Promise<RunnerCheckpointFidelity> {
  const requestedName = recipe.checkpointName?.trim() || null

  // 1. 精确解析（T1 候选）——只有精确的 versionId 才给出可下载、可忠实复刻的目标。
  if (recipe.checkpointVersionId != null) {
    const resolved = await resolveCheckpoint(recipe.checkpointVersionId)
    if (resolved) {
      const family = normalizeToLoraBaseFamily(resolved.baseModel ?? '')
      if (isRunnerSupportedFamily(family)) {
        return { tier: 'faithful', checkpoint: resolved, family }
      }
      // 解析到了但架构自托管不了（如 Flux/Krea 的 checkpoint）。
      return {
        tier: 'unsupported',
        requestedName,
        baseModelRaw: resolved.baseModel,
      }
    }
    // 解析不到（gated/已删/网络抖动）→ 落到按名兜底（T2/T3）。
  }

  // 2. 无精确 checkpoint —— 按配方记录的 checkpoint 名归一架构。
  const nameFamily = requestedName
    ? normalizeToLoraBaseFamily(requestedName)
    : null
  if (isRunnerSupportedFamily(nameFamily)) {
    return { tier: 'approximate', family: nameFamily, requestedName }
  }
  return { tier: 'unsupported', requestedName, baseModelRaw: null }
}
