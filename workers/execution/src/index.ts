import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { Workflow, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import {
  WorkerProviderError,
  buildWorkerFailureCallbackData,
  createGeminiNoImageError,
  createProviderNoOutputError,
  createProviderPayloadError,
  createProviderResponseError,
} from './lib/provider-error'
import { buildFalWorkerQueueRequest as buildFalWorkerVideoQueueRequest } from './models/fal/video-request-builders'

const HEALTH_PATH = '/health'
const ECHO_PATH = '/echo'
const CINEMATIC_SHORT_VIDEO_PATH = '/workflows/cinematic-short-video'
const FAL_QUEUE_PATH = '/workflows/fal-queue'
const LONG_VIDEO_PIPELINE_PATH = '/workflows/long-video-pipeline'
const HYPER3D_RODIN_PATH = '/workflows/hyper3d-rodin'
const HUNYUAN3D_PATH = '/workflows/hunyuan3d'
const EXECUTION_SIGNATURE_HEADER = 'X-Execution-Signature'
const EXECUTION_SIGNATURE_ALGORITHM = 'HMAC'
const EXECUTION_SIGNATURE_HASH = 'SHA-256'
const JSON_CONTENT_TYPE = 'application/json'
const CALLBACK_KINDS = ['ping', 'status', 'result'] as const
const QUEUE_WORKFLOW_IDS = ['CINEMATIC_SHORT_VIDEO', 'FAL_QUEUE'] as const
const LONG_VIDEO_PIPELINE_WORKFLOW_ID = 'LONG_VIDEO_PIPELINE'
const HYPER3D_RODIN_WORKFLOW_ID = 'HYPER3D_RODIN'
const HUNYUAN3D_WORKFLOW_ID = 'HUNYUAN3D'
const HYPER3D_BASE_URL = 'https://api.hyper3d.com'
const IMAGE_QUEUE_PATH = '/workflows/image-queue'
const IMAGE_QUEUE_WORKFLOW_ID = 'IMAGE_QUEUE'
const OPENAI_BASE_URL = 'https://api.openai.com'
const GEMINI_IMAGE_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models'
const HUGGINGFACE_IMAGE_BASE_URL =
  'https://router.huggingface.co/hf-inference/models'
const REPLICATE_BASE_URL = 'https://api.replicate.com/v1'
const NOVELAI_IMAGE_BASE_URL = 'https://image.novelai.net'
const VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const OLD_R2_DEV_PATTERN = /^https:\/\/pub-[a-f0-9]+\.r2\.dev\//
const R2_WORKER_BASE = 'https://r2.anteisuba.com'

type CallbackKind = (typeof CALLBACK_KINDS)[number]
type WorkerWorkflowId = (typeof QUEUE_WORKFLOW_IDS)[number]

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ key: string }>
}

interface ExecutionEnv {
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
  CINEMATIC_SHORT_VIDEO_WORKFLOW: Workflow<WorkerRunContext>
  LONG_VIDEO_PIPELINE_WORKFLOW: Workflow<LongVideoPipelineRunContext>
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

interface WorkerImageRunContext {
  runId: string
  workflowId: typeof IMAGE_QUEUE_WORKFLOW_ID
  outputType: 'IMAGE'
  providerId: string
  apiKeyId?: string
  useSystemKey?: boolean
  callbackUrl: string
  resolveKeyUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    aspectRatio: string
    referenceImage?: string
    referenceImages?: string[]
    advancedParams?: Record<string, unknown>
    outputStorageKey?: string
  }
}

interface LongVideoPipelineRunContext {
  runId: string
  workflowId: typeof LONG_VIDEO_PIPELINE_WORKFLOW_ID
  pipelineId: string
  advanceUrl: string
  providerId: string
  apiKeyId?: string
  useSystemKey?: boolean
  resolveKeyUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
  startClipIndex: number
  initialVideoUrl?: string
  initialFrameUrl?: string
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
    firstClipDuration: number
    extensionClipDuration: number
    totalClips: number
    extensionMethod: 'native_extend' | 'last_frame_chain'
    extendEndpointId?: string
    referenceImage?: string
    negativePrompt?: string
    resolution?: string
    i2vModelId?: string
    videoDefaults?: Record<string, unknown>
    providerBaseUrl?: string
    outputStorageKeys: string[]
    width: number
    height: number
  }
}

interface LongVideoPipelineStatus {
  pipelineId: string
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  errorMessage?: string | null
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

interface FalQueueSubmitResult {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readStringField(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue : null
}

export function readPositiveNumberField(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'number' && fieldValue > 0 ? fieldValue : null
}

export function readNumberField(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue)
    ? fieldValue
    : null
}

export function readBooleanField(
  value: Record<string, unknown>,
  key: string,
): boolean | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'boolean' ? fieldValue : null
}

export function readStringArrayField(
  value: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const fieldValue = value[key]
  if (!Array.isArray(fieldValue)) return undefined

  const strings = fieldValue.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  )
  return strings.length > 0 ? strings : undefined
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

async function readText(request: Request): Promise<string | null> {
  try {
    return await request.text()
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

export function isLongVideoPipelineWorkflowId(
  value: unknown,
): value is typeof LONG_VIDEO_PIPELINE_WORKFLOW_ID {
  return value === LONG_VIDEO_PIPELINE_WORKFLOW_ID
}

function isLongVideoPipelineTerminalStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED'
}

function isFalQueueFailureStatus(status: string): boolean {
  const normalized = status.toUpperCase()
  return (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELED' ||
    normalized === 'CANCELLED'
  )
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(value: string): Uint8Array | null {
  const normalized = value.trim().toLowerCase()
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    return null
  }

  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left)
  const rightBytes = hexToBytes(right)

  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index]
  }
  return diff === 0
}

export async function signBody(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: EXECUTION_SIGNATURE_ALGORITHM, hash: EXECUTION_SIGNATURE_HASH },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    EXECUTION_SIGNATURE_ALGORITHM,
    key,
    encoder.encode(body),
  )

  return toHex(signature)
}

export async function verifySignedBody(
  request: Request,
  secret: string,
): Promise<string | null> {
  const rawBody = await readText(request)
  const signature = request.headers.get(EXECUTION_SIGNATURE_HEADER)

  if (!rawBody || !signature) return null

  const expectedSignature = await signBody(secret, rawBody)
  return timingSafeEqualHex(signature, expectedSignature) ? rawBody : null
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

async function postSignedJson(
  url: string,
  secret: string,
  payload: unknown,
): Promise<Response> {
  const body = JSON.stringify(payload)
  const signature = await signBody(secret, body)

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
      [EXECUTION_SIGNATURE_HEADER]: signature,
    },
    body,
  })
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

