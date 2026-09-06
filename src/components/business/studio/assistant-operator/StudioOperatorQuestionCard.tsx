'use client'

/**
 * **反问卡**（2026-09-06 面板轮，第 1 件）—— 与 Claude Code 的 AskUserQuestion 同形。
 *
 * ── 它替掉了什么 ─────────────────────────────────────────────────
 * 计划卡里那个三格图钉式的待定项区（`grid-cols-3` + 图示 + 一个词）。那一版问的
 * 其实是「哪个图标好看」，而用户要回答的是「这两条路差在哪」——**说明那一句就是
 * 差别本身**。所以这里的选项是一**行**可读的东西：标题 + 一句说明，图示降成行首
 * 20px 的小图示（`PlanOptionVisual` 传 `size-5`），⛔ 不再是选项本体。
 *
 * ── 一卡一次提交 ────────────────────────────────────────────────
 * 一张卡 1–4 题、每题 2–4 项，**一次「开始」全交**（⛔ 不做逐题提交）：逐题提交
 * 等于把一轮反问拆成四轮往返，而这张卡存在的全部理由就是把那几轮压成一次点击。
 * ⚠ 没答完**不是把按钮变灰**：灰按钮不告诉人差在哪。点下去 → 未答的那几题就地
 * 高亮 + 焦点落到第一道未答题，⛔ 不发请求。
 *
 * ── 为什么用原生 input 而不是 `role="radio"` 的按钮 ───────────────
 * 键盘可达（Tab 进组、方向键切项、空格选中）与读屏的组语义（`fieldset`/`legend`）
 * 全是浏览器白送的。旧的三格用的是 `<button role="radio">`，那条路要自己实现
 * roving tabindex 才等价 —— 而没实现的表现是：整组只能 Tab，方向键什么都不做。
 *
 * ── 它同时**就是那张计划卡** ─────────────────────────────────────
 * 一轮里只有**一张**钉在流末尾的待确认卡（2026-09-06 面板轮，第 2 件）：阶段清单
 * 折成头一行「计划 · N 步」，题在中间，预估与「开始 / 修改」在脚。⛔ 计划卡与
 * 反问卡不并存 —— 两张卡列同一份阶段、各带一颗「开始」，用户要答两遍。
 * ⚠ 没有题时（`questions` 为空）阶段清单**默认展开**：那时这张卡就只讲计划，
 * 把唯一的内容折起来等于给一张空卡。
 *
 * ⚠ 「其他」那一项**不进 `optionIds`**（见 `STUDIO_OPERATOR_QUESTION_OTHER_ID`
 * 的头注）：服务端没有这个选项，带上去只会得到一条查无此项的答复；用户写的那句
 * 话走 `otherText`。
 */

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getAssistantPlanVisual } from '@/constants/assistant-plan-visuals'
import { STUDIO_OPERATOR_QUESTION_OTHER_ID } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { AssistantOperatorPlanEstimate } from '@/types/assistant-operator'
import type {
  StudioOperatorQuestion,
  StudioOperatorQuestionAnswer,
  StudioOperatorQuestionOption,
} from '@/types/studio-assistant-operator'

import { PlanOptionVisual } from './PlanOptionVisual'

/**
 * 推荐项排第一。
 *
 * ⚠ **稳定排序**且只认第一个 `recommended`（类型头注定的）：两项都标推荐时把
 * 两项都提上来，用户看到的是「推荐 / 推荐」—— 那等于没有推荐。
 */
function orderOptions(
  options: readonly StudioOperatorQuestionOption[],
): readonly StudioOperatorQuestionOption[] {
  const index = options.findIndex((option) => option.recommended === true)
  if (index <= 0) return options
  const picked = options[index]
  if (!picked) return options
  return [picked, ...options.filter((_, at) => at !== index)]
}

/** 这一题答了没有 —— 选了项、或写了「其他」那一句，二者之一即可。 */
function isAnswered(
  selected: readonly string[] | undefined,
  otherText: string | undefined,
): boolean {
  if (selected && selected.length > 0) return true
  return (otherText ?? '').trim().length > 0
}

