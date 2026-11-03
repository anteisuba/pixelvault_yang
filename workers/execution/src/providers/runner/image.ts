import { EXECUTION_PROGRESS_STAGES } from '../../../../../src/constants/generation-progress'
import type { ExecutionEnv, WorkerImageRunContext } from '../../index'
import { reportExecutionStage, reportProviderJobId } from '../../lib/app-bridge'
import { base64ToBytes, randomUint32 } from '../../lib/bytes'
import {
  isRecord,
  readNumberField,
  readPositiveNumberField,
  readStringField,
} from '../../lib/fields'
import {
  getImageReferenceInputs,
  getStandardImageDimensions,
  invertReferenceStrength,
  readAdvancedRecord,
  uploadImageBytesToKey,
} from '../../lib/image-io'
import {
  createProviderResponseError,
  WorkerProviderError,
} from '../../lib/provider-error'
import { getRunnerCheckpointById } from './checkpoints'
import type { DitArchitecture } from './dit-workflow-builder'
import {
  buildQwenImage21Workflow,
  QWEN_IMAGE_21_MODEL,
  readQwenPngDimensions,
} from './qwen-workflow-builder'
import {
  buildRunnerWorkflowFromRequest,
  isDitArchitecture,
  parseRunnerModelEvidence,
  resolveRunnerHires,
  type RunnerArchitecture,
  type RunnerModelEvidence,
  RunnerUnknownCheckpointError,
} from './request-builder'
import {
  isRunnerSampler,
  isRunnerScheduler,
  type RunnerSampler,
  type RunnerScheduler,
} from './sampling'
import { isRunnerUpscaler, RUNNER_UPSCALER_MANIFEST } from './upscalers'
import { modalRunnerRequest } from './modal'
import { getWorkerImageOutputKey } from '../../lib/image-io'
import { RETRY_TWICE } from '../multi-step'
import { imageStepNames, type MultiStepImageDriver } from '../types'

export interface RunnerLoraSpecInput {
  filename: string
  downloadUrl: string
  scale?: number
}

// v2 runner：app 侧 `prepareRunnerLoras` 已把每把 LoRA 确保进 R2 + 生成预签名 GET，
// 结果放在 advancedParams.runnerLoras（{filename, downloadUrl, scale}）。Worker 据此
// 组 workflow（filename）+ loras_to_fetch（downloadUrl）发给 fork worker。
export function getRunnerLoraSpecs(
  context: WorkerImageRunContext,
): RunnerLoraSpecInput[] {
  const specs = readAdvancedRecord(context).runnerLoras
  if (!Array.isArray(specs)) return []

  return specs.flatMap((candidate): RunnerLoraSpecInput[] => {
    if (!isRecord(candidate)) return []
    const filename = readStringField(candidate, 'filename')
    const downloadUrl = readStringField(candidate, 'downloadUrl')
    if (!filename || !downloadUrl) return []
    return [
      {
        filename,
        downloadUrl,
        scale: readNumberField(candidate, 'scale') ?? undefined,
      },
    ]
  })
}

export interface RunnerCheckpointSpecInput {
  filename: string
  downloadUrl: string
  /** fork 落盘子目录：SDXL→'checkpoints'（缺省）；Anima DiT→'diffusion_models'。 */
  targetDir?: 'checkpoints' | 'diffusion_models'
  /** Civitai 公布的 SHA-256；fork 落盘前核对，缺省 = 来源没公布，照下。 */
  sha256?: string
  /** 借哪一档清单底模的出图默认（来源图底模是 Anima turbo → 'animaTurbo_v11'）。 */
  defaultsCheckpointId?: string
}