export function parseLongVideoPipelineRunContext(
  input: unknown,
): LongVideoPipelineRunContext | null {
  if (!isRecord(input)) return null
  const providerInput = input.providerInput
  if (!isRecord(providerInput)) return null

  const runId = readStringField(input, 'runId')
  const workflowId = readStringField(input, 'workflowId')
  const pipelineId = readStringField(input, 'pipelineId')
  const advanceUrl = readStringField(input, 'advanceUrl')
  const providerId = readStringField(input, 'providerId')
  const apiKeyId = readStringField(input, 'apiKeyId') ?? undefined
  const useSystemKey = readBooleanField(input, 'useSystemKey') ?? undefined
  const resolveKeyUrl = readStringField(input, 'resolveKeyUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')
  const startClipIndex = readNumberField(input, 'startClipIndex') ?? 0
  const prompt = readStringField(providerInput, 'prompt')
  const modelId = readStringField(providerInput, 'modelId')
  const externalModelId = readStringField(providerInput, 'externalModelId')
  const aspectRatio = readStringField(providerInput, 'aspectRatio')
  const firstClipDuration = readPositiveNumberField(
    providerInput,
    'firstClipDuration',
  )
  const extensionClipDuration = readPositiveNumberField(
    providerInput,
    'extensionClipDuration',
  )
  const totalClips = readPositiveNumberField(providerInput, 'totalClips')
  const extensionMethod = readStringField(providerInput, 'extensionMethod')
  const outputStorageKeys = readStringArrayField(
    providerInput,
    'outputStorageKeys',
  )
  const width = readPositiveNumberField(providerInput, 'width')
  const height = readPositiveNumberField(providerInput, 'height')

  if (
    !runId ||
    !isLongVideoPipelineWorkflowId(workflowId) ||
    !pipelineId ||
    !advanceUrl ||
    !providerId ||
    (!apiKeyId && !useSystemKey) ||
    !resolveKeyUrl ||
    !timeoutMs ||
    !maxAttempts ||
    !pollIntervalMs ||
    startClipIndex < 0 ||
    !prompt ||
    !modelId ||
    !externalModelId ||
    !aspectRatio ||
    !firstClipDuration ||
    !extensionClipDuration ||
    !totalClips ||
    (extensionMethod !== 'native_extend' &&
      extensionMethod !== 'last_frame_chain') ||
    !outputStorageKeys ||
    outputStorageKeys.length < totalClips ||
    !width ||
    !height
  ) {
    return null
  }

  return {
    runId,
    workflowId,
    pipelineId,
    advanceUrl,
    providerId,
    apiKeyId,
    useSystemKey,
    resolveKeyUrl,
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
    startClipIndex,
    initialVideoUrl: readStringField(input, 'initialVideoUrl') ?? undefined,
    initialFrameUrl: readStringField(input, 'initialFrameUrl') ?? undefined,
    providerInput: {
      prompt,
      modelId,
      externalModelId,
      aspectRatio:
        aspectRatio as LongVideoPipelineRunContext['providerInput']['aspectRatio'],
      firstClipDuration,
      extensionClipDuration,
      totalClips,
      extensionMethod,
      extendEndpointId:
        readStringField(providerInput, 'extendEndpointId') ?? undefined,
      referenceImage:
        readStringField(providerInput, 'referenceImage') ?? undefined,
      negativePrompt:
        readStringField(providerInput, 'negativePrompt') ?? undefined,
      resolution: readStringField(providerInput, 'resolution') ?? undefined,
      i2vModelId: readStringField(providerInput, 'i2vModelId') ?? undefined,
      videoDefaults: isRecord(providerInput.videoDefaults)
        ? providerInput.videoDefaults
        : undefined,
      providerBaseUrl:
        readStringField(providerInput, 'providerBaseUrl') ?? undefined,
      outputStorageKeys,
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

// ─── API-key state encryption ──────────────────────────────────────────
// Resolved BYOK API keys flow through `step.do` results, which Cloudflare
// persists in workflow state. We AES-GCM encrypt them with a Worker secret
// so a Cloudflare-state dump alone is not enough to recover the plaintext.

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i])
  return btoa(binary)
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

async function resolveApiKeyModel3D(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
): Promise<string> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const response = await postSignedJson(
    context.resolveKeyUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      apiKeyId: context.apiKeyId,
      adapterType: context.providerId,
      useSystemKey: context.useSystemKey,
    },
  )

  if (!response.ok) {
    throw new Error(`Resolve key failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: { apiKey?: unknown }
  }

  if (payload.success !== true || typeof payload.data?.apiKey !== 'string') {
    throw new Error('Resolve key returned an invalid response.')
  }

  return payload.data.apiKey
}

async function emitModel3DCallback(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
  data: unknown,
): Promise<void> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const callbackResponse = await postSignedJson(
    context.callbackUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      kind: 'result',
      ts: new Date().toISOString(),
      data,
    },
  )

  if (!callbackResponse.ok) {
    throw new Error(`Callback failed with status ${callbackResponse.status}`)
  }
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
    httpMetadata: { contentType: 'model/gltf-binary' },
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
    httpMetadata: { contentType: mimeType },
  })

  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${glbR2Key}`,
    glbR2Key,
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

  const instance = await env.HYPER3D_RODIN_WORKFLOW.create({
    id: runContext.runId,
    params: runContext,
  })

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

  const instance = await env.HUNYUAN3D_WORKFLOW.create({
    id: runContext.runId,
    params: runContext,
  })

  return jsonResponse({ workflowInstanceId: instance.id })
}

async function handleLongVideoPipelineDispatch(
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

  const runContext = parseLongVideoPipelineRunContext(parsed)
  if (!runContext) {
    return jsonResponse(
      { ok: false, error: 'Invalid long-video pipeline context.' },
      { status: 400 },
    )
  }

  const instance = await env.LONG_VIDEO_PIPELINE_WORKFLOW.create({
    id: runContext.runId,
    params: runContext,
  })

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

  const instance = await env.CINEMATIC_SHORT_VIDEO_WORKFLOW.create({
    id: runContext.runId,
    params: runContext,
  })

  return jsonResponse({ workflowInstanceId: instance.id })
}

async function resolveApiKey(
  env: ExecutionEnv,
  context: WorkerRunContext | LongVideoPipelineRunContext,
): Promise<string> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const response = await postSignedJson(
    context.resolveKeyUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      apiKeyId: context.apiKeyId,
      adapterType: context.providerId,
      useSystemKey: context.useSystemKey,
    },
  )

  if (!response.ok) {
    throw new Error(`Resolve key failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: { apiKey?: unknown }
  }

  if (payload.success !== true || typeof payload.data?.apiKey !== 'string') {
    throw new Error('Resolve key returned an invalid response.')
  }

  return payload.data.apiKey
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

async function submitFalQueue(
  context: WorkerRunContext,
  apiKey: string,
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

  return { requestId, statusUrl, responseUrl }
}

function buildLongVideoClipQueueContext(
  context: LongVideoPipelineRunContext,
  clipIndex: number,
  referenceImage: string | undefined,
  duration: number,
  outputStorageKey: string,
): WorkerVideoRunContext {
  return {
    runId: `${context.runId}:clip-${clipIndex}`,
    workflowId: 'FAL_QUEUE',
    outputType: 'VIDEO',
    providerId: context.providerId,
    apiKeyId: context.apiKeyId,
    useSystemKey: context.useSystemKey,
    callbackUrl: context.advanceUrl,
    resolveKeyUrl: context.resolveKeyUrl,
    timeoutMs: context.timeoutMs,
    maxAttempts: context.maxAttempts,
    pollIntervalMs: context.pollIntervalMs,
    providerInput: {
      prompt: context.providerInput.prompt,
      modelId: context.providerInput.modelId,
      externalModelId: context.providerInput.externalModelId,
      aspectRatio: context.providerInput.aspectRatio,
      duration,
      referenceImage,
      negativePrompt: context.providerInput.negativePrompt,
      resolution: context.providerInput.resolution,
      i2vModelId: context.providerInput.i2vModelId,
      videoDefaults: context.providerInput.videoDefaults,
      providerBaseUrl: context.providerInput.providerBaseUrl,
      outputStorageKey,
      width: context.providerInput.width,
      height: context.providerInput.height,
    },
  }
}

function getLongVideoClipDuration(
  context: LongVideoPipelineRunContext,
  clipIndex: number,
): number {
  return clipIndex === 0
    ? context.providerInput.firstClipDuration
    : context.providerInput.extensionClipDuration
}

function getFalExtendDurationValue(
  context: LongVideoPipelineRunContext,
  duration: number,
): string {
  const endpoint = context.providerInput.extendEndpointId ?? ''
  if (endpoint.includes('veo3.1')) {
    return `${duration}s`
  }
  return String(duration)
}

async function submitFalLongVideoExtendQueue(
  context: LongVideoPipelineRunContext,
  apiKey: string,
  previousVideoUrl: string,
  clipIndex: number,
): Promise<FalQueueSubmitResult> {
  const extendEndpointId = context.providerInput.extendEndpointId
  if (!extendEndpointId) {
    throw new Error('Long-video native extend endpoint is not configured.')
  }

  const duration = getLongVideoClipDuration(context, clipIndex)
  const input: Record<string, unknown> = {
    prompt: context.providerInput.prompt,
    video_url: previousVideoUrl,
    aspect_ratio: context.providerInput.aspectRatio,
    duration: getFalExtendDurationValue(context, duration),
  }

  appendDefinedBodyValue(
    input,
    'negative_prompt',
    context.providerInput.negativePrompt,
  )
  appendDefinedBodyValue(input, 'resolution', context.providerInput.resolution)

  const response = await fetch(`https://queue.fal.run/${extendEndpointId}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'long_video_extend_submit',
      fallbackMessage: `fal.ai long-video extend submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'long_video_extend_submit',
    fallbackMessage: 'fal.ai long-video extend submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai extend submit returned an invalid response.')
  }

  return { requestId, statusUrl, responseUrl }
}

async function submitFalLongVideoClipQueue(
  context: LongVideoPipelineRunContext,
  apiKey: string,
  clipIndex: number,
  previousVideoUrl: string | undefined,
  previousFrameUrl: string | undefined,
): Promise<{
  queue: FalQueueSubmitResult
  inputVideoUrl?: string
  inputFrameUrl?: string
}> {
  const duration = getLongVideoClipDuration(context, clipIndex)

  if (
    clipIndex > 0 &&
    context.providerInput.extensionMethod === 'native_extend'
  ) {
    if (!previousVideoUrl) {
      throw new Error('Long-video native extend is missing previous video URL.')
    }
    return {
      queue: await submitFalLongVideoExtendQueue(
        context,
        apiKey,
        previousVideoUrl,
        clipIndex,
      ),
      inputVideoUrl: previousVideoUrl,
    }
  }

  const referenceImage =
    clipIndex === 0 ? context.providerInput.referenceImage : previousFrameUrl
  if (
    clipIndex > 0 &&
    context.providerInput.extensionMethod === 'last_frame_chain' &&
    !referenceImage
  ) {
    throw new Error(
      'Long-video last-frame chain is missing previous frame URL.',
    )
  }

  const queueContext = buildLongVideoClipQueueContext(
    context,
    clipIndex,
    referenceImage,
    duration,
    context.providerInput.outputStorageKeys[clipIndex],
  )

  return {
    queue: await submitFalQueue(queueContext, apiKey),
    inputFrameUrl: clipIndex > 0 ? referenceImage : undefined,
  }
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

function buildR2PublicUrl(env: ExecutionEnv, key: string): string {
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
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

  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
      model: providerInput.externalModelId,
    },
    body: JSON.stringify(buildFishAudioRequestBody(context)),
  })

  if (!response.ok) {
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

  const parsed = providerInput.withTimestamps
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
    httpMetadata: { contentType: mimeType },
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
    httpMetadata: { contentType: mimeType },
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
): Promise<{ artifactUrl: string; videoR2Key: string }> {
  return downloadAndUploadVideoArtifactToKey(
    env,
    artifactUrl,
    mimeType,
    context.providerInput.outputStorageKey ??
      `generations/worker/video/${context.runId}/output.mp4`,
  )
}

async function downloadAndUploadVideoArtifactToKey(
  env: ExecutionEnv,
  artifactUrl: string,
  mimeType: string,
  videoR2Key: string,
): Promise<{ artifactUrl: string; videoR2Key: string }> {
  const response = await fetch(artifactUrl)
  if (!response.ok) {
    throw new Error(
      `Video artifact download failed with status ${response.status}`,
    )
  }

  const videoBytes = await response.arrayBuffer()

  await env.GENERATION_BUCKET.put(videoR2Key, videoBytes, {
    httpMetadata: { contentType: mimeType },
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

async function emitCallback(
  env: ExecutionEnv,
  context: WorkerRunContext,
  data: unknown,
): Promise<void> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const callbackResponse = await postSignedJson(
    context.callbackUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      kind: 'result',
      ts: new Date().toISOString(),
      data,
    },
  )

  if (!callbackResponse.ok) {
    throw new Error(`Callback failed with status ${callbackResponse.status}`)
  }
}

export class CinematicShortVideoWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerRunContext
> {
  async run(
    event: WorkflowEvent<WorkerRunContext>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload

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
          const plaintext = await resolveApiKey(this.env, context)
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
          emitCallback(this.env, context, {
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
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: Math.min(context.timeoutMs, 1_800_000),
        },
        async () => {
          const apiKey = await decryptStateString(encryptedApiKey, this.env)
          return submitFalQueue(context, apiKey)
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
            return pollFalQueue(queue, apiKey, context.outputType)
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
              () =>
                downloadAndUploadVideoArtifact(
                  this.env,
                  context,
                  artifactUrl,
                  pollResult.mimeType ?? 'video/mp4',
                ),
            )
            workerArtifactUrl = uploaded.artifactUrl
            videoR2Key = uploaded.videoR2Key
          }

          await step.do('callback-result', async () =>
            emitCallback(this.env, context, {
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
        emitCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }
}

type LongVideoPipelineWorkerAction =
  | 'advance'
  | 'clip-queued'
  | 'clip-running'
  | 'clip-completed'
  | 'finalize'
  | 'fail'

interface LongVideoPipelineWorkerUpdateData {
  attempt?: number
  clipIndex?: number
  requestId?: string
  statusUrl?: string
  responseUrl?: string
  inputVideoUrl?: string
  inputFrameUrl?: string
  videoUrl?: string
  storageKey?: string
  lastFrameUrl?: string
  durationSec?: number
  requestCount?: number
  width?: number
  height?: number
  providerMetadata?: Record<string, unknown>
  error?: string
}

async function postLongVideoPipelineUpdate(
  env: ExecutionEnv,
  context: LongVideoPipelineRunContext,
  action: LongVideoPipelineWorkerAction,
  data: LongVideoPipelineWorkerUpdateData = {},
): Promise<LongVideoPipelineStatus> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const response = await postSignedJson(
    context.advanceUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      pipelineId: context.pipelineId,
      action,
      ...data,
    },
  )

  if (!response.ok) {
    throw new Error(
      `Long-video pipeline update failed with status ${response.status}`,
    )
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: unknown
    error?: string
  }

  if (payload.success !== true || !isRecord(payload.data)) {
    throw new Error(payload.error ?? 'Invalid long-video update response.')
  }

  const pipelineId = readStringField(payload.data, 'pipelineId')
  const status = readStringField(payload.data, 'status')
  if (!pipelineId || !status) {
    throw new Error('Long-video update response is missing pipeline status.')
  }

  return {
    pipelineId,
    status: status as LongVideoPipelineStatus['status'],
    errorMessage: readStringField(payload.data, 'errorMessage'),
  }
}

export class LongVideoPipelineWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  LongVideoPipelineRunContext
> {
  async run(
    event: WorkflowEvent<LongVideoPipelineRunContext>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload

    try {
      if (context.providerId !== 'fal') {
        throw new Error('Only fal.ai long-video pipelines are worker-migrated.')
      }

      const encryptedApiKey = await step.do(
        'resolve-api-key',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const plaintext = await resolveApiKey(this.env, context)
          return encryptStateString(plaintext, this.env)
        },
      )

      let previousVideoUrl = context.initialVideoUrl
      let previousFrameUrl = context.initialFrameUrl
      const attemptsPerClip = Math.max(
        1,
        Math.ceil(context.maxAttempts / context.providerInput.totalClips),
      )

      for (
        let clipIndex = context.startClipIndex;
        clipIndex < context.providerInput.totalClips;
        clipIndex += 1
      ) {
        const pipelineStatus = await step.do(
          `read-pipeline-${clipIndex}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          () =>
            postLongVideoPipelineUpdate(this.env, context, 'advance', {
              attempt: clipIndex + 1,
            }),
        )

        if (isLongVideoPipelineTerminalStatus(pipelineStatus.status)) {
          return {
            status: pipelineStatus.status,
            runId: context.runId,
            pipelineId: context.pipelineId,
          }
        }

        const outputStorageKey =
          context.providerInput.outputStorageKeys[clipIndex]
        if (!outputStorageKey) {
          throw new Error(
            `Missing output storage key for clip ${clipIndex + 1}.`,
          )
        }

        const clipQueue = await step.do(
          `submit-clip-${clipIndex}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 1_800_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return submitFalLongVideoClipQueue(
              context,
              apiKey,
              clipIndex,
              previousVideoUrl,
              previousFrameUrl,
            )
          },
        )

        const queuedStatus = await step.do(
          `mark-clip-${clipIndex}-queued`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          () =>
            postLongVideoPipelineUpdate(this.env, context, 'clip-queued', {
              clipIndex,
              requestId: clipQueue.queue.requestId,
              statusUrl: clipQueue.queue.statusUrl,
              responseUrl: clipQueue.queue.responseUrl,
              inputVideoUrl: clipQueue.inputVideoUrl,
              inputFrameUrl: clipQueue.inputFrameUrl,
              providerMetadata: { workflowInstanceId: event.instanceId },
            }),
        )
        if (isLongVideoPipelineTerminalStatus(queuedStatus.status)) {
          return {
            status: queuedStatus.status,
            runId: context.runId,
            pipelineId: context.pipelineId,
          }
        }

        let completedClip:
          | { videoUrl: string; storageKey: string; lastFrameUrl?: string }
          | undefined
        let markedRunning = false

        for (let attempt = 1; attempt <= attemptsPerClip; attempt += 1) {
          await step.sleep(
            `wait-clip-${clipIndex}-${attempt}`,
            context.pollIntervalMs,
          )

          const pollResult = await step.do(
            `poll-clip-${clipIndex}-${attempt}`,
            {
              retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
              timeout: '30 seconds',
            },
            async () => {
              const apiKey = await decryptStateString(encryptedApiKey, this.env)
              return pollFalQueue(clipQueue.queue, apiKey, 'VIDEO')
            },
          )

          if (pollResult.status === 'FAILED') {
            throw new WorkerProviderError({
              message:
                pollResult.error ??
                `Provider reported failed status for clip ${clipIndex + 1}.`,
              provider: context.providerId,
              phase: 'long_video_clip_poll',
              errorCode: pollResult.errorCode,
              providerMetadata: {
                clipIndex,
                ...pollResult.providerMetadata,
              },
            })
          }

          if (pollResult.status === 'IN_PROGRESS' && !markedRunning) {
            await step.do(
              `mark-clip-${clipIndex}-running`,
              {
                retries: {
                  limit: 2,
                  delay: '5 seconds',
                  backoff: 'exponential',
                },
                timeout: '30 seconds',
              },
              () =>
                postLongVideoPipelineUpdate(this.env, context, 'clip-running', {
                  clipIndex,
                }),
            )
            markedRunning = true
          }

          if (pollResult.status === 'COMPLETED' && pollResult.artifactUrl) {
            const artifactUrl = pollResult.artifactUrl
            const uploaded = await step.do(
              `upload-clip-${clipIndex}`,
              {
                retries: {
                  limit: 2,
                  delay: '5 seconds',
                  backoff: 'exponential',
                },
                timeout: '120 seconds',
              },
              () =>
                downloadAndUploadVideoArtifactToKey(
                  this.env,
                  artifactUrl,
                  pollResult.mimeType ?? 'video/mp4',
                  outputStorageKey,
                ),
            )

            completedClip = {
              videoUrl: uploaded.artifactUrl,
              storageKey: uploaded.videoR2Key,
              lastFrameUrl: pollResult.thumbnailUrl,
            }

            await step.do(
              `mark-clip-${clipIndex}-completed`,
              {
                retries: {
                  limit: 2,
                  delay: '5 seconds',
                  backoff: 'exponential',
                },
                timeout: '30 seconds',
              },
              () =>
                postLongVideoPipelineUpdate(
                  this.env,
                  context,
                  'clip-completed',
                  {
                    clipIndex,
                    videoUrl: completedClip?.videoUrl,
                    storageKey: completedClip?.storageKey,
                    lastFrameUrl: completedClip?.lastFrameUrl,
                    durationSec: getLongVideoClipDuration(context, clipIndex),
                    requestCount: 1,
                    width: context.providerInput.width,
                    height: context.providerInput.height,
                    providerMetadata: pollResult.providerMetadata,
                  },
                ),
            )

            break
          }
        }

        if (!completedClip) {
          throw new Error(`Long-video clip ${clipIndex + 1} polling timed out.`)
        }

        previousVideoUrl = completedClip.videoUrl
        previousFrameUrl = completedClip.lastFrameUrl
      }

      const finalStatus = await step.do(
        'finalize-pipeline',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        () => postLongVideoPipelineUpdate(this.env, context, 'finalize'),
      )

      return {
        status: finalStatus.status,
        runId: context.runId,
        pipelineId: context.pipelineId,
      }
    } catch (error) {
      const failureData = buildWorkerFailureCallbackData(error, {
        message: 'Long-video workflow execution failed.',
        providerMetadata: { workflowInstanceId: event.instanceId },
      })

      await step.do('mark-pipeline-failed', async () =>
        postLongVideoPipelineUpdate(this.env, context, 'fail', {
          error: failureData.error,
          providerMetadata: failureData.providerMetadata,
        }),
      )

      return {
        status: 'FAILED',
        runId: context.runId,
        pipelineId: context.pipelineId,
      }
    }
  }
}

export class Hyper3DRodinWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerModel3DRunContext
> {
  async run(
    event: WorkflowEvent<WorkerModel3DRunContext>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload

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
          const plaintext = await resolveApiKeyModel3D(this.env, context)
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
            emitModel3DCallback(this.env, context, {
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
        emitModel3DCallback(this.env, context, failureData),
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
    step: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload

    try {
      // Resolve+encrypt the API key ONCE — see Hyper3DRodinWorkflow for rationale.
      const encryptedApiKey = await step.do(
        'resolve-api-key',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const plaintext = await resolveApiKeyModel3D(this.env, context)
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

          return { requestId, statusUrl, responseUrl }
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
            emitModel3DCallback(this.env, context, {
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
        emitModel3DCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }
}

// ─── Image generation (OpenAI gpt-image, synchronous HTTP) ────────────────────

class OpenAIImageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OpenAIImageError'
  }
}

function parseImageRunContext(input: unknown): WorkerImageRunContext | null {
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
    (!apiKeyId && !useSystemKey) ||
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
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
    providerInput: {
      prompt,
      modelId,
      externalModelId,
      aspectRatio,
      referenceImage,
      referenceImages,
      advancedParams,
      outputStorageKey:
        readStringField(providerInput, 'outputStorageKey') ?? undefined,
    },
  }
}

async function resolveApiKeyImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
): Promise<string> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const response = await postSignedJson(
    context.resolveKeyUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      apiKeyId: context.apiKeyId,
      adapterType: context.providerId,
      useSystemKey: context.useSystemKey,
    },
  )

  if (!response.ok) {
    throw new Error(`Resolve key failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: { apiKey?: unknown }
  }

  if (payload.success !== true || typeof payload.data?.apiKey !== 'string') {
    throw new Error('Resolve key returned an invalid response.')
  }

  return payload.data.apiKey
}

