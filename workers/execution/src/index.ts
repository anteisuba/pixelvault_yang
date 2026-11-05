export {
  computeTieredDimensions,
  isImageResolutionTier,
  tieredOpenAISize,
} from '../../../src/lib/image-output-size'
import {
  createSignedRequestHeaders,
  emitRunResultCallback,
  hexToBytes,
  postSignedJson,
  resolveRunApiKey,
  signBody,
  timingSafeEqualHex,
  toHex,
  verifySignedBody,
} from './lib/app-bridge'

export {
  createSignedRequestHeaders,
  hexToBytes,
  signBody,
  timingSafeEqualHex,
  toHex,
  verifySignedBody,
}
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { bytesToBase64 } from './lib/bytes'
import {
  isRecord,
  readBooleanField,
  readNumberField,
  readPositiveNumberField,
  readStringArrayField,
  readStringField,
} from './lib/fields'
import { getImageReferenceInputs } from './lib/image-io'
import { generateNovelAiImage } from './providers/novelai/image'

export {
  bytesToBase64,
  generateNovelAiImage,
  getImageReferenceInputs,
  isRecord,
  readBooleanField,
  readNumberField,
  readPositiveNumberField,
  readStringArrayField,
  readStringField,
}
import type {
  Workflow,
  WorkflowEvent,
  WorkflowInstance,
  WorkflowStep,
} from 'cloudflare:workers'

import {
  WORKER_GENERATION_ERROR_CODES,
  WorkerProviderError,
  WorkerStepFailure,
  buildWorkerFailureCallbackData,
  createProviderNoOutputError,
  createProviderPayloadError,
  createProviderResponseError,
} from './lib/provider-error'
import { guardWorkflowStep } from './lib/step-failure'
import { suffixStepNames } from './lib/step-rounds'
import {
  isMiniMaxProviderId,
  miniMaxBaseUrl,
} from './providers/minimax/video-request-builder'
import {
  isVolcEngineProviderId,
  VOLCENGINE_DEFAULT_BASE_URL,
} from './providers/volcengine/video-request-builder'
import { JSON_CONTENT_TYPE } from './lib/http'
import { base64ToBytes } from './lib/bytes'
import { reportExecutionStage, reportProviderJobId } from './lib/app-bridge'
import { isFalQueueFailureStatus } from './providers/fal/queue'
import { REPLICATE_BASE_URL } from './providers/replicate/api'
import { modalRunnerRequest } from './providers/runner/modal'
import { generateOpenAIImage } from './providers/openai/image'
import {
  GEMINI_SEARCH_GROUNDING_TOOL,
  type WorkerSearchGroundingResult,
  type WorkerSearchGroundingSource,
  buildGeminiImageParts,
  buildGeminiImageRequestBody,
  generateGeminiImage,
  readGeminiSearchGrounding,
  tieredGeminiDimensions,
} from './providers/gemini/image'
import {
  generateVolcEngineImage,
  volcEngine4KSize,
} from './providers/volcengine/image'
import { generatePixAiImage } from './providers/pixai/image'
import {
  buildFalImageInput,
  resolveFalImageModelId,
  submitFalImageQueue,
} from './providers/fal/image'
import {
  pollIdeogramImageQueue,
  submitIdeogramImageQueue,
} from './providers/ideogram/image'
import { submitReplicateImagePrediction } from './providers/replicate/image'
import {
  cancelRunnerImageJob,
  pollAndPersistRunnerImageJob,
  submitRunnerImageJob,
} from './providers/runner/image'
import { type FalImageResult } from './providers/fal/image'
import { type ReplicatePrediction } from './providers/replicate/image'
import {
  type PersistedRunnerPollResult,
  type RunnerSubmitResult,
} from './providers/runner/image'
import {
  getMultiStepImageDriver,
  getSingleStepImageDriver,
} from './providers/image-drivers'
import { submitFalQueue } from './providers/fal/queue'
import { submitMiniMaxQueue } from './providers/minimax/video'
import { submitVolcEngineQueue } from './providers/volcengine/video'
import {
  pollGeminiVideoQueue,
  submitGeminiVideoQueue,
} from './providers/gemini/video'
import { submitFishAudio } from './providers/fish-audio/audio'
import {
  downloadAndUploadRodinGlb,
  pollRodinJob,
  submitRodinJob,
  submitRodinTextureOnlyJob,
} from './providers/hyper3d-rodin/model-3d'
import {
  readFalModel3DResult,
  submitFalModel3DQueue,
} from './providers/fal/model-3d'
import { downloadAndUploadModel3DArtifact } from './lib/media-io'
import { handleImageDerivatives } from './lib/image-derivatives'

export { submitFalModel3DQueue }

export { pollGeminiVideoQueue, submitGeminiVideoQueue }

export { submitVolcEngineQueue }

export { submitMiniMaxQueue }

export { submitFalQueue }

import { buildQueueMediaDriver } from './providers/queue-drivers'
import { runLogFields } from './lib/log'
import { runMultiStepDriver } from './providers/multi-step'
export { getMultiStepImageDriver, getSingleStepImageDriver }

export { type PersistedRunnerPollResult, type RunnerSubmitResult }

export { type ReplicatePrediction }

export { type FalImageResult }

export { pollAndPersistRunnerImageJob, submitRunnerImageJob }

export { submitReplicateImagePrediction }

export { pollIdeogramImageQueue, submitIdeogramImageQueue }

export { buildFalImageInput, resolveFalImageModelId, submitFalImageQueue }

export { generatePixAiImage }

export { generateVolcEngineImage, volcEngine4KSize }

export {
  GEMINI_SEARCH_GROUNDING_TOOL,
  type WorkerSearchGroundingResult,
  type WorkerSearchGroundingSource,
  buildGeminiImageParts,
  buildGeminiImageRequestBody,
  generateGeminiImage,
  readGeminiSearchGrounding,
  tieredGeminiDimensions,
}

export { generateOpenAIImage }

export { reportExecutionStage, reportProviderJobId }

const HEALTH_PATH = '/health'
const ECHO_PATH = '/echo'
const CINEMATIC_SHORT_VIDEO_PATH = '/workflows/cinematic-short-video'
const FAL_QUEUE_PATH = '/workflows/fal-queue'
const HYPER3D_RODIN_PATH = '/workflows/hyper3d-rodin'
const HUNYUAN3D_PATH = '/workflows/hunyuan3d'
const CALLBACK_KINDS = ['ping', 'status', 'result'] as const
const QUEUE_WORKFLOW_IDS = ['CINEMATIC_SHORT_VIDEO', 'FAL_QUEUE'] as const
const HYPER3D_RODIN_WORKFLOW_ID = 'HYPER3D_RODIN'
const HUNYUAN3D_WORKFLOW_ID = 'HUNYUAN3D'
const IMAGE_QUEUE_PATH = '/workflows/image-queue'
const IMAGE_QUEUE_WORKFLOW_ID = 'IMAGE_QUEUE'
/** Best-effort cancel: app → worker. Mirrors `EXECUTION_WORKER.CANCEL_PATH`. */
const CANCEL_PATH = '/cancel'
/** 助手 LLM 调用日志：app → worker。Mirrors `EXECUTION_WORKER.LLM_CALL_LOG_PATH`. */
const LLM_CALL_LOG_PATH = '/logs/llm-call'
/** 认图（PixAI Tagger）：app → worker → Modal `/tag`。Mirrors `EXECUTION_WORKER.TAG_IMAGE_PATH`. */
const TAG_IMAGE_PATH = '/tag-image'
/** 出图后的小图：app → worker（Images 绑定）→ R2。Mirrors `EXECUTION_WORKER.IMAGE_DERIVATIVES_PATH`. */
const IMAGE_DERIVATIVES_PATH = '/image-derivatives'
/** 一行日志最多这么多字段；字段值只收原始类型，⛔ 不收对象和长文。 */
const LLM_CALL_LOG_MAX_FIELDS = 24
const LLM_CALL_LOG_MAX_STRING = 120
/**
 * Mirrors `EXECUTION_INTERNAL.RESOLVE_KEY_PATH` in `src/constants/execution.ts`.
 * The worker bundle can't import from `src/` (separate build), so this is a
 * documented literal copy — keep the two in sync if that path ever moves.
 */
const RESOLVE_KEY_PATH = '/api/internal/execution/resolve-key'

type CallbackKind = (typeof CALLBACK_KINDS)[number]
type WorkerWorkflowId = (typeof QUEUE_WORKFLOW_IDS)[number]

interface R2Bucket {
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>
    size: number
    httpMetadata?: { contentType?: string }
  } | null>
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string }
    },
  ): Promise<{ key: string }>
}

