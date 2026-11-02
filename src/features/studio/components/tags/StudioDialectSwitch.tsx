'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  PROMPT_DIALECTS,
  PROMPT_DIALECT_ROUTES,
  type PromptDialect,
} from '@/constants/prompt-dialects'
import { useStudioForm } from '@/contexts/studio-context'
import { useRouter } from '@/i18n/navigation'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

/**
 * 自然语言 · 标签 —— 两台之间**唯一**的门（D10 ④）。
 *
 * ⚠ 它换的是**路由**，不是一个本地开关：方言由路由说了算，浏览器前进后退
 * 因此也落在对的那一台上。两台同壳（`(workspace)/layout.tsx`），所以这一跳
 * 不重挂 provider；目标工作台恢复自己的草稿，在飞生成继续由原 provider 追踪。
 *
 * 液态分段（owner 2026-09-26）：点下去**当场**就走，不等路由换完 —— 路由报回来
 * 之前先按点中的那一台画（`pending`），报回来就以路由为准。
 */
export function StudioDialectSwitch({
  disabled,
  editing = false,
  onEdit,
  onGenerate,
}: {
  disabled?: boolean
  editing?: boolean
  onEdit?: () => void
  onGenerate?: () => void
}) {
  const t = useTranslations('StudioTags')
  const tEdit = useTranslations('StudioImageEdit')
  const router = useRouter()
  const { state } = useStudioForm()
  const [pending, setPending] = useState<PromptDialect | null>(null)
  // 路由一变（点过去落地了，或前进 / 后退）就作废手里那一格。
  const [routed, setRouted] = useState(state.promptDialect)
  if (routed !== state.promptDialect) {
    setRouted(state.promptDialect)
    setPending(null)
  }

  return (
    <LiquidSegmented
      ariaLabel={t('dialectSwitchLabel')}
      disabled={disabled}
      value={editing ? 'edit' : (pending ?? state.promptDialect)}
      items={[
        ...PROMPT_DIALECTS.map((dialect) => ({
          value: dialect,
          label: t(`dialect.${dialect}`),
        })),
        ...(onEdit
          ? [{ value: 'edit' as const, label: tEdit('editMode') }]
          : []),
      ]}
      onChange={(dialect) => {
        if (dialect === 'edit') {
          onEdit?.()
          return
        }
        onGenerate?.()
        setPending(dialect)
        router.push(PROMPT_DIALECT_ROUTES[dialect])
      }}
    />
  )
}
