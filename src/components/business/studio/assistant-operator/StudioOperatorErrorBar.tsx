'use client'

/**
 * 失败那一条 —— **三段**（owner 2026-09-20 真机第 1 条，原话「我甚至不知道为什么
 * 出错」）。
 *
 * ── 为什么从一行字长成三段 ──────────────────────────────────────
 * 此前这里只有第一段：一句按 `errorCode` 取的三语文案。而**说不出分类**的那一族
 * 失败（非 `GenerationError`）全部压成同一句「助手没能完成这次请求」——
 * 用户看不出原因，我们也没有任何一根线能把他那一次和日志里那一条对上。
 *
 *  ① **一句人话** —— 阶梯照旧：操作员自己的码 → `getGenerationErrorMessage`
 *     → 原文；走不到就是「内部错误」（`error.internal`）。
 *  ② **`traceId`** —— 服务端日志里同一个八位短码。它存在的全部意义就是被念出来
 *     / 截图 / 粘过来，所以走等宽槽（`ui-defaults.md §1`：机器串）。
 *  ③ **「复制详情」** —— 一次点击把短码、那句人话与（非生产环境才有的）原始
 *     message 一起进剪贴板。⛔ 不做「展开更多」：要的人是要把它发出来，不是要在
 *     面板里读它。
 *
 * ⚠ **`detail` 只在非生产环境出现**，而判据在**服务端**（成帧器按 `NODE_ENV`
 * 决定下不下发，见 `lib/assistant-operator-stream.ts`）。这里 ⛔ 不自己判环境：
 * 客户端的 `NODE_ENV` 与服务端的是两份，判两遍必然有一天说两句不一样的话。
 * ⚠ 生产环境**永远看不到 stack** —— 帧里根本没有那一项。
 */

import { useEffect, useState } from 'react'
import { Copy, Check } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { StudioOperatorErrorTrace } from '@/types/studio-assistant-operator'

/**
 * 「已复制」停留多久。
 *
 * ⚠ ⛔ 不走 `constants/motion` 的四档：那四档说的是**过渡多长**（120–500ms），
 * 而这是一段**停留** —— 人读完两个字再抬眼确认的时间。仓里另外两处复制反馈
 * （`ImageDetailModal` / `PromptAssistantPanel`）用的也是 2 秒。
 */
const COPIED_DWELL_MS = 2000

interface StudioOperatorErrorBarProps {
  /** 第一段：那句人话（调用方已经过完阶梯）。 */
  text: string
  /** 第二、三段的数据。缺席 = 这一族失败本来就说得出原因，只画第一段。 */
  trace: StudioOperatorErrorTrace | null
}

export function StudioOperatorErrorBar({
  text,
  trace,
}: StudioOperatorErrorBarProps) {
  const t = useTranslations('StudioOperator')
  const [copied, setCopied] = useState(false)

  /** 「已复制」自己退回去 —— ⚠ 卸载时清掉，⛔ 别在已卸载的组件上 setState。 */
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div
      data-testid="operator-error"
      data-trace-id={trace?.traceId}
      className="flex flex-col gap-1 rounded-md border border-status-risk/40 bg-status-risk-surface px-2.5 py-1.5 text-2sm text-status-risk"
    >
      <p>{text}</p>
      {trace ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            data-testid="operator-error-trace"
            className="font-mono text-2xs tabular-nums text-status-risk/80"
          >
            {t('error.traceLabel', { traceId: trace.traceId })}
          </span>
          <button
            type="button"
            data-testid="operator-error-copy"
            onClick={() => {
              void navigator.clipboard
                .writeText(
                  [
                    text,
                    t('error.traceLabel', { traceId: trace.traceId }),
                    trace.detail,
                  ]
                    .filter(Boolean)
                    .join('\n'),
                )
                .then(() => setCopied(true))
            }}
            /* ⚠ 触屏命中区补到 44（`ui-defaults.md §5`）：它横向只有一颗，
               `touch-target-y` 的「只撑高不撑宽」在这里不会压到邻居。 */
            className="touch-target-y inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium text-status-risk transition-colors duration-(--duration-fast) ease-standard hover:bg-status-risk/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied ? t('error.copied') : t('error.copyDetail')}
          </button>
        </div>
      ) : null}
      {/* 非生产环境那一段原始 message —— 见头注：有就画，⛔ 不自己判环境。 */}
      {trace?.detail ? (
        <p
          data-testid="operator-error-detail"
          className="break-words font-mono text-2xs leading-relaxed text-status-risk/80"
        >
          {trace.detail}
        </p>
      ) : null}
    </div>
  )
}