export interface ExecutionEnv {
  INTERNAL_CALLBACK_URL?: string
  INTERNAL_CALLBACK_SECRET?: string
  /**
   * Base64-encoded 32-byte secret used to AES-GCM encrypt user API keys
   * before they're returned from a step.do and persisted in workflow state.
   * Required for MODEL_3D workflows. Generate with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   * Set via: npx wrangler secret put STATE_ENCRYPTION_KEY
   */
  STATE_ENCRYPTION_KEY?: string
  /** Comfy Runner 的 Modal 入口（`workers/runner-modal`）。 */
  RUNNER_MODAL_URL?: string
  /** wrangler secret；与 Modal Secret `pixelvault-runner-token` 同值。 */
  RUNNER_MODAL_TOKEN?: string
  CINEMATIC_SHORT_VIDEO_WORKFLOW: Workflow<WorkerRunContext>
  HYPER3D_RODIN_WORKFLOW: Workflow<WorkerModel3DRunContext>
  HUNYUAN3D_WORKFLOW: Workflow<WorkerModel3DRunContext>
  IMAGE_QUEUE_WORKFLOW: Workflow<WorkerImageRunContext>
  GENERATION_BUCKET: R2Bucket
  R2_PUBLIC_URL: string
  /** Cloudflare Images 绑定（wrangler.jsonc `images`），做缩略图 / 预览图 / 视频海报。 */
  IMAGES?: ImagesBinding
}

interface ExecutionCallbackPayload {
  runId: string
  kind: CallbackKind
  ts: string
  data?: unknown
}

interface WorkerRunContextBase {
  runId: string
  workflowId: WorkerWorkflowId
  providerId: string
  apiKeyId?: string
  useSystemKey?: boolean
  callbackUrl: string
  resolveKeyUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
}

export interface WorkerVideoRunContext extends WorkerRunContextBase {
  outputType: 'VIDEO'
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
    /** Either a number of seconds, or 'auto' (Seedance-only literal). */
    duration?: number | 'auto'
    referenceImage?: string
    /**
     * Multi-reference URLs for endpoints whose fal API takes `image_urls`
     * (Veo 3.1 reference-to-video, Seedance 2.0 reference-to-video).
     */
    referenceImages?: string[]
    /** Reference audio clips for Seedance reference-to-video voice cloning. */
    audioUrls?: string[]
    /**
     * Per-clip binding labels (character name per URL) for Seedance Reference.
     * When present the worker builder emits "{Name} (@AudioN)" prompt tokens.
     */
    audioBindings?: Array<{ url: string; characterName?: string }>
    /** Reference video clips for Seedance reference-to-video. */
    videoUrls?: string[]
    negativePrompt?: string
    generateAudio?: boolean
    seed?: number
    resolution?: string
    i2vModelId?: string
    videoDefaults?: Record<string, unknown>
    providerBaseUrl?: string
    outputStorageKey?: string
    width: number
    height: number
  }
}

export interface WorkerAudioRunContext extends WorkerRunContextBase {
  outputType: 'AUDIO'
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    referenceAudioUrl?: string
    referenceText?: string
    voiceId?: string
    speakerVoiceIds?: string[]
    speed?: number
    volume?: number
    normalizeLoudness?: boolean
    normalizeText?: boolean
    withTimestamps?: boolean
    format?: string
    sampleRate?: number
    mp3Bitrate?: number
    opusBitrate?: number
    latency?: string
    temperature?: number
    topP?: number
    chunkLength?: number
    repetitionPenalty?: number
    providerBaseUrl?: string
    outputStorageKey?: string
  }
}

export type WorkerRunContext = WorkerVideoRunContext | WorkerAudioRunContext

export interface WorkerImageRunContext {
  runId: string
  workflowId: typeof IMAGE_QUEUE_WORKFLOW_ID
  outputType: 'IMAGE'
  providerId: string
  apiKeyId?: string
  useSystemKey?: boolean
  callbackUrl: string
  resolveKeyUrl: string
  /** 按账号排队：出图前来这里问轮到没有。旧版 app 不带 = 不排队。 */
  slotUrl?: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    aspectRatio: string
    imageOperation?: 'precise-edit'
    referenceImage?: string
    referenceImages?: string[]
    /**
     * 与 `referenceImages` 逐位对齐的说明（卡片总线图例，进度表 35 ⑥）；`null` =
     * 这张图没有说明。只有 Gemini 读：说明作为文字紧贴在那张图前面。
     */
    referenceImageLabels?: (string | null)[]
    advancedParams?: Record<string, unknown>
    /**
     * Station base URL for adapters shared across two regional deployments
     * (火山 Ark 国内站 vs BytePlus ModelArk 国际站). Absent for every other
     * image provider, which keeps its own hardcoded host.
     */
    providerBaseUrl?: string
    outputStorageKey?: string
    /**
     * OpenAI `safety_identifier`：app 侧已哈希好的稳定匿名用户标识（≤128 字），
     * 只有声明支持的 OpenAI 图像模型才带。worker 原样转发，不再加工。
     */
    safetyIdentifier?: string
  }
}

export interface WorkerModel3DRunContext {
  runId: string
  workflowId: typeof HYPER3D_RODIN_WORKFLOW_ID | typeof HUNYUAN3D_WORKFLOW_ID
  outputType: 'MODEL_3D'
  providerId: string
  apiKeyId?: string
  useSystemKey?: boolean
  callbackUrl: string
  resolveKeyUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
  providerInput: {
    imageUrl?: string
    modelId: string
    externalModelId: string
    seed?: number
    tier?: string
    meshMode?: string
    quality?: string
    textureMode?: string
    material?: string
    highPack?: boolean
    taPose?: boolean
    hdTexture?: boolean
    textureDelight?: boolean
    qualityOverride?: number
    bboxCondition?: unknown
    additionalImageUrls?: string[]
    geometryInstructMode?: string
    geometryFileFormat?: string
    prompt?: string
    useOriginalAlpha?: boolean
    previewRender?: boolean
    isMicro?: boolean
    enablePbr?: boolean
    faceCount?: number
    multiViewImages?: Record<string, string>
    removeBackground?: boolean
    octreeResolution?: number
    generateType?: string
    polygonType?: string
    /**
     * Rodin texture-only continuation: when true, dispatch to
     * /api/v2/rodin_texture_only instead of /api/v2/rodin. Uses
     * `parentMeshUrl` as the input mesh and `imageUrl` as the texture
     * reference. Preserves the exact mesh geometry from the parent job.
     */
    rodinTextureOnly?: boolean
    /** R2 URL of the GLB to be textured (from a prior mesh-only Rodin job). */
    parentMeshUrl?: string
  }
}

export interface FalQueueSubmitResult {
  requestId: string
  statusUrl: string
  responseUrl: string
}

export interface FalQueueStatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  artifactUrl?: string
  thumbnailUrl?: string
  mimeType?: string
  /** Actual seed the provider used (fal output schema returns it) — for the
   *  reproducibility loop. Written back to Generation.seed via the callback. */
  seed?: number
  error?: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', JSON_CONTENT_TYPE)

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  })
}