async function resolveCivitaiTokenImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
): Promise<string | null> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const response = await postSignedJson(
    context.resolveKeyUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      keyKind: 'civitai',
    },
  )

  if (!response.ok) return null

  const payload = (await response.json()) as {
    success?: boolean
    data?: { apiKey?: unknown }
  }

  return payload.success === true && typeof payload.data?.apiKey === 'string'
    ? payload.data.apiKey
    : null
}

async function emitImageCallback(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  data: unknown,
): Promise<void> {
  if (!env.INTERNAL_CALLBACK_SECRET) {
    throw new Error('Internal callback secret is not configured.')
  }

  const callbackResponse = await postSignedJson(
    context.callbackUrl,
    env.INTERNAL_CALLBACK_SECRET,
    {
      runId: context.runId,
      kind: 'result',
      ts: new Date().toISOString(),
      data,
    },
  )

  if (!callbackResponse.ok) {
    throw new Error(`Callback failed with status ${callbackResponse.status}`)
  }
}

/** Map the wire aspect ratio to a gpt-image supported size. */
function aspectRatioToOpenAISize(aspectRatio: string): {
  size: string
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '16:9':
    case '4:3':
      return { size: '1536x1024', width: 1536, height: 1024 }
    case '9:16':
    case '3:4':
      return { size: '1024x1536', width: 1024, height: 1536 }
    default:
      return { size: '1024x1024', width: 1024, height: 1024 }
  }
}

