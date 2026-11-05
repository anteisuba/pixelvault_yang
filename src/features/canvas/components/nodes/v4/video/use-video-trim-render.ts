'use client'

/**
 * 视频卡「裁剪」的渲染任务（node-canvas-v2 §4 shot；owner 2026-11-05「服务器落卡」）。
 *
 * 确认 → 一段的时间线计划（`buildVideoTrimPlan`，由调用方拼好交进来）→ 渲染层 →
 * **服务端**把 `video.clip` 落进项目（在把任务标成完成之前）→ 这里拉一次最新。卡边
 * 走渲染层回报的真实进度。页面关了也照样落：落卡不靠这个 hook。
 *
 * ⚠ 与剪辑台的 `useEditDeskRender` 分家：那条把 jobId 记进 localStorage 给「上次导出
 * 未完成」用，裁剪任务混进去会让剪辑台冒出一条不是它的「继续」。
 *
 * ⛔ 组件里不直接 `fetch`（Hard Rule 3）—— 提交与轮询都走 `@/lib/api-client`。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  RENDER_JOB_STATUS_IDS,
  RENDER_POLL_INTERVAL_MS,
  type RenderPlan,
  type RenderTrimLanding,
} from '@/constants/render-video'
import {
  getRenderJobAPI,
  submitRenderAPI,
  type RenderJobResponse,
} from '@/lib/api-client'

import { isTerminalRenderStatus } from '../../../edit-desk/use-edit-desk-render'
import type { VideoTrimHostApi } from '../NodeV4Context'

export interface UseVideoTrimRenderOptions {
  /** 宿主没接（预览 / 单测）= 提交直接返回 false。 */
  readonly host: VideoTrimHostApi | undefined
  readonly locale: string
  /** 说给用户听的一句话（toast 由调用方发 —— hook 不认识 i18n）。空串 = 没有具体原因。 */
  onError(message: string): void
}

export interface VideoTrimRender {
  /** 正在提交或渲染（卡边走进度、工具条「裁剪」置灰）。 */
  readonly busy: boolean
  /** 0–100；还没回报 = 0。 */
  readonly percent: number
  submit(plan: RenderPlan, trim: RenderTrimLanding): Promise<boolean>
}

export function useVideoTrimRender({
  host,
  locale,
  onError,
}: UseVideoTrimRenderOptions): VideoTrimRender {
  const [job, setJob] = useState<RenderJobResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const hostRef = useRef(host)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    hostRef.current = host
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!job || isTerminalRenderStatus(job.status)) return
    let settled = false
    const timer = window.setInterval(() => {
      void getRenderJobAPI(job.jobId).then((response) => {
        const next = response.data
        if (settled || !response.success || !next) return
        if (!isTerminalRenderStatus(next.status)) {
          setJob(next)
          return
        }
        // ⚠ 一条任务只收一次尾：严格模式 / 慢响应下两轮轮询可能同时回来。
        settled = true
        setJob(null)
        if (next.status === RENDER_JOB_STATUS_IDS.completed) {
          // 卡已经由服务端落进项目了 —— ⛔ 浏览器不再建卡，两条路会落两张。
          hostRef.current?.refresh()
        } else if (next.status === RENDER_JOB_STATUS_IDS.failed) {
          onErrorRef.current(next.error ?? '')
        }
      })
    }, RENDER_POLL_INTERVAL_MS)
    return () => {
      settled = true
      window.clearInterval(timer)
    }
  }, [job])

  const submit = useCallback(
    async (plan: RenderPlan, trim: RenderTrimLanding): Promise<boolean> => {
      if (!hostRef.current) return false
      setSubmitting(true)
      try {
        const response = await submitRenderAPI({
          plan,
          toCanvas: true,
          locale,
          trim,
        })
        if (!response.success || !response.data) {
          // ⚠ 入队失败要**大声**：worker 没起 / 同时渲染满了，这是唯一看得见的信号。
          onErrorRef.current(response.error ?? '')
          return false
        }
        setJob(response.data)
        return true
      } finally {
        setSubmitting(false)
      }
    },
    [locale],
  )

  return {
    busy: submitting || job !== null,
    percent: Math.round((job?.progress ?? 0) * 100),
    submit,
  }
}
