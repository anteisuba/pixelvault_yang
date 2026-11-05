import type { WorkflowStep } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import {
  createGenerationWaitLimitError,
  WorkerProviderError,
} from '../lib/provider-error'
import { getMultiStepImageDriver } from './image-drivers'
import { runMultiStepDriver } from './multi-step'
import { runnerImageDriver } from './runner/image'
import {
  imageStepNames,
  type ImageDriverRuntime,
  type MultiStepImageDriver,
} from './types'

type Poll = { status: 'queued' | 'running' | 'done'; retryAfterMs?: number }

function fakeStep() {
  const calls: string[] = []
  const step = {
    do: vi.fn(async (name: string, ...rest: unknown[]) => {
      calls.push(`do:${name}`)
      const callback = rest[rest.length - 1] as () => unknown
      return callback()
    }),
    sleep: vi.fn(async (name: string, duration: string | number) => {
      calls.push(`sleep:${name}:${duration}`)
    }),
  }
  return { step: step as unknown as WorkflowStep, calls }
}

function runtime(maxAttempts = 3): ImageDriverRuntime {
  return {
    env: {} as ImageDriverRuntime['env'],
    context: {
      runId: 'run-1',
      providerId: 'demo',
      maxAttempts,
      pollIntervalMs: 1000,
    } as ImageDriverRuntime['context'],
    readApiKey: vi.fn(async () => 'key'),
  }
}

function driver(
  polls: Poll[],
  over: Partial<MultiStepImageDriver<string, Poll, Poll>> = {},
): MultiStepImageDriver<string, Poll, Poll> {
  let index = 0
  return {
    stepNames: imageStepNames('demo'),
    submitStep: {},
    pollStep: {},
    submit: async () => 'job-1',
    poll: async () => polls[index++],
    readPoll: (poll) =>
      poll.status === 'done'
        ? { state: 'done', value: poll }
        : {
            state: 'pending',
            nextDelayMs: poll.retryAfterMs,
            running: poll.status === 'running',
          },
    timeoutError: () => new Error('timed out'),
    upload: {
      step: {},
      run: async () => ({
        artifactUrl: 'https://cdn/x.png',
        imageR2Key: 'x.png',
        mimeType: 'image/png',
      }),
    },
    toResult: (_job, _done, uploaded) => ({
      ...uploaded!,
      width: 1,
      height: 1,
    }),
    ...over,
  }
}

