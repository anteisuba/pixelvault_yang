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
const MODEL_3D_WORKFLOW_IDS = ['HYPER3D_RODIN', 'HUNYUAN3D'] as const
const LONG_VIDEO_PIPELINE_WORKFLOW_ID = 'LONG_VIDEO_PIPELINE'

type CallbackKind = (typeof CALLBACK_KINDS)[number]
type WorkerWorkflowId = (typeof QUEUE_WORKFLOW_IDS)[number]
type Model3DWorkflowId = (typeof MODEL_3D_WORKFLOW_IDS)[number]

interface ExecutionEnv {
  INTERNAL_CALLBACK_URL?: string
  INTERNAL_CALLBACK_SECRET?: string
  R2_PUBLIC_URL?: string
  CINEMATIC_SHORT_VIDEO_WORKFLOW: Workflow<WorkerRunContext>
  LONG_VIDEO_PIPELINE_WORKFLOW: Workflow<LongVideoPipelineRunContext>
  HYPER3D_RODIN_WORKFLOW: Workflow<WorkerModel3DRunContext>
  HUNYUAN3D_WORKFLOW: Workflow<WorkerModel3DRunContext>
  GENERATION_BUCKET?: R2Bucket
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
    duration?: number
    referenceImage?: string
    referenceImages?: string[]
    negativePrompt?: string
    resolution?: string
    i2vModelId?: string
    videoDefaults?: Record<string, unknown>
    voiceId?: string
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
  workflowId: Model3DWorkflowId
  providerId: string
  apiKeyId?: string
  useSystemKey?: boolean
  callbackUrl: string
  resolveKeyUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
  outputType: 'MODEL_3D'
  userId: string
  providerInput: {
    imageUrl: string
    modelId: string
    externalModelId: string
    seed?: number
    // Rodin-specific
    tier?: string
    meshMode?: string
    textureMode?: string
    material?: string
    highPack?: boolean
    taPose?: boolean
    hdTexture?: boolean
    textureDelight?: boolean
    qualityOverride?: number
    additionalImageUrls?: string[]
    bboxCondition?: number[]
    // Hunyuan3D / Trellis (FAL-based)
    texturedMesh?: boolean
    octreeResolution?: number
    enablePbr?: boolean
    faceCount?: number
    generateType?: string
    polygonType?: string
    trellisResolution?: string
    trellisTextureSize?: string
    trellisDecimationTarget?: number
    trellisRemesh?: boolean
    trellisRemeshProject?: number
    trellisStructureSamplingSteps?: number
    trellisShapeSamplingSteps?: number
    trellisTextureSamplingSteps?: number
    removeBackground?: boolean
  }
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

function readStringArrayField(
  value: Record<string, unknown>,
  key: string,
): string[] | null {
  const fieldValue = value[key]
  if (!Array.isArray(fieldValue)) return null
  const strings = fieldValue.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  )
  return strings.length > 0 ? strings : null
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

function isModel3DWorkflowId(value: unknown): value is Model3DWorkflowId {
  return MODEL_3D_WORKFLOW_IDS.some((candidate) => candidate === value)
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

// ─── MODEL_3D parsing ─────────────────────────────────────────────────────────

function parseWorkerModel3DRunContext(
  input: unknown,
): WorkerModel3DRunContext | null {
  if (!isRecord(input)) return null
  const pi = input.providerInput
  if (!isRecord(pi)) return null

  const runId = readStringField(input, 'runId')
  const workflowId = readStringField(input, 'workflowId')
  const providerId = readStringField(input, 'providerId')
  const userId = readStringField(input, 'userId')
  const apiKeyId = readStringField(input, 'apiKeyId') ?? undefined
  const useSystemKey = readBooleanField(input, 'useSystemKey') ?? undefined
  const callbackUrl = readStringField(input, 'callbackUrl')
  const resolveKeyUrl = readStringField(input, 'resolveKeyUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')
  const imageUrl = readStringField(pi, 'imageUrl')
  const modelId = readStringField(pi, 'modelId')
  const externalModelId = readStringField(pi, 'externalModelId')

  if (
    !runId ||
    !isModel3DWorkflowId(workflowId) ||
    !providerId ||
    !userId ||
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

  const additionalImageUrls =
    readStringArrayField(pi, 'additionalImageUrls') ?? undefined

  const bboxRaw = pi.bboxCondition
  const bboxCondition =
    Array.isArray(bboxRaw) &&
    bboxRaw.length === 6 &&
    bboxRaw.every((n) => typeof n === 'number')
      ? (bboxRaw as number[])
      : undefined

  return {
    runId,
    workflowId,
    outputType: 'MODEL_3D',
    providerId,
    userId,
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
      seed: readPositiveNumberField(pi, 'seed') ?? undefined,
      // Rodin
      tier: readStringField(pi, 'tier') ?? undefined,
      meshMode: readStringField(pi, 'meshMode') ?? undefined,
      textureMode: readStringField(pi, 'textureMode') ?? undefined,
      material: readStringField(pi, 'material') ?? undefined,
      highPack: readBooleanField(pi, 'highPack') ?? undefined,
      taPose: readBooleanField(pi, 'taPose') ?? undefined,
      hdTexture: readBooleanField(pi, 'hdTexture') ?? undefined,
      textureDelight: readBooleanField(pi, 'textureDelight') ?? undefined,
      qualityOverride:
        readPositiveNumberField(pi, 'qualityOverride') ?? undefined,
      additionalImageUrls,
      bboxCondition,
      // FAL / Hunyuan3D
      texturedMesh: readBooleanField(pi, 'texturedMesh') ?? undefined,
      octreeResolution:
        readPositiveNumberField(pi, 'octreeResolution') ?? undefined,
      enablePbr: readBooleanField(pi, 'enablePbr') ?? undefined,
      faceCount: readPositiveNumberField(pi, 'faceCount') ?? undefined,
      generateType: readStringField(pi, 'generateType') ?? undefined,
      polygonType: readStringField(pi, 'polygonType') ?? undefined,
      trellisResolution: readStringField(pi, 'trellisResolution') ?? undefined,
      trellisTextureSize:
        readStringField(pi, 'trellisTextureSize') ?? undefined,
      trellisDecimationTarget:
        readPositiveNumberField(pi, 'trellisDecimationTarget') ?? undefined,
      trellisRemesh: readBooleanField(pi, 'trellisRemesh') ?? undefined,
      trellisRemeshProject:
        readPositiveNumberField(pi, 'trellisRemeshProject') ?? undefined,
      trellisStructureSamplingSteps:
        readPositiveNumberField(pi, 'trellisStructureSamplingSteps') ??
        undefined,
      trellisShapeSamplingSteps:
        readPositiveNumberField(pi, 'trellisShapeSamplingSteps') ?? undefined,
      trellisTextureSamplingSteps:
        readPositiveNumberField(pi, 'trellisTextureSamplingSteps') ?? undefined,
      removeBackground: readBooleanField(pi, 'removeBackground') ?? undefined,
    },
  }
}

// ─── MODEL_3D R2 helpers ──────────────────────────────────────────────────────

function generateModel3DStorageKey(userId: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const random = [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `generations/${userId}/model_3d/${date}_${random}.glb`
}

async function downloadGlbBytes(
  url: string,
  bearerToken: string,
): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    throw new Error(`GLB download failed: HTTP ${res.status}`)
  }
  return res.arrayBuffer()
}

async function uploadGlbToR2(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
): Promise<void> {
  await bucket.put(key, data, {
    httpMetadata: { contentType: 'model/gltf-binary' },
  })
}

async function emitModel3DCallback(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
  data: Record<string, unknown>,
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

// ─── Hyper3D Rodin helpers ────────────────────────────────────────────────────

const HYPER3D_BASE_URL = 'https://api.hyper3d.com'

interface RodinSubmitResult {
  jobUuid: string
  statusUrl: string
  downloadUrl: string
}

async function submitHyper3DRodin(
  context: WorkerModel3DRunContext,
  apiKey: string,
): Promise<RodinSubmitResult> {
  const pi = context.providerInput
  const form = new FormData()

  form.append('image_urls[]', pi.imageUrl)
  if (pi.additionalImageUrls?.length) {
    for (const url of pi.additionalImageUrls) {
      form.append('image_urls[]', url)
    }
  }
  if (pi.tier) form.append('tier', pi.tier)
  if (pi.meshMode) form.append('mesh', pi.meshMode)
  if (pi.textureMode) form.append('texture', pi.textureMode)
  if (pi.material) form.append('material', pi.material)
  if (pi.highPack != null) form.append('high_pack', String(pi.highPack))
  if (pi.taPose != null) form.append('t_a_pose', String(pi.taPose))
  if (pi.hdTexture != null) form.append('hd_texture', String(pi.hdTexture))
  if (pi.textureDelight != null)
    form.append('texture_delight', String(pi.textureDelight))
  if (pi.qualityOverride != null)
    form.append('quality_override', String(pi.qualityOverride))
  if (pi.seed != null && pi.seed >= 0) form.append('seed', String(pi.seed))
  if (pi.bboxCondition) {
    form.append('condition_mode', 'gt')
    form.append('bbox_condition', JSON.stringify(pi.bboxCondition))
  }

  const res = await fetch(`${HYPER3D_BASE_URL}/api/v2/rodin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown')
    throw new Error(
      `Hyper3D Rodin submit failed: HTTP ${res.status} — ${body.slice(0, 200)}`,
    )
  }

  const data = (await res.json()) as Record<string, unknown>
  const jobUuid = readStringField(data, 'uuid')
  if (!jobUuid) {
    throw new Error('Hyper3D Rodin submit response missing uuid field')
  }

  return {
    jobUuid,
    statusUrl: `${HYPER3D_BASE_URL}/api/v2/status?job_uuid=${jobUuid}`,
    downloadUrl: `${HYPER3D_BASE_URL}/api/v2/download?job_uuid=${jobUuid}&format=glb`,
  }
}

async function pollHyper3DRodinStatus(
  statusUrl: string,
  apiKey: string,
): Promise<'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'> {
  let res: Response
  try {
    res = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return 'IN_QUEUE'
  }

  if (!res.ok) return 'IN_QUEUE'

  const raw = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!raw) return 'IN_PROGRESS'

  const messages: Array<Record<string, unknown>> = Array.isArray(raw.jobs)
    ? (raw.jobs as Array<Record<string, unknown>>)
    : Array.isArray(raw.status_messages)
      ? (raw.status_messages as Array<Record<string, unknown>>)
      : []

  if (messages.length === 0) return 'IN_PROGRESS'

  const statuses = messages.map((m) => {
    const s = String(m.status ?? '').toLowerCase()
    if (s === 'succeeded' || s === 'done' || s === 'completed')
      return 'COMPLETED' as const
    if (s === 'failed' || s === 'error') return 'FAILED' as const
    if (s === 'running' || s === 'processing') return 'IN_PROGRESS' as const
    return 'IN_QUEUE' as const
  })

  if (statuses.some((s) => s === 'FAILED')) return 'FAILED'
  if (statuses.every((s) => s === 'COMPLETED')) return 'COMPLETED'
  if (statuses.some((s) => s === 'IN_PROGRESS')) return 'IN_PROGRESS'
  return 'IN_QUEUE'
}

// ─── Hunyuan3D / FAL-based 3D helpers ────────────────────────────────────────

const FAL_QUEUE_BASE_URL = 'https://queue.fal.run'

// Map of FAL model IDs → the form field name for the primary image
const FAL_3D_IMAGE_FIELD: Record<string, string> = {
  'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d': 'front_image_url',
  'fal-ai/hunyuan3d-v3/image-to-3d': 'front_image_url',
}

async function submitHunyuanFal(
  context: WorkerModel3DRunContext,
  apiKey: string,
): Promise<FalQueueSubmitResult> {
  const pi = context.providerInput
  const imageField = FAL_3D_IMAGE_FIELD[pi.externalModelId] ?? 'image_url'

  const body: Record<string, unknown> = { [imageField]: pi.imageUrl }

  if (pi.texturedMesh != null) body.textured_mesh = pi.texturedMesh
  if (pi.octreeResolution != null) body.octree_resolution = pi.octreeResolution
  if (pi.enablePbr != null) body.enable_pbr = pi.enablePbr
  if (pi.faceCount != null) body.face_count = pi.faceCount
  if (pi.generateType) body.generate_type = pi.generateType
  if (pi.polygonType) body.polygon_type = pi.polygonType
  if (pi.trellisResolution != null) body.resolution = pi.trellisResolution
  if (pi.trellisTextureSize != null) body.texture_size = pi.trellisTextureSize
  if (pi.trellisDecimationTarget != null)
    body.decimation_target = pi.trellisDecimationTarget
  if (pi.trellisRemesh != null) body.remesh = pi.trellisRemesh
  if (pi.trellisRemeshProject != null)
    body.remesh_project = pi.trellisRemeshProject
  if (pi.trellisStructureSamplingSteps != null)
    body.ss_sampling_steps = pi.trellisStructureSamplingSteps
  if (pi.trellisShapeSamplingSteps != null)
    body.shape_slat_sampling_steps = pi.trellisShapeSamplingSteps
  if (pi.trellisTextureSamplingSteps != null)
    body.tex_slat_sampling_steps = pi.trellisTextureSamplingSteps
  if (pi.removeBackground != null)
    body.do_remove_background = pi.removeBackground
  if (pi.seed != null && pi.seed >= 0) body.seed = pi.seed

  const endpoint = `${FAL_QUEUE_BASE_URL}/${pi.externalModelId}`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    throw new Error(
      `FAL 3D submit failed: HTTP ${res.status} — ${pi.externalModelId}`,
    )
  }

  const data = (await res.json()) as Record<string, unknown>
  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('FAL 3D submit returned an invalid response')
  }

  return { requestId, statusUrl, responseUrl }
}

function extractFalModel3DUrl(result: Record<string, unknown>): string | null {
  for (const field of ['model_glb', 'model_mesh']) {
    const obj = isRecord(result[field])
      ? (result[field] as Record<string, unknown>)
      : null
    const url = obj ? readStringField(obj, 'url') : null
    if (url) return url
  }
  const modelUrls = isRecord(result.model_urls)
    ? (result.model_urls as Record<string, unknown>)
    : null
  if (modelUrls) {
    const glb = isRecord(modelUrls.glb)
      ? (modelUrls.glb as Record<string, unknown>)
      : null
    if (glb) {
      const url = readStringField(glb, 'url')
      if (url) return url
    }
  }
  return null
}

async function pollHunyuanFalStatus(
  queue: FalQueueSubmitResult,
  apiKey: string,
): Promise<
  | { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' }
  | { status: 'COMPLETED'; modelUrl: string }
> {
  const statusRes = await fetch(queue.statusUrl, {
    headers: { Authorization: `Key ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!statusRes.ok) {
    throw new Error(`FAL 3D status poll failed: HTTP ${statusRes.status}`)
  }

  const statusData = (await statusRes.json()) as Record<string, unknown>
  const status = readStringField(statusData, 'status')

  if (status && isFalQueueFailureStatus(status)) {
    return { status: 'FAILED' }
  }
  if (status !== 'COMPLETED') {
    return { status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE' }
  }

  const resultRes = await fetch(queue.responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!resultRes.ok) {
    throw new Error(`FAL 3D result fetch failed: HTTP ${resultRes.status}`)
  }

  const resultData = (await resultRes.json()) as Record<string, unknown>
  const modelUrl = extractFalModel3DUrl(resultData)
  if (!modelUrl) {
    throw new Error('FAL 3D result response did not include a model URL')
  }

  return { status: 'COMPLETED', modelUrl }
}

// ─── MODEL_3D dispatch ────────────────────────────────────────────────────────

async function handleModel3DDispatch(
  request: Request,
  env: ExecutionEnv,
  workflowId: Model3DWorkflowId,
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

  const runContext = parseWorkerModel3DRunContext(parsed)
  if (!runContext) {
    return jsonResponse(
      { ok: false, error: 'Invalid MODEL_3D run context.' },
      { status: 400 },
    )
  }

  const workflow =
    workflowId === 'HYPER3D_RODIN'
      ? env.HYPER3D_RODIN_WORKFLOW
      : env.HUNYUAN3D_WORKFLOW

  const instance = await workflow.create({
    id: runContext.runId,
    params: runContext,
  })

  return jsonResponse({ workflowInstanceId: instance.id })
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
      duration: readPositiveNumberField(providerInput, 'duration') ?? undefined,
      referenceImage:
        readStringField(providerInput, 'referenceImage') ?? undefined,
      referenceImages:
        readStringArrayField(providerInput, 'referenceImages') ?? undefined,
      negativePrompt:
        readStringField(providerInput, 'negativePrompt') ?? undefined,
      resolution: readStringField(providerInput, 'resolution') ?? undefined,
      i2vModelId: readStringField(providerInput, 'i2vModelId') ?? undefined,
      videoDefaults: isRecord(providerInput.videoDefaults)
        ? providerInput.videoDefaults
        : undefined,
      voiceId: readStringField(providerInput, 'voiceId') ?? undefined,
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
  context: {
    runId: string
    apiKeyId?: string
    useSystemKey?: boolean
    resolveKeyUrl: string
    providerId: string
  },
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
      const queue = await step.do(
        'resolve-key-and-submit-provider',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: Math.min(context.timeoutMs, 1_800_000),
        },
        async () => {
          const apiKey = await resolveApiKey(this.env, context)
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
            const apiKey = await resolveApiKey(this.env, context)
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
              duration:
                context.outputType === 'VIDEO'
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
      const rodinJob = await step.do(
        'resolve-key-and-submit-rodin',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '2 minutes',
        },
        async () => {
          const apiKey = await resolveApiKey(this.env, context)
          return submitHyper3DRodin(context, apiKey)
        },
      )

      for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
        await step.sleep(`wait-rodin-${attempt}`, context.pollIntervalMs)

        const status = await step.do(
          `poll-rodin-${attempt}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await resolveApiKey(this.env, context)
            return pollHyper3DRodinStatus(rodinJob.statusUrl, apiKey)
          },
        )

        if (status === 'FAILED') {
          throw new Error('Hyper3D Rodin reported failed status.')
        }

        if (status === 'COMPLETED') {
          const storageKey = generateModel3DStorageKey(context.userId)
          const r2PublicUrl = `${this.env.R2_PUBLIC_URL ?? ''}/${storageKey}`

          await step.do(
            'download-and-upload-glb',
            {
              retries: {
                limit: 2,
                delay: '10 seconds',
                backoff: 'exponential',
              },
              timeout: '5 minutes',
            },
            async () => {
              if (!this.env.GENERATION_BUCKET) {
                throw new Error('GENERATION_BUCKET binding is not configured.')
              }
              const apiKey = await resolveApiKey(this.env, context)
              const glbData = await downloadGlbBytes(
                rodinJob.downloadUrl,
                apiKey,
              )
              await uploadGlbToR2(
                this.env.GENERATION_BUCKET,
                storageKey,
                glbData,
              )
            },
          )

          await step.do('callback-result', async () =>
            emitModel3DCallback(this.env, context, {
              artifactUrl: r2PublicUrl,
              glbR2Key: storageKey,
              requestCount: 1,
              providerMetadata: { jobUuid: rodinJob.jobUuid },
            }),
          )

          return { status: 'COMPLETED', runId: context.runId }
        }
      }

      throw new Error('Hyper3D Rodin polling timed out.')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Rodin workflow execution failed.'

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
      const queue = await step.do(
        'resolve-key-and-submit-fal-3d',
        {
          retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
          timeout: '2 minutes',
        },
        async () => {
          const apiKey = await resolveApiKey(this.env, context)
          return submitHunyuanFal(context, apiKey)
        },
      )

      for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
        await step.sleep(`wait-fal-3d-${attempt}`, context.pollIntervalMs)

        const pollResult = await step.do(
          `poll-fal-3d-${attempt}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          async () => {
            const apiKey = await resolveApiKey(this.env, context)
            return pollHunyuanFalStatus(queue, apiKey)
          },
        )

        if (pollResult.status === 'FAILED') {
          throw new Error('FAL 3D reported failed status.')
        }

        if (pollResult.status === 'COMPLETED') {
          const storageKey = generateModel3DStorageKey(context.userId)
          const r2PublicUrl = `${this.env.R2_PUBLIC_URL ?? ''}/${storageKey}`

          await step.do(
            'download-and-upload-glb',
            {
              retries: {
                limit: 2,
                delay: '10 seconds',
                backoff: 'exponential',
              },
              timeout: '5 minutes',
            },
            async () => {
              if (!this.env.GENERATION_BUCKET) {
                throw new Error('GENERATION_BUCKET binding is not configured.')
              }
              // FAL GLB download does not require auth header
              const glbData = await downloadGlbBytes(pollResult.modelUrl, '')
              await uploadGlbToR2(
                this.env.GENERATION_BUCKET,
                storageKey,
                glbData,
              )
            },
          )

          await step.do('callback-result', async () =>
            emitModel3DCallback(this.env, context, {
              artifactUrl: r2PublicUrl,
              glbR2Key: storageKey,
              requestCount: 1,
              providerMetadata: { requestId: queue.requestId },
            }),
          )

          return { status: 'COMPLETED', runId: context.runId }
        }
      }

      throw new Error('FAL 3D polling timed out.')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Hunyuan3D workflow execution failed.'

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
      return handleModel3DDispatch(request, env, 'HYPER3D_RODIN')
    }

    if (request.method === 'POST' && url.pathname === HUNYUAN3D_PATH) {
      return handleModel3DDispatch(request, env, 'HUNYUAN3D')
    }

    return jsonResponse({ ok: false, error: 'Not found.' }, { status: 404 })
  },
}

export default executionWorker
