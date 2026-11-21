'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { STUDIO_REMIX_QUERY, STUDIO_TEMPLATE_QUERY } from '@/constants/routes'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { requestApiKeysNow } from '@/hooks/use-api-keys'
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

export type StudioArrivalKind = 'remix' | 'template'

/** 取回来的东西：模板原样交出；做同款留一个「拿到这一台名单再拼」的函数。 */
type ArrivalPayload =
  | { kind: 'template'; recipe: RecipeRecord }
  | {
      kind: 'remix'
      build: (options: StudioModelOption[]) => StudioRemixPreset
    }
  | { kind: 'failed'; target: StudioArrivalKind }

async function fetchArrival(
  kind: StudioArrivalKind,
  id: string,
): Promise<ArrivalPayload> {
  if (kind === 'template') {
    const response = await getRecipeAPI(id)
    return response.success && response.data
      ? { kind: 'template', recipe: response.data }
      : { kind: 'failed', target: kind }
  }
  const own = await fetchGenerationByIdAPI(id)
  if (own.success)
    return {
      kind: 'remix',
      build: (options) => buildStudioRemixPreset(own.data, options),
    }
  const shared = await fetchGenerationReplayAPI(id)
  return shared.success
    ? {
        kind: 'remix',
        build: (options) => buildReplayStudioPreset(shared.data, options),
      }
    : { kind: 'failed', target: kind }
}

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
 * 套上后都亮同一条「已套用 · 撤销」；套上那一刻把参数拿掉 —— 刷新不再重套。
 *
 * 时间线（owner 11-21 真机：页面到位后还要等 ~3 秒、期间显示旧草稿）：
 * - 一看到参数**立刻**并行做两件事：取配方 / 模板，喊 key 名单「现在就要」
 *   （`requestApiKeysNow`，平时它让到浏览器空闲才拉）。
 * - 套用仍等这一台**全部就位**再一次套完：`ready`（草稿已回灌）+ key 名单 + 这一台的
 *   模型名单。⚠ 型号与缺 key 都要名单才判得出 —— ⛔ 先套其余字段、型号后补：那样
 *   撤销快照拍不到型号那一下，缺 key 弹框也会晚一拍跳出来。
 * - 等待期间返回 `arriving`，宿主在输入区盖一层「正在取回设置…」并让输入框不可编辑，
 *   免得用户在旧草稿上打字然后被整份换掉。
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
}): { arriving: StudioArrivalKind | null } {
  const t = useTranslations('StudioTemplates')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { hasLoaded: keysLoaded } = useApiKeysContext()
  const remixId = searchParams.get(STUDIO_REMIX_QUERY)
  const templateId = searchParams.get(STUDIO_TEMPLATE_QUERY)
  const target: { kind: StudioArrivalKind; id: string } | null = remixId
    ? { kind: 'remix', id: remixId }
    : templateId
      ? { kind: 'template', id: templateId }
      : null
  const targetKey = target ? `${target.kind}:${target.id}` : null

  /** 正在等的那一次（`key` 防同一个参数取两遍；套完 / 失败后置空）。 */
  const [inflight, setInflight] = useState<{
    key: string
    kind: StudioArrivalKind
    payload: ArrivalPayload | null
  } | null>(null)
  const started = useRef<string | null>(null)

  // 一看到参数就开取，并喊 key 名单别等空闲。
  useEffect(() => {
    if (!target || !targetKey || started.current === targetKey) return
    started.current = targetKey
    requestApiKeysNow()
    const { kind, id } = target
    setInflight({ key: targetKey, kind, payload: null })
    // ⛔ 不在 cleanup 里作废：StrictMode 的「挂 → 卸 → 再挂」第二遍被 `started` 拦下，
    //   作废了就永远等不到。换了参数由 `key` 比对丢掉旧的那份。
    void fetchArrival(kind, id).then((payload) => {
      setInflight((current) =>
        current?.key === targetKey ? { ...current, payload } : current,
      )
    })
    // `target` 由 `targetKey` 决定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  // 回来那一刻用最新的套用函数（撤销快照才是套用前那一刻的）。
  const latest = useRef({ applyTemplate, applyRemix, t })
  useEffect(() => {
    latest.current = { applyTemplate, applyRemix, t }
  })

  const canApply = ready && keysLoaded && modelOptions.length > 0
  const payload = inflight?.payload ?? null

  useEffect(() => {
    if (!inflight || !payload || !canApply) return
    setInflight(null)
    const query = new URLSearchParams(searchParams.toString())
    query.delete(STUDIO_REMIX_QUERY)
    query.delete(STUDIO_TEMPLATE_QUERY)
    const rest = query.toString()
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })

    if (payload.kind === 'failed') {
      toast.error(
        latest.current.t(
          payload.target === 'template' ? 'loadFailed' : 'remixLoadFailed',
        ),
      )
      return
    }
    if (payload.kind === 'template') {
      latest.current.applyTemplate(payload.recipe)
      return
    }
    latest.current.applyRemix(
      payload.build(modelOptions),
      latest.current.t('appliedRemix'),
    )
  }, [
    canApply,
    inflight,
    modelOptions,
    payload,
    pathname,
    router,
    searchParams,
  ])

  return { arriving: inflight?.kind ?? null }
}
