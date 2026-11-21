'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { STUDIO_REMIX_QUERY, STUDIO_TEMPLATE_QUERY } from '@/constants/routes'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  fetchGenerationByIdAPI,
  fetchGenerationReplayAPI,
} from '@/lib/api-client'
import { getRecipeAPI } from '@/lib/api-client/recipes'
import {
  buildReplayStudioPreset,
  buildStudioRemixPreset,
  type StudioRemixPreset,
} from '@/lib/studio-remix'
import type { RecipeRecord } from '@/types'
import type { StudioModelOption } from '@/types/model-option'

/**
 * 「做同款 / 使用模板」跨页到达的**唯一**入口（工作台三台共用，`StudioWorkspaceUI` 挂一次）：
 *
 * - `?remix=<generationId>`（`studioRemixPath`）—— 先按本人取整行
 *   （`GET /api/generations/<id>`，只给主人，带快照与角色）；取不到（不是你的）再走
 *   公开配方（`GET /api/generations/<id>/replay`：公开或本人可见，提示词按
 *   `isPromptPublic` 抹）。⛔ 不放宽任何一处服务端归属校验。
 * - `?template=<recipeId>`（`studioTemplatePath`）—— 取模板交给 `applyTemplate`
 *   （标签模板在标签台照它自己的整组替换，其余与做同款同一个 `applyPreset`）。
 *
 * 套上后都亮同一条「已套用 · 撤销」；装一次就把参数拿掉 —— 刷新不再重套、盖掉后来的改动。
 * ⚠ 等这一台就位再套：`ready` = 草稿已回灌（`useStudioDraft` 的同一个门），且 key 名单
 *   与这一台的模型名单都回来了 —— 否则缺 key 判不出、型号对不上，或被草稿盖回去。
 */
export function useStudioArrival({
  ready,
  modelOptions,
  applyTemplate,
  applyRemix,
}: {
  ready: boolean
  modelOptions: StudioModelOption[]
  applyTemplate: (recipe: RecipeRecord) => void
  applyRemix: (preset: StudioRemixPreset, message: string) => void
}): void {
  const t = useTranslations('StudioTemplates')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { hasLoaded: keysLoaded } = useApiKeysContext()
  const remixId = searchParams.get(STUDIO_REMIX_QUERY)
  const templateId = searchParams.get(STUDIO_TEMPLATE_QUERY)

  // 回来那一刻用最新的套用函数与名单（撤销快照才是套用前那一刻的）。
  const latest = useRef({ modelOptions, applyTemplate, applyRemix, t })
  useEffect(() => {
    latest.current = { modelOptions, applyTemplate, applyRemix, t }
  })

  const handled = useRef<string | null>(null)
  const canApply = ready && keysLoaded && modelOptions.length > 0

  useEffect(() => {
    const target = remixId
      ? { kind: 'remix' as const, id: remixId }
      : templateId
        ? { kind: 'template' as const, id: templateId }
        : null
    if (!target || !canApply) return
    const key = `${target.kind}:${target.id}`
    if (handled.current === key) return
    handled.current = key

    const query = new URLSearchParams(searchParams.toString())
    query.delete(STUDIO_REMIX_QUERY)
    query.delete(STUDIO_TEMPLATE_QUERY)
    const rest = query.toString()
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })

    void (async () => {
      if (target.kind === 'template') {
        const response = await getRecipeAPI(target.id)
        if (response.success && response.data) {
          latest.current.applyTemplate(response.data)
        } else {
          toast.error(latest.current.t('loadFailed'))
        }
        return
      }
      const own = await fetchGenerationByIdAPI(target.id)
      const preset = own.success
        ? buildStudioRemixPreset(own.data, latest.current.modelOptions)
        : await fetchGenerationReplayAPI(target.id).then((shared) =>
            shared.success
              ? buildReplayStudioPreset(
                  shared.data,
                  latest.current.modelOptions,
                )
              : null,
          )
      if (!preset) {
        toast.error(latest.current.t('remixLoadFailed'))
        return
      }
      latest.current.applyRemix(preset, latest.current.t('appliedRemix'))
    })()
  }, [canApply, pathname, remixId, router, searchParams, templateId])
}
