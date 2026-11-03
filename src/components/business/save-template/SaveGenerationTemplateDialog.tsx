'use client'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { GenerationRecord, RecipeLoraSetup } from '@/types'
import { createRecipeFromGenerationAPI } from '@/lib/api-client/recipes'
import { getDefaultTemplateName } from '@/lib/recipe-template-name'
import { useTemplateSaveExtras } from '@/hooks/use-template-save-extras'
import { useErrorText } from '@/hooks/use-error-text'
import {
  SaveTemplateDialog,
  type SaveTemplateOption,
} from './SaveTemplateDialog'

/**
 * 从一张出过的图存模板（查看器、LoRA 台结果图）：通用「存成模板」框 + 从这张图建。
 * 「存哪些」= 提示词（总存）· 负面 · 参数 · 参考图；LoRA 台多一格「LoRA 挂载」。
 */
export function SaveGenerationTemplateDialog({
  generation,
  open,
  onOpenChange,
  loraSetup,
  onSaved,
}: {
  /** 手上只有一部分也行（LoRA 台结果条没有提示词原文）：缺的那几格照样给勾。 */
  generation: Pick<GenerationRecord, 'id' | 'url'> &
    Partial<
      Pick<
        GenerationRecord,
        | 'thumbnailUrl'
        | 'prompt'
        | 'negativePrompt'
        | 'outputType'
        | 'referenceImages'
      >
    > & { name?: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  /** LoRA 台：这一张出图那一刻的整套挂载。 */
  loraSetup?: RecipeLoraSetup
  onSaved?: () => void
}) {
  const t = useTranslations('SaveTemplate.options')
  const tSave = useTranslations('SaveTemplate')
  const tPrompts = useTranslations('PromptLibrary')
  const errText = useErrorText()
  const applyExtras = useTemplateSaveExtras()
  const options: SaveTemplateOption[] = [
    { key: 'prompt', label: t('prompt'), locked: true },
    ...(loraSetup
      ? [
          {
            key: 'lora',
            label: t('lora'),
            detail: t('loraDetail', { count: loraSetup.items.length }),
          },
        ]
      : []),
    ...(generation.negativePrompt === undefined ||
    generation.negativePrompt?.trim()
      ? [{ key: 'negative', label: t('negative') }]
      : []),
    { key: 'params', label: t('params'), detail: t('paramsDetail') },
    ...(generation.referenceImages?.length
      ? [{ key: 'references', label: t('references') }]
      : []),
  ]
  const isImage = (generation.outputType ?? 'IMAGE') === 'IMAGE'
  return (
    <SaveTemplateDialog
      open={open}
      onOpenChange={onOpenChange}
      coverUrl={generation.thumbnailUrl ?? generation.url}
      defaultName={
        generation.name || getDefaultTemplateName(generation.prompt ?? '')
      }
      options={options}
      defaultLink={null}
      canAttachImage={isImage}
      onSave={async (result) => {
        const response = await createRecipeFromGenerationAPI({
          generationId: generation.id,
          name: result.name,
          ...(loraSetup && result.include.lora !== false ? { loraSetup } : {}),
          ...(result.link ? { characterLink: result.link } : {}),
          include: {
            negative: result.include.negative !== false,
            params: result.include.params !== false,
            references: result.include.references !== false,
          },
        })
        if (!response.success) {
          toast.error(errText.api(response, tPrompts('saveTemplateFailed')))
          return false
        }
        toast.success(tSave('saved'))
        await applyExtras({
          link: result.link,
          image: isImage
            ? { url: generation.url, generationId: generation.id }
            : null,
          images: result.alsoImages,
          stickers: result.alsoStickers,
        })
        onSaved?.()
        return true
      }}
    />
  )
}
