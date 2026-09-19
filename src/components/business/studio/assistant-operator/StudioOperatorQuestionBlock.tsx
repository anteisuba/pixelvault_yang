'use client'

/**
 * **问题块**（56b 切片 4 · 画板 D56bUI「反问」四态 · 对标 Claude Code 的提问框）。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * `StudioOperatorQuestionCard` 整张卡（已删）。那张卡是一张**浮在输入框上方的
 * 卡**：卡头一句「X 想先确认」、选项在桌面上横排换行、「其他」是卡底另起一行的
 * 输入框 + 发送钮。问题出在它读起来是「又一张卡」，而当下真正在发生的事是
 * 「助手在问你一句话，你在这儿答」—— 那是输入区的事。
 *
 * ── 现在的形状 ──────────────────────────────────────────────────
 * 问题块**坐在输入框上方、同一个 composer 容器里**：
 *  · 题头小标签 + 「1 / 3」进度（第 2 题起右上角多一颗「← 上一题」）；
 *  · 问题一句加粗；
 *  · 选项**竖排一行一个**（圆点 + 标签 + 一句灰色说明；推荐项实线框排第一并打
 *    「推荐」）；
 *  · 最后一行「其他，自己写」虚线 —— 点它**那一行就地变输入框**，回车 / 箭头提交，
 *    ⛔ 不跳到下面的输入框。
 *
 * ── 三条硬纪律 ──────────────────────────────────────────────────
 * ⛔ **没有「确定」按钮**：点任一行即选中并进下一题。多一颗确定钮等于让用户为
 *    同一个决定按两次。
 * ⛔ **不进时间线**：未答的问题是当下唯一挡路的东西，滚走了就等于问了个寂寞。
 * ⚠ **键盘**：`1`–`4` 直选 · `↑`/`↓` 移动 + `Enter` 选中 · `Esc` 收起只打字。
 *    键盘落在**块自己**身上（块出现时自动聚焦）：落在输入框上的话，用户打的
 *    「1」会变成一次选择。
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowUp, ChevronLeft } from '@/components/icons'
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

/** IME 选字回车会在 compositionend 后再发一次 Enter，不当提交。 */
const IME_CONFIRM_ENTER_MS = 100

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
  const containerRef = useRef<HTMLDivElement>(null)
  const otherRef = useRef<HTMLInputElement>(null)
  /** 键盘高亮落在第几行（`-1` = 还没动过键盘）。 */
  const [cursor, setCursor] = useState(-1)
  /** 「其他」那一行是不是已经就地展开成输入框。 */
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const composingRef = useRef(false)
  const compositionEndedAtRef = useRef(0)
  /**
   * 点过一次了 —— 从这一刻起不可再点（2026-09-07 真机）。
   * ⚠ 块答完就换题，但**换题是下一帧的事**：少了这一格，用户连点两下会把同一题
   * 答两遍（第二下落在还没换掉的那一题上）。
   */
  const [submitted, setSubmitted] = useState(false)

  /**
   * ⭐ **块出现时自己拿走焦点**：键盘 1–4 / ↑↓ 要生效，焦点就不能留在输入框上
   * （留在那儿的话用户打的「1」会变成一次选择）。
   * ⚠ 挂载时抢一次就够 —— 换一题是**换一次挂载**（面板给这颗组件的 `key` 带着
   * 题序，见那里的注释）：临时态因此自己就清了，⛔ 不用在 effect 里 setState。
   */
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (otherOpen) otherRef.current?.focus()
  }, [otherOpen])

  if (!question) return null

  const options = orderOptions(question.options)
  /** 「其他，自己写」是列表的最后一行 —— 它参与键盘的行计数。 */
  const rowCount = options.length + (question.allowOther ? 1 : 0)

  const submit = (
    optionId: string | null,
    label: string,
    extra: Omit<StudioOperatorQuestionAnswerPayload, 'label'> = {},
  ) => {
    if (submitted) return
    setSubmitted(true)
    onAnswer(
      {
        questionId: question.id,
        optionIds: optionId ? [optionId] : [],
        ...(optionId ? {} : { otherText: label }),
      },
      { label, ...extra },
    )
  }

  const pickOption = (option: StudioOperatorQuestionOption) => {
    const choice = toConfirmChoice(option.id)
    submit(option.id, option.label, {
      ...(choice ? { choice } : {}),
      ...(option.assetUrl ? { assetOptionId: option.id } : {}),
    })
  }

  const submitOther = () => {
    const note = otherText.trim()
    if (!note) return
    submit(null, note)
  }

  const activateRow = (row: number) => {
    const option = options[row]
    if (option) {
      pickOption(option)
      return
    }
    if (question.allowOther && row === options.length) setOtherOpen(true)
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-testid="operator-question-block"
      data-step={step + 1}
      data-total={prompt.questions.length}
      role="group"
      aria-label={question.question}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onDismiss()
          return
        }
        /** ⚠ 「其他」展开之后键盘归那一格 —— 打「1」是在写字，不是在选。 */
        if (otherOpen) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setCursor((current) => {
            const next =
              event.key === 'ArrowDown'
                ? (current + 1) % rowCount
                : (current <= 0 ? rowCount : current) - 1
            return next
          })
          return
        }
        if (event.key === 'Enter') {
          if (cursor < 0) return
          event.preventDefault()
          activateRow(cursor)
          return
        }
        const digit = DIGIT_KEYS.indexOf(event.key)
        if (digit >= 0 && digit < options.length) {
          event.preventDefault()
          activateRow(digit)
        }
      }}
      /* 「当下要你动手的那一格」多一档描边（§12.1 raised）。⛔ 不用 `--primary`
         描边：强调色的独占位置是「选中 / CTA 焦点环 / 进度」。 */
      className="flex min-w-0 flex-col gap-1.5 border-b border-border px-3 py-2.5 focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          data-testid="operator-question-header"
          className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs tracking-nav uppercase text-foreground"
        >
          {question.header}
        </span>
        <span
          data-testid="operator-question-step"
          className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground"
        >
          {t('question.step', {
            step: step + 1,
            total: prompt.questions.length,
          })}
        </span>
        <span className="flex-1" />
        {/* 第 2 题起才画 —— 第一题上没有「上一题」可回。 */}
        {step > 0 ? (
          <button
            type="button"
            data-testid="operator-question-back"
            onClick={onBack}
            className="flex shrink-0 items-center gap-0.5 rounded-md text-xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <ChevronLeft className="size-3" aria-hidden />
            {t('question.back')}
          </button>
        ) : null}
      </div>

      <p className="min-w-0 text-2sm font-semibold leading-snug text-foreground">
        {question.question}
      </p>
      {/* 「为什么问这一句」—— 缺席就不画。 */}
      {prompt.why ? (
        <p
          data-testid="operator-question-why"
          className="text-xs leading-relaxed text-muted-foreground"
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
          className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2 text-xs"
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

      {/* ⚠ **竖排一行一个**（画板 D56bUI）：桌面横排会让两三个短选项各占半行、
          长选项被压成两个字一行，而这几行本来就是要一行一行读下来的。 */}
      <div className="flex min-w-0 flex-col gap-1">
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
              'flex min-w-0 items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors duration-(--duration-fast) ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none',
              option.recommended ? 'border-foreground' : 'border-border',
              cursor === index ? 'bg-muted' : 'bg-card',
            )}
          >
            {/* 圆点 —— 推荐项是实心的那一颗（画板）。⛔ 不是 radio：点一行就是
                提交，而 radio 的语义是「选中，等会儿一起交」。 */}
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border',
                option.recommended ? 'border-foreground' : 'border-border',
              )}
            >
              {option.recommended ? (
                <span className="size-1.5 rounded-full bg-foreground" />
              ) : null}
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
                <span className="min-w-0 text-xs font-medium text-foreground">
                  {option.label}
                </span>
                {option.recommended ? (
                  <span
                    data-testid="operator-question-recommended"
                    className="shrink-0 rounded-sm border border-border px-1 font-mono text-2xs tracking-nav uppercase text-muted-foreground"
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

        {/* ── 「其他，自己写」：点那一行**就地**变输入框 ────────────────
            ⛔ 不跳到下面的输入框：跳下去之后用户得自己记住这句话是在答哪一题。 */}
        {question.allowOther ? (
          otherOpen ? (
            <div
              data-testid="operator-question-other"
              data-open="true"
              className="flex min-w-0 items-center gap-2 rounded-lg border border-foreground bg-card py-1 pl-2 pr-1"
            >
              <span
                aria-hidden
                className="grid size-3.5 shrink-0 place-items-center rounded-full border border-foreground"
              >
                <span className="size-1.5 rounded-full bg-foreground" />
              </span>
              <input
                ref={otherRef}
                type="text"
                data-testid="operator-question-other-input"
                value={otherText}
                disabled={submitted}
                onChange={(event) => setOtherText(event.target.value)}
                onCompositionStart={() => {
                  composingRef.current = true
                }}
                onCompositionEnd={() => {
                  composingRef.current = false
                  compositionEndedAtRef.current = performance.now()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    setOtherOpen(false)
                    containerRef.current?.focus()
                    return
                  }
                  if (
                    composingRef.current ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229
                  ) {
                    return
                  }
                  if (
                    event.key === 'Enter' &&
                    performance.now() - compositionEndedAtRef.current <
                      IME_CONFIRM_ENTER_MS
                  ) {
                    return
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitOther()
                  }
                }}
                placeholder={t('question.otherPlaceholder')}
                aria-label={t('question.other')}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <button
                type="button"
                data-testid="operator-question-other-submit"
                aria-label={t('question.send')}
                disabled={submitted || !otherText.trim()}
                onClick={submitOther}
                className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-(--duration-fast) ease-standard disabled:opacity-40 motion-reduce:transition-none"
              >
                <ArrowUp className="size-3" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="operator-question-other"
              data-open="false"
              data-cursor={cursor === options.length ? 'true' : 'false'}
              disabled={submitted}
              onMouseEnter={() => setCursor(options.length)}
              onClick={() => setOtherOpen(true)}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-lg border border-dashed border-border px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none',
                cursor === options.length ? 'bg-muted' : 'bg-card',
              )}
            >
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full border border-dashed border-border"
              />
              {t('question.other')}
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}

/**
 * **已经答完的那几道，收成小标签**（56b 切片 4）。
 *
 * ⚠ 它长在问题块**上方**、靠右 —— 与用户气泡同一侧：那几句话是用户说的。
 * ⚠ 一道都没答就整块不渲染（⛔ 不画空行占位）。
 */
export function StudioOperatorQuestionAnswers({
  answers,
}: {
  answers: StudioOperatorQuestionPrompt['answers']
}) {
  if (answers.length === 0) return null
  return (
    <div
      data-testid="operator-question-answers"
      className="flex min-w-0 flex-wrap justify-end gap-1 px-3 pt-2"
    >
      {answers.map((item) => (
        <span
          key={`${item.header}:${item.label}`}
          data-testid="operator-question-answer-tag"
          className="flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs"
        >
          <span className="shrink-0 text-muted-foreground">{item.header}</span>
          <span className="min-w-0 truncate text-foreground">{item.label}</span>
        </span>
      ))}
    </div>
  )
}
