'use client'

/**
 * **本轮结论记录**（v2 §7.7 / 画板 Main「本轮结论」· BCards「结论记录」三态）。
 *
 * ⭐ 它是**分隔块不是第六类卡**（§3.2 那五类一个都没有变）：一条全宽的浅底带，
 * 上下各一条细线，左边一颗小清单图标 —— 比任何一张卡都安静。理由写在形状里：
 * 它不是这一轮里发生的又一件事，它是**这一轮到此为止**。画成卡的下场是时间线
 * 上多出一种与其它五类争注意力的东西，而它本该是分节符。
 *
 * ── 三态（画板 BCards）────────────────────────────────────────────
 *  · **默认展开**：三栏（事实 / 决定 / 待办）+ 证据编号 chip 行；
 *  · **折叠一行**：`本轮记住 N 件事 ▾`（N = 三栏条目总数，⛔ 不含证据编号 ——
 *    编号是出处不是「记住的事」，数进去会让一条只查了资料的轮次写着「记住 5 件事」）；
 *  · **编辑态**：三栏变文本框 + 取消 / 保存。
 *
 * ── 为什么给「改」（§7.7）──────────────────────────────────────────
 * 结论是模型压缩出来的，压错一句会一路错下去八轮（下一轮注入读的就是它）。
 * 给一个 10 秒能改完的入口，比让用户在下一轮用一整段话去纠正便宜得多。
 * ⚠ 保存写回的是**库里那一列**并标 `editedByUser`，⛔ 不是只改屏幕上这一份：
 * 回写链路见 `updateAssistantConversationRound`。
 *
 * ⚠ **证据 chip 默认只展示**：§7.7 要的是「点一下滚回那张证据卡并展开」，而
 * 时间线上此刻没有按编号定位证据卡的锚（证据本住在 `ResearchRun`，编号没有对应
 * 的 DOM id）。所以点击能力由调用方以 `onRecallEvidence` 传进来 —— 传了才画成
 * 按钮，⛔ 不摆一颗点了没反应的 chip。
 *
 * ⚠ **续跑 chip 长在这个块的尾部**（§3.6）：它从头部搬过来，判据与 checkpoint
 * 薄卡上那一颗相同 —— 「这一轮到此为止」和「这一轮还没跑完」是同一件事的两面。
 */

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronDown, ClipboardCheck } from 'lucide-react'

