'use client'

import { useState } from 'react'

import {
  ASSISTANT_SETTINGS_SECTIONS,
  AssistantSettings,
  type AssistantSettingsSection,
} from '@/components/business/assistant-settings/AssistantSettings'

/**
 * `/settings/assistant` —— 与工作台 ⋯「助手设置」弹窗**同一份内容**
 * （助手设置 B，owner 2026-09-26：收成一份，两个入口）。这里只给它一个整页外壳。
 */
export function SettingsAssistantSection() {
  const [section, setSection] = useState<AssistantSettingsSection>(
    ASSISTANT_SETTINGS_SECTIONS.persona,
  )
  return (
    <AssistantSettings
      variant="page"
      section={section}
      onSectionChange={setSection}
    />
  )
}