/** width:height ratio parts for the five wire aspect ratios. */
const IMAGE_ASPECT_RATIO_PARTS: Record<string, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '9:16': [9, 16],
  '4:3': [4, 3],
  '3:4': [3, 4],
}

type ImageResolutionTier = '1K' | '2K' | '4K'

export function isImageResolutionTier(
  value: string,
): value is ImageResolutionTier {
  return value === '1K' || value === '2K' || value === '4K'
}

interface TieredDimensionConstraints {
  /** Target total pixel count for this tier (before rounding/clamping). */
  targetPixels: number
  /** Round both edges to a multiple of this (default: 1, i.e. no rounding). */
  edgeStep?: number
  minEdge?: number
  maxEdge?: number
  minTotalPixels?: number
  maxTotalPixels?: number
}

/**
 * Derives width/height for a (aspectRatio, resolution tier) pair from a
 * target pixel budget rather than a hand-typed size table — the providers
 * below each impose different edge/total-pixel constraints (see call
 * sites), so the numbers are computed to satisfy them instead of guessed.
 */
export function computeTieredDimensions(
  aspectRatio: string,
  {
    targetPixels,
    edgeStep = 1,
    minEdge = 0,
    maxEdge = Infinity,
    minTotalPixels = 0,
    maxTotalPixels = Infinity,
  }: TieredDimensionConstraints,
): { width: number; height: number } {
  const [rw, rh] = IMAGE_ASPECT_RATIO_PARTS[aspectRatio] ?? [1, 1]
  const roundToStep = (value: number) =>
    Math.max(edgeStep, Math.round(value / edgeStep) * edgeStep)

  let rawWidth = Math.sqrt((targetPixels * rw) / rh)
  let rawHeight = targetPixels / rawWidth

  // Scale both edges together when either is outside [minEdge, maxEdge] so
  // the requested aspect ratio survives the clamp. Clamping width and
  // height independently could cap only the overflowing edge and leave the
  // other alone — e.g. a 16:9 request whose ideal width exceeded maxEdge
  // came out looking like ~4:3 once width alone got capped.
  const longEdge = Math.max(rawWidth, rawHeight)
  const shortEdge = Math.min(rawWidth, rawHeight)
  if (longEdge > maxEdge) {
    const scale = maxEdge / longEdge
    rawWidth *= scale
    rawHeight *= scale
  } else if (shortEdge < minEdge) {
    const scale = minEdge / shortEdge
    rawWidth *= scale
    rawHeight *= scale
  }

  let width = roundToStep(rawWidth)
  let height = roundToStep(rawHeight)

  // Safety net in case edge-step rounding pushed a value just past its
  // bound (only reachable if maxEdge/minEdge isn't an exact multiple of
  // edgeStep).
  width = Math.min(Math.max(width, minEdge), maxEdge)
  height = Math.min(Math.max(height, minEdge), maxEdge)

  while (width * height > maxTotalPixels && height > edgeStep) {
    height -= edgeStep
  }
  while (width * height < minTotalPixels) {
    height += edgeStep
  }

  return { width, height }
}

const OPENAI_SIZE_EDGE_STEP = 16
const OPENAI_SIZE_MAX_EDGE = 3840
const OPENAI_SIZE_MIN_TOTAL_PIXELS = 655_360
const OPENAI_SIZE_MAX_TOTAL_PIXELS = 8_294_400
// gpt-image-2 accepts any size satisfying: edges are multiples of 16, long
// edge <= 3840, and total pixels within [655_360, 8_294_400] — there is no
// fixed enum, so tiers are pixel budgets rather than literal size strings.
const OPENAI_RESOLUTION_TARGET_PIXELS: Record<ImageResolutionTier, number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  // True 4K (3840x3840-class) exceeds the API's total-pixel ceiling for
  // near-square ratios, so the tier targets the ceiling itself — this still
  // yields the exact standard 3840x2160 for 16:9.
  '4K': OPENAI_SIZE_MAX_TOTAL_PIXELS,
}

/** Resolution-tier-aware gpt-image size, only used once the user picks a tier. */
export function tieredOpenAISize(
  aspectRatio: string,
  tier: ImageResolutionTier,
): { size: string; width: number; height: number } {
  const { width, height } = computeTieredDimensions(aspectRatio, {
    targetPixels: OPENAI_RESOLUTION_TARGET_PIXELS[tier],
    edgeStep: OPENAI_SIZE_EDGE_STEP,
    maxEdge: OPENAI_SIZE_MAX_EDGE,
    minTotalPixels: OPENAI_SIZE_MIN_TOTAL_PIXELS,
    maxTotalPixels: OPENAI_SIZE_MAX_TOTAL_PIXELS,
  })
  return { size: `${width}x${height}`, width, height }
}

const GEMINI_RESOLUTION_TARGET_PIXELS: Record<ImageResolutionTier, number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  '4K': 4096 * 4096,
}

/** Local dimension record for a Gemini output once a resolution tier is picked. */
export function tieredGeminiDimensions(
  aspectRatio: string,
  tier: ImageResolutionTier,
): { width: number; height: number } {
  return computeTieredDimensions(aspectRatio, {
    targetPixels: GEMINI_RESOLUTION_TARGET_PIXELS[tier],
    maxEdge: 4096,
  })
}

// VolcEngine Ark accepts an explicit "<W>x<H>" size string; the 4K tier is
// new, the default (no resolution picked) keeps the existing ~2K table in
// getVolcEngineImageSize() untouched.
const VOLCENGINE_4K_TARGET_PIXELS = 3840 * 2160

function volcEngine4KSize(aspectRatio: string): {
  width: number
  height: number
  size: string
} {
  const { width, height } = computeTieredDimensions(aspectRatio, {
    targetPixels: VOLCENGINE_4K_TARGET_PIXELS,
    edgeStep: 8,
  })
  return { width, height, size: `${width}x${height}` }
}