describe('runMultiStepDriver（先提交再轮询的通用流程）', () => {
  it('步骤名和搬之前一字不差：submit → wait/poll 每轮 → upload', async () => {
    const { step, calls } = fakeStep()
    const result = await runMultiStepDriver(
      step,
      runtime(),
      driver([{ status: 'queued', retryAfterMs: 2500 }, { status: 'done' }]),
      async () => {},
    )
    expect(calls).toEqual([
      'do:submit-demo-image',
      'sleep:wait-demo-image-1:1000',
      'do:poll-demo-image-1',
      // 服务商给了 Retry-After 就按它等（Ideogram）。
      'sleep:wait-demo-image-2:2500',
      'do:poll-demo-image-2',
      'do:upload-demo-image',
    ])
    expect(result.artifactUrl).toBe('https://cdn/x.png')
  })

  it('提交就出完的跳过轮询（Replicate）', async () => {
    const { step, calls } = fakeStep()
    await runMultiStepDriver(
      step,
      runtime(),
      driver([], { doneOnSubmit: () => ({ status: 'done' }) }),
      async () => {},
    )
    expect(calls).toEqual(['do:submit-demo-image', 'do:upload-demo-image'])
  })

  it('第一次离开排队只回报一次阶段（Runner）', async () => {
    const { step, calls } = fakeStep()
    const report = vi.fn(async () => {})
    await runMultiStepDriver(
      step,
      runtime(4),
      driver(
        [
          { status: 'queued' },
          { status: 'running' },
          { status: 'running' },
          { status: 'done' },
        ],
        { runningStage: 'runner_running' as never },
      ),
      report,
    )
    expect(calls.filter((c) => c.startsWith('do:mark-'))).toEqual([
      'do:mark-demo-image-running',
    ])
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('轮询次数用完：先取消服务商任务再判超时', async () => {
    const { step, calls } = fakeStep()
    const cancel = vi.fn(async () => ({
      attempted: true,
      ok: true,
      detail: 'cancelled',
    }))
    const run = runtime(2)
    await expect(
      runMultiStepDriver(
        step,
        run,
        driver([{ status: 'queued' }, { status: 'queued' }], {
          cancelOnTimeout: cancel,
        }),
        async () => {},
      ),
    ).rejects.toThrow('timed out')
    expect(calls.at(-1)).toBe('do:cancel-demo-image-timeout')
    // 拿到整个 runtime：fal / Replicate 撤任务要用户的 key。
    expect(cancel).toHaveBeenCalledWith(run, 'job-1')
  })

  it('取消步骤只试一次（⛔ 引擎重放）；撤没撤成记进超时错误的详情', async () => {
    const { step } = fakeStep()
    const outcome = {
      attempted: true,
      ok: false,
      detail: 'fal.ai responded 400.',
    }
    const error = await runMultiStepDriver(
      step,
      runtime(1),
      driver([{ status: 'running' }], {
        cancelOnTimeout: async () => outcome,
        timeoutError: (job) =>
          createGenerationWaitLimitError({
            provider: 'fal',
            phase: 'image_poll',
            requestId: job,
          }),
      }),
      async () => {},
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WorkerProviderError)
    expect((error as WorkerProviderError).errorCode).toBe(
      'generation_wait_limit',
    )
    expect((error as WorkerProviderError).providerMetadata).toMatchObject({
      requestId: 'job-1',
      providerCancel: outcome,
    })
    const cancelCall = vi
      .mocked(step.do)
      .mock.calls.find(([name]) => name === 'cancel-demo-image-timeout')!
    expect(cancelCall[1]).toMatchObject({ retries: { limit: 0 } })
  })

  it('取消函数自己抛错：⛔ 不盖掉原来的超时错误', async () => {
    await expect(
      runMultiStepDriver(
        fakeStep().step,
        runtime(1),
        driver([{ status: 'queued' }], {
          cancelOnTimeout: async () => {
            throw new Error('decrypt failed')
          },
        }),
        async () => {},
      ),
    ).rejects.toThrow('timed out')
  })

  describe('提交只发一次（步骤超时 / 引擎重试不再重复提交）', () => {
    function submitError(httpStatus: number) {
      return new WorkerProviderError({
        message: `submit ${httpStatus}`,
        provider: 'demo',
        phase: 'queue_submit',
        httpStatus,
      })
    }

    it('驱动写的重试次数不交给引擎：提交步骤的引擎重试恒为 0', async () => {
      const { step } = fakeStep()
      await runMultiStepDriver(
        step,
        runtime(),
        driver([{ status: 'done' }], {
          submitStep: {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
        }),
        async () => {},
      )
      const submitCall = vi
        .mocked(step.do)
        .mock.calls.find(([name]) => name === 'submit-demo-image')!
      expect(submitCall[1]).toMatchObject({
        retries: { limit: 0 },
        timeout: '120 seconds',
      })
    })

    it('服务商回 503（明确没收下）：在步骤里重发', async () => {
      vi.useFakeTimers()
      try {
        const submit = vi
          .fn<() => Promise<string>>()
          .mockRejectedValueOnce(submitError(503))
          .mockResolvedValue('job-1')
        const running = runMultiStepDriver(
          fakeStep().step,
          runtime(),
          driver([{ status: 'done' }], {
            submitStep: { retries: { limit: 2, delay: '5 seconds' } },
            submit,
          }),
          async () => {},
        )
        await vi.runAllTimersAsync()
        await expect(running).resolves.toMatchObject({
          artifactUrl: 'https://cdn/x.png',
        })
        expect(submit).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('服务商回 502 / 断线（说不准收没收下）：⛔ 不重发，直接失败', async () => {
      for (const error of [
        submitError(502),
        new TypeError('Network connection lost.'),
      ]) {
        const submit = vi.fn<() => Promise<string>>().mockRejectedValue(error)
        await expect(
          runMultiStepDriver(
            fakeStep().step,
            runtime(),
            driver([], {
              submitStep: { retries: { limit: 2, delay: '5 seconds' } },
              submit,
            }),
            async () => {},
          ),
        ).rejects.toBe(error)
        expect(submit).toHaveBeenCalledTimes(1)
      }
    })
  })

  it('判超时时告诉驱动任务有没有开始跑过（Runner 分「没轮到」和「跑太久」）', async () => {
    for (const [polls, started] of [
      [[{ status: 'queued' }, { status: 'queued' }], false],
      [[{ status: 'queued' }, { status: 'running' }], true],
    ] as const) {
      const timeoutError = vi.fn(() => new Error('timed out'))
      await expect(
        runMultiStepDriver(
          fakeStep().step,
          runtime(2),
          // 不设 runningStage 也要记：「开没开始」与要不要回报阶段无关。
          driver([...polls], { timeoutError }),
          async () => {},
        ),
      ).rejects.toThrow('timed out')
      expect(timeoutError).toHaveBeenCalledWith('job-1', expect.anything(), {
        started,
      })
    }
  })

  it('Runner 超时按开没开始给不同的码', () => {
    const runner = runnerImageDriver
    const context = runtime().context
    const queued = runner.timeoutError({ id: 'r1' } as never, context, {
      started: false,
    })
    const ran = runner.timeoutError({ id: 'r1' } as never, context, {
      started: true,
    })
    expect(queued).toMatchObject({ errorCode: 'runner_start_timeout' })
    expect(ran).toMatchObject({ errorCode: 'runner_run_timeout' })
  })

  it('契约里四家先提交再轮询的都有驱动', () => {
    for (const id of ['fal', 'ideogram', 'replicate', 'runner']) {
      expect(getMultiStepImageDriver(id), id).not.toBeNull()
    }
    expect(getMultiStepImageDriver('novelai')).toBeNull()
  })
})
