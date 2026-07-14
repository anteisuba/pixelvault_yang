/**
 * Comfy Runner request → ComfyUI workflow assembly. Combines the checkpoint
 * manifest lookup + LoRA allowlist resolution + workflow-builder into one
 * pure function the Worker calls right before POSTing to RunPod.
 */

import {
  ANIMA_MODEL_SAMPLING_SHIFT,
  ANIMA_TEXT_ENCODER_FILENAME,
  ANIMA_VAE_FILENAME,
  buildAnimaWorkflow,
  type AnimaWorkflowLora,
} from './anima-workflow-builder'
import { getRunnerCheckpointById } from './checkpoints'
import type { RunnerSampler, RunnerScheduler } from './sampling'
import {
  buildComfyWorkflow,
  type ComfyWorkflow,
  type RunnerWorkflowLora,
} from './workflow-builder'

/** Runner 工作流架构：SDXL 系（CheckpointLoaderSimple 一套图）vs Anima DiT。 */
export type RunnerArchitecture = 'sdxl' | 'anima'

const DEFAULT_STEPS = 30
const DEFAULT_CFG = 7.5
// v3 T1 底模覆盖档：任意下载来的 checkpoint 没有 manifest 推荐参数，用保守的
// SDXL-anime 默认（sampler/clipSkip 在当前配方 UX 里本就标「未应用」）。
const OVERRIDE_SAMPLER = 'euler_ancestral'
const OVERRIDE_SCHEDULER = 'normal'
const OVERRIDE_CLIP_SKIP = 2
// Anima DiT 覆盖档默认（HF 卡：30-50 步 CFG 4-5，er_sde 中性默认）。
const ANIMA_DEFAULT_STEPS = 30
const ANIMA_DEFAULT_CFG = 4
const ANIMA_OVERRIDE_SAMPLER = 'er_sde'
const ANIMA_OVERRIDE_SCHEDULER = 'simple'

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
  seed?: number | string
  steps?: number
  cfg?: number
  sampler?: RunnerSampler
  scheduler?: RunnerScheduler
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
  /**
   * v3 T1：源图配方的精确底模被解析 + fork 已下载（advancedParams.runnerCheckpoint）
   * 时，其文件名覆盖预烤 manifest 底模。任意 Civitai checkpoint 无 manifest 条目 →
   * 用保守 SDXL 默认 sampler/scheduler/clipSkip。缺省则按 externalModelId 走预烤档。
   */
  checkpointOverrideFilename?: string
  /**
   * v4：底模架构。'anima' → DiT 工作流（UNETLoader + 独立 Qwen CLIP/VAE +
   * ModelSamplingAuraFlow）。缺省 'sdxl' 走原 CheckpointLoaderSimple 图（向后兼容）。
   */
  architecture?: RunnerArchitecture
  /** Exact post-decode model filename in models/upscale_models/. */
  upscalerModelFilename?: string
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
  // v4：Anima DiT 走独立工作流（UNETLoader + Qwen 配件）。缺省 SDXL 走下方原图。
  if ((input.architecture ?? 'sdxl') === 'anima') {
    return buildAnimaWorkflowFromRequest(input, randomSeed)
  }

  // v3 T1：app 解析出的精确底模（fork 已从 Civitai 下载）覆盖预烤底模；否则按
  // externalModelId 查预烤 manifest。覆盖档用保守 SDXL 默认（manifest 里没有它）。
  let checkpointFilename: string
  let samplerName: string
  let scheduler: string
  let clipSkip: number
  if (input.checkpointOverrideFilename) {
    checkpointFilename = input.checkpointOverrideFilename
    samplerName = OVERRIDE_SAMPLER
    scheduler = OVERRIDE_SCHEDULER
    clipSkip = OVERRIDE_CLIP_SKIP
  } else {
    const checkpoint = getRunnerCheckpointById(input.externalModelId)
    if (!checkpoint) {
      throw new RunnerUnknownCheckpointError(input.externalModelId)
    }
    checkpointFilename = checkpoint.filename
    samplerName = checkpoint.recommendedSampler
    scheduler = checkpoint.recommendedScheduler
    clipSkip = checkpoint.clipSkip
  }
  samplerName = input.sampler ?? samplerName
  scheduler = input.scheduler ?? scheduler

  const loras: RunnerWorkflowLora[] = input.loras.map((lora) => {
    const strength = lora.scale ?? 1
    return {
      filename: lora.filename,
      strengthModel: strength,
      strengthClip: strength,
    }
  })

  return buildComfyWorkflow({
    checkpointFilename,
    positivePrompt: input.prompt,
    negativePrompt: input.negativePrompt,
    width: input.width,
    height: input.height,
    seed: input.seed ?? randomSeed(),
    steps: input.steps ?? DEFAULT_STEPS,
    cfg: input.cfg ?? DEFAULT_CFG,
    samplerName,
    scheduler,
    clipSkip,
    loras,
    referenceImageName: input.referenceImageName,
    denoise: input.denoise,
    upscalerModelFilename: input.upscalerModelFilename,
  })
}

/**
 * Anima DiT 组装：底模落在 diffusion_models（override = fork 已下的精确 Anima
 * checkpoint；否则 manifest 的 anima 默认档），Qwen 文本编码器/VAE 是入卷的共享配件
 * （固定文件名，不下载），LoRA 走 model-only。
 */
function buildAnimaWorkflowFromRequest(
  input: RunnerGenerationRequestInput,
  randomSeed: () => number,
): ComfyWorkflow {
  let diffusionModelFilename: string
  let samplerName: string
  let scheduler: string
  if (input.checkpointOverrideFilename) {
    diffusionModelFilename = input.checkpointOverrideFilename
    samplerName = ANIMA_OVERRIDE_SAMPLER
    scheduler = ANIMA_OVERRIDE_SCHEDULER
  } else {
    const checkpoint = getRunnerCheckpointById(input.externalModelId)
    if (!checkpoint) {
      throw new RunnerUnknownCheckpointError(input.externalModelId)
    }
    diffusionModelFilename = checkpoint.filename
    samplerName = checkpoint.recommendedSampler
    scheduler = checkpoint.recommendedScheduler
  }
  samplerName = input.sampler ?? samplerName
  scheduler = input.scheduler ?? scheduler

  const loras: AnimaWorkflowLora[] = input.loras.map((lora) => ({
    filename: lora.filename,
    strengthModel: lora.scale ?? 1,
  }))

  return buildAnimaWorkflow({
    diffusionModelFilename,
    textEncoderFilename: ANIMA_TEXT_ENCODER_FILENAME,
    vaeFilename: ANIMA_VAE_FILENAME,
    positivePrompt: input.prompt,
    negativePrompt: input.negativePrompt,
    width: input.width,
    height: input.height,
    seed: input.seed ?? randomSeed(),
    steps: input.steps ?? ANIMA_DEFAULT_STEPS,
    cfg: input.cfg ?? ANIMA_DEFAULT_CFG,
    samplerName,
    scheduler,
    modelSamplingShift: ANIMA_MODEL_SAMPLING_SHIFT,
    loras,
    referenceImageName: input.referenceImageName,
    denoise: input.denoise,
    upscalerModelFilename: input.upscalerModelFilename,
  })
}
