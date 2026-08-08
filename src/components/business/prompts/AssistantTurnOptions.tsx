'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, RefreshCw, SkipForward, ThumbsUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  AssistantAskedPair,
  AssistantClarifyingQuestion,
  AssistantNextStep,
} from '@/types/assistant-protocol'

/**
 * A2 对话协议的两个控件：结构化反问（`[[ask]]`）+ 收敛选项（`[[next]]`）。
 *
 * ⚠ **为什么不复用画布那张 `ClarifyingQuestionCard`**：那张卡通体是画布域皮肤
 * （`node-panel-*` / `node-foreground`）并挂在 `StudioNode.dock` 的 i18n 命名空间
 * 下。按「薄脊柱 + 域皮肤」的分工，把画布皮肤搬进 Studio 就是让一个域的视觉世界
 * 漏进另一个。**共享的是 schema（`AssistantClarifyingQuestionSchema`），不是皮肤。**
 *
 * 只对**最后一轮**渲染。往回滚看到三轮前的按钮还亮着、点下去发出一句过期答复，
 * 比没有按钮更糟。
 */

interface AssistantTurnOptionsProps {
  ask?: AssistantClarifyingQuestion[]
  next?: AssistantNextStep
  malformed?: boolean
  disabled: boolean
  /**
   * 把用户的选择组装成一条自然语言消息发出去 —— 收敛信号对机器明确，对模型仍是
   * 人话。`pairs` 是同一批选择的结构化形态，供「已询问」折叠块用（A2c）：控件手里
   * 本来就有结构，别让下游再去 split 那句本地化文案。
   */
  onSend(message: string, pairs?: AssistantAskedPair[]): void
}

interface AnswerState {
  selected: string[]
  custom: string
  skipped: boolean
}

const EMPTY_ANSWER: AnswerState = { selected: [], custom: '', skipped: false }

function isAnswered(answer: AnswerState): boolean {
  return (
    answer.skipped ||
    answer.selected.length > 0 ||
    answer.custom.trim().length > 0
  )
}

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'

export function AssistantTurnOptions({
  ask,
  next,
  malformed,
  disabled,
  onSend,
}: AssistantTurnOptionsProps) {
  const t = useTranslations('PromptAssistant.turn')
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})

  const getAnswer = useCallback(
    (questionId: string): AnswerState => answers[questionId] ?? EMPTY_ANSWER,
    [answers],
  )

  const toggleOption = useCallback(
    (question: AssistantClarifyingQuestion, optionId: string) => {
      setAnswers((current) => {
        const prev = current[question.id] ?? EMPTY_ANSWER
        const isSelected = prev.selected.includes(optionId)
        const selected = question.multiSelect
          ? isSelected
            ? prev.selected.filter((id) => id !== optionId)
            : [...prev.selected, optionId]
          : isSelected
            ? []
            : [optionId]
        return {
          ...current,
          [question.id]: { ...prev, selected, skipped: false },
        }
      })
    },
    [],
  )

  const setCustom = useCallback((questionId: string, custom: string) => {
    setAnswers((current) => {
      const prev = current[questionId] ?? EMPTY_ANSWER
      return { ...current, [questionId]: { ...prev, custom, skipped: false } }
    })
  }, [])

  const toggleSkip = useCallback((questionId: string) => {
    setAnswers((current) => {
      const prev = current[questionId] ?? EMPTY_ANSWER
      return prev.skipped
        ? { ...current, [questionId]: { ...prev, skipped: false } }
        : {
            ...current,
            [questionId]: { selected: [], custom: '', skipped: true },
          }
    })
  }, [])

  const allAnswered = useMemo(
    () => (ask ?? []).every((question) => isAnswered(getAnswer(question.id))),
    [ask, getAnswer],
  )

  const handleSubmitAnswers = useCallback(() => {
    if (!ask?.length) return
    const pairs: AssistantAskedPair[] = ask.map((question) => {
      const answer = getAnswer(question.id)
      if (answer.skipped) {
        return { question: question.question, answer: t('skipped') }
      }
      const labels = question.options
        .filter((option) => answer.selected.includes(option.id))
        .map((option) => option.label)
      const custom = answer.custom.trim()
      if (custom) labels.push(custom)
      return {
        question: question.question,
        answer: labels.join('、') || t('skipped'),
      }
    })
    const lines = pairs.map((pair) => `${pair.question} — ${pair.answer}`)
    onSend(`${t('answerPrefix')}\n${lines.join('\n')}`, pairs)
  }, [ask, getAnswer, onSend, t])

  // ⭐ 点「满意」发出去的不是一个暗号，是模型自己写的那句具体下一步。这样对机器是
  // 明确的收敛信号，对模型仍然是它能理解的人话 —— 不需要第二套指令通道。
  const handleSatisfied = useCallback(() => {
    if (!next) return
    onSend(`${t('satisfiedPrefix')}${next.satisfied}`)
  }, [next, onSend, t])

  if (!ask?.length && !next && !malformed) return null

  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
      {ask?.length ? (
        <div className="space-y-3">
          {ask.map((question) => {
            const answer = getAnswer(question.id)
            return (
              <div key={question.id} className="space-y-2">
                <p className="text-sm leading-6 text-foreground">
                  {question.question}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {question.options.map((option) => {
                    const selected = answer.selected.includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={disabled}
                        aria-pressed={selected}
                        onClick={() => toggleOption(question, option.id)}
                        className={cn(
                          CHIP_CLASS,
                          selected
                            ? 'border-primary/40 bg-primary/10 text-foreground'
                            : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                          disabled && 'pointer-events-none opacity-60',
                        )}
                      >
                        {selected ? <Check className="size-3" /> : null}
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {question.allowCustom ? (
                  <Input
                    value={answer.custom}
                    onChange={(event) =>
                      setCustom(question.id, event.target.value)
                    }
                    disabled={disabled}
                    aria-label={t('customPlaceholder')}
                    placeholder={t('customPlaceholder')}
                    className="h-8 text-xs"
                  />
                ) : null}
                {question.allowSkip ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleSkip(question.id)}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs transition-colors',
                      answer.skipped
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                      disabled && 'pointer-events-none opacity-60',
                    )}
                  >
                    <SkipForward className="size-3" />
                    {t('skip')}
                  </button>
                ) : null}
              </div>
            )
          })}

          <button
            type="button"
            onClick={handleSubmitAnswers}
            disabled={!allAnswered || disabled}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            <Check className="size-3.5" />
            {t('submitAnswers')}
          </button>
        </div>
      ) : null}

      {next ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={handleSatisfied}
            className={cn(
              CHIP_CLASS,
              'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <ThumbsUp className="size-3" />
            {next.satisfied}
          </button>
          <span
            className={cn(
              CHIP_CLASS,
              'border-transparent text-muted-foreground',
            )}
          >
            <RefreshCw className="size-3" />
            {next.adjust ?? t('adjustFallback')}
          </span>
        </div>
      ) : null}

      {malformed ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {t('malformed')}
        </p>
      ) : null}
    </div>
  )
}
