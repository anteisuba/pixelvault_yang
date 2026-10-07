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
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { z } from 'zod'

import type { AspectRatio } from '@/constants/config'
import { supportsSearchGrounding } from '@/constants/models'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getVideoModelCapabilities,
  snapVideoDuration,
  snapVideoResolution,
} from '@/constants/video-model-capabilities'
import {
  getVideoModelSendContract,
  type ReferenceClipSeconds,
  type VideoReferenceSlots,
} from '@/constants/video-model-send-plan'
import { resolveVideoSendModelId } from '@/constants/video-node-modes'
import type { VideoResolution } from '@/constants/video-options'
import { useNodeMediaGeneration } from '@/hooks/node/use-node-media-generation'
import {
  addNodeSearchGroundingResult,
  clearNodeSearchGrounding,
  finishNodeSearchGrounding,
  startNodeSearchGrounding,
} from '@/hooks/node/use-node-search-grounding'
import { probeMediaDuration } from '@/lib/media-probe'
import {
  buildV4AudioPayload,
  buildV4ImagePayload,
  buildV4VideoPayload,
  readNodeUrl,
  validateV4Slots,
  type V4SlotIssue,
} from '@/lib/node-slot-payload'
import { wrapStoryboardGridPrompt } from '@/lib/storyboard-grid'
import {
  AdvancedParamsSchema,
  type CharacterCardRecord,
  type CharacterImagePick,
} from '@/types'
import { useCharacterLibrary } from '@/hooks/cards/use-character-library'
import {
  mentionedCharacters,
  stripCharacterMentionMarks,
  type NodeCharacterMention,
} from '@/lib/node-character-mentions'
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
  /** 「先搜再画」：卡上开着、型号又支持 —— 走 `advancedParams.searchGrounding`。 */
  readonly searchGrounding?: boolean
  /** 「专属」chip 的其余几项 —— 逐项过 `AdvancedParamsSchema` 后并进 `advancedParams`。 */
  readonly advanced?: Readonly<Record<string, string | number | boolean>>
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
  /** 正文里 @ 了的角色（画布用角色 ④ 第 2 片）与每位带哪几张；服务端卡片总线编进参考图。 */
  readonly characterCardIds?: readonly string[]
  readonly characterImagePicks?: Readonly<
    Record<string, readonly CharacterImagePick[]>
  >
  /** 空数组 = 可以发。⚠ 调用方**必须**看它：`clip` 少于 2 条这类问题在服务端只会
   *  变成一句泛泛的失败。 */
  readonly issues: readonly V4SlotIssue[]
  /**
   * 视频：这一次发送端点的参考容量与时长约束（`getVideoModelSendContract`）。
   * 发送前校验按它数（`preflightV4Plan`），⛔ 不另抄一份上限。
   */
  readonly referenceSlots?: VideoReferenceSlots
  /**
   * 视频：@ 了的角色这一次**额外**带进参考图的张数 —— 与参考轨上已有的同一张图不
   * 重复计（按 url 比；按生成记录挑的图认不出 url，按一张算）。服务端卡片总线在
   * 满额时是**静默不带**她的图，所以要在发送前数清楚。
   */
  readonly characterImageExtras?: readonly {
    readonly name: string
    readonly images: number
  }[]
}

/** 参考视频 / 音频的一段：给人看的名字 + 时长（不知道 = undefined，不拦）。 */
export interface V4PreflightClip {
  readonly name: string
  readonly seconds?: number
}

/**
 * 发送前校验没过的一条。**不发、不扣钱、不改卡**，toast 说清是哪一项、差多少
 * （owner 2026-09-28）。
 */
export type V4PreflightBlocker =
  | { readonly kind: 'slot'; readonly issue: V4SlotIssue }
  | {
      readonly kind: 'tooMany'
      readonly media: 'image' | 'video' | 'audio' | 'total'
      readonly count: number
      readonly max: number
      /** 其中有几张是 @ 的角色带进来的、是谁（只在 image / total 时给）。 */
      readonly characterImages?: number
      readonly characterNames?: readonly string[]
    }
  | { readonly kind: 'audioOnly' }
  | {
      readonly kind: 'clipTooLong' | 'clipTooShort'
      readonly media: 'video' | 'audio'
      readonly name: string
      readonly seconds: number
      readonly limit: number
    }
  | {
      readonly kind: 'totalTooLong'
      readonly media: 'video' | 'audio'
      readonly seconds: number
      readonly max: number
    }

