'use client'

import { useId, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronRight, EyeOff } from '@/components/icons'

import { ASSISTANT_ROUND_SUMMARY_LIMITS } from '@/constants/assistant-operator'
import type { AssistantOperatorRoundSummary } from '@/types/assistant-operator'
import { cn } from '@/lib/utils'
import type { NamedImageReference } from '@/lib/studio-reference-mentions'
import { StudioOperatorReferenceText } from './StudioOperatorMessageBody'

/** 三栏的栏名 —— ⚠ 同时是 `data-column` 的取值，测试与真机目检按它取。 */
export const STUDIO_OPERATOR_ROUND_COLUMNS = [
  'facts',
  'decisions',
  'todos',
] as const

export type StudioOperatorRoundColumn =
  (typeof STUDIO_OPERATOR_ROUND_COLUMNS)[number]

export type StudioOperatorRoundColumns = Pick<
  AssistantOperatorRoundSummary,
  StudioOperatorRoundColumn
>

/** 续跑那一档（§3.6）—— 形态与 checkpoint 薄卡上那一颗逐字同源。 */
export interface StudioOperatorRoundResume {
  /** 1 起数，写在按钮上。 */
  stepNumber: number
  /** 挂掉的那一步说了什么；`undefined` = 不是挂的（刷新 / 被 ⏹ 掐掉）。 */
  failedReason?: string
  onResume(): void
}

interface StudioOperatorRoundSummaryProps {
  references?: readonly NamedImageReference[]
  summary: AssistantOperatorRoundSummary
  /**
   * 保存那一下（§7.7）。缺席 = 这一条改不动（只读历史里更旧的那几条），
   * 此时「改」整颗不渲染 —— ⛔ 不画一颗停用的。
   */
  onSave?(columns: StudioOperatorRoundColumns): void
  /** 传入时把证据编号画成可点击的按钮。 */
  onRecallEvidence?(ref: string): void
  /** 缺席表示这一轮没有待续跑的计划。 */
  resume?: StudioOperatorRoundResume
  /** 首次渲染就折起来（载回来的历史用它，⛔ 不影响用户之后的开合）。 */
  defaultCollapsed?: boolean
}

/**
 * 一栏的文本框 ↔ 条目数组。
 *
 * ⚠ **一行一条**：换行是用户手上唯一不用学的分隔符。收窄（≤3 条、每条 ≤60 字）
 * 与协议那一份逐字同源（`ROUND_LIMITS`）—— 在这里截而不是让服务端拒：拒了之后
 * 用户面对的是一句「保存失败」，而他并不知道自己多写了一条。
 */
function toColumnText(entries: readonly string[]): string {
  return entries.join('\n')
}

function fromColumnText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, ASSISTANT_ROUND_SUMMARY_LIMITS.maxEntriesPerColumn)
    .map((line) => line.slice(0, ASSISTANT_ROUND_SUMMARY_LIMITS.maxEntryChars))
}

