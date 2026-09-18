'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { PROFILE } from '@/constants/config'
import {
  SETTINGS_DEFAULT_WORKBENCH_OPTIONS,
  SETTINGS_PREFERENCE_KEYS,
  isSettingsDefaultWorkbench,
} from '@/constants/settings'
import { ROUTES } from '@/constants/routes'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { useMyProfile } from '@/hooks/use-my-profile'
import { updateProfileAPI } from '@/lib/api-client'

import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

/**
 * `/settings/preferences`（D3 ④）——语言 · 显示名 · 默认打开的工作台 ·
 * 生成完成时通知 · 减少动效。
 *
 * 语言与显示名接的是**现成的那两条路**（`LocaleSwitcher` / `updateProfileAPI`）；
 * 后三项没有服务端形状，落在既有的 localStorage 偏好机制上，⛔ 不新开一张表。
 */
export function SettingsPreferencesSection() {
  const t = useTranslations('Settings')

  return (
    <section>
      <h2 className="text-xl font-semibold">{t('sections.preferences')}</h2>
      <div className="mt-3 flex flex-col">
        <PreferenceRow label={t('preferences.language')}>
          <LocaleSwitcher size="compact" />
        </PreferenceRow>
        <PreferenceRow label={t('preferences.displayName')}>
          <DisplayNameField />
        </PreferenceRow>
        <PreferenceRow label={t('preferences.defaultWorkbench')}>
          <DefaultWorkbenchField />
        </PreferenceRow>
        <PreferenceRow label={t('preferences.notifyOnComplete')}>
          <BooleanPreference
            storageKey={SETTINGS_PREFERENCE_KEYS.notifyOnComplete}
            ariaLabel={t('preferences.notifyOnComplete')}
          />
        </PreferenceRow>
        <PreferenceRow label={t('preferences.reduceMotion')}>
          <BooleanPreference
            storageKey={SETTINGS_PREFERENCE_KEYS.reduceMotion}
            ariaLabel={t('preferences.reduceMotion')}
          />
        </PreferenceRow>
      </div>
    </section>
  )
}

function PreferenceRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-border py-3 text-sm">
      <span>{label}</span>
      {children}
    </div>
  )
}

/** 开关型偏好。localStorage 存的是 `'1'` / `'0'`，缺省 = 关。 */
export function BooleanPreference({
  storageKey,
  ariaLabel,
}: {
  storageKey: string
  ariaLabel: string
}) {
  const [value, setValue] = useLocalPreference(storageKey)

  return (
    <Switch
      checked={value === '1'}
      onCheckedChange={(checked) => setValue(checked ? '1' : '0')}
      aria-label={ariaLabel}
    />
  )
}

function DefaultWorkbenchField() {
  const t = useTranslations('Settings')
  const [value, setValue] = useLocalPreference(
    SETTINGS_PREFERENCE_KEYS.defaultWorkbench,
  )
  const current = isSettingsDefaultWorkbench(value)
    ? value
    : ROUTES.STUDIO_IMAGE

  return (
    <Select value={current} onValueChange={setValue}>
      <SelectTrigger size="sm" className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SETTINGS_DEFAULT_WORKBENCH_OPTIONS.map((route) => (
          <SelectItem key={route} value={route}>
            {t(`preferences.workbench.${route}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function DisplayNameField() {
  const t = useTranslations('Settings')
  const { profile, refresh } = useMyProfile()
  const [draft, setDraft] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const value = draft ?? profile?.displayName ?? ''

  const commit = useCallback(async () => {
    const next = value.trim()
    if (next === (profile?.displayName ?? '')) {
      setDraft(null)
      return
    }
    setIsSaving(true)
    const result = await updateProfileAPI({ displayName: next || null })
    setIsSaving(false)
    if (result.success) {
      setDraft(null)
      void refresh()
      toast.success(t('preferences.displayNameSaved'))
      return
    }
    toast.error(result.error ?? t('preferences.displayNameFailed'))
  }, [profile?.displayName, refresh, t, value])

  return (
    <input
      type="text"
      value={value}
      disabled={isSaving}
      maxLength={PROFILE.DISPLAY_NAME_MAX_LENGTH}
      aria-label={t('preferences.displayName')}
      placeholder={t('preferences.displayNamePlaceholder')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(null)
      }}
      className="h-8 w-44 rounded-md border border-border bg-background px-2.5 text-right text-xs transition-colors duration-fast focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  )
}
