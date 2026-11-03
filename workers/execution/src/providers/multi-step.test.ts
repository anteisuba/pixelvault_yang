import type { WorkflowStep } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { getMultiStepImageDriver } from './image-drivers'
import { runMultiStepDriver } from './multi-step'
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
    const cancel = vi.fn(async () => {})
    await expect(
      runMultiStepDriver(
        step,
        runtime(2),
        driver([{ status: 'queued' }, { status: 'queued' }], {
          cancelOnTimeout: cancel,
        }),
        async () => {},
      ),
    ).rejects.toThrow('timed out')
    expect(calls.at(-1)).toBe('do:cancel-demo-image-timeout')
    expect(cancel).toHaveBeenCalledWith({}, 'job-1')
  })

  it('契约里四家先提交再轮询的都有驱动', () => {
    for (const id of ['fal', 'ideogram', 'replicate', 'runner']) {
      expect(getMultiStepImageDriver(id), id).not.toBeNull()
    }
    expect(getMultiStepImageDriver('novelai')).toBeNull()
  })
})
