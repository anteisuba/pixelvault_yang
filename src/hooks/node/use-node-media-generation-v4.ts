'use client'

/**
 * v4 生成入口（第三期 · 画布 C3b）。
 *
 * ③d-4 起这是画布**唯一**的生成入口（`NodeWorkbenchV4` 直接调 `generateNode`）。
 * v3 的 `use-node-media-generation.ts` 仍被工作台那条路用着，本片不动它。
 *
 * ── 这一层做什么、不做什么 ──────────────────────────────────────────────
 * 做：把「一个 v4 节点 + 整张图」翻译成 `useNodeMediaGeneration` 那个既有的
 * `NodeMediaGenerationInput`。⛔ 不重写请求、不重写轮询 —— 那一半在 v3/v4 之间
 * 一个字都不变（发出去的还是同样的 API），换的只是**载荷从哪来**：
 * 从「按位置猜」换成「按具名槽读」（`buildV4VideoPayload` / `buildV4ImagePayload`
 * / `buildV4AudioPayload`）。
 */

import { useCallback } from 'react'

import type { AspectRatio } from '@/constants/config'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { VideoResolution } from '@/constants/video-options'
import { useNodeMediaGeneration } from '@/hooks/node/use-node-media-generation'
import {
  buildV4AudioPayload,
  buildV4ImagePayload,
  buildV4VideoPayload,
  validateV4Slots,
  type V4SlotIssue,
} from '@/lib/node-slot-payload'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

export interface V4GenerateGraph {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
}

/** 装配好的载荷 + 这一次的前置校验结论。 */
export interface V4GenerationPlan {
  readonly kind: 'image' | 'audio' | 'video'
  readonly modelId: string
  readonly apiKeyId?: string
  readonly prompt: string
  readonly negativePrompt?: string
  readonly aspectRatio?: AspectRatio
  readonly resolution?: VideoResolution
  readonly duration?: number | 'auto'
  readonly seed?: number
  readonly generateAudio?: boolean
  readonly referenceImages?: readonly string[]
  readonly audioUrls?: readonly string[]
  readonly audioBindings?: readonly { url: string; characterName?: string }[]
  readonly videoUrls?: readonly string[]
  /** 空数组 = 可以发。⚠ 调用方**必须**看它：`clip` 少于 2 条这类问题在服务端只会
   *  变成一句泛泛的失败。 */
  readonly issues: readonly V4SlotIssue[]
}

