'use client'

import { useCallback, useState } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import {
  ASSISTANT_SETTINGS_SECTIONS,
  AssistantSettings,
  type AssistantSettingsSection,
} from '@/components/business/assistant-settings/AssistantSettings'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from '@/components/ui/responsive-dialog'

/**
 * 助手设置弹窗（助手设置 B，owner 2026-09-26）—— 工作台右上角头像 ⋯ 的
 * 「助手设置」开的就是它；内容与 `/settings/assistant` 是**同一份**
 * （`AssistantSettings`），这里只管外壳：桌面 720 宽的弹窗、手机底部抽屉。
 *
 * ⚠ 桌面档**钉住上沿**（`lg:top-16`，⛔ 不上下居中）：两页高度不同，居中时一换页
 * 上下两条边一起跳；钉住上沿就只有下沿在动（动效表「切页」）。
 * ⚠ 打开时焦点落在弹窗本身，⛔ 不落到第一颗页签上：从 ⋯ 菜单点进来时浏览器按
 * 键盘路径算 focus-visible，页签会被框上一圈粗环（owner 2026-09-26 截图）。
 */

interface AssistantSettingsDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** 开在哪一页（规则薄卡的「查看规则」直接落到记忆页）。缺省是人设页。 */
  section?: AssistantSettingsSection
}

/**
 * 高度上限，三项取最小：`95svh` 与 `100svh - --keyboard-inset` 是移动抽屉本来的
 * 两条（软键盘弹起时抽屉不被顶穿）；桌面档再扣掉上下各 4rem 的边（钉在 top-16）。
 */
const DESKTOP_MAX_HEIGHT = 'min(95svh, calc(100dvh - 8rem))'
const MOBILE_MAX_HEIGHT =
  'min(95svh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))'

export function AssistantSettingsDialog({
  open,
  onOpenChange,
  section = ASSISTANT_SETTINGS_SECTIONS.persona,
}: AssistantSettingsDialogProps) {
  const isMobile = useIsMobile()
  /**
   * 当前这一页 = **入参 + 用户在弹窗里点过的那一次**。⛔ 不是 `useState(section)`
   * 的副本：弹窗关着时也挂在树上，那份副本只在首次挂载时抄一次 —— 表现是「点规则
   * 薄卡的『查看规则』，开出来的是人设页」。
   */
  const [tabOverride, setTabOverride] =
    useState<AssistantSettingsSection | null>(null)
  const tab = tabOverride ?? section

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // 关掉时把覆盖清掉：下一次调用方说开哪页就开哪页。
      if (!next) setTabOverride(null)
      onOpenChange(next)
    },
    [onOpenChange],
  )

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent
        showCloseButton={false}
        data-testid="assistant-settings-dialog"
        className="flex flex-col gap-0 overflow-hidden p-0 lg:top-16 lg:max-w-180 lg:translate-y-0 lg:rounded-2xl"
        style={{ maxHeight: isMobile ? MOBILE_MAX_HEIGHT : DESKTOP_MAX_HEIGHT }}
        mobileBodyClassName="px-0 pt-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (event.currentTarget instanceof HTMLElement) {
            event.currentTarget.focus()
          }
        }}
      >
        <AssistantSettings
          variant="dialog"
          section={tab}
          onSectionChange={setTabOverride}
          onClose={() => handleOpenChange(false)}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
