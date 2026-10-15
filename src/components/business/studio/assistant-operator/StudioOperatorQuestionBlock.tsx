'use client'

/**
 * **问题块**（D12 A 定稿 · S3 / S4 · 对标 Claude 的提问框；2026-10-14 补多选与完整交互）。
 *
 * ── 形状 ────────────────────────────────────────────────────────
 * 问题**直接占用输入框内部**（P2：⛔ 不再套第二层框）：
 *  · 已答的题留一行「问题 · 答案」，最近那一行可点「改」回去（Q8）；
 *  · 问题一句加粗，**只有多题才**在右上写「2 / 2」（Q4）；
 *  · 选项竖排一行一个：编号（多选是勾选框）+ 标签 + 一句灰色说明；推荐排第一、
 *    只用标签，**不预选**（Q5）；
 *  · 「其他…」一行（`allowOther` 时）只是把焦点交给下面的输入框：输入框就是
 *    「其他」（Q6），⛔ 不就地展开第二个输入框；
 *  · 底下一行「跳过 · 全部用推荐」，多选题右边一颗「确定（N）」。
 *
 * ── 纪律 ────────────────────────────────────────────────────────
 * ⭐ **单选没有「确定」**：点一行即选中并进下一题。**多选**是唯一的例外（owner
 *    2026-10-14 拍板 4A）：勾选 + 「确定（N）」。覆盖三选永远按单选走。
 * ⛔ **不进时间线**：未答的问题是当下唯一挡路的东西，滚走了就等于问了个寂寞。
 * ⚠ **勾选住在 store**（`prompt.checked`）：收放面板会卸载这颗组件。
 * ⚠ **键盘**：`↑`/`↓` 移动 · `1`–`9` 直选（多选 = 勾）· `空格` 选中 / 勾选 ·
 *    `Enter` 单选选中、多选确定 · `Esc` 跳过这一题。块出现时焦点落在第一个选项上
 *    （落在输入框上的话，用户打的「1」会变成一次选择）。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'

import {
  DURATION_MS,
  LIQUID_TIMING,
  motionTransition,
} from '@/constants/motion'
import { Check } from '@/components/icons'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorQuestionAnswer,
  StudioOperatorQuestionAnswered,
  StudioOperatorQuestionOption,
  StudioOperatorQuestionPrompt,
} from '@/types/studio-assistant-operator'

/** 数字直选到 9 —— 选项最多 6 个（`ASSISTANT_PLAN_CARD_LIMITS`），9 是键盘的头。 */
const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

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

interface StudioOperatorQuestionBlockProps {
  prompt: StudioOperatorQuestionPrompt
  /** 输入框里有没有字 —— 多选一项没勾时，有字也能按「确定」（选项 + 补的那句并存）。 */
  hasDraft: boolean
  /** 单选选中一项，或「跳过」（`optionIds` 空）。 */
  onAnswer(answer: StudioOperatorQuestionAnswer): void
  /** 多选「确定」—— 面板把输入框里那句一起带上。 */
  onConfirm(optionIds: readonly string[]): void
  /** 勾选变了（多选）—— 写回 store。 */
  onCheckedChange(optionIds: readonly string[]): void
  /** 「全部用推荐」。 */
  onUseRecommended(): void
  /** 「← 上一题」——第一题上不画（判据在这颗组件里，⛔ 不在 hook 里再判一次）。 */
  onBack(): void
  /** 「其他…」—— 把焦点交给输入框。 */
  onOther(): void
}

