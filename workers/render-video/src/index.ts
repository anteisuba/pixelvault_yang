/**
 * `render-video` worker（S9 · spec §6「渲染层」）。
 *
 * 换掉 fal `ffmpeg-api/compose`（只能尾裁，没有转场 / 变速 / 混音）。形状：
 *
 *   Next `/api/studio/render` ──签名──▶ 本 worker `/workflows/render-video`
 *        └─ Workflow 编排（六步，步缓存 = 断点续传）
 *              └─ Container（ffmpeg，`container/Dockerfile`，LGPL 构建）
 *                    └─ R2 `renders/<projectId>/<jobId>.mp4` + 封面
 *        └─ 回调 Next `/api/studio/render/callback`（签名口径复用 execution 那一套）
 *
 * ⚠ 进度按**步骤**报，不按百分比猜；编码那一步再叠 ffmpeg `-progress` 的段内比例。
 * ⛔ 不做匀速假进度条 —— 编码会停很久，一根匀速走的条让人以为卡死。
 */

import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers'
import type { Workflow, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import {
  buildEncodeCommand,
  buildNormalizeCommand,
  buildPosterCommand,
} from './lib/ffmpeg-commands'
import type { FgPlan } from './lib/filtergraph'
import { createSignedRequestHeaders, verifySignedBody } from './lib/signature'

const SUBMIT_PATH = '/workflows/render-video'
const CANCEL_PATH = '/cancel'
const STATUS_PATH = '/status'
const HEALTH_PATH = '/health'
const CONTAINER_PORT = 8080
/** 与 `src/constants/render-video.ts` 的 `RENDER_STEPS` 同源。 */
const RENDER_STEPS = [
  'download',
  'normalize',
  'compose',
  'encode',
  'poster',
  'upload',
] as const

interface R2PutOptions {
  httpMetadata?: { contentType?: string; cacheControl?: string }
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | null,
    options?: R2PutOptions,
  ): Promise<unknown>
}

interface DurableObjectNamespace {
  idFromName(name: string): unknown
  get(id: unknown): {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>
  }
}

export interface RenderEnv {
  RENDER_CONTAINER: DurableObjectNamespace
  RENDER_WORKFLOW: Workflow
  GENERATION_BUCKET: R2Bucket
  INTERNAL_CALLBACK_URL?: string
  INTERNAL_CALLBACK_SECRET?: string
  R2_PUBLIC_URL?: string
}

/** worker 收到的载荷 —— 与 `RenderPlan` + 运行上下文同形。 */
export interface RenderRunContext {
  runId: string
  jobId: string
  userId: string
  plan: {
    version: number
    name: string
    projectId: string
    output: {
      aspect: string
      resolution: string
      width: number
      height: number
      fps: number
    }
    video: readonly {
      id: string
      src: string
      in: number
      out: number
      speed: number
      muted: boolean
      transitionOut: 'none' | 'crossfade' | 'black'
      durationSec: number
      sourceNodeId: string
      sourceVersionId?: string
    }[]
    audio: readonly {
      id: string
      src: string
      in: number
      out: number
      speed: number
      gain: number
      startSec: number
      durationSec: number
      sourceNodeId: string
    }[]
    music: RenderRunContext['plan']['audio']
    totalDurationSec: number
  }
}

/* ─── Container ────────────────────────────────────────────────────────── */

/**
 * ffmpeg 容器的门房。
 *
 * ⚠ **一个 job 一个实例**（`idFromName(jobId)`）：中间件落在容器自己的盘上，换实例
 * 等于换盘，断点续传就断了。同一个 jobId 重跑时会命中同一个实例（只要它还没被
 * `sleepAfter` 回收），已完成的中间件直接复用。
 */
export class RenderContainer extends DurableObject<RenderEnv> {
  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container

    if (!container) {
      return Response.json(
        { error: 'container binding unavailable' },
        { status: 503 },
      )
    }
    if (!container.running) {
      // `enableInternet` 是必须的：容器要去 CDN 拉素材。
      container.start({ enableInternet: true })
    }
    return container.getTcpPort(CONTAINER_PORT).fetch(request)
  }
}

