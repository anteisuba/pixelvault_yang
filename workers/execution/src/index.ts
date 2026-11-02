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
import {
  buildR2PublicUrl,
  getImageReferenceInputs,
  R2_OBJECT_CACHE_CONTROL,
} from './lib/image-io'
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
import {
  FISH_SEGMENTS,
  fishSegmentMaxTokens,
  fishSegmentRanAway,
  splitFishSegments,
} from '../../../src/lib/fish-segments'
import { suffixStepNames } from './lib/step-rounds'
import { buildFalWorkerQueueRequest as buildFalWorkerVideoQueueRequest } from './providers/fal/video-request-builders'
import {
  buildMiniMaxVideoRequest,
  isMiniMaxProviderId,
  mapMiniMaxStatus,
  miniMaxBaseUrl,
} from './providers/minimax/video-request-builder'
import {
  buildVolcEngineVideoRequest,
  isVolcEngineProviderId,
  mapVolcEngineStatus,
  VOLCENGINE_DEFAULT_BASE_URL,
} from './providers/volcengine/video-request-builder'
import { JSON_CONTENT_TYPE } from './lib/http'
import { base64ToBytes } from './lib/bytes'
import { reportExecutionStage, reportProviderJobId } from './lib/app-bridge'
import { readReferenceImageAsInlinePart } from './lib/image-io'
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
const HYPER3D_BASE_URL = 'https://api.hyper3d.com'
const IMAGE_QUEUE_PATH = '/workflows/image-queue'
const IMAGE_QUEUE_WORKFLOW_ID = 'IMAGE_QUEUE'
/** Best-effort cancel: app → worker. Mirrors `EXECUTION_WORKER.CANCEL_PATH`. */
const CANCEL_PATH = '/cancel'
/** 助手 LLM 调用日志：app → worker。Mirrors `EXECUTION_WORKER.LLM_CALL_LOG_PATH`. */
const LLM_CALL_LOG_PATH = '/logs/llm-call'
/** 认图（PixAI Tagger）：app → worker → Modal `/tag`。Mirrors `EXECUTION_WORKER.TAG_IMAGE_PATH`. */
const TAG_IMAGE_PATH = '/tag-image'
/** 一行日志最多这么多字段；字段值只收原始类型，⛔ 不收对象和长文。 */
const LLM_CALL_LOG_MAX_FIELDS = 24
const LLM_CALL_LOG_MAX_STRING = 120
/**
 * Mirrors `EXECUTION_INTERNAL.RESOLVE_KEY_PATH` in `src/constants/execution.ts`.
 * The worker bundle can't import from `src/` (separate build), so this is a
 * documented literal copy — keep the two in sync if that path ever moves.
 */
const RESOLVE_KEY_PATH = '/api/internal/execution/resolve-key'
const GEMINI_VIDEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

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

interface WorkerVideoRunContext extends WorkerRunContextBase {
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

interface WorkerAudioRunContext extends WorkerRunContextBase {
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

type WorkerRunContext = WorkerVideoRunContext | WorkerAudioRunContext

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
  }
}

interface WorkerModel3DRunContext {
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

interface RodinSubmitResult {
  jobUuid: string
  subscriptionKey?: string
  statusUrl: string
  downloadUrl: string
}

interface RodinPollResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  error?: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
}

export interface FalQueueSubmitResult {
  requestId: string
  statusUrl: string
  responseUrl: string
}

