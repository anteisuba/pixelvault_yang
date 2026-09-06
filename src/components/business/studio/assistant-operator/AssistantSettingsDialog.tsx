'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, X } from 'lucide-react'

import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_PLAN_MODES,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
  type AssistantAvatarPresetId,
  type AssistantPersonaLanguage,
  type AssistantPersonaPlanMode,
  type AssistantPersonaTone,
  type AssistantPersonaVerbosity,
} from '@/constants/assistant-persona'
import { PROFILE } from '@/constants/config'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { cn } from '@/lib/utils'
import type { UpdateAssistantPersonaRequest } from '@/types/assistant-persona'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OptionGroup } from '@/components/ui/option-group'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'

/**
 * 助手设置（`docs/references/pages/assistant-shell.md` §8.1–8.2）。
 *
 * 单列 `max-w-lg`，⛔ 不分栏。Esc 关闭与焦点 trap 由 `ResponsiveDialog` 提供
 * （移动端自动换成底部抽屉）——⛔ 别在这里自己写一套。
 *
 * ⚠ **一个用户一份，四域共用**：这里没有任何域级开关，`scopeNote` 那行小字就是
 * 在说这件事（不写的话用户会以为改的只是当前工作台）。
 * ⚠ 头像那两条腿（传 / 撤）走的是**另一条路由**，不跟着「保存」走 ——
 * 它们改的是 R2 上的对象，攒着等保存等于让「取消」变成一句谎话。
 */

interface AssistantSettingsDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /**
   * 名字留空时字母款头像画哪个字（§8.2：空 = 用域名）。
   * ⚠ 由调用方给 —— 这颗组件不知道自己开在哪台工作台上。
   */
  fallbackInitial?: string
}

type PersonaDraft = UpdateAssistantPersonaRequest

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

