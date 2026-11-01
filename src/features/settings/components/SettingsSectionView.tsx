'use client'

import {
  SETTINGS_SECTION_IDS,
  type SettingsSection,
} from '@/features/settings/constants'

import { SettingsAssistantSection } from '@/features/settings/components/SettingsAssistantSection'
import { SettingsConnectionsSection } from '@/features/settings/components/SettingsConnectionsSection'
import { SettingsKeysSection } from '@/features/settings/components/SettingsKeysSection'
import { SettingsPreferencesSection } from '@/features/settings/components/SettingsPreferencesSection'
import { SettingsUsageSection } from '@/features/settings/components/SettingsUsageSection'

/**
 * 五个分区的内容。外壳（导航 + 白卡）挂在 `settings/layout.tsx` 上，换分区时它不重挂，
 * 选中灰块才能滑过去；⛔ 每个分区别各画一遍导航。
 */
export function SettingsSectionView({ section }: { section: SettingsSection }) {
  return (
    <>
      {section === SETTINGS_SECTION_IDS.keys ? <SettingsKeysSection /> : null}
      {section === SETTINGS_SECTION_IDS.usage ? <SettingsUsageSection /> : null}
      {section === SETTINGS_SECTION_IDS.preferences ? (
        <SettingsPreferencesSection />
      ) : null}
      {section === SETTINGS_SECTION_IDS.assistant ? (
        <SettingsAssistantSection />
      ) : null}
      {section === SETTINGS_SECTION_IDS.connections ? (
        <SettingsConnectionsSection />
      ) : null}
    </>
  )
}