function readCallbackKind(value: Record<string, unknown>): CallbackKind {
  const kind = value.kind
  return isCallbackKind(kind) ? kind : 'ping'
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export function isCallbackKind(value: unknown): value is CallbackKind {
  return CALLBACK_KINDS.some((candidate) => candidate === value)
}

export function isWorkerWorkflowId(value: unknown): value is WorkerWorkflowId {
  return QUEUE_WORKFLOW_IDS.some((candidate) => candidate === value)
}

function buildCallbackPayload(input: unknown): ExecutionCallbackPayload {
  if (!isRecord(input)) {
    return {
      runId: crypto.randomUUID(),
      kind: 'ping',
      ts: new Date().toISOString(),
      data: input,
    }
  }

  return {
    runId: readStringField(input, 'runId') ?? crypto.randomUUID(),
    kind: readCallbackKind(input),
    ts: new Date().toISOString(),
    data: input,
  }
}

function readRequiredCallbackEnv(env: ExecutionEnv) {
  if (!env.INTERNAL_CALLBACK_URL || !env.INTERNAL_CALLBACK_SECRET) {
    return null
  }

  return {
    callbackUrl: env.INTERNAL_CALLBACK_URL,
    callbackSecret: env.INTERNAL_CALLBACK_SECRET,
  }
}

function readRequiredSecret(env: ExecutionEnv): string | null {
  return env.INTERNAL_CALLBACK_SECRET ?? null
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({ ok: true, ts: new Date().toISOString() })
}

async function handleEcho(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const configuredEnv = readRequiredCallbackEnv(env)

  if (!configuredEnv) {
    return jsonResponse(
      { ok: false, error: 'Internal callback environment is not configured.' },
      { status: 500 },
    )
  }

  const input = await readJson(request)
  const callbackPayload = buildCallbackPayload(input)

  try {
    const callbackResponse = await postSignedJson(
      configuredEnv.callbackUrl,
      configuredEnv.callbackSecret,
      callbackPayload,
    )

    return jsonResponse({
      ok: callbackResponse.ok,
      callbackStatus: callbackResponse.status,
      runId: callbackPayload.runId,
    })
  } catch {
    return jsonResponse(
      { ok: false, error: 'Internal callback request failed.' },
      { status: 502 },
    )
  }
}

export function parseWorkerRunContext(input: unknown): WorkerRunContext | null {
  if (!isRecord(input)) return null
  const providerInput = input.providerInput
  if (!isRecord(providerInput)) return null

  const runId = readStringField(input, 'runId')
  const workflowId = readStringField(input, 'workflowId')
  const outputType = readStringField(input, 'outputType')
  const providerId = readStringField(input, 'providerId')
  const apiKeyId = readStringField(input, 'apiKeyId') ?? undefined
  const useSystemKey = readBooleanField(input, 'useSystemKey') ?? undefined
  const callbackUrl = readStringField(input, 'callbackUrl')
  const resolveKeyUrl = readStringField(input, 'resolveKeyUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')
  const prompt = readStringField(providerInput, 'prompt')
  const modelId = readStringField(providerInput, 'modelId')
  const externalModelId = readStringField(providerInput, 'externalModelId')

  if (
    !runId ||
    !isWorkerWorkflowId(workflowId) ||
    !providerId ||
    (!apiKeyId && !useSystemKey) ||
    !callbackUrl ||
    !resolveKeyUrl ||
    !timeoutMs ||
    !maxAttempts ||
    !pollIntervalMs ||
    !prompt ||
    !modelId ||
    !externalModelId
  ) {
    return null
  }

  if (outputType === 'AUDIO') {
    const referenceAudioUrl = readStringField(
      providerInput,
      'referenceAudioUrl',
    )
    const speakerVoiceIds = readStringArrayField(
      providerInput,
      'speakerVoiceIds',
    )
    const voiceId = readStringField(providerInput, 'voiceId') ?? undefined

    if (providerId === 'fal' && !referenceAudioUrl) return null
    if (
      providerId === 'fish_audio' &&
      !voiceId &&
      !speakerVoiceIds &&
      !(referenceAudioUrl && readStringField(providerInput, 'referenceText'))
    ) {
      return null
    }

    return {
      runId,
      workflowId,
      outputType,
      providerId,
      apiKeyId,
      useSystemKey,
      callbackUrl,
      resolveKeyUrl,
      timeoutMs,
      maxAttempts,
      pollIntervalMs,
      providerInput: {
        prompt,
        modelId,
        externalModelId,
        referenceAudioUrl: referenceAudioUrl ?? undefined,
        referenceText:
          readStringField(providerInput, 'referenceText') ?? undefined,
        voiceId,
        speakerVoiceIds,
        speed: readPositiveNumberField(providerInput, 'speed') ?? undefined,
        volume: readNumberField(providerInput, 'volume') ?? undefined,
        normalizeLoudness:
          readBooleanField(providerInput, 'normalizeLoudness') ?? undefined,
        normalizeText:
          readBooleanField(providerInput, 'normalizeText') ?? undefined,
        withTimestamps:
          readBooleanField(providerInput, 'withTimestamps') ?? undefined,
        format: readStringField(providerInput, 'format') ?? undefined,
        sampleRate:
          readPositiveNumberField(providerInput, 'sampleRate') ?? undefined,
        mp3Bitrate:
          readPositiveNumberField(providerInput, 'mp3Bitrate') ?? undefined,
        opusBitrate:
          readPositiveNumberField(providerInput, 'opusBitrate') ?? undefined,
        latency: readStringField(providerInput, 'latency') ?? undefined,
        temperature: readNumberField(providerInput, 'temperature') ?? undefined,
        topP: readNumberField(providerInput, 'topP') ?? undefined,
        chunkLength:
          readPositiveNumberField(providerInput, 'chunkLength') ?? undefined,
        repetitionPenalty:
          readPositiveNumberField(providerInput, 'repetitionPenalty') ??
          undefined,
        providerBaseUrl:
          readStringField(providerInput, 'providerBaseUrl') ?? undefined,
        outputStorageKey:
          readStringField(providerInput, 'outputStorageKey') ?? undefined,
      },
    }
  }

  if (outputType !== 'VIDEO') {
    return null
  }

  const aspectRatio = readStringField(providerInput, 'aspectRatio')
  const width = readPositiveNumberField(providerInput, 'width')
  const height = readPositiveNumberField(providerInput, 'height')

  if (!aspectRatio || !width || !height) {
    return null
  }

  return {
    runId,
    workflowId,
    outputType,
    providerId,
    apiKeyId,
    useSystemKey,
    callbackUrl,
    resolveKeyUrl,
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
    providerInput: {
      prompt,
      modelId,
      externalModelId,
      aspectRatio:
        aspectRatio as WorkerVideoRunContext['providerInput']['aspectRatio'],
      // Accept either a positive number (Seedance 4-15, Veo 4/6/8s, etc.)
      // or the literal 'auto' token — Seedance-only, lets the model decide.
      duration: ((): number | 'auto' | undefined => {
        const raw = providerInput.duration
        if (typeof raw === 'number' && raw > 0) return raw
        if (raw === 'auto') return 'auto'
        return undefined
      })(),
      referenceImage:
        readStringField(providerInput, 'referenceImage') ?? undefined,
      referenceImages: Array.isArray(providerInput.referenceImages)
        ? providerInput.referenceImages.filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : undefined,
      audioUrls: Array.isArray(providerInput.audioUrls)
        ? providerInput.audioUrls.filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : undefined,
      audioBindings: Array.isArray(providerInput.audioBindings)
        ? providerInput.audioBindings.flatMap(
            (entry): Array<{ url: string; characterName?: string }> => {
              if (!isRecord(entry)) return []
              const url = readStringField(entry, 'url')
              if (!url) return []
              const characterName =
                readStringField(entry, 'characterName') ?? undefined
              return [characterName ? { url, characterName } : { url }]
            },
          )
        : undefined,
      videoUrls: Array.isArray(providerInput.videoUrls)
        ? providerInput.videoUrls.filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : undefined,
      negativePrompt:
        readStringField(providerInput, 'negativePrompt') ?? undefined,
      generateAudio:
        readBooleanField(providerInput, 'generateAudio') ?? undefined,
      seed: readNumberField(providerInput, 'seed') ?? undefined,
      resolution: readStringField(providerInput, 'resolution') ?? undefined,
      i2vModelId: readStringField(providerInput, 'i2vModelId') ?? undefined,
      videoDefaults: isRecord(providerInput.videoDefaults)
        ? providerInput.videoDefaults
        : undefined,
      providerBaseUrl:
        readStringField(providerInput, 'providerBaseUrl') ?? undefined,
      outputStorageKey:
        readStringField(providerInput, 'outputStorageKey') ?? undefined,
      width,
      height,
    },
  }
}

export function isModel3DWorkflowId(
  value: unknown,
): value is typeof HYPER3D_RODIN_WORKFLOW_ID | typeof HUNYUAN3D_WORKFLOW_ID {
  return value === HYPER3D_RODIN_WORKFLOW_ID || value === HUNYUAN3D_WORKFLOW_ID
}

export function parseModel3DRunContext(
  input: unknown,
): WorkerModel3DRunContext | null {
  if (!isRecord(input)) return null
  const providerInput = input.providerInput
  if (!isRecord(providerInput)) return null

  const runId = readStringField(input, 'runId')
  const workflowId = readStringField(input, 'workflowId')
  const outputType = readStringField(input, 'outputType')
  const providerId = readStringField(input, 'providerId')
  const apiKeyId = readStringField(input, 'apiKeyId') ?? undefined
  const useSystemKey = readBooleanField(input, 'useSystemKey') ?? undefined
  const callbackUrl = readStringField(input, 'callbackUrl')
  const resolveKeyUrl = readStringField(input, 'resolveKeyUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')
  const imageUrl = readStringField(providerInput, 'imageUrl')
  const modelId = readStringField(providerInput, 'modelId')
  const externalModelId = readStringField(providerInput, 'externalModelId')
  const prompt = readStringField(providerInput, 'prompt')

  if (
    !runId ||
    !isModel3DWorkflowId(workflowId) ||
    outputType !== 'MODEL_3D' ||
    !providerId ||
    (!apiKeyId && !useSystemKey) ||
    !callbackUrl ||
    !resolveKeyUrl ||
    !timeoutMs ||
    !maxAttempts ||
    !pollIntervalMs ||
    !modelId ||
    !externalModelId ||
    (workflowId === HUNYUAN3D_WORKFLOW_ID && !imageUrl) ||
    (workflowId === HYPER3D_RODIN_WORKFLOW_ID && !imageUrl && !prompt)
  ) {
    return null
  }

  const additionalImageUrls = Array.isArray(providerInput.additionalImageUrls)
    ? (providerInput.additionalImageUrls as unknown[]).filter(
        (u): u is string => typeof u === 'string',
      )
    : undefined

  const multiViewImages = isRecord(providerInput.multiViewImages)
    ? (providerInput.multiViewImages as Record<string, unknown>)
    : undefined
  const multiViewStrings =
    multiViewImages &&
    Object.fromEntries(
      Object.entries(multiViewImages).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )

  return {
    runId,
    workflowId,
    outputType: 'MODEL_3D',
    providerId,
    apiKeyId,
    useSystemKey,
    callbackUrl,
    resolveKeyUrl,
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
    providerInput: {
      imageUrl: imageUrl ?? undefined,
      modelId,
      externalModelId,
      seed: readPositiveNumberField(providerInput, 'seed') ?? undefined,
      tier: readStringField(providerInput, 'tier') ?? undefined,
      meshMode: readStringField(providerInput, 'meshMode') ?? undefined,
      textureMode: readStringField(providerInput, 'textureMode') ?? undefined,
      material: readStringField(providerInput, 'material') ?? undefined,
      highPack: readBooleanField(providerInput, 'highPack') ?? undefined,
      taPose: readBooleanField(providerInput, 'taPose') ?? undefined,
      hdTexture: readBooleanField(providerInput, 'hdTexture') ?? undefined,
      textureDelight:
        readBooleanField(providerInput, 'textureDelight') ?? undefined,
      qualityOverride:
        readPositiveNumberField(providerInput, 'qualityOverride') ?? undefined,
      bboxCondition: providerInput.bboxCondition,
      additionalImageUrls: additionalImageUrls?.length
        ? additionalImageUrls
        : undefined,
      enablePbr: readBooleanField(providerInput, 'enablePbr') ?? undefined,
      faceCount:
        readPositiveNumberField(providerInput, 'faceCount') ?? undefined,
      multiViewImages: multiViewStrings,
      removeBackground:
        readBooleanField(providerInput, 'removeBackground') ?? undefined,
      octreeResolution:
        readPositiveNumberField(providerInput, 'octreeResolution') ?? undefined,
      generateType: readStringField(providerInput, 'generateType') ?? undefined,
      polygonType: readStringField(providerInput, 'polygonType') ?? undefined,
      prompt: prompt ?? undefined,
    },
  }
}

async function importStateKey(secret: string): Promise<CryptoKey> {
  const raw = base64ToBytes(secret)
  if (raw.length !== 32) {
    throw new Error('STATE_ENCRYPTION_KEY must decode to exactly 32 bytes.')
  }
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptStateString(
  plaintext: string,
  env: ExecutionEnv,
): Promise<string> {
  if (!env.STATE_ENCRYPTION_KEY) {
    throw new Error('STATE_ENCRYPTION_KEY is not configured.')
  }
  const cryptoKey = await importStateKey(env.STATE_ENCRYPTION_KEY)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  )
  const combined = new Uint8Array(iv.length + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.length)
  return bytesToBase64(combined)
}

export async function decryptStateString(
  blob: string,
  env: ExecutionEnv,
): Promise<string> {
  if (!env.STATE_ENCRYPTION_KEY) {
    throw new Error('STATE_ENCRYPTION_KEY is not configured.')
  }
  const cryptoKey = await importStateKey(env.STATE_ENCRYPTION_KEY)
  const combined = base64ToBytes(blob)
  if (combined.length < 13) {
    throw new Error('Encrypted state blob is too short to contain IV + cipher.')
  }
  const iv = combined.slice(0, 12)
  const cipher = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    cipher,
  )
  return new TextDecoder().decode(plaintext)
}