function parseDuration(value: string | undefined): number | 'auto' | undefined {
  if (!value) return undefined
  if (value === 'auto') return 'auto'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 一个 v4 节点 → 这一次要发的东西。**纯函数**（不吃 React），单测直接调它。
 *
 * ⚠ 文本节点没有生成落点，返回 `null`；没选模型也返回 `null` —— ⛔ 不替用户挑一个
 * 默认模型再发出去（那是选模型那一层的事，静默代选会花掉用户没打算花的额度）。
 */
export function planV4Generation(
  nodeId: string,
  graph: V4GenerateGraph,
  overrides: { readonly prompt?: string } = {},
): V4GenerationPlan | null {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return null
  if (!data.model?.modelId) return null

  const issues = validateV4Slots(node, graph.edges, graph.nodes)
  const base = {
    modelId: data.model.modelId,
    ...(data.model.apiKeyId ? { apiKeyId: data.model.apiKeyId } : {}),
    issues,
  }

  if (data.kind === NODE_MEDIA_KIND_IDS.video) {
    const payload = buildV4VideoPayload({
      nodeId,
      nodes: graph.nodes,
      edges: graph.edges,
      ...((overrides.prompt ?? data.prompt)
        ? { ownPrompt: overrides.prompt ?? data.prompt }
        : {}),
    })
    return {
      ...base,
      kind: 'video',
      prompt: payload.prompt,
      ...(data.negativePrompt ? { negativePrompt: data.negativePrompt } : {}),
      ...(data.params?.aspectRatio
        ? { aspectRatio: data.params.aspectRatio as AspectRatio }
        : {}),
      ...(data.params?.resolution
        ? { resolution: data.params.resolution as VideoResolution }
        : {}),
      ...(parseDuration(data.params?.duration) === undefined
        ? {}
        : { duration: parseDuration(data.params?.duration) }),
      ...(data.params?.seed === undefined ? {} : { seed: data.params.seed }),
      ...(data.params?.generateAudio === undefined
        ? {}
        : { generateAudio: data.params.generateAudio }),
      referenceImages: payload.imageUrls,
      videoUrls: payload.videoUrls,
      audioUrls: payload.audioBindings.map((binding) => binding.url),
      audioBindings: payload.audioBindings.map((binding) => ({
        url: binding.url,
        ...(binding.characterName
          ? { characterName: binding.characterName }
          : {}),
      })),
    }
  }

  if (data.kind === NODE_MEDIA_KIND_IDS.audio) {
    const payload = buildV4AudioPayload({
      nodeId,
      nodes: graph.nodes,
      edges: graph.edges,
      ...((overrides.prompt ?? data.prompt)
        ? { ownPrompt: overrides.prompt ?? data.prompt }
        : {}),
    })
    return { ...base, kind: 'audio', prompt: payload.prompt }
  }

  const payload = buildV4ImagePayload({
    nodeId,
    nodes: graph.nodes,
    edges: graph.edges,
    ...((overrides.prompt ?? data.prompt)
      ? { ownPrompt: overrides.prompt ?? data.prompt }
      : {}),
  })
  return {
    ...base,
    kind: 'image',
    prompt: payload.prompt,
    ...(data.params?.aspectRatio
      ? { aspectRatio: data.params.aspectRatio as AspectRatio }
      : {}),
    referenceImages: payload.referenceUrls,
  }
}

/** v3 那个钩子的 v4 外壳：多一个「按槽装配」的入口，其余原样透传。 */
export function useNodeMediaGenerationV4() {
  const inner = useNodeMediaGeneration()

  const generateNode = useCallback(
    async (
      nodeId: string,
      graph: V4GenerateGraph,
      options: {
        readonly prompt?: string
        onJobCreated?(jobId: string): void
      } = {},
    ) => {
      const plan = planV4Generation(nodeId, graph, {
        ...(options.prompt ? { prompt: options.prompt } : {}),
      })
      if (!plan) return { success: false as const, error: 'noPlan' }
      return inner.generate(
        {
          kind: plan.kind,
          modelId: plan.modelId,
          prompt: plan.prompt,
          ...(plan.apiKeyId ? { apiKeyId: plan.apiKeyId } : {}),
          ...(plan.aspectRatio ? { aspectRatio: plan.aspectRatio } : {}),
          ...(plan.resolution ? { resolution: plan.resolution } : {}),
          ...(plan.duration === undefined ? {} : { duration: plan.duration }),
          ...(plan.seed === undefined ? {} : { seed: plan.seed }),
          ...(plan.generateAudio === undefined
            ? {}
            : { generateAudio: plan.generateAudio }),
          ...(plan.negativePrompt
            ? { negativePrompt: plan.negativePrompt }
            : {}),
          ...(plan.referenceImages?.length
            ? { referenceImages: [...plan.referenceImages] }
            : {}),
          ...(plan.audioUrls?.length ? { audioUrls: [...plan.audioUrls] } : {}),
          ...(plan.audioBindings?.length
            ? { audioBindings: [...plan.audioBindings] }
            : {}),
          ...(plan.videoUrls?.length ? { videoUrls: [...plan.videoUrls] } : {}),
        },
        options.onJobCreated
          ? { onJobCreated: options.onJobCreated }
          : undefined,
      )
    },
    [inner],
  )

  return { ...inner, generateNode, planV4Generation }
}
