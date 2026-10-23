'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Download, Plus } from '@/components/icons'

import { ASSISTANT_SKILL_LIMITS } from '@/constants/assistant-skills'
import type { UseAssistantSkillsValue } from '@/hooks/use-assistant-skills'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { downloadSkillZip } from '@/lib/skill-export'
import { cn } from '@/lib/utils'
import type { AssistantSkillView } from '@/types/assistant-skill'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteButton } from '@/components/ui/feedback-button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

/**
 * 技能页（助手第 7b 步，owner 10-23）：内置 / 我的两组；每行开关；点开看全文和参考文件。
 *
 * ⭐ 内置的只能看，或「改成我的版本」（抄一份来改；删掉你那份 = 回到内置原样）。
 * ⭐ 我的能改、能删；助手不会自己读，只在你打「/名字」时用。
 * ⭐ 每份都能导出成标准 SKILL.md 包（zip），拿到别的 AI 里直接用。
 * ⚠ 先做功能，样子用现有组件拼（同 LoRA 收藏那一步），统一库组件时再整理。
 */

type Editing =
  | { mode: 'new' }
  | { mode: 'edit'; skill: AssistantSkillView }
  | { mode: 'override'; skill: AssistantSkillView }

export function AssistantSkillsPane({
  skills: store,
}: {
  skills: UseAssistantSkillsValue
}) {
  const t = useTranslations('AssistantSettings')
  const tErrors = useTranslations('Errors')
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)

  const builtins = store.skills.filter((skill) => skill.origin !== 'mine')
  const mine = store.skills.filter((skill) => skill.origin === 'mine')
  const errorText = store.error
    ? getApiErrorMessage(
        tErrors,
        store.error.i18nKey ? { i18nKey: store.error.i18nKey } : {},
        t('skills.failed'),
      )
    : null

  const toggle = (skill: AssistantSkillView, enabled: boolean) =>
    skill.origin === 'mine' || (skill.origin === 'override' && skill.id)
      ? store.update(skill.id!, { enabled })
      : store.setBuiltinEnabled(skill.slug, enabled)

  const row = (skill: AssistantSkillView) => (
    <SkillRow
      key={`${skill.origin}:${skill.slug}`}
      skill={skill}
      open={openSlug === `${skill.origin}:${skill.slug}`}
      onOpenChange={(open) =>
        setOpenSlug(open ? `${skill.origin}:${skill.slug}` : null)
      }
      onToggle={(enabled) => void toggle(skill, enabled)}
      onEdit={() =>
        setEditing(
          skill.origin === 'builtin'
            ? { mode: 'override', skill }
            : { mode: 'edit', skill },
        )
      }
      onRemove={skill.id ? () => void store.remove(skill.id!) : undefined}
    />
  )

  if (editing)
    return (
      <SkillEditor
        editing={editing}
        error={errorText}
        onCancel={() => setEditing(null)}
        onSave={async (input) => {
          const ok =
            editing.mode === 'new'
              ? await store.create(input)
              : editing.mode === 'override'
                ? await store.overrideBuiltin(editing.skill.slug, input)
                : await store.update(editing.skill.id!, {
                    ...(editing.skill.origin === 'mine'
                      ? { name: input.name }
                      : {}),
                    description: input.description,
                    body: input.body,
                  })
          if (ok) setEditing(null)
        }}
      />
    )

  return (
    <section aria-label={t('tabs.skills')} className="flex flex-col gap-4">
      {errorText ? (
        <p role="alert" className="text-2sm text-status-risk">
          {errorText}
        </p>
      ) : null}

      {store.isLoading && store.skills.length === 0 ? (
        <p className="text-2sm text-muted-foreground">{t('skills.loading')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-2sm font-medium text-muted-foreground">
                {t('skills.mine')}
              </h3>
              <Button
                size="sm"
                variant="outline"
                data-testid="assistant-skill-new"
                disabled={
                  store.skills.length >= ASSISTANT_SKILL_LIMITS.maxSkills
                }
                onClick={() => setEditing({ mode: 'new' })}
                className="coarse:h-11"
              >
                <Plus aria-hidden />
                {t('skills.new')}
              </Button>
            </div>
            {mine.length ? (
              <div className="flex flex-col">{mine.map(row)}</div>
            ) : (
              <p className="py-2 text-2sm text-muted-foreground">
                {t('skills.empty')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-2sm font-medium text-muted-foreground">
              {t('skills.builtin')}
            </h3>
            <div className="flex flex-col">{builtins.map(row)}</div>
          </div>
        </>
      )}
    </section>
  )
}

function SkillRow({
  skill,
  open,
  onOpenChange,
  onToggle,
  onEdit,
  onRemove,
}: {
  skill: AssistantSkillView
  open: boolean
  onOpenChange(open: boolean): void
  onToggle(enabled: boolean): void
  onEdit(): void
  onRemove?: () => void
}) {
  const t = useTranslations('AssistantSettings')
  const [refPath, setRefPath] = useState<string | null>(null)
  const refs = Object.keys(skill.references)

  return (
    <div
      data-testid="assistant-skill-row"
      className="border-b border-border/60 last:border-b-0"
    >
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:min-h-11"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{skill.name}</span>
              {skill.origin === 'override' ? (
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  {t('skills.overridden')}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-2sm text-muted-foreground">
              {skill.description}
            </span>
          </span>
        </button>
        <Switch
          size="lg"
          aria-label={t('skills.toggle', { name: skill.name })}
          checked={skill.enabled}
          onCheckedChange={onToggle}
        />
      </div>

      {open ? (
        <div className="flex flex-col gap-2.5 pb-3 pl-5.5">
          {skill.origin === 'mine' ? (
            <p className="text-2sm text-muted-foreground">
              {t('skills.slashHint', { name: skill.name })}
            </p>
          ) : null}
          <pre className="max-h-80 overflow-y-auto rounded-lg bg-muted/50 p-3 text-2sm leading-5 whitespace-pre-wrap">
            {skill.body}
          </pre>
          {refs.length ? (
            <div className="flex flex-wrap gap-1.5">
              {refs.map((path) => (
                <Button
                  key={path}
                  size="xs"
                  variant={refPath === path ? 'secondary' : 'ghost'}
                  aria-pressed={refPath === path}
                  onClick={() => setRefPath(refPath === path ? null : path)}
                  className="coarse:h-9"
                >
                  {path}
                </Button>
              ))}
            </div>
          ) : null}
          {refPath && skill.references[refPath] !== undefined ? (
            <pre className="max-h-80 overflow-y-auto rounded-lg bg-muted/50 p-3 text-2sm leading-5 whitespace-pre-wrap">
              {skill.references[refPath]}
            </pre>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="coarse:h-11"
            >
              {skill.origin === 'builtin'
                ? t('skills.override')
                : t('skills.edit')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void downloadSkillZip(skill)}
              className="coarse:h-11"
            >
              <Download aria-hidden />
              {t('skills.export')}
            </Button>
            <span className="flex-1" />
            {onRemove && skill.origin !== 'builtin' ? (
              <ConfirmDeleteButton
                data-testid="assistant-skill-delete"
                confirmLabel={t('skills.deleteConfirm')}
                onConfirm={onRemove}
                className="h-8 rounded-lg px-2.5 text-2sm text-status-risk hover:bg-status-risk-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:h-11"
              >
                {skill.origin === 'override'
                  ? t('skills.restore')
                  : t('skills.delete')}
              </ConfirmDeleteButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SkillEditor({
  editing,
  error,
  onCancel,
  onSave,
}: {
  editing: Editing
  error: string | null
  onCancel(): void
  onSave(input: {
    name: string
    description: string
    body: string
  }): Promise<void>
}) {
  const t = useTranslations('AssistantSettings')
  const source = editing.mode === 'new' ? null : editing.skill
  const [name, setName] = useState(source?.name ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [body, setBody] = useState(source?.body ?? '')
  const [saving, setSaving] = useState(false)
  const nameEditable = editing.mode === 'new' || editing.skill.origin === 'mine'
  const ready =
    name.trim().length > 0 &&
    !/[/\n·・]/.test(name) &&
    description.trim().length > 0 &&
    body.trim().length > 0

  return (
    <section
      aria-label={
        editing.mode === 'new'
          ? t('skills.new')
          : editing.mode === 'override'
            ? t('skills.override')
            : t('skills.edit')
      }
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-2sm font-medium text-muted-foreground">
          {t('skills.nameLabel')}
        </span>
        <Input
          data-testid="assistant-skill-name"
          value={name}
          disabled={!nameEditable}
          maxLength={ASSISTANT_SKILL_LIMITS.maxNameChars}
          placeholder={t('skills.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-lg text-base md:text-md coarse:h-11"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-2sm font-medium text-muted-foreground">
          {t('skills.descriptionLabel')}
        </span>
        <Textarea
          data-testid="assistant-skill-description"
          value={description}
          maxLength={ASSISTANT_SKILL_LIMITS.maxDescriptionChars}
          placeholder={t('skills.descriptionPlaceholder')}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-16 rounded-lg"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="flex items-baseline gap-2 text-2sm font-medium text-muted-foreground">
          <span className="flex-1">{t('skills.bodyLabel')}</span>
          <span className="text-xs tabular-nums">
            {body.length} / {ASSISTANT_SKILL_LIMITS.maxBodyChars}
          </span>
        </span>
        <Textarea
          data-testid="assistant-skill-body"
          value={body}
          maxLength={ASSISTANT_SKILL_LIMITS.maxBodyChars}
          placeholder={t('skills.bodyPlaceholder')}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-48 rounded-lg font-mono text-2sm"
        />
      </label>
      {error ? (
        <p role="alert" className="text-2sm text-status-risk">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} className="coarse:h-11">
          {t('skills.cancel')}
        </Button>
        <Button
          data-testid="assistant-skill-save"
          disabled={!ready || saving}
          onClick={async () => {
            setSaving(true)
            await onSave({
              name: name.trim(),
              description: description.trim(),
              body: body.trim(),
            })
            setSaving(false)
          }}
          className="coarse:h-11"
        >
          {t('skills.save')}
        </Button>
      </div>
    </section>
  )
}
