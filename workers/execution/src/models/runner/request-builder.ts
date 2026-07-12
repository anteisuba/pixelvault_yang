/**
 * Comfy Runner request → ComfyUI workflow assembly. Combines the checkpoint
 * manifest lookup + LoRA allowlist resolution + workflow-builder into one
 * pure function the Worker calls right before POSTing to RunPod.
 */

import { getRunnerCheckpointById } from './checkpoints'
import {
  buildComfyWorkflow,
  type ComfyWorkflow,
  type RunnerWorkflowLora,
} from './workflow-builder'

const DEFAULT_STEPS = 30
const DEFAULT_CFG = 7.5

// v2（docs/plans/comfy-runner-v2-runtime-lora.md）：LoRA 文件名由 app 侧
// `prepareRunnerLoras` 预先派生（`civitai-<versionId>.safetensors`），并连同 R2
// 预签名下载链一起下发。Worker 不再按 allowlist 解析/拒绝——fork worker 会先把
// `filename` 从 R2 拉到 models/loras/ 再挂（下载规格另见 index.ts 的 loras_to_fetch）。
export interface RunnerLoraRequestInput {
  filename: string
  scale?: number | null
}

export interface RunnerGenerationRequestInput {
  /** Checkpoint manifest id — matches `providerInput.externalModelId`. */
  externalModelId: string
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  /** Omit to let the caller supply a random seed (not generated here — see `buildRunnerWorkflowFromRequest`'s `randomSeed` param). */
  seed?: number
  steps?: number
  cfg?: number
  loras: readonly RunnerLoraRequestInput[]
  /**
   * img2img: filename of the reference image uploaded alongside the workflow
   * (RunPod `input.images[].name`). Omit for txt2img.
   */
  referenceImageName?: string
  /**
   * KSampler denoise for img2img (0.01–1.0). Only applied when
   * `referenceImageName` is set; the Worker computes it from the request's
   * referenceStrength via the same inversion used by the fal/replicate paths.
   */
  denoise?: number
}

export class RunnerUnknownCheckpointError extends Error {
  constructor(readonly externalModelId: string) {
    super(`Unknown runner checkpoint: ${externalModelId}`)
    this.name = 'RunnerUnknownCheckpointError'
  }
}

/**
 * Builds the ComfyUI workflow JSON for a runner generation request.
 * `randomSeed` is injected (rather than called internally) so this stays a
 * pure, deterministic function to test — the Worker passes a real RNG,
 * tests pass a fixed one.
 */
export function buildRunnerWorkflowFromRequest(
  input: RunnerGenerationRequestInput,
  randomSeed: () => number,
): ComfyWorkflow {
  const checkpoint = getRunnerCheckpointById(input.externalModelId)
  if (!checkpoint) {
    throw new RunnerUnknownCheckpointError(input.externalModelId)
  }

  const loras: RunnerWorkflowLora[] = input.loras.map((lora) => {
    const strength = lora.scale ?? 1
    return {
      filename: lora.filename,
      strengthModel: strength,
      strengthClip: strength,
    }
  })

  return buildComfyWorkflow({
    checkpointFilename: checkpoint.filename,
    positivePrompt: input.prompt,
    negativePrompt: input.negativePrompt,
    width: input.width,
    height: input.height,
    seed: input.seed ?? randomSeed(),
    steps: input.steps ?? DEFAULT_STEPS,
    cfg: input.cfg ?? DEFAULT_CFG,
    samplerName: checkpoint.recommendedSampler,
    scheduler: checkpoint.recommendedScheduler,
    clipSkip: checkpoint.clipSkip,
    loras,
    referenceImageName: input.referenceImageName,
    denoise: input.denoise,
  })
}
