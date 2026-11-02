'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { AssistantOperatorCharacterProfileFieldDraft } from '@/types/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'
import { cn } from '@/lib/utils'

/**
 * **设定提议卡**（卡片助手 C2，画板 S6 / S13）。
 *
 * ⭐ 每格一个勾、下面一行来源；助手补的那几句浅底标出，那一格可以「只留我写的」。
 *   「收下勾选的」交给驱动 hook → 角色页写进这个角色；「不用」什么都不写。
 * ⚠ 勾选态与「只留我写的」住在**这张卡自己的组件态**里（判据同 LoRA 推荐卡）：
 *   它们是一次还没提交的编辑，⛔ 不进 store。
 * ⚠ 已决之后整卡收成一行「态 · 时间」（确认卡不离场）。
 */

type CharacterProfilePrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterProfile }
>

export interface StudioOperatorCharacterProfileCardProps {
  prompt: CharacterProfilePrompt
  /** 这位角色叫什么（从宿主快照查；查不到时退回 id）。 */
  characterName: string
  assistantName: string
  onKeep(fields: readonly AssistantOperatorCharacterProfileFieldDraft[]): void
  onDismiss(): void
  formatTime(iso: string): string
}

/** 按「助手补的」那几句把正文切成段（只认第一次出现；对不上的规划器已经丢掉）。 */
function segments(
  text: string,
  added: readonly string[] | undefined,
): { text: string; added: boolean }[] {
  if (!added?.length) return [{ text, added: false }]
  const marks = added
    .map((span) => ({ span, at: text.indexOf(span) }))
    .filter((mark) => mark.at >= 0)
    .sort((a, b) => a.at - b.at)
  const out: { text: string; added: boolean }[] = []
  let cursor = 0
  for (const { span, at } of marks) {
    if (at < cursor) continue
    if (at > cursor) out.push({ text: text.slice(cursor, at), added: false })
    out.push({ text: span, added: true })
    cursor = at + span.length
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), added: false })
  return out
}

/** 「只留我写的」= 去掉助手补的那几句。 */
export function ownWordsOnly(
  text: string,
  added: readonly string[] | undefined,
): string {
  return segments(text, added)
    .filter((part) => !part.added)
    .map((part) => part.text)
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function StudioOperatorCharacterProfileCard({
  prompt,
  characterName,
  assistantName,
  onKeep,
  onDismiss,
  formatTime,
}: StudioOperatorCharacterProfileCardProps) {
  const t = useTranslations('StudioOperator')
  const fields = prompt.profile.fields
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(fields.map((item) => item.field)),
  )
  const [ownOnly, setOwnOnly] = useState<Set<string>>(() => new Set())
  const status = prompt.status
  const submitting = status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  const decided =
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled

  const picked = useMemo(
    () =>
      fields
        .filter((item) => checked.has(item.field))
        .map((item) =>
          ownOnly.has(item.field)
            ? { ...item, text: ownWordsOnly(item.text, item.added), added: [] }
            : item,
        )
        .filter((item) => item.text.length > 0),
    [checked, fields, ownOnly],
  )

  if (decided) {
    const time = prompt.decidedAt ? formatTime(prompt.decidedAt) : ''
    return (
      <section
        data-testid="operator-character-profile-card"
        data-status={status}
        className="overflow-hidden rounded-xl bg-card"
      >
        <p className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground">
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
              ? t('confirm.characterProfile.kept', {
                  count: prompt.keptCount ?? picked.length,
                  time,
                })
              : t('confirm.state.cancelled', { time })}
          </span>
          <span className="min-w-0 flex-1 truncate">{characterName}</span>
        </p>
      </section>
    )
  }

  const toggle = (
    set: Set<string>,
    update: (next: Set<string>) => void,
    key: string,
  ) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    update(next)
  }

  return (
    <section
      data-testid="operator-character-profile-card"
      data-status={status}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-2xs uppercase tracking-nav text-muted-foreground">
          {t('confirm.characterProfile.header', {
            name: assistantName,
            count: fields.length,
          })}
        </span>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2.5 p-3">
        <legend className="text-sm font-medium leading-snug text-foreground">
          {t('confirm.characterProfile.question', { name: characterName })}
        </legend>

        <div className="flex flex-col">
          {fields.map((item) => {
            const on = checked.has(item.field)
            const own = ownOnly.has(item.field)
            const hasAdded = Boolean(item.added?.length)
            const shown = own
              ? [{ text: ownWordsOnly(item.text, item.added), added: false }]
              : segments(item.text, item.added)
            return (
              <div
                key={item.field}
                data-testid="operator-character-profile-field"
                className="flex items-start gap-2.5 border-t border-border py-2.5 first:border-t-0"
              >
                <input
                  id={`character-profile-${prompt.id}-${item.field}`}
                  type="checkbox"
                  checked={on}
                  disabled={submitting}
                  onChange={() => toggle(checked, setChecked, item.field)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor={`character-profile-${prompt.id}-${item.field}`}
                    className="text-xs text-muted-foreground"
                  >
                    {t(`confirm.characterProfile.fields.${item.field}`)}
                  </label>
                  <p
                    className={cn(
                      'whitespace-pre-line text-sm leading-relaxed text-foreground',
                      !on && 'text-muted-foreground',
                    )}
                  >
                    {shown.map((part, index) =>
                      part.added ? (
                        <span
                          key={index}
                          className="rounded-sm bg-muted px-0.5"
                        >
                          {part.text}
                        </span>
                      ) : (
                        <span key={index}>{part.text}</span>
                      ),
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate underline-offset-2 hover:underline"
                      >
                        {item.source}
                      </a>
                    ) : (
                      <span className="truncate">{item.source}</span>
                    )}
                    {hasAdded ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => toggle(ownOnly, setOwnOnly, item.field)}
                        className="shrink-0 text-foreground underline-offset-2 hover:underline"
                      >
                        {own
                          ? t('confirm.characterProfile.keepAdded')
                          : t('confirm.characterProfile.ownWordsOnly')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2.5">
          <button
            type="button"
            disabled={submitting}
            onClick={onDismiss}
            className="rounded-md border border-border bg-card px-3 py-1 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {t('confirm.characterProfile.dismiss')}
          </button>
          <button
            type="button"
            data-testid="operator-character-profile-keep"
            disabled={picked.length === 0 || submitting}
            onClick={() => onKeep(picked)}
            className="rounded-md bg-primary px-3 py-1 text-2sm text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
          >
            {t('confirm.characterProfile.keep', { count: picked.length })}
          </button>
        </div>
      </fieldset>
    </section>
  )
}
