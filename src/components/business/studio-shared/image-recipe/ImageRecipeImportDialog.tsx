'use client'

import { useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getNovelAiCharacterLayoutMode } from '@/constants/novelai'
import { useStudioForm } from '@/contexts/studio-context'
import type { ImageRecipeReading } from '@/types/image-recipe'
import {
  closeImageRecipeImport,
  useImageRecipeImport,
} from '@/hooks/use-image-recipe-import'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import {
  applyImageRecipe,
  imageRecipeRows,
  type ImageRecipeRow,
  type ImageRecipeRowKey,
} from '@/lib/image-recipe-import'
import { Button } from '@/components/ui/button'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'

/**
 * 「从图读串」勾选框（owner 2026-10-25 定 C · A · A）：键和拖放都落到这里；勾上的整格替换，
 * 导入后一条带「撤回」的提示；没配方时是 Tagger 认出的画师 / 角色 / 特征。
 * 两台共用：标签台能摆角色就进角色构图，图片台（或模型不支持）角色接进正面。
 */
export function ImageRecipeImportDialog() {
  const t = useTranslations('ImageRecipeImport')
  const tErrors = useTranslations('Errors')
  const importState = useImageRecipeImport()
  const open = importState.status !== 'idle'

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeImageRecipeImport()
      }}
    >
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader className="flex-row items-center gap-3 text-left">
          {open ? (
            // eslint-disable-next-line @next/next/no-img-element -- 本地 blob 预览，不经图片优化
            <img
              src={importState.previewUrl}
              alt=""
              className="h-16 w-12 shrink-0 rounded-lg bg-muted object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <ResponsiveDialogTitle>{t('title')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="truncate">
              {importState.status === 'ready' && importState.reading
                ? sourceLine(importState.reading, t('noRecipe'))
                : importState.status === 'error'
                  ? getApiErrorMessage(
                      tErrors,
                      importState.error ?? {},
                      tErrors('imageRecipe.readFailed'),
                    )
                  : t('reading')}
            </ResponsiveDialogDescription>
          </div>
        </ResponsiveDialogHeader>
        {importState.status === 'reading' ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-5 text-muted-foreground" aria-hidden />
          </div>
        ) : importState.status === 'ready' && importState.reading ? (
          <RecipeRows
            key={importState.previewUrl}
            reading={importState.reading}
          />
        ) : (
          <ResponsiveDialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={closeImageRecipeImport}
            >
              {t('cancel')}
            </Button>
          </ResponsiveDialogFooter>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function sourceLine(reading: ImageRecipeReading, noRecipe: string): string {
  const recipe = reading.recipe
  if (!recipe) return noRecipe
  const source = recipe.source === 'novelai' ? 'NovelAI' : 'A1111 / Forge'
  return recipe.model && !recipe.model.startsWith(source)
    ? `${source} · ${recipe.model}`
    : (recipe.model ?? source)
}

function RecipeRows({ reading }: { reading: ImageRecipeReading }) {
  const t = useTranslations('ImageRecipeImport')
  const { state, dispatch } = useStudioForm()
  const { runModels } = useStudioRunModels()
  const idPrefix = useId()

  // 角色构图只在标签台、且这一轮有能摆角色的模型时成立。
  const characterModelId =
    state.promptDialect === 'tags'
      ? runModels.find((model) => getNovelAiCharacterLayoutMode(model.modelId))
          ?.modelId
      : undefined
  const rows = useMemo(
    () => imageRecipeRows(reading, (count) => t('steps', { count })),
    [reading, t],
  )
  const [selected, setSelected] = useState<ReadonlySet<ImageRecipeRowKey>>(
    () => new Set(rows.filter((row) => row.defaultOn).map((row) => row.key)),
  )
  const toggle = (key: ImageRecipeRowKey) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const label = (row: ImageRecipeRow) => {
    const count = row.count ?? 0
    if (row.key === 'characters')
      return characterModelId
        ? t('characters', { count })
        : t('charactersMerged', { count })
    if (row.key === 'general') return t('general', { count })
    return t(row.key)
  }

  const submit = () => {
    const before = {
      prompt: state.prompt,
      advancedParams: state.advancedParams,
      aspectRatio: state.aspectRatio,
    }
    const next = applyImageRecipe(reading, selected, before, characterModelId)
    dispatch({ type: 'SET_PROMPT', payload: next.prompt })
    dispatch({ type: 'SET_ADVANCED_PARAMS', payload: next.advancedParams })
    dispatch({ type: 'SET_ASPECT_RATIO', payload: next.aspectRatio })
    closeImageRecipeImport()
    focusStudioPrompt()
    toast(t('imported'), {
      action: {
        label: t('undo'),
        onClick: () => {
          dispatch({ type: 'SET_PROMPT', payload: before.prompt })
          dispatch({
            type: 'SET_ADVANCED_PARAMS',
            payload: before.advancedParams,
          })
          dispatch({ type: 'SET_ASPECT_RATIO', payload: before.aspectRatio })
        },
      },
    })
  }

  return (
    <>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t('nothing')}
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const id = `${idPrefix}-${row.key}`
            return (
              <li
                key={row.key}
                className="flex min-w-0 items-center gap-2.5 border-t border-border py-2.5"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={selected.has(row.key)}
                  onChange={() => toggle(row.key)}
                  className="size-4 shrink-0 accent-primary"
                />
                <label
                  htmlFor={id}
                  className="shrink-0 text-sm whitespace-nowrap"
                >
                  {label(row)}
                </label>
                <span
                  title={row.preview}
                  className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                >
                  {row.preview}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <ResponsiveDialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={closeImageRecipeImport}
        >
          {t('cancel')}
        </Button>
        <Button type="button" disabled={selected.size === 0} onClick={submit}>
          {t('import')}
        </Button>
      </ResponsiveDialogFooter>
    </>
  )
}
