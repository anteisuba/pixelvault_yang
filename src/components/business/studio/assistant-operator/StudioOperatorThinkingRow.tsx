'use client'

/**
 * **等第一个字时那一行**（2026-10-14 设计方案 §9.1 · 附录 F）。
 *
 * ── 一行的四个阶段 ─────────────────────────────────────────────
 *  · 发送后 `< thinkingRevealMs`：**什么都不画**（只留一行高）—— 一秒内就回话的那一轮
 *    ⛔ 不闪一下「正在想…」。行本身（头像那一格）照旧发送即落，那是「收到了」的凭证。
 *  · 之后：一颗呼吸点 + 扫光字「正在想…」+ 已等秒数。
 *  · `≥ thinkingSlowMs`：下面多一句慢提示（「比平时久一点」）—— 让人知道不是卡死了。
 *  · 画布接力那一跳（`landing`）：字换成「正在画布上落地…」。
 *
 * ⚠ 秒数是**本地计时**（`since` 由 store 在占位行挂上那一刻写下）：⛔ 不进 store、
 *   ⛔ 不每半秒 emit 一次整份状态 —— 只有这一行在跳。
 * ⚠ `since` 缺席（老条目 / 单测直接造的占位行）= 立刻露字、不带秒数。
 * ⚠ 减少动效：呼吸点静止（`motion-reduce:animate-none`），扫光退回静态灰字
 *   （`.assistant-shimmer-text` 自带的 reduced-motion 分支）。
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'

export function StudioOperatorThinkingRow({
  since,
  landing = false,
}: {
  /** 占位行挂上的那一刻（ms）。 */
  since?: number
  /** 画布接力那一跳。 */
  landing?: boolean
}) {
  const t = useTranslations('StudioOperator.streaming')
  /**
   * ⚠ 初值取 `since` 而不是 `Date.now()`：渲染期⛔ 不读时钟（同一份输入要画出同一行）。
   * 代价是重新挂载后最多晚半秒才露字 —— 比一次闪烁便宜。
   */
  const [now, setNow] = useState(since ?? 0)

  useEffect(() => {
    if (since === undefined) return
    const timer = setInterval(
      () => setNow(Date.now()),
      STUDIO_OPERATOR_STREAMING.thinkingTickMs,
    )
    return () => clearInterval(timer)
  }, [since])

  const elapsed = since === undefined ? null : Math.max(0, now - since)
  const revealed =
    elapsed === null || elapsed >= STUDIO_OPERATOR_STREAMING.thinkingRevealMs
  const slow =
    elapsed !== null && elapsed >= STUDIO_OPERATOR_STREAMING.thinkingSlowMs

  return (
    <div className="flex min-w-0 flex-col">
      <p
        data-testid="operator-message-pending"
        data-revealed={revealed ? 'true' : 'false'}
        {...(landing ? { 'data-phase': 'landing' } : {})}
        /* ⚠ 高度 = 一行正文高（`h-6`）：露字与第一个字到达时这一行都不跳。 */
        className="flex h-6 items-center gap-2 text-xs"
      >
        {revealed ? (
          <>
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-foreground animate-assistant-breathe motion-reduce:animate-none"
            />
            <span className="assistant-shimmer-text">
              {landing ? t('landing') : t('thinking')}
            </span>
            {elapsed !== null ? (
              <span
                data-testid="operator-message-pending-seconds"
                className="font-mono tabular-nums text-muted-foreground"
              >
                {t('seconds', { count: Math.floor(elapsed / 1000) })}
              </span>
            ) : null}
          </>
        ) : null}
      </p>
      {slow ? (
        <p
          data-testid="operator-message-slow"
          className="text-2xs leading-4 text-muted-foreground"
        >
          {t('slow')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 第一个字到达之后，正文上方那句「想了 N 秒」（§9.1：思考结束后变成回执）。
 * ⚠ 不到 `thinkingRevealMs` 的那一轮⛔ 不画：那时用户什么都没看到过，回执是噪音。
 * ⚠ 没有思考摘要可展开 —— 供应商的推理帧没接（附录 A：v3 只转发 text-delta），
 *   这一行因此只是一句回执，⛔ 不画一颗点开什么都没有的展开键。
 */
export function StudioOperatorThoughtReceipt({
  thoughtMs,
}: {
  thoughtMs?: number
}) {
  const t = useTranslations('StudioOperator.streaming')
  if (
    thoughtMs === undefined ||
    thoughtMs < STUDIO_OPERATOR_STREAMING.thinkingRevealMs
  )
    return null
  return (
    <p
      data-testid="operator-message-thought"
      className="text-2xs leading-4 text-muted-foreground"
    >
      {t('thought', { count: Math.round(thoughtMs / 1000) })}
    </p>
  )
}