// Runner 底模下发（docs/references/domains/runner.md）：app 侧
// `prepareRunnerCheckpoint` 把源图配方的精确底模解析成 {filename,
// downloadUrl}，放在 advancedParams.runnerCheckpoint。Worker 据此覆盖 workflow 的
// ckpt_name + 发 checkpoint_to_fetch 给 fork（fork GPU 侧从 Civitai 直下到
// models/checkpoints/）。无则用预烤底模（externalModelId）。
export function getRunnerCheckpointSpec(
  context: WorkerImageRunContext,
): RunnerCheckpointSpecInput | null {
  const spec = readAdvancedRecord(context).runnerCheckpoint
  if (!isRecord(spec)) return null
  const filename = readStringField(spec, 'filename')
  const downloadUrl = readStringField(spec, 'downloadUrl')
  if (!filename || !downloadUrl) return null
  const targetDir =
    readStringField(spec, 'targetDir') === 'diffusion_models'
      ? 'diffusion_models'
      : undefined
  const sha256 = readStringField(spec, 'sha256')
  const defaultsCheckpointId = readStringField(spec, 'defaultsCheckpointId')
  return {
    filename,
    downloadUrl,
    targetDir,
    ...(sha256 && /^[a-f0-9]{64}$/.test(sha256) ? { sha256 } : {}),
    ...(defaultsCheckpointId && getRunnerCheckpointById(defaultsCheckpointId)
      ? { defaultsCheckpointId }
      : {}),
  }
}

// DiT 配件：fork 首次作业从 HF 拉到卷（缺则下、有则跳＝永久缓存）：文本编码器→models/clip、
// VAE→models/vae；没有来源图精确底模时再加清单里选中的那一档→models/unet。
// v9：钉 HF commit + 每个文件的 SHA-256（HF LFS oid，回读日期见注释），fork 落盘前核对——
// `main` 上换了文件也不会悄悄换掉我们出图用的权重。
export interface RunnerCompanion {
  filename: string
  url: string
  target_dir: 'unet' | 'clip' | 'vae'
  source: 'huggingface'
  sha256: string
}

// circlestone-labs/Anima（2026-09-28 回读）。
export const ANIMA_HF_REVISION = 'f973fc41ec7545364ac9776c2440285f43ff2a30'

export const ANIMA_HF_BASE = `https://huggingface.co/circlestone-labs/Anima/resolve/${ANIMA_HF_REVISION}/split_files`

// Comfy-Org/z_image_turbo（官方 ComfyUI 分包，2026-09-28 回读）。
export const ZIMAGE_HF_REVISION = '6fc90a3b1b653e935a0d175e260736de25b84df5'

export const ZIMAGE_HF_BASE = `https://huggingface.co/Comfy-Org/z_image_turbo/resolve/${ZIMAGE_HF_REVISION}/split_files`

// Comfy-Org/Krea-2（官方 ComfyUI 分包，2026-10-07 回读）。
export const KREA2_HF_REVISION = 'eb1eddd3983a54678545a9b2c178c5853b30f7be'

export const KREA2_HF_BASE = `https://huggingface.co/Comfy-Org/Krea-2/resolve/${KREA2_HF_REVISION}`

export const RUNNER_DIT_COMPANIONS: Readonly<
  Record<
    DitArchitecture,
    {
      shared: readonly RunnerCompanion[]
      /** 键 = 清单 id（externalModelId）；文件名与 checkpoints.ts 那一条一致。 */
      checkpoints: Readonly<Record<string, RunnerCompanion>>
    }
  >
