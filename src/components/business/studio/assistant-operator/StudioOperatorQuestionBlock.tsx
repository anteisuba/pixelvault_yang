'use client'

/**
 * **问题块**（D12 A 定稿 · S3 / S4 · 对标 Claude 的提问框）。
 *
 * ── 形状 ────────────────────────────────────────────────────────
 * 问题**直接占用输入框内部**（P2：⛔ 不再套第二层框）：
 *  · 已答的题留一行「问题 · 答案」，最近那一行可点「改」回去（Q8）；
 *  · 问题一句加粗，**只有多题才**在右上写「2 / 2」（Q4）；
 *  · 选项竖排一行一个：编号 + 标签 + 一句灰色说明；推荐只用标签，**不预选**（Q5）；
 *  · 「其他」就是下面那一行输入框：问题开着时打字即回答（Q6），⛔ 不再就地展开
 *    第二个输入框。
 *
 * ── 三条硬纪律 ──────────────────────────────────────────────────
 * ⛔ **没有「确定」按钮**：点任一行即选中并进下一题。
 * ⛔ **不进时间线**：未答的问题是当下唯一挡路的东西，滚走了就等于问了个寂寞。
 * ⚠ **键盘**：`1`–`4` 直选 · `↑`/`↓` 移动 + `Enter` 选中 · `Esc` 收起只打字。
 *    键盘落在**块自己**身上（块出现时自动聚焦）：落在输入框上的话，用户打的
 *    「1」会变成一次选择。
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  type AssistantOperatorConfirmChoice,
} from '@/constants/assistant-operator'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorQuestionAnswer,
  StudioOperatorQuestionOption,
  StudioOperatorQuestionPrompt,
} from '@/types/studio-assistant-operator'

/** 数字直选只到 4 —— 选项本来就最多 4 个（`ASSISTANT_PLAN_CARD_LIMITS`）。 */
const DIGIT_KEYS = ['1', '2', '3', '4']

/**
 * 推荐项排第一。
 *
 * ⚠ **稳定排序**且只认第一个 `recommended`：两项都标推荐时把两项都提上来，
 * 用户看到的是「推荐 / 推荐」—— 那等于没有推荐。
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

/** 覆盖三选那一支的选项 id 就是 `confirmations` 要带回去的那三个值。 */
function toConfirmChoice(
  optionId: string,
): AssistantOperatorConfirmChoice | undefined {
  return (
    Object.values(ASSISTANT_OPERATOR_CONFIRM_CHOICES) as string[]
  ).includes(optionId)
    ? (optionId as AssistantOperatorConfirmChoice)
    : undefined
}

export interface StudioOperatorQuestionAnswerPayload {
  /** 小标签上写的那句「你选了 X」里的 X。 */
  label: string
  /** 覆盖三选时选的那一档 —— 走 `confirmations` 回执。 */
  choice?: AssistantOperatorConfirmChoice
  /** 缩略图那一支被点中的选项 id —— 面板据它取素材，走 @chip 管线。 */
  assetOptionId?: string
}

interface StudioOperatorQuestionBlockProps {
  prompt: StudioOperatorQuestionPrompt
  onAnswer(
    answer: StudioOperatorQuestionAnswer,
    payload: StudioOperatorQuestionAnswerPayload,
  ): void
  /** 「← 上一题」——第一题上不画（判据在这颗组件里，⛔ 不在 hook 里再判一次）。 */
  onBack(): void
  /** Esc —— 收起问题块只打字。 */
  onDismiss(): void
}