interface FalQueueStatusResult {
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

// ─── Hyper3D Rodin API ────────────────────────────────────────────────────────

async function submitRodinJob(
  context: WorkerModel3DRunContext,
  apiKey: string,
): Promise<RodinSubmitResult> {
  const { providerInput } = context
  const form = new FormData()

  // Rodin requires binary image upload — fetch and attach as files
  async function appendImageAsFile(url: string, index: number): Promise<void> {
    const imgRes = await fetch(url)
    if (!imgRes.ok)
      throw new Error(
        `Failed to fetch source image (${imgRes.status}): ${url.slice(0, 80)}`,
      )
    const buffer = await imgRes.arrayBuffer()
    const mime = imgRes.headers.get('content-type') ?? 'image/png'
    const ext = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png'
    form.append(
      'images',
      new Blob([buffer], { type: mime }),
      `image_${index}.${ext}`,
    )
  }

  if (providerInput.imageUrl) {
    await appendImageAsFile(providerInput.imageUrl, 0)
  }
  if (providerInput.additionalImageUrls?.length) {
    for (let i = 0; i < providerInput.additionalImageUrls.length; i++) {
      await appendImageAsFile(providerInput.additionalImageUrls[i], i + 1)
    }
  }
  // Field names per official Rodin Gen-2.5 docs:
  // https://developer.hyper3d.ai/api-specification/rodin-gen2.5
  if (providerInput.tier) form.append('tier', providerInput.tier)
  if (providerInput.material) form.append('material', providerInput.material)
  // mesh_mode: 'Raw' (triangle) or 'Quad'. Schema already restricts values.
  if (providerInput.meshMode) {
    form.append('mesh_mode', providerInput.meshMode)
  }
  // quality: extra-low / low / medium / high — controls polygon budget.
  if (providerInput.quality) {
    form.append('quality', providerInput.quality)
  }
  // texture_mode: legacy / extreme-low / low / medium / high.
  if (providerInput.textureMode) {
    form.append('texture_mode', providerInput.textureMode)
  }
  // geometry_instruct_mode: faithful (default) or creative.
  if (providerInput.geometryInstructMode) {
    form.append('geometry_instruct_mode', providerInput.geometryInstructMode)
  }
  // geometry_file_format: glb / usdz / fbx / obj / stl. Defaults to glb so
  // the rest of the pipeline (R2 ingest, ModelViewer) keeps working.
  if (providerInput.geometryFileFormat) {
    form.append('geometry_file_format', providerInput.geometryFileFormat)
  }
  // addons: array of strings sent as repeated multipart fields (not a JSON
  // string). Only 'HighPack' is supported per docs — official curl uses
  // `-F "addons=HighPack"`. JSON.stringify here yields the literal `["HighPack"]`
  // which fails Rodin's per-element validation.
  if (providerInput.highPack) {
    form.append('addons', 'HighPack')
  }
  if (providerInput.taPose != null) {
    form.append('TAPose', String(providerInput.taPose))
  }
  if (providerInput.hdTexture != null) {
    form.append('hd_texture', String(providerInput.hdTexture))
  }
  // texture_delight: boolean — removes lighting info from textures
  if (providerInput.textureDelight != null) {
    form.append('texture_delight', String(providerInput.textureDelight))
  }
  if (providerInput.useOriginalAlpha != null) {
    form.append('use_original_alpha', String(providerInput.useOriginalAlpha))
  }
  if (providerInput.previewRender != null) {
    form.append('preview_render', String(providerInput.previewRender))
  }
  // is_micro: only takes effect on Gen-2.5-Extreme-High tier per docs.
  if (providerInput.isMicro != null) {
    form.append('is_micro', String(providerInput.isMicro))
  }
  if (providerInput.prompt) {
    form.append('prompt', providerInput.prompt)
  }
  if (providerInput.qualityOverride != null) {
    form.append('quality_override', String(providerInput.qualityOverride))
  }
  if (providerInput.seed != null && providerInput.seed >= 0) {
    form.append('seed', String(providerInput.seed))
  }
  // bbox_condition: array of 3 integers [Width(Y), Height(Z), Length(X)]
  if (providerInput.bboxCondition) {
    form.append('bbox_condition', JSON.stringify(providerInput.bboxCondition))
  }

  const response = await fetch(`${HYPER3D_BASE_URL}/api/v2/rodin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'hyper3d_rodin',
      phase: 'submit',
      fallbackMessage: `Hyper3D Rodin submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'hyper3d_rodin',
    phase: 'submit',
    fallbackMessage: 'Hyper3D Rodin submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  // Response shape: { uuid, jobs: { uuids: [...], subscription_key: <JWT> } }
  const jobUuid = readStringField(data, 'uuid')
  const jobsMeta =
    data.jobs != null && typeof data.jobs === 'object'
      ? (data.jobs as Record<string, unknown>)
      : {}
  const subscriptionKey = readStringField(jobsMeta, 'subscription_key')

  if (!jobUuid) {
    throw new Error(
      `Hyper3D Rodin submit returned no job UUID. Response: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  return {
    jobUuid,
    subscriptionKey: subscriptionKey ?? undefined,
    statusUrl: `${HYPER3D_BASE_URL}/api/v2/status`,
    downloadUrl: `${HYPER3D_BASE_URL}/api/v2/download`,
  }
}

/**
 * Texture-only continuation: re-textures an existing mesh GLB without
 * regenerating geometry. Posts to /api/v2/rodin_texture_only with the source
 * mesh + reference image. Returns the same submit shape as submitRodinJob so
 * polling + download can reuse the regular Rodin flow.
 *
 * https://developer.hyper3d.ai/api-specification/generate-texture
 */
async function submitRodinTextureOnlyJob(
  context: WorkerModel3DRunContext,
  apiKey: string,
): Promise<RodinSubmitResult> {
  const { providerInput } = context
  if (!providerInput.parentMeshUrl) {
    throw new Error(
      'rodin_texture_only requires providerInput.parentMeshUrl (GLB to texture).',
    )
  }
  if (!providerInput.imageUrl) {
    throw new Error(
      'rodin_texture_only requires providerInput.imageUrl (reference image).',
    )
  }

  const form = new FormData()

  async function appendBinaryFile(
    fieldName: string,
    url: string,
    fallbackMime: string,
  ): Promise<void> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${fieldName} (${res.status}): ${url.slice(0, 80)}`,
      )
    }
    const buffer = await res.arrayBuffer()
    const mime = res.headers.get('content-type') ?? fallbackMime
    const ext = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('png')
          ? 'png'
          : mime.includes('gltf')
            ? 'glb'
            : 'bin'
    form.append(
      fieldName,
      new Blob([buffer], { type: mime }),
      `${fieldName}.${ext}`,
    )
  }

  await appendBinaryFile('image', providerInput.imageUrl, 'image/png')
  await appendBinaryFile(
    'model',
    providerInput.parentMeshUrl,
    'model/gltf-binary',
  )

  // Per docs: optional prompt / seed / reference_scale / geometry_file_format /
  // material / resolution. We forward everything the user set in the Inspector
  // so the textured output matches their material/format choice.
  if (providerInput.material) form.append('material', providerInput.material)
  if (providerInput.geometryFileFormat) {
    form.append('geometry_file_format', providerInput.geometryFileFormat)
  }
  if (providerInput.prompt) form.append('prompt', providerInput.prompt)
  if (providerInput.seed != null && providerInput.seed >= 0) {
    form.append('seed', String(providerInput.seed))
  }

  const response = await fetch(
    `${HYPER3D_BASE_URL}/api/v2/rodin_texture_only`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  )

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'hyper3d_rodin',
      phase: 'texture_only_submit',
      fallbackMessage: `Hyper3D Rodin texture-only submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'hyper3d_rodin',
    phase: 'texture_only_submit',
    fallbackMessage: 'Hyper3D Rodin texture-only submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const jobUuid = readStringField(data, 'uuid')
  const jobsMeta =
    data.jobs != null && typeof data.jobs === 'object'
      ? (data.jobs as Record<string, unknown>)
      : {}
  const subscriptionKey = readStringField(jobsMeta, 'subscription_key')

  if (!jobUuid) {
    throw new Error(
      `Hyper3D Rodin texture-only submit returned no job UUID. Response: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  return {
    jobUuid,
    subscriptionKey: subscriptionKey ?? undefined,
    statusUrl: `${HYPER3D_BASE_URL}/api/v2/status`,
    downloadUrl: `${HYPER3D_BASE_URL}/api/v2/download`,
  }
}

function mapRodinStatus(
  raw: string,
): 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
  // Official status values from /api/v2/status: Waiting, Generating, Done, Failed
  // https://developer.hyper3d.ai/api-specification/check-status
  const s = raw.toLowerCase()
  if (s === 'done' || s === 'succeeded' || s === 'completed') return 'COMPLETED'
  if (s === 'failed' || s === 'error') return 'FAILED'
  if (s === 'generating' || s === 'running' || s === 'processing')
    return 'IN_PROGRESS'
  return 'IN_QUEUE'
}

async function pollRodinJob(
  rodin: RodinSubmitResult,
  apiKey: string,
): Promise<RodinPollResult> {
  // Per official docs: POST application/json with { subscription_key }
  // https://developer.hyper3d.ai/api-specification/check-status
  const response = await fetch(rodin.statusUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription_key: rodin.subscriptionKey,
    }),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'hyper3d_rodin',
      phase: 'status_poll',
      fallbackMessage: `Hyper3D Rodin status poll failed with status ${response.status}`,
      requestId: rodin.jobUuid,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const pollFailure = createProviderPayloadError(data, {
    provider: 'hyper3d_rodin',
    phase: 'status_poll',
    fallbackMessage: 'Hyper3D Rodin status response reported failure.',
    requestId: rodin.jobUuid,
  })
  if (pollFailure) {
    return {
      status: 'FAILED',
      error: pollFailure.message,
      errorCode: pollFailure.errorCode,
      providerMetadata: pollFailure.providerMetadata,
    }
  }

  console.log('[Rodin] poll response:', JSON.stringify(data).slice(0, 400))
  const jobs = Array.isArray(data.jobs) ? data.jobs : []
  const messages = Array.isArray(data.status_messages)
    ? data.status_messages
    : jobs

  if (messages.length === 0) return { status: 'IN_PROGRESS' }

  const statuses = (messages as Array<Record<string, unknown>>)
    .map((m) => readStringField(m, 'status') ?? '')
    .map(mapRodinStatus)

  if (statuses.some((s) => s === 'FAILED')) {
    const failedJob = (messages as Array<Record<string, unknown>>).find(
      (m) => mapRodinStatus(readStringField(m, 'status') ?? '') === 'FAILED',
    )
    const failMsg =
      readStringField(failedJob ?? {}, 'message') ??
      readStringField(failedJob ?? {}, 'error') ??
      JSON.stringify(failedJob)
    console.error(
      '[Rodin] Job FAILED:',
      failMsg,
      'full response:',
      JSON.stringify(data).slice(0, 500),
    )
    return {
      status: 'FAILED',
      error: failMsg,
      providerMetadata: {
        provider: 'hyper3d_rodin',
        phase: 'status_poll',
        jobUuid: rodin.jobUuid,
      },
    }
  }
  if (statuses.every((s) => s === 'COMPLETED')) return { status: 'COMPLETED' }
  if (statuses.some((s) => s === 'IN_PROGRESS'))
    return { status: 'IN_PROGRESS' }
  return { status: 'IN_QUEUE' }
}