import { ASSISTANT_ROUND_SUMMARY_LIMITS } from '@/constants/assistant-operator'
import type { AssistantOperatorRoundSummary } from '@/types/assistant-operator'
import { cn } from '@/lib/utils'

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
  summary: AssistantOperatorRoundSummary
  /**
   * 保存那一下（§7.7）。缺席 = 这一条改不动（只读历史里更旧的那几条），
   * 此时「改」整颗不渲染 —— ⛔ 不画一颗停用的。
   */
  onSave?(columns: StudioOperatorRoundColumns): void
  /** 见头注：传了才把证据编号画成可点的。 */
  onRecallEvidence?(ref: string): void
  /** 见头注；缺席 = 这一轮没有没跑完的计划。 */
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
  onSave,
  onRecallEvidence,
  resume,
  defaultCollapsed = false,
}: StudioOperatorRoundSummaryProps) {
  const t = useTranslations('StudioOperator.roundSummary')
  const tResume = useTranslations('StudioOperator.resume')
  const format = useFormatter()
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [draft, setDraft] = useState<Record<
    StudioOperatorRoundColumn,
    string
  > | null>(null)

  const count =
    summary.facts.length + summary.decisions.length + summary.todos.length
  const time = format.dateTime(new Date(summary.createdAt), {
    hour: '2-digit',
    minute: '2-digit',
  })
  const heading = t('heading', { time })

  const icon = (
    <ClipboardCheck
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden
    />
  )

  /* ── 折叠一行（画板 BCards「折叠 · 一行」）──────────────────────── */
  if (collapsed && !draft) {
    return (
      <div
        data-testid="operator-round-summary"
        data-state="collapsed"
        data-round={summary.roundIndex}
        className="border-y border-border bg-muted/40"
      >
        <button
          type="button"
          data-testid="operator-round-expand"
          onClick={() => setCollapsed(false)}
          className="flex w-full items-center gap-2 px-0.5 py-2.5 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {icon}
          <span className="min-w-0 flex-1 text-2sm text-muted-foreground">
            {t('collapsed', { count })}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </div>
    )
  }

  /* ── 编辑态（画板 BCards「编辑态」）────────────────────────────── */
  if (draft) {
    return (
      <div
        data-testid="operator-round-summary"
        data-state="editing"
        data-round={summary.roundIndex}
        /* 画板 BCards「结论记录 · 编辑态」：raised 那一档 —— 它此刻是当下要你动手的
           那张卡（§12.1）。 */
        className="rounded-xl border border-assistant-line-strong bg-card p-3 shadow-assistant-raised"
      >
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-2xs text-muted-foreground">{heading}</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          {STUDIO_OPERATOR_ROUND_COLUMNS.map((column) => (
            <label key={column} className="flex flex-col gap-1">
              <span className="font-mono text-3xs uppercase tracking-nav text-muted-foreground">
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
                className="w-full resize-none rounded-md border border-assistant-line-strong bg-card px-2 py-1.5 text-xs leading-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="operator-round-cancel"
            onClick={() => setDraft(null)}
            className="rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="rounded-md bg-foreground px-3.5 py-1 text-xs font-medium text-background transition-colors duration-(--duration-fast) ease-standard hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {t('save')}
          </button>
        </div>
      </div>
    )
  }

  /* ── 默认展开（画板 Main「本轮结论」）──────────────────────────── */
  return (
    <div
      data-testid="operator-round-summary"
      data-state="expanded"
      data-round={summary.roundIndex}
      data-edited={summary.editedByUser ? 'true' : 'false'}
      role="article"
      aria-label={heading}
      className="flex flex-col gap-2 border-y border-border bg-muted/40 px-0.5 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="operator-round-collapse"
          onClick={() => setCollapsed(true)}
          className="flex min-w-0 items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {icon}
          <span className="truncate text-2xs text-muted-foreground">
            {heading}
          </span>
          {summary.editedByUser ? (
            <span
              data-testid="operator-round-edited"
              className="shrink-0 text-2xs text-muted-foreground"
            >
              {t('edited')}
            </span>
          ) : null}
        </button>
        {onSave ? (
          <button
            type="button"
            data-testid="operator-round-edit"
            onClick={() =>
              setDraft({
                facts: toColumnText(summary.facts),
                decisions: toColumnText(summary.decisions),
                todos: toColumnText(summary.todos),
              })
            }
            className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('edit')}
          </button>
        ) : null}
      </div>

      {/* 三栏：灰标签 + 正文。⚠ 空栏不画 —— 画出来是一行只有标签的空句子。 */}
      <div className="flex flex-col gap-1.5">
        {STUDIO_OPERATOR_ROUND_COLUMNS.map((column) =>
          summary[column].length > 0 ? (
            <div
              key={column}
              data-testid="operator-round-column"
              data-column={column}
              className="flex gap-2 text-xs leading-relaxed"
            >
              <span className="w-8 shrink-0 text-muted-foreground">
                {t(`column.${column}`)}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1',
                  /* 决定那一栏走正文色：它是这一块里唯一「已经拍了板」的东西
                     （§7.2），其余两栏是注脚。⛔ 不靠颜色分层级以外的任何事。 */
                  column === 'decisions'
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {summary[column].join(' · ')}
              </span>
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
        <div className="flex items-center gap-2">
          {resume.failedReason ? (
            <span
              data-testid="operator-round-resume-reason"
              className="min-w-0 flex-1 truncate text-2xs text-muted-foreground"
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
            className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-2sm font-medium text-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tResume('continue', { step: resume.stepNumber })}
          </button>
        </div>
      ) : null}
    </div>
  )
}
