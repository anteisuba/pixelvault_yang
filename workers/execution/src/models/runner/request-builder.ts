/**
 * Comfy Runner request → ComfyUI workflow assembly. Combines the checkpoint
 * manifest lookup + LoRA allowlist resolution + workflow-builder into one
 * pure function the Worker calls right before POSTing to RunPod.
 */

import {
  getRunnerCheckpointById,
  resolveRunnerLoraFilename,
} from './checkpoints'
import {
  buildComfyWorkflow,
  type ComfyWorkflow,
  type RunnerWorkflowLora,
} from './workflow-builder'

const DEFAULT_STEPS = 30
const DEFAULT_CFG = 7.5

export interface RunnerLoraRequestInput {
  url: string
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
}

export class RunnerUnknownCheckpointError extends Error {
  constructor(readonly externalModelId: string) {
    super(`Unknown runner checkpoint: ${externalModelId}`)
    this.name = 'RunnerUnknownCheckpointError'
  }
}

export class RunnerLoraUnavailableError extends Error {
  constructor(readonly loraUrl: string) {
    super(
      `This LoRA is not available on the runner yet (not pre-baked on the ` +
        `Network Volume — v1 has no runtime LoRA download): ${loraUrl}`,
    )
    this.name = 'RunnerLoraUnavailableError'
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
    const filename = resolveRunnerLoraFilename(lora.url)
    if (!filename) {
      throw new RunnerLoraUnavailableError(lora.url)
    }
    const strength = lora.scale ?? 1
    return { filename, strengthModel: strength, strengthClip: strength }
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
  })
}
