'use client'

import { useCallback, useEffect, useRef } from 'react'

import { NODE_MEDIA_KIND_IDS, NODE_STATUS_IDS } from '@/constants/node-types'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  checkVideoStatusAPI,
} from '@/lib/api-client'
import type {
  GenerationStatusProbe,
  GenerationStatusProbeResponse,
} from '@/lib/poll-generation-status'
import { pendingMediaJobIds } from '@/lib/node-media-patch'
import type { NodeV4MediaPatch } from '@/components/business/node/nodes/v4/NodeV4Context'
import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

interface GenerationFailurePayload {
  error?: string
  errorCode?: string
  i18nKey?: string
}

export interface UseNodeGenerationReconcileV4Input {
  readonly nodes: readonly NodeV4[]
  /** 回填媒体（不进撤销栈 —— 它不是用户的一步意图，见图引擎头注例外 ③）。 */
  setMedia(nodeId: string, patch: NodeV4MediaPatch): void
  setRunState(nodeId: string, status: NodeV4Data['status']): void
  /**
   * 后台落地的失败该怎么说给用户听。
   *
   * ⚠ 存在的理由与 v3 那版逐字相同：不给这个函数，后台落地的失败就会把 provider
   * 的原文直接甩给用户，而前台失败走的是翻译过的那一条 —— 同一个失败两种读法。
   * ⛔ 不在 hook 里直接 toast：那会把「怎么呈现」焊死在数据层。
   */
  reportFailure(nodeId: string, payload: GenerationFailurePayload): void
}

/**
 * 还在飞的：有 job id 就是有。⛔ 不另看 `status` —— 两个判据迟早对不上。
 * 单枪那一单（`mediaJobId`）与一批里还没落地的几单（`mediaBatchJobIds`）都算。
 */
function readPendingJobIds(node: NodeV4): readonly string[] {
  if (node.data.kind === NODE_MEDIA_KIND_IDS.text) return []
  return pendingMediaJobIds(node.data)
}

/** 一单落地时摘掉它自己的在飞标记：一批里的只摘这一单，⛔ 清掉整张卡的。 */
function settlePatch(node: NodeV4, jobId: string): NodeV4MediaPatch {
  return node.data.kind !== NODE_MEDIA_KIND_IDS.text &&
    node.data.mediaBatchJobIds?.includes(jobId)
    ? { settleBatchJob: jobId }
    : { mediaJobId: undefined }
}

function statusProbeForKind(kind: NodeV4Data['kind']): GenerationStatusProbe {
  if (kind === NODE_MEDIA_KIND_IDS.video) return checkVideoStatusAPI
  if (kind === NODE_MEDIA_KIND_IDS.audio) return checkAudioStatusAPI
  return checkImageGenerationStatusAPI
}

/**
 * v4 的生成回填（③e）。
 *
 * ── 它替的是什么 ──────────────────────────────────────────────────────
 * v3 的 `use-node-generation-reconcile` 随画布翻转一起删了，而 v4 一直**没有等价
 * 物**：`generateNode` 的结果没人接，`onJobCreated` 也没人订阅。表现是「点了生成、
 * 转完圈、卡还是空的」，刷新之后更是连「有一单在飞」都无从知道。
 *
 * ── 判据只有一条 ──────────────────────────────────────────────────────
 * 节点上落着 `mediaJobId` = 有一单在飞。这个字段是**持久化**的（`NodeV4MediaMetaShape`），
 * 所以刷新之后仍然读得到；worker 无论如何都会在服务端跑完，这里做的只是把结果
 * 取回来。⛔ 只读状态、**从不重新提交** —— 重提交等于二次扣 credit。
 *
 * 探针返回 IN_QUEUE / IN_PROGRESS、网络抖动、或空信封，一律**原样留着 pending**
 * 等下一轮：把它当失败清掉，用户会看到一单明明还在跑的生成变成「失败」。
 *
 * 触发时机三处：挂载、pending 集合变化（新提交 / 上一单落地）、以及标签页重新
 * 获得焦点 —— 最后这个是「回来看看好了没」的那一刻，也是刷新之外最常见的入口。
 */