async function downloadAndUploadRodinGlb(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
  rodin: RodinSubmitResult,
  apiKey: string,
): Promise<{ artifactUrl: string; glbR2Key: string }> {
  // Step 1: Ask Rodin for the file list (returns JSON with download URLs)
  // Per official docs: POST application/json with { task_uuid }
  // https://developer.hyper3d.ai/api-specification/download-results
  const listResponse = await fetch(rodin.downloadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task_uuid: rodin.jobUuid }),
  })

  if (!listResponse.ok) {
    const errBody = await listResponse.text().catch(() => '')
    throw new Error(
      `Hyper3D Rodin download list failed (${listResponse.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const listData = (await listResponse.json()) as Record<string, unknown>
  console.log('[Rodin] download list:', JSON.stringify(listData).slice(0, 400))

  const list = Array.isArray(listData.list) ? listData.list : []
  const glbFile = (list as Array<Record<string, unknown>>).find((f) => {
    const name = readStringField(f, 'name') ?? ''
    return name.toLowerCase().endsWith('.glb')
  })

  if (!glbFile) {
    throw new Error(
      `Hyper3D Rodin download list has no GLB file. Response: ${JSON.stringify(listData).slice(0, 300)}`,
    )
  }

  const glbUrl = readStringField(glbFile, 'url')
  if (!glbUrl) {
    throw new Error('Hyper3D Rodin GLB entry has no url.')
  }

  // Step 2: Fetch the GLB binary
  const glbResponse = await fetch(glbUrl)
  if (!glbResponse.ok) {
    throw new Error(
      `Hyper3D Rodin GLB binary download failed with status ${glbResponse.status}`,
    )
  }

  const glbBuffer = await glbResponse.arrayBuffer()
  const glbR2Key = `3d/${context.runId}/${rodin.jobUuid}.glb`

  await env.GENERATION_BUCKET.put(glbR2Key, glbBuffer, {
    httpMetadata: {
      contentType: 'model/gltf-binary',
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return { artifactUrl: `${env.R2_PUBLIC_URL}/${glbR2Key}`, glbR2Key }
}

// ─── fal.ai model-3D (Hunyuan3D) ─────────────────────────────────────────────

function buildFalModel3DQueueRequest(context: WorkerModel3DRunContext): {
  endpointModelId: string
  input: Record<string, unknown>
} {
  const { providerInput } = context
  const input: Record<string, unknown> = {
    image_url: providerInput.imageUrl,
  }

  if (providerInput.seed != null) input.seed = providerInput.seed
  if (providerInput.removeBackground != null)
    input.remove_background = providerInput.removeBackground
  if (providerInput.enablePbr != null)
    input.enable_pbr = providerInput.enablePbr
  if (providerInput.faceCount != null)
    input.face_count = providerInput.faceCount
  if (providerInput.octreeResolution != null)
    input.octree_resolution = providerInput.octreeResolution
  if (providerInput.generateType != null)
    input.generate_type = providerInput.generateType
  if (providerInput.polygonType != null)
    input.polygon_type = providerInput.polygonType

  return { endpointModelId: providerInput.externalModelId, input }
}

/**
 * Hunyuan3D's fal queue submit. Extracted from `Hunyuan3DWorkflow` so the
 * providerJobId report below is reachable from tests — the workflow step body
 * itself isn't.
 */
export async function submitFalModel3DQueue(
  context: WorkerModel3DRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  const queueBody = buildFalModel3DQueueRequest(context)
  const endpoint = `https://queue.fal.run/${queueBody.endpointModelId}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(queueBody.input),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'model_3d_queue_submit',
      fallbackMessage: `fal.ai 3D queue submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'model_3d_queue_submit',
    fallbackMessage: 'fal.ai 3D queue submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai 3D queue submit returned invalid response.')
  }

  // Same `{model_id}/requests/{request_id}` shape cancelProviderJob's fal
  // branch expects — a bare request id would 404 there.
  await reportProviderJobId(
    env,
    context,
    `${queueBody.endpointModelId}/requests/${requestId}`,
  )

  return { requestId, statusUrl, responseUrl }
}

function readFalModel3DResult(resultData: Record<string, unknown>): {
  artifactUrl: string | null
  mimeType: string
} {
  // Hunyuan3D typically returns { model_mesh: { url, content_type } }
  const mesh = isRecord(resultData.model_mesh) ? resultData.model_mesh : null
  if (mesh) {
    return {
      artifactUrl: readStringField(mesh, 'url'),
      mimeType: readStringField(mesh, 'content_type') ?? 'model/gltf-binary',
    }
  }
  // Fallback: some endpoints return { glb: { url } }
  const glb = isRecord(resultData.glb) ? resultData.glb : null
  if (glb) {
    return {
      artifactUrl: readStringField(glb, 'url'),
      mimeType: 'model/gltf-binary',
    }
  }
  return { artifactUrl: null, mimeType: 'model/gltf-binary' }
}

async function downloadAndUploadModel3DArtifact(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
  artifactUrl: string,
  mimeType: string,
): Promise<{ artifactUrl: string; glbR2Key: string }> {
  const response = await fetch(artifactUrl)
  if (!response.ok) {
    throw new Error(
      `3D artifact download failed with status ${response.status}`,
    )
  }

  const buffer = await response.arrayBuffer()
  const glbR2Key = `3d/${context.runId}/model.glb`

  await env.GENERATION_BUCKET.put(glbR2Key, buffer, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${glbR2Key}`,
    glbR2Key,
  }
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

function buildFalWorkerAudioQueueRequest(context: WorkerAudioRunContext): {
  endpointModelId: string
  input: Record<string, unknown>
  isDocumentationVerified: boolean
} {
  if (!context.providerInput.referenceAudioUrl) {
    throw new Error('fal.ai F5-TTS requires referenceAudioUrl.')
  }

  const body: Record<string, unknown> = {
    gen_text: context.providerInput.prompt,
    ref_audio_url: context.providerInput.referenceAudioUrl,
    model_type: 'F5-TTS',
    remove_silence: true,
  }

  if (context.providerInput.referenceText) {
    body.ref_text = context.providerInput.referenceText
  }

  return {
    endpointModelId: context.providerInput.externalModelId,
    input: body,
    isDocumentationVerified: true,
  }
}

function buildFalWorkerQueueRequest(context: WorkerRunContext): {
  endpointModelId: string
  input: Record<string, unknown>
  isDocumentationVerified: boolean
} {
  if (context.outputType === 'AUDIO') {
    return buildFalWorkerAudioQueueRequest(context)
  }

  return buildFalWorkerVideoQueueRequest(context)
}

export async function submitFalQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  const queueBody = buildFalWorkerQueueRequest(context)
  const baseUrl = 'https://queue.fal.run'
  const endpoint = `${baseUrl}/${queueBody.endpointModelId}`

  if (!queueBody.isDocumentationVerified) {
    // TODO(video-payload-audit): replace this warning after the provider
    // publishes a current schema page for this endpoint.
    console.warn('fal.ai worker request body uses unverified schema', {
      modelId: context.providerInput.modelId,
      endpoint,
      body: queueBody.input,
    })
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(queueBody.input),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'queue_submit',
      fallbackMessage: `fal.ai queue submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'queue_submit',
    fallbackMessage: 'fal.ai queue submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai queue submit returned an invalid response.')
  }

  // fal's cancel endpoint is per-model (PUT
  // https://queue.fal.run/{model_id}/requests/{request_id}/cancel), so the
  // bare request_id alone can't address it — report the full path segment
  // that cancelProviderJob already expects in `providerJobId`.
  const providerJobId = `${queueBody.endpointModelId}/requests/${requestId}`
  await reportProviderJobId(env, context, providerJobId)

  return { requestId, statusUrl, responseUrl }
}

// ─── MiniMax (H3) video — native direct, both stations ───────────
// The second video provider on this workflow. fal stays the default; anything
// routed here goes to MiniMax's own async face instead of queue.fal.run.

export async function submitMiniMaxQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.outputType !== 'VIDEO') {
    throw new Error('MiniMax adapter handles VIDEO output only.')
  }

  const baseUrl = miniMaxBaseUrl(context.providerId)
  const endpoint = `${baseUrl}/video_generation`
  const body = buildMiniMaxVideoRequest({
    prompt: context.providerInput.prompt,
    modelId: context.providerInput.modelId,
    externalModelId: context.providerInput.externalModelId,
    aspectRatio: context.providerInput.aspectRatio,
    duration: context.providerInput.duration,
    referenceImage: context.providerInput.referenceImage,
    referenceImages: context.providerInput.referenceImages,
    videoUrls: context.providerInput.videoUrls,
    audioUrls: context.providerInput.audioUrls,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: context.providerId,
      phase: 'queue_submit',
      fallbackMessage: `MiniMax submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: context.providerId,
    phase: 'queue_submit',
    fallbackMessage: 'MiniMax submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const taskId = readStringField(data, 'task_id')
  if (!taskId) {
    throw new Error('MiniMax submit returned no task_id.')
  }

  await reportProviderJobId(env, context, taskId)

  // MiniMax has a single query endpoint — status and result come back
  // together, so statusUrl and responseUrl are deliberately the same URL.
  const queryUrl = `${baseUrl}/query/video_generation/${taskId}`
  return { requestId: taskId, statusUrl: queryUrl, responseUrl: queryUrl }
}

async function pollMiniMaxQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
  providerId: string,
): Promise<FalQueueStatusResult> {
  const response = await fetch(queue.statusUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: providerId,
      phase: 'status_poll',
      fallbackMessage: `MiniMax status poll failed with status ${response.status}`,
      requestId: queue.requestId,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const task = isRecord(data.task) ? data.task : null
  if (!task) {
    throw new Error('MiniMax status response did not include a task object.')
  }

  const rawStatus = readStringField(task, 'status') ?? ''
  const status = mapMiniMaxStatus(rawStatus)
  const providerMetadata = {
    requestId: queue.requestId,
    statusUrl: queue.statusUrl,
    providerStatus: rawStatus,
  }

  if (status === 'FAILED') {
    return {
      status: 'FAILED',
      error: readStringField(task, 'error') ?? `MiniMax task ${rawStatus}.`,
      providerMetadata,
    }
  }

  if (status !== 'COMPLETED') {
    return { status, providerMetadata }
  }

  const content = isRecord(task.content) ? task.content : null
  const artifactUrl = content ? readStringField(content, 'url') : null
  if (!artifactUrl) {
    throw createProviderNoOutputError({
      provider: providerId,
      phase: 'result_fetch',
      message: 'MiniMax task succeeded but returned no video URL.',
      requestId: queue.requestId,
      providerMetadata,
    })
  }

  return { status: 'COMPLETED', artifactUrl, providerMetadata }
}

// ─── VolcEngine (火山方舟) Seedance video ─────────────────────────
// Direct Ark API. The reason this exists: fal resells the same Seedance models
// at ~2.2× the Ark price, and until this branch landed the Ark route was
// catalog-only (the service 501'd on anything that wasn't fal).

export async function submitVolcEngineQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.outputType !== 'VIDEO') {
    throw new Error('VolcEngine video branch handles VIDEO output only.')
  }

  const baseUrl = (
    context.providerInput.providerBaseUrl ?? VOLCENGINE_DEFAULT_BASE_URL
  ).replace(/\/$/, '')
  const endpoint = `${baseUrl}/contents/generations/tasks`
  const body = buildVolcEngineVideoRequest({
    prompt: context.providerInput.prompt,
    modelId: context.providerInput.modelId,
    externalModelId: context.providerInput.externalModelId,
    aspectRatio: context.providerInput.aspectRatio,
    duration: context.providerInput.duration,
    referenceImage: context.providerInput.referenceImage,
    referenceImages: context.providerInput.referenceImages,
    videoUrls: context.providerInput.videoUrls,
    audioUrls: context.providerInput.audioUrls,
    resolution: context.providerInput.resolution,
    videoDefaults: context.providerInput.videoDefaults,
    generateAudio: context.providerInput.generateAudio,
    seed: context.providerInput.seed,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: context.providerId,
      phase: 'queue_submit',
      fallbackMessage: `VolcEngine submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: context.providerId,
    phase: 'queue_submit',
    fallbackMessage: 'VolcEngine submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const taskId = readStringField(data, 'id')
  if (!taskId) {
    throw new Error('VolcEngine submit returned no task id.')
  }

  await reportProviderJobId(env, context, taskId)

  // Ark serves status and result from one endpoint, so both URLs are the same.
  const taskUrl = `${baseUrl}/contents/generations/tasks/${taskId}`
  return { requestId: taskId, statusUrl: taskUrl, responseUrl: taskUrl }
}

async function pollVolcEngineQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
  providerId: string,
): Promise<FalQueueStatusResult> {
  const response = await fetch(queue.statusUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: providerId,
      phase: 'status_poll',
      fallbackMessage: `VolcEngine status poll failed with status ${response.status}`,
      requestId: queue.requestId,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const rawStatus = readStringField(data, 'status') ?? ''
  const status = mapVolcEngineStatus(rawStatus)
  const providerMetadata = {
    requestId: queue.requestId,
    statusUrl: queue.statusUrl,
    providerStatus: rawStatus,
  }

  if (status === 'FAILED') {
    const error = isRecord(data.error) ? data.error : null
    return {
      status: 'FAILED',
      error:
        (error ? readStringField(error, 'message') : null) ??
        `VolcEngine task ${rawStatus}.`,
      errorCode: error
        ? (readStringField(error, 'code') ?? undefined)
        : undefined,
      providerMetadata,
    }
  }

  if (status !== 'COMPLETED') {
    return { status, providerMetadata }
  }

  const content = isRecord(data.content) ? data.content : null
  const artifactUrl = content ? readStringField(content, 'video_url') : null
  if (!artifactUrl) {
    throw createProviderNoOutputError({
      provider: providerId,
      phase: 'result_fetch',
      message: 'VolcEngine task succeeded but returned no video URL.',
      requestId: queue.requestId,
      providerMetadata,
    })
  }

  // `return_last_frame: true` in the request body is what makes this available;
  // it doubles as the poster frame downstream.
  const thumbnailUrl = content
    ? (readStringField(content, 'last_frame_url') ?? undefined)
    : undefined

  return { status: 'COMPLETED', artifactUrl, thumbnailUrl, providerMetadata }
}

// ─── Provider dispatch ───────────────────────────────────────────
// One seam for both call sites in CinematicShortVideoWorkflow. fal remains the
// fallthrough so existing routes are untouched by adding providers here.

export async function submitGeminiVideoQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.outputType !== 'VIDEO')
    throw new Error('Gemini requires video input.')
  const input = context.providerInput
  if (input.audioUrls?.length || input.videoUrls?.length) {
    throw new Error(
      'Gemini video execution supports text and image references only.',
    )
  }
  if (!['16:9', '9:16'].includes(input.aspectRatio)) {
    throw new Error('Gemini video requires a 16:9 or 9:16 aspect ratio.')
  }
  const references = [
    ...new Set([
      ...(input.referenceImage ? [input.referenceImage] : []),
      ...(input.referenceImages ?? []),
    ]),
  ]
  const parts: Record<string, unknown>[] = []
  for (const reference of references) {
    const part = await readReferenceImageAsInlinePart(reference)
    const image = part.inlineData as { mimeType: string; data: string }
    parts.push({ type: 'image', mime_type: image.mimeType, data: image.data })
  }
  parts.push({ type: 'text', text: input.prompt })
  // URI delivery keeps video bytes out of durable workflow state. Unary
  // generation avoids GET /interactions returning inline video despite URI delivery.
  const response = await fetch(`${GEMINI_VIDEO_BASE_URL}/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': JSON_CONTENT_TYPE },
    body: JSON.stringify({
      model: input.externalModelId,
      input: parts,
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        delivery: 'uri',
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution ?? '720p',
      },
    }),
    signal: AbortSignal.timeout(context.timeoutMs),
  })
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'gemini',
      phase: 'queue_submit',
      fallbackMessage: 'Gemini video generation failed.',
    })
  }
  const data: unknown = await response.json()
  if (!isRecord(data)) throw new Error('Invalid Gemini interaction response.')
  const failure = createProviderPayloadError(data, {
    provider: 'gemini',
    phase: 'queue_submit',
    fallbackMessage: 'Gemini video generation failed.',
  })
  if (failure) throw failure
  const steps = Array.isArray(data.steps) ? data.steps : []
  const video = steps
    .flatMap((step) =>
      isRecord(step) &&
      step.type === 'model_output' &&
      Array.isArray(step.content)
        ? step.content
        : [],
    )
    .find((part: unknown) => isRecord(part) && part.type === 'video')
  const uri = isRecord(video) ? readStringField(video, 'uri') : null
  const requestId = readStringField(data, 'id')
  if (!uri || !requestId || data.status !== 'completed') {
    throw createProviderNoOutputError({
      provider: 'gemini',
      phase: 'queue_submit',
      message: 'Gemini did not return a completed video file.',
    })
  }
  // Reconstruct both URLs from a validated file name; never attach BYOK to
  // an arbitrary URI or persist provider query parameters in workflow state.
  const fileUrl = new URL(uri)
  const match = fileUrl.pathname.match(
    /^\/v1beta\/files\/([A-Za-z0-9_-]+)(?::download)?$/,
  )
  if (fileUrl.origin !== new URL(GEMINI_VIDEO_BASE_URL).origin || !match) {
    throw new Error('Gemini returned an invalid video file URI.')
  }
  const statusUrl = `${GEMINI_VIDEO_BASE_URL}/files/${match[1]}`
  await reportProviderJobId(env, context, requestId)
  return {
    requestId,
    statusUrl,
    responseUrl: `${statusUrl}:download?alt=media`,
  }
}

