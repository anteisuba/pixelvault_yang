'use client'

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  NOVELAI_INTERACTION_PRESETS,
  NOVELAI_INTERACTION_TAG_MAX_CHARS,
  NOVELAI_MAX_INTERACTIONS_PER_CHARACTER,
  NOVELAI_MAX_SCENE_TEXTS,
  NOVELAI_SCENE_TEXT_KINDS,
  NOVELAI_TEXT_MAX_CHARS,
  findNovelAiInteractionPreset,
  type NovelAiSceneTextKind,
} from '@/constants/novelai'
import { useStudioForm } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { useNovelAiText } from '@/hooks/use-novelai-text'
import { incomingNovelAiInteractions } from '@/lib/novelai-cast'
import {
  findNovelAiCharacterCountTags,
  suggestNovelAiCountTags,
} from '@/lib/novelai-compose'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
import type { NovelAiInteraction } from '@/types/novelai'
import type { TagChip } from '@/types/tag-composer'
import {
  ArrowLeftRight,
  ArrowRight,
  ChatCircleText,
  ChevronDown,
  Hand,
  Plus,
  Type,
  X,
} from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { Switch } from '@/components/ui/switch'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioOutlineChipClass,
  studioOutlineChipOpenClass,
  studioToolPopoverBaseClass,
  studioToolPopoverMaxHeightClass,
  studioToolSurfaceMobileClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'

/**
 * 标签台「人身上的互动与台词」+ 整体页的画面文字与人数提示（2026-10-07 owner 选
 * C「舞台预演」，设计画布「C 舞台预演 · 全部状态」）。
 *
 * 写进去的东西都是结构化的（`novelAiLayout` 各角色的 `interactions` /
 * `dialogue`，`novelAiSceneTexts`），发送时由 `novelai-compose` 翻成 NovelAI 的
 * 写法 —— ⛔ 不在这里拼 `source#` / `Text:`。
 */

const ghostClass =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-2xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
const pillClass = cn(studioOutlineChipClass, 'h-7 gap-1 px-2.5 text-2xs')
const fieldClass =
  'flex h-8 min-w-0 max-w-xl flex-1 items-center gap-1.5 rounded-lg bg-muted px-3'
/** 手机上给输入框留够宽度，同一行放不下时让「加一条」折到下一行，而不是把字挤没。 */
const mobileFieldClass = cn(fieldClass, 'min-w-40')
const inputClass =
  'min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 md:text-2xs'

/**
 * 手机：标题在上、内容一行。桌面（标签台 A，owner 2026-10-09）：⛔ 不画标题列 ——
 * 东西直接流进输入框卡里「跟着页签的那一行」（宿主给的 flex-wrap 行），
 * 互动有手的图标、台词有气泡图标、空的时候是「＋ 互动」「＋ 台词」，不用再写一遍。
 */
function CastRow({
  label,
  mobile,
  children,
}: {
  label?: string
  mobile: boolean
  children: ReactNode
}) {
  if (mobile) {
    return (
      <div className="flex flex-col gap-1.5">
        {label ? <span className="text-sm font-medium">{label}</span> : null}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {children}
        </div>
      </div>
    )
  }
  return <>{children}</>
}

/** 「全部文字 n / 上限」—— 全部台词 + 画面文字合计，与生成闸同一把尺。 */
/**
 * 全部文字的计数。桌面挂在输入框里；手机（画板 NcPhone）框里不放计数，
 * 只在超了 / 只认英文时在这一行底下单占一行说原因。
 */
function TextCount({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations('StudioTags.cast')
  const { plan, maxChars, problem } = useNovelAiText()
  if (maxChars === undefined || (mobile && !problem)) return null
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5',
        mobile && 'basis-full',
      )}
    >
      <span
        className={cn(
          'font-mono text-3xs tabular-nums',
          problem ? 'font-semibold text-destructive' : 'text-muted-foreground',
        )}
      >
        {t('textCount', { count: plan.length, max: maxChars })}
      </span>
      {problem?.kind === 'latinOnly' ? (
        <span className="text-3xs text-destructive">{t('latinOnly')}</span>
      ) : null}
    </span>
  )
}

