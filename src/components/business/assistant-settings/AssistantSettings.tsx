'use client'

import { useTranslations } from 'next-intl'
import { X } from '@/components/icons'

import { useAssistantMemories } from '@/hooks/use-assistant-memories'
import { useAssistantPersonaAutosave } from '@/hooks/use-assistant-persona'
import { useIsMobile } from '@/hooks/use-mobile'
import { AssistantMemoryPane } from '@/components/business/assistant-settings/AssistantMemoryPane'
import { AssistantPersonaPane } from '@/components/business/assistant-settings/AssistantPersonaPane'
import { AssistantSaveStatus } from '@/components/business/assistant-settings/AssistantSaveStatus'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

/**
 * 助手设置（助手设置 B，owner 2026-09-26）—— **一份内容，两个入口**：
 * 工作台右上角头像 ⋯ 的「助手设置」弹出它（`AssistantSettingsDialog`），
 * `/settings/assistant` 整页打开它（`SettingsAssistantSection`）。
 *
 * 结构：顶部「人设 / 记忆」两页；改了就存，右上角一小行「已保存」；⛔ 没有
 * 「取消 / 保存」。手机上弹窗走底部抽屉（`ResponsiveDialog`），头部换成两行。
 */

export const ASSISTANT_SETTINGS_SECTIONS = {
  persona: 'persona',
  memory: 'memory',
} as const

export type AssistantSettingsSection =
  (typeof ASSISTANT_SETTINGS_SECTIONS)[keyof typeof ASSISTANT_SETTINGS_SECTIONS]

interface AssistantSettingsProps {
  /** `dialog` = 弹窗 / 手机抽屉（有标题与关闭）；`page` = 设置页里整页。 */
  variant: 'dialog' | 'page'
  section: AssistantSettingsSection
  onSectionChange(section: AssistantSettingsSection): void
  /** 弹窗右上角那颗关闭。 */
  onClose?(): void
}

export function AssistantSettings({
  variant,
  section,
  onSectionChange,
  onClose,
}: AssistantSettingsProps) {
  const t = useTranslations('AssistantSettings')
  const tSettings = useTranslations('Settings')
  const isMobile = useIsMobile()
  const autosave = useAssistantPersonaAutosave()
  /** 记忆那一页的数据住在这一层：页签上的条数要它。 */
  const memories = useAssistantMemories()
  const memoryCount = memories.memories.length

  const tabs = (
    <LiquidSegmented
      items={[
        {
          value: ASSISTANT_SETTINGS_SECTIONS.persona,
          label: t('tabs.persona'),
        },
        {
          value: ASSISTANT_SETTINGS_SECTIONS.memory,
          label:
            memoryCount > 0
              ? t('tabs.memoryCount', { count: memoryCount })
              : t('tabs.memory'),
        },
      ]}
      value={section}
      onChange={onSectionChange}
      ariaLabel={t('tabs.label')}
      size="md"
      fill={isMobile && variant === 'dialog'}
    />
  )
  const status = (
    <AssistantSaveStatus status={autosave.status} onRetry={autosave.retry} />
  )
  const closeButton = onClose ? (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('close')}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-linear hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:size-11"
    >
      <X className="size-4" aria-hidden />
    </button>
  ) : null

  const pane =
    section === ASSISTANT_SETTINGS_SECTIONS.persona ? (
      <AssistantPersonaPane autosave={autosave} />
    ) : (
      <AssistantMemoryPane memories={memories} autosave={autosave} />
    )
  /** 切页：内容淡入（动效表：不左右推页，两页并列不分先后）。 */
  const body = (
    <div
      key={section}
      role="tabpanel"
      aria-label={
        section === ASSISTANT_SETTINGS_SECTIONS.persona
          ? t('tabs.persona')
          : t('tabs.memory')
      }
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base"
    >
      {pane}
    </div>
  )

  if (variant === 'page') {
    return (
      <section className="flex max-w-2xl flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold">
            {tSettings('sections.assistant')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('pageDescription')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tabs}
          <span className="flex-1" />
          {status}
        </div>
        <div data-assistant-settings-scroll className="pt-1">
          {body}
        </div>
      </section>
    )
  }

  const title = (
    <ResponsiveDialogTitle className="text-base font-semibold">
      {t('title')}
    </ResponsiveDialogTitle>
  )
  const description = (
    <ResponsiveDialogDescription className="sr-only">
      {t('description')}
    </ResponsiveDialogDescription>
  )

  if (isMobile) {
    return (
      <div className="flex flex-col">
        <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background pb-2">
          <div className="flex items-center gap-2 pl-5 pr-2">
            <div className="min-w-0 flex-1">{title}</div>
            {status}
            {closeButton}
          </div>
          {description}
          <div className="px-4">{tabs}</div>
        </div>
        <div className="px-4 pt-3 pb-8">{body}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 pl-7 pr-4">
        <div className="min-w-0 flex-1 basis-0">{title}</div>
        {description}
        {tabs}
        <div className="flex flex-1 basis-0 items-center justify-end gap-2.5">
          {status}
          {closeButton}
        </div>
      </div>
      <div
        data-assistant-settings-scroll
        className="min-h-0 flex-1 overflow-y-auto px-7 pt-1 pb-8"
      >
        {body}
      </div>
    </div>
  )
}