export function StudioOperatorQuestionBlock({
  prompt,
  onAnswer,
  onBack,
  onDismiss,
}: StudioOperatorQuestionBlockProps) {
  const t = useTranslations('StudioOperator')
  /** ⭐ 当前是第几题 = 已答几道（⛔ 不另存一个下标，见 prompt 的头注）。 */
  const step = prompt.answers.length
  const question = prompt.questions[step]
  const total = prompt.questions.length
  const containerRef = useRef<HTMLDivElement>(null)
  /** 键盘高亮落在第几行（`-1` = 还没动过键盘）。 */
  const [cursor, setCursor] = useState(-1)
  /**
   * 点过一次了 —— 从这一刻起不可再点（2026-09-07 真机）。
   * ⚠ 块答完就换题，但**换题是下一帧的事**：少了这一格，用户连点两下会把同一题
   * 答两遍（第二下落在还没换掉的那一题上）。
   */
  const [submitted, setSubmitted] = useState(false)

  /**
   * ⭐ **块出现时自己拿走焦点**：键盘 1–4 / ↑↓ 要生效，焦点就不能留在输入框上。
   * ⚠ 换一题是**换一次挂载**（面板给这颗组件的 `key` 带着题序）：临时态因此自己
   * 就清了，⛔ 不用在 effect 里 setState。
   */
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  if (!question) return null

  const options = orderOptions(question.options)

  const pickOption = (option: StudioOperatorQuestionOption) => {
    if (submitted) return
    setSubmitted(true)
    const choice = toConfirmChoice(option.id)
    onAnswer(
      { questionId: question.id, optionIds: [option.id] },
      {
        label: option.label,
        ...(choice ? { choice } : {}),
        ...(option.assetUrl ? { assetOptionId: option.id } : {}),
      },
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-testid="operator-question-block"
      data-step={step + 1}
      data-total={total}
      role="group"
      aria-label={question.question}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onDismiss()
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setCursor((current) =>
            event.key === 'ArrowDown'
              ? (current + 1) % options.length
              : (current <= 0 ? options.length : current) - 1,
          )
          return
        }
        if (event.key === 'Enter') {
          const option = options[cursor]
          if (!option) return
          event.preventDefault()
          pickOption(option)
          return
        }
        const digit = DIGIT_KEYS.indexOf(event.key)
        const option = options[digit]
        if (digit >= 0 && option) {
          event.preventDefault()
          pickOption(option)
        }
      }}
      className="flex min-w-0 flex-col gap-0.5 pt-0.5 focus-visible:outline-none"
    >
      {/* ── 已答的题：一行「问题 · 答案」，最近那一行可「改」（Q8 / S4）─── */}
      {prompt.answers.map((item, index) => (
        <p
          key={`${item.header}:${item.label}`}
          data-testid="operator-question-answer-tag"
          className="flex min-w-0 items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground"
        >
          <span className="shrink-0">{item.header}</span>
          <span aria-hidden>·</span>
          <span className="min-w-0 truncate text-foreground">{item.label}</span>
          {index === prompt.answers.length - 1 ? (
            <button
              type="button"
              data-testid="operator-question-back"
              onClick={onBack}
              className="shrink-0 rounded-sm text-muted-foreground/80 transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              {t('question.edit')}
            </button>
          ) : null}
        </p>
      ))}

      <div className="flex min-w-0 items-baseline gap-2 px-1 pb-1">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
          {question.question}
        </p>
        {/* 只有多题才写进度（Q4）：一题的「1 / 1」只是噪音。 */}
        {total > 1 ? (
          <span
            data-testid="operator-question-step"
            className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground"
          >
            {t('question.step', { step: step + 1, total })}
          </span>
        ) : null}
      </div>
      {/* 「为什么问这一句」—— 缺席就不画。 */}
      {prompt.why ? (
        <p
          data-testid="operator-question-why"
          className="px-1 pb-1 text-xs leading-relaxed text-muted-foreground"
        >
          {prompt.why}
        </p>
      ) : null}

      {/* ── 覆盖手写三选那一支：先把「你写的」与「它建议的」摆出来 ──────
          ⚠ 少了这一块，三个选项（追加在后 / 覆盖 / 保留）就成了没有宾语的
          选择题 —— 用户不知道自己在保留什么。 */}
      {prompt.overwrite ? (
        <div
          data-testid="operator-question-overwrite"
          className="mx-1 mb-1 flex flex-col gap-1 rounded-lg bg-muted/60 p-2 text-xs"
        >
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              {t('question.current')}
            </summary>
            <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-foreground">
              {prompt.overwrite.have}
            </p>
          </details>
          <p className="text-muted-foreground">{t('question.proposed')}</p>
          <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-foreground">
            {prompt.overwrite.proposed}
          </p>
          {prompt.overwrite.sourceNotes?.length ? (
            <div
              data-testid="operator-question-source-notes"
              className="flex flex-col gap-0.5"
            >
              <p className="text-muted-foreground">
                {t('question.sourceNotes')}
              </p>
              {prompt.overwrite.sourceNotes.map((note) => (
                <p key={note} className="break-words text-foreground">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          {prompt.overwrite.negativeDiff?.length ? (
            <p data-testid="operator-question-negative-diff">
              <span className="text-muted-foreground">
                {t('question.negativeDiff')}
              </span>{' '}
              <span className="break-words text-foreground">
                {prompt.overwrite.negativeDiff.join(', ')}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ⚠ 竖排一行一个；编号即键盘直选键。⛔ 不预选、⛔ 不画圆点（Q5）。 */}
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          data-testid="operator-question-option"
          data-option-id={option.id}
          data-index={index}
          data-cursor={cursor === index ? 'true' : 'false'}
          disabled={submitted}
          onMouseEnter={() => setCursor(index)}
          onClick={() => pickOption(option)}
          className={cn(
            'flex min-w-0 items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-(--duration-fast) ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none coarse:min-h-11',
            cursor === index && 'bg-muted',
          )}
        >
          <span
            aria-hidden
            className="mt-px grid size-5 shrink-0 place-items-center rounded-md border border-border font-mono text-2xs tabular-nums text-muted-foreground"
          >
            {index + 1}
          </span>
          {option.assetUrl ? (
            <Image
              src={option.assetUrl}
              alt={option.label}
              width={56}
              height={56}
              unoptimized
              className="size-7 shrink-0 rounded object-cover"
            />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 text-sm font-medium text-foreground">
                {option.label}
              </span>
              {option.recommended ? (
                <span
                  data-testid="operator-question-recommended"
                  className="shrink-0 rounded-sm border border-border px-1 text-2xs text-muted-foreground"
                >
                  {t('question.recommended')}
                </span>
              ) : null}
            </span>
            {/* 说明那一句由模型给 —— 没有就只剩标签（⛔ 不编一句）。 */}
            {option.description ? (
              <span className="text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </span>
            ) : null}
          </span>
        </button>
      ))}
      {/* 「其他」= 下面那一行输入框（Q6），分隔线只是提示那一行也能答。 */}
      <div aria-hidden className="mx-1 mt-1 border-t border-border" />
    </div>
  )
}