export async function pollGeminiVideoQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
): Promise<FalQueueStatusResult> {
  const response = await fetch(queue.statusUrl, {
    headers: { 'x-goog-api-key': apiKey },
  })
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'gemini',
      phase: 'provider_poll',
      fallbackMessage: 'Gemini video file polling failed.',
    })
  }
  const data: unknown = await response.json()
  if (!isRecord(data)) throw new Error('Invalid Gemini file response.')
  if (data.state === 'FAILED') {
    return { status: 'FAILED', error: 'Gemini video file processing failed.' }
  }
  if (data.state === 'PROCESSING') return { status: 'IN_PROGRESS' }
  if (data.state !== 'ACTIVE')
    throw new Error('Unknown Gemini video file state.')
  return {
    status: 'COMPLETED',
    artifactUrl: queue.responseUrl,
    mimeType: 'video/mp4',
    providerMetadata: { requestId: queue.requestId },
  }
}

async function submitProviderQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.providerId === 'gemini') {
    return submitGeminiVideoQueue(context, apiKey, env)
  }
  if (isMiniMaxProviderId(context.providerId)) {
    return submitMiniMaxQueue(context, apiKey, env)
  }
  if (isVolcEngineProviderId(context.providerId)) {
    return submitVolcEngineQueue(context, apiKey, env)
  }
  return submitFalQueue(context, apiKey, env)
}

