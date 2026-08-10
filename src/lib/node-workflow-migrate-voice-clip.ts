/**
 * Voice-clip migration (pure, React-free, idempotent).
 *
 * 2026-08-10 域定义（`docs/references/pages/canvas-voice-card.md` §0.5）把音色节点
 * 判成「交付一段参考语音」——一个产物、三种来源。此前同一个事实散在两个字段上：
 * `voiceSampleUrl`（库里的试听 / 现场合成的样本）与 `voiceReferenceAudioUrl`（用户
 * 上传的音频）。每个读的地方都得自己写一遍优先级链，收割层那条就漏了一档，于是
 * 「卡面绿灯却发不出声」。这个迁移把两者收进 `voiceClipUrl`，并补上 `voiceClipSource`。
 *
 * ⛔ 旧字段**留在 Zod schema 里**（见 `types/node-workflow.ts` 上的 @deprecated）：
 * 水化顺序是先 parse 再 migrate，字段一旦不在 schema 里就会在 parse 阶段被 strip，
 * 这里再也读不到 —— 存量项目的声音会静默清零。和 `migrateImageRoles` 保留 `imageUrl`
 * 是同一个理由。
 *
 * 来源判定：上传的音频有 `voiceReferenceAudioUrl` → `uploaded`。`voiceSampleUrl` 分不出
 * 是库里取的还是当场合成的（旧代码两条路写同一个字段），一律归 `library` —— 这两者
 * 对下游完全等价（都是「一段能发的语音」），来源标记只用于**决定要不要显示合成参数**，
 * 而这两种情况都不该显示（那段音频已经录成那样了）。
 *
 * 没有可迁的内容时原样返回同一个引用，所以每次加载都跑是安全的，也能和其它几个
 * 迁移幂等地叠加。
 */

import { NODE_STUDIO_VOICE_CLIP_SOURCE_IDS } from '@/constants/node-studio'
import type { NodeWorkflowNode, NodeWorkflowState } from '@/types/node-workflow'

function readTrimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function migrateNode(node: NodeWorkflowNode): NodeWorkflowNode {
  // 已经收敛过的节点不再动 —— 幂等的关键。
  if (readTrimmed(node.data.voiceClipUrl)) return node

  const uploaded = readTrimmed(node.data.voiceReferenceAudioUrl)
  const sampled = readTrimmed(node.data.voiceSampleUrl)
  const clipUrl = uploaded ?? sampled
  if (!clipUrl) return node

  return {
    ...node,
    data: {
      ...node.data,
      voiceClipUrl: clipUrl,
      voiceClipSource: uploaded
        ? NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded
        : NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library,
    },
  }
}

export function migrateVoiceClip(state: NodeWorkflowState): NodeWorkflowState {
  let changed = false
  const nodes = state.nodes.map((node) => {
    const next = migrateNode(node)
    if (next !== node) changed = true
    return next
  })
  return changed ? { ...state, nodes } : state
}