export function StudioOperatorRoundSummary({
  summary,
  references,
  onSave,
  onRecallEvidence,
  resume,
  defaultCollapsed = true,
}: StudioOperatorRoundSummaryProps) {
  const t = useTranslations('StudioOperator.roundSummary')
  const tResume = useTranslations('StudioOperator.resume')
  const format = useFormatter()
  const detailsId = useId()
  /** ⚠ 挂着续跑时**不收**：「从第 N 步继续」那颗 chip 在展开区里，收起来就找不到了。 */
  const [collapsed, setCollapsed] = useState(defaultCollapsed && !resume)
  const [draft, setDraft] = useState<Record<
    StudioOperatorRoundColumn,
    string
  > | null>(null)

  const openDraft = () => {
    setCollapsed(false)
    setDraft({
      facts: toColumnText(summary.facts),
      decisions: toColumnText(summary.decisions),
      todos: toColumnText(summary.todos),
    })
  }

  const count =
    summary.facts.length + summary.decisions.length + summary.todos.length
  const time = format.dateTime(new Date(summary.createdAt), {
    hour: '2-digit',
    minute: '2-digit',
  })
  const heading = t('heading', { time })

  /* ── 编辑态（画板 BCards「编辑态」）────────────────────────────── */
  if (draft) {
    return (
      <div
        data-testid="operator-round-summary"
        data-state="editing"
        data-round={summary.roundIndex}
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{heading}</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          {STUDIO_OPERATOR_ROUND_COLUMNS.map((column) => (
            <label key={column} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t(`column.${column}`)}
              </span>
              <textarea
                data-testid="operator-round-input"
                data-column={column}
                rows={ASSISTANT_ROUND_SUMMARY_LIMITS.maxEntriesPerColumn}
                value={draft[column]}
                onChange={(event) =>
                  setDraft({ ...draft, [column]: event.target.value })
                }
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="operator-round-cancel"
            onClick={() => setDraft(null)}
            className="min-h-11 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            data-testid="operator-round-save"
            onClick={() => {
              onSave?.({
                facts: fromColumnText(draft.facts),
                decisions: fromColumnText(draft.decisions),
                todos: fromColumnText(draft.todos),
              })
              setDraft(null)
            }}
            className="min-h-11 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors duration-(--duration-fast) ease-standard hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {t('save')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="operator-round-summary"
      data-state={collapsed ? 'collapsed' : 'expanded'}
      data-round={summary.roundIndex}
      data-edited={summary.editedByUser ? 'true' : 'false'}
      className={cn('min-w-0 rounded-xl', !collapsed && 'bg-muted/40 pt-1')}
    >
      <button
        type="button"
        data-testid="operator-round-toggle"
        aria-expanded={!collapsed}
        aria-controls={detailsId}
        onClick={() => setCollapsed(!collapsed)}
        /* D12 A · C4：四种记录统一成同一种 12 号灰字一行，**默认收起**。 */
        className="flex w-fit items-center gap-1.5 rounded-sm py-0.5 text-left text-xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <span className="min-w-0">{t('collapsed', { count })}</span>
        <ChevronRight
          className={cn(
            'size-3 shrink-0 transition-transform duration-(--duration-fast) motion-reduce:transition-none',
            !collapsed && 'rotate-90',
          )}
          aria-hidden
        />
      </button>
      <div id={detailsId} hidden={collapsed}>
        {!collapsed ? (
          <div className="flex flex-col gap-4 px-4 pb-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{heading}</span>
              {summary.editedByUser ? (
                <span data-testid="operator-round-edited">{t('edited')}</span>
              ) : null}
              {summary.incognito ? (
                <span
                  data-testid="operator-round-incognito"
                  className="inline-flex items-center gap-1"
                >
                  <EyeOff className="size-3.5" aria-hidden />
                  {t('incognito')}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-4">
              {STUDIO_OPERATOR_ROUND_COLUMNS.map((column) =>
                summary[column].length > 0 ? (
                  <div
                    key={column}
                    data-testid="operator-round-column"
                    data-column={column}
                    className="flex flex-col gap-1"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(`column.${column}`)}
                    </span>
                    <ul className="flex list-none flex-col gap-1 text-sm leading-relaxed text-foreground">
                      {summary[column].map((entry, index) => (
                        <li
                          key={index}
                          className="break-words [overflow-wrap:anywhere]"
                        >
                          <StudioOperatorReferenceText
                            text={entry}
                            references={references}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
            {summary.evidenceRefs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {summary.evidenceRefs.map((ref) =>
                  onRecallEvidence ? (
                    <button
                      key={ref}
                      type="button"
                      data-testid="operator-round-evidence"
                      onClick={() => onRecallEvidence(ref)}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-2xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {ref}
                    </button>
                  ) : (
                    <span
                      key={ref}
                      data-testid="operator-round-evidence"
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-2xs text-muted-foreground"
                    >
                      {ref}
                    </span>
                  ),
                )}
              </div>
            ) : null}

            {/* ── 续跑（§3.6：从头部搬到这里的尾部一行）───────────────────
          ⚠ 失败那句原因写在按钮**前面**：先读为什么，再决定要不要继续
            （与 checkpoint 薄卡上那一颗同一条判据）。 */}
            {resume ? (
              <div className="flex flex-wrap items-center gap-2">
                {resume.failedReason ? (
                  <span
                    data-testid="operator-round-resume-reason"
                    className="min-w-0 flex-1 text-xs text-muted-foreground"
                    title={resume.failedReason}
                  >
                    {tResume('failed', { reason: resume.failedReason })}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1" />
                )}
                <button
                  type="button"
                  data-testid="operator-round-resume"
                  data-step={resume.stepNumber}
                  onClick={resume.onResume}
                  className="min-h-11 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-2sm font-medium text-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tResume('continue', { step: resume.stepNumber })}
                </button>
              </div>
            ) : null}
            {onSave ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid="operator-round-edit"
                  onClick={openDraft}
                  className="min-h-11 rounded-lg px-3 py-2 text-2sm font-medium text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  {t('edit')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
