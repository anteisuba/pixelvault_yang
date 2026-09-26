'use client'

import { useCallback, useId, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useReducedMotion } from 'motion/react'
import { ChevronDown, ChevronRight, Plus, Upload } from '@/components/icons'

import {
  ASSISTANT_AVATAR_CHOICE_IDS,
  ASSISTANT_PERSONA_ARCHETYPE_PRESETS,
  ASSISTANT_PERSONA_ARCHETYPES,
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
  matchAssistantPersonaArchetype,
  type AssistantAvatarChoice,
  type AssistantPersonaArchetype,
  type AssistantPersonaLanguage,
  type AssistantPersonaTone,
  type AssistantPersonaVerbosity,
} from '@/constants/assistant-persona'
import { PROFILE } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { useCharacterCards } from '@/hooks/cards'
import type { UseAssistantPersonaAutosaveValue } from '@/hooks/use-assistant-persona'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import {
  withAssistantCharacter,
  type AssistantPersonaCharacter,
} from '@/types/assistant-persona'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Switch } from '@/components/ui/switch'

/**
 * 人设页（助手设置 B，画板「助手设置 B · 全部状态」）。
 *
 * 两块，一屏看完：
 *  ① **身份** —— 头像（点开是一张单选表）· 用角色 · 名字 · 怎么称呼你；
 *  ② **说话方式** —— 三档单选（改了高级才多出「自定义」）· 一句示例 · 就地
 *     展开的「高级」（语气 · 回复长度 · 回复语言 · 下一步建议 · 用我的词）。
 *
 * ⭐ 改了就存（owner 2026-09-26）：点选类控件当场存，输入框失焦 / 回车再存；
 * 存的状态只在右上角那一小行字（`AssistantSaveStatus`），⛔ 没有「保存」键。
 * ⭐ 三档不管语气（owner 2026-09-26）：档位按四格回推，选角色、换语气都不会
 * 让它跳成「自定义」。
 */

type ToneOption = AssistantPersonaTone | 'character'

/** 「用角色」下拉里的一行（卡片列表来自角色页那份缓存）。 */
interface CharacterOption {
  id: string
  name: string
  faceUrl: string | null
  hasSpeech: boolean
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

/** 一张脸：有图用图，没有就按预设画字形（与时间线、顶栏同一个字形）。 */
function PersonaFace({
  url,
  preset,
  name,
  className,
}: {
  url: string | null
  preset: string | null
  name: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          width={144}
          height={144}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <AssistantAvatarGlyph
          presetId={preset}
          name={name}
          className="size-full"
        />
      )}
    </span>
  )
}

