'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import {
  PROMPT_DIALECTS,
  PROMPT_DIALECT_ROUTES,
} from '@/constants/prompt-dialects'
import { useStudioForm } from '@/contexts/studio-context'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * 自然语言 · 标签 —— 两台之间**唯一**的门（D10 ④）。
 *
 * ⚠ 它换的是**路由**，不是一个本地开关：方言由路由说了算，浏览器前进后退
 * 因此也落在对的那一台上。两台同壳（`(workspace)/layout.tsx`），所以这一跳
 * 不重挂 provider —— 提示词 / 参考轨 / 结果区原样留着。
 */
export function StudioDialectSwitch({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('StudioTags')
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const { state } = useStudioForm()

  return (
    <div
      role="tablist"
      aria-label={t('dialectSwitchLabel')}
      className="inline-flex shrink-0 rounded-full border border-border bg-muted p-0.5"
    >
      {PROMPT_DIALECTS.map((dialect) => {
        const active = state.promptDialect === dialect
        return (
          <button
            key={dialect}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => {
              if (active) return
              router.push(PROMPT_DIALECT_ROUTES[dialect])
            }}
            className={cn(
              'relative rounded-full px-3.5 py-1 text-2xs transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
              active ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {active ? (
              <motion.span
                layoutId="studio-dialect-thumb"
                className="absolute inset-0 rounded-full bg-background shadow-sm"
                transition={motionTransition('base', reducedMotion)}
              />
            ) : null}
            <span className="relative">{t(`dialect.${dialect}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
