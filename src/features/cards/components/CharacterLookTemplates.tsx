'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { RecipeRecord } from '@/types'
import { MEDIA_TILE_CLASS, MediaTileShade } from '@/components/ui/media-tile'
import { Skeleton } from '@/components/ui/skeleton'
import { usePromptTemplateUse } from '@/features/prompts'
import {
  getRecipeTemplateKind,
  getTagTemplateSource,
} from '@/lib/recipe-template-kind'

type KindKey = 'tags' | 'lora' | 'image' | 'video' | 'audio' | 'model3d'

function kindKey(recipe: RecipeRecord): KindKey {
  const kind = getRecipeTemplateKind(recipe)
  if (kind === 'TAGS')
    return getTagTemplateSource(recipe) === 'lora' ? 'lora' : 'tags'
  if (kind === 'VIDEO') return 'video'
  if (kind === 'AUDIO') return 'audio'
  if (kind === 'MODEL_3D') return 'model3d'
  return 'image'
}

/**
 * 角色页「模板」页签右边：这套造型名下的模板（owner 11-01 定 C）。各台写法混着放，
 * 角上标写法；点一张 = 去对应的台套用（与提示词库「使用」同一条路）。
 */
export function CharacterLookTemplates({
  templates,
  isLoading,
}: {
  templates: readonly RecipeRecord[]
  isLoading: boolean
}) {
  const t = useTranslations('CharacterRoster.templates')
  const openTemplate = usePromptTemplateUse()

  if (isLoading && templates.length === 0)
    return (
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="aspect-3/4 rounded-12" />
        ))}
      </div>
    )

  if (templates.length === 0)
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>

  return (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 xl:grid-cols-6">
      {templates.map((recipe) => {
        const key = kindKey(recipe)
        return (
          <TemplateTile
            key={recipe.id}
            recipe={recipe}
            badge={t(`kind.${key}`)}
            onUse={() => {
              const ok = openTemplate(
                {
                  id: recipe.id,
                  templateKind: getRecipeTemplateKind(recipe),
                  compiledPrompt: recipe.compiledPrompt,
                },
                key === 'lora' ? 'lora' : 'tags',
              )
              if (!ok) toast.error(t('useFailed'))
            }}
            useLabel={t('use', { name: recipe.name })}
          />
        )
      })}
    </div>
  )
}

function TemplateTile({
  recipe,
  badge,
  onUse,
  useLabel,
}: {
  recipe: RecipeRecord
  badge: string
  onUse(): void
  useLabel: string
}) {
  const [failed, setFailed] = useState(false)
  const cover =
    recipe.coverThumbnailUrl && !failed ? recipe.coverThumbnailUrl : null
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        aria-label={useLabel}
        onClick={onUse}
        className={`${MEDIA_TILE_CLASS} aspect-3/4 text-left focus-visible:outline-none focus-visible:shadow-focus`}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 封面小图
          <img
            src={cover}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 line-clamp-6 p-3 text-2xs text-muted-foreground">
            {recipe.compiledPrompt}
          </span>
        )}
        <MediaTileShade />
        <span className="pointer-events-none absolute left-2 top-2 inline-flex h-5.5 items-center rounded-full bg-media-chip px-2 text-2xs font-medium text-on-media-chip">
          {badge}
        </span>
      </button>
      <span className="truncate text-xs">{recipe.name}</span>
    </div>
  )
}
