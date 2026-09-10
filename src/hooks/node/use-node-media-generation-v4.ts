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
import { AdvancedParamsSchema } from '@/types'
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
  /** 图片画质档 —— 走 `advancedParams.quality`（服务端 `AdvancedParamsSchema`）。 */
  readonly quality?: string
  /** 图片分辨率档 —— 同上，走 `advancedParams.resolution`。 */
  readonly imageResolution?: string
  /**
   * 发几张。⚠ 本仓 **1 请求 = 1 张**，所以它是**请求数**：`generateNode` 顺序发
   * 这么多枪，每一枪回来各追加一个产出版本。⛔ 不塞进单次请求的载荷 ——
   * `StudioGenerateSchema` 里没有这个字段，塞了服务端也读不到。
   */
  readonly count?: number
  /** 音频：Fish 的 `reference_id`（音色）与 `prosody` 两档。 */
  readonly voiceId?: string
  readonly speed?: number
  readonly volume?: number
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
    // ⚠ `payload.prompt` 已经是**编译后**的台词（`[very angry]…`，编译在
    // `buildV4AudioPayload` 里）。音色与 prosody 是 Fish 的正交字段，跟着一起送。
    return {
      ...base,
      kind: 'audio',
      prompt: payload.prompt,
      ...(payload.voiceId ? { voiceId: payload.voiceId } : {}),
      ...(payload.speed === undefined ? {} : { speed: payload.speed }),
      ...(payload.volume === undefined ? {} : { volume: payload.volume }),
    }
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
    ...(data.params?.quality ? { quality: data.params.quality } : {}),
    ...(data.params?.resolution
      ? { imageResolution: data.params.resolution }
      : {}),
    ...(data.params?.count === undefined ? {} : { count: data.params.count }),
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
        /**
         * 每一枪回来叫一次（张数 > 1 时会叫多次）。
         * ⚠ 调用方**要把回填写在这里**而不是 `.then` 里：`.then` 只拿得到最后
         * 一枪，前面几张会一张都不落。
         */
        onEach?(result: Awaited<ReturnType<typeof inner.generate>>): void
      } = {},
    ) => {
      const plan = planV4Generation(nodeId, graph, {
        ...(options.prompt ? { prompt: options.prompt } : {}),
      })
      if (!plan) return { success: false as const, error: 'noPlan' }
      // ⚠ 档位在**服务端 schema 上收窄**（`AdvancedParamsSchema`），⛔ 不在这里
      // 抄一份档位表：节点上的 `quality` 是自由串（值域跟着模型能力表走），而
      // 发出去的那一份必须落在服务端认的枚举里。收不进去的档**整个不发** ——
      // 半个不认识的档比不发更糟（服务端只会回一句泛泛的 400）。
      const quality = AdvancedParamsSchema.shape.quality.safeParse(plan.quality)
      const imageResolution = AdvancedParamsSchema.shape.resolution.safeParse(
        plan.imageResolution,
      )
      const advancedParams = {
        ...(quality.success && quality.data ? { quality: quality.data } : {}),
        ...(imageResolution.success && imageResolution.data
          ? { resolution: imageResolution.data }
          : {}),
      }
      const runOnce = () =>
        inner.generate(
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
            ...(plan.voiceId ? { voiceId: plan.voiceId } : {}),
            ...(plan.speed === undefined ? {} : { speed: plan.speed }),
            ...(plan.volume === undefined ? {} : { volume: plan.volume }),
            ...(plan.negativePrompt
              ? { negativePrompt: plan.negativePrompt }
              : {}),
            ...(plan.referenceImages?.length
              ? { referenceImages: [...plan.referenceImages] }
              : {}),
            ...(plan.audioUrls?.length
              ? { audioUrls: [...plan.audioUrls] }
              : {}),
            ...(plan.audioBindings?.length
              ? { audioBindings: [...plan.audioBindings] }
              : {}),
            ...(plan.videoUrls?.length
              ? { videoUrls: [...plan.videoUrls] }
              : {}),
            ...(Object.keys(advancedParams).length > 0
              ? { advancedParams }
              : {}),
          },
          options.onJobCreated
            ? { onJobCreated: options.onJobCreated }
            : undefined,
        )

      // ⚠ **顺序**发，⛔ 不并发：并发时 N 个 `onJobCreated` 会互相盖掉节点身上
      // 那一个 `mediaJobId`，刷新之后只剩最后一单能被回填 hook 找回来。
      const times = plan.kind === 'image' ? Math.max(plan.count ?? 1, 1) : 1
      let last = await runOnce()
      options.onEach?.(last)
      for (let i = 1; i < times; i += 1) {
        last = await runOnce()
        options.onEach?.(last)
      }
      return last
    },
    [inner],
  )

  return { ...inner, generateNode, planV4Generation }
}
