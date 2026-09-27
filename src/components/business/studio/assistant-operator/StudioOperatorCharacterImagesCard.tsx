'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { cn } from '@/lib/utils'

/**
 * **候选图卡**（卡片助手 C3，owner 09-27 选「助手交一张候选卡」）。
 *
 * ⭐ 与设定提议卡同一个做法：每张一个勾 · 一句为什么选它 · 一行出处（素材库 / 网站）；
 *   「挂上勾选的」交给驱动 hook → 网上那几张这时才存进素材库 → 角色页挂到角色上。
 * ⭐ 点缩略图 = 开灯箱看大图，⛔ 不算选（拍板 21：看与选是两件事）。
 * ⚠ 勾选态住在这张卡自己的组件态里（判据同 LoRA 推荐卡），⛔ 不进 store。
 * ⚠ 已决之后整卡收成一行「态 · 时间」（确认卡不离场）。
 */

type CharacterImagesPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterImages }
>

export interface StudioOperatorCharacterImagesCardProps {
  prompt: CharacterImagesPrompt
  /** 这位角色叫什么（从宿主快照查；查不到时退回 id）。 */
  characterName: string
  assistantName: string
  onKeep(keys: readonly string[]): void
  onDismiss(): void
  formatTime(iso: string): string
}

export function StudioOperatorCharacterImagesCard({
  prompt,
  characterName,
  assistantName,
  onKeep,
  onDismiss,
  formatTime,
}: StudioOperatorCharacterImagesCardProps) {
  const t = useTranslations('StudioOperator')
  const images = prompt.proposal.images
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(images.map((image) => image.key)),
  )
  const picked = useMemo(
    () => images.filter((image) => checked.has(image.key)).map((i) => i.key),
    [checked, images],
  )
  const status = prompt.status
  const submitting = status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  const decided =
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled

  if (decided) {
    const time = prompt.decidedAt ? formatTime(prompt.decidedAt) : ''
    return (
      <section
        data-testid="operator-character-images-card"
        data-status={status}
        className="overflow-hidden rounded-xl bg-card"
      >
        <p className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground">
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
              ? t('confirm.characterImages.kept', {
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

  const toggle = (key: string) => {
    const next = new Set(checked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChecked(next)
  }

  return (
    <section
      data-testid="operator-character-images-card"
      data-status={status}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-2xs uppercase tracking-nav text-muted-foreground">
          {t('confirm.characterImages.header', {
            name: assistantName,
            count: images.length,
          })}
        </span>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2.5 p-3">
        <legend className="text-sm font-medium leading-snug text-foreground">
          {t('confirm.characterImages.question', { name: characterName })}
        </legend>

        <div className="flex flex-col">
          {images.map((image) => {
            const on = checked.has(image.key)
            const id = `character-images-${prompt.id}-${image.key}`
            const source =
              image.source === 'library'
                ? image.displayName
                  ? t('confirm.characterImages.fromLibraryNamed', {
                      name: image.displayName,
                    })
                  : t('confirm.characterImages.fromLibrary')
                : (image.publisher ?? image.domain ?? t('web.publisherUnknown'))
            return (
              <div
                key={image.key}
                data-testid="operator-character-images-row"
                className="flex items-start gap-2.5 border-t border-border py-2.5 first:border-t-0"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  disabled={submitting}
                  onChange={() => toggle(image.key)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <button
                  type="button"
                  aria-label={t('web.viewLarge')}
                  onClick={() => openOperatorLightbox(image.url, image.reason)}
                  className="size-14 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 网上那几张是任意第三方图床，进不了 next.config 的 remotePatterns（同联网候选网格）。 */}
                  <img
                    src={image.thumbnailUrl ?? image.url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor={id}
                    className={cn(
                      'text-sm leading-snug text-foreground',
                      !on && 'text-muted-foreground',
                    )}
                  >
                    {image.reason}
                  </label>
                  {image.source === 'web' && image.pageUrl ? (
                    <a
                      href={image.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-fit max-w-full truncate text-2xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {source}
                    </a>
                  ) : (
                    <span className="truncate text-2xs text-muted-foreground">
                      {source}
                    </span>
                  )}
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
            {t('confirm.characterImages.dismiss')}
          </button>
          <button
            type="button"
            data-testid="operator-character-images-keep"
            disabled={picked.length === 0 || submitting}
            onClick={() => onKeep(picked)}
            className="rounded-md bg-primary px-3 py-1 text-2sm text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
          >
            {submitting
              ? t('confirm.characterImages.keeping')
              : t('confirm.characterImages.keep', { count: picked.length })}
          </button>
        </div>
      </fieldset>
    </section>
  )
}