async function getOrCreateWorkflowInstance<TParams>(
  workflow: Workflow<TParams>,
  runId: string,
  params: TParams,
): Promise<{ id: string }> {
  try {
    return await workflow.create({ id: runId, params })
  } catch (createError) {
    // A dispatch response can be lost after Cloudflare accepted the instance.
    // Replays use GenerationJob.id as the deterministic Workflow id, so return
    // that existing instance instead of turning an accepted run into a 5xx.
    try {
      return await workflow.get(runId)
    } catch {
      throw createError
    }
  }
}

async function handleHyper3DRodinDispatch(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }

  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const runContext = parseModel3DRunContext(parsed)
  if (!runContext || runContext.workflowId !== HYPER3D_RODIN_WORKFLOW_ID) {
    return jsonResponse(
      { ok: false, error: 'Invalid Hyper3D Rodin run context.' },
      { status: 400 },
    )
  }

  const instance = await getOrCreateWorkflowInstance(
    env.HYPER3D_RODIN_WORKFLOW,
    runContext.runId,
    runContext,
  )

  return jsonResponse({ workflowInstanceId: instance.id })
}

async function handleHunyuan3DDispatch(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }

  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const runContext = parseModel3DRunContext(parsed)
  if (!runContext || runContext.workflowId !== HUNYUAN3D_WORKFLOW_ID) {
    return jsonResponse(
      { ok: false, error: 'Invalid Hunyuan3D run context.' },
      { status: 400 },
    )
  }

  const instance = await getOrCreateWorkflowInstance(
    env.HUNYUAN3D_WORKFLOW,
    runContext.runId,
    runContext,
  )

  return jsonResponse({ workflowInstanceId: instance.id })
}

async function handleFalQueueDispatch(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }

  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const runContext = parseWorkerRunContext(parsed)
  if (!runContext) {
    return jsonResponse(
      { ok: false, error: 'Invalid run context.' },
      { status: 400 },
    )
  }

  const instance = await getOrCreateWorkflowInstance(
    env.CINEMATIC_SHORT_VIDEO_WORKFLOW,
    runContext.runId,
    runContext,
  )

  return jsonResponse({ workflowInstanceId: instance.id })
}

export class CinematicShortVideoWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerRunContext
> {
  async run(
    event: WorkflowEvent<WorkerRunContext>,
    rawStep: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload
    // provider 失败要带着 errorCode / providerMetadata 活着走出 step 边界，
    // 必须过这一层 —— 原因见 lib/step-failure.ts 顶部。
    const step = guardWorkflowStep(rawStep, runLogFields(context))

    try {
      // Resolve the API key ONCE, AES-GCM encrypt before persisting in
      // workflow state via step.do. Subsequent steps decrypt in-memory.
      // Avoids (a) hitting Cloudflare's per-workflow subrequest budget by
      // re-resolving every poll, and (b) leaking the plaintext BYOK key into
      // workflow state visible to anyone with state read access. Mirrors the
      // Hyper3DRodinWorkflow / Hunyuan3DWorkflow pattern.
      const encryptedApiKey = await step.do(
        'resolve-api-key',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const plaintext = await resolveRunApiKey(this.env, context)
          return encryptStateString(plaintext, this.env)
        },
      )

      if (
        context.outputType === 'AUDIO' &&
        context.providerId === 'fish_audio'
      ) {
        const audioResult = await step.do(
          'submit-fish-audio-and-upload-r2',
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 1_800_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return submitFishAudio(this.env, context, apiKey)
          },
        )

        await step.do('callback-result', async () =>
          emitRunResultCallback(this.env, context, {
            artifactUrl: audioResult.artifactUrl,
            audioR2Key: audioResult.audioR2Key,
            providerMetadata: audioResult.providerMetadata,
            duration: audioResult.duration,
            requestCount: 1,
            mimeType: audioResult.mimeType,
          }),
        )

        return { status: 'COMPLETED', runId: context.runId }
      }

      const resultData = await runMultiStepDriver(
        step,
        {
          env: this.env,
          context,
          readApiKey: () => decryptStateString(encryptedApiKey, this.env),
        },
        buildQueueMediaDriver(context),
        // 视频音频这条没有「离开排队」这一段，不回报阶段。
        async () => {},
      )

      await step.do('callback-result', async () =>
        emitRunResultCallback(this.env, context, resultData),
      )

      return { status: 'COMPLETED', runId: context.runId }
    } catch (error) {
      const failureData = buildWorkerFailureCallbackData(error, {
        message: 'Workflow execution failed.',
        providerMetadata: { workflowInstanceId: event.instanceId },
      })

      await step.do('callback-failure', async () =>
        emitRunResultCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }
}

