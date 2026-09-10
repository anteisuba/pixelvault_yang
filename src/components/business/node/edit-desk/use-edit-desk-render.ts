'use client'

/**
 * 剪辑台导出的**任务生命周期**（S9 · spec §6「导出」）。
 *
 * 提交 → 轮询 → 完成落卡 / 失败说人话 / 取消 / 「上次导出未完成」。
 *
 * ⚠ 与 `useEditDesk` 分家的理由：那个 hook 是时间线的纯状态出口（算术 + op），
 * 这个 hook 会 `fetch`、会开定时器、会写 `localStorage`。混在一起的表现是时间线的
 * 每一条纯函数测试都要先 mock 一遍网络。
 *
 * ⛔ 组件里不直接 `fetch`（Hard Rule 3）—— 三条路都走 `@/lib/api-client`。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  RENDER_JOB_STATUS_IDS,
  RENDER_POLL_INTERVAL_MS,
  type RenderPlan,
} from '@/constants/render-video'
import {
  cancelRenderJobAPI,
  getRenderJobAPI,
  submitRenderAPI,
  type RenderJobResponse,
} from '@/lib/api-client'

/**
 * 最近一次导出的 jobId 存哪。
 *
 * ⚠ 按项目分键：两个项目各自的「上次导出未完成」不该互相顶掉。
 * ⛔ 不存进时间线（`EditProject`）：那是**项目内容**，会进撤销栈、会同步给别的
 * 设备，而一个渲染任务是这台机器上的一次操作。
 */
export const RENDER_LAST_JOB_STORAGE_PREFIX = 'pixelvault:edit-render:'

function storageKey(projectId: string): string {
  return `${RENDER_LAST_JOB_STORAGE_PREFIX}${projectId}`
}

function readLastJobId(projectId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(projectId))
  } catch {
    return null
  }
}

function writeLastJobId(projectId: string, jobId: string | null): void {
  try {
    if (jobId) window.localStorage.setItem(storageKey(projectId), jobId)
    else window.localStorage.removeItem(storageKey(projectId))
  } catch {
    // 隐私模式 / 存储满 —— 丢掉「上次导出」的记忆不该让导出本身失败。
  }
}

export function isTerminalRenderStatus(
  status: RenderJobResponse['status'],
): boolean {
  return (
    status === RENDER_JOB_STATUS_IDS.completed ||
    status === RENDER_JOB_STATUS_IDS.failed ||
    status === RENDER_JOB_STATUS_IDS.cancelled
  )
}

export interface UseEditDeskRenderOptions {
  readonly projectId: string
  /** 完成且用户勾了「导出到画布」时落一张成片卡。 */
  onLanded(job: RenderJobResponse, sourceNodeIds: readonly string[]): void
  /** 说给用户听的一句话（toast 由调用方发 —— hook 不认识 i18n）。 */
  onError(message: string): void
}

export interface EditDeskRender {
  readonly job: RenderJobResponse | null
  readonly submitting: boolean
  /** 有一条上次没跑完的任务在等「继续 / 重来」。 */
  readonly resumable: RenderJobResponse | null
  submit(
    plan: RenderPlan,
    options: { readonly toCanvas: boolean },
  ): Promise<boolean>
  cancel(): Promise<void>
  /** 「继续」：接着盯上次那条。 */
  resume(): void
  /** 「重来」：忘掉上次那条（不取消它 —— 它可能已经跑完了）。 */
  dismissResumable(): void
  /** 完成之后收起顶栏那条进度。 */
  clear(): void
}

export function useEditDeskRender(
  options: UseEditDeskRenderOptions,
): EditDeskRender {
  const { projectId, onLanded, onError } = options
  const [job, setJob] = useState<RenderJobResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resumable, setResumable] = useState<RenderJobResponse | null>(null)

  /**
   * 这一单要不要落卡。
   *
   * ⚠ 存 ref 不存 state：它只在「完成」那一瞬间被读一次，放进 state 会让轮询的
   * effect 多一个依赖、每次勾选都重开一轮定时器。
   */
  const toCanvasRef = useRef(false)
  const sourceNodeIdsRef = useRef<readonly string[]>([])
  const landedRef = useRef<string | null>(null)
  const onLandedRef = useRef(onLanded)
  const onErrorRef = useRef(onError)
  onLandedRef.current = onLanded
  onErrorRef.current = onError

  /* ── 进模式时看一眼上次那条 ───────────────────────────────────────── */
  useEffect(() => {
    const lastJobId = readLastJobId(projectId)
    if (!lastJobId) return
    let cancelled = false
    void getRenderJobAPI(lastJobId).then((response) => {
      if (cancelled) return
      const found = response.data
      if (!response.success || !found) {
        // 任务不在了（换了账号 / 被清了）—— 忘掉它，⛔ 不给一个点不动的「继续」。
        writeLastJobId(projectId, null)
        return
      }
      if (isTerminalRenderStatus(found.status)) {
        writeLastJobId(projectId, null)
        return
      }
      setResumable(found)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  /* ── 轮询 ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!job || isTerminalRenderStatus(job.status)) return
    const timer = window.setInterval(() => {
      void getRenderJobAPI(job.jobId).then((response) => {
        const next = response.data
        if (!response.success || !next) return
        setJob(next)
        if (!isTerminalRenderStatus(next.status)) return
        writeLastJobId(projectId, null)
        if (next.status === RENDER_JOB_STATUS_IDS.failed) {
          onErrorRef.current(next.error ?? '')
          return
        }
        if (
          next.status === RENDER_JOB_STATUS_IDS.completed &&
          toCanvasRef.current &&
          landedRef.current !== next.jobId
        ) {
          // ⚠ 一条任务只落一张卡：轮询在 React 严格模式下会跑两遍。
          landedRef.current = next.jobId
          onLandedRef.current(next, sourceNodeIdsRef.current)
        }
      })
    }, RENDER_POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [job, projectId])

  const submit = useCallback(
    async (
      plan: RenderPlan,
      submitOptions: { readonly toCanvas: boolean },
    ): Promise<boolean> => {
      setSubmitting(true)
      toCanvasRef.current = submitOptions.toCanvas
      sourceNodeIdsRef.current = [
        ...new Set(plan.video.map((segment) => segment.sourceNodeId)),
      ]
      try {
        const response = await submitRenderAPI({
          plan,
          toCanvas: submitOptions.toCanvas,
        })
        if (!response.success || !response.data) {
          // ⚠ 入队失败要**大声**：worker 没部署时这就是用户唯一看得见的信号。
          onErrorRef.current(response.error ?? '')
          return false
        }
        writeLastJobId(projectId, response.data.jobId)
        setResumable(null)
        setJob(response.data)
        return true
      } finally {
        setSubmitting(false)
      }
    },
    [projectId],
  )

  const cancel = useCallback(async (): Promise<void> => {
    if (!job) return
    const response = await cancelRenderJobAPI(job.jobId)
    writeLastJobId(projectId, null)
    setJob(response.data ?? null)
  }, [job, projectId])

  const resume = useCallback((): void => {
    if (!resumable) return
    toCanvasRef.current = true
    setJob(resumable)
    setResumable(null)
  }, [resumable])

  const dismissResumable = useCallback((): void => {
    setResumable(null)
    writeLastJobId(projectId, null)
  }, [projectId])

  const clear = useCallback((): void => {
    setJob(null)
  }, [])

  return {
    job,
    submitting,
    resumable,
    submit,
    cancel,
    resume,
    dismissResumable,
    clear,
  }
}