> = {
  anima: {
    shared: [
      {
        filename: 'qwen_3_06b_base.safetensors',
        url: `${ANIMA_HF_BASE}/text_encoders/qwen_3_06b_base.safetensors`,
        target_dir: 'clip',
        source: 'huggingface',
        sha256:
          'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
      },
      {
        filename: 'qwen_image_vae.safetensors',
        url: `${ANIMA_HF_BASE}/vae/qwen_image_vae.safetensors`,
        target_dir: 'vae',
        source: 'huggingface',
        sha256:
          'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
      },
    ],
    checkpoints: {
      animaBase_v10: {
        filename: 'anima-base-v1.0.safetensors',
        url: `${ANIMA_HF_BASE}/diffusion_models/anima-base-v1.0.safetensors`,
        target_dir: 'unet',
        source: 'huggingface',
        sha256:
          'bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e',
      },
      animaTurbo_v11: {
        filename: 'anima-turbo-v1.1.safetensors',
        url: `${ANIMA_HF_BASE}/diffusion_models/anima-turbo-v1.1.safetensors`,
        target_dir: 'unet',
        source: 'huggingface',
        sha256:
          'fba11953276b57edf59d1dc4f1857ac05aa079c56f982b4d7c20298d57d3f7eb',
      },
    },
  },
  zimage: {
    shared: [
      {
        filename: 'qwen_3_4b.safetensors',
        url: `${ZIMAGE_HF_BASE}/text_encoders/qwen_3_4b.safetensors`,
        target_dir: 'clip',
        source: 'huggingface',
        sha256:
          '6c671498573ac2f7a5501502ccce8d2b08ea6ca2f661c458e708f36b36edfc5a',
      },
      {
        filename: 'ae.safetensors',
        url: `${ZIMAGE_HF_BASE}/vae/ae.safetensors`,
        target_dir: 'vae',
        source: 'huggingface',
        sha256:
          'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38',
      },
    ],
    checkpoints: {
      zImageTurbo_bf16: {
        filename: 'z_image_turbo_bf16.safetensors',
        url: `${ZIMAGE_HF_BASE}/diffusion_models/z_image_turbo_bf16.safetensors`,
        target_dir: 'unet',
        source: 'huggingface',
        sha256:
          '2407613050b809ffdff18a4ac99af83ea6b95443ecebdf80e064a79c825574a6',
      },
    },
  },
  krea2: {
    shared: [
      {
        filename: 'qwen3vl_4b_fp8_scaled.safetensors',
        url: `${KREA2_HF_BASE}/text_encoders/qwen3vl_4b_fp8_scaled.safetensors`,
        target_dir: 'clip',
        source: 'huggingface',
        sha256:
          '54bd5144df0bbc25dd6ccadfcb826b521445a1b06ae5a42570bdd2974ca87094',
      },
      // 与 Anima 那份同一文件（SHA 相同），卷上已有就直接命中。
      {
        filename: 'qwen_image_vae.safetensors',
        url: `${KREA2_HF_BASE}/vae/qwen_image_vae.safetensors`,
        target_dir: 'vae',
        source: 'huggingface',
        sha256:
          'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
      },
    ],
    checkpoints: {
      krea2Turbo_fp8: {
        filename: 'krea2_turbo_fp8_scaled.safetensors',
        url: `${KREA2_HF_BASE}/diffusion_models/krea2_turbo_fp8_scaled.safetensors`,
        target_dir: 'unet',
        source: 'huggingface',
        sha256:
          'eb4dd8c612cfd10f64f25b057e6e6bbcb5737c94a7372177e456dbf7579502f1',
      },
    },
  },
}

export const RUNNER_UINT64_MAX = '18446744073709551615'

export function isRunnerUint64Seed(value: string): boolean {
  return (
    /^(0|[1-9]\d{0,19})$/.test(value) &&
    (value.length < RUNNER_UINT64_MAX.length ||
      (value.length === RUNNER_UINT64_MAX.length &&
        value.localeCompare(RUNNER_UINT64_MAX) <= 0))
  )
}

export function readRunnerSeed(
  advancedParams: Record<string, unknown>,
): number | string | undefined {
  const exact = readStringField(advancedParams, 'runnerSeed')
  if (exact) {
    if (!isRunnerUint64Seed(exact)) {
      throw new WorkerProviderError({
        message: 'Runner seed is outside the supported uint64 range.',
        provider: 'runner',
        phase: 'request_validation',
      })
    }
    return exact
  }
  const seed = readNumberField(advancedParams, 'seed')
  return seed != null && seed >= 0 ? Math.round(seed) : undefined
}

