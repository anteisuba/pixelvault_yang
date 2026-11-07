'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ShotReadField } from '@/constants/shot-reading'
import type { AppLocale } from '@/i18n/routing'
import { readShotsAPI } from '@/lib/api-client/vision'
import {
  planShotReadBatches,
  planShotReadFill,
  toShotReadShots,
  type ShotReadBatchEntry,
  type ShotReadTarget,
} from '@/lib/shot-read-plan'
import { listShotTableNodes } from '@/lib/shot-table-rows'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

/**
 * 拉片 · 读镜（H4b）：落表之后，一批一批（每 8 镜）交给 Gemini，读回来就填进表里。
 *
 * - **顺序读、不并发**（mock ⑥ 第 5 条）：一批约 10–30 秒，碰不上 `imageAnalyze` 那条限流。
 * - 一批读回来 = 一次 `dispatchBatch` = 一步撤销；填法见 `planShotReadFill`（只填空格、
 *   整行改过就跳过、仍是草稿）。
 * - 某批失败就停在那一批：已填的留着，`retry` 从那一批接着读（可换一把 key），`stop` 收掉。
 * - 一批里的卡全都不再是草稿（撤销了落表 / 都改过了）就跳过那批，⛔ 不白花用户的 key。
 *
 * 宿主是工作台（画布外）：拉片纸关了、表卡被滚出视口，读镜照样往下走。
 */

export interface ShotReadingStart {
  readonly videoUrl: string
  readonly apiKeyId: string
  readonly locale: AppLocale
  readonly fields: readonly ShotReadField[]
  readonly targets: readonly ShotReadTarget[]
}

export interface ShotReadingFailure {
  readonly error: string
  readonly errorCode?: string
  readonly i18nKey?: string
}

interface ShotReadingProgress {
  readonly batchIndex: number
  readonly batchCount: number
  /** 已经读过（或跳过）的镜数，进度条的分子。 */
  readonly doneShots: number
  readonly totalShots: number
  /** 这一批的镜头卡 id（在读的那几行走灰条 / 没读出来的那几行）。 */
  readonly batchIds: readonly string[]
  readonly fields: readonly ShotReadField[]
}

export type ShotReadingState =
  /** `finished` = 上一轮是读完收的（卡边走完那一拍）；停下 / 算了收的不带。 */
  | { readonly status: 'idle'; readonly finished?: true }
  | ({ readonly status: 'reading' } & ShotReadingProgress)
  | ({
      readonly status: 'failed'
      readonly failure: ShotReadingFailure
    } & ShotReadingProgress)

interface ShotReadingSession {
  readonly request: Omit<ShotReadingStart, 'targets'>
  readonly batches: readonly (readonly ShotReadBatchEntry[])[]
  readonly totalShots: number
}

export interface ShotReadingGraph {
  readState(): { readonly nodes: readonly NodeV4[] }
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): unknown
}

const IDLE: ShotReadingState = { status: 'idle' }
const FINISHED: ShotReadingState = { status: 'idle', finished: true }

function draftIds(nodes: readonly NodeV4[]): Set<string> {
  return new Set(
    listShotTableNodes(nodes)
      .filter((node) => node.data.shot?.draft === true)
      .map((node) => node.id),
  )
}

function shotsBefore(
  batches: ShotReadingSession['batches'],
  index: number,
): number {
  return batches.slice(0, index).reduce((sum, batch) => sum + batch.length, 0)
}

export function useShotReading(graph: ShotReadingGraph) {
  const [state, setState] = useState<ShotReadingState>(IDLE)
  const graphRef = useRef(graph)
  const sessionRef = useRef<ShotReadingSession | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    graphRef.current = graph
  }, [graph])

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  useEffect(() => abort, [abort])

  const runFrom = useCallback(
    async (session: ShotReadingSession, from: number) => {
      abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const stale = () =>
        controller.signal.aborted || sessionRef.current !== session

      for (let index = from; index < session.batches.length; index += 1) {
        const batch = session.batches[index] ?? []
        const progress: ShotReadingProgress = {
          batchIndex: index,
          batchCount: session.batches.length,
          doneShots: shotsBefore(session.batches, index),
          totalShots: session.totalShots,
          batchIds: batch.map((entry) => entry.nodeId),
          fields: session.request.fields,
        }
        const drafts = draftIds(graphRef.current.readState().nodes)
        const live = batch.filter((entry) => drafts.has(entry.nodeId))
        if (live.length === 0) continue
        setState({ status: 'reading', ...progress })

        const result = await readShotsAPI(
          {
            videoUrl: session.request.videoUrl,
            apiKeyId: session.request.apiKeyId,
            locale: session.request.locale,
            fields: [...session.request.fields],
            shots: toShotReadShots(live),
          },
          controller.signal,
        )
        if (stale()) return
        if (!result.success) {
          setState({
            status: 'failed',
            ...progress,
            failure: {
              error: result.error,
              ...(result.errorCode ? { errorCode: result.errorCode } : {}),
              ...(result.i18nKey ? { i18nKey: result.i18nKey } : {}),
            },
          })
          return
        }
        const fill = planShotReadFill({
          nodes: graphRef.current.readState().nodes,
          batch: live,
          rows: result.data.rows,
        })
        if (fill.ops.length > 0) graphRef.current.dispatchBatch(fill.ops)
      }

      if (stale()) return
      sessionRef.current = null
      controllerRef.current = null
      setState(FINISHED)
    },
    [abort],
  )

  const start = useCallback(
    (input: ShotReadingStart) => {
      const batches = planShotReadBatches(input.targets)
      if (batches.length === 0) return
      const { targets, ...request } = input
      const session: ShotReadingSession = {
        request,
        batches,
        totalShots: targets.length,
      }
      sessionRef.current = session
      void runFrom(session, 0)
    },
    [runFrom],
  )

  /** 停下 / 算了：已填的留着，没读的空着。正在读的那一批中途掐掉，回来也不填。 */
  const stop = useCallback(() => {
    abort()
    sessionRef.current = null
    setState(IDLE)
  }, [abort])

  /** 从没读出来的那一批接着读；给了 `apiKeyId` 就换这把（刚在弹窗里配好的）。 */
  const retry = useCallback(
    (apiKeyId?: string) => {
      const session = sessionRef.current
      if (!session || state.status !== 'failed') return
      const next: ShotReadingSession = apiKeyId
        ? { ...session, request: { ...session.request, apiKeyId } }
        : session
      sessionRef.current = next
      void runFrom(next, state.batchIndex)
    },
    [runFrom, state],
  )

  return { state, start, stop, retry }
}
