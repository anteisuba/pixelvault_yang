'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from '@/components/icons'

import { PROFILE } from '@/constants/config'
import { FEEDBACK_TIMING } from '@/constants/motion'
import {
  SETTINGS_DEFAULT_WORKBENCH_OPTIONS,
  SETTINGS_PREFERENCE_KEYS,
  isSettingsDefaultWorkbench,
} from '@/constants/settings'
import { ROUTES } from '@/constants/routes'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { useMyProfile } from '@/hooks/use-my-profile'
import { updateProfileAPI } from '@/lib/api-client'
import { toastError } from '@/lib/toast'

import { SettingsDeleteAccountRow } from '@/components/business/settings/SettingsDeleteAccountRow'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { BlurSwap } from '@/components/ui/blur-swap'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'

/**
 * `/settings/preferences`（D3 ④）——语言 · 显示名 · 默认打开的工作台 ·
 * 生成完成时通知 · 减少动效；最底一行「注销账号」（`SettingsDeleteAccountRow`）。
 *
 * 语言与显示名接的是**现成的那两条路**（`LocaleSwitcher` / `updateProfileAPI`）；
 * 后三项没有服务端形状，落在既有的 localStorage 偏好机制上，⛔ 不新开一张表。
 *
 * 动效（owner 2026-10-08 设置页原型 v1，控件照旧是开关 + 下拉）：下拉从触发器弹簧
 * 放大出来（`SelectContent motionPreset="spring"`）；开关拨子走 `--spring-slot`
 * （`Switch` 自带）；显示名失焦即存，框边先转圈再闪「✓ 已保存」，⛔ 不弹提示。
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
        <SettingsDeleteAccountRow />
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
      <SelectContent motionPreset="spring">
        {SETTINGS_DEFAULT_WORKBENCH_OPTIONS.map((route) => (
          <SelectItem key={route} value={route}>
            {t(`preferences.workbench.${route}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type SaveMark = 'saving' | 'saved' | null

function DisplayNameField() {
  const t = useTranslations('Settings')
  const { profile, refresh } = useMyProfile()
  const [draft, setDraft] = useState<string | null>(null)
  const [mark, setMark] = useState<SaveMark>(null)
  const value = draft ?? profile?.displayName ?? ''

  // 「✓ 已保存」闪一下就走（与键上结果同一段停留）。
  useEffect(() => {
    if (mark !== 'saved') return
    const timer = window.setTimeout(
      () => setMark(null),
      FEEDBACK_TIMING.buttonAckMs,
    )
    return () => window.clearTimeout(timer)
  }, [mark])

  const commit = useCallback(async () => {
    const next = value.trim()
    if (next === (profile?.displayName ?? '')) {
      setDraft(null)
      return
    }
    setMark('saving')
    const result = await updateProfileAPI({ displayName: next || null })
    if (result.success) {
      setDraft(null)
      setMark('saved')
      void refresh()
      return
    }
    setMark(null)
    toastError(result.error ?? t('preferences.displayNameFailed'))
  }, [profile?.displayName, refresh, t, value])

  return (
    <span className="flex items-center gap-2">
      <span
        data-testid="display-name-mark"
        className="inline-flex min-w-4 items-center justify-end text-xs text-muted-foreground"
      >
        {mark ? (
          <BlurSwap swapKey={mark} className="gap-1">
            {mark === 'saving' ? (
              <Spinner size="sm" />
            ) : (
              <>
                <Check className="size-3.5" aria-hidden />
                {t('preferences.saved')}
              </>
            )}
          </BlurSwap>
        ) : null}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {mark === 'saving'
          ? t('preferences.saving')
          : mark === 'saved'
            ? t('preferences.saved')
            : ''}
      </span>
      <input
        type="text"
        value={value}
        disabled={mark === 'saving'}
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
    </span>
  )
}
