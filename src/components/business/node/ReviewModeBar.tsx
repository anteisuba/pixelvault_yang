'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import {
  getMediaReview,
  resolveMediaReviewState,
} from '@/lib/node-media-review'
import { findPreviousVersionUrl } from '@/lib/node-review-queue'
import { cn } from '@/lib/utils'

import { useNodeCanvasActions } from './nodes/v4/NodeV4ActionsBridge'

interface ReviewDraft {
  /** `nodeId::url` —— 换了一张就换一份草稿，不用 effect 重置。 */
  key: string
  reason: string
  promptPatch: string
}

/**
 * 显式审阅模式的模式条（包 6 片 2，②-A）。
 *
 * ── 为什么是一条视口固定的窄条，不是又一个浮层 ─────────────────────
 * `canvas-ui-redesign` 诊断 #2「chrome 吃掉半个屏」与 #3「浮层打架」都盯着这里。
 * 这条只在模式里存在、只占顶部一行，退出即消失；打回后需要输入时才向下展开成
 * 面板。**审核动作本身不在这里** —— 通过 / 打回仍在 `GenerateComposer` 参数条
 * 首位（owner 已拍板的落点，禁改），这条只管推进、计数、出口和打回后的收尾。
 *
 * ── 打回那一屏 ───────────────────────────────────────────────────
 * §4.2 打回**停在原地**，就地展开理由 / 改词；§⑤ 残余用途：旧版与新版并排，用户
 * 直接看得出改词有没有起作用。改词再来发起的生成按 ⑥ 算**助手来源**，结果会重新
 * 回到队列。
 */
export function ReviewModeBar() {
  const t = useTranslations('StudioNode.reviewMode')
  const { reviewMode, applyOp, regenerateForReview } = useNodeCanvasActions()
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const current = reviewMode?.current ?? null
  const node = reviewMode?.currentNode ?? null

  if (!reviewMode?.active || !current || !node) return null

  const state = resolveMediaReviewState(node.data, current.url)
  const isRejected = state === NODE_REVIEW_STATE_IDS.rejected
  const entry = getMediaReview(node.data, current.url)
  const key = `${current.nodeId}::${current.url}`
  const active: ReviewDraft =
    draft?.key === key
      ? draft
      : {
          key,
          reason: entry?.reason ?? '',
          promptPatch: entry?.promptPatch ?? '',
        }
  const previousUrl = findPreviousVersionUrl(node.data, current.url)
  // 打回后才可能没有下一张却仍要继续 —— 那一下是「收尾并结束本轮」。
  const canGoNext = reviewMode.hasNext || reviewMode.currentDecided

  /**
   * 把理由 / 改词写回审核记录 —— 一条 `set_review_state` op。
   *
   * ⚠ 只发**非空**的那几项，所以清空输入不会抹掉已经存下的理由，重新打一段才会
   * 覆盖。那是打回记录的判定语义的一部分（op 执行器与 `rejectMedia` 同款），
   * 本包禁改。
   */
  function commit(next: ReviewDraft) {
    if (!node || !current) return
    void applyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setReviewState,
      target: current.nodeId,
      url: current.url,
      state: NODE_REVIEW_STATE_IDS.rejected,
      ...(next.reason.trim() ? { reason: next.reason.trim() } : {}),
      ...(next.promptPatch.trim()
        ? { promptPatch: next.promptPatch.trim() }
        : {}),
    })
  }

  async function handleRegenerate() {
    if (!current || regenerating) return
    commit(active)
    setRegenerating(true)
    try {
      await regenerateForReview(current.nodeId, active.promptPatch.trim())
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div
      data-testid="canvas-review-mode-bar"
      className="canvas-review-bar pointer-events-auto absolute left-1/2 z-canvas-chrome flex -translate-x-1/2 flex-col gap-2 canvas-glass"
    >
      <div className="flex items-center gap-2">
        <span className="canvas-review-bar-title">{t('title')}</span>
        <span className="canvas-review-bar-count">
          {t('remaining', { count: reviewMode.remaining })}
        </span>
        <span className="canvas-review-bar-sep" aria-hidden />
        <button
          type="button"
          onClick={reviewMode.goPrev}
          disabled={!reviewMode.hasPrev}
          aria-label={t('previous')}
          title={t('previous')}
          className="canvas-review-bar-btn"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={reviewMode.goNext}
          disabled={!canGoNext}
          aria-label={t('next')}
          title={t('next')}
          className="canvas-review-bar-btn"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={reviewMode.exit}
          className="canvas-review-bar-btn canvas-review-bar-btn--text"
        >
          <X className="size-3.5" aria-hidden />
          {t('exit')}
        </button>
      </div>

      {isRejected ? (
        <div className="canvas-review-reject flex flex-col gap-2">
          {/* §⑤ 残余用途：新旧双联。只在真有上一版时出现 —— 没有就诚实地不画，
              不摆一个空框假装有得比。 */}
          {previousUrl ? (
            <div className="flex items-start gap-2">
              <figure className="canvas-review-compare">
                {/* eslint-disable-next-line @next/next/no-img-element -- R2 url, not a static app asset */}
                <img src={previousUrl} alt="" />
                <figcaption>{t('previousVersion')}</figcaption>
              </figure>
              <figure className="canvas-review-compare">
                {/* eslint-disable-next-line @next/next/no-img-element -- R2 url, not a static app asset */}
                <img src={current.url} alt="" />
                <figcaption>{t('currentVersion')}</figcaption>
              </figure>
            </div>
          ) : null}

          <label className="canvas-review-field">
            <span>{t('reasonLabel')}</span>
            <input
              type="text"
              value={active.reason}
              placeholder={t('reasonPlaceholder')}
              onChange={(event) =>
                setDraft({ ...active, reason: event.target.value })
              }
              onBlur={() => commit(active)}
            />
          </label>

          <label className="canvas-review-field">
            <span>{t('promptPatchLabel')}</span>
            <input
              type="text"
              value={active.promptPatch}
              placeholder={t('promptPatchPlaceholder')}
              onChange={(event) =>
                setDraft({ ...active, promptPatch: event.target.value })
              }
              onBlur={() => commit(active)}
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="canvas-review-bar-btn canvas-review-bar-btn--text"
            >
              <RefreshCw
                className={cn('size-3.5', regenerating && 'animate-spin')}
                aria-hidden
              />
              {regenerating ? t('regenerating') : t('regenerate')}
            </button>
            <button
              type="button"
              onClick={reviewMode.goNext}
              disabled={!canGoNext}
              className="canvas-review-bar-btn canvas-review-bar-btn--text"
            >
              {t('next')}
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