export function AssistantSettingsDialog({
  open,
  onOpenChange,
  fallbackInitial,
}: AssistantSettingsDialogProps) {
  const t = useTranslations('StudioOperator.persona')
  const { persona, isSaving, save, uploadAvatar, removeAvatar } =
    useAssistantPersona({ enabled: open })

  /**
   * 草稿 = **服务端那一份 + 用户这一次动过的几格**，⛔ 不是一份 `useEffect` 里
   * 抄过来的副本：抄一份就得回答「拉到数据时用户已经改了两格怎么办」，
   * 而叠加天然有答案（用户动过的赢）。顺带也没有了那条
   * `react-hooks/set-state-in-effect`。
   */
  const [touched, setTouched] = useState<Partial<PersonaDraft>>({})
  /** 客户端就地能判的两条（体积 / 格式）—— 传上去再被拒是白等一次往返。 */
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [showToneCustomError, setShowToneCustomError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const draft: PersonaDraft = useMemo(
    () => ({
      name: persona.name,
      avatarPreset: persona.avatarPreset,
      tone: persona.tone,
      toneCustom: persona.toneCustom,
      verbosity: persona.verbosity,
      planMode: persona.planMode,
      language: persona.language,
      ...touched,
    }),
    [persona, touched],
  )

  const patch = useCallback((next: Partial<PersonaDraft>) => {
    setTouched((current) => ({ ...current, ...next }))
  }, [])

  /**
   * 关掉就把没保存的几格丢掉 —— Esc / 点外面 / 「取消」三条路都走这一个回调，
   * ⛔ 别只在「取消」那颗按钮上清（那样 Esc 关掉再打开会看到上次的半成品）。
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setTouched({})
        setAvatarError(null)
        setShowToneCustomError(false)
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const handleSave = useCallback(async () => {
    if (
      draft.tone === ASSISTANT_PERSONA_TONE_IDS.custom &&
      !draft.toneCustom?.trim()
    ) {
      setShowToneCustomError(true)
      return
    }
    setShowToneCustomError(false)
    const ok = await save(draft)
    if (ok) handleOpenChange(false)
  }, [draft, handleOpenChange, save])

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setAvatarError(null)
      if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        setAvatarError(t('avatarUnsupported'))
        return
      }
      if (file.size > PROFILE.AVATAR_MAX_SIZE_BYTES) {
        setAvatarError(t('avatarTooLarge'))
        return
      }
      const dataUrl = await readFileAsDataUrl(file)
      await uploadAvatar(dataUrl)
    },
    [t, uploadAvatar],
  )

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('title')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-6 py-2">
          {/* 名字 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="assistant-persona-name">{t('nameLabel')}</Label>
            <Input
              id="assistant-persona-name"
              value={draft.name ?? ''}
              maxLength={ASSISTANT_PERSONA_LIMITS.maxNameChars}
              placeholder={t('namePlaceholder')}
              onChange={(event) =>
                patch({
                  name: event.target.value.trim() ? event.target.value : null,
                })
              }
            />
            <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
          </div>

          {/* 头像 */}
          <div className="flex flex-col gap-2">
            <Label>{t('avatarLabel')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {ASSISTANT_AVATAR_PRESET_IDS.map((presetId) => {
                const selected =
                  !persona.avatarUrl && draft.avatarPreset === presetId
                return (
                  <button
                    key={presetId}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${t('avatarPresets')} ${presetId}`}
                    onClick={() => patch({ avatarPreset: presetId })}
                    className={cn(
                      'flex size-11 items-center justify-center rounded-lg border p-1.5 transition-colors',
                      selected
                        ? 'border-primary text-primary'
                        : 'border-border/60 text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    <AssistantAvatarGlyph
                      presetId={presetId satisfies AssistantAvatarPresetId}
                      initial={draft.name ?? fallbackInitial}
                    />
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
                className="flex size-11 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                aria-label={t('avatarUpload')}
              >
                <Upload className="size-4" />
              </button>

              {persona.avatarUrl ? (
                <button
                  type="button"
                  onClick={() => void removeAvatar()}
                  className="flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" />
                  {t('avatarRemove')}
                </button>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                accept={PROFILE.SUPPORTED_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0])
                  // 同一张图连传两次也要触发 change —— ⛔ 别忘了清值。
                  event.target.value = ''
                }}
              />
            </div>
            {isSaving ? (
              <p className="text-xs text-muted-foreground">
                {t('avatarUploading')}
              </p>
            ) : null}
            {avatarError ? (
              <p className="text-xs text-destructive">{avatarError}</p>
            ) : null}
          </div>

          {/* 语气 */}
          <div className="flex flex-col gap-2">
            <Label>{t('toneLabel')}</Label>
            <OptionGroup
              options={ASSISTANT_PERSONA_TONES.map((tone) => ({
                value: tone,
                label: t(`tone.${tone}`),
              }))}
              value={draft.tone}
              onChange={(value) =>
                patch({ tone: value as AssistantPersonaTone })
              }
            />
            {draft.tone === ASSISTANT_PERSONA_TONE_IDS.custom ? (
              <>
                <Input
                  value={draft.toneCustom ?? ''}
                  maxLength={ASSISTANT_PERSONA_LIMITS.maxToneCustomChars}
                  placeholder={t('toneCustomPlaceholder')}
                  onChange={(event) =>
                    patch({
                      toneCustom: event.target.value.trim()
                        ? event.target.value
                        : null,
                    })
                  }
                />
                {showToneCustomError ? (
                  <p className="text-xs text-destructive">
                    {t('toneCustomRequired')}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {/* 回复长度 */}
          <div className="flex flex-col gap-2">
            <Label>{t('verbosityLabel')}</Label>
            <OptionGroup
              options={ASSISTANT_PERSONA_VERBOSITIES.map((verbosity) => ({
                value: verbosity,
                label: t(`verbosity.${verbosity}`),
              }))}
              value={draft.verbosity}
              onChange={(value) =>
                patch({ verbosity: value as AssistantPersonaVerbosity })
              }
            />
          </div>

          {/* 默认行为 */}
          <div className="flex flex-col gap-2">
            <Label>{t('planModeLabel')}</Label>
            <OptionGroup
              options={ASSISTANT_PERSONA_PLAN_MODES.map((planMode) => ({
                value: planMode,
                label: t(`planMode.${planMode}`),
              }))}
              value={draft.planMode}
              onChange={(value) =>
                patch({ planMode: value as AssistantPersonaPlanMode })
              }
            />
            <p className="text-xs text-muted-foreground">{t('planModeHint')}</p>
          </div>

          {/* 回复语言 */}
          <div className="flex flex-col gap-2">
            <Label>{t('languageLabel')}</Label>
            <OptionGroup
              options={ASSISTANT_PERSONA_LANGUAGES.map((language) => ({
                value: language,
                label: t(`language.${language}`),
              }))}
              value={draft.language}
              onChange={(value) =>
                patch({ language: value as AssistantPersonaLanguage })
              }
            />
          </div>

          <p className="text-xs text-muted-foreground">{t('scopeNote')}</p>
        </div>

        <ResponsiveDialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            {t('save')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
