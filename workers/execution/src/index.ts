import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { Workflow, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

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
    resolution?: string
    i2vModelId?: string
    videoDefaults?: Record<string, unknown>
    providerBaseUrl?: string
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
    referenceAudioUrl: string
    referenceText?: string
    voiceId?: string
    speed?: number
    format?: string
    sampleRate?: number
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
  }
}

interface LongVideoPipelineRunContext {
  runId: string
  workflowId: typeof LONG_VIDEO_PIPELINE_WORKFLOW_ID
  pipelineId: string
  advanceUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
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
    imageUrl: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue : null
}

function readPositiveNumberField(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'number' && fieldValue > 0 ? fieldValue : null
}

function readBooleanField(
  value: Record<string, unknown>,
  key: string,
): boolean | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'boolean' ? fieldValue : null
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

function isCallbackKind(value: unknown): value is CallbackKind {
  return CALLBACK_KINDS.some((candidate) => candidate === value)
}

function isWorkerWorkflowId(value: unknown): value is WorkerWorkflowId {
  return QUEUE_WORKFLOW_IDS.some((candidate) => candidate === value)
}

function isLongVideoPipelineWorkflowId(
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

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(value: string): Uint8Array | null {
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

function timingSafeEqualHex(left: string, right: string): boolean {
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

async function signBody(secret: string, body: string): Promise<string> {
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

async function verifySignedBody(
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

function parseWorkerRunContext(input: unknown): WorkerRunContext | null {
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
    if (!referenceAudioUrl) return null

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
        referenceAudioUrl,
        referenceText:
          readStringField(providerInput, 'referenceText') ?? undefined,
        voiceId: readStringField(providerInput, 'voiceId') ?? undefined,
        speed: readPositiveNumberField(providerInput, 'speed') ?? undefined,
        format: readStringField(providerInput, 'format') ?? undefined,
        sampleRate:
          readPositiveNumberField(providerInput, 'sampleRate') ?? undefined,
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
      resolution: readStringField(providerInput, 'resolution') ?? undefined,
      i2vModelId: readStringField(providerInput, 'i2vModelId') ?? undefined,
      videoDefaults: isRecord(providerInput.videoDefaults)
        ? providerInput.videoDefaults
        : undefined,
      providerBaseUrl:
        readStringField(providerInput, 'providerBaseUrl') ?? undefined,
      width,
      height,
    },
  }
}

function parseLongVideoPipelineRunContext(
  input: unknown,
): LongVideoPipelineRunContext | null {
  if (!isRecord(input)) return null

  const runId = readStringField(input, 'runId')
  const workflowId = readStringField(input, 'workflowId')
  const pipelineId = readStringField(input, 'pipelineId')
  const advanceUrl = readStringField(input, 'advanceUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')

  if (
    !runId ||
    !isLongVideoPipelineWorkflowId(workflowId) ||
    !pipelineId ||
    !advanceUrl ||
    !timeoutMs ||
    !maxAttempts ||
    !pollIntervalMs
  ) {
    return null
  }

  return {
    runId,
    workflowId,
    pipelineId,
    advanceUrl,
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
  }
}

function isModel3DWorkflowId(
  value: unknown,
): value is typeof HYPER3D_RODIN_WORKFLOW_ID | typeof HUNYUAN3D_WORKFLOW_ID {
  return value === HYPER3D_RODIN_WORKFLOW_ID || value === HUNYUAN3D_WORKFLOW_ID
}

function parseModel3DRunContext(
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
    !imageUrl ||
    !modelId ||
    !externalModelId
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
      imageUrl,
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

async function encryptStateString(
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

async function decryptStateString(
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
  // addons: array of strings. Only 'HighPack' is supported per docs.
  if (providerInput.highPack) {
    form.append('addons', JSON.stringify(['HighPack']))
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
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `Hyper3D Rodin submit failed with status ${response.status}: ${errBody.slice(0, 400)}`,
    )
  }

  const data = (await response.json()) as Record<string, unknown>
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
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `Hyper3D Rodin texture-only submit failed with status ${response.status}: ${errBody.slice(0, 400)}`,
    )
  }

  const data = (await response.json()) as Record<string, unknown>
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
    const errBody = await response.text().catch(() => '')
    console.error(
      `[Rodin] poll failed status ${response.status}:`,
      errBody.slice(0, 300),
    )
    return { status: 'IN_QUEUE' }
  }

  const data = (await response.json()) as Record<string, unknown>
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
    return { status: 'FAILED' }
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
  context: WorkerRunContext,
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
    throw new Error(`fal.ai queue submit failed with status ${response.status}`)
  }

  const data = (await response.json()) as Record<string, unknown>
  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai queue submit returned an invalid response.')
  }

  return { requestId, statusUrl, responseUrl }
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
    throw new Error(
      `fal.ai status poll failed with status ${statusResponse.status}`,
    )
  }

  const statusData = (await statusResponse.json()) as Record<string, unknown>
  const status = readStringField(statusData, 'status')

  if (status && isFalQueueFailureStatus(status)) {
    return {
      status: 'FAILED',
      providerMetadata: { requestId: queue.requestId },
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
    throw new Error(
      `fal.ai result fetch failed with status ${resultResponse.status}`,
    )
  }

  const resultData = (await resultResponse.json()) as Record<string, unknown>
  if (outputType === 'AUDIO') {
    const audio = readFalAudioArtifact(resultData)
    if (!audio.artifactUrl) {
      throw new Error('fal.ai result response did not include an audio URL.')
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
    throw new Error('fal.ai result response did not include a video URL.')
  }

  return {
    status: 'COMPLETED',
    artifactUrl,
    thumbnailUrl: thumbnailUrl ?? undefined,
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
          throw new Error('Provider reported failed status.')
        }

        if (pollResult.status === 'COMPLETED' && pollResult.artifactUrl) {
          await step.do('callback-result', async () =>
            emitCallback(this.env, context, {
              artifactUrl: pollResult.artifactUrl,
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
      const message =
        error instanceof Error ? error.message : 'Workflow execution failed.'

      await step.do('callback-failure', async () =>
        emitCallback(this.env, context, {
          error: message,
          providerMetadata: { workflowInstanceId: event.instanceId },
        }),
      )

      return { status: 'FAILED', runId: context.runId }
    }
  }
}

async function postLongVideoPipelineAdvance(
  env: ExecutionEnv,
  context: LongVideoPipelineRunContext,
  action: 'advance' | 'fail',
  data?: { attempt?: number; error?: string },
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
      attempt: data?.attempt,
      error: data?.error,
    },
  )

  if (!response.ok) {
    throw new Error(
      `Long-video pipeline advance failed with status ${response.status}`,
    )
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: unknown
    error?: string
  }

  if (payload.success !== true || !isRecord(payload.data)) {
    throw new Error(payload.error ?? 'Invalid long-video advance response.')
  }

  const pipelineId = readStringField(payload.data, 'pipelineId')
  const status = readStringField(payload.data, 'status')
  if (!pipelineId || !status) {
    throw new Error('Long-video advance response is missing pipeline status.')
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
      for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
        const status = await step.do(
          `advance-pipeline-${attempt}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: Math.min(context.timeoutMs, 1_800_000),
          },
          () =>
            postLongVideoPipelineAdvance(this.env, context, 'advance', {
              attempt,
            }),
        )

        if (isLongVideoPipelineTerminalStatus(status.status)) {
          return {
            status: status.status,
            runId: context.runId,
            pipelineId: context.pipelineId,
          }
        }

        await step.sleep(`wait-pipeline-${attempt}`, context.pollIntervalMs)
      }

      throw new Error('Long-video pipeline polling timed out.')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Long-video workflow execution failed.'

      await step.do('mark-pipeline-failed', async () =>
        postLongVideoPipelineAdvance(this.env, context, 'fail', {
          error: message,
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
          throw new Error('Hyper3D Rodin reported failed status.')
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
      const message =
        error instanceof Error ? error.message : 'Workflow execution failed.'

      await step.do('callback-failure', async () =>
        emitModel3DCallback(this.env, context, {
          error: message,
          providerMetadata: { workflowInstanceId: event.instanceId },
        }),
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
            throw new Error(
              `fal.ai 3D queue submit failed with status ${response.status}`,
            )
          }

          const data = (await response.json()) as Record<string, unknown>
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
              throw new Error(
                `fal.ai 3D status poll failed with status ${statusResponse.status}`,
              )
            }

            const statusData = (await statusResponse.json()) as Record<
              string,
              unknown
            >
            const status = readStringField(statusData, 'status')

            if (status && isFalQueueFailureStatus(status)) {
              return { status: 'FAILED' as const }
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
              throw new Error(
                `fal.ai 3D result fetch failed with status ${resultResponse.status}`,
              )
            }

            const resultData = (await resultResponse.json()) as Record<
              string,
              unknown
            >
            const artifact = readFalModel3DResult(resultData)

            if (!artifact.artifactUrl) {
              throw new Error(
                'fal.ai 3D result did not include a model mesh URL.',
              )
            }

            return {
              status: 'COMPLETED' as const,
              artifactUrl: artifact.artifactUrl,
              mimeType: artifact.mimeType,
            }
          },
        )

        if (pollResult.status === 'FAILED') {
          throw new Error('fal.ai 3D reported failed status.')
        }

        if (
          pollResult.status === 'COMPLETED' &&
          'artifactUrl' in pollResult &&
          pollResult.artifactUrl
        ) {
          await step.do('callback-result', async () =>
            emitModel3DCallback(this.env, context, {
              artifactUrl: pollResult.artifactUrl,
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
      const message =
        error instanceof Error ? error.message : 'Workflow execution failed.'

      await step.do('callback-failure', async () =>
        emitModel3DCallback(this.env, context, {
          error: message,
          providerMetadata: { workflowInstanceId: event.instanceId },
        }),
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
  width: number
  height: number
  mimeType: string
}> {
  const { providerInput } = context
  const { size, width, height } = aspectRatioToOpenAISize(
    providerInput.aspectRatio,
  )

  const response = await fetch(`${OPENAI_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      model: providerInput.externalModelId,
      prompt: providerInput.prompt,
      size,
      n: 1,
    }),
  })

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
  const r2Key = `image/${context.runId}.png`
  await env.GENERATION_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: mimeType },
  })

  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${r2Key}`,
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

      // Image providers are synchronous HTTP — no provider-side polling.
      const result = await step.do(
        'generate-image',
        {
          retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
          timeout: Math.min(context.timeoutMs, 600_000),
        },
        async () => {
          const apiKey = await decryptStateString(encryptedApiKey, this.env)
          return generateOpenAIImage(this.env, context, apiKey)
        },
      )

      await step.do('callback-result', async () =>
        emitImageCallback(this.env, context, {
          artifactUrl: result.artifactUrl,
          width: result.width,
          height: result.height,
          mimeType: result.mimeType,
          requestCount: 1,
        }),
      )

      return { status: 'COMPLETED', runId: context.runId }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Workflow execution failed.'

      await step.do('callback-failure', async () =>
        emitImageCallback(this.env, context, {
          error: message,
          status: error instanceof OpenAIImageError ? error.status : undefined,
          providerMetadata: { workflowInstanceId: event.instanceId },
        }),
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
