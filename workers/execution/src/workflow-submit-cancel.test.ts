/**
 * 生成可靠性三件事里 worker 侧的两件（2026-11-05）：
 * 1. 等满我们自己的预算（generation_wait_limit）时，能撤的把服务商任务撤掉；撤不了的把任务 id
 *    留给 app（GenerationJob.providerJobId），失败详情里写明撤没撤成。
 * 2. 提交类步骤不交给引擎重试：步骤超时 / 断线后重放 = 服务商多一单、多扣一次钱。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  Hunyuan3DWorkflow,
  Hyper3DRodinWorkflow,
  ImageQueueWorkflow,
  parseModel3DRunContext,
  parseWorkerRunContext,
} from './index'
import { buildQueueMediaDriver } from './providers/queue-drivers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const ENV = {
  INTERNAL_CALLBACK_SECRET: 'secret-1',
  STATE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  R2_PUBLIC_URL: 'https://cdn.example.com',
  GENERATION_BUCKET: { put: vi.fn().mockResolvedValue(undefined) },
}

/** 和 index.test.ts 一样：子类里直接塞 env，绕过 WorkflowEntrypoint 的构造参数。 */
function withEnv<T extends { setEnv(env: unknown): void }>(workflow: T): T {
  workflow.setEnv(ENV)
  return workflow
}
class TestHunyuan3D extends Hunyuan3DWorkflow {
  setEnv(env: unknown) {
    this.env = env as never
  }
}
class TestRodin extends Hyper3DRodinWorkflow {
  setEnv(env: unknown) {
    this.env = env as never
  }
}
class TestImageQueue extends ImageQueueWorkflow {
  setEnv(env: unknown) {
    this.env = env as never
  }
}

/** 按每步自己的 retries 配置给 ctx（第 1 次尝试），和引擎一样判「是不是最后一次」。 */
function makeStep() {
  return {
    do: vi.fn(async (_name: string, ...args: unknown[]) => {
      const config =
        args.length > 1 ? (args[0] as { retries?: { limit: number } }) : {}
      const callback = args[args.length - 1] as (ctx: unknown) => unknown
      return callback({
        attempt: 1,
        config: { retries: { limit: config.retries?.limit ?? 5 } },
      })
    }),
    sleep: vi.fn(async () => {}),
  }
}

type Step = ReturnType<typeof makeStep>

function stepConfig(step: Step, name: string) {
  const call = step.do.mock.calls.find(([stepName]) => stepName === name)
  if (!call) throw new Error(`step ${name} was not run`)
  return call[1] as { retries?: { limit: number } }
}

function callbackBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === 'https://cb.example.com')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

function model3DInput(overrides: Record<string, unknown>) {
  return {
    runId: 'run-3d',
    workflowId: 'HUNYUAN3D',
    outputType: 'MODEL_3D',
    providerId: 'fal',
    apiKeyId: 'key-3d',
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60000,
    maxAttempts: 2,
    pollIntervalMs: 2000,
    ...overrides,
    providerInput: {
      modelId: 'model-3d',
      externalModelId: 'ext-3d',
      imageUrl: 'https://images.example.com/ref.png',
      ...(overrides.providerInput as Record<string, unknown> | undefined),
    },
  }
}

describe('Hunyuan3D（fal 3D）等满预算', () => {
  it('先撤 fal 的任务，失败详情写明撤没撤成和任务 id；提交步骤引擎不重试', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === 'https://resolve.example.com')
          return Response.json({ success: true, data: { apiKey: 'fal-key' } })
        if (url === 'https://cb.example.com')
          return Response.json({ success: true })
        if (url === 'https://queue.fal.run/ext-3d')
          return Response.json({
            request_id: '3d-req-1',
            status_url: 'https://queue.fal.run/ext-3d/requests/3d-req-1/status',
            response_url: 'https://queue.fal.run/ext-3d/requests/3d-req-1',
          })
        if (url.endsWith('/requests/3d-req-1/status'))
          return Response.json({ status: 'IN_QUEUE' })
        if (url.endsWith('/requests/3d-req-1/cancel')) {
          expect(init?.method).toBe('PUT')
          return new Response(null, { status: 202 })
        }
        throw new Error(`Unexpected fetch: ${url}`)
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    const step = makeStep()
    const context = parseModel3DRunContext(model3DInput({}))!

    const result = await withEnv(new TestHunyuan3D()).run(
      { payload: context, instanceId: 'i-3d' } as never,
      step as never,
    )

    expect(result).toMatchObject({ status: 'FAILED' })
    expect(stepConfig(step, 'submit-fal').retries?.limit).toBe(0)
    expect(stepConfig(step, 'cancel-fal3d-timeout').retries?.limit).toBe(0)
    const failure = callbackBodies(fetchMock).at(-1)
    expect(failure.data.errorCode).toBe('generation_wait_limit')
    expect(failure.data.providerMetadata).toMatchObject({
      requestId: '3d-req-1',
      providerCancel: { attempted: true, ok: true },
    })
  })
})