export function getRunnerDefaultDimensions(
  aspectRatio: string,
  architecture: RunnerArchitecture,
): { width: number; height: number } {
  // DiT（Anima · Z-Image）按约 1MP 的表出，SDXL 系沿用通用尺寸。
  if (!isDitArchitecture(architecture))
    return getStandardImageDimensions(aspectRatio)
  switch (aspectRatio) {
    case '16:9':
      return { width: 1344, height: 768 }
    case '9:16':
      return { width: 768, height: 1344 }
    case '4:3':
      return { width: 1152, height: 864 }
    case '3:4':
      return { width: 864, height: 1152 }
    default:
      return { width: 1024, height: 1024 }
  }
}

export function getRunnerDimensions(
  advancedParams: Record<string, unknown>,
  aspectRatio: string,
  architecture: RunnerArchitecture,
): { width: number; height: number } {
  const width = readNumberField(advancedParams, 'runnerWidth')
  const height = readNumberField(advancedParams, 'runnerHeight')
  if (width == null && height == null) {
    return getRunnerDefaultDimensions(aspectRatio, architecture)
  }
  // Anima 沿用 1536 的上限；Z-Image 与 SDXL 到 2048。
  const max = architecture === 'anima' ? 1536 : 2048
  if (
    width == null ||
    height == null ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width % 8 !== 0 ||
    height % 8 !== 0 ||
    width < 512 ||
    height < 512 ||
    width > max ||
    height > max
  ) {
    throw new WorkerProviderError({
      message: `Runner dimensions must be multiples of 8 between 512 and ${max}.`,
      provider: 'runner',
      phase: 'request_validation',
    })
  }
  return { width, height }
}

export function readRunnerSampling(advancedParams: Record<string, unknown>): {
  sampler?: RunnerSampler
  scheduler?: RunnerScheduler
} {
  const sampler = readStringField(advancedParams, 'runnerSampler')
  const scheduler = readStringField(advancedParams, 'runnerScheduler')
  if (sampler && !isRunnerSampler(sampler)) {
    throw new WorkerProviderError({
      message: `Unsupported Runner sampler: ${sampler}`,
      provider: 'runner',
      phase: 'request_validation',
    })
  }
  if (scheduler && !isRunnerScheduler(scheduler)) {
    throw new WorkerProviderError({
      message: `Unsupported Runner scheduler: ${scheduler}`,
      provider: 'runner',
      phase: 'request_validation',
    })
  }
  return {
    sampler: sampler as RunnerSampler | undefined,
    scheduler: scheduler as RunnerScheduler | undefined,
  }
}

export function readRunnerUpscaler(advancedParams: Record<string, unknown>) {
  const value = readStringField(advancedParams, 'runnerUpscaler')
  if (!value) return null
  if (!isRunnerUpscaler(value)) {
    throw new WorkerProviderError({
      message: `Unsupported Runner upscaler: ${value}`,
      provider: 'runner',
      phase: 'request_validation',
    })
  }
  return RUNNER_UPSCALER_MANIFEST[value]
}

/**
 * Builds the ComfyUI workflow via the pure recipe→workflow mapping, then
 * POSTs it to the Modal runner's `/run`. Unlike Replicate/fal, the runner has
 * no BYOK path (the Worker authenticates with its own RUNNER_MODAL_TOKEN) and
 * no per-request model lookup call — the checkpoint/LoRA manifest is fully static (providers/runner/
 * checkpoints.ts), so this is a single request.
 */
