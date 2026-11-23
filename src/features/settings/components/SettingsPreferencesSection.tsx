'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from '@/components/icons'

import { PROFILE } from '@/constants/config'
import { FEEDBACK_TIMING } from '@/constants/motion'
import { SETTINGS_PREFERENCE_KEYS } from '@/features/settings/constants'
import { isNotificationSupported } from '@/features/settings/hooks/use-app-preference-effects'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { useMyProfile } from '@/hooks/use-my-profile'
import { updateProfileAPI } from '@/lib/api-client'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { BlurSwap } from '@/components/ui/blur-swap'
import { SettingsRow, SettingsRows } from '@/components/ui/settings-section'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { useErrorText } from '@/hooks/use-error-text'

/**
 * `/settings/preferences`（D3 ④）——语言 · 显示名 · 生成完成时通知 · 减少动效。
 *
 * 语言与显示名接的是**现成的那两条路**（`LocaleSwitcher` / `updateProfileAPI`）；
 * 后两项没有服务端形状，落在既有的 localStorage 偏好机制上，⛔ 不新开一张表。
 * 它们在哪里生效：`features/settings/hooks/use-app-preference-effects.ts`（`MainProviders` 调）。
 * ⚠「默认打开」已删（2026-11-19）：`/studio` 首页就是助手创作首页，这一项没有语义。
 *
 * 动效（owner 2026-10-08 设置页原型 v1）：开关拨子走 `--spring-slot`
 * （`Switch` 自带）；显示名失焦即存，框边先转圈再闪「✓ 已保存」，⛔ 不弹提示。
 */
export function SettingsPreferencesSection() {
  const t = useTranslations('Settings')

  return (
    <section>
      {/* 手机顶栏已写着分区名（`SettingsShell`）：这里只留给读屏，⛔ 叠两个同名标题。 */}
      <h2 className="text-xl font-semibold max-lg:sr-only">
        {t('sections.preferences')}
      </h2>
      <SettingsPreferenceRows className="mt-4 overflow-hidden rounded-16 border border-border/70 bg-card px-4 shadow-ring" />
    </section>
  )
}

/**
 * 偏好那几行本身 —— 桌面分区页与手机「我的」（一级列表里就地摊开，iOS 稿
 * owner 2026-10-16）共用这一份，⛔ 不另抄一套控件。
 */
export function SettingsPreferenceRows({ className }: { className?: string }) {
  const t = useTranslations('Settings')

  return (
    <SettingsRows className={className}>
      <SettingsRow label={t('preferences.language')}>
        <LocaleSwitcher size="compact" />
      </SettingsRow>
      <SettingsRow label={t('preferences.displayName')}>
        <DisplayNameField />
      </SettingsRow>
      <NotifyOnCompleteRow />
      <SettingsRow label={t('preferences.reduceMotion')}>
        <BooleanPreference
          storageKey={SETTINGS_PREFERENCE_KEYS.reduceMotion}
          ariaLabel={t('preferences.reduceMotion')}
        />
      </SettingsRow>
    </SettingsRows>
  )
}

const subscribeNothing = () => () => {}

/**
 * 「生成完成时通知」：浏览器没有通知这件事就整行不出；打开那一刻才请求权限，
 * 被拒就把开关弹回关，并在标签下说一句为什么。生效处见 `useGenerationCompleteNotifier`。
 */
function NotifyOnCompleteRow() {
  const t = useTranslations('Settings')
  // 服务端没有 `Notification`：首帧按「不支持」渲染，水化后再出，⛔ hydration mismatch。
  const supported = useSyncExternalStore(
    subscribeNothing,
    isNotificationSupported,
    () => false,
  )
  const [value, setValue] = useLocalPreference(
    SETTINGS_PREFERENCE_KEYS.notifyOnComplete,
  )
  const [denied, setDenied] = useState(false)

  const onCheckedChange = useCallback(
    async (checked: boolean) => {
      if (!checked) {
        setValue('0')
        return
      }
      setDenied(false)
      // 先拨上，等权限弹窗的结果；被拒再弹回去。
      setValue('1')
      let permission: NotificationPermission = Notification.permission
      if (permission === 'default') {
        try {
          permission = await Notification.requestPermission()
        } catch {
          permission = 'denied'
        }
      }
      if (permission !== 'granted') {
        setValue('0')
        setDenied(true)
      }
    },
    [setValue],
  )

  if (!supported) return null

  return (
    <SettingsRow
      label={t('preferences.notifyOnComplete')}
      description={
        <span
          role={denied ? 'alert' : undefined}
          className={cn(denied && 'text-destructive')}
        >
          {denied
            ? t('preferences.notifyDenied')
            : t('preferences.notifyOnCompleteHint')}
        </span>
      }
    >
      <Switch
        checked={value === '1'}
        onCheckedChange={(checked) => void onCheckedChange(checked)}
        aria-label={t('preferences.notifyOnComplete')}
      />
    </SettingsRow>
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

type SaveMark = 'saving' | 'saved' | null

function DisplayNameField() {
  const t = useTranslations('Settings')
  const errText = useErrorText()
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
    toastError(errText.api(result, t('preferences.displayNameFailed')))
  }, [errText, profile?.displayName, refresh, t, value])

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
      <Input
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
        className="h-8 w-44 px-2.5 text-right"
      />
    </span>
  )
}
