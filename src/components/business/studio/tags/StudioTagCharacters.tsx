'use client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { X } from '@/components/icons'
import { StudioTagChipField } from './StudioTagChipField'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'

export function StudioTagCharacters({
  disabled,
  onCompose,
  onLookup,
}: {
  disabled: boolean
  onCompose: () => void
  onLookup: () => void
}) {
  const t = useTranslations('StudioTags')
  const c = useNovelAiCharacters()
  if (!c.mode) return null
  return (
    <section className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {t('characterTitle')} · {c.characters.length}
        </h3>
        <Button variant="ghost" size="sm" onClick={onLookup}>
          {t('workbench.lookup')}
        </Button>
      </div>
      {c.characters.map((character, index) => (
        <div
          key={index}
          className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {t('workbench.characterNumber', { number: index + 1 })}
            </span>
            <div className="flex items-center gap-2">
              <Switch
                aria-label={t('workbench.enableCharacter', {
                  number: index + 1,
                })}
                checked={character.enabled !== false}
                disabled={disabled}
                onCheckedChange={(enabled) => c.update(index, { enabled })}
              />
              <Button
                size="icon"
                variant="ghost"
                disabled={disabled}
                aria-label={t('removeCharacter', { number: index + 1 })}
                onClick={() => c.remove(index)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <StudioTagChipField
            modelId={c.model?.modelId}
            label={t('characterPositiveLabel', { number: index + 1 })}
            polarity="positive"
            chips={parseTagChips(character.prompt)}
            disabled={disabled || character.enabled === false}
            onChange={(chips) =>
              c.update(index, { prompt: serializeTagChips(chips) })
            }
          />
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {t('negativeLabel')}
            </summary>
            <StudioTagChipField
              modelId={c.model?.modelId}
              label={t('negativeLabel')}
              polarity="negative"
              chips={parseTagChips(character.negativePrompt)}
              disabled={disabled || character.enabled === false}
              onChange={(chips) =>
                c.update(index, { negativePrompt: serializeTagChips(chips) })
              }
            />
          </details>
        </div>
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || c.characters.length >= c.max}
          onClick={c.add}
        >
          {t('addCharacter')}
        </Button>
        <Button variant="outline" size="sm" onClick={onCompose}>
          {t('workbench.compose')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          c.layout?.positioning === 'manual'
            ? 'workbench.manual'
            : 'workbench.auto',
        )}
      </p>
    </section>
  )
}