async function pollProviderQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
  context: WorkerRunContext,
): Promise<FalQueueStatusResult> {
  if (context.providerId === 'gemini') {
    return pollGeminiVideoQueue(queue, apiKey)
  }
  if (isMiniMaxProviderId(context.providerId)) {
    return pollMiniMaxQueue(queue, apiKey, context.providerId)
  }
  if (isVolcEngineProviderId(context.providerId)) {
    return pollVolcEngineQueue(queue, apiKey, context.providerId)
  }
  return pollFalQueue(queue, apiKey, context.outputType)
}

interface FishAudioSubmitResult {
  artifactUrl: string
  audioR2Key: string
  mimeType: string
  duration?: number
  providerMetadata: Record<string, unknown>
}

function getAudioMimeSubtype(format: string): string {
  if (format === 'mp3') return 'mpeg'
  return format
}

function getAudioMimeType(format: string): string {
  return `audio/${getAudioMimeSubtype(format)}`
}

function getEstimatedAudioDuration(
  byteLength: number,
  format: string,
  sampleRate?: number,
): number {
  if (format === 'wav') {
    const bytesPerSecond = (sampleRate ?? 44100) * 2
    return Math.max(1, Math.round(byteLength / bytesPerSecond))
  }

  const bytesPerSecond = format === 'opus' ? 4000 : 16000
  return Math.max(1, Math.round(byteLength / bytesPerSecond))
}