function useActionLabel() {
  const t = useTranslations('StudioTags.cast')
  return (tag: string) => {
    const preset = findNovelAiInteractionPreset(tag)
    return preset ? t(`actions.${preset.key}`) : tag
  }
}

/**
 * 选动作的弹层：常用 12 个 + 自己写 + 对谁 + 互相。从触发的那颗 chip 长出来
 * （② 放大），选了动作就收；改对谁 / 互相不收。
 */
function InteractionPicker({
  who,
  others,
  value,
  onPick,
  onTarget,
}: {
  who: string
  others: readonly number[]
  value: { tag: string; target: number; mutual: boolean }
  onPick: (tag: string, mutual: boolean) => void
  onTarget: (patch: { target?: number; mutual?: boolean }) => void
}) {
  const t = useTranslations('StudioTags.cast')
  const [custom, setCustom] = useState(
    findNovelAiInteractionPreset(value.tag) ? '' : value.tag,
  )
  const applyCustom = () => {
    const tag = custom.trim().toLowerCase()
    if (tag) onPick(tag, value.mutual)
  }
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-2xs font-semibold text-muted-foreground">
        {t('pickTitle', { who })}
      </h3>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {NOVELAI_INTERACTION_PRESETS.map((preset) => {
          const selected = preset.tag === value.tag
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onPick(preset.tag, 'mutual' in preset && preset.mutual)
              }
              className={cn(
                'flex min-h-11 min-w-0 flex-col items-start justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0',
                selected
                  ? 'border-foreground ring-3 ring-muted'
                  : 'border-border hover:border-foreground/40',
              )}
            >
              <span className="text-2xs font-medium">
                {t(`actions.${preset.key}`)}
              </span>
              <span
                title={preset.tag}
                className="max-w-full truncate font-mono text-3xs text-muted-foreground"
              >
                {preset.tag}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={custom}
          maxLength={NOVELAI_INTERACTION_TAG_MAX_CHARS}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyCustom()
            }
          }}
          placeholder={t('pickCustom')}
          aria-label={t('pickCustom')}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base outline-none placeholder:text-muted-foreground/60 focus-visible:border-foreground md:text-2xs"
        />
        <button
          type="button"
          disabled={!custom.trim()}
          onClick={applyCustom}
          className={cn(pillClass, 'h-9')}
        >
          {t('pickCustomApply')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-semibold text-muted-foreground">
          {t('pickTarget')}
        </span>
        {others.map((other) => (
          <button
            key={other}
            type="button"
            aria-pressed={other === value.target}
            onClick={() => onTarget({ target: other })}
            className={cn(
              pillClass,
              other === value.target && studioOutlineChipOpenClass,
            )}
          >
            {t('who', { number: other + 1 })}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-2xs text-muted-foreground">
          <Switch
            checked={value.mutual}
            onCheckedChange={(mutual) => onTarget({ mutual })}
          />
          {t('mutual')}
        </label>
      </div>
    </div>
  )
}

/** 一颗互动（「摸头 → 角色 2」），点哪一半都打开同一个选动作弹层。 */
function InteractionChip({
  index,
  slot,
  interaction,
  others,
  disabled,
  onChange,
  onRemove,
}: {
  index: number
  slot: number
  interaction: NovelAiInteraction
  others: readonly number[]
  disabled: boolean
  onChange: (next: NovelAiInteraction) => void
  onRemove: () => void
}) {
  const t = useTranslations('StudioTags.cast')
  const actionLabel = useActionLabel()
  const [open, setOpen] = useState(false)
  const motion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'start',
    sideOffset: 8,
  })
  const label = actionLabel(interaction.tag)
  return (
    <span className="inline-flex items-center gap-0.5">
      <StudioToolSurface open={open} onOpenChange={setOpen}>
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            data-interaction-slot={slot}
            className="inline-flex items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <span className={cn(pillClass, open && studioOutlineChipOpenClass)}>
              <Hand className="size-3.5 text-muted-foreground" aria-hidden />
              {label}
              <ChevronDown
                className="size-3 text-muted-foreground"
                aria-hidden
              />
            </span>
            {interaction.mutual ? (
              <ArrowLeftRight
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
            ) : (
              <ArrowRight
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
            )}
            <span className={pillClass}>
              {t('who', { number: interaction.target + 1 })}
              <ChevronDown
                className="size-3 text-muted-foreground"
                aria-hidden
              />
            </span>
          </button>
        </StudioToolSurfaceTrigger>
        <ResponsivePopoverContent
          label={t('pickTitle', { who: t('who', { number: index + 1 }) })}
          side="top"
          align="start"
          sideOffset={8}
          style={motion.style}
          className={cn(
            studioToolPopoverBaseClass,
            studioToolPopoverMaxHeightClass,
            'w-md max-w-full overflow-y-auto overscroll-contain p-3',
            motion.className,
          )}
          mobileClassName={studioToolSurfaceMobileClass.action}
        >
          <InteractionPicker
            who={t('who', { number: index + 1 })}
            others={others}
            value={{
              tag: interaction.tag,
              target: interaction.target,
              mutual: interaction.mutual === true,
            }}
            onPick={(tag, mutual) => {
              onChange({
                tag,
                target: interaction.target,
                ...(mutual ? { mutual: true } : {}),
              })
              setOpen(false)
            }}
            onTarget={(patch) => {
              const mutual = patch.mutual ?? interaction.mutual === true
              onChange({
                tag: interaction.tag,
                target: patch.target ?? interaction.target,
                ...(mutual ? { mutual: true } : {}),
              })
            }}
          />
        </ResponsivePopoverContent>
      </StudioToolSurface>
      <button
        type="button"
        disabled={disabled}
        aria-label={t('removeInteraction', { action: label })}
        onClick={onRemove}
        className="touch-target-y grid size-6 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  )
}

/** 「＋ 互动」/「再加一条」：先选动作才落成一条（对谁默认第一个别人）。 */
function AddInteraction({
  index,
  others,
  disabled,
  label,
  onAdd,
}: {
  index: number
  others: readonly number[]
  disabled: boolean
  label: string
  onAdd: (interaction: NovelAiInteraction) => void
}) {
  const t = useTranslations('StudioTags.cast')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    target: others[0] ?? 0,
    mutual: false,
  })
  const motion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'start',
    sideOffset: 8,
  })
  const target = others.includes(draft.target) ? draft.target : others[0]
  if (target === undefined) return null
  return (
    <StudioToolSurface open={open} onOpenChange={setOpen}>
      <StudioToolSurfaceTrigger asChild>
        <button type="button" disabled={disabled} className={ghostClass}>
          <Plus className="size-3.5" aria-hidden />
          {label}
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        label={t('pickTitle', { who: t('who', { number: index + 1 }) })}
        side="top"
        align="start"
        sideOffset={8}
        style={motion.style}
        className={cn(
          studioToolPopoverBaseClass,
          studioToolPopoverMaxHeightClass,
          'w-md max-w-full overflow-y-auto overscroll-contain p-3',
          motion.className,
        )}
        mobileClassName={studioToolSurfaceMobileClass.action}
      >
        <InteractionPicker
          who={t('who', { number: index + 1 })}
          others={others}
          value={{ tag: '', target, mutual: draft.mutual }}
          onPick={(tag, mutual) => {
            onAdd({ tag, target, ...(mutual ? { mutual: true } : {}) })
            setDraft({ target, mutual: false })
            setOpen(false)
          }}
          onTarget={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
        />
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}

/**
 * 角色页的「互动」「台词」两行。两行都没东西时收成一行「＋互动 ＋台词」；
 * 被别人做了什么，在这里只读一行「被 角色 1 摸头 · 去角色 1 改」。
 */
export function StudioTagCharacterExtras({
  index,
  mobile,
  disabled,
}: {
  index: number
  mobile: boolean
  disabled: boolean
}) {
  const t = useTranslations('StudioTags.cast')
  const actionLabel = useActionLabel()
  const c = useNovelAiCharacters()
  const [dialogueOpen, setDialogueOpen] = useState(false)
  const character = c.characters[index]
  if (!character) return null

  const others = c.characters.map((_, i) => i).filter((i) => i !== index)
  const own = character.interactions ?? []
  const incoming = incomingNovelAiInteractions(c.characters, index)
  const canAdd =
    others.length > 0 && own.length < NOVELAI_MAX_INTERACTIONS_PER_CHARACTER
  const showInteractions = own.length > 0 || incoming.length > 0
  const showDialogue = dialogueOpen || Boolean(character.dialogue)

  const setInteractions = (next: NovelAiInteraction[]) =>
    c.update(index, { interactions: next.length ? next : undefined })
  const addInteraction = (interaction: NovelAiInteraction) =>
    setInteractions([...own, interaction])

  return (
    <>
      {showInteractions ? (
        <CastRow label={t('interaction')} mobile={mobile}>
          {own.map((interaction, slot) => (
            <InteractionChip
              key={`${slot}-${interaction.tag}-${interaction.target}`}
              index={index}
              slot={slot}
              interaction={interaction}
              others={others}
              disabled={disabled}
              onChange={(next) =>
                setInteractions(
                  own.map((item, i) => (i === slot ? next : item)),
                )
              }
              onRemove={() => setInteractions(own.filter((_, i) => i !== slot))}
            />
          ))}
          {incoming.map((item) => (
            <span
              key={`in-${item.from}-${item.tag}`}
              className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground"
            >
              {t(item.mutual ? 'incomingMutual' : 'incoming', {
                who: t('who', { number: item.from + 1 }),
                action: actionLabel(item.tag),
              })}
              <button
                type="button"
                onClick={() => c.select(item.from)}
                className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('editOn', { who: t('who', { number: item.from + 1 }) })}
              </button>
            </span>
          ))}
          {canAdd ? (
            <AddInteraction
              index={index}
              others={others}
              disabled={disabled}
              label={
                own.length ? t('addAnotherInteraction') : t('addInteraction')
              }
              onAdd={addInteraction}
            />
          ) : null}
        </CastRow>
      ) : null}
      {showDialogue ? (
        <CastRow label={t('dialogue')} mobile={mobile}>
          <label className={mobile ? mobileFieldClass : fieldClass}>
            <ChatCircleText
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              // 点「＋ 台词」打开时直接落焦点；切页回来已有台词时不抢焦点。
              autoFocus={dialogueOpen && !character.dialogue}
              value={character.dialogue ?? ''}
              maxLength={NOVELAI_TEXT_MAX_CHARS}
              disabled={disabled}
              placeholder={t('dialoguePlaceholder')}
              aria-label={t('dialogueAria', { number: index + 1 })}
              onChange={(event) =>
                c.update(index, {
                  dialogue: event.target.value || undefined,
                })
              }
              onBlur={(event) => {
                if (!event.target.value.trim()) {
                  c.update(index, { dialogue: undefined })
                  setDialogueOpen(false)
                }
              }}
              className={inputClass}
            />
            {mobile ? null : <TextCount />}
          </label>
          {mobile ? <TextCount mobile /> : null}
        </CastRow>
      ) : null}
      {!showInteractions || !showDialogue ? (
        <CastRow mobile={mobile}>
          {!showInteractions && canAdd ? (
            <AddInteraction
              index={index}
              others={others}
              disabled={disabled}
              label={t('addInteraction')}
              onAdd={addInteraction}
            />
          ) : null}
          {!showDialogue ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setDialogueOpen(true)}
              className={ghostClass}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('addDialogue')}
            </button>
          ) : null}
        </CastRow>
      ) : null}
    </>
  )
}

