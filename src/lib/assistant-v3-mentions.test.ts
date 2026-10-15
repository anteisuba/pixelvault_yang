import { describe, expect, it } from 'vitest'

import { ASSISTANT_MENTION_LIMITS } from '@/constants/assistant-mention'
import { renderAssistantV3MentionTable } from '@/lib/assistant-v3-mentions'
import type { AssistantMentionRef } from '@/types/assistant-mention'

/**
 * v3 板子上的「`@` 对照表」（设计方案 §10b · 附录 G §9.3）：名字 → 句柄，按 id 解析
 * 好的；看图上限与面板同一个数。
 */

const onBoard: AssistantMentionRef = {
  kind: 'image',
  id: 'n1',
  label: '镜头1',
  scope: 'canvas',
  nodeId: 'n1',
}
const attachedLibrary: AssistantMentionRef = {
  kind: 'image',
  id: 'g1',
  label: '图_001',
  scope: 'library',
  generationId: 'g1',
  seq: 1,
}
const elsewhere: AssistantMentionRef = {
  kind: 'video',
  id: 'g2',
  label: '视频_002',
  scope: 'library',
  generationId: 'g2',
  seq: 2,
  role: 'first_frame',
}

describe('renderAssistantV3MentionTable', () => {
  it('⭐ 板子上的写句柄，附上的图写第几张，其余写清是什么、不在板上', () => {
    const table = renderAssistantV3MentionTable({
      mentions: [onBoard, attachedLibrary, elsewhere],
      attachedLabels: ['图_001'],
      pointedImageCount: 1,
      handleOf: (mention) => (mention.nodeId === 'n1' ? 'c3' : null),
    })
    expect(table.split('\n')).toEqual([
      "MENTIONED — the creator's @ references, resolved by id (「name」 in their message = this):",
      '  「镜头1」 = c3 (canvas card)',
      '  「图_001」 = attached image 1 (library asset)',
      '  「视频_002」 = video · library asset #2 (not on this board) · use as first frame reference',
    ])
  })

  it(`⭐ 指的图超过 ${ASSISTANT_MENTION_LIMITS.lookImages} 张：板上明说只附了前几张`, () => {
    const cap = ASSISTANT_MENTION_LIMITS.lookImages
    const table = renderAssistantV3MentionTable({
      mentions: [],
      attachedLabels: [],
      pointedImageCount: cap + 2,
      handleOf: () => null,
    })
    expect(table).toBe(
      `LOOK CAP — the creator pointed at ${cap + 2} images; only the first ${cap} are attached. Say so if the rest matter.`,
    )
  })

  it('什么都没 @、也没超上限 = 空串（板子不多一行）', () => {
    expect(
      renderAssistantV3MentionTable({
        mentions: [],
        attachedLabels: [],
        pointedImageCount: ASSISTANT_MENTION_LIMITS.lookImages,
        handleOf: () => null,
      }),
    ).toBe('')
  })
})
