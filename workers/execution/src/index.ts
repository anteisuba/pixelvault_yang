import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { Workflow, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import { buildFalWorkerQueueRequest } from './models/fal/video-request-builders'

const HEALTH_PATH = '/health'
const ECHO_PATH = '/echo'
const CINEMATIC_SHORT_VIDEO_PATH = '/workflows/cinematic-short-video'
const EXECUTION_SIGNATURE_HEADER = 'X-Execution-Signature'
const EXECUTION_SIGNATURE_ALGORITHM = 'HMAC'
const EXECUTION_SIGNATURE_HASH = 'SHA-256'
const JSON_CONTENT_TYPE = 'application/json'
const CALLBACK_KINDS = ['ping', 'status', 'result'] as const

type CallbackKind = (typeof CALLBACK_KINDS)[number]

interface ExecutionEnv {
  INTERNAL_CALLBACK_URL?: string
  INTERNAL_CALLBACK_SECRET?: string
  CINEMATIC_SHORT_VIDEO_WORKFLOW: Workflow<WorkerRunContext>
}

interface ExecutionCallbackPayload {
  runId: string
  kind: CallbackKind
  ts: string
  data?: unknown
}

interface WorkerRunContext {
  runId: string
  workflowId: 'CINEMATIC_SHORT_VIDEO'
  providerId: string
  apiKeyId: string
  callbackUrl: string
  resolveKeyUrl: string
  timeoutMs: number
  maxAttempts: number
  pollIntervalMs: number
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
    duration?: number
    referenceImage?: string
    negativePrompt?: string
    resolution?: string
    i2vModelId?: string
    videoDefaults?: Record<string, unknown>
    providerBaseUrl?: string
    width: number
    height: number
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
  const providerId = readStringField(input, 'providerId')
  const apiKeyId = readStringField(input, 'apiKeyId')
  const callbackUrl = readStringField(input, 'callbackUrl')
  const resolveKeyUrl = readStringField(input, 'resolveKeyUrl')
  const timeoutMs = readPositiveNumberField(input, 'timeoutMs')
  const maxAttempts = readPositiveNumberField(input, 'maxAttempts')
  const pollIntervalMs = readPositiveNumberField(input, 'pollIntervalMs')
  const prompt = readStringField(providerInput, 'prompt')
  const modelId = readStringField(providerInput, 'modelId')
  const externalModelId = readStringField(providerInput, 'externalModelId')
  const aspectRatio = readStringField(providerInput, 'aspectRatio')
  const width = readPositiveNumberField(providerInput, 'width')
  const height = readPositiveNumberField(providerInput, 'height')

  if (
    !runId ||
    workflowId !== 'CINEMATIC_SHORT_VIDEO' ||
    !providerId ||
    !apiKeyId ||
    !callbackUrl ||
    !resolveKeyUrl ||
    !timeoutMs ||
    !maxAttempts ||
    !pollIntervalMs ||
    !prompt ||
    !modelId ||
    !externalModelId ||
    !aspectRatio ||
    !width ||
    !height
  ) {
    return null
  }

  return {
    runId,
    workflowId,
    providerId,
    apiKeyId,
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
        aspectRatio as WorkerRunContext['providerInput']['aspectRatio'],
      duration: readPositiveNumberField(providerInput, 'duration') ?? undefined,
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
      width,
      height,
    },
  }
}

async function handleCinematicShortVideoDispatch(
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
    console.warn('fal.ai worker video request body uses unverified schema', {
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

async function pollFalQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
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

  if (status === 'FAILED') {
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
  const video = isRecord(resultData.video) ? resultData.video : null
  const artifactUrl = video ? readStringField(video, 'url') : null

  if (!artifactUrl) {
    throw new Error('fal.ai result response did not include a video URL.')
  }

  return {
    status: 'COMPLETED',
    artifactUrl,
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
            return pollFalQueue(queue, apiKey)
          },
        )

        if (pollResult.status === 'FAILED') {
          throw new Error('Provider reported failed status.')
        }

        if (pollResult.status === 'COMPLETED' && pollResult.artifactUrl) {
          await step.do('callback-result', async () =>
            emitCallback(this.env, context, {
              artifactUrl: pollResult.artifactUrl,
              providerMetadata: pollResult.providerMetadata,
              width: context.providerInput.width,
              height: context.providerInput.height,
              duration: context.providerInput.duration,
              requestCount: 1,
              mimeType: 'video/mp4',
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
      url.pathname === CINEMATIC_SHORT_VIDEO_PATH
    ) {
      return handleCinematicShortVideoDispatch(request, env)
    }

    return jsonResponse({ ok: false, error: 'Not found.' }, { status: 404 })
  },
}

export default executionWorker
