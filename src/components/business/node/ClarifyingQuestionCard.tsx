'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, SendHorizontal, SkipForward } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { ScriptDocClarifyingQuestion } from '@/types/script-doc'

import { IMEAwareInput } from './inspector/IMEAwareField'

interface ClarifyingQuestionCardProps {
  questions: ScriptDocClarifyingQuestion[]
  isSubmitting: boolean
  /** Receives a human-readable answer summary to fold back into the draft. */
  onSubmit(summary: string): void
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

/**
 * 反问澄清卡 (concept-clarifying-questions): the assistant returns structured
 * questions before drafting an outline. The user answers via option chips (+ a
 * custom answer / skip), and the summary is folded back into the next draft. No
 * hue beyond the canvas neutral palette.
 */
export function ClarifyingQuestionCard({
  questions,
  isSubmitting,
  onSubmit,
}: ClarifyingQuestionCardProps) {
  const t = useTranslations('StudioNode.dock')
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})

  const getAnswer = useCallback(
    (questionId: string): AnswerState => answers[questionId] ?? EMPTY_ANSWER,
    [answers],
  )

  const toggleOption = useCallback(
    (question: ScriptDocClarifyingQuestion, optionId: string) => {
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
    () => questions.every((question) => isAnswered(getAnswer(question.id))),
    [getAnswer, questions],
  )

  const handleSubmit = useCallback(() => {
    const lines = questions.map((question) => {
      const answer = getAnswer(question.id)
      if (answer.skipped) {
        return `${question.question} — ${t('clarify.skipped')}`
      }
      const labels = question.options
        .filter((option) => answer.selected.includes(option.id))
        .map((option) => option.label)
      const custom = answer.custom.trim()
      if (custom) labels.push(custom)
      return `${question.question} — ${labels.join('、') || t('clarify.skipped')}`
    })
    onSubmit(`${t('clarify.answerPrefix')}\n${lines.join('\n')}`)
  }, [getAnswer, onSubmit, questions, t])

  return (
    <div className="space-y-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
      <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
        {t('clarify.title')}
      </p>

      {questions.map((question) => {
        const answer = getAnswer(question.id)
        return (
          <div key={question.id} className="space-y-2">
            <p className="text-sm leading-5 text-node-foreground">
              {question.question}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option) => {
                const selected = answer.selected.includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(question, option.id)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors',
                      selected
                        ? 'border-node-edge bg-node-panel-inner text-node-foreground'
                        : 'border-node-panel-inner text-node-muted hover:border-node-edge hover:text-node-foreground',
                    )}
                  >
                    {selected ? <Check className="size-3" /> : null}
                    {option.label}
                  </button>
                )
              })}
            </div>
            {question.allowCustom ? (
              <IMEAwareInput
                value={answer.custom}
                onValueChange={(next) => setCustom(question.id, next)}
                aria-label={t('clarify.customPlaceholder')}
                placeholder={t('clarify.customPlaceholder')}
                className="h-8 w-full rounded-lg border border-node-panel-inner bg-node-panel px-2.5 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
              />
            ) : null}
            {question.allowSkip ? (
              <button
                type="button"
                onClick={() => toggleSkip(question.id)}
                className={cn(
                  'inline-flex items-center gap-1 text-2xs transition-colors',
                  answer.skipped
                    ? 'text-node-foreground'
                    : 'text-node-subtle hover:text-node-foreground',
                )}
              >
                <SkipForward className="size-3" />
                {t('clarify.skip')}
              </button>
            ) : null}
          </div>
        )
      })}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!allAnswered || isSubmitting}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-node-foreground text-xs font-semibold text-node-canvas transition-colors hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
      >
        <SendHorizontal className="size-3.5" />
        {t('clarify.submit')}
      </button>
    </div>
  )
}
