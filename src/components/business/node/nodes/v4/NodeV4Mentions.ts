/**
 * 画布节点 → `MentionInput` 认的两份清单（`tokens` 渲染胶囊、`candidates` 供 `@` 下拉）。
 *
 * ⚠ 文本节点**不是引用物种**（owner 2026-08-10 定，见 `MentionInput.MentionToken`
 * 的注释）：`@` 菜单里点一个文本节点是把它的正文**原文粘进来**，粘完就是普通文字，
 * 没有 token、没有胶囊。所以它只进 `candidates`，⛔ 不进 `tokens`。
 */

import type {
  MentionCandidate,
  MentionToken,
} from '@/components/ui/mention-input'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { formatShotDisplayName } from '@/lib/node-display-name'
import type { NodeV4 } from '@/types/node-workflow'

/** 节点 → 胶囊的族。⛔ 不新造族名：这六个就是 `MentionToken.kind` 的全集。 */
export function mentionKindOf(node: NodeV4): MentionToken['kind'] | null {
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.audio) return 'voice'
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return 'video'
  if (data.kind !== NODE_MEDIA_KIND_IDS.image) return null
  if (data.subtype === 'character') return 'character'
  if (data.subtype === 'background') return 'background'
  return 'shot'
}

/** 显示名：镜头带 `S02·` 前缀，其余就是稳定名。 */
export function mentionNameOf(node: NodeV4): string {
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.video) {
    return formatShotDisplayName(data.label ?? data.name, data.shotNo)
  }
  return data.name
}

export function buildMentionTokens(
  nodes: readonly NodeV4[],
  selfId: string,
): MentionToken[] {
  const tokens: MentionToken[] = []
  for (const node of nodes) {
    if (node.id === selfId) continue
    const kind = mentionKindOf(node)
    if (!kind) continue
    const url =
      node.data.kind === NODE_MEDIA_KIND_IDS.text ? undefined : node.data.url
    tokens.push({
      name: mentionNameOf(node),
      kind,
      ...(url ? { thumbnailUrl: url } : {}),
    })
  }
  return tokens
}

export function buildMentionCandidates(
  nodes: readonly NodeV4[],
  selfId: string,
  groupLabelOf: (node: NodeV4) => string,
): MentionCandidate[] {
  return nodes
    .filter((node) => node.id !== selfId)
    .map((node) => ({
      id: node.id,
      name: mentionNameOf(node),
      groupLabel: groupLabelOf(node),
      // 名额按 kind 分族——一族素材占满名额会把文本候选饿死（见 MentionCandidate
      // 的 `group` 注释里那次实拍）。
      group: node.data.kind,
      // 文本节点先看一眼再点：它的名字说不出正文里写了什么。
      ...(node.data.kind === NODE_MEDIA_KIND_IDS.text
        ? { preview: node.data.body.slice(0, 200) }
        : {}),
    }))
}
