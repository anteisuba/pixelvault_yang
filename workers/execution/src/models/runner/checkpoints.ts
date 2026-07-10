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
 * See docs/plans/comfy-runner-HANDOFF-2026-07.md §4.2b/§7.1.
 */

export interface RunnerCheckpointDefinition {
  /** Matches `providerInput.externalModelId` from the dispatched run context. */
  id: string
  /** Exact filename on the RunPod Network Volume (`models/checkpoints/<filename>`). */
  filename: string
  recommendedSampler: string
  recommendedScheduler: string
  /** ComfyUI `CLIPSetLastLayer` convention: 1 = no skip, 2 = stop at -2. */
  clipSkip: number
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