function appendDefinedBodyValue(
  body: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    body[key] = value
  }
}

function buildFishAudioRequestBody(
  context: WorkerAudioRunContext,
): Record<string, unknown> {
  const { providerInput } = context
  const outputFormat = providerInput.format ?? 'mp3'
  const body: Record<string, unknown> = {
    text: providerInput.prompt,
    format: outputFormat,
    normalize: providerInput.normalizeText ?? true,
  }

  appendDefinedBodyValue(body, 'sample_rate', providerInput.sampleRate)

  if (providerInput.speakerVoiceIds?.length) {
    body.reference_id = providerInput.speakerVoiceIds
  } else if (providerInput.voiceId) {
    body.reference_id = providerInput.voiceId
  } else if (providerInput.referenceAudioUrl && providerInput.referenceText) {
    body.references = [
      {
        audio: providerInput.referenceAudioUrl,
        text: providerInput.referenceText.trim(),
      },
    ]
  } else {
    throw new Error(
      'Fish Audio requires a voice ID or a reference audio/transcript pair.',
    )
  }

  const prosody: Record<string, unknown> = {}
  appendDefinedBodyValue(prosody, 'speed', providerInput.speed)
  appendDefinedBodyValue(prosody, 'volume', providerInput.volume)
  appendDefinedBodyValue(
    prosody,
    'normalize_loudness',
    providerInput.normalizeLoudness,
  )
  if (Object.keys(prosody).length > 0) {
    body.prosody = prosody
  }

  if (outputFormat === 'mp3') {
    appendDefinedBodyValue(body, 'mp3_bitrate', providerInput.mp3Bitrate)
  }
  if (outputFormat === 'opus') {
    appendDefinedBodyValue(body, 'opus_bitrate', providerInput.opusBitrate)
  }

  appendDefinedBodyValue(body, 'latency', providerInput.latency)
  appendDefinedBodyValue(body, 'temperature', providerInput.temperature)
  appendDefinedBodyValue(body, 'top_p', providerInput.topP)
  appendDefinedBodyValue(body, 'chunk_length', providerInput.chunkLength)
  appendDefinedBodyValue(
    body,
    'repetition_penalty',
    providerInput.repetitionPenalty,
  )

  return body
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return combined
}

function parseFishTimestampEvent(
  eventText: string,
  chunks: Uint8Array[],
): number | null {
  const dataLine = eventText
    .split('\n')
    .find((line) => line.startsWith('data: '))
  if (!dataLine) return null

  const event = JSON.parse(dataLine.slice(6)) as unknown
  if (!isRecord(event)) return null

  const audioBase64 = readStringField(event, 'audio_base64')
  if (audioBase64) {
    chunks.push(base64ToBytes(audioBase64))
  }

  const offset = readNumberField(event, 'chunk_audio_offset_sec') ?? 0
  const alignment = isRecord(event.alignment) ? event.alignment : null
  const audioDuration = alignment
    ? (readNumberField(alignment, 'audio_duration') ?? 0)
    : 0

  return audioDuration > 0 ? offset + audioDuration : null
}

async function parseFishTimestampStream(response: Response): Promise<{
  audioBytes: Uint8Array
  duration?: number
  chunkCount: number
}> {
  if (!response.body) {
    throw new Error('Fish Audio timestamp stream returned an empty body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let buffer = ''
  let duration = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventText of events) {
      duration = Math.max(
        duration,
        parseFishTimestampEvent(eventText, chunks) ?? 0,
      )
    }
  }

  if (buffer.trim()) {
    duration = Math.max(duration, parseFishTimestampEvent(buffer, chunks) ?? 0)
  }

  return {
    audioBytes: concatUint8Arrays(chunks),
    duration: duration > 0 ? Math.round(duration) : undefined,
    chunkCount: chunks.length,
  }
}

/** 念一段（分段里的一段）：按字数给 `max_new_tokens`，回来的 mp3 按码率算时长。 */
async function synthesizeFishSegment(
  context: WorkerAudioRunContext,
  url: string,
  apiKey: string,
  segment: string,
): Promise<{ audioBytes: Uint8Array; seconds: number }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
      model: context.providerInput.externalModelId,
    },
    body: JSON.stringify({
      ...buildFishAudioRequestBody(context),
      text: segment,
      max_new_tokens: fishSegmentMaxTokens(segment),
    }),
  })
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fish_audio',
      phase: 'tts',
      fallbackMessage: `Fish Audio TTS failed with status ${response.status}`,
      providerMetadata: {
        endpointPath: '/v1/tts',
        model: context.providerInput.externalModelId,
      },
    })
  }
  const audioBytes = new Uint8Array(await response.arrayBuffer())
  // 码率（kbps）× 125 = 每秒字节数；Fish 默认 128。
  const bytesPerSecond = (context.providerInput.mp3Bitrate ?? 128) * 125
  return { audioBytes, seconds: audioBytes.byteLength / bytesPerSecond }
}

/**
 * 按行分段念、再首尾拼成一条（owner 10-30「一口气说不完就分段说」）：每段按字数给上限，撞上限（没收住、
 * 后面全是语气声）的那段重念一次，取短的那版。几段一起念，顺序不变。
 */
async function synthesizeFishSegments(
  context: WorkerAudioRunContext,
  url: string,
  apiKey: string,
): Promise<{
  audioBytes: Uint8Array
  duration: undefined
  chunkCount: number
}> {
  const segments = splitFishSegments(context.providerInput.prompt)
  const parts: Uint8Array[] = new Array(segments.length)
  let next = 0
  const worker = async () => {
    while (next < segments.length) {
      const index = next
      next += 1
      const segment = segments[index]!
      let take = await synthesizeFishSegment(context, url, apiKey, segment)
      if (fishSegmentRanAway(segment, take.seconds)) {
        const again = await synthesizeFishSegment(context, url, apiKey, segment)
        if (again.seconds < take.seconds) take = again
      }
      parts[index] = take.audioBytes
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(FISH_SEGMENTS.concurrency, segments.length) },
      worker,
    ),
  )
  return {
    audioBytes: concatUint8Arrays(parts),
    duration: undefined,
    chunkCount: segments.length,
  }
}

