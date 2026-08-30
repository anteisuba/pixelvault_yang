import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerateRequest } from '@/types'

// ─── Mocks ─────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))
vi.mock('@/services/execution-worker.service', () => ({
  ExecutionWorkerDispatchError: class ExecutionWorkerDispatchError extends Error {
    readonly outcome: 'rejected' | 'unknown'
    constructor(message: string, outcome: 'rejected' | 'unknown') {
      super(message)
      this.name = 'ExecutionWorkerDispatchError'
      this.outcome = outcome
    }
  },
  isExecutionWorkerDispatchConfigured: vi.fn(),
  dispatchImageWorkerRun: vi.fn(),
  buildInternalUrl: (path: string) => `https://app.example.com${path}`,
}))
// Provide a real-enough error class without importing the full module (and its
// heavy dependency graph). Only the shared helpers are stubbed.
vi.mock('@/services/image/generate-image.service', () => {
  class GenerateImageServiceError extends Error {
    readonly code: string
    readonly status: number
    constructor(code: string, message: string, status: number) {
      super(message)
      this.code = code
      this.status = status
      this.name = 'GenerateImageServiceError'
    }
  }
  return {
    GenerateImageServiceError,
    resolveImageRouteAndValidate: vi.fn(),
    uploadReferenceImagesIfNeeded: vi.fn(),
  }
})
vi.mock('@/services/generation.service', () => ({
  getGenerationByIdForUser: vi.fn(),
}))
vi.mock('@/services/usage.service', () => ({
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/civitai-token.service', () => ({
  getCivitaiTokenByInternalUserId: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn(() => 'generations/user-1/image/output.png'),
}))
vi.mock('@/services/runner/civitai-lora-to-r2.service', () => ({
  prepareRunnerLoras: vi.fn(),
}))
vi.mock('@/services/civitai-lora.service', () => ({
  findCivitaiLorasWithDownloadDisabled: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { db } from '@/lib/db'
import {
  dispatchImageWorkerRun,
  ExecutionWorkerDispatchError,
  isExecutionWorkerDispatchConfigured,
} from '@/services/execution-worker.service'
import {
  GenerateImageServiceError,
  resolveImageRouteAndValidate,
  uploadReferenceImagesIfNeeded,
} from '@/services/image/generate-image.service'
import { getGenerationByIdForUser } from '@/services/generation.service'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import { getCivitaiTokenByInternalUserId } from '@/services/civitai-token.service'
import { prepareRunnerLoras } from '@/services/runner/civitai-lora-to-r2.service'
import { findCivitaiLorasWithDownloadDisabled } from '@/services/civitai-lora.service'
import {
  checkImageGenerationStatus,
  submitImageGeneration,
  waitForImageGenerationResult,
} from '@/services/image/submit-image.service'

// ─── Fixtures ──────────────────────────────────────────────────

const INPUT: GenerateRequest = {
  prompt: 'A red circle',
  modelId: 'gpt-image-2',
  aspectRatio: '1:1',
}

function routeFor(adapterType: AI_ADAPTER_TYPES) {
  return {
    modelId: 'gpt-image-2',
    adapterType,
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
    creditCost: 1,
    isFreeGeneration: true,
    resolvedApiKeyId: null,
  }
}

function setupResolve(adapterType: AI_ADAPTER_TYPES) {
  vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
    dbUser: { id: 'user-1' } as never,
    route: routeFor(adapterType) as never,
    provider: 'OpenAI',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(uploadReferenceImagesIfNeeded).mockResolvedValue([])
  vi.mocked(createGenerationJob).mockResolvedValue({ id: 'job-1' } as never)
  vi.mocked(dispatchImageWorkerRun).mockResolvedValue({
    workflowInstanceId: 'wf-1',
  })
  vi.mocked(db.generationJob.update).mockResolvedValue({} as never)
  vi.mocked(db.generationJob.updateMany).mockResolvedValue({
    count: 0,
  } as never)
  vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as never)
  vi.mocked(getCivitaiTokenByInternalUserId).mockResolvedValue(
    'user-civitai-token',
  )
  vi.mocked(findCivitaiLorasWithDownloadDisabled).mockResolvedValue([])
})

// ─── submitImageGeneration ─────────────────────────────────────

describe('submitImageGeneration', () => {
  it('dispatches to the worker when adapter is migrated and dispatch is configured', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', INPUT)

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    expect(dispatchImageWorkerRun).toHaveBeenCalledTimes(1)
    // job created RUNNING, then patched with the workflow instance id
    expect(createGenerationJob).toHaveBeenCalledTimes(1)
    expect(db.generationJob.update).toHaveBeenCalledTimes(1)
  })

  it('dispatches FAL text-to-image to the worker with a final R2 key', async () => {
    setupResolve(AI_ADAPTER_TYPES.FAL)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', {
      ...INPUT,
      modelId: 'flux-2-pro',
    })

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: AI_ADAPTER_TYPES.FAL,
        maxAttempts: 200,
        providerInput: expect.objectContaining({
          modelId: 'gpt-image-2',
          outputStorageKey: 'generations/user-1/image/output.png',
        }),
      }),
    )
  })

  it('dispatches a platform-managed RUNNER run with useSystemKey and no user apiKey (MISSING_API_KEY regression)', async () => {
    // RUNNER = 平台代付：resolvedApiKeyId null + isFreeGeneration false。修复前
    // 这被 gate 误抛 MISSING_API_KEY 400（线上「点出图无反应」根因）。
    vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
      dbUser: { id: 'user-1' } as never,
      route: {
        modelId: 'anima-pencil-xl-runner',
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        providerConfig: { label: 'PixelVault Runner' },
        creditCost: 1,
        isFreeGeneration: false,
        resolvedApiKeyId: null,
      } as never,
      provider: 'RUNNER',
    })
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', {
      ...INPUT,
      modelId: 'anima-pencil-xl-runner',
    })

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    // worker 用 useSystemKey 回调解析平台 RUNPOD_KEY；无用户 apiKeyId。
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: AI_ADAPTER_TYPES.RUNNER,
        useSystemKey: true,
        apiKeyId: undefined,
      }),
    )
  })

  it('for a RUNNER run with LoRAs, ensures them in R2 and threads runnerLoras into the worker input (v2)', async () => {
    vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
      dbUser: { id: 'user-1' } as never,
      route: {
        modelId: 'anima-pencil-xl-runner',
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        providerConfig: { label: 'PixelVault Runner' },
        creditCost: 1,
        isFreeGeneration: false,
        resolvedApiKeyId: null,
      } as never,
      provider: 'RUNNER',
    })
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(prepareRunnerLoras).mockResolvedValue([
      {
        filename: 'civitai-111.safetensors',
        downloadUrl: 'https://r2/x?sig',
        scale: 0.9,
      },
    ])

    await submitImageGeneration('clerk-1', {
      ...INPUT,
      modelId: 'anima-pencil-xl-runner',
      advancedParams: {
        loras: [
          { url: 'https://civitai.com/api/download/models/111', scale: 0.9 },
        ],
      },
    })

    expect(prepareRunnerLoras).toHaveBeenCalledWith(
      [{ url: 'https://civitai.com/api/download/models/111', scale: 0.9 }],
      'user-civitai-token',
    )
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerInput: expect.objectContaining({
          advancedParams: expect.objectContaining({
            runnerLoras: [
              {
                filename: 'civitai-111.safetensors',
                downloadUrl: 'https://r2/x?sig',
                scale: 0.9,
              },
            ],
          }),
        }),
      }),
    )
  })

  it('fails the GenerationJob when runner LoRA prep throws (no zombie RUNNING)', async () => {
    vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
      dbUser: { id: 'user-1' } as never,
      route: {
        modelId: 'anima-pencil-xl-runner',
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        providerConfig: { label: 'PixelVault Runner' },
        creditCost: 1,
        isFreeGeneration: false,
        resolvedApiKeyId: null,
      } as never,
      provider: 'RUNNER',
    })
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(prepareRunnerLoras).mockRejectedValue(
      new Error(
        'Runner LoRA is 3988 MB, over the 512 MB limit. Base checkpoints belong in the checkpoint path, not as LoRA attachments.',
      ),
    )

    await expect(
      submitImageGeneration('clerk-1', {
        ...INPUT,
        modelId: 'anima-pencil-xl-runner',
        advancedParams: {
          loras: [
            {
              url: 'https://huggingface.co/LyliaEngine/anima_baseV10/resolve/main/anima_baseV10.safetensors',
              scale: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: expect.stringContaining('512 MB'),
    })

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        errorMessage: expect.stringContaining('512 MB'),
      }),
    )
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
  })

  it('classifies Runner Civitai authentication failures as INVALID_API_KEY', async () => {
    vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
      dbUser: { id: 'user-1' } as never,
      route: {
        modelId: 'illustrious-recipe-clone',
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        providerConfig: { label: 'PixelVault Runner' },
        creditCost: 1,
        isFreeGeneration: false,
        resolvedApiKeyId: null,
      } as never,
      provider: 'RUNNER',
    })
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(prepareRunnerLoras).mockRejectedValue(
      Object.assign(new Error('Civitai API token is invalid or expired.'), {
        code: 'AUTH_REQUIRED',
      }),
    )

    await expect(
      submitImageGeneration('clerk-1', {
        ...INPUT,
        modelId: 'illustrious-recipe-clone',
        advancedParams: {
          loras: [
            {
              url: 'https://civitai.com/api/download/models/2266398',
              scale: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_API_KEY',
      status: 401,
    })

    expect(failGenerationJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        errorMessage: 'Civitai API token is invalid or expired.',
      }),
    )
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
  })

  // 2026-08-29 owner 真机：作者在 Civitai 关掉下载的 LoRA，Runner 线和云端 API
  // 线都会在几十秒后拿到 401，而 401 一路被翻译成「你的 API Key 无效或已过期」。
  // 闸写在两条线**之前**，所以这里故意用托管路由（FAL）验——它根本不经过
  // prepareRunnerLoras，上一条 AUTH_REQUIRED 的分支盖不到它。
  it('blocks a download-disabled Civitai LoRA before any job row exists — hosted route too', async () => {
    setupResolve(AI_ADAPTER_TYPES.FAL)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(findCivitaiLorasWithDownloadDisabled).mockResolvedValue([
      {
        modelVersionId: 2266398,
        downloadDisabled: true,
        usageControl: 'Generation',
        name: 'Ananta',
      },
    ])

    await expect(
      submitImageGeneration('clerk-1', {
        ...INPUT,
        advancedParams: {
          loras: [
            {
              url: 'https://civitai.com/api/download/models/2266398',
              scale: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'LORA_DOWNLOAD_DISABLED',
      status: 422,
    })

    // 点名是哪一把，否则挂了好几把时用户不知道该拆哪个。
    await expect(
      submitImageGeneration('clerk-1', {
        ...INPUT,
        advancedParams: {
          loras: [
            {
              url: 'https://civitai.com/api/download/models/2266398',
              scale: 1,
            },
          ],
        },
      }),
    ).rejects.toThrow(/Ananta/)

    // 建 job 行 / 传参考图 / 派发都不该发生 —— 这次生成从头就不该开始。
    expect(createGenerationJob).not.toHaveBeenCalled()
    expect(uploadReferenceImagesIfNeeded).not.toHaveBeenCalled()
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
  })

  it('lets the run through when Civitai cannot be reached (judgement unknown ≠ blocked)', async () => {
    setupResolve(AI_ADAPTER_TYPES.FAL)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    // fetchCivitaiLoraDownloadPolicy 判不了时不进清单，所以这里就是空数组 ——
    // 上游抽风绝不能变成「所有带 LoRA 的生成都失败」。
    vi.mocked(findCivitaiLorasWithDownloadDisabled).mockResolvedValue([])

    await expect(
      submitImageGeneration('clerk-1', {
        ...INPUT,
        advancedParams: {
          loras: [
            {
              url: 'https://civitai.com/api/download/models/2266398',
              scale: 1,
            },
          ],
        },
      }),
    ).resolves.toEqual({ jobId: 'job-1', requestId: 'wf-1' })
  })

  it('still throws MISSING_API_KEY for a non-free, non-runner route with no user key', async () => {
    vi.mocked(resolveImageRouteAndValidate).mockResolvedValue({
      dbUser: { id: 'user-1' } as never,
      route: {
        modelId: 'flux-2-pro',
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: { label: 'FAL' },
        creditCost: 1,
        isFreeGeneration: false,
        resolvedApiKeyId: null,
      } as never,
      provider: 'FAL',
    })
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    await expect(
      submitImageGeneration('clerk-1', { ...INPUT, modelId: 'flux-2-pro' }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY', status: 400 })
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
  })

  it('fails when dispatch is not configured', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(false)

    await expect(submitImageGeneration('clerk-1', INPUT)).rejects.toMatchObject(
      {
        code: 'PROVIDER_ERROR',
        status: 503,
      },
    )
    expect(dispatchImageWorkerRun).not.toHaveBeenCalled()
    expect(createGenerationJob).not.toHaveBeenCalled()
  })

  it('dispatches migrated non-OpenAI image adapters to the worker', async () => {
    setupResolve(AI_ADAPTER_TYPES.GEMINI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    const result = await submitImageGeneration('clerk-1', INPUT)

    expect(result).toEqual({ jobId: 'job-1', requestId: 'wf-1' })
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: AI_ADAPTER_TYPES.GEMINI,
        maxAttempts: 1,
        providerInput: expect.objectContaining({
          outputStorageKey: 'generations/user-1/image/output.png',
        }),
      }),
    )
  })

  it('fails the job and rethrows when dispatch errors', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(dispatchImageWorkerRun).mockRejectedValue(
      new Error('worker unreachable'),
    )

    await expect(submitImageGeneration('clerk-1', INPUT)).rejects.toThrow(
      'worker unreachable',
    )
    expect(failGenerationJob).toHaveBeenCalledWith('job-1', {
      errorMessage: 'worker unreachable',
    })
  })

  it('keeps the job active when dispatch may already have been accepted', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(dispatchImageWorkerRun).mockRejectedValue(
      new ExecutionWorkerDispatchError(
        'worker acknowledgement was lost',
        'unknown',
      ),
    )

    await expect(submitImageGeneration('clerk-1', INPUT)).rejects.toThrow(
      'worker acknowledgement was lost',
    )
    expect(failGenerationJob).not.toHaveBeenCalled()
  })

  it('does not fail an accepted job when workflow metadata persistence fails', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(db.generationJob.update).mockRejectedValue(
      new Error('database write failed'),
    )

    await expect(submitImageGeneration('clerk-1', INPUT)).resolves.toEqual({
      jobId: 'job-1',
      requestId: 'wf-1',
    })
    expect(failGenerationJob).not.toHaveBeenCalled()
  })

  it('dispatches reference-image requests with stable uploaded references', async () => {
    setupResolve(AI_ADAPTER_TYPES.OPENAI)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)
    vi.mocked(uploadReferenceImagesIfNeeded).mockResolvedValue([
      'https://cdn.example.com/stable-ref.png',
    ])

    await submitImageGeneration('clerk-1', {
      ...INPUT,
      referenceImages: ['data:image/png;base64,cmVm'],
    })

    expect(uploadReferenceImagesIfNeeded).toHaveBeenCalledTimes(1)
    expect(createGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRequestId: expect.stringContaining(
          'https://cdn.example.com/stable-ref.png',
        ),
      }),
    )
    expect(dispatchImageWorkerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerInput: expect.objectContaining({
          referenceImage: 'https://cdn.example.com/stable-ref.png',
          referenceImages: ['https://cdn.example.com/stable-ref.png'],
        }),
      }),
    )
  })

  it('persists multi-view batch metadata for status aggregation', async () => {
    setupResolve(AI_ADAPTER_TYPES.FAL)
    vi.mocked(isExecutionWorkerDispatchConfigured).mockReturnValue(true)

    await submitImageGeneration(
      'clerk-1',
      INPUT,
      {},
      {
        multiViewBatchId: 'batch-1',
        multiViewAngle: 'back',
        sourceGenerationId: 'source-gen-1',
      },
    )

    const createInput = vi.mocked(createGenerationJob).mock.calls[0][0]
    expect(JSON.parse(createInput.externalRequestId ?? '{}')).toMatchObject({
      outputType: 'IMAGE',
      multiViewBatchId: 'batch-1',
      multiViewAngle: 'back',
      sourceGenerationId: 'source-gen-1',
    })
  })
})