export async function submitRunnerImageJob(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
): Promise<RunnerSubmitResult> {
  const qwen = isQwenRunnerContext(context)

  const advancedParams = readAdvancedRecord(context)
  const runnerLoras = getRunnerLoraSpecs(context)
  const runnerCheckpoint = getRunnerCheckpointSpec(context)
  // v4：底模架构由 manifest 条目决定（anima-dit 底模 → Anima DiT 工作流）。即便走
  // T1 override（用下载的精确 Anima checkpoint），externalModelId 仍是 anima 家族的
  // manifest id，据此选 Anima 工作流。缺省 sdxl。
  const architecture =
    getRunnerCheckpointById(context.providerInput.externalModelId)
      ?.architecture ?? 'sdxl'
  const dimensions = getRunnerDimensions(
    advancedParams,
    context.providerInput.aspectRatio,
    architecture,
  )
  const sampling = readRunnerSampling(advancedParams)
  const upscaler = readRunnerUpscaler(advancedParams)
  const hires = resolveRunnerHires(
    advancedParams.runnerHires,
    dimensions.width,
    dimensions.height,
    architecture,
  )

  // img2img: when the request carries a reference image (base-model capability
  // maxReferenceImages > 0), hand the runner the R2 URL via `input.images_to_fetch`
  // and map referenceStrength → KSampler denoise with the same inversion the
  // fal/replicate paths use. No reference → txt2img (workflow-builder default).
  //
  // ⚠ 别改回「在这里 base64」：这个 Worker 只有 128MB 内存，整张图转 base64 会把它
  // 撑爆；就算侥幸编完，膨胀 4/3 后的请求体也会大得离谱（RunPod 时期就撞过 /run 的 10MiB 上限）。一张
  // ~8MB 的参考图正好卡在两堵墙之间（2026-08-24 同一张图连点两次分别撞上了两者）。
  // fork 侧 `ensure_input_images` 负责拉图并就地 base64——那台机器内存以 GB 计。
  // 契约见 workers/runner-comfyui-fork/README.md。
  const allReferences = getImageReferenceInputs(context)
  const referenceImage = allReferences[0]
  const RUNNER_REFERENCE_IMAGE_NAME = 'reference.png'
  let referenceImagesToFetch:
    | Array<{ name: string; url: string; source: 'r2' }>
    | undefined
  let referenceImageName: string | undefined
  let referenceDenoise: number | undefined
  if (referenceImage) {
    referenceImageName = RUNNER_REFERENCE_IMAGE_NAME
    referenceDenoise = invertReferenceStrength(
      readNumberField(advancedParams, 'referenceStrength') ?? 0.7,
    )
    referenceImagesToFetch = [
      {
        name: RUNNER_REFERENCE_IMAGE_NAME,
        url: referenceImage,
        source: 'r2',
      },
    ]
  }
  if (qwen) {
    referenceImagesToFetch = allReferences.map((url, index) => ({
      name: `reference-${index + 1}.png`,
      url,
      source: 'r2' as const,
    }))
    if (runnerLoras.length || runnerCheckpoint || hires || upscaler)
      throw new Error('Qwen evaluation does not support SDXL recipe modifiers.')
  }

  let workflow: ReturnType<typeof buildRunnerWorkflowFromRequest>
  try {
    workflow = qwen
      ? buildQwenImage21Workflow({
          prompt: context.providerInput.prompt,
          negativePrompt:
            readStringField(advancedParams, 'negativePrompt') ?? undefined,
          ...dimensions,
          seed: readRunnerSeed(advancedParams) ?? randomUint32(),
          // Turbo 固定 CFG 1：旧草稿里残留的 guidanceScale / steps 不再传，免得烧色。
          referenceImageNames:
            referenceImagesToFetch?.map((image) => image.name) ?? [],
        })
      : buildRunnerWorkflowFromRequest(
          {
            externalModelId: context.providerInput.externalModelId,
            prompt: context.providerInput.prompt,
            negativePrompt:
              readStringField(advancedParams, 'negativePrompt') ?? undefined,
            width: dimensions.width,
            height: dimensions.height,
            seed: readRunnerSeed(advancedParams),
            steps:
              readPositiveNumberField(advancedParams, 'steps') ?? undefined,
            cfg: readNumberField(advancedParams, 'guidanceScale') ?? undefined,
            sampler: sampling.sampler,
            scheduler: sampling.scheduler,
            loras: runnerLoras.map((lora) => ({
              filename: lora.filename,
              scale: lora.scale,
            })),
            checkpointOverrideFilename: runnerCheckpoint?.filename,
            checkpointOverrideDefaultsId:
              runnerCheckpoint?.defaultsCheckpointId,
            architecture,
            referenceImageName,
            denoise: referenceDenoise,
            upscalerModelFilename: upscaler?.filename,
            hires,
          },
          randomUint32,
        )
  } catch (error) {
    if (error instanceof RunnerUnknownCheckpointError) {
      throw new WorkerProviderError({
        message: error.message,
        provider: 'runner',
        phase: 'workflow_build',
        errorCode: 'model_unavailable',
      })
    }
    throw error
  }

  // v2：fork worker 据此在跑前把每把 LoRA 从 R2 拉到 models/loras/（缺则下、有则
  // 跳）。source 限 'r2'（fork 侧只认我们的预签名链，防 SSRF）。
  const lorasToFetch = runnerLoras.map((lora) => ({
    filename: lora.filename,
    url: lora.downloadUrl,
    source: 'r2' as const,
  }))

  const runnerInput: Record<string, unknown> = { workflow }
  if (referenceImagesToFetch)
    runnerInput.images_to_fetch = referenceImagesToFetch
  if (lorasToFetch.length > 0) runnerInput.loras_to_fetch = lorasToFetch
  // v3 T1：fork GPU 侧据此从 Civitai 直下底模到 models/checkpoints/（缺则下、有则跳）。
  // url 不带 token（不进 job 载荷）——fork 用自己的 CIVITAI_KEY secret 加鉴权，公开
  // 底模匿名也能下。source 限 'civitai'（fork 侧域白名单，防 SSRF）。
  if (runnerCheckpoint) {
    runnerInput.checkpoint_to_fetch = {
      filename: runnerCheckpoint.filename,
      url: runnerCheckpoint.downloadUrl,
      source: 'civitai' as const,
      // v4：Anima DiT 底模落 models/diffusion_models/（缺省 checkpoints）。
      ...(runnerCheckpoint.targetDir
        ? { target_dir: runnerCheckpoint.targetDir }
        : {}),
      // v9：Civitai 公布的 SHA-256，fork 落盘前核对。
      ...(runnerCheckpoint.sha256 ? { sha256: runnerCheckpoint.sha256 } : {}),
    }
  }
  // v4：DiT 作业带上共享配件（文本编码器 / VAE），fork 首次从 HF 拉入卷后缓存。
  // 无 per-recipe 精确底模时再加清单里那一档到 models/unet/。
  if (isDitArchitecture(architecture)) {
    const companions = RUNNER_DIT_COMPANIONS[architecture]
    const checkpointCompanion = runnerCheckpoint
      ? null
      : companions.checkpoints[context.providerInput.externalModelId]
    if (!runnerCheckpoint && !checkpointCompanion) {
      throw new WorkerProviderError({
        message: `No DiT companion for Runner checkpoint: ${context.providerInput.externalModelId}`,
        provider: 'runner',
        phase: 'workflow_build',
        errorCode: 'model_unavailable',
      })
    }
    runnerInput.companions_to_fetch = checkpointCompanion
      ? [...companions.shared, checkpointCompanion]
      : companions.shared
  }
  if (upscaler) {
    runnerInput.upscaler_to_fetch = {
      filename: upscaler.filename,
      url: upscaler.downloadUrl,
      source: 'huggingface' as const,
      sha256: upscaler.sha256,
      size_bytes: upscaler.sizeBytes,
    }
  }

  // Modal 侧的单次时限（600s）就是没人再管的作业的兜底。
  const response = await modalRunnerRequest(env, '/run', {
    method: 'POST',
    body: { input: runnerInput, target: qwen ? 'qwen' : 'main' },
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'runner',
      phase: 'submit',
      fallbackMessage: `Runner submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const id = readStringField(data, 'id')
  if (!id) {
    throw new Error('Runner submit response did not include a job id.')
  }
  await reportProviderJobId(env, context, id)
  await reportExecutionStage(
    env,
    context,
    EXECUTION_PROGRESS_STAGES.RUNNER_QUEUED,
  )
  const outputScale = upscaler?.scale ?? 1
  return {
    id,
    width: (hires?.width ?? dimensions.width) * outputScale,
    height: (hires?.height ?? dimensions.height) * outputScale,
  }
}

export type RunnerPollStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'

/** Qwen-Image 2.1 评估走 Modal 的 `qwen` 目标，工作流与出图尺寸读法都不同。 */
export function isQwenRunnerContext(context: WorkerImageRunContext): boolean {
  return context.providerInput.externalModelId === QWEN_IMAGE_21_MODEL
}

export type RunnerPollResult =
  | { status: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { status: 'FAILED'; error: string }
  | {
      status: 'COMPLETED'
      imageBase64: string
      runnerExecution?: RunnerModelEvidence
    }

export function normalizeRunnerStatus(raw: string): RunnerPollStatus {
  const normalized = raw.toUpperCase()
  if (normalized === 'COMPLETED') return 'COMPLETED'
  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS'
  if (
    normalized === 'FAILED' ||
    normalized === 'CANCELLED' ||
    normalized === 'TIMED_OUT'
  ) {
    return 'FAILED'
  }
  return 'IN_QUEUE'
}

export async function pollRunnerImageJob(
  jobId: string,
  env: ExecutionEnv,
): Promise<RunnerPollResult> {
  const response = await modalRunnerRequest(env, `/status/${jobId}`)

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'runner',
      phase: 'status_poll',
      fallbackMessage: `Runner poll failed with status ${response.status}`,
      requestId: jobId,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const status = normalizeRunnerStatus(readStringField(data, 'status') ?? '')

  if (status === 'FAILED') {
    const errorField = data.error
    return {
      status: 'FAILED',
      // 两种都截到 500 字：这个结果会进 Workflow 步骤输出（上限 1MiB），
      // ComfyUI 的 traceback 原话可能很长。
      error: (typeof errorField === 'string'
        ? errorField
        : JSON.stringify(errorField ?? 'Unknown runner failure')
      ).slice(0, 500),
    }
  }

  if (status !== 'COMPLETED') return { status }

  const output = isRecord(data.output) ? data.output : null
  const images = output && Array.isArray(output.images) ? output.images : []
  const firstImage = images.find(isRecord)
  const imageBase64 = firstImage ? readStringField(firstImage, 'data') : null

  if (!imageBase64) {
    return {
      status: 'FAILED',
      error: 'Runner output did not include image data.',
    }
  }

  const runnerExecution = parseRunnerModelEvidence(output?.runnerExecution)
  return {
    status: 'COMPLETED',
    imageBase64,
    ...(runnerExecution ? { runnerExecution } : {}),
  }
}

/**
 * Best-effort cancel：工作流停止轮询（窗口耗尽）时把 Modal 侧作业撤掉，
 * 不留孤儿。失败静默——调用方正在抛真正的错误，取消失败还有 Modal 单次
 * 时限兜底。也被 `/cancel` 路由（用户主动取消）复用，那边关心结果，
 * 所以返回是否成功而不是吞掉。
 */
export async function cancelRunnerImageJob(
  jobId: string,
  env: ExecutionEnv,
): Promise<boolean> {
  try {
    const response = await modalRunnerRequest(env, `/cancel/${jobId}`, {
      method: 'POST',
    })
    return response.ok
  } catch {
    // 主错误由调用方抛出；这里只是队列卫生。
    return false
  }
}

export async function pollAndPersistRunnerImageJob(
  jobId: string,
  env: ExecutionEnv,
  imageR2Key: string,
  qwen: boolean,
): Promise<PersistedRunnerPollResult> {
  const pollResult = await pollRunnerImageJob(jobId, env)
  if (pollResult.status !== 'COMPLETED') return pollResult

  const imageBytes = base64ToBytes(pollResult.imageBase64)
  if (pollResult.runnerExecution) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new Uint8Array(imageBytes),
    )
    const actualHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    if (actualHash !== pollResult.runnerExecution.imageSha256)
      throw new Error('Runner model evidence does not match image bytes')
  }
  const uploaded = await uploadImageBytesToKey(
    env,
    imageBytes,
    'image/png',
    imageR2Key,
  )

  return {
    status: 'COMPLETED',
    ...uploaded,
    ...(qwen ? readQwenPngDimensions(imageBytes) : {}),
    ...(pollResult.runnerExecution
      ? { runnerExecution: pollResult.runnerExecution }
      : {}),
  }
}

// ─── Comfy Runner (ComfyUI on Modal) ─────────────────────────────────────

export interface RunnerSubmitResult {
  id: string
  width: number
  height: number
}

export type PersistedRunnerPollResult =
  | { status: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { status: 'FAILED'; error: string }
  | {
      status: 'COMPLETED'
      artifactUrl: string
      imageR2Key: string
      mimeType: string
      width?: number
      height?: number
      runnerExecution?: RunnerModelEvidence
    }

export type CompletedPersistedRunnerPollResult = Extract<
  PersistedRunnerPollResult,
  { status: 'COMPLETED' }
>

export const runnerImageDriver: MultiStepImageDriver<
  RunnerSubmitResult,
  PersistedRunnerPollResult,
  CompletedPersistedRunnerPollResult
> = {
  stepNames: imageStepNames('runner'),
  submitStep: {
    retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
    timeout: '30 seconds',
  },
  pollStep: { retries: RETRY_TWICE, timeout: '30 seconds' },
  // Runner 用平台自己的 Modal 入口，不解密用户 key。
  submit: ({ env, context }) => submitRunnerImageJob(context, env),
  // A completed runner response contains the full image as base64.
  // Persist it before this step returns so Workflow state only stores
  // the compact R2 reference (non-stream step results are capped at 1 MiB).
  poll: ({ env, context }, submitted) =>
    pollAndPersistRunnerImageJob(
      submitted.id,
      env,
      getWorkerImageOutputKey(context),
      isQwenRunnerContext(context),
    ),
  readPoll(polled, submitted, context) {
    if (polled.status === 'FAILED') {
      throw new WorkerProviderError({
        message: `Runner image generation failed: ${polled.error ?? 'unknown'}`,
        provider: context.providerId,
        phase: 'status_poll',
        requestId: submitted.id,
      })
    }
    if (polled.status === 'COMPLETED') return { state: 'done', value: polled }
    return { state: 'pending', running: polled.status === 'IN_PROGRESS' }
  },
  runningStage: EXECUTION_PROGRESS_STAGES.RUNNER_RUNNING,
  cancelOnTimeout: async (env, submitted) => {
    await cancelRunnerImageJob(submitted.id, env)
  },
  timeoutError: () =>
    new Error(
      'Runner image generation timed out (cold start can take 150s+ on the first request after idle — try again).',
    ),
  toResult: (submitted, completed) => ({
    artifactUrl: completed.artifactUrl,
    imageR2Key: completed.imageR2Key,
    mimeType: completed.mimeType,
    width: completed.width ?? submitted.width,
    height: completed.height ?? submitted.height,
    providerMetadata: {
      runnerJobId: submitted.id,
      ...(completed.runnerExecution
        ? { runnerExecution: completed.runnerExecution }
        : {}),
    },
  }),
}
