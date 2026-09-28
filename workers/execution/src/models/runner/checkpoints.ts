/**
 * Comfy Runner (RunPod Serverless ComfyUI) checkpoint + LoRA manifest —
 * Worker-side copy.
 *
 * Mirrors `src/constants/runner-checkpoints.ts` on the Next.js side. This
 * worker is a separate package/build target (Cloudflare Workers runtime, no
 * access to `@/constants`), so the manifest is duplicated by hand. If you
 * add/remove a checkpoint or allowlisted LoRA on one side, mirror the change
 * on the other.
 *
 * Volume 布局与预置资产清单见 docs/references/domains/runner.md §3。
 */

export interface RunnerCheckpointDefinition {
  /** Matches `providerInput.externalModelId` from the dispatched run context. */
  id: string
  /**
   * Exact filename on the Network Volume. SDXL → `models/checkpoints/`;
   * Anima DiT → `models/diffusion_models/` (see `architecture`).
   */
  filename: string
  recommendedSampler: string
  recommendedScheduler: string
  /** 这个底模自己的出图默认；缺省走 request-builder 的通用默认（SDXL 30 · 7.5）。 */
  recommendedSteps?: number
  recommendedCfg?: number
  /** ComfyUI `CLIPSetLastLayer` convention: 1 = no skip, 2 = stop at -2. Unused for Anima. */
  clipSkip: number
  /**
   * Workflow architecture. Omitted = 'sdxl' (CheckpointLoaderSimple graph).
   * 'anima' / 'zimage' = DiT (UNETLoader + shared text encoder / VAE +
   * ModelSamplingAuraFlow; per-family pieces in DIT_WORKFLOW_PROFILES).
   */
  architecture?: 'sdxl' | 'anima' | 'zimage'
}

export const RUNNER_CHECKPOINTS: readonly RunnerCheckpointDefinition[] = [
  {
    id: 'waiIllustriousSDXL_v150',
    filename: 'waiIllustriousSDXL_v150.safetensors',
    recommendedSampler: 'ddim',
    recommendedScheduler: 'normal',
    clipSkip: 2,
  },
  {
    id: 'animaPencilXL_v500',
    filename: 'animaPencilXL_v500.safetensors',
    recommendedSampler: 'euler_ancestral',
    recommendedScheduler: 'normal',
    clipSkip: 1,
  },
  {
    id: 'ponyDiffusionV6XL',
    filename: 'ponyDiffusionV6XL.safetensors',
    recommendedSampler: 'dpmpp_2m_sde',
    recommendedScheduler: 'karras',
    clipSkip: 2,
  },
  {
    id: 'sdXL_v10VAEFix',
    filename: 'sdXL_v10VAEFix.safetensors',
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    clipSkip: 1,
  },
  // v4 Anima DiT 默认档（配方精确 Anima checkpoint 私有/下不到时的 T2 回退——LoRA
  // 本就在 Anima-Base 上训，用它近似很忠实）。落在 models/diffusion_models/。
  {
    id: 'animaBase_v10',
    filename: 'anima-base-v1.0.safetensors',
    recommendedSampler: 'er_sde',
    recommendedScheduler: 'simple',
    recommendedSteps: 30,
    recommendedCfg: 4,
    clipSkip: 1,
    architecture: 'anima',
  },
  // 步数蒸馏档：纯底模出图的默认。来源图底模版本名带 turbo 时也借它的默认
  // （advancedParams.runnerCheckpoint.defaultsCheckpointId）。
  {
    id: 'animaTurbo_v11',
    filename: 'anima-turbo-v1.1.safetensors',
    recommendedSampler: 'euler',
    recommendedScheduler: 'simple',
    recommendedSteps: 10,
    recommendedCfg: 1,
    clipSkip: 1,
    architecture: 'anima',
  },
  // Z-Image Turbo（Tongyi-MAI，Apache-2.0）满精度：采样照 Comfy-Org 官方模板
  // （res_multistep · simple · CFG 1 · shift 3），步数 owner 09-28 定 9。
  {
    id: 'zImageTurbo_bf16',
    filename: 'z_image_turbo_bf16.safetensors',
    recommendedSampler: 'res_multistep',
    recommendedScheduler: 'simple',
    recommendedSteps: 9,
    recommendedCfg: 1,
    clipSkip: 1,
    architecture: 'zimage',
  },
]

export function getRunnerCheckpointById(
  id: string,
): RunnerCheckpointDefinition | undefined {
  return RUNNER_CHECKPOINTS.find((checkpoint) => checkpoint.id === id)
}

/**
 * LoRAs known to be pre-baked on the RunPod Network Volume, keyed by Civitai
 * modelVersionId. RunPod's stock `worker-comfyui` image can't download LoRAs
 * at request time (HANDOFF §2.3/§10) — only a LoRA already on the Volume and
 * listed here can be mounted. Anything else must fail loudly.
 */
export interface RunnerLoraAllowlistEntry {
  civitaiModelVersionId: number
  /** Exact filename on the Volume (`models/loras/<filename>`). */
  filename: string
}

export const RUNNER_LORA_ALLOWLIST: readonly RunnerLoraAllowlistEntry[] = [
  {
    civitaiModelVersionId: 1672783,
    filename: 'tutenstein-cleo-carter-v1.safetensors',
  },
]

const CIVITAI_DOWNLOAD_MODEL_VERSION_PATTERN =
  /civitai\.com\/api\/download\/models\/(\d+)/

export function extractCivitaiModelVersionId(url: string): number | null {
  const match = url.match(CIVITAI_DOWNLOAD_MODEL_VERSION_PATTERN)
  if (!match) return null
  const versionId = Number(match[1])
  return Number.isFinite(versionId) ? versionId : null
}

/**
 * Resolves a LoRA download URL to its allowlisted Volume filename, or `null`
 * if it isn't pre-baked (not an error by itself — callers decide whether to
 * fail or silently skip based on context).
 */
export function resolveRunnerLoraFilename(loraUrl: string): string | null {
  const versionId = extractCivitaiModelVersionId(loraUrl)
  if (versionId == null) return null
  const entry = RUNNER_LORA_ALLOWLIST.find(
    (candidate) => candidate.civitaiModelVersionId === versionId,
  )
  return entry?.filename ?? null
}
