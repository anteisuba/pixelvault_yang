'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { DANBOORU_REQUEST } from '@/constants/research'
import { useDanbooruCatalog } from '@/hooks/use-danbooru-catalog'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import type { DanbooruCatalogQuery } from '@/types/danbooru-catalog'

export function StudioDanbooruPanel() {
  const t = useTranslations('StudioTags.workbench')
  const { state, dispatch } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const c = useNovelAiCharacters()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<DanbooruCatalogQuery['kind']>('character')
  const [tag, setTag] = useState<string>()
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState('new')
  const [notice, setNotice] = useState('')
  const result = useDanbooruCatalog({ query, kind, tag })
  const detail = result.data?.detail
  const change = () => {
    setTag(undefined)
    setSelected([])
    setNotice('')
  }
  const apply = () => {
    if (!detail || !selected.length || isGenerating) return
    const incoming = selected.map((value) => value.replaceAll('_', ' '))
    if (kind === 'artist') {
      dispatch({
        type: 'SET_TAG_PROMPT_BLOCKS',
        payload: [
          ...(state.tagPromptBlocks ?? []),
          {
            id: crypto.randomUUID(),
            name: detail.tag,
            text: incoming.join(', '),
            enabled: true,
          },
        ],
      })
    } else if (target === 'new') {
      if (!c.mode || c.characters.length >= c.max) return
      c.setLayout({
        positioning: c.layout?.positioning ?? 'auto',
        characters: [
          ...c.characters,
          {
            prompt: incoming.join(', '),
            negativePrompt: '',
            position: { x: 0.5, y: 0.5 },
          },
        ],
      })
    } else {
      const index = Number(target)
      const character = c.characters[index]
      if (!character) return
      const chips = parseTagChips(character.prompt)
      const seen = new Set(
        chips.map((chip) => chip.text.toLowerCase().replaceAll('_', ' ')),
      )
      c.update(index, {
        prompt: serializeTagChips([
          ...chips,
          ...incoming
            .filter((text) => !seen.has(text.toLowerCase()))
            .map((text) => ({ text, weight: 1 })),
        ]),
      })
    }
    setNotice(t('applied'))
    setSelected([])
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['character', 'artist'] as const).map((value) => (
          <Button
            key={value}
            variant={kind === value ? 'default' : 'outline'}
            size="sm"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value)
              change()
            }}
          >
            {t(value)}
          </Button>
        ))}
      </div>
      <Input
        aria-label={t('search')}
        placeholder={t('search')}
        value={query}
        maxLength={100}
        onChange={(e) => {
          setQuery(e.target.value)
          change()
        }}
      />
      <p className="text-xs text-muted-foreground">{t('sourceHint')}</p>
      {result.loading ? <p role="status">{t('loading')}</p> : null}
      {result.error ? (
        <div role="alert">
          <p>{t('error')}</p>
          <Button variant="outline" onClick={result.retry}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
      {!result.loading &&
      !result.error &&
      result.data &&
      !detail &&
      !result.data.candidates.length ? (
        <p>{t('empty')}</p>
      ) : null}
      <div className="space-y-2">
        {result.data?.candidates.map((candidate) => (
          <button
            key={candidate.name}
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
            onClick={() => {
              setTag(candidate.name)
              setSelected([])
              setNotice('')
            }}
          >
            <span className="min-w-0 break-words">
              {candidate.name.replaceAll('_', ' ')}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t('postCount', { count: candidate.count })}
            </span>
          </button>
        ))}
      </div>
      {detail ? (
        <article className="space-y-4">
          <Button variant="ghost" size="sm" onClick={change}>
            {t('backToCandidates')}
          </Button>
          <h3 className="break-words font-medium">
            {detail.tag.replaceAll('_', ' ')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {detail.aliases.join(' · ')}
          </p>
          <a
            className="text-sm underline"
            href={`${DANBOORU_REQUEST.baseUrl}/posts?${new URLSearchParams({ tags: `${detail.tag} rating:g` })}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('viewSource')}
          </a>
          <div className="grid grid-cols-3 gap-2">
            {detail.images.map((image) => (
              <a
                key={image.id}
                href={`${DANBOORU_REQUEST.baseUrl}/posts/${image.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  unoptimized
                  src={image.url}
                  width={180}
                  height={180}
                  alt={t('sample', { id: image.id })}
                  className="aspect-square w-full rounded-lg object-contain"
                />
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('sampleHint', { count: detail.sampleSize })}
          </p>
          <div className="flex flex-wrap gap-2">
            {[detail.tag, ...detail.traits.map((item) => item.tag)].map(
              (value) => (
                <label
                  key={value}
                  className="flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, value]
                          : selected.filter((tag) => tag !== value),
                      )
                    }
                  />
                  <span className="break-words">
                    {value.replaceAll('_', ' ')}
                  </span>
                  {value !== detail.tag ? (
                    <span className="text-xs text-muted-foreground">
                      {detail.traits.find((item) => item.tag === value)?.count}/
                      {detail.sampleSize}
                    </span>
                  ) : null}
                </label>
              ),
            )}
          </div>
          {kind === 'character' ? (
            <label className="flex flex-col gap-2 text-sm">
              {t('target')}
              <select
                className="rounded-md border border-input bg-background p-2"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="new">{t('newCharacter')}</option>
                {c.characters.map((character, index) => (
                  <option key={index} value={index}>
                    {index + 1} ·{' '}
                    {character.prompt.split(',')[0] || t('newCharacter')}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            disabled={
              isGenerating ||
              !selected.length ||
              (kind === 'character' &&
                (!c.mode ||
                  (target === 'new'
                    ? c.characters.length >= c.max
                    : !c.characters[Number(target)])))
            }
            onClick={apply}
          >
            {t('applySelected')}
          </Button>
        </article>
      ) : null}
      <p aria-live="polite" className="text-sm">
        {notice}
      </p>
    </section>
  )
}
