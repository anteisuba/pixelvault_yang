'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from '@/components/icons'

import {
  ASSISTANT_PERSONA_VERBOSITIES,
  type AssistantPersonaVerbosity,
} from '@/constants/assistant-persona'
import {
  SETTINGS_ASSISTANT_MUTED_PRESETS,
  SETTINGS_PREFERENCE_KEYS,
} from '@/constants/settings'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { cn } from '@/lib/utils'

import { Switch } from '@/components/ui/switch'

/**
 * `/settings/assistant`（D3 ④）。
 *
 * ⚠ 记忆那一块**只有 UI 与空态**：56 还没落数据形状，这里⛔ 不接假数据。
 * 隐身模式与「不记的类目」同样只存状态（既有的 localStorage 偏好机制），行为
 * 接入留给 56。
 */
export function SettingsAssistantSection() {
  const t = useTranslations('Settings')

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{t('sections.assistant')}</h2>
      <PersonaChips />
      <MemoryBlock />
      <MutedTopics />
    </section>
  )
}

function PersonaChips() {
  const t = useTranslations('Settings')
  const { persona, isSaving, save } = useAssistantPersona()

  const pick = useCallback(
    (verbosity: AssistantPersonaVerbosity) => {
      if (verbosity === persona.verbosity) return
      // ⚠ avatarUrl 不在写入 schema 里（它由头像上传那条路自己写）。
      const { avatarUrl, ...writable } = persona
      void avatarUrl
      void save({ ...writable, verbosity })
    },
    [persona, save],
  )

  return (
    <div>
      <p className="text-2xs uppercase tracking-nav text-muted-foreground">
        {t('assistant.personaLabel')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group">
        {ASSISTANT_PERSONA_VERBOSITIES.map((verbosity) => {
          const isActive = persona.verbosity === verbosity
          return (
            <button
              key={verbosity}
              type="button"
              disabled={isSaving}
              aria-pressed={isActive}
              onClick={() => pick(verbosity)}
              className={cn(
                'inline-flex h-8 items-center rounded-full px-3 text-xs transition-colors duration-fast active:scale-[.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border hover:bg-accent',
              )}
            >
              {t(`assistant.verbosity.${verbosity}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MemoryBlock() {
  const t = useTranslations('Settings')
  const [incognito, setIncognito] = useLocalPreference(
    SETTINGS_PREFERENCE_KEYS.assistantIncognito,
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-nav text-muted-foreground">
          {t('assistant.memoryLabel')}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('assistant.incognito')}
          <Switch
            size="sm"
            checked={incognito === '1'}
            onCheckedChange={(checked) => setIncognito(checked ? '1' : '0')}
            aria-label={t('assistant.incognito')}
          />
        </label>
      </div>
      {/* 56 未落数据形状 —— 这里只有空态，⛔ 不摆示例记忆。 */}
      <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        {t('assistant.memoryEmpty')}
      </p>
    </div>
  )
}

function MutedTopics() {
  const t = useTranslations('Settings')
  const [stored, setStored] = useLocalPreference(
    SETTINGS_PREFERENCE_KEYS.assistantMutedTopics,
  )
  const [draft, setDraft] = useState<string | null>(null)

  const topics = useMemo(
    () => (stored ? stored.split(',').filter(Boolean) : []),
    [stored],
  )

  const toggle = useCallback(
    (topic: string) => {
      const next = topics.includes(topic)
        ? topics.filter((item) => item !== topic)
        : [...topics, topic]
      setStored(next.join(','))
    },
    [setStored, topics],
  )

  const addCustom = useCallback(() => {
    const value = (draft ?? '').trim()
    setDraft(null)
    // 逗号是分隔符本身 —— 收下它会把一条类目劈成两条。
    if (!value || value.includes(',') || topics.includes(value)) return
    setStored([...topics, value].join(','))
  }, [draft, setStored, topics])

  const custom = topics.filter(
    (topic) =>
      !(SETTINGS_ASSISTANT_MUTED_PRESETS as readonly string[]).includes(topic),
  )

  return (
    <div>
      <p className="text-2xs uppercase tracking-nav text-muted-foreground">
        {t('assistant.mutedLabel')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SETTINGS_ASSISTANT_MUTED_PRESETS.map((preset) => (
          <TopicChip
            key={preset}
            label={t(`assistant.muted.${preset}`)}
            isActive={topics.includes(preset)}
            onClick={() => toggle(preset)}
          />
        ))}
        {custom.map((topic) => (
          <TopicChip
            key={topic}
            label={topic}
            isActive
            onClick={() => toggle(topic)}
          />
        ))}
        {draft === null ? (
          <button
            type="button"
            onClick={() => setDraft('')}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-3" />
            {t('assistant.addMuted')}
          </button>
        ) : (
          <input
            autoFocus
            type="text"
            value={draft}
            maxLength={24}
            aria-label={t('assistant.addMuted')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={addCustom}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setDraft(null)
            }}
            className="h-7 w-28 rounded-full border border-border bg-background px-2.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>
    </div>
  )
}

function TopicChip({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'inline-flex h-7 items-center rounded-full px-2.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-muted text-foreground'
          : 'border border-border text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  )
}