export function useNodeGenerationReconcileV4({
  nodes,
  setMedia,
  setRunState,
  reportFailure,
}: UseNodeGenerationReconcileV4Input): void {
  // 异步 pass 里读最新的图，又不让 focus 监听每次渲染都重新注册（拖拽 / 选中
  // 一秒钟能让这个 hook 的入参变几十次）。
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const setMediaRef = useRef(setMedia)
  setMediaRef.current = setMedia
  const setRunStateRef = useRef(setRunState)
  setRunStateRef.current = setRunState
  const reportFailureRef = useRef(reportFailure)
  reportFailureRef.current = reportFailure
  /** 防止两轮重叠（focus 在上一轮还没解完时又打进来）。 */
  const isReconcilingRef = useRef(false)

  const reconcileJob = useCallback(
    async (node: NodeV4, jobId: string): Promise<void> => {
      if (node.data.kind === NODE_MEDIA_KIND_IDS.text) return

      let response: GenerationStatusProbeResponse | null = null
      try {
        response = await statusProbeForKind(node.data.kind)(jobId)
      } catch {
        return // 网络抖动 —— 留着 pending，下一轮再问
      }

      const currentNode = nodesRef.current.find((item) => item.id === node.id)
      if (!currentNode || !readPendingJobIds(currentNode).includes(jobId))
        return
      const settle = settlePatch(currentNode, jobId)
      // 一批里别的单还在飞：卡仍是「在跑」，运行态等最后一单落地再改。
      const lastInFlight = readPendingJobIds(currentNode).length === 1

      const data = response?.success ? response.data : undefined
      if (!data) return // 空信封同上

      if (data.status === 'COMPLETED' && data.generation) {
        const generation = data.generation
        setMediaRef.current(node.id, {
          url: generation.url,
          generationId: generation.id,
          // 终态：job id 清掉。⚠ 显式 `undefined`，见 `NodeV4MediaPatch` 那条注释。
          ...settle,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
          ...(generation.thumbnailUrl
            ? { videoThumbnailUrl: generation.thumbnailUrl }
            : {}),
        })
        if (lastInFlight) setRunStateRef.current(node.id, NODE_STATUS_IDS.done)
        return
      }

      if (data.status === 'CANCELLED') {
        setMediaRef.current(node.id, settle)
        if (lastInFlight) setRunStateRef.current(node.id, NODE_STATUS_IDS.idle)
        return
      }

      if (data.status === 'FAILED') {
        const failure = {
          ...(data.error ? { error: data.error } : {}),
          ...(data.errorCode ? { errorCode: data.errorCode } : {}),
          ...(data.i18nKey ? { i18nKey: data.i18nKey } : {}),
        }
        reportFailureRef.current(node.id, failure)
        setMediaRef.current(node.id, {
          ...settle,
          generationFailure: failure,
        })
        if (lastInFlight)
          setRunStateRef.current(node.id, NODE_STATUS_IDS.failed)
      }
      // IN_QUEUE / IN_PROGRESS → 还在跑，留着 pending。
    },
    [],
  )

  const reconcileAll = useCallback(async (): Promise<void> => {
    if (isReconcilingRef.current) return
    const pending = nodesRef.current.flatMap((node) =>
      readPendingJobIds(node).map((jobId) => ({ node, jobId })),
    )
    if (pending.length === 0) return

    isReconcilingRef.current = true
    try {
      await Promise.all(
        pending.map(({ node, jobId }) => reconcileJob(node, jobId)),
      )
    } finally {
      isReconcilingRef.current = false
    }
  }, [reconcileJob])

  const reconcileAllRef = useRef(reconcileAll)
  reconcileAllRef.current = reconcileAll

  /**
   * 当前 pending 的 job id 集合的稳定键。挂载时跑一次，之后只在**有单进出**时
   * 再跑 —— ⛔ 不用 `nodes` 当依赖：拖一下卡就会重跑一遍全部探针。
   */
  const pendingKey = nodes.flatMap(readPendingJobIds).sort().join(',')

  useEffect(() => {
    void reconcileAllRef.current()
  }, [pendingKey])

  useEffect(() => {
    const onActivate = () => {
      void reconcileAllRef.current()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void reconcileAllRef.current()
      }
    }
    window.addEventListener('focus', onActivate)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onActivate)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