async function callContainer<T>(
  env: RenderEnv,
  jobId: string,
  path: string,
  body: unknown,
): Promise<T> {
  const stub = env.RENDER_CONTAINER.get(env.RENDER_CONTAINER.idFromName(jobId))
  const response = await stub.fetch(`http://container${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok || payload?.error) {
    throw new Error(
      `container ${path} failed (${response.status}): ${payload?.error ?? 'unknown'}`,
    )
  }
  return payload
}

/* ─── Workflow ─────────────────────────────────────────────────────────── */

export class RenderVideoWorkflow extends WorkflowEntrypoint<
  RenderEnv,
  RenderRunContext
> {
  async run(
    event: WorkflowEvent<RenderRunContext>,
    step: WorkflowStep,
  ): Promise<void> {
    const { runId, jobId, plan } = event.payload
    const work = `/work/${jobId}`

    const report = async (
      stepId: (typeof RENDER_STEPS)[number],
      ratio: number,
    ): Promise<void> => {
      await postCallback(this.env, {
        runId,
        kind: 'status',
        jobId,
        step: stepId,
        progress: overallProgress(stepId, ratio),
      })
    }

    try {
      /* 1. 下载素材（同一个 url 只拉一次）。 */
      const sources = await step.do('download', async () => {
        const unique = new Map<string, string>()
        const all = [...plan.video, ...plan.audio, ...plan.music]
        for (let index = 0; index < all.length; index += 1) {
          const src = all[index]!.src
          if (unique.has(src)) continue
          unique.set(src, `${work}/src/${index}-${fileNameOf(src)}`)
        }
        for (const [url, dest] of unique) {
          await callContainer(this.env, jobId, '/download', {
            jobId,
            url,
            name: dest.slice(`${work}/src/`.length),
          })
        }
        return Object.fromEntries(unique)
      })
      await report('download', 1)

      /* 2. 规格化 —— xfade 要求同分辨率 / 帧率 / 像素格式 / timebase。 */
      const normalized = await step.do('normalize', async () => {
        const outputs: string[] = []
        for (let index = 0; index < plan.video.length; index += 1) {
          const segment = plan.video[index]!
          const dest = `${work}/norm/${index}.mp4`
          await callContainer(this.env, jobId, '/run', {
            jobId,
            dest,
            args: buildNormalizeCommand({
              src: sources[segment.src] ?? segment.src,
              dest,
              in: segment.in,
              out: segment.out,
              speed: segment.speed,
              width: plan.output.width,
              height: plan.output.height,
              fps: plan.output.fps,
            }),
          })
          outputs.push(dest)
        }
        return outputs
      })
      await report('normalize', 1)

      /* 3 + 4. 建图 → 编码（一次 ffmpeg）。 */
      const outputPath = `${work}/out.mp4`
      await report('compose', 1)
      await step.do('encode', async () => {
        const graphPlan: FgPlan = {
          video: plan.video.map((segment) => ({
            id: segment.id,
            durationSec: segment.durationSec,
            muted: segment.muted,
            transitionOut: segment.transitionOut,
          })),
          audio: plan.audio.map(toGraphAudio),
          music: plan.music.map(toGraphAudio),
        }
        const inputs = [
          ...normalized,
          ...plan.audio.map((segment) => sources[segment.src] ?? segment.src),
          ...plan.music.map((segment) => sources[segment.src] ?? segment.src),
        ]
        await callContainer(this.env, jobId, '/run', {
          jobId,
          dest: outputPath,
          args: buildEncodeCommand({
            inputs,
            plan: graphPlan,
            dest: outputPath,
            fps: plan.output.fps,
            progressPath: 'pipe:1',
          }),
        })
        return outputPath
      })
      await report('encode', 1)

      /* 5. 封面。 */
      const posterPath = `${work}/poster.jpg`
      await step.do('poster', async () => {
        await callContainer(this.env, jobId, '/run', {
          jobId,
          dest: posterPath,
          args: buildPosterCommand(
            outputPath,
            posterPath,
            Math.min(1, plan.totalDurationSec / 2),
          ),
        })
        return posterPath
      })
      await report('poster', 1)

      /* 6. 回写 R2 + 回调。 */
      const uploaded = await step.do('upload', async () => {
        const base = `renders/${plan.projectId}/${jobId}`
        const videoKey = `${base}.mp4`
        const posterKey = `${base}.jpg`
        await putFromContainer(
          this.env,
          jobId,
          outputPath,
          videoKey,
          'video/mp4',
        )
        await putFromContainer(
          this.env,
          jobId,
          posterPath,
          posterKey,
          'image/jpeg',
        )
        return { videoKey, posterKey }
      })

      const publicBase = (this.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
      await postCallback(this.env, {
        runId,
        kind: 'result',
        jobId,
        step: 'upload',
        progress: 1,
        url: `${publicBase}/${uploaded.videoKey}`,
        storageKey: uploaded.videoKey,
        thumbnailUrl: `${publicBase}/${uploaded.posterKey}`,
        thumbnailStorageKey: uploaded.posterKey,
        mimeType: 'video/mp4',
        duration: plan.totalDurationSec,
        width: plan.output.width,
        height: plan.output.height,
        outputType: 'VIDEO',
      })

      // 收尾删盘：成片已经在 R2，中间件留着只是占容器磁盘。
      await callContainer(this.env, jobId, '/cleanup', { jobId }).catch(
        () => undefined,
      )
    } catch (error) {
      await postCallback(this.env, {
        runId,
        kind: 'result',
        jobId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

function toGraphAudio(segment: RenderRunContext['plan']['audio'][number]) {
  return {
    id: segment.id,
    startSec: segment.startSec,
    durationSec: segment.durationSec,
    gain: segment.gain,
    speed: segment.speed,
  }
}

function fileNameOf(src: string): string {
  try {
    const name = new URL(src).pathname.split('/').pop() ?? 'asset'
    return name.replace(/[^A-Za-z0-9._-]/g, '_') || 'asset'
  } catch {
    return 'asset'
  }
}

/**
 * 步骤 → 整体进度。
 *
 * ⚠ 等权：六步各占 1/6，编码那一步内部再按 `-progress` 的比例插值。⛔ 不给编码
 * 加权 —— 加权要的是「每一步大概多久」的经验数据，而我们还没有。
 */
export function overallProgress(
  stepId: (typeof RENDER_STEPS)[number],
  ratio: number,
): number {
  const index = RENDER_STEPS.indexOf(stepId)
  if (index < 0) return 0
  const clamped = Math.max(0, Math.min(1, ratio))
  return Math.round(((index + clamped) / RENDER_STEPS.length) * 100) / 100
}

async function putFromContainer(
  env: RenderEnv,
  jobId: string,
  path: string,
  key: string,
  contentType: string,
): Promise<void> {
  const stub = env.RENDER_CONTAINER.get(env.RENDER_CONTAINER.idFromName(jobId))
  const response = await stub.fetch(
    `http://container/file?path=${encodeURIComponent(path)}`,
  )
  if (!response.ok || !response.body) {
    throw new Error(`container file read failed (${response.status}) ${path}`)
  }
  await env.GENERATION_BUCKET.put(key, response.body, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000' },
  })
}

