'use client'

import {
  SETTINGS_SECTION_IDS,
  type SettingsSection,
} from '@/constants/settings'

import { SettingsAssistantSection } from '@/components/business/settings/SettingsAssistantSection'
import { SettingsConnectionsSection } from '@/components/business/settings/SettingsConnectionsSection'
import { SettingsKeysSection } from '@/components/business/settings/SettingsKeysSection'
import { SettingsPreferencesSection } from '@/components/business/settings/SettingsPreferencesSection'
import { SettingsUsageSection } from '@/components/business/settings/SettingsUsageSection'

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
