'use client'

/**
 * 「通过 / 打回」两颗审核键的 **v4 落点**（③d-4 从 legacy
 * `CanvasImageSelectionToolbar.MediaReviewButtons` 搬来）。
 *
 * 变的只有**写法**：v3 那份直接 `updateNodeData(nodeId, approveMedia(...))`，
 * 走的是已经删掉的 v3 动作总线；v4 里审核态是一条 op（`set_review_state`），
 * 与助手写审核态**同一张表**，因此也同样可撤销、同样过 schema 校验。
 *
 * ⚠ 通过键在 `approved` 时不渲染、打回键在 `rejected` 时不渲染 —— 但反过来
 * **两颗都消失的情况不存在**：早先对 `approved` 整个返回 null，手滑点了「通过」
 * 就再也退不回来（按钮自己没了）。这条工具条是选中才出现的，不是常年挂着。
 */

import { Check, Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import { resolveMediaReviewState } from '@/lib/node-media-review'
import { resolveReviewTargetUrl } from '@/lib/node-review-queue'
import type { NodeV4Data } from '@/types/node-workflow'

import { ToolbarLabelButton } from '../../CanvasToolbarButton'
import { useNodeCanvasActions } from './NodeV4ActionsBridge'

export interface MediaReviewButtonsV4Props {
  readonly nodeId: string
  readonly data: NodeV4Data
  /**
   * 紧凑档：只出图标、无文字，供生成框用。
   *
   * 「打回」和发送同属「对这一版的处置」，而不是「下一版用什么参数」，所以它贴着
   * 发送键而不是待在选择器那一组里。带文字的「打回」在 376px 的参数条里要吃掉
   * 48px，正是那一行折成两行的主因之一。
   */
  readonly compact?: boolean
}

export function MediaReviewButtonsV4({
  nodeId,
  data,
  compact = false,
}: MediaReviewButtonsV4Props) {
  const t = useTranslations('StudioNode.review')
  const { applyOp, reviewMode } = useNodeCanvasActions()
  /**
   * ⚠ 不能用「这张卡的主媒体」直接当靶子：审阅模式钉住的那一条可能不是它。判据
   * 收在 `resolveReviewTargetUrl` 里（那里写了两层指向不同会怎样）。
   */
  const url = resolveReviewTargetUrl(data, nodeId, reviewMode?.current)
  if (!url) return null
  const state = resolveMediaReviewState(data, url)

  const setState = (next: 'approved' | 'rejected') => {
    void applyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setReviewState,
      target: nodeId,
      url,
      state: next,
    })
  }
  const approve = () => setState(NODE_REVIEW_STATE_IDS.approved)
  const reject = () => setState(NODE_REVIEW_STATE_IDS.rejected)

  if (compact) {
    return (
      <>
        {state === NODE_REVIEW_STATE_IDS.approved ? null : (
          <button
            type="button"
            onClick={approve}
            aria-label={t('approve')}
            title={t('approve')}
            className="canvas-composer-review-btn nodrag"
          >
            <Check className="size-4" aria-hidden />
          </button>
        )}
        {state === NODE_REVIEW_STATE_IDS.rejected ? null : (
          <button
            type="button"
            onClick={reject}
            aria-label={t('reject')}
            title={t('reject')}
            className="canvas-composer-review-btn nodrag"
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
        )}
      </>
    )
  }

  return (
    <>
      {state === NODE_REVIEW_STATE_IDS.approved ? null : (
        <ToolbarLabelButton
          icon={Check}
          label={t('approve')}
          onClick={approve}
        />
      )}
      {state === NODE_REVIEW_STATE_IDS.rejected ? null : (
        <ToolbarLabelButton icon={Undo2} label={t('reject')} onClick={reject} />
      )}
    </>
  )
}
