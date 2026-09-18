'use client'

import {
  SETTINGS_SECTION_IDS,
  type SettingsSection,
} from '@/constants/settings'

import { SettingsAssistantSection } from '@/components/business/settings/SettingsAssistantSection'
import { SettingsKeysSection } from '@/components/business/settings/SettingsKeysSection'
import { SettingsPreferencesSection } from '@/components/business/settings/SettingsPreferencesSection'
import { SettingsShell } from '@/components/business/settings/SettingsShell'
import { SettingsUsageSection } from '@/components/business/settings/SettingsUsageSection'

/** 四个分区共用同一个外壳；⛔ 每个分区别各画一遍导航。 */
export function SettingsSectionView({ section }: { section: SettingsSection }) {
  return (
    <SettingsShell section={section}>
      {section === SETTINGS_SECTION_IDS.keys ? <SettingsKeysSection /> : null}
      {section === SETTINGS_SECTION_IDS.usage ? <SettingsUsageSection /> : null}
      {section === SETTINGS_SECTION_IDS.preferences ? (
        <SettingsPreferencesSection />
      ) : null}
      {section === SETTINGS_SECTION_IDS.assistant ? (
        <SettingsAssistantSection />
      ) : null}
    </SettingsShell>
  )
}