/**
 * 这一次实际要跑的端点。判据只有一条：**载荷里有没有参考项**（参考图 = 除首尾帧
 * 之外的图、参考视频、语音）。有 → 全能参考档，没有 → 关键帧档。
 *
 * ⚠ 与卡上那颗只读的模式 chip（`videoSendMode`）是同一条推法的两侧：一处给人看，
 * 一处决定发哪个端点。⛔ 不许两处各推各的。
 */
function resolveNodeVideoSendModelId(
  model: { readonly modelId: string; readonly adapterType: AI_ADAPTER_TYPES },
  payload: {
    readonly imageUrls: readonly string[]
    readonly keyframeUrls: readonly string[]
    readonly videoUrls: readonly string[]
    readonly audioBindings: readonly unknown[]
  },
  /** @ 了的角色这一镜带几张 —— 服务端会追加进参考图，所以也算「挂了参考项」。 */
  characterImageCount = 0,
): string {
  const hasReference =
    payload.imageUrls.length > payload.keyframeUrls.length ||
    payload.videoUrls.length > 0 ||
    payload.audioBindings.length > 0 ||
    characterImageCount > 0
  return resolveVideoSendModelId(model.modelId, model.adapterType, hasReference)
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
  overrides: {
    readonly prompt?: string
    /** 角色库（认正文里的 @她）。不给 = 这一次不带角色。 */
    readonly characterCards?: readonly CharacterCardRecord[]
  } = {},
): V4GenerationPlan | null {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return null
  if (!data.model?.modelId) return null

  const issues = validateV4Slots(node, graph.edges, graph.nodes)
  // 正文里的 @她：只有会出图 / 出视频的两类卡认（音频没有参考图这一说）。
  const characters =
    data.kind === NODE_MEDIA_KIND_IDS.audio
      ? []
      : mentionedCharacters(
          overrides.prompt ?? data.prompt ?? '',
          overrides.characterCards ?? [],
          data.characterPicks,
        )
  const characterImageCount = characters.reduce(
    (total, character) => total + character.picks.length,
    0,
  )
  const pickedCharacters = characters.filter(
    (character) => character.picks.length > 0,
  )
  const base = {
    modelId: data.model.modelId,
    ...(data.model.apiKeyId ? { apiKeyId: data.model.apiKeyId } : {}),
    ...(characters.length > 0
      ? { characterCardIds: characters.map((character) => character.card.id) }
      : {}),
    ...(pickedCharacters.length > 0
      ? {
          characterImagePicks: Object.fromEntries(
            pickedCharacters.map((character) => [
              character.card.id,
              [...character.picks],
            ]),
          ),
        }
      : {}),
    issues,
  }
  const toModelPrompt = (prompt: string) =>
    stripCharacterMentionMarks(prompt, characters)

  if (data.kind === NODE_MEDIA_KIND_IDS.video) {
    const payload = buildV4VideoPayload({
      nodeId,
      nodes: graph.nodes,
      edges: graph.edges,
      ...((overrides.prompt ?? data.prompt)
        ? { ownPrompt: overrides.prompt ?? data.prompt }
        : {}),
    })
    const sendModelId = resolveNodeVideoSendModelId(
      data.model,
      payload,
      characterImageCount,
    )
    const capabilities = getVideoModelCapabilities(sendModelId)
    const requestedDuration = parseDuration(data.params?.duration)
    const duration =
      typeof requestedDuration === 'number'
        ? snapVideoDuration(sendModelId, requestedDuration)
        : requestedDuration
    const requestedResolution = data.params?.resolution as
      | VideoResolution
      | undefined
    const resolution = requestedResolution
      ? snapVideoResolution(sendModelId, requestedResolution)
      : requestedResolution
    const requestedRatio = data.params?.aspectRatio as AspectRatio | undefined
    const aspectRatio =
      requestedRatio &&
      capabilities.supportedAspectRatios &&
      !capabilities.supportedAspectRatios.includes(requestedRatio)
        ? capabilities.supportedAspectRatios[0]
        : requestedRatio
    return {
      ...base,
      // ⭐ **端点按推出来的模式选**（spec §5「不设模式页签」）：挂了参考项就走
      // 该型号的参考变体（`SEEDANCE_*_REFERENCE`），只有首 / 尾帧就走关键帧那条。
      // 解析不到（这个型号在这条渠道上没有参考变体）时**保留原选择**，⛔ 不回退
      // 到别的端点 —— 回退意味着用户以为在用全能参考、实际发的是首帧请求。
      modelId: sendModelId,
      kind: 'video',
      prompt: toModelPrompt(payload.prompt),
      ...(data.negativePrompt ? { negativePrompt: data.negativePrompt } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(resolution ? { resolution } : {}),
      ...(duration === undefined ? {} : { duration }),
      ...(data.params?.seed === undefined ? {} : { seed: data.params.seed }),
      ...(data.params?.generateAudio === undefined
        ? {}
        : { generateAudio: data.params.generateAudio }),
      referenceImages: payload.imageUrls,
      referenceSlots: getVideoModelSendContract(
        sendModelId,
        data.model.adapterType,
      ).slots,
      characterImageExtras: countCharacterImageExtras(
        characters,
        payload.imageUrls,
      ),
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
  // 九宫格分镜（§3）：只包**发出去的那一份**、只出一张；你写的那句原样留在卡上。
  const storyboardGrid = data.params?.storyboardGrid === true
  const modelPrompt = toModelPrompt(payload.prompt)
  return {
    ...base,
    kind: 'image',
    prompt: storyboardGrid
      ? wrapStoryboardGridPrompt(modelPrompt)
      : modelPrompt,
    ...(data.params?.aspectRatio
      ? { aspectRatio: data.params.aspectRatio as AspectRatio }
      : {}),
    ...(data.params?.quality ? { quality: data.params.quality } : {}),
    ...(data.params?.resolution
      ? { imageResolution: data.params.resolution }
      : {}),
    ...(data.params?.searchGrounding === true &&
    supportsSearchGrounding(data.model.modelId)
      ? { searchGrounding: true }
      : {}),
    ...(data.params?.advanced ? { advanced: data.params.advanced } : {}),
    ...(storyboardGrid
      ? { count: 1 }
      : data.params?.count === undefined
        ? {}
        : { count: data.params.count }),
    referenceImages: payload.referenceUrls,
  }
}

/**
 * @ 了的角色这一次**额外**带进参考图几张：与参考轨上已有的同一张图不重复计。
 * ⚠ 按生成记录挑的图（`generationId`）在客户端认不出 url，按一张算 —— 宁可多数
 *   一张让用户看一眼，⛔ 不少数（少数的下场是服务端静默丢图）。
 */
function countCharacterImageExtras(
  characters: readonly NodeCharacterMention[],
  referenceUrls: readonly string[],
): { name: string; images: number }[] {
  const attached = new Set(referenceUrls)
  return characters.map((character) => ({
    name: character.card.name,
    images: character.picks.filter((pick) => {
      if (!('slotId' in pick)) return true
      const url = character.card.referenceSlots.find(
        (slot) => slot.id === pick.slotId,
      )?.url
      return !url || !attached.has(url)
    }).length,
  }))
}

/**
 * 参考素材的时长差多少才算超 —— 容器时长常带几十毫秒的尾数（15.02s），把它算成
 * 超限会拦下服务商其实会收的片子。边界上的交给服务商判。
 */
const CLIP_SECONDS_TOLERANCE = 0.05

function checkClipSeconds(
  media: 'video' | 'audio',
  clips: readonly V4PreflightClip[],
  limits: ReferenceClipSeconds | undefined,
): V4PreflightBlocker[] {
  if (!limits || clips.length === 0) return []
  const blockers: V4PreflightBlocker[] = []
  let total = 0
  let known = 0
  for (const clip of clips) {
    if (clip.seconds === undefined) continue
    total += clip.seconds
    known += 1
    if (clip.seconds > limits.perClipMax + CLIP_SECONDS_TOLERANCE) {
      blockers.push({
        kind: 'clipTooLong',
        media,
        name: clip.name,
        seconds: clip.seconds,
        limit: limits.perClipMax,
      })
    } else if (clip.seconds < limits.perClipMin - CLIP_SECONDS_TOLERANCE) {
      blockers.push({
        kind: 'clipTooShort',
        media,
        name: clip.name,
        seconds: clip.seconds,
        limit: limits.perClipMin,
      })
    }
  }
  // 只加读得出来的那几段：加起来已经超了就一定超，读不出的不会让它变少。
  // ⚠ 只有一段、而它已经单段超长时不再报「总长超了」—— 同一个原因不说两遍。
  const onlyClipTooLong =
    known === 1 && blockers.some((blocker) => blocker.kind === 'clipTooLong')
  if (total > limits.total + CLIP_SECONDS_TOLERANCE && !onlyClipTooLong) {
    blockers.push({
      kind: 'totalTooLong',
      media,
      seconds: total,
      max: limits.total,
    })
  }
  return blockers
}

/**
 * 发送前校验（owner 2026-09-28：不发送 + 说清哪一项超了多少）。**纯函数**。
 *
 * 返回**全部**问题（与 `validateV4Slots` 同一条理由：一次看完还差什么）。
 * ⚠ 数量与时长只查视频：图片卡的角色超额有设计好的降级（改写外观描述，见
 *   `card-bus-compile` 的 `budget`），视频出口满额却是静默不带她的图。
 * ⚠ 上限一律读 `plan.referenceSlots`（发送合同），⛔ 不在这里另抄数字；合同没写
 *   的（`images: undefined` / 没有时长约束）就不查。
 */
export function preflightV4Plan(
  plan: V4GenerationPlan,
  clips: {
    readonly video?: readonly V4PreflightClip[]
    readonly audio?: readonly V4PreflightClip[]
  } = {},
): V4PreflightBlocker[] {
  const blockers: V4PreflightBlocker[] = plan.issues.map((issue) => ({
    kind: 'slot' as const,
    issue,
  }))
  const slots = plan.referenceSlots
  if (plan.kind !== 'video' || !slots) return blockers

  const extras = (plan.characterImageExtras ?? []).filter(
    (entry) => entry.images > 0,
  )
  const characterImages = extras.reduce((sum, entry) => sum + entry.images, 0)
  const characterNames = extras.map((entry) => entry.name)
  const withCharacters =
    characterImages > 0 ? { characterImages, characterNames } : {}
  const images = (plan.referenceImages?.length ?? 0) + characterImages
  const videos = plan.videoUrls?.length ?? 0
  const audio = plan.audioUrls?.length ?? 0

  if (slots.images !== undefined && images > slots.images) {
    blockers.push({
      kind: 'tooMany',
      media: 'image',
      count: images,
      max: slots.images,
      ...withCharacters,
    })
  }
  if (videos > slots.videos) {
    blockers.push({
      kind: 'tooMany',
      media: 'video',
      count: videos,
      max: slots.videos,
    })
  }
  if (audio > slots.audio) {
    blockers.push({
      kind: 'tooMany',
      media: 'audio',
      count: audio,
      max: slots.audio,
    })
  }
  const total = images + videos + audio
  if (slots.total !== undefined && total > slots.total) {
    blockers.push({
      kind: 'tooMany',
      media: 'total',
      count: total,
      max: slots.total,
      ...withCharacters,
    })
  }
  if (slots.audioRequiresVisual && audio > 0 && images + videos === 0) {
    blockers.push({ kind: 'audioOnly' })
  }
  return [
    ...blockers,
    ...checkClipSeconds('video', clips.video ?? [], slots.videoSeconds),
    ...checkClipSeconds('audio', clips.audio ?? [], slots.audioSeconds),
  ]
}

/**
 * 这一枪的参考视频 / 音频各是哪一段、多长 —— 按发送顺序，名字用卡上的名字。
 *
 * ⚠ 只在合同有时长约束时才去读：没有约束的模型不值得为它多打一次网络。
 * 节点身上有 `durationSec` 就用它；没有（手传的片子）就现读元数据，读不出 = 不知道。
 */
async function resolvePreflightClips(
  plan: V4GenerationPlan,
  nodes: readonly NodeV4[],
): Promise<{ video: V4PreflightClip[]; audio: V4PreflightClip[] }> {
  const slots = plan.referenceSlots
  const read = async (
    urls: readonly string[] | undefined,
    kind: 'video' | 'audio',
    wanted: boolean,
  ): Promise<V4PreflightClip[]> => {
    if (!wanted || !urls?.length) return []
    return Promise.all(
      urls.map(async (url, index) => {
        const source = nodes.find((node) => readNodeUrl(node.data) === url)
        const known =
          source && 'durationSec' in source.data
            ? source.data.durationSec
            : undefined
        const seconds =
          typeof known === 'number' && known > 0
            ? known
            : ((await probeMediaDuration(url, kind)) ?? undefined)
        return {
          name: source?.data.name ?? `#${index + 1}`,
          ...(seconds === undefined ? {} : { seconds }),
        }
      }),
    )
  }
  const [video, audio] = await Promise.all([
    read(plan.videoUrls, 'video', Boolean(slots?.videoSeconds)),
    read(plan.audioUrls, 'audio', Boolean(slots?.audioSeconds)),
  ])
  return { video, audio }
}

/** v3 那个钩子的 v4 外壳：多一个「按槽装配」的入口，其余原样透传。 */
export function useNodeMediaGenerationV4() {
  const inner = useNodeMediaGeneration()
  // 角色库：认正文里的 @她（画布用角色 ④ 第 2 片）。卡片、快捷键、助手三条入口都走这里。
  const { cards: characterCards } = useCharacterLibrary()
  const t = useTranslations('StudioNode.v4')

  /** 一条发送前拦截 → 用户看得懂的一句（哪一项、差多少）。 */
  const describeBlocker = useCallback(
    (blocker: V4PreflightBlocker): string => {
      const seconds = (value: number) => Math.round(value * 10) / 10
      switch (blocker.kind) {
        case 'slot':
          return t(`preflight.slot.${blocker.issue.issue}`, {
            slot: t(`slots.${blocker.issue.slot}`),
          })
        case 'tooMany':
          // 上限是 0 = 这个端点压根不收这类参考（关键帧档挂了视频）：说「不收」，
          // ⛔ 不说「最多收 0 段」。
          if (blocker.max === 0)
            return t(`preflight.unsupported.${blocker.media}`)
          return blocker.characterImages
            ? t(`preflight.tooManyWithCharacters.${blocker.media}`, {
                count: blocker.count,
                max: blocker.max,
                characterImages: blocker.characterImages,
                names: (blocker.characterNames ?? [])
                  .map((name) => `@${name}`)
                  .join(t('preflight.nameSeparator')),
              })
            : t(`preflight.tooMany.${blocker.media}`, {
                count: blocker.count,
                max: blocker.max,
              })
        case 'audioOnly':
          return t('preflight.audioOnly')
        case 'clipTooLong':
        case 'clipTooShort':
          return t(`preflight.${blocker.kind}.${blocker.media}`, {
            name: blocker.name,
            seconds: seconds(blocker.seconds),
            limit: blocker.limit,
          })
        case 'totalTooLong':
          return t(`preflight.totalTooLong.${blocker.media}`, {
            seconds: seconds(blocker.seconds),
            max: blocker.max,
          })
      }
    },
    [t],
  )

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
        characterCards,
      })
      if (!plan) return { success: false as const, error: 'noPlan' }
      // ⭐ 发送前校验（owner 2026-09-28）：没过就**不发、不扣钱、不改卡**，一闪而过
      // 的提示说清哪一项、差多少。⚠ 在这里拦而不是在各个调用方：卡片提示词栏、
      // 快捷键、助手、审阅重跑都走这一个入口，拦在调用方总会漏一条。
      // ⚠ 被拦下时**不叫 `onEach`**：调用方的失败分支都写在那里（会把错误钉在卡上），
      //   而这不是一次失败的生成 —— 它根本没发出去。
      const blockers = preflightV4Plan(
        plan,
        await resolvePreflightClips(plan, graph.nodes),
      )
      if (blockers.length > 0) {
        const first = describeBlocker(blockers[0]!)
        toast.warning(
          blockers.length > 1
            ? t('preflight.blockedMore', {
                reason: first,
                more: blockers.length - 1,
              })
            : t('preflight.blocked', { reason: first }),
        )
        return {
          success: false as const,
          error: 'blocked',
          blocked: blockers,
        }
      }
      // ⚠ 档位在**服务端 schema 上收窄**（`AdvancedParamsSchema`），⛔ 不在这里
      // 抄一份档位表：节点上的 `quality` 是自由串（值域跟着模型能力表走），而
      // 发出去的那一份必须落在服务端认的枚举里。收不进去的档**整个不发** ——
      // 半个不认识的档比不发更糟（服务端只会回一句泛泛的 400）。
      const quality = AdvancedParamsSchema.shape.quality.safeParse(plan.quality)
      const imageResolution = AdvancedParamsSchema.shape.resolution.safeParse(
        plan.imageResolution,
      )
      // 专属那几项逐项收：认不出的那一项不发，⛔ 不连累其余几项。画质 / 清晰度 /
      // 先搜再画各有自己的字段，这里不让它们被覆盖。
      const shape = AdvancedParamsSchema.shape as Record<string, z.ZodType>
      const advanced = Object.fromEntries(
        Object.entries(plan.advanced ?? {}).filter(
          ([key, value]) =>
            key !== 'quality' &&
            key !== 'resolution' &&
            key !== 'searchGrounding' &&
            shape[key]?.safeParse(value).success === true,
        ),
      )
      const advancedParams = {
        ...advanced,
        ...(quality.success && quality.data ? { quality: quality.data } : {}),
        ...(imageResolution.success && imageResolution.data
          ? { resolution: imageResolution.data }
          : {}),
        ...(plan.searchGrounding ? { searchGrounding: true } : {}),
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
            ...(plan.characterCardIds?.length
              ? { characterCardIds: [...plan.characterCardIds] }
              : {}),
            ...(plan.characterImagePicks
              ? {
                  characterImagePicks: Object.fromEntries(
                    Object.entries(plan.characterImagePicks).map(
                      ([id, picks]) => [id, [...picks]],
                    ),
                  ),
                }
              : {}),
            ...(Object.keys(advancedParams).length > 0
              ? { advancedParams }
              : {}),
          },
          options.onJobCreated
            ? { onJobCreated: options.onJobCreated }
            : undefined,
        )

      // 「先搜再画」的资料只在出图当下、只在内存里：开始时让出资料位，每一枪交回
      // 的来源合起来；没开搜索的一枪把上一次的资料收起。
      if (plan.searchGrounding) startNodeSearchGrounding(nodeId)
      else clearNodeSearchGrounding(nodeId)
      const collect = (result: Awaited<ReturnType<typeof runOnce>>) => {
        if (result.success && result.searchGrounding) {
          addNodeSearchGroundingResult(nodeId, result.searchGrounding)
        }
        options.onEach?.(result)
      }

      // ⚠ **顺序**发，⛔ 不并发：并发时 N 个 `onJobCreated` 会互相盖掉节点身上
      // 那一个 `mediaJobId`，刷新之后只剩最后一单能被回填 hook 找回来。
      const times = plan.kind === 'image' ? Math.max(plan.count ?? 1, 1) : 1
      let last = await runOnce()
      collect(last)
      for (let i = 1; i < times; i += 1) {
        last = await runOnce()
        collect(last)
      }
      if (plan.searchGrounding) finishNodeSearchGrounding(nodeId)
      return last
    },
    [inner, characterCards, describeBlocker, t],
  )

  return { ...inner, generateNode, planV4Generation }
}