const kindLabelKey = (kind: NovelAiSceneTextKind) =>
  `sceneKinds.${kind}` as const

/** 整体页的画面文字：种类 + 内容，可多条；不属于任何人。 */
export function StudioTagSceneTexts({
  mobile,
  disabled,
}: {
  mobile: boolean
  disabled: boolean
}) {
  const t = useTranslations('StudioTags.cast')
  const { state, dispatch } = useStudioForm()
  const [justAdded, setJustAdded] = useState<number | null>(null)
  const items = state.advancedParams.novelAiSceneTexts ?? []
  const write = (next: typeof items) =>
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: {
        ...state.advancedParams,
        novelAiSceneTexts: next.length ? next : undefined,
      },
    })
  const add = () => {
    setJustAdded(items.length)
    write([...items, { kind: 'sign', text: '' }])
  }

  if (items.length === 0) {
    return (
      <CastRow label={t('sceneText')} mobile={mobile}>
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className={ghostClass}
        >
          <Plus className="size-3.5" aria-hidden />
          {/* 桌面没有标题列，按钮自己说「画面文字」。 */}
          {mobile ? t('addSceneText') : t('sceneText')}
        </button>
      </CastRow>
    )
  }
  return (
    <>
      {items.map((item, slot) => (
        <CastRow
          key={slot}
          label={slot === 0 ? t('sceneText') : undefined}
          mobile={mobile}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('sceneKindLabel')}
                className={pillClass}
              >
                {t(kindLabelKey(item.kind))}
                <ChevronDown
                  className="size-3 text-muted-foreground"
                  aria-hidden
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={item.kind}
                onValueChange={(kind) =>
                  write(
                    items.map((entry, i) =>
                      i === slot
                        ? { ...entry, kind: kind as NovelAiSceneTextKind }
                        : entry,
                    ),
                  )
                }
              >
                {NOVELAI_SCENE_TEXT_KINDS.map((kind) => (
                  <DropdownMenuRadioItem key={kind} value={kind}>
                    {t(kindLabelKey(kind))}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <label className={mobile ? mobileFieldClass : fieldClass}>
            <Type
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              autoFocus={justAdded === slot}
              value={item.text}
              maxLength={NOVELAI_TEXT_MAX_CHARS}
              disabled={disabled}
              placeholder={t('sceneTextPlaceholder')}
              aria-label={t(kindLabelKey(item.kind))}
              onChange={(event) =>
                write(
                  items.map((entry, i) =>
                    i === slot ? { ...entry, text: event.target.value } : entry,
                  ),
                )
              }
              className={inputClass}
            />
            {slot === items.length - 1 && !mobile ? <TextCount /> : null}
          </label>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('removeSceneText')}
            onClick={() => write(items.filter((_, i) => i !== slot))}
            className="touch-target-y grid size-6 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-3" aria-hidden />
          </button>
          {slot === items.length - 1 &&
          items.length < NOVELAI_MAX_SCENE_TEXTS ? (
            <button
              type="button"
              disabled={disabled}
              onClick={add}
              className={ghostClass}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('addAnotherSceneText')}
            </button>
          ) : null}
          {slot === items.length - 1 && mobile ? <TextCount mobile /> : null}
        </CastRow>
      ))}
    </>
  )
}