interface StudioOperatorQuestionCardProps {
  /** 这一轮打算做的几件事 —— 折成头一行「计划 · N 步」。 */
  steps: readonly { id: string; label: string }[]
  estimate: AssistantOperatorPlanEstimate
  questions: readonly StudioOperatorQuestion[]
  /**
   * 已提交的那份答复 —— **收起态那一行摘要按它写**。
   * ⚠ 受控（住在 store），⛔ 不是卡自己的 state：收放法则（拍板 7）会把面板整颗
   * 卸载，卡自己记的下场是再展开时那一轮明明已经跑起来了，卡却又变回可点的。
   */
  answers: readonly StudioOperatorQuestionAnswer[]
  /** 点过「开始」—— 整卡收成一行「你选了：…」（可展开）。 */
  resolved: boolean
  onSubmit(answers: StudioOperatorQuestionAnswer[]): void
  /** 「修改」—— ⚠ 就地回到可编辑态，**不发请求**（与计划卡同一条纪律）。 */
  onRevise?(): void
}

export function StudioOperatorQuestionCard({
  steps,
  estimate,
  questions,
  answers,
  resolved,
  onSubmit,
  onRevise,
}: StudioOperatorQuestionCardProps) {
  const t = useTranslations('StudioOperator')
  const [picked, setPicked] = useState<Record<string, readonly string[]>>({})
  const [others, setOthers] = useState<Record<string, string>>({})
  /** 「其他」那一行展开了没有 —— 展开本身不算答案，写了字才算。 */
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({})
  /**
   * 点过一次「开始」但没答完 —— 从这一刻起未答题才高亮。
   * ⛔ 不一上来就把四道题全标红：那是在用户还没做错任何事的时候先骂一顿。
   */
  const [showMissing, setShowMissing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  /**
   * 点过「开始」了 —— 按钮进 loading 且**不可再点**（2026-09-07 真机）。
   *
   * ⚠ 它与 `resolved` 不是一回事：`resolved` 来自 store，是「这一轮已经被受理」；
   * 这一格记的是「这次点击已经交出去了」，管的是同一帧里的连点。⛔ 少了它，
   * 用户连点两下发的是两轮请求 —— 而这张卡下面挂着的常常是一次真花钱的生成。
   */
  const [submitted, setSubmitted] = useState(false)
  /** 阶段清单展开着没有 —— 没有题时它就是这张卡的全部内容，默认展开。 */
  const [stepsOpen, setStepsOpen] = useState(questions.length === 0)
  const groupRefs = useRef<Record<string, HTMLFieldSetElement | null>>({})

  const missing = useMemo(
    () =>
      questions.filter(
        (question) => !isAnswered(picked[question.id], others[question.id]),
      ),
    [others, picked, questions],
  )

  /** 收起态那一行 —— 「你选了：A · B」。 */
  const summary = useMemo(() => {
    const labels: string[] = []
    for (const answer of answers) {
      const question = questions.find((item) => item.id === answer.questionId)
      for (const optionId of answer.optionIds) {
        const option = question?.options.find((item) => item.id === optionId)
        if (option) labels.push(option.label)
      }
      if (answer.otherText) labels.push(answer.otherText)
    }
    return labels.join(' · ')
  }, [answers, questions])

  if (resolved) {
    return (
      <div
        data-testid="operator-question-card"
        data-resolved="true"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            data-testid="operator-question-summary"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="min-w-0 flex-1 truncate text-left text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* ⚠ **没有答复就写「计划 · N 步」**（2026-09-07 真机）：这张卡同时是
                计划卡，而计划卡那一支压根没有题 —— 复用反问卡的「你选了：…」
                得到的是一句冒号后面什么都没有的话。 */}
            {summary
              ? t('question.summary', { answers: summary })
              : t('planFold', { count: steps.length })}
          </button>
          <button
            type="button"
            data-testid="operator-question-revise"
            onClick={() => onRevise?.()}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('question.revise')}
          </button>
        </div>
        {expanded ? (
          <dl
            data-testid="operator-question-summary-detail"
            className="flex flex-col gap-1.5 border-t border-border px-3 py-2"
          >
            {answers.map((answer) => {
              const question = questions.find(
                (item) => item.id === answer.questionId,
              )
              if (!question) return null
              const chosen = [
                ...answer.optionIds.map(
                  (optionId) =>
                    question.options.find((item) => item.id === optionId)
                      ?.label ?? optionId,
                ),
                ...(answer.otherText ? [answer.otherText] : []),
              ]
              return (
                <div key={answer.questionId} className="flex gap-2 text-md">
                  <dt className="shrink-0 text-muted-foreground">
                    {question.header}
                  </dt>
                  <dd className="min-w-0 flex-1 text-foreground">
                    {chosen.join(' · ')}
                  </dd>
                </div>
              )
            })}
          </dl>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-testid="operator-question-card"
      data-resolved="false"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 text-2sm font-semibold text-foreground">
          {questions.length > 0 ? t('question.title') : t('plan.title')}
        </span>
        {questions.length > 0 ? (
          <span className="shrink-0 font-mono text-xs tracking-nav text-muted-foreground">
            {t('question.meta', { count: questions.length })}
          </span>
        ) : null}
      </div>

      {/* ── 阶段清单：一行「计划 · N 步」（第 2 件）────────────────────
          ⛔ 不再另起一条 `kind:'plan'` 的清单卡 —— 同一份阶段一轮里出现两遍，
          读起来是「它规划了两遍」。 */}
      {steps.length > 0 ? (
        <div className="border-b border-border">
          <button
            type="button"
            data-testid="operator-plan-fold"
            aria-expanded={stepsOpen}
            onClick={() => setStepsOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 truncate text-2sm text-muted-foreground">
              {t('planFold', { count: steps.length })}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) ease-standard motion-reduce:transition-none',
                stepsOpen && 'rotate-180',
              )}
            />
          </button>
          {stepsOpen ? (
            <ol className="flex flex-col gap-1.5 px-3 pb-2">
              {steps.map((step, index) => (
                <li
                  key={step.id}
                  data-testid="operator-plan-step"
                  className="flex items-start gap-2 text-2sm text-foreground"
                >
                  <span className="shrink-0 font-mono text-xs tracking-nav text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">{step.label}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 p-3 empty:hidden">
        {questions.map((question) => {
          const unanswered =
            showMissing && !isAnswered(picked[question.id], others[question.id])
          const selected = picked[question.id] ?? []
          const otherShown = otherOpen[question.id] === true
          return (
            <fieldset
              key={question.id}
              ref={(node) => {
                groupRefs.current[question.id] = node
              }}
              data-testid="operator-question"
              data-question-id={question.id}
              data-multi={question.multiSelect ? 'true' : 'false'}
              data-unanswered={unanswered ? 'true' : 'false'}
              tabIndex={-1}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-lg',
                // 高亮走**左侧一条实线**而不是整块底色：底色块会与卡面抢重量，
                // 而这一条只在「你还差这道」的位置上说话。
                unanswered && '-ml-2 border-l-2 border-status-risk pl-2',
              )}
            >
              <legend className="flex min-w-0 flex-col gap-1">
                <span
                  data-testid="operator-question-header"
                  className="w-fit rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {question.header}
                </span>
                <span className="text-2sm text-foreground">
                  {question.question}
                </span>
              </legend>

              <div className="flex flex-col gap-1">
                {orderOptions(question.options).map((option) => {
                  const visual = getAssistantPlanVisual(option.visual)
                  const checked = selected.includes(option.id)
                  return (
                    <label
                      key={option.id}
                      data-testid="operator-question-option"
                      data-option-id={option.id}
                      data-selected={checked ? 'true' : 'false'}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors duration-(--duration-fast) ease-standard focus-within:ring-2 focus-within:ring-ring',
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <input
                        type={question.multiSelect ? 'checkbox' : 'radio'}
                        name={`operator-question-${question.id}`}
                        checked={checked}
                        onChange={() => {
                          setPicked((current) => {
                            const now = current[question.id] ?? []
                            if (!question.multiSelect) {
                              return { ...current, [question.id]: [option.id] }
                            }
                            return {
                              ...current,
                              [question.id]: now.includes(option.id)
                                ? now.filter((id) => id !== option.id)
                                : [...now, option.id],
                            }
                          })
                          // 单选选了别的 = 「其他」那一行让位（⛔ 不留下一句悬空的
                          // 自由文本跟着一起提交上去）。
                          if (!question.multiSelect) {
                            setOtherOpen((current) => ({
                              ...current,
                              [question.id]: false,
                            }))
                          }
                        }}
                        className="mt-0.5 size-3.5 shrink-0 accent-primary"
                      />
                      <PlanOptionVisual
                        option={option}
                        label={
                          visual
                            ? t(`planVisual.${visual.labelKey}`)
                            : option.label
                        }
                        className="mt-px size-5"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 text-2sm text-foreground">
                            {option.label}
                          </span>
                          {option.recommended ? (
                            <span
                              data-testid="operator-question-recommended"
                              className="shrink-0 rounded-sm border border-primary/40 px-1 text-xs text-primary"
                            >
                              {t('question.recommended')}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-md leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  )
                })}

                {question.allowOther ? (
                  <div className="flex flex-col gap-1">
                    <label
                      data-testid="operator-question-option"
                      data-option-id={STUDIO_OPERATOR_QUESTION_OTHER_ID}
                      data-selected={otherShown ? 'true' : 'false'}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors duration-(--duration-fast) ease-standard focus-within:ring-2 focus-within:ring-ring',
                        otherShown
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <input
                        type={question.multiSelect ? 'checkbox' : 'radio'}
                        name={`operator-question-${question.id}`}
                        checked={otherShown}
                        onChange={() => {
                          setOtherOpen((current) => ({
                            ...current,
                            [question.id]: !otherShown,
                          }))
                          if (!question.multiSelect) {
                            setPicked((current) => ({
                              ...current,
                              [question.id]: [],
                            }))
                          }
                        }}
                        className="size-3.5 shrink-0 accent-primary"
                      />
                      <span className="text-2sm text-foreground">
                        {t('question.other')}
                      </span>
                    </label>
                    {otherShown ? (
                      <input
                        type="text"
                        data-testid="operator-question-other-input"
                        value={others[question.id] ?? ''}
                        onChange={(event) =>
                          setOthers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder={t('question.otherPlaceholder')}
                        aria-label={t('question.other')}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-2sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </fieldset>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-muted/45 px-3 py-2">
        <span
          data-testid="operator-question-missing"
          className={cn(
            'min-w-0 flex-1 truncate',
            showMissing && missing.length > 0
              ? 'text-md text-status-risk'
              : 'font-mono text-xs tracking-nav text-muted-foreground',
          )}
        >
          {/* ⚠ 算不出金额就**不写那一行**（⛔ 不写「约 0 credits」）—— 一个错的数
              比没有数更糟，论据与 `StudioCostPreview` 的「缺价不折进合计」同源。 */}
          {showMissing && missing.length > 0
            ? t('question.missing', { count: missing.length })
            : estimate.credits === undefined
              ? ''
              : t('plan.estimate', { credits: estimate.credits })}
        </span>
        <button
          type="button"
          data-testid="operator-question-revise"
          onClick={() => onRevise?.()}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('question.revise')}
        </button>
        <button
          type="button"
          data-testid="operator-question-start"
          disabled={submitted}
          aria-busy={submitted}
          data-submitting={submitted ? 'true' : 'false'}
          onClick={() => {
            if (submitted) return
            if (missing.length > 0) {
              setShowMissing(true)
              groupRefs.current[missing[0]!.id]?.focus()
              return
            }
            setSubmitted(true)
            onSubmit(
              questions.map((question) => {
                const otherText = otherOpen[question.id]
                  ? (others[question.id] ?? '').trim()
                  : ''
                return {
                  questionId: question.id,
                  optionIds: [...(picked[question.id] ?? [])],
                  ...(otherText ? { otherText } : {}),
                }
              }),
            )
          }}
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-md text-primary-foreground transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitted ? (
            <Loader2
              aria-hidden
              className="size-3 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {t('question.start')}
        </button>
      </div>
    </div>
  )
}
