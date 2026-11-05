/**
 * 我们自己的等待预算用完（`generation_wait_limit`）时，顺手把服务商那边的任务撤掉。
 *
 * 全部是 best-effort：撤不掉（服务商没有取消接口、任务已经开跑撤不动、网络错）就如实记下
 * 结果，⛔ 不抛错 —— 任务照常按 wait-limit 判失败，`providerJobId` 留在 GenerationJob 上，
 * 迟到的成功结果仍可由 app 侧认领（见 `execution-callback.service.ts` 的复活路径）。
 *
 * 各家取消接口（2026-11-05 查证）：
 * - fal：`PUT {queue}/{model}/requests/{id}/cancel`，只对还在排队的有效，开跑后回 400。
 *   取消地址从提交时 fal 返回的 `status_url` 推出来（把结尾的 `/status` 换成 `/cancel`），
 *   带子路径的模型（`fal-ai/flux/dev`）也对。
 * - Replicate：`POST /v1/predictions/{id}/cancel`，跑着的也能撤。
 * - 火山方舟 / BytePlus：`DELETE /api/v3/contents/generations/tasks/{id}` 只能撤排队中的；
 *   ⚠ 对已成功 / 已失败的任务，同一个 DELETE 是「删除任务记录」—— 会把还能认领的结果删掉，
 *   所以必须先 GET 确认还是 `queued` 才发。
 * - Ideogram / PixAI / Hyper3D Rodin / MiniMax / Gemini：没有公开的取消接口，只保留任务 id。
 */

export interface ProviderCancelOutcome {
  /** 真的向服务商发了取消请求。 */
  attempted: boolean
  /** 服务商回了 2xx。 */
  ok: boolean
  detail: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `https://queue.fal.run/fal-ai/x/requests/abc/status?logs=1` → `.../requests/abc/cancel`；认不出返回 null。 */
export function falCancelUrlFromStatusUrl(statusUrl: string): string | null {
  let url: URL
  try {
    url = new URL(statusUrl)
  } catch {
    return null
  }
  if (!/\/requests\/[^/]+\/status\/?$/.test(url.pathname)) return null
  url.pathname = url.pathname.replace(/\/status\/?$/, '/cancel')
  url.search = ''
  return url.toString()
}

export async function cancelFalQueueRequest(
  statusUrl: string,
  apiKey: string,
): Promise<ProviderCancelOutcome> {
  const cancelUrl = falCancelUrlFromStatusUrl(statusUrl)
  if (!cancelUrl) {
    return {
      attempted: false,
      ok: false,
      detail: 'fal.ai status_url has no recognizable request path.',
    }
  }
  try {
    const response = await fetch(cancelUrl, {
      method: 'PUT',
      headers: { Authorization: `Key ${apiKey}` },
    })
    return {
      attempted: true,
      ok: response.ok,
      detail: `fal.ai responded ${response.status}.`,
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      detail: `fal.ai cancel request failed: ${describeError(error)}`,
    }
  }
}

export async function cancelReplicatePrediction(
  baseUrl: string,
  predictionId: string,
  apiKey: string,
): Promise<ProviderCancelOutcome> {
  try {
    const response = await fetch(
      `${baseUrl}/predictions/${encodeURIComponent(predictionId)}/cancel`,
      { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } },
    )
    return {
      attempted: true,
      ok: response.ok,
      detail: `Replicate responded ${response.status}.`,
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      detail: `Replicate cancel request failed: ${describeError(error)}`,
    }
  }
}

/** 方舟任务只有 `queued` 能撤；其它状态 ⛔ 不发 DELETE（那是删记录，见文件头）。 */
export async function cancelArkTaskIfQueued(
  taskUrl: string,
  apiKey: string,
): Promise<ProviderCancelOutcome> {
  const headers = { Authorization: `Bearer ${apiKey}` }
  try {
    const statusResponse = await fetch(taskUrl, { headers })
    if (!statusResponse.ok) {
      return {
        attempted: false,
        ok: false,
        detail: `Ark task lookup responded ${statusResponse.status}; cancel skipped.`,
      }
    }
    const task = (await statusResponse.json()) as Record<string, unknown>
    const status = typeof task.status === 'string' ? task.status : ''
    if (status !== 'queued') {
      return {
        attempted: false,
        ok: false,
        detail: `Ark task is ${status || 'unknown'}; only queued tasks can be canceled.`,
      }
    }
    const response = await fetch(taskUrl, { method: 'DELETE', headers })
    return {
      attempted: true,
      ok: response.ok,
      detail: `Ark responded ${response.status}.`,
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      detail: `Ark cancel request failed: ${describeError(error)}`,
    }
  }
}

/** 取消函数本身出了意外（比如解密 key 失败）也折成结果，不让它盖掉原来的超时错误。 */
export async function settleProviderCancel(
  cancel: () => Promise<ProviderCancelOutcome>,
): Promise<ProviderCancelOutcome> {
  try {
    return await cancel()
  } catch (error) {
    return {
      attempted: false,
      ok: false,
      detail: `Cancel was not sent: ${describeError(error)}`,
    }
  }
}
