'use client'

import { useTranslations } from 'next-intl'

import { ArrowRight } from '@/components/icons'
import {
  getPromptDialect,
  type PromptDialect,
} from '@/constants/prompt-dialects'
import { ROUTES } from '@/constants/routes'
import { useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useRouter } from '@/i18n/navigation'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type { StudioModelOption } from '@/types/model-option'

const DIALECT_ROUTES: Record<PromptDialect, string> = {
  natural: ROUTES.STUDIO_IMAGE,
  tags: ROUTES.STUDIO_IMAGE_TAGS,
}

interface StudioDialectJumpHintProps {
  /** 选择器里当前搜的那一串。 */
  query: string
  /** 点完之后把弹层收起来 —— 页面要换了，弹层留在原地是个孤儿。 */
  close: () => void
}

/**
 * 「这是标签模型，带你去标签台 →」（D10 ④ 两台跳转）。
 *
 * 两台的选择器**各只列自己方言的型号**，所以对面的型号在名单里根本不存在。
 * 真要在这一台搜到它时，给一行「带你过去」而不是让人对着空结果发呆。
 *
 * 点了之后三件事一起发生：**选中那个型号** · **带走已填的提示词** · **换路由**。
 * ⚠ 带走的那句整句进正向栏第一格，⛔ 不自动切成标签。
 */
export function StudioDialectJumpHint({
  query,
  close,
}: StudioDialectJumpHintProps) {
  const t = useTranslations('StudioTags')
  const tModels = useTranslations('Models')
  const router = useRouter()
  const { state, dispatch } = useStudioForm()
  const { modelOptions } = useImageModelOptions()

  const needle = query.trim().toLowerCase()
  const target: StudioModelOption | undefined = needle
    ? modelOptions.find(
        (option) =>
          getPromptDialect(option.adapterType) !== state.promptDialect &&
          (getTranslatedModelLabel(tModels, option.modelId)
            .toLowerCase()
            .includes(needle) ||
            option.modelId.toLowerCase().includes(needle)),
      )
    : undefined

  if (!target) return null

  const targetDialect = getPromptDialect(target.adapterType)

  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: 'SET_OPTION_ID', payload: target.optionId })
        // ⚠ 先带走提示词再换路由：落地那一侧的 `SET_PROMPT_DIALECT` 只在 chip
        // 还空着时自己播种，已经有 chip 时它不动手 —— 「带走」这件事得由这里
        // 明确说一次。
        if (targetDialect === 'tags') {
          dispatch({ type: 'CARRY_PROMPT_TO_TAGS' })
        }
        close()
        router.push(DIALECT_ROUTES[targetDialect])
      }}
      className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-2.5 pb-1 pt-2 text-left text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate">
        {t(targetDialect === 'tags' ? 'jumpToTags' : 'jumpToNatural', {
          model: getTranslatedModelLabel(tModels, target.modelId),
        })}
      </span>
      <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
    </button>
  )
}
