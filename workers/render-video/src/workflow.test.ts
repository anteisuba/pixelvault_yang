import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RenderVideoWorkflow,
  type RenderEnv,
  type RenderRunContext,
} from './index'

const PLAN: RenderRunContext['plan'] = {
  version: 1,
  name: 'cut',
  projectId: 'project-1',
  output: {
    aspect: '16:9',
    resolution: '720p',
    width: 1280,
    height: 720,
    fps: 30,
  },
  video: [
    {
      id: 'v1',
      src: 'https://cdn.example.com/a.mp4',
      in: 0,
      out: 5,
      speed: 1,
      muted: false,
      transitionOut: 'crossfade',
      durationSec: 5,
      sourceNodeId: 'n1',
    },
    {
      id: 'v2',
      src: 'https://cdn.example.com/b.mp4',
      in: 0,
      out: 5,
      speed: 1,
      muted: false,
      transitionOut: 'none',
      durationSec: 5,
      sourceNodeId: 'n2',
    },
  ],
  audio: [],
  music: [
    {
      id: 'm1',
      src: 'https://cdn.example.com/m.mp3',
      in: 0,
      out: 10,
      speed: 1,
      gain: 1,
      startSec: 0,
      durationSec: 10,
      sourceNodeId: 'n3',
    },
  ],
  totalDurationSec: 10,
}

function setup() {
  /** 每一次容器调用发生在哪个 step 里。 */
  const containerCalls: { path: string; step: string | null }[] = []
  const steps: string[] = []
  let currentStep: string | null = null

  const env: RenderEnv = {
    RENDER_CONTAINER: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (input: Request | string) => {
          const url = new URL(typeof input === 'string' ? input : input.url)
          containerCalls.push({ path: url.pathname, step: currentStep })
          if (url.pathname === '/file') return new Response('bytes')
          return Response.json({ ok: true })
        },
      }),
    },
    RENDER_WORKFLOW: {} as RenderEnv['RENDER_WORKFLOW'],
    GENERATION_BUCKET: { put: vi.fn(async () => ({})) },
    INTERNAL_CALLBACK_URL: 'https://app.example.com/api/studio/render/callback',
    INTERNAL_CALLBACK_SECRET: 'secret',
    R2_PUBLIC_URL: 'https://cdn.example.com',
  }

  const step = {
    do: async (
      name: string,
      configOrCallback: unknown,
      maybeCallback?: () => Promise<unknown>,
    ) => {
      const callback = (maybeCallback ??
        configOrCallback) as () => Promise<unknown>
      steps.push(name)
      currentStep = name
      try {
        return await callback()
      } finally {
        currentStep = null
      }
    },
    sleep: async () => undefined,
  }

  // `env` 在运行时由引擎注入（类型上是 protected）。
  const workflow = Object.assign(new RenderVideoWorkflow(), { env })

  const run = () =>
    workflow.run(
      {
        payload: { runId: 'run-1', jobId: 'job-1', userId: 'u1', plan: PLAN },
        timestamp: new Date(),
        instanceId: 'job-1',
      },
      step as never,
    )

  return { run, steps, containerCalls, env }
}

describe('RenderVideoWorkflow', () => {
  const callbacks: Record<string, unknown>[] = []

  beforeEach(() => {
    callbacks.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        callbacks.push(JSON.parse(String(init.body)))
        return new Response('{}')
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs every file-producing container call inside one step', async () => {
    // 2026-09-28 线上实跑：下载在一台容器上、规格化换到另一台，盘上的素材没了。
    const { run, steps, containerCalls } = setup()

    await run()

    expect(steps).toEqual(['render'])
    const insideRender = containerCalls.filter((call) => call.step === 'render')
    expect(insideRender.map((call) => call.path)).toEqual([
      '/download',
      '/download',
      '/download',
      '/run',
      '/run',
      '/run',
      '/run',
      '/file',
      '/file',
    ])
    // 只有收尾删盘在 step 外（best-effort）。
    expect(
      containerCalls
        .filter((call) => call.step !== 'render')
        .map((c) => c.path),
    ).toEqual(['/cleanup'])
  })

  it('reports progress and then the result', async () => {
    const { run } = setup()

    await run()

    expect(callbacks.map((body) => body.step)).toEqual([
      'download',
      'normalize',
      'compose',
      'encode',
      'poster',
      'upload',
    ])
    expect(callbacks.at(-1)).toMatchObject({
      kind: 'result',
      url: 'https://cdn.example.com/renders/project-1/job-1.mp4',
      thumbnailUrl: 'https://cdn.example.com/renders/project-1/job-1.jpg',
    })
  })
})