// ─── checkImageGenerationStatus ────────────────────────────────

describe('checkImageGenerationStatus', () => {
  it('returns COMPLETED with the generation', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'COMPLETED',
      generationId: 'gen-1',
    } as never)
    vi.mocked(getGenerationByIdForUser).mockResolvedValue({
      id: 'gen-1',
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'COMPLETED',
      generation: { id: 'gen-1' },
    })
  })

  it('returns FAILED for a failed job', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      generationId: null,
      errorMessage:
        'Replicate image generation failed: Checkpoint not supported',
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'FAILED',
      error: 'Replicate image generation failed: Checkpoint not supported',
      hasReferenceImage: false,
    })
  })

  it('preserves the failed job error when server-side wait resolves failure', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      generationId: null,
      errorMessage: 'Provider rejected the reference image',
    } as never)

    await expect(
      waitForImageGenerationResult('clerk-1', 'job-1'),
    ).rejects.toMatchObject({
      message: 'Provider rejected the reference image',
    })
  })

  it('returns IN_PROGRESS for a running job', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'RUNNING',
      generationId: null,
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toEqual({ jobId: 'job-1', status: 'IN_PROGRESS' })
  })

  it('lazily returns FAILED for a stale running job', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'RUNNING',
      generationId: null,
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    } as never)
    vi.mocked(db.generationJob.updateMany).mockResolvedValue({
      count: 1,
    } as never)

    const result = await checkImageGenerationStatus('clerk-1', 'job-1')

    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'FAILED',
      errorCode: 'callback_timeout',
    })
  })

  it('throws JOB_NOT_FOUND when the job belongs to another user', async () => {
    vi.mocked(db.generationJob.findUnique).mockResolvedValue({
      id: 'job-1',
      userId: 'someone-else',
      status: 'COMPLETED',
      generationId: 'gen-1',
    } as never)

    await expect(
      checkImageGenerationStatus('clerk-1', 'job-1'),
    ).rejects.toThrow(GenerateImageServiceError)
  })
})