export class Hyper3DRodinWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerModel3DRunContext
> {
  async run(
    event: WorkflowEvent<WorkerModel3DRunContext>,
    rawStep: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload
    // provider 失败要带着 errorCode / providerMetadata 活着走出 step 边界，
    // 必须过这一层 —— 原因见 lib/step-failure.ts 顶部。
    const step = guardWorkflowStep(rawStep, runLogFields(context))

    try {
      // Resolve the API key ONCE, AES-GCM encrypt before persisting in workflow
      // state via step.do. Subsequent steps decrypt in-memory. Avoids
      // (a) hitting Cloudflare's per-workflow subrequest budget by re-resolving
      // every poll, and (b) leaking the plaintext BYOK key into workflow
      // state visible to anyone with Cloudflare state read access.
      const encryptedApiKey = await step.do(
        'resolve-api-key',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const plaintext = await resolveRunApiKey(this.env, context)
          return encryptStateString(plaintext, this.env)
        },
      )

      // Texture-only continuation goes to a different Rodin endpoint
      // (/api/v2/rodin_texture_only) with mesh + image as binaries; everything
      // downstream (status polling, download, R2 upload, callback) is identical
      // to a regular Rodin job, so the rest of this workflow is unchanged.
      const isTextureOnly = context.providerInput.rodinTextureOnly === true
      const rodin = await step.do(
        isTextureOnly ? 'submit-rodin-texture-only' : 'submit-rodin',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: Math.min(context.timeoutMs, 1_800_000),
        },
        async () => {
          const apiKey = await decryptStateString(encryptedApiKey, this.env)
          return isTextureOnly
            ? submitRodinTextureOnlyJob(context, apiKey)
            : submitRodinJob(context, apiKey)
        },
      )

      for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
        await step.sleep(`wait-rodin-${attempt}`, context.pollIntervalMs)

        const pollResult = await step.do(
          `poll-rodin-${attempt}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return pollRodinJob(rodin, apiKey)
          },
        )

        if (pollResult.status === 'FAILED') {
          throw new WorkerProviderError({
            message:
              pollResult.error ?? 'Hyper3D Rodin reported failed status.',
            provider: context.providerId,
            phase: 'rodin_poll',
            errorCode: pollResult.errorCode,
            providerMetadata: pollResult.providerMetadata,
          })
        }

        if (pollResult.status === 'COMPLETED') {
          const glbResult = await step.do(
            'download-and-upload-glb',
            {
              retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
              timeout: '120 seconds',
            },
            async () => {
              const apiKey = await decryptStateString(encryptedApiKey, this.env)
              return downloadAndUploadRodinGlb(this.env, context, rodin, apiKey)
            },
          )

          await step.do('callback-result', async () =>
            emitRunResultCallback(this.env, context, {
              artifactUrl: glbResult.artifactUrl,
              glbR2Key: glbResult.glbR2Key,
              mimeType: 'model/gltf-binary',
              providerMetadata: { jobUuid: rodin.jobUuid },
              requestCount: 1,
            }),
          )

          return { status: 'COMPLETED', runId: context.runId }
        }
      }

      throw new Error('Hyper3D Rodin polling timed out.')
    } catch (error) {
      const failureData = buildWorkerFailureCallbackData(error, {
        message: 'Workflow execution failed.',
        providerMetadata: { workflowInstanceId: event.instanceId },
      })

      await step.do('callback-failure', async () =>
        emitRunResultCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }
}

export class Hunyuan3DWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerModel3DRunContext
> {
  async run(
    event: WorkflowEvent<WorkerModel3DRunContext>,
    rawStep: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload
    // provider 失败要带着 errorCode / providerMetadata 活着走出 step 边界，
    // 必须过这一层 —— 原因见 lib/step-failure.ts 顶部。
    const step = guardWorkflowStep(rawStep, runLogFields(context))

    try {
      // Resolve+encrypt the API key ONCE — see Hyper3DRodinWorkflow for rationale.
      const encryptedApiKey = await step.do(
        'resolve-api-key',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const plaintext = await resolveRunApiKey(this.env, context)
          return encryptStateString(plaintext, this.env)
        },
      )

      const queue = await step.do(
        'submit-fal',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: Math.min(context.timeoutMs, 1_800_000),
        },
        async () => {
          const apiKey = await decryptStateString(encryptedApiKey, this.env)
          return submitFalModel3DQueue(context, apiKey, this.env)
        },
      )

      for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
        await step.sleep(`wait-fal3d-${attempt}`, context.pollIntervalMs)

        const pollResult = await step.do(
          `poll-fal3d-${attempt}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            const statusResponse = await fetch(queue.statusUrl, {
              headers: { Authorization: `Key ${apiKey}` },
            })

            if (!statusResponse.ok) {
              throw await createProviderResponseError(statusResponse, {
                provider: 'fal',
                phase: 'model_3d_status_poll',
                fallbackMessage: `fal.ai 3D status poll failed with status ${statusResponse.status}`,
                requestId: queue.requestId,
              })
            }

            const statusData = (await statusResponse.json()) as Record<
              string,
              unknown
            >
            const status = readStringField(statusData, 'status')
            const statusFailure = createProviderPayloadError(statusData, {
              provider: 'fal',
              phase: 'model_3d_status_poll',
              fallbackMessage: 'fal.ai 3D queue reported failed status.',
              requestId: queue.requestId,
              providerMetadata: {
                statusUrl: queue.statusUrl,
                responseUrl: queue.responseUrl,
              },
            })

            if (statusFailure) {
              return {
                status: 'FAILED' as const,
                error: statusFailure.message,
                errorCode: statusFailure.errorCode,
                providerMetadata: statusFailure.providerMetadata,
              }
            }
            if (status && isFalQueueFailureStatus(status)) {
              return {
                status: 'FAILED' as const,
                error: 'fal.ai 3D queue reported failed status.',
                providerMetadata: {
                  requestId: queue.requestId,
                  statusUrl: queue.statusUrl,
                  responseUrl: queue.responseUrl,
                },
              }
            }
            if (status !== 'COMPLETED') {
              return {
                status: (status === 'IN_PROGRESS'
                  ? 'IN_PROGRESS'
                  : 'IN_QUEUE') as 'IN_PROGRESS' | 'IN_QUEUE',
              }
            }

            const resultResponse = await fetch(queue.responseUrl, {
              headers: { Authorization: `Key ${apiKey}` },
            })

            if (!resultResponse.ok) {
              throw await createProviderResponseError(resultResponse, {
                provider: 'fal',
                phase: 'model_3d_result_fetch',
                fallbackMessage: `fal.ai 3D result fetch failed with status ${resultResponse.status}`,
                requestId: queue.requestId,
              })
            }

            const resultData = (await resultResponse.json()) as Record<
              string,
              unknown
            >
            const resultFailure = createProviderPayloadError(resultData, {
              provider: 'fal',
              phase: 'model_3d_result_fetch',
              fallbackMessage: 'fal.ai 3D result response reported failure.',
              requestId: queue.requestId,
              providerMetadata: {
                statusUrl: queue.statusUrl,
                responseUrl: queue.responseUrl,
              },
            })
            if (resultFailure) {
              return {
                status: 'FAILED' as const,
                error: resultFailure.message,
                errorCode: resultFailure.errorCode,
                providerMetadata: resultFailure.providerMetadata,
              }
            }

            const artifact = readFalModel3DResult(resultData)

            if (!artifact.artifactUrl) {
              throw createProviderNoOutputError({
                provider: 'fal',
                phase: 'model_3d_result_fetch',
                message: 'fal.ai 3D result did not include a model mesh URL.',
                requestId: queue.requestId,
                providerMetadata: {
                  statusUrl: queue.statusUrl,
                  responseUrl: queue.responseUrl,
                },
              })
            }

            return {
              status: 'COMPLETED' as const,
              artifactUrl: artifact.artifactUrl,
              mimeType: artifact.mimeType,
            }
          },
        )

        if (pollResult.status === 'FAILED') {
          throw new WorkerProviderError({
            message: pollResult.error ?? 'fal.ai 3D reported failed status.',
            provider: context.providerId,
            phase: 'model_3d_poll',
            errorCode: pollResult.errorCode,
            providerMetadata: pollResult.providerMetadata,
          })
        }

        if (
          pollResult.status === 'COMPLETED' &&
          'artifactUrl' in pollResult &&
          pollResult.artifactUrl
        ) {
          const uploaded = await step.do(
            'download-and-upload-glb',
            {
              retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
              timeout: '120 seconds',
            },
            () =>
              downloadAndUploadModel3DArtifact(
                this.env,
                context,
                pollResult.artifactUrl,
                pollResult.mimeType ?? 'model/gltf-binary',
              ),
          )

          await step.do('callback-result', async () =>
            emitRunResultCallback(this.env, context, {
              artifactUrl: uploaded.artifactUrl,
              glbR2Key: uploaded.glbR2Key,
              mimeType: pollResult.mimeType ?? 'model/gltf-binary',
              providerMetadata: {
                requestId: queue.requestId,
                statusUrl: queue.statusUrl,
                responseUrl: queue.responseUrl,
              },
              requestCount: 1,
            }),
          )

          return { status: 'COMPLETED', runId: context.runId }
        }
      }

      throw new Error('fal.ai 3D polling timed out.')
    } catch (error) {
      const failureData = buildWorkerFailureCallbackData(error, {
        message: 'Workflow execution failed.',
        providerMetadata: { workflowInstanceId: event.instanceId },
      })

      await step.do('callback-failure', async () =>
        emitRunResultCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }
}