// fal Seedream 4.5's custom `{width, height}` size object requires each
// edge within [1920, 4096] (per fal's model docs) — there is no 1K tier
// here, matching the UI's resolutionOptions: ['2K', '4K'] for this model.
const FAL_SEEDREAM_RESOLUTION_TARGET_PIXELS: Record<'2K' | '4K', number> = {
  '2K': 2560 * 1440,
  '4K': 3840 * 2160,
}

function falSeedreamTieredSize(
  aspectRatio: string,
  tier: '2K' | '4K',
): { width: number; height: number } {
  return computeTieredDimensions(aspectRatio, {
    targetPixels: FAL_SEEDREAM_RESOLUTION_TARGET_PIXELS[tier],
    edgeStep: 8,
    minEdge: 1920,
    maxEdge: 4096,
  })
}

const FAL_IMAGE_SIZES: Record<string, string> = {
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
}

const FAL_IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> =
  {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1792, height: 1024 },
    '9:16': { width: 1024, height: 1792 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
  }

const FAL_KONTEXT_SINGLE_IMAGE_MODELS = new Set(['fal-ai/flux-pro/kontext'])
const FAL_KONTEXT_MULTI_IMAGE_MODELS = new Set([
  'fal-ai/flux-pro/kontext/max/multi',
])
const FAL_TEXT_TO_IMAGE_ONLY_MODELS = new Set([
  'fal-ai/flux-lora',
  'fal-ai/flux-2-pro',
  'fal-ai/flux-2/flash',
  'ideogram/v4',
  'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'fal-ai/recraft/v4/pro/text-to-image',
])
const FAL_SEEDREAM_45_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/text-to-image'

interface FalImageResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  imageUrl?: string
  width?: number
  height?: number
  mimeType?: string
  error?: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
}

function invertReferenceStrength(value: number): number {
  return Math.max(0.01, Math.min(0.99, 1 - value))
}

function readAdvancedRecord(
  context: WorkerImageRunContext,
): Record<string, unknown> {
  return context.providerInput.advancedParams ?? {}
}

function getImageReferenceInputs(context: WorkerImageRunContext): string[] {
  if (context.providerInput.referenceImages?.length) {
    return context.providerInput.referenceImages
  }
  return context.providerInput.referenceImage
    ? [context.providerInput.referenceImage]
    : []
}

interface ImageLoraInput {
  url: string
  scale?: number | null
}

function getImageLoraInputs(context: WorkerImageRunContext): ImageLoraInput[] {
  const loras = readAdvancedRecord(context).loras
  if (!Array.isArray(loras)) return []

  return loras.flatMap((candidate): ImageLoraInput[] => {
    if (!isRecord(candidate)) return []
    const url = readStringField(candidate, 'url')
    if (!url) return []
    return [{ url, scale: readNumberField(candidate, 'scale') }]
  })
}

function hasCivitaiLora(context: WorkerImageRunContext): boolean {
  return getImageLoraInputs(context).some((lora) =>
    lora.url.includes('civitai.com'),
  )
}

function injectCivitaiToken(url: string, civitaiToken: string | null): string {
  if (!civitaiToken || !url.includes('civitai.com')) return url
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('token')) {
      parsed.searchParams.set('token', civitaiToken)
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function toReplicateReachableUrl(url: string, env: ExecutionEnv): string {
  if (OLD_R2_DEV_PATTERN.test(url)) {
    const key = url.replace(OLD_R2_DEV_PATTERN, '')
    return `${R2_WORKER_BASE}/${key}`
  }

  const publicBase = env.R2_PUBLIC_URL.replace(/\/$/, '')
  if (url.startsWith(`${publicBase}/`)) {
    const key = url.slice(publicBase.length + 1)
    return `${R2_WORKER_BASE}/${key}`
  }

  return url
}

async function resolveReplicateCivitaiUrl(
  url: string,
  civitaiToken: string | null,
): Promise<string> {
  if (!url.includes('civitai.com/api/download')) return url

  if (civitaiToken) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { Authorization: `Bearer ${civitaiToken}` },
      })
      const cdnUrl = response.headers.get('location')
      if (cdnUrl?.includes('.safetensors')) return cdnUrl
    } catch {
      // Fall through to token-in-URL mode; Replicate's downloader follows
      // redirects but cannot attach Authorization headers for Civitai.
    }
  }

  return injectCivitaiToken(url, civitaiToken)
}

function buildFalImageInput(
  context: WorkerImageRunContext,
  civitaiToken: string | null = null,
): Record<string, unknown> {
  const { providerInput } = context
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  // Seedream 4.5 accepts a custom {width, height} object for 2K/4K output;
  // every other fal model keeps the existing aspect-only preset enum, and
  // Seedream itself keeps that same enum until the user actually picks a
  // resolution tier (no default-behavior change).
  const seedreamTier =
    providerInput.externalModelId === FAL_SEEDREAM_45_MODEL_ID &&
    (resolution === '2K' || resolution === '4K')
      ? resolution
      : null
  const input: Record<string, unknown> = {
    prompt: providerInput.prompt,
    image_size: seedreamTier
      ? falSeedreamTieredSize(providerInput.aspectRatio, seedreamTier)
      : (FAL_IMAGE_SIZES[providerInput.aspectRatio] ?? 'square_hd'),
    num_images: 1,
  }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  if (negativePrompt) input.negative_prompt = negativePrompt

  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) input.guidance_scale = guidanceScale

  const steps = readPositiveNumberField(advancedParams, 'steps')
  if (steps != null) input.num_inference_steps = steps

  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) input.seed = Math.round(seed)

  const loras = getImageLoraInputs(context)
  if (loras.length > 0) {
    input.loras = loras.map((lora) => ({
      path: injectCivitaiToken(lora.url, civitaiToken),
      scale: lora.scale ?? 1,
    }))
  }

  const externalModelId = providerInput.externalModelId
  if (FAL_KONTEXT_MULTI_IMAGE_MODELS.has(externalModelId)) {
    if (providerInput.referenceImages?.length) {
      input.image_urls = providerInput.referenceImages
    }
  } else if (FAL_KONTEXT_SINGLE_IMAGE_MODELS.has(externalModelId)) {
    const referenceImage =
      providerInput.referenceImages?.[0] ?? providerInput.referenceImage
    if (referenceImage) input.image_url = referenceImage
  } else if (!FAL_TEXT_TO_IMAGE_ONLY_MODELS.has(externalModelId)) {
    const referenceImage =
      providerInput.referenceImages?.[0] ?? providerInput.referenceImage
    if (referenceImage) {
      input.image_url = referenceImage
      const referenceStrength = readNumberField(
        advancedParams,
        'referenceStrength',
      )
      if (referenceStrength != null) {
        input.strength = invertReferenceStrength(referenceStrength)
      }
    }
  }

  return input
}

async function submitFalImageQueue(
  context: WorkerImageRunContext,
  apiKey: string,
  civitaiToken: string | null = null,
): Promise<FalQueueSubmitResult> {
  const response = await fetch(
    `https://queue.fal.run/${context.providerInput.externalModelId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(buildFalImageInput(context, civitaiToken)),
    },
  )

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'image_queue_submit',
      fallbackMessage: `fal.ai image queue submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'image_queue_submit',
    fallbackMessage: 'fal.ai image queue submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai image queue submit returned an invalid response.')
  }

  return { requestId, statusUrl, responseUrl }
}

