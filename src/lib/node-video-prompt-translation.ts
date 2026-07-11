import { parseMentions } from '@/components/business/node/composer/MentionInput'

import type {
  VideoLegendImageKind,
  VideoLegendImageReference,
} from './node-workflow-graph'

/**
 * V-1 发送翻译层（docs/plans/node-video-v1-token-translation.md §改动清单 1）：
 * 把每个具名参考图映射到它在 `referenceImages`（= 发给 fal 的 `image_urls`）里
 * 的最终 1-based 位置。Seedance reference-to-video 只认位置 token
 * `@Image1`/`@Image2`…，不认自定义名字（已核验，见
 * docs/plans/node-video-reference-seedance-design.md §0）——这张映射表是
 * 「创作层名字（用户打的 @弗洛洛 / MentionInput 渲染的 chip）」与「传输层位置
 * （Seedance 实际读的槽位）」之间的桥。
 *
 * 未命名的引用回退到与 composer token / `buildVideoReferenceLegend` 相同的
 * 自动命名（`autoNamePrefix[kind] + 序号`），这样一个已连线但未命名卡片的自动
 * @token（如「@角色1」）也能解析。同名对应多张图（同一身份卡被引用两次）时绑定
 * 第一张图的位置——一个身份一个 token（主图挑选是 V-2 的显式概念；V-1 先按
 * referenceImages 顺序的「首次出现」处理）。
 */
export function buildReferenceImageIndexByName(
  referenceImages: readonly string[],
  imageRefByUrl: ReadonlyMap<string, VideoLegendImageReference>,
  autoNamePrefix: Readonly<Record<VideoLegendImageKind, string>>,
): Map<string, number> {
  const indexByName = new Map<string, number>()
  referenceImages.forEach((url, index) => {
    const ref = imageRefByUrl.get(url)
    if (!ref) return
    const name = ref.name || `${autoNamePrefix[ref.kind]}${index + 1}`
    if (indexByName.has(name)) return
    indexByName.set(name, index + 1)
  })
  return indexByName
}

/**
 * V-1 发送翻译层（§改动清单 2）：把 `prompt` 里能在 `imageIndexByName` 命中的
 * 每个 `@名字` mention 改写成 Seedance 的位置 token `@ImageN`，首次出现追加括号
 * 名字说明（`@Image1（弗洛洛）`），让模型仍读得到 @ImageN 是谁；同名后续 mention
 * 折叠成裸的 `@ImageN`（身份已在首次出现时绑定过）。
 *
 * 复用 MentionInput 的 `parseMentions` 做 @token 边界识别（CJK 名字没有词边界，
 * 见 MentionInput.tsx），不用自造 regex。一个在 `imageIndexByName` 里查无映射的
 * mention（改名后失联 / 没有对应参考图 / 或压根是 @AudioN、@VideoN——那两个已经
 * 是位置 token，不在本函数的翻译范围内）原样保留：本函数只翻译能解析的名字，绝
 * 不臆造绑定。
 *
 * 纯函数——这是「发送那一刻」的副本。节点存的 prompt / MentionInput 渲染的内容
 * 完全不受影响，只在组装发给生成服务的 payload 时调用它。
 */
export function translatePromptTokensToPositional(
  prompt: string,
  imageIndexByName: ReadonlyMap<string, number>,
): string {
  if (!prompt || imageIndexByName.size === 0) return prompt

  const knownNames = Array.from(imageIndexByName.keys())
  const seenIndices = new Set<number>()
  let translated = ''

  for (const segment of parseMentions(prompt, knownNames)) {
    if (segment.type === 'text') {
      translated += segment.text
      continue
    }
    const index = imageIndexByName.get(segment.name)
    if (index === undefined) {
      // parseMentions only ever emits a token segment for a name it found in
      // knownNames, so this is unreachable in practice — kept as a
      // no-invention guard rather than assuming the map lookup always hits.
      translated += `@${segment.name}`
      continue
    }
    const isFirstUse = !seenIndices.has(index)
    seenIndices.add(index)
    translated += isFirstUse
      ? `@Image${index}（${segment.name}）`
      : `@Image${index}`
  }

  return translated
}