// ─── Image generation (OpenAI gpt-image, synchronous HTTP) ────────────────────

export function parseImageRunContext(
  input: unknown,
): WorkerImageRunContext | null {
  if (!isRecord(input)) return null
  const providerInput = input.providerInput
  if (!isRecord(providerInput)) return null

  const runId = readStringField(input, 'runId')
  const workflowId = readStringField(input, 'workflowId')
  const providerId = readStringField(input, 'providerId')
  const apiKeyId = readStringField(input, 'apiKeyId') ?? undefined
  const useSystemKey = readBooleanField(input, 'useSystemKey') ?? undefined
  const callbackUrl = readStringField(input, 'callbackUrl')
  const resolveKeyUrl = readStringField(input, 'resolveKeyUrl')
  const slotUrl = readStringField(input, 'slotUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')
  const prompt = readStringField(providerInput, 'prompt')
  const modelId = readStringField(providerInput, 'modelId')
  const externalModelId = readStringField(providerInput, 'externalModelId')
  const aspectRatio = readStringField(providerInput, 'aspectRatio')

  if (
    !runId ||
    workflowId !== IMAGE_QUEUE_WORKFLOW_ID ||
    !providerId ||
    // Runner 由 Worker 自己拿 RUNNER_MODAL_TOKEN 调 Modal、不走 resolve-key，
    // Next 那边（#312 起）也就不再给它带 apiKeyId / useSystemKey。这里还要求
    // 带 key 的话，所有 Runner 出图都会被 400 拒收（2026-10-23 线上撞上）。
    (providerId !== 'runner' && !apiKeyId && !useSystemKey) ||
    !callbackUrl ||
    !resolveKeyUrl ||
    !timeoutMs ||
    !maxAttempts ||
    !pollIntervalMs ||
    !prompt ||
    !modelId ||
    !externalModelId ||
    !aspectRatio
  ) {
    return null
  }

  const referenceImage =
    readStringField(providerInput, 'referenceImage') ?? undefined
  const referenceImages = Array.isArray(providerInput.referenceImages)
    ? providerInput.referenceImages.filter(
        (value): value is string => typeof value === 'string',
      )
    : undefined
  // ⚠ 长度对不上整串丢掉：宁可退回无说明的旧行为，也不把 A 的说明贴到 B 的图上。
  const referenceImageLabels =
    Array.isArray(providerInput.referenceImageLabels) &&
    providerInput.referenceImageLabels.length === referenceImages?.length
      ? providerInput.referenceImageLabels.map((value) =>
          typeof value === 'string' && value.trim() ? value : null,
        )
      : undefined
  const advancedParams = isRecord(providerInput.advancedParams)
    ? (providerInput.advancedParams as Record<string, unknown>)
    : undefined

  return {
    runId,
    workflowId: IMAGE_QUEUE_WORKFLOW_ID,
    outputType: 'IMAGE',
    providerId,
    apiKeyId,
    useSystemKey,
    callbackUrl,
    resolveKeyUrl,
    ...(slotUrl ? { slotUrl } : {}),
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
    providerInput: {
      prompt,
      modelId,
      externalModelId,
      aspectRatio,
      referenceImage,
      ...(providerInput.imageOperation === 'precise-edit'
        ? { imageOperation: 'precise-edit' as const }
        : {}),
      referenceImages,
      ...(referenceImageLabels ? { referenceImageLabels } : {}),
      advancedParams,
      providerBaseUrl:
        readStringField(providerInput, 'providerBaseUrl') ?? undefined,
      outputStorageKey:
        readStringField(providerInput, 'outputStorageKey') ?? undefined,
      safetyIdentifier:
        readStringField(providerInput, 'safetyIdentifier') ?? undefined,
    },
  }
}

/**
 * One extra artifact produced by the same provider call as the main image.
 * Today the only source is Seedream 5.0 Pro's `layer_decomposition`, which
 * returns one base image (z_index 0 — that is `artifactUrl` below) plus up to
 * 16 alpha PNG layers. Each layer is uploaded to R2 by the worker, exactly
 * like the base image, so the app never fetches from the provider's 24-hour
 * URLs.
 * https://www.volcengine.com/docs/82379/1541523
 */
export interface WorkerImageLayerResult {
  zIndex: number
  artifactUrl: string
  imageR2Key: string
  mimeType: string
  width: number
  height: number
  name?: string
  description?: string
  boundingBox?: { absolute?: number[]; normalized?: number[] }
}

export interface WorkerImageGenerationResult {
  artifactUrl: string
  imageR2Key: string
  width: number
  height: number
  mimeType: string
  providerMetadata?: Record<string, unknown>
  /** Only present when the provider returned more than one artifact. */
  layers?: WorkerImageLayerResult[]
}

/**
 * 按账号排队：问一次没轮到就等一会儿再问，越等问得越慢；最多等约 25 分钟。
 * ⚠ 每轮两个步骤（问 + 等），要给后面出图的轮询步骤留够引擎的步骤上限。
 */
const IMAGE_SLOT_WAIT = {
  FIRST_DELAY_MS: 3_000,
  MAX_DELAY_MS: 10_000,
  MAX_ROUNDS: 150,
} as const

/** 服务商回 429：退回去等这么久再出，最多这么多轮。 */
export const IMAGE_RATE_LIMIT_REQUEUE = {
  DELAY_MS: 20_000,
  MAX_ROUNDS: 6,
} as const

type ImageSlotState = 'granted' | 'waiting' | 'cancelled'

async function requestImageSlot(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
): Promise<ImageSlotState> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }
  const response = await postSignedJson(
    context.slotUrl!,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      apiKeyId: context.apiKeyId,
      useSystemKey: context.useSystemKey,
    },
  )
  if (!response.ok) {
    throw new Error(`Slot check failed with status ${response.status}`)
  }
  const payload = (await response.json()) as {
    success?: boolean
    data?: { state?: unknown }
  }
  const state = payload.data?.state
  if (
    payload.success !== true ||
    (state !== 'granted' && state !== 'waiting' && state !== 'cancelled')
  ) {
    throw new Error('Slot check returned an invalid response.')
  }
  return state
}

/**
 * 等到这个账号轮到自己。排队服务本身出错就不排了直接出（宁可撞一次并发锁，
 * 也别因为排队这一层把整张图弄失败）；等太久按失败上报。
 */