async function pollFalImageQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
): Promise<FalImageResult> {
  const statusResponse = await fetch(queue.statusUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!statusResponse.ok) {
    throw await createProviderResponseError(statusResponse, {
      provider: 'fal',
      phase: 'image_status_poll',
      fallbackMessage: `fal.ai image status poll failed with status ${statusResponse.status}`,
      requestId: queue.requestId,
    })
  }

  const statusData = (await statusResponse.json()) as Record<string, unknown>
  const status = readStringField(statusData, 'status')
  const statusFailure = createProviderPayloadError(statusData, {
    provider: 'fal',
    phase: 'image_status_poll',
    fallbackMessage: 'fal.ai image queue reported failed status.',
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
      error: 'fal.ai image queue reported failed status.',
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
      phase: 'image_result_fetch',
      fallbackMessage: `fal.ai image result fetch failed with status ${resultResponse.status}`,
      requestId: queue.requestId,
    })
  }

  const resultData = (await resultResponse.json()) as Record<string, unknown>
  const resultFailure = createProviderPayloadError(resultData, {
    provider: 'fal',
    phase: 'image_result_fetch',
    fallbackMessage: 'fal.ai image result response reported failure.',
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

  const nsfw = Array.isArray(resultData.has_nsfw_concepts)
    ? resultData.has_nsfw_concepts.some(Boolean)
    : false
  if (nsfw) {
    const moderationError = new WorkerProviderError({
      message: 'fal.ai blocked this image result for NSFW concepts.',
      provider: 'fal',
      phase: 'image_result_fetch',
      errorCode: 'content_filtered',
      requestId: queue.requestId,
      providerMetadata: { moderation: 'nsfw' },
    })
    return {
      status: 'FAILED',
      error: moderationError.message,
      errorCode: moderationError.errorCode,
      providerMetadata: moderationError.providerMetadata,
    }
  }

  const images = Array.isArray(resultData.images) ? resultData.images : []
  const firstImage = images.find(isRecord)
  const imageUrl = firstImage ? readStringField(firstImage, 'url') : null
  if (!imageUrl) {
    throw createProviderNoOutputError({
      provider: 'fal',
      phase: 'image_result_fetch',
      message: 'fal.ai image result response did not include an image URL.',
      requestId: queue.requestId,
      providerMetadata: {
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    })
  }

  return {
    status: 'COMPLETED',
    imageUrl,
    width: firstImage
      ? (readPositiveNumberField(firstImage, 'width') ?? undefined)
      : undefined,
    height: firstImage
      ? (readPositiveNumberField(firstImage, 'height') ?? undefined)
      : undefined,
    mimeType:
      (firstImage ? readStringField(firstImage, 'content_type') : null) ??
      undefined,
    providerMetadata: {
      requestId: queue.requestId,
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  }
}

async function downloadAndUploadImageArtifactToKey(
  env: ExecutionEnv,
  artifactUrl: string,
  fallbackMimeType: string,
  imageR2Key: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ artifactUrl: string; imageR2Key: string; mimeType: string }> {
  const response = await fetch(artifactUrl, { headers: fetchHeaders })
  if (!response.ok) {
    throw new Error(
      `Image artifact download failed with status ${response.status}`,
    )
  }

  const imageBytes = await response.arrayBuffer()
  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? fallbackMimeType

  await env.GENERATION_BUCKET.put(imageR2Key, imageBytes, {
    httpMetadata: { contentType: mimeType },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, imageR2Key),
    imageR2Key,
    mimeType,
  }
}

async function readReferenceImageAsInlinePart(
  referenceImage: string,
): Promise<Record<string, unknown>> {
  const dataUrlMatch = referenceImage.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      inlineData: {
        mimeType: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    }
  }

  const response = await fetch(referenceImage)
  if (!response.ok) {
    throw new Error(
      `Reference image download failed with status ${response.status}`,
    )
  }

  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? 'image/png'
  return {
    inlineData: {
      mimeType,
      data: bytesToBase64(new Uint8Array(await response.arrayBuffer())),
    },
  }
}

async function readReferenceImageAsBase64(
  referenceImage: string,
): Promise<string> {
  const dataUrlMatch = referenceImage.match(/^data:[^;]+;base64,(.+)$/)
  if (dataUrlMatch) return dataUrlMatch[1]

  const response = await fetch(referenceImage)
  if (!response.ok) {
    throw new Error(
      `Reference image download failed with status ${response.status}`,
    )
  }

  return bytesToBase64(new Uint8Array(await response.arrayBuffer()))
}

async function uploadImageBytesToKey(
  env: ExecutionEnv,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: string,
  imageR2Key: string,
): Promise<{ artifactUrl: string; imageR2Key: string; mimeType: string }> {
  await env.GENERATION_BUCKET.put(imageR2Key, bytes, {
    httpMetadata: { contentType: mimeType },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, imageR2Key),
    imageR2Key,
    mimeType,
  }
}

function getWorkerImageOutputKey(
  context: WorkerImageRunContext,
  extension = 'png',
): string {
  return (
    context.providerInput.outputStorageKey ??
    `image/${context.runId}.${extension}`
  )
}

function getStandardImageDimensions(aspectRatio: string): {
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1792, height: 1024 }
    case '9:16':
      return { width: 1024, height: 1792 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    default:
      return { width: 1024, height: 1024 }
  }
}

function getVolcEngineImageSize(aspectRatio: string): {
  width: number
  height: number
  size: string
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 2560, height: 1440, size: '2560x1440' }
    case '9:16':
      return { width: 1440, height: 2560, size: '1440x2560' }
    case '4:3':
      return { width: 2304, height: 1728, size: '2304x1728' }
    case '3:4':
      return { width: 1728, height: 2304, size: '1728x2304' }
    default:
      return { width: 2048, height: 2048, size: '2048x2048' }
  }
}

function getNovelAiImageDimensions(aspectRatio: string): {
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1216, height: 832 }
    case '9:16':
      return { width: 832, height: 1216 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    default:
      return { width: 1024, height: 1024 }
  }
}

interface WorkerImageGenerationResult {
  artifactUrl: string
  imageR2Key: string
  width: number
  height: number
  mimeType: string
  providerMetadata?: Record<string, unknown>
}

async function generateGeminiImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  const resolutionTier =
    resolution && isImageResolutionTier(resolution) ? resolution : null
  const dimensions = resolutionTier
    ? tieredGeminiDimensions(context.providerInput.aspectRatio, resolutionTier)
    : getStandardImageDimensions(context.providerInput.aspectRatio)
  const parts: Record<string, unknown>[] = [
    { text: context.providerInput.prompt },
  ]
  for (const referenceImage of getImageReferenceInputs(context)) {
    parts.push(await readReferenceImageAsInlinePart(referenceImage))
  }

  const imageConfig: Record<string, unknown> = {
    aspectRatio: context.providerInput.aspectRatio,
  }
  if (resolutionTier) imageConfig.imageSize = resolutionTier

  const response = await fetch(
    `${GEMINI_IMAGE_BASE_URL}/${context.providerInput.externalModelId}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig,
        },
      }),
    },
  )

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'gemini',
      phase: 'generate_image',
      fallbackMessage: `Gemini image generation failed with status ${response.status}`,
    })
  }

  const payload = (await response.json()) as Record<string, unknown>
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue
    const parts = Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : []
    for (const part of parts) {
      if (!isRecord(part)) continue
      const inlineData = isRecord(part.inlineData)
        ? part.inlineData
        : isRecord(part.inline_data)
          ? part.inline_data
          : null
      const b64 = inlineData ? readStringField(inlineData, 'data') : null
      if (!b64) continue
      if (!inlineData) continue
      const mimeType =
        readStringField(inlineData, 'mimeType') ??
        readStringField(inlineData, 'mime_type') ??
        'image/png'
      const uploaded = await uploadImageBytesToKey(
        env,
        base64ToBytes(b64),
        mimeType,
        getWorkerImageOutputKey(context),
      )
      return { ...uploaded, ...dimensions }
    }
  }

  throw createGeminiNoImageError(payload)
}

async function generateHuggingFaceImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const dimensions = getStandardImageDimensions(
    context.providerInput.aspectRatio,
  )
  const advancedParams = readAdvancedRecord(context)
  const parameters: Record<string, unknown> = {
    width: dimensions.width,
    height: dimensions.height,
  }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  if (negativePrompt) parameters.negative_prompt = negativePrompt
  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) parameters.guidance_scale = guidanceScale
  const steps = readPositiveNumberField(advancedParams, 'steps')
  if (steps != null) parameters.num_inference_steps = steps
  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) parameters.seed = Math.round(seed)

  const referenceImage = getImageReferenceInputs(context)[0]
  const body: Record<string, unknown> = referenceImage
    ? {
        inputs: await readReferenceImageAsBase64(referenceImage),
        parameters: {
          ...parameters,
          prompt: context.providerInput.prompt,
        },
      }
    : {
        inputs: context.providerInput.prompt,
        parameters,
      }

  if (referenceImage) {
    const referenceStrength = readNumberField(
      advancedParams,
      'referenceStrength',
    )
    if (referenceStrength != null) {
      const bodyParameters = body.parameters as Record<string, unknown>
      bodyParameters.strength = invertReferenceStrength(referenceStrength)
    }
  }

  const response = await fetch(
    `${HUGGINGFACE_IMAGE_BASE_URL}/${context.providerInput.externalModelId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `Hugging Face image generation failed (${response.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? 'image/png'
  const uploaded = await uploadImageBytesToKey(
    env,
    await response.arrayBuffer(),
    mimeType,
    getWorkerImageOutputKey(context),
  )

  return { ...uploaded, ...dimensions }
}

async function generateVolcEngineImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  const size =
    resolution === '4K'
      ? volcEngine4KSize(context.providerInput.aspectRatio)
      : getVolcEngineImageSize(context.providerInput.aspectRatio)
  const body: Record<string, unknown> = {
    model: context.providerInput.externalModelId,
    prompt: context.providerInput.prompt,
    content: [
      { type: 'text', text: context.providerInput.prompt },
      ...getImageReferenceInputs(context)
        .slice(0, 14)
        .map((url) => ({ type: 'image_url', image_url: { url } })),
    ],
    size: size.size,
    response_format: 'url',
    watermark: false,
    n: 1,
  }

  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) {
    body.seed = Math.min(Math.round(seed), 2_147_483_647)
  }
  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) body.guidance_scale = guidanceScale

  const response = await fetch(`${VOLCENGINE_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `VolcEngine image generation failed (${response.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const payload = (await response.json()) as Record<string, unknown>
  const data = Array.isArray(payload.data) ? payload.data : []
  const first = data.find(isRecord)
  const imageUrl = first ? readStringField(first, 'url') : null
  if (!imageUrl) {
    throw new Error('VolcEngine response did not include an image URL.')
  }

  const uploaded = await downloadAndUploadImageArtifactToKey(
    env,
    imageUrl,
    'image/png',
    getWorkerImageOutputKey(context),
  )

  return {
    ...uploaded,
    width: size.width,
    height: size.height,
    providerMetadata: { sourceUrlHost: new URL(imageUrl).host },
  }
}

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: unknown
  error?: unknown
}

function readReplicatePrediction(payload: unknown): ReplicatePrediction {
  if (!isRecord(payload)) {
    throw new Error('Replicate returned an invalid prediction response.')
  }
  const id = readStringField(payload, 'id')
  const status = readStringField(payload, 'status')
  if (
    !id ||
    (status !== 'starting' &&
      status !== 'processing' &&
      status !== 'succeeded' &&
      status !== 'failed' &&
      status !== 'canceled')
  ) {
    throw new Error('Replicate prediction response is missing id or status.')
  }
  return { id, status, output: payload.output, error: payload.error }
}

function getReplicateImageSchema(
  context: WorkerImageRunContext,
): 'flux' | 'sdxl' {
  if (
    context.providerInput.modelId === 'illustrious-xl' ||
    context.providerInput.externalModelId.includes('noobai')
  ) {
    return 'sdxl'
  }
  return 'flux'
}

async function buildReplicateImageInput(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
  civitaiToken: string | null = null,
): Promise<Record<string, unknown>> {
  const advancedParams = readAdvancedRecord(context)
  const schema = getReplicateImageSchema(context)

  const dimensions = getStandardImageDimensions(
    context.providerInput.aspectRatio,
  )
  const input: Record<string, unknown> =
    schema === 'sdxl'
      ? {
          prompt: context.providerInput.prompt,
          width: dimensions.width,
          height: dimensions.height,
        }
      : {
          prompt: context.providerInput.prompt,
          aspect_ratio: context.providerInput.aspectRatio,
        }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  if (negativePrompt) input.negative_prompt = negativePrompt
  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) {
    input[schema === 'sdxl' ? 'cfg_scale' : 'guidance_scale'] = guidanceScale
  }
  const steps = readPositiveNumberField(advancedParams, 'steps')
  if (steps != null) {
    input[schema === 'sdxl' ? 'steps' : 'num_inference_steps'] = steps
  }
  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) input.seed = Math.round(seed)

  const loras = getImageLoraInputs(context)
  if (loras.length > 0) {
    if (schema === 'sdxl') {
      const resolved = await Promise.all(
        loras.map(async (lora) => {
          const resolvedUrl = await resolveReplicateCivitaiUrl(
            lora.url,
            civitaiToken,
          )
          return {
            url: toReplicateReachableUrl(resolvedUrl, env),
            strength: lora.scale ?? 1,
          }
        }),
      )
      input.loras = JSON.stringify(resolved)
    } else {
      const first = loras[0]
      if (first) {
        const resolvedUrl = await resolveReplicateCivitaiUrl(
          first.url,
          civitaiToken,
        )
        input.hf_lora = toReplicateReachableUrl(resolvedUrl, env)
        if (first.scale != null) input.lora_scale = first.scale
      }
    }
  }

  const referenceImage = getImageReferenceInputs(context)[0]
  if (referenceImage) {
    input.image = referenceImage
    const referenceStrength = readNumberField(
      advancedParams,
      'referenceStrength',
    )
    if (referenceStrength != null) {
      input.strength = invertReferenceStrength(referenceStrength)
    }
  }

  return input
}

async function buildReplicatePredictionBody(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
  apiKey: string,
  civitaiToken: string | null = null,
): Promise<Record<string, unknown>> {
  const input = await buildReplicateImageInput(context, env, civitaiToken)
  if (getReplicateImageSchema(context) === 'flux') {
    return { model: context.providerInput.externalModelId, input }
  }

  const modelResponse = await fetch(
    `${REPLICATE_BASE_URL}/models/${context.providerInput.externalModelId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  )
  if (!modelResponse.ok) {
    throw await createProviderResponseError(modelResponse, {
      provider: 'replicate',
      phase: 'model_lookup',
      fallbackMessage: `Replicate model lookup failed with status ${modelResponse.status}`,
    })
  }
  const model = (await modelResponse.json()) as Record<string, unknown>
  const latestVersion = isRecord(model.latest_version)
    ? readStringField(model.latest_version, 'id')
    : null
  if (!latestVersion) {
    throw new Error('Replicate model response did not include latest version.')
  }
  return { version: latestVersion, input }
}

async function submitReplicateImagePrediction(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
  apiKey: string,
  civitaiToken: string | null = null,
): Promise<ReplicatePrediction> {
  const response = await fetch(`${REPLICATE_BASE_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(
      await buildReplicatePredictionBody(context, env, apiKey, civitaiToken),
    ),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'replicate',
      phase: 'prediction_submit',
      fallbackMessage: `Replicate prediction submit failed with status ${response.status}`,
    })
  }

  return readReplicatePrediction(await response.json())
}

async function pollReplicateImagePrediction(
  predictionId: string,
  apiKey: string,
): Promise<ReplicatePrediction> {
  const response = await fetch(
    `${REPLICATE_BASE_URL}/predictions/${predictionId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  )
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'replicate',
      phase: 'prediction_poll',
      fallbackMessage: `Replicate poll failed with status ${response.status}`,
      requestId: predictionId,
    })
  }
  return readReplicatePrediction(await response.json())
}