export function AssistantPersonaPane({
  autosave,
}: {
  autosave: UseAssistantPersonaAutosaveValue
}) {
  const t = useTranslations('AssistantSettings')
  const tTimeline = useTranslations('StudioOperator.timeline')
  const reducedMotion = useReducedMotion()
  const { persona, draft, apply, edit, commit, replace } = autosave
  const { cards } = useCharacterCards()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const roleLabelId = useId()
  const advancedId = useId()
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  /**
   * 选了「自定义」语气但还没写那一句：先只在界面上亮着，⛔ 不落库 —— 空的
   * 自定义语气服务端会拒，而用户此刻还没来得及写。写完失焦 / 回车才存。
   */
  const [customToneOpen, setCustomToneOpen] = useState(false)
  const [customToneText, setCustomToneText] = useState<string | null>(null)
  /**
   * 展开「高级」时，若那几行整块落在可视区外，就在弹窗 / 页面里平滑滚到第一行
   * 露出来（动效表：不自动收、不一下跳到底）。⚠ 稳定引用：只在展开那一下调一次。
   */
  const revealAdvanced = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      const root = node.closest<HTMLElement>('[data-assistant-settings-scroll]')
      const bottom = root?.getBoundingClientRect().bottom ?? window.innerHeight
      if (node.getBoundingClientRect().top < bottom - 24) return
      node.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    },
    [reducedMotion],
  )

  const characterOptions: CharacterOption[] = cards.map((card) => ({
    id: card.id,
    name: card.name.slice(0, ASSISTANT_PERSONA_LIMITS.maxNameChars),
    faceUrl: card.sourceImageUrl || null,
    hasSpeech: Boolean(card.persona?.speech?.trim()),
  }))
  /**
   * 正在用的角色：服务端读回来的那份为准；刚在下拉里选、还没落库的那一拍用
   * 列表里那张补上（名字、脸、写没写说话方式立刻就对）。
   */
  const activeCharacter: AssistantPersonaCharacter | null =
    draft.characterCardId
      ? persona.character?.id === draft.characterCardId
        ? persona.character
        : (characterOptions.find(
            (option) => option.id === draft.characterCardId,
          ) ?? null)
      : null
  const fallbackName = tTimeline('assistantFallback')
  const displayName =
    (draft.nameFromCharacter && activeCharacter?.name) ||
    draft.name?.trim() ||
    fallbackName

  function faceFor(choice: AssistantAvatarChoice): {
    url: string | null
    preset: string | null
  } {
    if (choice === ASSISTANT_AVATAR_CHOICE_IDS.character) {
      return {
        url: activeCharacter?.faceUrl ?? null,
        preset: draft.avatarPreset,
      }
    }
    if (choice === ASSISTANT_AVATAR_CHOICE_IDS.upload) {
      return { url: persona.uploadedAvatarUrl, preset: draft.avatarPreset }
    }
    return { url: null, preset: choice }
  }
  const currentFace = faceFor(draft.avatarChoice)

  const avatarChoices: AssistantAvatarChoice[] = [
    ...(activeCharacter ? [ASSISTANT_AVATAR_CHOICE_IDS.character] : []),
    ...(persona.uploadedAvatarUrl ? [ASSISTANT_AVATAR_CHOICE_IDS.upload] : []),
    ASSISTANT_AVATAR_CHOICE_IDS.mark,
    ASSISTANT_AVATAR_CHOICE_IDS.monogram,
  ]
  const avatarChoiceLabel = (choice: AssistantAvatarChoice) =>
    choice === ASSISTANT_AVATAR_CHOICE_IDS.character
      ? t('avatar.character', { name: activeCharacter?.name ?? '' })
      : t(`avatar.${choice}`)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setAvatarError(null)
    if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setAvatarError(t('avatar.unsupported'))
      return
    }
    if (file.size > PROFILE.AVATAR_MAX_SIZE_BYTES) {
      setAvatarError(t('avatar.tooLarge'))
      return
    }
    await autosave.uploadAvatar(await readFileAsDataUrl(file))
  }

  /** 用角色 / 不用角色 —— 与角色页「设为助手人设」同一条（`withAssistantCharacter`）。 */
  function pickCharacter(characterCardId: string | null) {
    if (characterCardId === draft.characterCardId) return
    setCustomToneOpen(false)
    replace(withAssistantCharacter({ ...persona, ...draft }, characterCardId))
  }

  const archetype = matchAssistantPersonaArchetype(draft)
  const archetypeRows: (AssistantPersonaArchetype | 'custom')[] = [
    ...ASSISTANT_PERSONA_ARCHETYPES,
    ...(archetype === null ? (['custom'] as const) : []),
  ]

  const characterTone =
    activeCharacter !== null &&
    activeCharacter.hasSpeech &&
    draft.toneFromCharacter
  const toneValue: ToneOption = customToneOpen
    ? ASSISTANT_PERSONA_TONE_IDS.custom
    : characterTone
      ? 'character'
      : draft.tone
  const toneLabel = (tone: ToneOption) =>
    tone === 'character'
      ? t('tone.character', { name: activeCharacter?.name ?? '' })
      : t(`tone.${tone}`)
  const toneItems = [
    ...(activeCharacter
      ? [{ value: 'character' as const, label: toneLabel('character') }]
      : []),
    ...ASSISTANT_PERSONA_TONES.map((tone) => ({
      value: tone,
      label: toneLabel(tone),
    })),
  ]

  function pickTone(next: ToneOption) {
    if (next === 'character') {
      setCustomToneOpen(false)
      apply({ toneFromCharacter: true })
      return
    }
    if (next === ASSISTANT_PERSONA_TONE_IDS.custom && !draft.toneCustom) {
      // 还没写那一句：先亮着，写完再存（见 `customToneOpen` 的头注）。
      setCustomToneOpen(true)
      return
    }
    setCustomToneOpen(false)
    apply({ tone: next, toneFromCharacter: false })
  }

  const showCustomTone = toneValue === ASSISTANT_PERSONA_TONE_IDS.custom
  const customToneValue = customToneText ?? draft.toneCustom ?? ''
  function commitCustomTone() {
    const text = customToneValue.trim()
    setCustomToneText(null)
    if (!text) return
    setCustomToneOpen(false)
    if (
      text === draft.toneCustom &&
      draft.tone === ASSISTANT_PERSONA_TONE_IDS.custom &&
      !draft.toneFromCharacter
    ) {
      return
    }
    apply({
      tone: ASSISTANT_PERSONA_TONE_IDS.custom,
      toneCustom: text,
      toneFromCharacter: false,
    })
  }

  const onOff = (value: boolean) =>
    value ? t('advanced.on') : t('advanced.off')
  const advancedSummary = [
    t('advanced.summary.tone', { value: toneLabel(toneValue) }),
    t('advanced.summary.length', { value: t(`length.${draft.verbosity}`) }),
    t('advanced.summary.language', { value: t(`language.${draft.language}`) }),
    t('advanced.summary.nextStep', { value: onOff(draft.nextStepHint) }),
    t('advanced.summary.myWords', { value: onOff(draft.useMyWords) }),
  ].join(' · ')

  const opener =
    toneValue === 'character'
      ? t('preview.opener.character', { name: activeCharacter?.name ?? '' })
      : t(`preview.opener.${toneValue}`)
  const address = draft.addressUserAs?.trim()

  return (
    <div className="flex flex-col gap-7 @container">
      {/* ── 身份 ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3.5">
        <h2 className="text-2sm font-semibold text-muted-foreground">
          {t('identity.title')}
        </h2>
        <div className="flex flex-col gap-4 @md:flex-row @md:items-start @md:gap-5">
          <div className="flex items-center gap-4 @md:flex-col @md:gap-2">
            <DropdownMenu
              open={avatarMenuOpen}
              onOpenChange={setAvatarMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="assistant-avatar-button"
                  aria-label={t('identity.changeAvatar')}
                  className="rounded-full transition-shadow duration-fast hover:ring-4 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[.98]"
                >
                  <PersonaFace
                    url={currentFace.url}
                    preset={currentFace.preset}
                    name={displayName}
                    className="size-18 text-2xl"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-60 rounded-xl p-1.5"
              >
                <DropdownMenuRadioGroup
                  value={draft.avatarChoice}
                  onValueChange={(value) =>
                    apply({ avatarChoice: value as AssistantAvatarChoice })
                  }
                >
                  {avatarChoices.map((choice) => {
                    const face = faceFor(choice)
                    return (
                      <DropdownMenuRadioItem
                        key={choice}
                        value={choice}
                        indicator="check-end"
                        data-testid={`assistant-avatar-choice-${choice}`}
                        className="min-h-9 gap-2.5 rounded-lg coarse:min-h-11"
                      >
                        <PersonaFace
                          url={face.url}
                          preset={face.preset}
                          name={displayName}
                          className="size-6 text-2xs"
                        />
                        {avatarChoiceLabel(choice)}
                      </DropdownMenuRadioItem>
                    )
                  })}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="min-h-9 gap-2.5 rounded-lg coarse:min-h-11"
                  onSelect={() => fileInputRef.current?.click()}
                >
                  <span className="grid size-6 place-items-center rounded-full border border-dashed border-input text-muted-foreground">
                    <Upload className="size-3" aria-hidden />
                  </span>
                  {t('avatar.uploadNew')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => setAvatarMenuOpen(true)}
              className="rounded-md px-2 py-1 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:min-h-11"
            >
              {t('identity.changeAvatar')}
            </button>
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

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span
                id={roleLabelId}
                className="text-2sm font-medium text-muted-foreground"
              >
                {t('character.label')}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-labelledby={roleLabelId}
                    data-testid="assistant-character-select"
                    className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2 text-left text-md transition-colors duration-fast hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:border-foreground coarse:h-11"
                  >
                    {activeCharacter ? (
                      <>
                        <PersonaFace
                          url={activeCharacter.faceUrl}
                          preset={draft.avatarPreset}
                          name={activeCharacter.name}
                          className="size-6 text-2xs"
                        />
                        <span className="min-w-0 truncate">
                          {activeCharacter.name}
                        </span>
                      </>
                    ) : (
                      <span className="pl-1 text-muted-foreground">
                        {t('character.none')}
                      </span>
                    )}
                    <ChevronDown
                      className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-(--radix-dropdown-menu-trigger-width) rounded-xl p-1.5"
                >
                  <DropdownMenuRadioGroup
                    value={draft.characterCardId ?? ''}
                    onValueChange={(value) => pickCharacter(value || null)}
                  >
                    <DropdownMenuRadioItem
                      value=""
                      indicator="check-end"
                      className="min-h-9 gap-2.5 rounded-lg coarse:min-h-11"
                    >
                      <span
                        className="size-6 shrink-0 rounded-full border border-dashed border-input"
                        aria-hidden
                      />
                      {t('character.none')}
                    </DropdownMenuRadioItem>
                    {characterOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.id}
                        value={option.id}
                        indicator="check-end"
                        data-testid="assistant-character-option"
                        className="min-h-9 gap-2.5 rounded-lg py-1.5 coarse:min-h-11"
                      >
                        <PersonaFace
                          url={option.faceUrl}
                          preset={draft.avatarPreset}
                          name={option.name}
                          className="size-6 text-2xs"
                        />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate">{option.name}</span>
                          {option.hasSpeech ? null : (
                            <span className="text-2xs text-muted-foreground">
                              {t('character.noSpeech')}
                            </span>
                          )}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    asChild
                    className="min-h-9 gap-2.5 rounded-lg text-muted-foreground coarse:min-h-11"
                  >
                    <Link href={ROUTES.CARDS}>
                      <span className="grid size-6 place-items-center rounded-full border border-dashed border-input">
                        <Plus className="size-3" aria-hidden />
                      </span>
                      {t('character.create')}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {activeCharacter ? (
                <p className="text-2sm text-muted-foreground">
                  {activeCharacter.hasSpeech
                    ? t('character.caption', { name: activeCharacter.name })
                    : t('character.captionNoSpeech', {
                        name: activeCharacter.name,
                      })}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-2sm font-medium text-muted-foreground">
                  {t('name.label')}
                </span>
                <Input
                  data-testid="assistant-persona-name"
                  value={draft.name ?? ''}
                  maxLength={ASSISTANT_PERSONA_LIMITS.maxNameChars}
                  placeholder={t('name.placeholder')}
                  onChange={(event) =>
                    edit({
                      name: event.target.value.trim()
                        ? event.target.value
                        : null,
                      nameFromCharacter: false,
                    })
                  }
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  className="h-10 rounded-lg text-md md:text-md coarse:h-11"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-2sm font-medium text-muted-foreground">
                  {t('address.label')}
                </span>
                <Input
                  data-testid="assistant-address-user-as"
                  value={draft.addressUserAs ?? ''}
                  maxLength={ASSISTANT_PERSONA_LIMITS.maxAddressUserAsChars}
                  placeholder={t('address.placeholder')}
                  onChange={(event) =>
                    edit({
                      addressUserAs: event.target.value.trim()
                        ? event.target.value
                        : null,
                    })
                  }
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  className="h-10 rounded-lg text-md md:text-md coarse:h-11"
                />
              </label>
            </div>
          </div>
        </div>
        {avatarError ? (
          <p role="alert" className="text-2sm text-status-risk">
            {avatarError}
          </p>
        ) : null}
      </section>

      {/* ── 说话方式 ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-2sm font-semibold text-muted-foreground">
            {t('style.title')}
          </legend>
          <div
            data-testid="assistant-archetypes"
            className="-mx-3.5 flex flex-col gap-0.5"
          >
            {archetypeRows.map((row) => {
              const checked =
                row === 'custom' ? archetype === null : archetype === row
              return (
                <label
                  key={row}
                  data-testid={`assistant-archetype-${row}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-fast has-focus-visible:ring-2 has-focus-visible:ring-ring',
                    checked ? 'bg-muted' : 'hover:bg-muted/60',
                    row === 'custom' &&
                      'cursor-default motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1',
                  )}
                >
                  <input
                    type="radio"
                    name="assistant-archetype"
                    value={row}
                    checked={checked}
                    onChange={() => {
                      if (row === 'custom') return
                      apply(ASSISTANT_PERSONA_ARCHETYPE_PRESETS[row])
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="mt-0.5 size-4.5 shrink-0 rounded-full border-2 border-input transition-[border-width,border-color] duration-base ease-standard peer-checked:border-5 peer-checked:border-foreground motion-reduce:transition-none"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-md font-semibold">
                      {t(`archetype.${row}.name`)}
                    </span>
                    <span className="text-2sm leading-5 text-muted-foreground">
                      {t(`archetype.${row}.line`)}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* 一句示例（由右栏缩来）：换档、改名、改称呼、换语气时跟着变。本地模板，⛔ 不调 LLM。 */}
        <div className="mt-2 flex items-start gap-2.5">
          <PersonaFace
            url={currentFace.url}
            preset={currentFace.preset}
            name={displayName}
            className="size-6.5 text-2xs"
          />
          <div
            data-testid="assistant-persona-preview"
            aria-label={t('preview.label')}
            className="flex min-w-0 flex-col gap-1 rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm leading-relaxed"
          >
            <p>
              {address ? t('preview.address', { name: address }) : null}
              {opener}
            </p>
            {draft.nextStepHint ? (
              <p className="text-2sm text-muted-foreground">
                {t('preview.nextStep')}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          data-testid="assistant-advanced-toggle"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => setAdvancedOpen((open) => !open)}
          className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-md text-left text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:min-h-11"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-base ease-standard motion-reduce:transition-none',
              advancedOpen && 'rotate-90',
            )}
          />
          <span className="shrink-0 text-foreground">
            {t('advanced.label')}
          </span>
          {advancedOpen ? null : (
            <span className="min-w-0 truncate text-2sm">{advancedSummary}</span>
          )}
        </button>

        {advancedOpen ? (
          <div
            id={advancedId}
            data-testid="assistant-advanced"
            ref={revealAdvanced}
            className="flex flex-col gap-4 pt-1 @md:pl-5.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-base"
          >
            <AdvancedRow label={t('tone.label')}>
              <LiquidSegmented
                items={toneItems}
                value={toneValue}
                onChange={pickTone}
                ariaLabel={t('tone.label')}
                disabledValues={
                  activeCharacter && !activeCharacter.hasSpeech
                    ? ['character']
                    : undefined
                }
                size="md"
                semantics="radio"
                className="max-w-full self-start overflow-x-auto"
              />
              {showCustomTone ? (
                <>
                  <Input
                    aria-label={t('tone.customLabel')}
                    data-testid="assistant-tone-custom"
                    value={customToneValue}
                    maxLength={ASSISTANT_PERSONA_LIMITS.maxToneCustomChars}
                    placeholder={t('tone.customPlaceholder')}
                    aria-invalid={!customToneValue.trim()}
                    onChange={(event) => setCustomToneText(event.target.value)}
                    onBlur={commitCustomTone}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                    className="h-10 rounded-lg text-md md:text-md coarse:h-11"
                  />
                  {customToneValue.trim() ? null : (
                    <p className="text-2sm text-muted-foreground">
                      {t('tone.customRequired')}
                    </p>
                  )}
                </>
              ) : null}
              {activeCharacter && characterTone ? (
                <p className="text-2sm text-muted-foreground">
                  {t('tone.characterNote', { name: activeCharacter.name })}
                </p>
              ) : null}
              {activeCharacter && !activeCharacter.hasSpeech ? (
                <p className="text-2sm text-muted-foreground">
                  {t('tone.characterMissing', { name: activeCharacter.name })}{' '}
                  <Link
                    href={ROUTES.CARDS}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {t('tone.characterMissingLink')} ›
                  </Link>
                </p>
              ) : null}
            </AdvancedRow>

            <AdvancedRow label={t('length.label')}>
              <LiquidSegmented
                items={ASSISTANT_PERSONA_VERBOSITIES.map((verbosity) => ({
                  value: verbosity,
                  label: t(`length.${verbosity}`),
                }))}
                value={draft.verbosity}
                onChange={(verbosity: AssistantPersonaVerbosity) =>
                  apply({ verbosity })
                }
                ariaLabel={t('length.label')}
                size="md"
                semantics="radio"
                className="self-start"
              />
            </AdvancedRow>

            <AdvancedRow label={t('language.label')}>
              <LiquidSegmented
                items={ASSISTANT_PERSONA_LANGUAGES.map((language) => ({
                  value: language,
                  label: t(`language.${language}`),
                }))}
                value={draft.language}
                onChange={(language: AssistantPersonaLanguage) =>
                  apply({ language })
                }
                ariaLabel={t('language.label')}
                size="md"
                semantics="radio"
                className="self-start"
              />
            </AdvancedRow>

            <AdvancedSwitchRow
              label={t('nextStep.label')}
              hint={t('nextStep.hint')}
              checked={draft.nextStepHint}
              onChange={(nextStepHint) => apply({ nextStepHint })}
              testId="assistant-next-step-hint"
            />
            <AdvancedSwitchRow
              label={t('myWords.label')}
              hint={t('myWords.hint')}
              checked={draft.useMyWords}
              onChange={(useMyWords) => apply({ useMyWords })}
              testId="assistant-use-my-words"
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

/** 高级里的一行：左标题 + 右控件（窄了上下两行）。 */
function AdvancedRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 @md:flex-row @md:items-start @md:gap-4">
      <span className="text-2sm font-medium text-muted-foreground @md:w-20 @md:shrink-0 @md:pt-2">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  )
}

/** 高级里的开关行：与 `AdvancedRow` 同一条左标题栏，⛔ 别让两种行各自对齐。 */
function AdvancedSwitchRow({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string
  hint: string
  checked: boolean
  onChange(next: boolean): void
  testId: string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:gap-4">
      <label
        htmlFor={id}
        className="text-2sm font-medium text-muted-foreground @md:w-20 @md:shrink-0"
      >
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="min-w-0 text-2sm text-muted-foreground">{hint}</span>
        <Switch
          id={id}
          size="lg"
          data-testid={testId}
          checked={checked}
          onCheckedChange={onChange}
        />
      </div>
    </div>
  )
}