describe('Hyper3D Rodin（没有取消接口）', () => {
  it('提交后立刻把 jobUuid 报给 app 留底；等满预算的失败里带着它', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://resolve.example.com')
        return Response.json({ success: true, data: { apiKey: 'rodin-key' } })
      if (url === 'https://cb.example.com')
        return Response.json({ success: true })
      if (url === 'https://images.example.com/ref.png')
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/png' },
        })
      if (url === 'https://api.hyper3d.com/api/v2/rodin')
        return Response.json({
          uuid: 'rodin-job-1',
          jobs: { uuids: ['sub-1'], subscription_key: 'sub-key' },
        })
      if (url === 'https://api.hyper3d.com/api/v2/status')
        return Response.json({ jobs: [{ uuid: 'sub-1', status: 'Waiting' }] })
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const step = makeStep()
    const context = parseModel3DRunContext(
      model3DInput({
        workflowId: 'HYPER3D_RODIN',
        providerId: 'hyper3d_rodin',
        maxAttempts: 1,
      }),
    )!

    const result = await withEnv(new TestRodin()).run(
      { payload: context, instanceId: 'i-rodin' } as never,
      step as never,
    )

    expect(result).toMatchObject({ status: 'FAILED' })
    expect(stepConfig(step, 'submit-rodin').retries?.limit).toBe(0)
    const bodies = callbackBodies(fetchMock)
    expect(bodies[0]).toMatchObject({
      kind: 'status',
      data: { providerJobId: 'rodin-job-1' },
    })
    const failure = bodies.at(-1)
    expect(failure.data.errorCode).toBe('generation_wait_limit')
    expect(failure.data.providerMetadata).toMatchObject({
      requestId: 'rodin-job-1',
      providerCancel: { attempted: false },
    })
  })
})

describe('单步出图（提交即计费）', () => {
  const context = {
    runId: 'run-single',
    workflowId: 'IMAGE_QUEUE',
    outputType: 'IMAGE',
    providerId: 'openai',
    apiKeyId: 'key-1',
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 300000,
    maxAttempts: 1,
    pollIntervalMs: 1000,
    providerInput: {
      modelId: 'gpt-image-2.5-flare',
      externalModelId: 'gpt-image-2.5-flare',
      prompt: 'a cat',
      aspectRatio: '1:1',
    },
  }

  it('服务商回 502（说不准收没收下）：只发一次就判失败，⛔ 引擎重放', async () => {
    let providerCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://resolve.example.com')
        return Response.json({ success: true, data: { apiKey: 'test-key' } })
      if (url === 'https://cb.example.com')
        return Response.json({ success: true })
      providerCalls += 1
      return Response.json(
        { error: { message: 'Bad gateway' } },
        { status: 502 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const step = makeStep()

    const result = await withEnv(new TestImageQueue()).run(
      { payload: context, instanceId: 'i-single' } as never,
      step as never,
    )

    expect(result).toMatchObject({ status: 'FAILED' })
    expect(providerCalls).toBe(1)
    expect(stepConfig(step, 'generate-openai-image').retries?.limit).toBe(0)
  })
})

describe('视频 / 音频队列驱动的取消', () => {
  function videoContext(providerId: string) {
    return parseWorkerRunContext({
      runId: 'run-video',
      workflowId: 'CINEMATIC_SHORT_VIDEO',
      outputType: 'VIDEO',
      providerId,
      apiKeyId: 'key-video',
      callbackUrl: 'https://cb.example.com',
      resolveKeyUrl: 'https://resolve.example.com',
      timeoutMs: 60000,
      maxAttempts: 2,
      pollIntervalMs: 2000,
      providerInput: {
        modelId: 'video-model',
        externalModelId: 'fal-ai/kling-video/v3/pro/text-to-video',
        prompt: 'a cat',
        aspectRatio: '16:9',
        width: 1280,
        height: 720,
      },
    })!
  }

  it('fal：撤任务走 status_url 推出来的 …/cancel', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    const driver = buildQueueMediaDriver(videoContext('fal'))
    const outcome = await driver.cancelOnTimeout!(
      {
        env: ENV as never,
        context: videoContext('fal'),
        readApiKey: async () => 'fal-key',
      },
      {
        requestId: 'v1',
        statusUrl:
          'https://queue.fal.run/fal-ai/kling-video/requests/v1/status',
        responseUrl: 'https://queue.fal.run/fal-ai/kling-video/requests/v1',
      },
    )
    expect(outcome.ok).toBe(true)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://queue.fal.run/fal-ai/kling-video/requests/v1/cancel',
    )
  })

  it.each(['minimax', 'gemini'])(
    '%s 没有取消接口：不挂取消步骤',
    (providerId) => {
      expect(
        buildQueueMediaDriver(videoContext(providerId)).cancelOnTimeout,
      ).toBeUndefined()
    },
  )
})