async function postCallback(
  env: RenderEnv,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = env.INTERNAL_CALLBACK_URL
  const secret = env.INTERNAL_CALLBACK_SECRET
  if (!url || !secret) return
  const body = JSON.stringify({ ...payload, ts: new Date().toISOString() })
  await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(await createSignedRequestHeaders({ secret, body, url })),
    },
    body,
  }).catch(() => undefined)
}

/* ─── 入口 ─────────────────────────────────────────────────────────────── */

export default {
  async fetch(request: Request, env: RenderEnv): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === HEALTH_PATH) {
      return Response.json({ ok: true })
    }

    const secret = env.INTERNAL_CALLBACK_SECRET
    if (!secret) {
      return Response.json({ error: 'worker not configured' }, { status: 503 })
    }

    const rawBody = await verifySignedBody(request, secret)
    if (rawBody === null) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
    const body = JSON.parse(rawBody) as Record<string, unknown>

    if (url.pathname === SUBMIT_PATH) {
      const context = body as unknown as RenderRunContext
      const instance = await env.RENDER_WORKFLOW.create({
        // ⚠ id = jobId：同一个 job 重复提交会被 Workflows 自己挡掉（同名实例已存在），
        // 于是「用户连点两下导出」不会渲两条片子。
        id: context.jobId,
        params: context,
      })
      return Response.json({ accepted: true, instanceId: instance.id })
    }

    if (url.pathname === STATUS_PATH) {
      const jobId = String(body.jobId ?? '')
      const instance = await env.RENDER_WORKFLOW.get(jobId)
      const status = await instance.status()
      return Response.json({ jobId, status })
    }

    if (url.pathname === CANCEL_PATH) {
      const jobId = String(body.jobId ?? '')
      await callContainer(env, jobId, '/cancel', { jobId }).catch(
        () => undefined,
      )
      try {
        const instance = await env.RENDER_WORKFLOW.get(jobId)
        await instance.terminate()
      } catch {
        // 实例已经结束 —— 取消一个已经完成的任务不是错误。
      }
      return Response.json({ cancelled: true })
    }

    return Response.json({ error: 'not found' }, { status: 404 })
  },
}