export function StudioOperatorQuestionBlock({
  prompt,
  hasDraft,
  onAnswer,
  onConfirm,
  onCheckedChange,
  onUseRecommended,
  onBack,
  onOther,
}: StudioOperatorQuestionBlockProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  /** ⭐ 当前是第几题 = 已答几道（⛔ 不另存一个下标，见 prompt 的头注）。 */
  const step = prompt.answers.length
  const question = prompt.questions[step]
  const total = prompt.questions.length
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  /** 键盘高亮落在第几行（选项之后那一行是「其他…」）。 */
  const [cursor, setCursor] = useState(0)
  /**
   * 交过一次了 —— 从这一刻起不可再点（2026-09-07 真机）。
   * ⚠ 块答完就换题，但**换题是下一帧的事**：少了这一格，用户连点两下会把同一题
   * 答两遍（第二下落在还没换掉的那一题上）。
   */
  const [submitted, setSubmitted] = useState(false)
  /**
   * 单选刚被选中的那一行（owner 2026-10-07 动效第 2 批「点一行就进下一题」）：
   * 那一行先变成近黑实底、编号键帽按下去，停一拍再换题。减少动效时不停这一拍。
   */
  const [picked, setPicked] = useState<string | null>(null)
  const pickTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (pickTimer.current !== null) window.clearTimeout(pickTimer.current)
    },
    [],
  )

  /**
   * ⭐ **块出现时焦点落在第一个选项上**：键盘 1–9 / ↑↓ 要生效，焦点就不能留在
   * 输入框上；落在选项上读屏也能直接念出「单选 / 复选，第 1 项」。
   * ⚠ 换一题是**换一次挂载**（面板给这颗组件的 `key` 带着题序）：临时态因此自己
   * 就清了，⛔ 不用在 effect 里 setState。
   */
  useEffect(() => {
    rowRefs.current[0]?.focus()
  }, [])

  if (!question) return null

  const options = orderOptions(question.options)
  /** 覆盖三选永远单选：三档互斥，回执只带一档。 */
  const multi = question.multiSelect && !prompt.overwrite
  const allowOther = question.allowOther !== false
  const rowCount = options.length + (allowOther ? 1 : 0)
  const checked = new Set(prompt.checked ?? [])
  const checkedIds = options
    .filter((option) => checked.has(option.id))
    .map((option) => option.id)
  const canConfirm = checkedIds.length > 0 || hasDraft
  const hasRecommended = prompt.questions
    .slice(step)
    .some((item) => item.options.some((option) => option.recommended))

  const moveTo = (index: number) => {
    setCursor(index)
    rowRefs.current[index]?.focus()
  }

  const submit = (answer: StudioOperatorQuestionAnswer) => {
    if (submitted) return
    setSubmitted(true)
    onAnswer(answer)
  }

  const pickOption = (option: StudioOperatorQuestionOption) => {
    if (submitted) return
    setSubmitted(true)
    setPicked(option.id)
    const send = () =>
      onAnswer({ questionId: question.id, optionIds: [option.id] })
    if (reduceMotion) {
      send()
      return
    }
    pickTimer.current = window.setTimeout(() => {
      pickTimer.current = null
      send()
    }, DURATION_MS.fast)
  }

  const toggleOption = (option: StudioOperatorQuestionOption) => {
    if (submitted) return
    const next = checked.has(option.id)
      ? checkedIds.filter((id) => id !== option.id)
      : [...checkedIds, option.id]
    onCheckedChange(
      options.filter((item) => next.includes(item.id)).map((item) => item.id),
    )
  }

  const choose = (option: StudioOperatorQuestionOption) =>
    multi ? toggleOption(option) : pickOption(option)

  const confirm = () => {
    if (submitted || !canConfirm) return
    setSubmitted(true)
    onConfirm(checkedIds)
  }

  const skip = () => submit({ questionId: question.id, optionIds: [] })

  const applyRecommended = () => {
    if (submitted) return
    setSubmitted(true)
    onUseRecommended()
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      skip()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo(
        event.key === 'ArrowDown'
          ? (cursor + 1) % rowCount
          : (cursor <= 0 ? rowCount : cursor) - 1,
      )
      return
    }
    const option = options[cursor]
    if (event.key === ' ') {
      event.preventDefault()
      if (option) choose(option)
      else onOther()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!option) onOther()
      else if (multi) confirm()
      else pickOption(option)
      return
    }
    const digit = DIGIT_KEYS.indexOf(event.key)
    const target = options[digit]
    if (digit >= 0 && target) {
      event.preventDefault()
      setCursor(digit)
      choose(target)
    }
  }

  const answerLabel = (item: StudioOperatorQuestionAnswered) => {
    const other = item.answer.otherText?.trim()
    const parts = [...item.labels, ...(other ? [other] : [])]
    return parts.length ? format.list(parts) : t('question.skipped')
  }

  return (
    <motion.div
      /**
       * 问题从输入框里**长出来**（owner 2026-10-07 动效方向）：每道题都是新挂上的
       * （key 带题号），所以每进一题都由糊变清地进来 —— 第一题往上浮一下，
       * 之后每一题从右边糊进来（「点一行就进下一题」）。只有进场：答完整块
       * 立即让位给输入框，⛔ 不套 `AnimatePresence`（见 `BlurSwap` 头注）。
       */
      initial={
        reduceMotion
          ? false
          : {
              opacity: 0,
              ...(step === 0 ? { y: 6 } : { x: 12 }),
              filter: `blur(${LIQUID_TIMING.blurPx}px)`,
            }
      }
      animate={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
      transition={motionTransition('base', reduceMotion)}
      data-testid="operator-question-block"
      data-step={step + 1}
      data-total={total}
      data-multi={multi ? 'true' : 'false'}
      className="flex min-w-0 flex-col gap-0.5 pt-0.5"
    >
      {/* ── 已答的题：一行「问题 · 答案」，最近那一行可「改」（Q8 / S4）─── */}
      {prompt.answers.map((item, index) => (
        <p
          key={`${item.header}:${index}`}
          data-testid="operator-question-answer-tag"
          className="flex min-w-0 items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground"
        >
          <span className="shrink-0">{item.header}</span>
          <span aria-hidden>·</span>
          <span className="min-w-0 truncate text-foreground">
            {answerLabel(item)}
          </span>
          {index === prompt.answers.length - 1 ? (
            <button
              type="button"
              data-testid="operator-question-back"
              onClick={onBack}
              className="shrink-0 rounded-sm text-muted-foreground/80 transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              {t('question.edit')}
            </button>
          ) : null}
        </p>
      ))}

      <div className="flex min-w-0 items-baseline gap-2 px-1 pb-1">
        <p
          id={`${prompt.id}-${step}-question`}
          className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground"
        >
          {question.question}
        </p>
        {multi ? (
          <span
            data-testid="operator-question-multi-hint"
            className="shrink-0 text-2xs text-muted-foreground"
          >
            {t('question.multiHint')}
          </span>
        ) : null}
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

      {/* ⚠ 竖排一行一个；编号即键盘直选键。单选 = radiogroup，多选 = 一组 checkbox。
          ⛔ 不预选（Q5）。焦点是「漫游」的：只有光标那一行在 Tab 序里。 */}
      <div
        role={multi ? 'group' : 'radiogroup'}
        aria-labelledby={`${prompt.id}-${step}-question`}
        data-testid="operator-question-options"
        className="flex min-w-0 flex-col gap-0.5"
      >
        {options.map((option, index) => {
          const isChecked = multi
            ? checked.has(option.id)
            : picked === option.id
          return (
            <div
              key={option.id}
              ref={(node) => {
                rowRefs.current[index] = node
              }}
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={isChecked}
              aria-disabled={submitted || undefined}
              tabIndex={cursor === index ? 0 : -1}
              data-testid="operator-question-option"
              data-option-id={option.id}
              data-index={index}
              data-cursor={cursor === index ? 'true' : 'false'}
              data-picked={picked === option.id ? 'true' : 'false'}
              onMouseEnter={() => setCursor(index)}
              onFocus={() => setCursor(index)}
              onClick={() => choose(option)}
              onKeyDown={onRowKeyDown}
              className={cn(
                'flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-disabled:cursor-default aria-disabled:opacity-60 motion-reduce:transition-none coarse:min-h-11',
                cursor === index && 'bg-muted',
                // 单选选中那一行：近黑实底 + 白字（信号位，§12.2），⛔ 不跟着锁定变淡。
                picked === option.id &&
                  'bg-foreground text-background aria-disabled:opacity-100',
              )}
            >
              {multi ? (
                <span
                  aria-hidden
                  data-testid="operator-question-checkbox"
                  className={cn(
                    'mt-px grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-fast ease-standard motion-reduce:transition-none',
                    isChecked
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-transparent',
                  )}
                >
                  <Check className="size-3.5" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'mt-px grid size-5 shrink-0 place-items-center rounded-md border border-border font-mono text-2xs tabular-nums text-muted-foreground transition-transform duration-fast ease-standard motion-reduce:transition-none',
                    // 键帽按下去（「按数字键直选」）。
                    picked === option.id &&
                      'scale-90 border-background/40 text-background',
                  )}
                >
                  {index + 1}
                </span>
              )}
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
                  <span
                    className={cn(
                      'min-w-0 text-sm font-medium text-foreground',
                      picked === option.id && 'text-background',
                    )}
                  >
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
                  <span
                    className={cn(
                      'text-xs leading-relaxed text-muted-foreground',
                      picked === option.id && 'text-background/70',
                    )}
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>

      {/* 「其他…」= 下面那一行输入框（Q6）：点它只是把焦点交过去。闭集题不画。 */}
      {allowOther ? (
        <div
          ref={(node) => {
            rowRefs.current[options.length] = node
          }}
          role="button"
          tabIndex={cursor === options.length ? 0 : -1}
          data-testid="operator-question-other"
          data-cursor={cursor === options.length ? 'true' : 'false'}
          onMouseEnter={() => setCursor(options.length)}
          onFocus={() => setCursor(options.length)}
          onClick={onOther}
          onKeyDown={onRowKeyDown}
          className={cn(
            'flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none coarse:min-h-11',
            cursor === options.length && 'bg-muted',
          )}
        >
          <span
            aria-hidden
            className="mt-px grid size-5 shrink-0 place-items-center rounded-md border border-dashed border-border text-2xs text-muted-foreground"
          >
            …
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {t('question.other')}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {t('question.otherHint')}
            </span>
          </span>
        </div>
      ) : null}

      {/* ── 底下一行：跳过 · 全部用推荐 ……（多选）确定（N）──────────── */}
      <div className="mx-1 mt-1 flex min-w-0 items-center gap-3 border-t border-border pt-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          data-testid="operator-question-skip"
          disabled={submitted}
          onClick={skip}
          className="rounded-sm transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none coarse:min-h-11"
        >
          {t('question.skip')}
        </button>
        {hasRecommended ? (
          <button
            type="button"
            data-testid="operator-question-use-recommended"
            disabled={submitted}
            onClick={applyRecommended}
            className="rounded-sm transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none coarse:min-h-11"
          >
            {t('question.useRecommended')}
          </button>
        ) : null}
        {multi ? (
          <button
            type="button"
            data-testid="operator-question-confirm"
            disabled={submitted || !canConfirm}
            onClick={confirm}
            className="ml-auto h-7.5 rounded-full bg-foreground px-3.5 text-2sm font-semibold tabular-nums text-background transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none coarse:min-h-11"
          >
            {t('question.confirm', { count: checkedIds.length })}
          </button>
        ) : null}
      </div>
    </motion.div>
  )
}