/**
 * 人数提示那一行。手机：一块灰底。桌面：靠在「跟着页签的那一行」右端的一行灰字 +
 * 黑丸（标签台 A），被点名的那几格在框里带小黑点（`useStudioTagCountMarks`）。
 */
function HintRow({
  mobile,
  children,
}: {
  mobile: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex max-w-full flex-wrap items-center gap-2 text-2xs text-muted-foreground',
        mobile
          ? 'w-fit rounded-lg bg-muted px-2.5 py-1.5'
          : 'ml-auto justify-end',
      )}
    >
      {children}
    </div>
  )
}

const hintActionClass =
  'h-6 rounded-full bg-foreground px-2.5 text-2xs font-medium text-background transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const hintQuietClass =
  'h-6 rounded-full px-2 text-2xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * 人数提示，挂在正向标签正下方：整体页 = ≥2 人而还写着 `1girl` / `solo` 这类单人
 * 标签；角色页 = 角色栏里写了 `1girl`（官方写法是 girl）。一行灰字 + 一键改，
 * ⛔ 不自动改。
 */
export function StudioTagCountHint({
  activeIndex,
  mobile,
  disabled,
}: {
  activeIndex: number | null
  mobile: boolean
  disabled: boolean
}) {
  return activeIndex === null ? (
    <WholeCountHint mobile={mobile} />
  ) : (
    <CharacterCountHint
      index={activeIndex}
      mobile={mobile}
      disabled={disabled}
    />
  )
}