function extractReplicateImageUrl(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const first = output[0]
    if (typeof first === 'string') return first
    if (isRecord(first)) {
      const url = readStringField(first, 'url')
      if (url) return url
    }
  }
  if (isRecord(output)) {
    const url = readStringField(output, 'url')
    if (url) return url
  }
  throw new Error('Replicate output did not include an image URL.')
}

function isNovelAiV4Model(externalModelId: string): boolean {
  return (
    externalModelId === 'nai-diffusion-4-full' ||
    externalModelId === 'nai-diffusion-4-curated-preview' ||
    externalModelId === 'nai-diffusion-4-5-full' ||
    externalModelId === 'nai-diffusion-4-5-curated'
  )
}

function randomUint32(): number {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return bytes[0]
}

async function inflateRawZipEntry(bytes: Uint8Array): Promise<Uint8Array> {
  const chunkBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(chunkBuffer).set(bytes)
  const stream = new Blob([chunkBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function extractNovelAiZipImage(
  zipBytes: Uint8Array,
): Promise<Uint8Array> {
  if (
    zipBytes[0] !== 0x50 ||
    zipBytes[1] !== 0x4b ||
    zipBytes[2] !== 0x03 ||
    zipBytes[3] !== 0x04
  ) {
    throw new Error('NovelAI returned an invalid ZIP image response.')
  }

  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  )
  const compressionMethod = view.getUint16(8, true)
  let compressedSize = view.getUint32(18, true)
  const filenameLength = view.getUint16(26, true)
  const extraFieldLength = view.getUint16(28, true)
  const dataOffset = 30 + filenameLength + extraFieldLength

  if (compressedSize === 0) {
    for (let index = dataOffset; index < zipBytes.length - 3; index += 1) {
      if (
        zipBytes[index] === 0x50 &&
        zipBytes[index + 1] === 0x4b &&
        (zipBytes[index + 2] === 0x01 || zipBytes[index + 2] === 0x03)
      ) {
        compressedSize = index - dataOffset
        break
      }
    }
  }

  const compressed = zipBytes.subarray(dataOffset, dataOffset + compressedSize)
  if (compressionMethod === 0) return compressed
  if (compressionMethod === 8) return inflateRawZipEntry(compressed)
  throw new Error(
    `NovelAI ZIP compression is unsupported: ${compressionMethod}`,
  )
}

async function generateNovelAiImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const referenceImages = getImageReferenceInputs(context)
  if (referenceImages.length > 1) {
    throw new Error(
      'NovelAI multi-reference Director generation is not worker-migrated yet.',
    )
  }

  const dimensions = getNovelAiImageDimensions(
    context.providerInput.aspectRatio,
  )
  const advancedParams = readAdvancedRecord(context)
  const externalModelId = context.providerInput.externalModelId
  const referenceImage = referenceImages[0]
  const isImg2Img = Boolean(referenceImage)
  const negative =
    readStringField(advancedParams, 'negativePrompt') ??
    'lowres, bad anatomy, bad hands, missing fingers, extra digit'
  const configuredSeed = readNumberField(advancedParams, 'seed')
  const seed =
    configuredSeed != null && configuredSeed >= 0
      ? Math.round(configuredSeed)
      : randomUint32()
  const useV4 = isNovelAiV4Model(externalModelId)
  const parameters: Record<string, unknown> = {
    params_version: useV4 ? 3 : 1,
    width: dimensions.width,
    height: dimensions.height,
    scale: readNumberField(advancedParams, 'guidanceScale') ?? 5,
    sampler: 'k_euler_ancestral',
    steps: readPositiveNumberField(advancedParams, 'steps') ?? 28,
    seed,
    extra_noise_seed: seed,
    n_samples: 1,
    ucPreset: useV4 ? 4 : 3,
    qualityToggle: false,
    sm: false,
    sm_dyn: false,
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: isImg2Img && useV4,
    cfg_rescale: 0,
    noise_schedule: 'karras',
    legacy_v3_extend: false,
    skip_cfg_above_sigma: null,
    use_coords: false,
    characterPrompts: [],
    negative_prompt: negative,
    prompt: context.providerInput.prompt,
    reference_image_multiple: [],
    reference_information_extracted_multiple: [],
    reference_strength_multiple: [],
  }

  if (referenceImage) {
    parameters.image = await readReferenceImageAsBase64(referenceImage)
    parameters.strength = invertReferenceStrength(
      readNumberField(advancedParams, 'referenceStrength') ?? 0.7,
    )
    parameters.noise = 0
    parameters.extra_noise_seed = seed
  }

  if (useV4) {
    parameters.v4_prompt = {
      caption: {
        base_caption: context.providerInput.prompt,
        char_captions: [],
      },
      use_coords: false,
      use_order: true,
    }
    parameters.v4_negative_prompt = {
      caption: { base_caption: negative, char_captions: [] },
      legacy_uc: false,
    }
  }

  const response = await fetch(`${NOVELAI_IMAGE_BASE_URL}/ai/generate-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      input: context.providerInput.prompt,
      model: externalModelId,
      action: isImg2Img ? 'img2img' : 'generate',
      parameters,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `NovelAI image generation failed (${response.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const imageBytes = await extractNovelAiZipImage(
    new Uint8Array(await response.arrayBuffer()),
  )
  const uploaded = await uploadImageBytesToKey(
    env,
    imageBytes,
    'image/png',
    getWorkerImageOutputKey(context),
  )

  return { ...uploaded, ...dimensions }
}

/**
 * Call OpenAI's image API and upload the result to R2. gpt-image models return
 * base64 (no hosted URL), so the worker persists the bytes to R2 and returns a
 * public URL for the Vercel callback to finalize.
 */
async function generateOpenAIImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<{
  artifactUrl: string
  imageR2Key: string
  width: number
  height: number
  mimeType: string
}> {
  const { providerInput } = context
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  const { size, width, height } =
    resolution && isImageResolutionTier(resolution)
      ? tieredOpenAISize(providerInput.aspectRatio, resolution)
      : aspectRatioToOpenAISize(providerInput.aspectRatio)
  const referenceImages = getImageReferenceInputs(context)
  const body: Record<string, unknown> =
    referenceImages.length > 0
      ? {
          model: providerInput.externalModelId,
          prompt: providerInput.prompt,
          images: referenceImages.map((imageUrl) => ({ image_url: imageUrl })),
          size,
          n: 1,
        }
      : {
          model: providerInput.externalModelId,
          prompt: providerInput.prompt,
          size,
          n: 1,
        }

  const quality = readStringField(advancedParams, 'quality')
  if (quality) body.quality = quality
  const background = readStringField(advancedParams, 'background')
  if (background) body.background = background

  const response = await fetch(
    `${OPENAI_BASE_URL}/v1/images/${
      referenceImages.length > 0 ? 'edits' : 'generations'
    }`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new OpenAIImageError(
      response.status,
      `OpenAI image generation failed (${response.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: unknown }>
  }
  const b64 = payload.data?.[0]?.b64_json
  if (typeof b64 !== 'string') {
    throw new Error('OpenAI response did not include base64 image data.')
  }

  const bytes = base64ToBytes(b64)
  const mimeType = 'image/png'
  const r2Key = providerInput.outputStorageKey ?? `image/${context.runId}.png`
  await env.GENERATION_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: mimeType },
  })

  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${r2Key}`,
    imageR2Key: r2Key,
    width,
    height,
    mimeType,
  }
}

export class ImageQueueWorkflow extends WorkflowEntrypoint<
  ExecutionEnv,
  WorkerImageRunContext
> {
  async run(
    event: WorkflowEvent<WorkerImageRunContext>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const context = event.payload

    try {
      // Resolve + AES-GCM encrypt the API key once before persisting in
      // workflow state (same pattern as the 3D/video workflows).
      const encryptedApiKey = await step.do(
        'resolve-api-key',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const plaintext = await resolveApiKeyImage(this.env, context)
          return encryptStateString(plaintext, this.env)
        },
      )

      let result: WorkerImageGenerationResult

      if (context.providerId === 'fal') {
        const queue = await step.do(
          'submit-fal-image',
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            const civitaiToken = hasCivitaiLora(context)
              ? await resolveCivitaiTokenImage(this.env, context)
              : null
            return submitFalImageQueue(context, apiKey, civitaiToken)
          },
        )

        let falResult: FalImageResult | undefined
        for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
          await step.sleep(`wait-fal-image-${attempt}`, context.pollIntervalMs)

          const pollResult = await step.do(
            `poll-fal-image-${attempt}`,
            {
              retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
              timeout: '30 seconds',
            },
            async () => {
              const apiKey = await decryptStateString(encryptedApiKey, this.env)
              return pollFalImageQueue(queue, apiKey)
            },
          )

          if (pollResult.status === 'FAILED') {
            throw new WorkerProviderError({
              message: pollResult.error ?? 'fal.ai image generation failed.',
              provider: context.providerId,
              phase: 'image_poll',
              errorCode: pollResult.errorCode,
              providerMetadata: pollResult.providerMetadata,
            })
          }

          if (pollResult.status === 'COMPLETED' && pollResult.imageUrl) {
            falResult = pollResult
            break
          }
        }

        if (!falResult?.imageUrl) {
          throw new Error('fal.ai image generation timed out.')
        }

        const dimensions = FAL_IMAGE_DIMENSIONS[
          context.providerInput.aspectRatio
        ] ?? { width: 1024, height: 1024 }
        const uploaded = await step.do(
          'upload-fal-image',
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
          () =>
            downloadAndUploadImageArtifactToKey(
              this.env,
              falResult.imageUrl!,
              falResult.mimeType ?? 'image/png',
              context.providerInput.outputStorageKey ??
                `image/${context.runId}.png`,
            ),
        )

        result = {
          artifactUrl: uploaded.artifactUrl,
          imageR2Key: uploaded.imageR2Key,
          width: falResult.width ?? dimensions.width,
          height: falResult.height ?? dimensions.height,
          mimeType: uploaded.mimeType,
          providerMetadata: falResult.providerMetadata,
        }
      } else if (context.providerId === 'replicate') {
        const prediction = await step.do(
          'submit-replicate-image',
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            const civitaiToken = hasCivitaiLora(context)
              ? await resolveCivitaiTokenImage(this.env, context)
              : null
            return submitReplicateImagePrediction(
              context,
              this.env,
              apiKey,
              civitaiToken,
            )
          },
        )

        let completedPrediction =
          prediction.status === 'succeeded' ? prediction : undefined
        for (
          let attempt = 1;
          !completedPrediction && attempt <= context.maxAttempts;
          attempt += 1
        ) {
          await step.sleep(
            `wait-replicate-image-${attempt}`,
            context.pollIntervalMs,
          )
          const pollResult = await step.do(
            `poll-replicate-image-${attempt}`,
            {
              retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
              timeout: '30 seconds',
            },
            async () => {
              const apiKey = await decryptStateString(encryptedApiKey, this.env)
              return pollReplicateImagePrediction(prediction.id, apiKey)
            },
          )

          if (
            pollResult.status === 'failed' ||
            pollResult.status === 'canceled'
          ) {
            throw new WorkerProviderError({
              message: `Replicate image generation failed: ${String(
                pollResult.error ?? 'unknown',
              )}`,
              provider: context.providerId,
              phase: 'prediction_poll',
              requestId: pollResult.id,
              providerMetadata: {
                predictionId: pollResult.id,
                status: pollResult.status,
                providerError: pollResult.error,
              },
            })
          }
          if (pollResult.status === 'succeeded') {
            completedPrediction = pollResult
          }
        }

        if (!completedPrediction) {
          throw new Error('Replicate image generation timed out.')
        }

        const imageUrl = extractReplicateImageUrl(completedPrediction.output)
        const dimensions = getStandardImageDimensions(
          context.providerInput.aspectRatio,
        )
        const uploaded = await step.do(
          'upload-replicate-image',
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return downloadAndUploadImageArtifactToKey(
              this.env,
              imageUrl,
              'image/png',
              getWorkerImageOutputKey(context),
              { Authorization: `Bearer ${apiKey}` },
            )
          },
        )
        result = {
          ...uploaded,
          ...dimensions,
          providerMetadata: { predictionId: completedPrediction.id },
        }
      } else if (context.providerId === 'gemini') {
        result = await step.do(
          'generate-gemini-image',
          {
            retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 600_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return generateGeminiImage(this.env, context, apiKey)
          },
        )
      } else if (context.providerId === 'huggingface') {
        result = await step.do(
          'generate-huggingface-image',
          {
            retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 600_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return generateHuggingFaceImage(this.env, context, apiKey)
          },
        )
      } else if (context.providerId === 'volcengine') {
        result = await step.do(
          'generate-volcengine-image',
          {
            retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 600_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return generateVolcEngineImage(this.env, context, apiKey)
          },
        )
      } else if (context.providerId === 'novelai') {
        result = await step.do(
          'generate-novelai-image',
          {
            retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 600_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return generateNovelAiImage(this.env, context, apiKey)
          },
        )
      } else if (context.providerId === 'openai') {
        result = await step.do(
          'generate-openai-image',
          {
            retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 600_000),
          },
          async () => {
            const apiKey = await decryptStateString(encryptedApiKey, this.env)
            return generateOpenAIImage(this.env, context, apiKey)
          },
        )
      } else {
        throw new Error(`Image provider ${context.providerId} is not migrated.`)
      }

      await step.do('callback-result', async () =>
        emitImageCallback(this.env, context, {
          artifactUrl: result.artifactUrl,
          imageR2Key: result.imageR2Key,
          width: result.width,
          height: result.height,
          mimeType: result.mimeType,
          providerMetadata: result.providerMetadata,
          requestCount: 1,
        }),
      )

      return { status: 'COMPLETED', runId: context.runId }
    } catch (error) {
      const failureData = buildWorkerFailureCallbackData(error, {
        message: 'Workflow execution failed.',
        providerMetadata: {
          workflowInstanceId: event.instanceId,
          ...(error instanceof OpenAIImageError
            ? { status: error.status }
            : {}),
        },
      })

      await step.do('callback-failure', async () =>
        emitImageCallback(this.env, context, failureData),
      )

      return { status: 'FAILED', runId: context.runId }
    }
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

  const instance = await env.IMAGE_QUEUE_WORKFLOW.create({
    id: runContext.runId,
    params: runContext,
  })

  return jsonResponse({ workflowInstanceId: instance.id })
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

    if (
      request.method === 'POST' &&
      url.pathname === LONG_VIDEO_PIPELINE_PATH
    ) {
      return handleLongVideoPipelineDispatch(request, env)
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

    return jsonResponse({ ok: false, error: 'Not found.' }, { status: 404 })
  },
}

export default executionWorker
