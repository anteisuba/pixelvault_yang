/**
 * L2a 真库 + 真服务的「提交链路」测试共用：只假执行 Worker 那一跳（fetch 边界）。
 *
 * 用法：
 * ```ts
 * const worker = installFakeExecutionWorker()   // 在 beforeEach 里调（每例重装、清空记录）
 * … 调真服务 …
 * expect(worker.requests[0].json).toMatchObject({ runId: job.id })
 * worker.reject(503)                            // 下一次派发被 Worker 拒
 * ```
 * 别的地址一律回 404（⛔ 打真网络）；要额外放行某个地址用 `other`。
 */
import { vi } from 'vitest'

import { handleExecutionCallback } from '@/services/execution-callback.service'

export const FAKE_WORKER_BASE_URL = 'https://worker.test'

export interface FakeWorkerRequest {
  url: string
  path: string
  body: string
  json: Record<string, unknown>
  headers: Headers
}

export interface FakeExecutionWorker {
  readonly requests: FakeWorkerRequest[]
  /** 之后的派发 Worker 回这个状态码（不是 2xx 即拒）。 */
  reject(status: number): void
  /** 恢复成正常收单。 */
  accept(): void
}

export function installFakeExecutionWorker(
  options: {
    /** Worker 收单时回的实例号。 */
    instanceId?: string
    /** 非 Worker 地址的处理（默认 404）。 */
    other?: (url: string, init?: RequestInit) => Response | Promise<Response>
    /**
     * Worker 收单后「过一会儿」自己回执（下一拍，真回执服务）：返回 `'image'` = 出图成功，
     * `{ error }` = 服务商报错，`null` = 不回（留给测试自己处理）。
     */
    autoFinish?: (
      request: FakeWorkerRequest,
    ) => 'image' | { error: string; errorCode?: string } | null
  } = {},
): FakeExecutionWorker {
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', FAKE_WORKER_BASE_URL)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
  let status = 200
  const requests: FakeWorkerRequest[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith(FAKE_WORKER_BASE_URL)) {
        return options.other
          ? options.other(url, init)
          : new Response('not found', { status: 404 })
      }
      const body = String(init?.body ?? '')
      let json: Record<string, unknown> = {}
      try {
        json = JSON.parse(body) as Record<string, unknown>
      } catch {
        json = {}
      }
      const request = {
        url,
        path: url.slice(FAKE_WORKER_BASE_URL.length),
        body,
        json,
        headers: new Headers(init?.headers),
      }
      requests.push(request)
      const accepted = status >= 200 && status < 300
      const outcome = accepted ? options.autoFinish?.(request) : null
      const runId = typeof json.runId === 'string' ? json.runId : null
      if (outcome && runId) {
        // 等站点把「已派发」写回任务行之后再回执（真 Worker 也不会更快）。
        setTimeout(() => {
          void (outcome === 'image'
            ? finishImageRun(runId)
            : failRun(runId, outcome.error, outcome.errorCode))
        }, 1_000)
      }
      return status >= 200 && status < 300
        ? Response.json({
            workflowInstanceId: options.instanceId ?? `wf_${requests.length}`,
          })
        : new Response('rejected', { status })
    }),
  )
  return {
    requests,
    reject(next) {
      status = next
    },
    accept() {
      status = 200
    },
  }
}

/**
 * Worker 跑完回执（走真的回执服务 `handleExecutionCallback`）：出了一张图，
 * 图已由 Worker 自己写进 R2（`imageR2Key`），站点不再下载。
 */
export function finishImageRun(
  runId: string,
  extra: Record<string, unknown> = {},
) {
  return handleExecutionCallback({
    runId,
    kind: 'result',
    ts: new Date().toISOString(),
    data: {
      artifactUrl: `https://cdn.test/generations/${runId}.png`,
      imageR2Key: `generations/${runId}.png`,
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      ...extra,
    },
  })
}

/** Worker 回执：服务商报错。 */
export function failRun(runId: string, error: string, errorCode?: string) {
  return handleExecutionCallback({
    runId,
    kind: 'result',
    ts: new Date().toISOString(),
    data: { error, ...(errorCode ? { errorCode } : {}) },
  })
}

/**
 * 等一个会轮询（`setTimeout` 间隔）的承诺落地：测试已开 `vi.useFakeTimers()`，真库 I/O
 * 照常跑；每轮先让 I/O 走完一拍，再把时钟拨过一个轮询间隔。
 */
export async function settlePolling<T>(
  promise: Promise<T>,
  stepMs = 5_000,
  maxSteps = 400,
): Promise<T> {
  let done = false
  const tracked = promise.finally(() => {
    done = true
  })
  for (let i = 0; i < maxSteps && !done; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(stepMs)
  }
  return tracked
}