/**
 * 「不用」点掉的那一条建议（按内容认）。模块级：输入框卡要读它决定点不点小黑点，
 * 提示行要写它 —— 两边不是父子，⛔ 不为这一位值挪进 context。
 */
let dismissedCountSuggestion: string | null = null
const dismissListeners = new Set<() => void>()
function useDismissedCountSuggestion() {
  const [value, setValue] = useState(dismissedCountSuggestion)
  useEffect(() => {
    const sync = () => setValue(dismissedCountSuggestion)
    dismissListeners.add(sync)
    return () => {
      dismissListeners.delete(sync)
    }
  }, [])
  const dismiss = (signature: string | null) => {
    dismissedCountSuggestion = signature
    dismissListeners.forEach((listener) => listener())
  }
  return [value, dismiss] as const
}

function useWholeCountSuggestion() {
  const { state } = useStudioForm()
  const c = useNovelAiCharacters()
  const [dismissed, dismiss] = useDismissedCountSuggestion()
  const people = c.characters.filter(
    (character) => character.enabled !== false && character.prompt.trim(),
  )
  const suggestion = suggestNovelAiCountTags(
    serializeTagChips(state.tagChips),
    people.map((character) => character.prompt),
  )
  const signature = suggestion ? JSON.stringify(suggestion) : null
  return {
    people: people.length,
    suggestion: !suggestion || dismissed === signature ? null : suggestion,
    dismiss: () => dismiss(signature),
  }
}

