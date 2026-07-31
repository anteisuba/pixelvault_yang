import { describe, expect, it } from 'vitest'

import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import {
  approveMedia,
  canAssistantSetReviewState,
  isMediaApprovedForDownstream,
  markMediaAwaitingReview,
  rejectMedia,
  resolveMediaReviewState,
} from '@/lib/node-media-review'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

const BASE: NodeWorkflowNodeData = {
  prompt: '',
  status: 'idle',
} as NodeWorkflowNodeData

function withReview(
  entries: NonNullable<NodeWorkflowNodeData['mediaReview']>,
): NodeWorkflowNodeData {
  return { ...BASE, mediaReview: entries }
}

describe('node media review', () => {
  describe('祖父条款 —— 查不到就是通过', () => {
    it('treats a node with no mediaReview at all as approved', () => {
      // 每一个本包上线之前保存的项目都是这个形状。反过来设计（查不到＝待审）
      // 会让所有存量项目的所有图当场停止喂下游，是一次全站回归。
      expect(resolveMediaReviewState(BASE, 'https://cdn/a.png')).toBe(
        NODE_REVIEW_STATE_IDS.approved,
      )
      expect(isMediaApprovedForDownstream(BASE, 'https://cdn/a.png')).toBe(true)
    })

    it('treats an untracked url as approved even when siblings are tracked', () => {
      // 同一个节点上，新生成的图被标了待审，旧图仍然照常喂下游。
      const data = withReview({
        'https://cdn/new.png': {
          state: NODE_REVIEW_STATE_IDS.awaitingReview,
        },
      })
      expect(isMediaApprovedForDownstream(data, 'https://cdn/old.png')).toBe(
        true,
      )
      expect(isMediaApprovedForDownstream(data, 'https://cdn/new.png')).toBe(
        false,
      )
    })

    it('treats a missing url as approved rather than throwing', () => {
      expect(resolveMediaReviewState(BASE, undefined)).toBe(
        NODE_REVIEW_STATE_IDS.approved,
      )
    })
  })

  describe('硬规则 —— 只有 approved 能进下游', () => {
    it.each([
      [NODE_REVIEW_STATE_IDS.awaitingReview, false],
      [NODE_REVIEW_STATE_IDS.rejected, false],
      [NODE_REVIEW_STATE_IDS.approved, true],
    ])('%s → allowed=%s', (state, allowed) => {
      const data = withReview({ 'https://cdn/a.png': { state } })
      expect(isMediaApprovedForDownstream(data, 'https://cdn/a.png')).toBe(
        allowed,
      )
    })
  })

  describe('标记', () => {
    it('marks a generated url as awaiting review without touching siblings', () => {
      const data = withReview({
        'https://cdn/old.png': { state: NODE_REVIEW_STATE_IDS.rejected },
      })
      const patch = markMediaAwaitingReview(data, 'https://cdn/new.png')
      expect(patch.mediaReview).toEqual({
        'https://cdn/old.png': { state: NODE_REVIEW_STATE_IDS.rejected },
        'https://cdn/new.png': { state: NODE_REVIEW_STATE_IDS.awaitingReview },
      })
    })

    it('keeps the reject payload on reject and clears it on approve', () => {
      const rejected = rejectMedia(BASE, 'https://cdn/a.png', {
        reason: '脸不对',
        promptPatch: '换成短发',
        reviewedAt: '2026-07-31T12:00:00.000Z',
      })
      expect(rejected.mediaReview?.['https://cdn/a.png']).toEqual({
        state: NODE_REVIEW_STATE_IDS.rejected,
        reason: '脸不对',
        promptPatch: '换成短发',
        reviewedAt: '2026-07-31T12:00:00.000Z',
      })

      // 通过之后不该还挂着上一次的驳回词。
      const approved = approveMedia(
        withReview(rejected.mediaReview ?? {}),
        'https://cdn/a.png',
        { reviewedAt: '2026-07-31T12:05:00.000Z' },
      )
      expect(approved.mediaReview?.['https://cdn/a.png']).toEqual({
        state: NODE_REVIEW_STATE_IDS.approved,
        reviewedAt: '2026-07-31T12:05:00.000Z',
      })
    })

    it('never deletes the media itself when rejecting', () => {
      // §5-W3「保留上一版媒体 URL 作对比（不立刻删 R2）」——打回只改状态。
      const patch = rejectMedia(BASE, 'https://cdn/a.png', { reason: 'x' })
      expect(patch).not.toHaveProperty('mediaUrl')
      expect(patch).not.toHaveProperty('imageUrl')
      expect(Object.keys(patch)).toEqual(['mediaReview'])
    })

    it('is a no-op for a missing url instead of writing an undefined key', () => {
      expect(markMediaAwaitingReview(BASE, undefined)).toEqual({})
      expect(rejectMedia(BASE, '', { reason: 'x' })).toEqual({})
    })
  })

  describe('助手不得自批（Q4 钉死无开关）', () => {
    it('lets the assistant set awaiting_review / rejected but never approved', () => {
      expect(
        canAssistantSetReviewState(NODE_REVIEW_STATE_IDS.awaitingReview),
      ).toBe(true)
      expect(canAssistantSetReviewState(NODE_REVIEW_STATE_IDS.rejected)).toBe(
        true,
      )
      // 防确认偏差：制作者自检必然放水，放行只能由人做。
      expect(canAssistantSetReviewState(NODE_REVIEW_STATE_IDS.approved)).toBe(
        false,
      )
    })
  })
})
