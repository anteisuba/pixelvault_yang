/**
 * Comfy Runner (RunPod Serverless ComfyUI) checkpoint + LoRA manifest.
 *
 * Single source of truth for "what's actually on the RunPod Network Volume"
 * on the Next.js side — used for route/capability decisions (which model id
 * maps to which checkpoint, which LoRAs are safe to send to the runner).
 *
 * The Cloudflare Worker (`workers/execution/src/models/runner/checkpoints.ts`)
 * keeps an equivalent manifest — it's a separate package/build target and
 * can't import from `src/constants`, so the two are kept in sync by hand.
 * If you add/remove a checkpoint or allowlisted LoRA here, mirror the change
 * there too.
 *
 * See docs/plans/comfy-runner-HANDOFF-2026-07.md §4.2b/§7.1.
 */

export const RUNNER_CHECKPOINT_FAMILIES = [
  'illustrious',
  'anima',
  'pony',
  'sdxl',
  // v4：DiT「Anima」（Cosmos-Predict2）——与 SDXL 的 anima_pencil（family 'anima'）
  // 是两套架构，独立家族。
  'anima-dit',
] as const

export type RunnerCheckpointFamily = (typeof RUNNER_CHECKPOINT_FAMILIES)[number]

export interface RunnerCheckpointManifestEntry {
  /** Matches the model's `externalModelId` — the ComfyUI `ckpt_name` minus extension. */
  id: string
  family: RunnerCheckpointFamily
  displayName: string
  /** Exact filename on the Volume. SDXL → `models/checkpoints/`; Anima DiT → `models/unet/`. */
  filename: string
  civitaiModelVersionId: number
  recommendedSampler: string
  recommendedScheduler: string
  /** ComfyUI `CLIPSetLastLayer` convention: 1 = no skip, 2 = stop at -2. Unused for Anima DiT. */
  clipSkip: number
  /** Prefixed onto the positive prompt for checkpoints with quality-tag conventions (e.g. Pony's score_9 tags). */
  recommendedPositivePrefix?: string
  /** Workflow architecture. Omitted = 'sdxl' (CheckpointLoaderSimple). 'anima' = DiT. */
  architecture?: 'sdxl' | 'anima'
}

export const RUNNER_CHECKPOINTS: readonly RunnerCheckpointManifestEntry[] = [
  {
    id: 'waiIllustriousSDXL_v150',
    family: 'illustrious',
    displayName: 'WAI-Illustrious-SDXL v15.0',
    filename: 'waiIllustriousSDXL_v150.safetensors',
    civitaiModelVersionId: 2167369,
    recommendedSampler: 'ddim',
    recommendedScheduler: 'normal',
    clipSkip: 2,
  },
  {
    id: 'animaPencilXL_v500',
    family: 'anima',
    displayName: 'Anima Pencil-XL v5.0.0',
    filename: 'animaPencilXL_v500.safetensors',
    civitaiModelVersionId: 597138,
    recommendedSampler: 'euler_ancestral',
    recommendedScheduler: 'normal',
    clipSkip: 1,
  },
  {
    id: 'ponyDiffusionV6XL',
    family: 'pony',
    displayName: 'Pony Diffusion V6 XL',
    filename: 'ponyDiffusionV6XL.safetensors',
    civitaiModelVersionId: 290640,
    recommendedSampler: 'dpmpp_2m_sde',
    recommendedScheduler: 'karras',
    clipSkip: 2,
    recommendedPositivePrefix: 'score_9, score_8_up, score_7_up',
  },
  {
    id: 'sdXL_v10VAEFix',
    family: 'sdxl',
    displayName: 'SDXL 1.0 (VAE Fix)',
    filename: 'sdXL_v10VAEFix.safetensors',
    civitaiModelVersionId: 128078,
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    clipSkip: 1,
  },
  // v4 Anima DiT 默认档（配方精确 Anima checkpoint 私有/下不到时的 T2 回退——LoRA
  // 本就在 Anima-Base 上训，用它近似很忠实）。落 models/unet/（配 UNETLoader）。
  {
    id: 'animaBase_v10',
    family: 'anima-dit',
    displayName: 'Anima Base v1.0',
    filename: 'anima-base-v1.0.safetensors',
    civitaiModelVersionId: 2945208,
    recommendedSampler: 'er_sde',
    recommendedScheduler: 'simple',
    clipSkip: 1,
    architecture: 'anima',
  },
] as const

export function getRunnerCheckpointById(
  id: string,
): RunnerCheckpointManifestEntry | undefined {
  return RUNNER_CHECKPOINTS.find((checkpoint) => checkpoint.id === id)
}

/**
 * LoRAs known to be present on the RunPod Network Volume, keyed by Civitai
 * modelVersionId. v1 uses RunPod's stock `worker-comfyui` image, which does
 * NOT support downloading LoRAs at request time (see HANDOFF §2.3/§10) — a
 * LoRA can only be mounted on a runner generation if it's pre-baked into the
 * Volume and listed here. Anything else must fail loudly rather than silently
 * generating without the requested LoRA.
 */
export interface RunnerLoraAllowlistEntry {
  civitaiModelVersionId: number
  /** Exact filename on the Volume (`models/loras/<filename>`). */
  filename: string
  family: RunnerCheckpointFamily
  displayName: string
}

export const RUNNER_LORA_ALLOWLIST: readonly RunnerLoraAllowlistEntry[] = [
  {
    civitaiModelVersionId: 1672783,
    filename: 'tutenstein-cleo-carter-v1.safetensors',
    family: 'illustrious',
    displayName: 'Tutenstein Cleo Carter V1',
  },
] as const

const CIVITAI_DOWNLOAD_MODEL_VERSION_PATTERN =
  /civitai\.com\/api\/download\/models\/(\d+)/

/** Extracts the Civitai modelVersionId from a LoRA download URL, if present. */
export function extractCivitaiModelVersionId(url: string): number | null {
  const match = url.match(CIVITAI_DOWNLOAD_MODEL_VERSION_PATTERN)
  if (!match) return null
  const versionId = Number(match[1])
  return Number.isFinite(versionId) ? versionId : null
}

/** Resolves a LoRA URL to its allowlisted runner manifest entry, if any. */
export function findRunnerLoraAllowlistEntry(
  loraUrl: string,
): RunnerLoraAllowlistEntry | undefined {
  const versionId = extractCivitaiModelVersionId(loraUrl)
  if (versionId == null) return undefined
  return RUNNER_LORA_ALLOWLIST.find(
    (entry) => entry.civitaiModelVersionId === versionId,
  )
}

/** Whether a LoRA URL is currently mountable on the runner (pre-baked on the Volume). */
export function isRunnerLoraAvailable(loraUrl: string): boolean {
  return findRunnerLoraAllowlistEntry(loraUrl) !== undefined
}
