'use client'

import { useTranslations } from 'next-intl'

import type { UseAssistantSkillMenuResult } from '@/hooks/use-assistant-skill-menu'
import { cn } from '@/lib/utils'

/**
 * 助手输入框的「/」技能菜单（第 7b 步）。和 `@` 菜单同一个位置、同一种样子：贴在输入框
 * 正上方（⛔ portal）；每一行 `onMouseDown` preventDefault，点下去输入框不失焦。
 */
export function StudioOperatorSkillMenu({
  menu,
}: {
  readonly menu: UseAssistantSkillMenuResult
}) {
  const t = useTranslations('StudioOperator')
  if (!menu.open) return null
  return (
    <div
      data-testid="operator-skill-menu"
      className="assistant-mention-menu absolute inset-x-0 bottom-full z-30 mb-2 flex overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        id={menu.listId}
        role="listbox"
        aria-label={t('skillMenu.label')}
        className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1"
      >
        {menu.options.map((skill, index) => (
          <button
            key={`${skill.origin}:${skill.slug}`}
            id={menu.optionId(index)}
            type="button"
            role="option"
            aria-selected={index === menu.activeIndex}
            onMouseEnter={() => menu.setActiveIndex(index)}
            onClick={() => menu.pick(skill)}
            className={cn(
              'flex min-h-11 w-full shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors duration-fast',
              index === menu.activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">/{skill.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {skill.description}
              </span>
            </span>
            <span className="shrink-0 text-2xs text-muted-foreground">
              {skill.origin === 'mine'
                ? t('skillMenu.mine')
                : t('skillMenu.builtin')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