async function submitFishAudio(
  env: ExecutionEnv,
  context: WorkerAudioRunContext,
  apiKey: string,
): Promise<FishAudioSubmitResult> {
  const { providerInput } = context
  const outputFormat = providerInput.format ?? 'mp3'
  const mimeType = getAudioMimeType(outputFormat)
  const endpointPath = providerInput.withTimestamps
    ? '/v1/tts/stream/with-timestamp'
    : '/v1/tts'
  const baseUrl = (
    providerInput.providerBaseUrl ?? 'https://api.fish.audio'
  ).replace(/\/$/, '')

  // 一段话按行分段生成再拼（owner 10-30）：mp3 能直接首尾相接；多人合成、带时间戳的流照旧一次念完。
  const segmented =
    !providerInput.withTimestamps &&
    outputFormat === 'mp3' &&
    !providerInput.speakerVoiceIds?.length

  const response = segmented
    ? null
    : await fetch(`${baseUrl}${endpointPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': JSON_CONTENT_TYPE,
          model: providerInput.externalModelId,
        },
        body: JSON.stringify(buildFishAudioRequestBody(context)),
      })

  if (response && !response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fish_audio',
      phase: 'tts',
      fallbackMessage: `Fish Audio TTS failed with status ${response.status}`,
      providerMetadata: {
        endpointPath,
        model: providerInput.externalModelId,
      },
    })
  }

  const parsed = !response
    ? await synthesizeFishSegments(context, `${baseUrl}${endpointPath}`, apiKey)
    : providerInput.withTimestamps
      ? await parseFishTimestampStream(response)
      : {
          audioBytes: new Uint8Array(await response.arrayBuffer()),
          duration: undefined,
          chunkCount: undefined,
        }

  if (parsed.audioBytes.byteLength === 0) {
    throw createProviderNoOutputError({
      provider: 'fish_audio',
      phase: 'tts',
      message: 'Fish Audio returned an empty audio response.',
      providerMetadata: {
        endpointPath,
        model: providerInput.externalModelId,
      },
    })
  }

  const duration =
    parsed.duration ??
    getEstimatedAudioDuration(
      parsed.audioBytes.byteLength,
      outputFormat,
      providerInput.sampleRate,
    )
  const audioR2Key =
    providerInput.outputStorageKey ??
    `generations/worker/audio/${context.runId}/output.${outputFormat}`

  await env.GENERATION_BUCKET.put(audioR2Key, parsed.audioBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, audioR2Key),
    audioR2Key,
    mimeType,
    duration,
    providerMetadata: {
      endpointPath,
      model: providerInput.externalModelId,
      format: outputFormat,
      ...(parsed.chunkCount !== undefined && {
        timestampChunkCount: parsed.chunkCount,
      }),
    },
  }
}

async function downloadAndUploadAudioArtifact(
  env: ExecutionEnv,
  context: WorkerAudioRunContext,
  artifactUrl: string,
  mimeType: string,
): Promise<{ artifactUrl: string; audioR2Key: string }> {
  const response = await fetch(artifactUrl)
  if (!response.ok) {
    throw new Error(
      `Audio artifact download failed with status ${response.status}`,
    )
  }

  const audioBytes = await response.arrayBuffer()
  const outputFormat = context.providerInput.format ?? 'wav'
  const audioR2Key =
    context.providerInput.outputStorageKey ??
    `generations/worker/audio/${context.runId}/output.${outputFormat}`

  await env.GENERATION_BUCKET.put(audioR2Key, audioBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, audioR2Key),
    audioR2Key,
  }
}

async function downloadAndUploadVideoArtifact(
  env: ExecutionEnv,
  context: WorkerVideoRunContext,
  artifactUrl: string,
  mimeType: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ artifactUrl: string; videoR2Key: string }> {
  return downloadAndUploadVideoArtifactToKey(
    env,
    artifactUrl,
    mimeType,
    context.providerInput.outputStorageKey ??
      `generations/worker/video/${context.runId}/output.mp4`,
    fetchHeaders,
  )
}

async function downloadAndUploadVideoArtifactToKey(
  env: ExecutionEnv,
  artifactUrl: string,
  mimeType: string,
  videoR2Key: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ artifactUrl: string; videoR2Key: string }> {
  let response = await fetch(artifactUrl, {
    headers: fetchHeaders,
    ...(fetchHeaders ? { redirect: 'manual' as const } : {}),
  })
  if (fetchHeaders && response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Video download redirect has no location.')
    const target = new URL(location, artifactUrl)
    if (target.protocol !== 'https:') {
      throw new Error('Video download redirect requires HTTPS.')
    }
    await response.body?.cancel()
    // Google may redirect to a signed media URL. It needs no API key; custom
    // x-goog-api-key headers are otherwise forwarded by fetch across origins.
    response = await fetch(target.toString())
  }
  if (!response.ok) {
    throw new Error(
      `Video artifact download failed with status ${response.status}`,
    )
  }

  const videoBytes = await response.arrayBuffer()

  await env.GENERATION_BUCKET.put(videoR2Key, videoBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, videoR2Key),
    videoR2Key,
  }
}

function readFalAudioArtifact(resultData: Record<string, unknown>): {
  artifactUrl: string | null
  mimeType?: string
} {
  const audioUrl = isRecord(resultData.audio_url) ? resultData.audio_url : null
  const audio = isRecord(resultData.audio) ? resultData.audio : null
  const audioRecord = audioUrl ?? audio

  if (!audioRecord) return { artifactUrl: null }

  return {
    artifactUrl: readStringField(audioRecord, 'url'),
    mimeType: readStringField(audioRecord, 'content_type') ?? undefined,
  }
}

async function pollFalQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
  outputType: WorkerRunContext['outputType'],
): Promise<FalQueueStatusResult> {
  const statusResponse = await fetch(queue.statusUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!statusResponse.ok) {
    throw await createProviderResponseError(statusResponse, {
      provider: 'fal',
      phase: 'status_poll',
      fallbackMessage: `fal.ai status poll failed with status ${statusResponse.status}`,
      requestId: queue.requestId,
    })
  }

  const statusData = (await statusResponse.json()) as Record<string, unknown>
  const status = readStringField(statusData, 'status')
  const statusFailure = createProviderPayloadError(statusData, {
    provider: 'fal',
    phase: 'status_poll',
    fallbackMessage: 'fal.ai queue reported failed status.',
    requestId: queue.requestId,
    providerMetadata: {
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  })

  if (statusFailure) {
    return {
      status: 'FAILED',
      error: statusFailure.message,
      errorCode: statusFailure.errorCode,
      providerMetadata: statusFailure.providerMetadata,
    }
  }
  if (status && isFalQueueFailureStatus(status)) {
    return {
      status: 'FAILED',
      error: 'fal.ai queue reported failed status.',
      providerMetadata: {
        requestId: queue.requestId,
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    }
  }
  if (status !== 'COMPLETED') {
    return {
      status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE',
      providerMetadata: { requestId: queue.requestId },
    }
  }

  const resultResponse = await fetch(queue.responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!resultResponse.ok) {
    throw await createProviderResponseError(resultResponse, {
      provider: 'fal',
      phase: 'result_fetch',
      fallbackMessage: `fal.ai result fetch failed with status ${resultResponse.status}`,
      requestId: queue.requestId,
      providerMetadata: {
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    })
  }

  const resultData = (await resultResponse.json()) as Record<string, unknown>
  const resultFailure = createProviderPayloadError(resultData, {
    provider: 'fal',
    phase: 'result_fetch',
    fallbackMessage: 'fal.ai result response reported failure.',
    requestId: queue.requestId,
    providerMetadata: {
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  })
  if (resultFailure) {
    return {
      status: 'FAILED',
      error: resultFailure.message,
      errorCode: resultFailure.errorCode,
      providerMetadata: resultFailure.providerMetadata,
    }
  }

  if (outputType === 'AUDIO') {
    const audio = readFalAudioArtifact(resultData)
    if (!audio.artifactUrl) {
      throw createProviderNoOutputError({
        provider: 'fal',
        phase: 'result_fetch',
        message: 'fal.ai result response did not include an audio URL.',
        requestId: queue.requestId,
        providerMetadata: {
          statusUrl: queue.statusUrl,
          responseUrl: queue.responseUrl,
        },
      })
    }

    return {
      status: 'COMPLETED',
      artifactUrl: audio.artifactUrl,
      mimeType: audio.mimeType ?? 'audio/wav',
      providerMetadata: {
        requestId: queue.requestId,
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    }
  }

  const video = isRecord(resultData.video) ? resultData.video : null
  const artifactUrl = video ? readStringField(video, 'url') : null
  const thumbnail = isRecord(resultData.thumbnail) ? resultData.thumbnail : null
  const thumbnailUrl = thumbnail ? readStringField(thumbnail, 'url') : null

  if (!artifactUrl) {
    throw createProviderNoOutputError({
      provider: 'fal',
      phase: 'result_fetch',
      message: 'fal.ai result response did not include a video URL.',
      requestId: queue.requestId,
      providerMetadata: {
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    })
  }

  return {
    status: 'COMPLETED',
    artifactUrl,
    thumbnailUrl: thumbnailUrl ?? undefined,
    seed: readNumberField(resultData, 'seed') ?? undefined,
    providerMetadata: {
      requestId: queue.requestId,
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  }
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
    const step = guardWorkflowStep(rawStep)

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

      const queue = await step.do(
        'submit-provider',
        {
          retries: {
            limit: context.providerId === 'gemini' ? 0 : 2,
            delay: '5 seconds',
            backoff: 'exponential',
          },
          timeout: Math.min(context.timeoutMs, 1_800_000),
        },
        async () => {
          const apiKey = await decryptStateString(encryptedApiKey, this.env)
          return submitProviderQueue(context, apiKey, this.env)
        },
      )

      for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
        await step.sleep(`wait-provider-${attempt}`, context.pollIntervalMs)

        const pollResult = await step.do(
          `poll-provider-${attempt}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return pollProviderQueue(queue, apiKey, context)
          },
        )

        if (pollResult.status === 'FAILED') {
          throw new WorkerProviderError({
            message: pollResult.error ?? 'Provider reported failed status.',
            provider: context.providerId,
            phase: 'provider_poll',
            errorCode: pollResult.errorCode,
            providerMetadata: pollResult.providerMetadata,
          })
        }

        if (pollResult.status === 'COMPLETED' && pollResult.artifactUrl) {
          const artifactUrl = pollResult.artifactUrl
          let workerArtifactUrl: string | undefined
          let audioR2Key: string | undefined
          let videoR2Key: string | undefined

          if (context.outputType === 'AUDIO') {
            const uploaded = await step.do(
              'download-and-upload-audio',
              {
                retries: {
                  limit: 2,
                  delay: '5 seconds',
                  backoff: 'exponential',
                },
                timeout: '120 seconds',
              },
              () =>
                downloadAndUploadAudioArtifact(
                  this.env,
                  context,
                  artifactUrl,
                  pollResult.mimeType ?? 'audio/wav',
                ),
            )
            workerArtifactUrl = uploaded.artifactUrl
            audioR2Key = uploaded.audioR2Key
          }

          if (context.outputType === 'VIDEO') {
            const uploaded = await step.do(
              'download-and-upload-video',
              {
                retries: {
                  limit: 2,
                  delay: '5 seconds',
                  backoff: 'exponential',
                },
                timeout: '120 seconds',
              },
              async () =>
                downloadAndUploadVideoArtifact(
                  this.env,
                  context,
                  artifactUrl,
                  pollResult.mimeType ?? 'video/mp4',
                  context.providerId === 'gemini'
                    ? {
                        'x-goog-api-key': await decryptStateString(
                          encryptedApiKey,
                          this.env,
                        ),
                      }
                    : undefined,
                ),
            )
            workerArtifactUrl = uploaded.artifactUrl
            videoR2Key = uploaded.videoR2Key
          }

          await step.do('callback-result', async () =>
            emitRunResultCallback(this.env, context, {
              artifactUrl: workerArtifactUrl ?? artifactUrl,
              audioR2Key,
              videoR2Key,
              thumbnailUrl: pollResult.thumbnailUrl,
              providerMetadata: pollResult.providerMetadata,
              width:
                context.outputType === 'VIDEO'
                  ? context.providerInput.width
                  : undefined,
              height:
                context.outputType === 'VIDEO'
                  ? context.providerInput.height
                  : undefined,
              // The 'auto' literal can't satisfy ExecutionCallbackResultDataSchema's
              // numeric duration field — coerce to undefined and let DB store
              // null (the real output length comes from fal's response metadata
              // in future iterations).
              duration:
                context.outputType === 'VIDEO' &&
                context.providerId !== 'gemini' &&
                typeof context.providerInput.duration === 'number'
                  ? context.providerInput.duration
                  : undefined,
              requestCount: 1,
              seed: pollResult.seed,
              mimeType:
                pollResult.mimeType ??
                (context.outputType === 'VIDEO' ? 'video/mp4' : 'audio/wav'),
            }),
          )

          return { status: 'COMPLETED', runId: context.runId }
        }
      }

      throw new Error('Provider polling timed out.')
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
    const step = guardWorkflowStep(rawStep)

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
    const step = guardWorkflowStep(rawStep)

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
    const step = guardWorkflowStep(rawStep)

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

    return jsonResponse({ ok: false, error: 'Not found.' }, { status: 404 })
  },
}

export default executionWorker
