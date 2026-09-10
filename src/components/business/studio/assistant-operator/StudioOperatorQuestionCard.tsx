'use client'

/**
 * **问题卡**（v2 §3.2 / §3.4 / 画板 BCards「问题」那一节）—— 五类卡之一。
 *
 * ── 它收掉了什么 ────────────────────────────────────────────────
 * 三张卡合成这一张（§3.2「14 → 5」）：反问卡、缩略图单选卡（整文件删）、
 * 覆盖手写三选条（整块删）。⭐ 判据：三者问的都是**「列几个选项等你
 * 点一个」**，差别只在选项长什么样（一行字 / 一张缩略图）与答复往哪儿回执。
 *
 * ── 它长在哪儿 ──────────────────────────────────────────────────
 * **钉在输入框上方**，⛔ 不进时间线（§3.4）：未答的问题是当下唯一挡路的东西，
 * 滚走了就等于问了个寂寞。答完卡就消失，时间线里落一行「问题 · 你选了 X」——
 * 所以这颗组件**没有 `.resolved` 那一态**（那是它还住在时间线里时的遗物）。
 *
 * ── 一次只问一个（§3.4）─────────────────────────────────────────
 * 一张卡一道题、2–4 个选项。模型想问两件事就分两轮。⛔ 别把「一卡多题」找回来：
 * 那一版的「开始」按钮要等四道题都答完才可点，而挡路的其实只有第一道。
 *
 * ── 为什么选项是按钮而不是 radio ────────────────────────────────
 * 一次只问一个之后**点一项就是提交**（⛔ 没有第二步「开始」），而 radio 的语义是
 * 「选中，等会儿一起交」—— 用 radio 画一个点下去立刻发请求的东西，键盘用户会在
 * 方向键切项时连发三轮。组语义仍由 `fieldset`/`legend` 承担（问句就是 legend）。
 *
 * ⚠ 「其他」那一项**不进 `optionIds`**（见 `STUDIO_OPERATOR_QUESTION_OTHER_ID`
 * 的头注）：服务端没有这个选项，带上去只会得到一条查无此项的答复；用户写的那句
 * 话走 `otherText`。
 */

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_QUESTION_OTHER_ID } from '@/constants/studio-assistant-operator'
import { getAssistantPlanVisual } from '@/constants/assistant-plan-visuals'
import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  type AssistantOperatorConfirmChoice,
} from '@/constants/assistant-operator'
import type {
  StudioOperatorQuestionAnswer,
  StudioOperatorQuestionOption,
  StudioOperatorQuestionPrompt,
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

/** 选项全带缩略图 = 这是「你说的是哪一张」那一支（旧的候选单选卡）。 */
function isAssetQuestion(
  options: readonly StudioOperatorQuestionOption[],
): boolean {
  return options.length > 0 && options.every((option) => option.assetUrl)
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
  /** 系统行上那句「你选了 X」里的 X。 */
  label: string
  /** 覆盖三选时选的那一档 —— 走 `confirmations` 回执。 */
  choice?: AssistantOperatorConfirmChoice
  /** 缩略图那一支被点中的选项 id —— 面板据它取素材，走 @chip 管线。 */
  assetOptionId?: string
}

interface StudioOperatorQuestionCardProps {
  prompt: StudioOperatorQuestionPrompt
  /** 助手叫什么 —— 卡头那句「X 想先确认」（§8.2）。 */
  assistantName: string
  onAnswer(
    answer: StudioOperatorQuestionAnswer,
    payload: StudioOperatorQuestionAnswerPayload,
  ): void
}

export function StudioOperatorQuestionCard({
  prompt,
  assistantName,
  onAnswer,
}: StudioOperatorQuestionCardProps) {
  const t = useTranslations('StudioOperator')
  const question = prompt.question
  /**
   * 点过一次了 —— 从这一刻起不可再点（2026-09-07 真机）。
   *
   * ⚠ 卡答完就消失，但**消失是下一帧的事**：少了这一格，用户连点两下发的是两轮
   * 请求，而第二轮会把第一轮 abort 掉再从头跑一遍。
   */
  const [submitted, setSubmitted] = useState(false)
  /** 「其他」那一行展开了没有 —— 展开本身不算答案，写了字才算。 */
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const assetMode = useMemo(
    () => isAssetQuestion(question.options),
    [question.options],
  )

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

  return (
    <section
      data-testid="operator-question-card"
      data-pinned="true"
      data-mode={assetMode ? 'asset' : 'text'}
      aria-label={t('question.pinnedTitle', { name: assistantName })}
      className="overflow-hidden rounded-xl border border-primary/30 bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          data-testid="operator-question-pinned-title"
          className="min-w-0 flex-1 text-2sm font-semibold text-foreground"
        >
          {t('question.pinnedTitle', { name: assistantName })}
        </span>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2 p-3">
        <legend className="flex min-w-0 flex-col gap-1">
          <span className="text-2sm text-foreground">{question.question}</span>
          {/* 「为什么问这一句」—— 缺席就不画。 */}
          {prompt.why ? (
            <span
              data-testid="operator-question-why"
              className="text-md leading-relaxed text-muted-foreground"
            >
              {prompt.why}
            </span>
          ) : null}
        </legend>

        {/* ── 覆盖手写三选那一支：先把「你写的」与「它建议的」摆出来 ──────
            ⚠ 少了这一块，三个选项（追加在后 / 覆盖 / 保留）就成了没有宾语的
            选择题 —— 用户不知道自己在保留什么。 */}
        {prompt.overwrite ? (
          <div
            data-testid="operator-question-overwrite"
            className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2 text-2sm"
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
          </div>
        ) : null}

        {assetMode ? (
          /* ⚠ 网格是 `grid-cols-4` + `aspect-3/4`，与结果卡的 2/4 列**不共用**
             一套：那张是「这一批的产出」，这张是「你指的是哪一个」，列数固定才
             不会在拖窄面板时把四个候选排成两屏。 */
          <div className="grid grid-cols-4 gap-1.5">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid="operator-question-option"
                data-option-id={option.id}
                data-kind="asset"
                title={option.label}
                disabled={submitted}
                onClick={() =>
                  submit(option.id, option.label, { assetOptionId: option.id })
                }
                className="relative grid aspect-3/4 place-items-center overflow-hidden rounded-md border border-border bg-muted transition-colors duration-(--duration-fast) ease-standard hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <Image
                  src={option.assetUrl as string}
                  alt={option.label}
                  width={120}
                  height={160}
                  unoptimized
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {orderOptions(question.options).map((option) => {
              const visual = getAssistantPlanVisual(option.visual)
              return (
                <button
                  key={option.id}
                  type="button"
                  data-testid="operator-question-option"
                  data-option-id={option.id}
                  data-kind="text"
                  disabled={submitted}
                  onClick={() =>
                    submit(option.id, option.label, {
                      ...(toConfirmChoice(option.id)
                        ? { choice: toConfirmChoice(option.id) }
                        : {}),
                    })
                  }
                  className="flex items-start gap-2 rounded-lg border border-border p-2 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <PlanOptionVisual
                    option={option}
                    label={
                      visual ? t(`planVisual.${visual.labelKey}`) : option.label
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
                    {option.description ? (
                      <span className="text-md leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}

            {question.allowOther ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  data-testid="operator-question-option"
                  data-option-id={STUDIO_OPERATOR_QUESTION_OTHER_ID}
                  data-kind="other"
                  aria-expanded={otherOpen}
                  disabled={submitted}
                  onClick={() => setOtherOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-lg border border-border p-2 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {t('question.other')}
                </button>
                {otherOpen ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      data-testid="operator-question-other-input"
                      value={otherText}
                      onChange={(event) => setOtherText(event.target.value)}
                      placeholder={t('question.otherPlaceholder')}
                      aria-label={t('question.other')}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-2sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      data-testid="operator-question-other-submit"
                      disabled={submitted || !otherText.trim()}
                      onClick={() => submit(null, otherText.trim())}
                      className="shrink-0 rounded-md bg-primary px-2 py-1 text-2sm text-primary-foreground transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t('question.send')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </fieldset>
    </section>
  )
}