/**
 * 正在被人数提示点名的那几格（输入框里给它们点小黑点）：整体页 = 建议要去掉的
 * `1girl` / `solo`；角色页 = 写成 `1girl` 的那几格。
 */
export function useStudioTagCountMarks(
  activeIndex: number | null,
): readonly string[] {
  const whole = useWholeCountSuggestion()
  const c = useNovelAiCharacters()
  if (!c.mode) return []
  if (activeIndex === null) return whole.suggestion?.remove ?? []
  const character = c.characters[activeIndex]
  return character ? findNovelAiCharacterCountTags(character.prompt) : []
}

function WholeCountHint({ mobile }: { mobile: boolean }) {
  const t = useTranslations('StudioTags.cast')
  const { state, dispatch } = useStudioForm()
  const { people, suggestion, dismiss } = useWholeCountSuggestion()
  if (!suggestion) return null

  const apply = () => {
    const remove = new Set(suggestion.remove)
    const kept = state.tagChips.filter(
      (chip) => !remove.has(chip.text.trim().toLowerCase()),
    )
    const added: TagChip[] = suggestion.add.map((text) => ({ text, weight: 1 }))
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: [...added, ...kept] },
    })
  }
  return (
    <HintRow mobile={mobile}>
      {t('countHint', {
        count: people,
        tags: suggestion.remove.join(' · '),
      })}
      <button type="button" onClick={apply} className={hintActionClass}>
        {suggestion.add.length
          ? t('countFix', { tags: suggestion.add.join(', ') })
          : t('countRemove', { tags: suggestion.remove.join(' · ') })}
      </button>
      <button type="button" onClick={dismiss} className={hintQuietClass}>
        {t('countKeep')}
      </button>
    </HintRow>
  )
}

/** 角色栏里写了 `1girl` 这类人数标签：官方写法是 girl。 */
function CharacterCountHint({
  index,
  mobile,
  disabled,
}: {
  index: number
  mobile: boolean
  disabled: boolean
}) {
  const t = useTranslations('StudioTags.cast')
  const c = useNovelAiCharacters()
  const character = c.characters[index]
  const tags = character ? findNovelAiCharacterCountTags(character.prompt) : []
  if (!character || !tags.length) return null

  const fix = () => {
    const seen = new Set<string>()
    const chips = parseTagChips(character.prompt).flatMap((chip) => {
      const key = chip.text.trim().toLowerCase()
      const text = /^\d+girls?$/.test(key)
        ? 'girl'
        : /^\d+boys?$/.test(key)
          ? 'boy'
          : key === 'solo'
            ? null
            : chip.text
      if (text === null || seen.has(text.toLowerCase())) return []
      seen.add(text.toLowerCase())
      return [{ ...chip, text }]
    })
    c.update(index, { prompt: serializeTagChips(chips) })
  }
  return (
    <HintRow mobile={mobile}>
      {t('characterCountHint', { tags: tags.join(' · ') })}
      <button
        type="button"
        disabled={disabled}
        onClick={fix}
        className={hintActionClass}
      >
        {t('characterCountFix')}
      </button>
    </HintRow>
  )
}
