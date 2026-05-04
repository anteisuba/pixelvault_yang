'use client'

import { memo, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StudioPronunciationEditorProps {
  dictionary: Record<string, string>
  onChange: (dictionary: Record<string, string>) => void
}

interface PronunciationRow {
  id: string
  word: string
  pronunciation: string
}

const DRAFT_PREFIX = 'draft:'

function isDraftRow(row: PronunciationRow): boolean {
  return row.id.startsWith(DRAFT_PREFIX)
}

function toDictionary(rows: PronunciationRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const word = row.word.trim()
    const pronunciation = row.pronunciation.trim()
    if (word && pronunciation) {
      acc[word] = pronunciation
    }
    return acc
  }, {})
}

export const StudioPronunciationEditor = memo(
  function StudioPronunciationEditor({
    dictionary,
    onChange,
  }: StudioPronunciationEditorProps) {
    const t = useTranslations('audioParams')
    const nextDraftId = useRef(0)
    const [draftRows, setDraftRows] = useState<PronunciationRow[]>([])

    const dictionaryRows = useMemo(
      () =>
        Object.entries(dictionary).map(([word, pronunciation]) => ({
          id: `entry:${word}`,
          word,
          pronunciation,
        })),
      [dictionary],
    )
    const rows = useMemo(
      () => [...dictionaryRows, ...draftRows],
      [dictionaryRows, draftRows],
    )

    const updateRow = (
      rowId: string,
      patch: Partial<Pick<PronunciationRow, 'word' | 'pronunciation'>>,
    ) => {
      const nextRows = rows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      )
      setDraftRows(nextRows.filter(isDraftRow))
      onChange(toDictionary(nextRows))
    }

    const deleteRow = (rowId: string) => {
      const nextRows = rows.filter((row) => row.id !== rowId)
      setDraftRows(nextRows.filter(isDraftRow))
      onChange(toDictionary(nextRows))
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-foreground">
            {t('pronunciation')}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const id = `${DRAFT_PREFIX}${nextDraftId.current}`
              nextDraftId.current += 1
              setDraftRows((current) => [
                ...current,
                { id, word: '', pronunciation: '' },
              ])
            }}
            className="h-8 rounded-full text-xs"
          >
            <Plus className="size-3.5" />
            {t('addWord')}
          </Button>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={row.word}
                onChange={(event) =>
                  updateRow(row.id, { word: event.target.value })
                }
                aria-label={t('word')}
                placeholder={t('word')}
                className="h-9 flex-1 text-xs"
              />
              <Input
                value={row.pronunciation}
                onChange={(event) =>
                  updateRow(row.id, { pronunciation: event.target.value })
                }
                aria-label={t('pronounceAs')}
                placeholder={t('pronounceAs')}
                className="h-9 flex-1 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => deleteRow(row.id)}
                aria-label={t('deleteWord')}
                className="size-9 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    )
  },
)