export async function waitForImageSlot(
  step: WorkflowStep,
  env: ExecutionEnv,
  context: WorkerImageRunContext,
): Promise<'granted' | 'cancelled'> {
  for (let round = 1; round <= IMAGE_SLOT_WAIT.MAX_ROUNDS; round += 1) {
    let state: ImageSlotState
    try {
      state = await step.do(
        `acquire-slot-${round}`,
        {
          retries: { limit: 2, delay: '2 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        () => requestImageSlot(env, context),
      )
    } catch {
      return 'granted'
    }
    if (state !== 'waiting') return state
    await step.sleep(
      `wait-slot-${round}`,
      Math.min(
        IMAGE_SLOT_WAIT.FIRST_DELAY_MS * round,
        IMAGE_SLOT_WAIT.MAX_DELAY_MS,
      ),
    )
  }
  throw new Error('Timed out waiting for this account to free up.')
}

function isRateLimitFailure(error: unknown): boolean {
  const errorCode =
    error instanceof WorkerStepFailure
      ? error.failure.errorCode
      : error instanceof WorkerProviderError
        ? error.errorCode
        : undefined
  return errorCode === WORKER_GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT
}

export class ImageQueueWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerImageRunContext
> {
  async run(
    event: WorkflowEvent<WorkerImageRunContext>,
    rawStep: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload
    // provider 失败要带着 errorCode / providerMetadata 活着走出 step 边界，
    // 必须过这一层 —— 原因见 lib/step-failure.ts 顶部。
    const step = guardWorkflowStep(rawStep, runLogFields(context))

    try {
      // Resolve + AES-GCM encrypt the API key once before persisting in
      // workflow state (same pattern as the 3D/video workflows). The runner
      // branch never reads it: Modal is authenticated with the Worker's own
      // RUNNER_MODAL_TOKEN, so there is no provider key to resolve.
      const encryptedApiKey =
        context.providerId === RUNNER_PROVIDER_ID
          ? ''
          : await step.do(
              'resolve-api-key',
              {
                retries: {
                  limit: 2,
                  delay: '5 seconds',
                  backoff: 'exponential',
                },
                timeout: '30 seconds',
              },
              async () => {
                const plaintext = await resolveRunApiKey(this.env, context)
                return encryptStateString(plaintext, this.env)
              },
            )

      // 按账号排队：这个账号同时能出的张数满了就在这里等，轮到了再出。
      if (context.slotUrl) {
        const slot = await waitForImageSlot(step, this.env, context)
        if (slot === 'cancelled') {
          return { status: 'CANCELLED', runId: context.runId }
        }
      }

      // 服务商回 429（太多了）：不算失败，等一会儿再出（步骤名带轮次，引擎才会真的重跑）。
      let result: WorkerImageGenerationResult
      for (let round = 0; ; round += 1) {
        try {
          result = await this.generateImage(
            round === 0 ? step : suffixStepNames(step, `-requeue-${round}`),
            context,
            encryptedApiKey,
          )
          break
        } catch (error) {
          if (
            round >= IMAGE_RATE_LIMIT_REQUEUE.MAX_ROUNDS ||
            !isRateLimitFailure(error)
          ) {
            throw error
          }
          await step.sleep(
            `rate-limited-wait-${round + 1}`,
            IMAGE_RATE_LIMIT_REQUEUE.DELAY_MS,
          )
        }
      }

      await step.do('callback-result', async () =>
        emitRunResultCallback(this.env, context, {
          artifactUrl: result.artifactUrl,
          imageR2Key: result.imageR2Key,
          width: result.width,
          height: result.height,
          mimeType: result.mimeType,
          providerMetadata: result.providerMetadata,
          requestCount: 1,
          layers: result.layers,
        }),
      )

      return { status: 'COMPLETED', runId: context.runId }
    } catch (error) {
      const failureData = buildWorkerFailureCallbackData(error, {
        message: 'Workflow execution failed.',
        providerMetadata: { workflowInstanceId: event.instanceId },
      })

      await step.do('callback-failure', async () =>
        emitRunResultCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }

  /** 真正去服务商那里出一张图。步骤名照旧（第 0 轮不改名，部署时在飞的实例照常 replay）。 */
  private async generateImage(
    step: WorkflowStep,
    context: WorkerImageRunContext,
    encryptedApiKey: string,
  ): Promise<WorkerImageGenerationResult> {
    const singleStepDriver = getSingleStepImageDriver(context.providerId)
    if (singleStepDriver) {
      return step.do(
        singleStepDriver.stepName,
        {
          retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
          timeout: Math.min(context.timeoutMs, 600_000),
        },
        async () => {
          const apiKey = await decryptStateString(encryptedApiKey, this.env)
          return singleStepDriver.generate(this.env, context, apiKey)
        },
      )
    }

    const runMultiStep = getMultiStepImageDriver(context.providerId)
    if (!runMultiStep) {
      throw new Error(`Image provider ${context.providerId} is not migrated.`)
    }
    return runMultiStep(
      step,
      {
        env: this.env,
        context,
        readApiKey: () => decryptStateString(encryptedApiKey, this.env),
      },
      (stage) => reportExecutionStage(this.env, context, stage),
    )
  }
}

async function handleImageQueueDispatch(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }

  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const runContext = parseImageRunContext(parsed)
  if (!runContext) {
    return jsonResponse(
      { ok: false, error: 'Invalid image run context.' },
      { status: 400 },
    )
  }

  const instance = await getOrCreateWorkflowInstance(
    env.IMAGE_QUEUE_WORKFLOW,
    runContext.runId,
    runContext,
  )

  return jsonResponse({ workflowInstanceId: instance.id })
}

// ─── Cancel (best-effort: app → worker) ────────────────────────────────────
//
// Mirrors `WorkerCancelRequest` / `workerCancelRequestSchema` in
// `src/types/index.ts` (contract owned by the app side, not duplicated here
// beyond this parser). Every field but `jobId` is optional and none is
// guaranteed to carry a value the worker can act on — this route is a
// best-effort helper, not a guarantee, so every step degrades instead of
// failing the whole request.

export interface WorkerCancelRequestBody {
  jobId: string
  workflowInstanceId?: string
  provider?: string
  providerJobId?: string
}

export function parseCancelRequest(
  input: unknown,
): WorkerCancelRequestBody | null {
  if (!isRecord(input)) return null

  const jobId = readStringField(input, 'jobId')
  if (!jobId) return null

  return {
    jobId,
    workflowInstanceId:
      readStringField(input, 'workflowInstanceId') ?? undefined,
    provider: readStringField(input, 'provider') ?? undefined,
    providerJobId: readStringField(input, 'providerJobId') ?? undefined,
  }
}

interface CancelWorkflowResult {
  attempted: boolean
  terminated: boolean
  detail: string
}

/**
 * The cancel payload carries a bare `workflowInstanceId`, not which of the 4
 * Workflow bindings it belongs to (instance ids are namespaced per binding).
 * Try each binding's `.get()` in turn — wrong-binding lookups just throw
 * "not found", which is cheap — and terminate the first instance found.
 *
 * `terminate()` rejecting for an instance that's already
 * completed/errored/terminated is expected, not an error: degrade to
 * `terminated: false` instead of surfacing it as a cancel failure.
 */
export async function terminateWorkflowInstanceById(
  env: ExecutionEnv,
  workflowInstanceId: string,
): Promise<CancelWorkflowResult> {
  const lookups: Array<() => Promise<WorkflowInstance>> = [
    () => env.CINEMATIC_SHORT_VIDEO_WORKFLOW.get(workflowInstanceId),
    () => env.HYPER3D_RODIN_WORKFLOW.get(workflowInstanceId),
    () => env.HUNYUAN3D_WORKFLOW.get(workflowInstanceId),
    () => env.IMAGE_QUEUE_WORKFLOW.get(workflowInstanceId),
  ]

  for (const lookup of lookups) {
    let instance: WorkflowInstance
    try {
      instance = await lookup()
    } catch {
      continue // Not this binding's namespace — try the next one.
    }

    try {
      await instance.terminate()
      return { attempted: true, terminated: true, detail: 'terminated' }
    } catch (error) {
      return {
        attempted: true,
        terminated: false,
        detail: `instance found but terminate failed (likely already finished): ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  return {
    attempted: false,
    terminated: false,
    detail: 'workflow instance not found on any binding',
  }
}

/**
 * Resolves a *system* provider API key for a best-effort cancel call. The
 * cancel payload never carries `apiKeyId` (only the app's normal dispatch
 * contexts do — see `resolveApiKey`/`resolveApiKeyModel3D`), so a
 * user-supplied key can't be resolved here. This only succeeds for jobs
 * running on the platform's own system key for that adapter; see this
 * route's report to the caller for how that limits provider-side cancel.
 */
async function resolveSystemApiKeyForCancel(
  env: ExecutionEnv,
  jobId: string,
  provider: string,
): Promise<string | null> {
  if (!env.INTERNAL_CALLBACK_URL || !env.INTERNAL_CALLBACK_SECRET) return null

  try {
    const resolveKeyUrl = new URL(
      RESOLVE_KEY_PATH,
      env.INTERNAL_CALLBACK_URL,
    ).toString()
    const response = await postSignedJson(
      resolveKeyUrl,
      env.INTERNAL_CALLBACK_SECRET,
      { runId: jobId, adapterType: provider, useSystemKey: true },
    )
    if (!response.ok) return null

    const payload = (await response.json()) as {
      success?: boolean
      data?: { apiKey?: unknown }
    }
    if (payload.success !== true || typeof payload.data?.apiKey !== 'string') {
      return null
    }
    return payload.data.apiKey
  } catch {
    return null
  }
}

interface CancelProviderResult {
  attempted: boolean
  ok: boolean
  detail: string
}

const RUNNER_PROVIDER_ID = 'runner'
const FAL_CANCEL_PROVIDER_ID = 'fal'
const REPLICATE_PROVIDER_ID = 'replicate'

/**
 * Best-effort upstream provider cancel. Single-provider failure never throws
 * — every branch reports `{ attempted, ok, detail }` instead.
 */
export async function cancelProviderJob(
  env: ExecutionEnv,
  jobId: string,
  provider: string,
  providerJobId: string,
): Promise<CancelProviderResult> {
  if (provider === RUNNER_PROVIDER_ID) {
    const ok = await cancelRunnerImageJob(providerJobId, env)
    return {
      attempted: true,
      ok,
      detail: ok ? 'Modal cancel requested.' : 'Modal cancel request failed.',
    }
  }

  if (provider === FAL_CANCEL_PROVIDER_ID) {
    const apiKey = await resolveSystemApiKeyForCancel(env, jobId, provider)
    if (!apiKey) {
      return {
        attempted: false,
        ok: false,
        detail: 'No fal.ai system API key available for cancel.',
      }
    }
    try {
      // fal's queue cancel is per-model: PUT
      // https://queue.fal.run/{model_id}/requests/{request_id}/cancel — the
      // model id isn't part of `WorkerCancelRequest` (only `providerJobId`
      // is), so the caller is expected to populate `providerJobId` as the
      // `{model_id}/requests/{request_id}` path segment: exactly what fal's
      // own submit response's `cancel_url` contains, minus the
      // `https://queue.fal.run/` prefix and `/cancel` suffix. A bare
      // request id here will 404 and degrade like any other failed attempt.
      const response = await fetch(
        `https://queue.fal.run/${providerJobId}/cancel`,
        { method: 'PUT', headers: { Authorization: `Key ${apiKey}` } },
      )
      return {
        attempted: true,
        ok: response.ok,
        detail: `fal.ai responded ${response.status}.`,
      }
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        detail: `fal.ai cancel request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  if (provider === REPLICATE_PROVIDER_ID) {
    const apiKey = await resolveSystemApiKeyForCancel(env, jobId, provider)
    if (!apiKey) {
      return {
        attempted: false,
        ok: false,
        detail: 'No Replicate system API key available for cancel.',
      }
    }
    try {
      const response = await fetch(
        `${REPLICATE_BASE_URL}/predictions/${providerJobId}/cancel`,
        { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } },
      )
      return {
        attempted: true,
        ok: response.ok,
        detail: `Replicate responded ${response.status}.`,
      }
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        detail: `Replicate cancel request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  if (isVolcEngineProviderId(provider)) {
    const apiKey = await resolveSystemApiKeyForCancel(env, jobId, provider)
    if (!apiKey) {
      return {
        attempted: false,
        ok: false,
        detail: 'No VolcEngine/BytePlus system API key available for cancel.',
      }
    }
    try {
      // Ark's task API does have a DELETE cancel/delete endpoint, but it only
      // *cancels* a task still 'queued' — a 'running' task has no interrupt
      // and the call errors there by design. That's the provider's own
      // limit, not a bug in this branch: report the response status as-is
      // and let the caller treat a failed status as "already running,
      // nothing to do" rather than a real error.
      const response = await fetch(
        `${VOLCENGINE_DEFAULT_BASE_URL}/contents/generations/tasks/${providerJobId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } },
      )
      return {
        attempted: true,
        ok: response.ok,
        detail: `VolcEngine/BytePlus responded ${response.status} (only cancels tasks still queued).`,
      }
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        detail: `VolcEngine/BytePlus cancel request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  if (isMiniMaxProviderId(provider)) {
    const apiKey = await resolveSystemApiKeyForCancel(env, jobId, provider)
    if (!apiKey) {
      return {
        attempted: false,
        ok: false,
        detail: 'No MiniMax system API key available for cancel.',
      }
    }
    try {
      // DELETE {base}/video_generation/{task_id} (base already ends in /v2 —
      // see miniMaxBaseUrl). Per MiniMax's docs this only *cancels* a task
      // still 'queued'; a 'running' task returns an error by design, same
      // shape as the VolcEngine/Ark branch above — report status as-is.
      const baseUrl = miniMaxBaseUrl(provider)
      const response = await fetch(
        `${baseUrl}/video_generation/${providerJobId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } },
      )
      return {
        attempted: true,
        ok: response.ok,
        detail: `MiniMax responded ${response.status} (only cancels tasks still queued).`,
      }
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        detail: `MiniMax cancel request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  return {
    attempted: false,
    ok: false,
    detail: `Provider "${provider}" has no cancel dispatch (unsupported, or synchronous with nothing to cancel — e.g. Fish Audio).`,
  }
}

async function handleCancel(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }

  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return jsonResponse(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const cancelRequest = parseCancelRequest(parsed)
  if (!cancelRequest) {
    return jsonResponse(
      { ok: false, error: 'Invalid cancel request.' },
      { status: 400 },
    )
  }

  const workflow = cancelRequest.workflowInstanceId
    ? await terminateWorkflowInstanceById(env, cancelRequest.workflowInstanceId)
    : ({
        attempted: false,
        terminated: false,
        detail: 'No workflowInstanceId supplied.',
      } satisfies CancelWorkflowResult)

  const provider =
    cancelRequest.provider && cancelRequest.providerJobId
      ? await cancelProviderJob(
          env,
          cancelRequest.jobId,
          cancelRequest.provider,
          cancelRequest.providerJobId,
        )
      : ({
          attempted: false,
          ok: false,
          detail: 'No provider/providerJobId supplied.',
        } satisfies CancelProviderResult)

  return jsonResponse({
    ok: true,
    jobId: cancelRequest.jobId,
    workflow,
    provider,
  })
}

/**
 * 助手每次 LLM 调用的那一行（token / 耗时 / 用途），原样写进 Workers Logs —— Vercel
 * Hobby 的运行时日志只留 1 小时，这里留 7 天，够攒数据定输出上限（2026-10-08）。
 * ⚠ 只记数：值必须是短字符串 / 数字 / 布尔 / null，任何一项不合规整行拒收。
 */
export function parseLlmCallLog(
  input: unknown,
): Record<string, string | number | boolean | null> | null {
  if (!isRecord(input)) return null
  const entries = Object.entries(input)
  if (entries.length === 0 || entries.length > LLM_CALL_LOG_MAX_FIELDS) {
    return null
  }
  const valid = entries.every(
    ([, value]) =>
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= LLM_CALL_LOG_MAX_STRING),
  )
  return valid
    ? (Object.fromEntries(entries) as Record<
        string,
        string | number | boolean | null
      >)
    : null
}

async function handleLlmCallLog(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }
  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }
  let entry: ReturnType<typeof parseLlmCallLog> = null
  try {
    entry = parseLlmCallLog(JSON.parse(rawBody))
  } catch {
    entry = null
  }
  if (!entry) {
    return jsonResponse(
      { ok: false, error: 'Invalid log entry.' },
      { status: 400 },
    )
  }
  console.log({ ...entry, message: 'assistant llm call' })
  return new Response(null, { status: 204 })
}

/**
 * 认图：app 签名发来一张图的地址，原样转给 Modal 上的 Tagger（`RUNNER_MODAL_TOKEN` 只在 Worker），
 * 同步等结果。冷启动要几十秒，app 那头自己掐超时。
 */
async function handleTagImage(
  request: Request,
  env: ExecutionEnv,
): Promise<Response> {
  const secret = readRequiredSecret(env)
  if (!secret) {
    return jsonResponse(
      { ok: false, error: 'Internal callback secret is not configured.' },
      { status: 500 },
    )
  }
  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) {
    return jsonResponse(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 },
    )
  }
  let imageUrl: unknown
  try {
    imageUrl = (JSON.parse(rawBody) as { imageUrl?: unknown }).imageUrl
  } catch {
    imageUrl = undefined
  }
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
    return jsonResponse(
      { ok: false, error: 'imageUrl must be an https URL.' },
      { status: 400 },
    )
  }
  let upstream: Response
  try {
    upstream = await modalRunnerRequest(env, '/tag', {
      method: 'POST',
      body: { imageUrl },
    })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Tagger unreachable.',
      },
      { status: 502 },
    )
  }
  const text = await upstream.text()
  if (!upstream.ok) {
    return jsonResponse(
      {
        ok: false,
        error: `Tagger failed (${upstream.status}): ${text.slice(0, 300)}`,
      },
      { status: 502 },
    )
  }
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
  })
}

const executionWorker = {
  async fetch(request: Request, env: ExecutionEnv): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === HEALTH_PATH) {
      return handleHealth()
    }

    if (request.method === 'POST' && url.pathname === ECHO_PATH) {
      return handleEcho(request, env)
    }

    if (
      request.method === 'POST' &&
      (url.pathname === FAL_QUEUE_PATH ||
        url.pathname === CINEMATIC_SHORT_VIDEO_PATH)
    ) {
      return handleFalQueueDispatch(request, env)
    }

    if (request.method === 'POST' && url.pathname === HYPER3D_RODIN_PATH) {
      return handleHyper3DRodinDispatch(request, env)
    }

    if (request.method === 'POST' && url.pathname === HUNYUAN3D_PATH) {
      return handleHunyuan3DDispatch(request, env)
    }

    if (request.method === 'POST' && url.pathname === IMAGE_QUEUE_PATH) {
      return handleImageQueueDispatch(request, env)
    }

    if (request.method === 'POST' && url.pathname === CANCEL_PATH) {
      return handleCancel(request, env)
    }

    if (request.method === 'POST' && url.pathname === LLM_CALL_LOG_PATH) {
      return handleLlmCallLog(request, env)
    }

    if (request.method === 'POST' && url.pathname === TAG_IMAGE_PATH) {
      return handleTagImage(request, env)
    }
    if (request.method === 'POST' && url.pathname === IMAGE_DERIVATIVES_PATH) {
      return handleImageDerivatives(request, env)
    }

    return jsonResponse({ ok: false, error: 'Not found.' }, { status: 404 })
  },
}

export default executionWorker
