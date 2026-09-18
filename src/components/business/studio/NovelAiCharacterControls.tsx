'use client'

import { useTranslations } from 'next-intl'
import {
  NOVELAI_V5_MAX_CHARACTERS,
  supportsNovelAiCharacters,
} from '@/constants/novelai'
import type { NovelAiCharacterLayout } from '@/types/novelai'

type Props = {
  modelId?: string
  value?: NovelAiCharacterLayout
  disabled?: boolean
  onChange: (value: NovelAiCharacterLayout | undefined) => void
}

export function NovelAiCharacterControls({
  modelId,
  value,
  disabled,
  onChange,
}: Props) {
  const t = useTranslations('NovelAiCharacters')
  if (!supportsNovelAiCharacters(modelId)) return null
  const characters = value?.characters ?? []
  const update = (
    index: number,
    patch: Partial<NovelAiCharacterLayout['characters'][number]>,
  ) => {
    if (!value) return
    onChange({
      ...value,
      characters: characters.map((character, i) =>
        i === index ? { ...character, ...patch } : character,
      ),
    })
  }
  const remove = (index: number) => {
    const next = characters.filter((_, i) => i !== index)
    onChange(
      next.length
        ? { positioning: value?.positioning ?? 'auto', characters: next }
        : undefined,
    )
  }
  return (
    <details className="max-h-[50dvh] overflow-y-auto rounded-lg border border-border bg-background p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t('title')}
        {characters.length ? ` (${characters.length})` : ''}
      </summary>
      <fieldset
        disabled={disabled}
        className="mt-3 space-y-3 disabled:opacity-50"
      >
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        {characters.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value?.positioning === 'manual'}
              onChange={(event) =>
                value &&
                onChange({
                  ...value,
                  positioning: event.target.checked ? 'manual' : 'auto',
                })
              }
            />
            {t('manual')}
          </label>
        )}
        {characters.map((character, index) => (
          <div
            key={index}
            className="space-y-2 rounded-md border border-border p-2"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{t('character', { number: index + 1 })}</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={index === 0}
                  className="disabled:opacity-40"
                  onClick={() => {
                    if (!value || index === 0) return
                    const next = [...characters]
                    ;[next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ]
                    onChange({ ...value, characters: next })
                  }}
                >
                  {t('up')}
                </button>
                <button type="button" onClick={() => remove(index)}>
                  {t('remove')}
                </button>
              </div>
            </div>
            <label className="block text-xs">
              {t('prompt')}
              <textarea
                rows={2}
                value={character.prompt}
                onChange={(event) =>
                  update(index, { prompt: event.target.value })
                }
                className="mt-1 w-full rounded border border-border bg-background p-2 text-base md:text-sm"
              />
            </label>
            <label className="block text-xs">
              {t('negative')}
              <textarea
                rows={2}
                value={character.negativePrompt}
                onChange={(event) =>
                  update(index, { negativePrompt: event.target.value })
                }
                className="mt-1 w-full rounded border border-border bg-background p-2 text-base md:text-sm"
              />
            </label>
            {value?.positioning === 'manual' && (
              <div className="grid grid-cols-2 gap-3">
                {(['x', 'y'] as const).map((axis) => (
                  <label key={axis} className="text-xs">
                    {t(axis)} · {Math.round(character.position[axis] * 100)}%
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={character.position[axis]}
                      onChange={(event) =>
                        update(index, {
                          position: {
                            ...character.position,
                            [axis]: Number(event.target.value),
                          },
                        })
                      }
                      className="mt-2 w-full"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          disabled={characters.length >= NOVELAI_V5_MAX_CHARACTERS}
          className="rounded border border-border px-3 py-2 text-sm disabled:opacity-40"
          onClick={() =>
            onChange({
              positioning: value?.positioning ?? 'auto',
              characters: [
                ...characters,
                {
                  prompt: '',
                  negativePrompt: '',
                  position: { x: 0.5, y: 0.5 },
                },
              ],
            })
          }
        >
          {t('add')}
        </button>
      </fieldset>
    </details>
  )
}
