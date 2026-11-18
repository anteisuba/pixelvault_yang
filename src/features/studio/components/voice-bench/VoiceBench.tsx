'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { animate, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'

import { TTS_SPEED_RANGE, TTS_SPEED_STEPS } from '@/constants/audio-options'
import { VOICE_CUE_GROUPS } from '@/constants/chat-voice'
import { EASE_STANDARD, SHELL_MOTION } from '@/constants/motion'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STUDIO_OPERATOR_VOICE,
  type StudioOperatorVoiceModelId,
} from '@/constants/studio-operator-voice'
import {
  ArrowUp,
  ChevronDown,
  PencilLine,
  Play,
  Sparkles,
  Square,
} from '@/components/icons'
import { AvatarDisc, StudioOperatorAvatarSwitcher } from '@/features/assistant'
import { studioOutlineChipClass } from '@/components/ui/chip'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { VoicePickerDialog } from '@/components/business/voices/VoicePickerDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useErrorText } from '@/hooks/use-error-text'
import {
  playOperatorVoice,
  stopOperatorVoice,
  useOperatorVoice,
  usePlayingOperatorVoice,
} from '@/features/assistant/hooks'
import { usePersonaVoice } from '@/hooks/use-persona-voice'
import { useVoiceBench, type VoiceBenchPending } from '@/hooks/use-voice-bench'
import {
  toVoiceBenchView,
  useReportVoiceBench,
} from '@/hooks/use-voice-bench-view'
import { rewriteVoiceBenchTextAPI } from '@/lib/api-client'
import { leadingVoiceCues, voiceCueIdsIn } from '@/lib/chat-voice'
import { cn } from '@/lib/utils'
import type { VoiceBenchLine } from '@/types/voice-bench'

/** 三档型号的文案键（和 `STUDIO_OPERATOR_VOICE.modelIds` 同序，和对话头语音条同一套）。 */
const MODEL_LABEL_KEYS = ['free', 'pro', 'drama'] as const

const ROW_CLASS =
  'flex min-h-12 items-center gap-2.5 rounded-12 bg-muted px-3 py-2'

const ROUND_KEY_CLASS =
  'grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none [&>svg]:size-3.5'

/** 一句台词的字：句首方括号语气灰色等宽摆前面，正文照常。 */
function LineText({ text, muted }: { text: string; muted?: boolean }) {
  const { cues, rest } = leadingVoiceCues(text)
  return (
    <span
      className={cn(
        'min-w-0 flex-1 text-md leading-reading break-words',
        muted ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {cues.length ? (
        <span className="mr-1.5 font-mono text-2xs text-muted-foreground">
          {cues.join(' ')}
        </span>
      ) : null}
      {rest}
    </span>
  )
}

/**
 * 配音台（③，样件 v5）：只配现在这一位（全局人设那个角色，用户 10-26）。
 * 顶上她 + 嗓子▾；中间一行一句（▶ 放 · ✎ 放回输入框）；底下写一句 · 情绪 · 型号 · 按她说 · 念。
 * 「按她说」（③-2a）改完回到输入框给你看，你再点念（⛔ 改完直接念，用户 10-26）。
 * 念好的音频照常进素材库；台上列的就是素材库里她这副嗓子念过的那些（⛔ 另存台词表）。
 */
export function VoiceBench() {
  const t = useTranslations('VoiceBench')
  const tv = useTranslations('StudioOperator.voice')
  const errText = useErrorText()
  const voice = usePersonaVoice()
  const { persona } = useAssistantPersona()
  const bench = useVoiceBench(
    `${voice.characterCardId ?? ''}|${voice.voiceCardId ?? ''}`,
  )
  const { modelId, setModel } = useOperatorVoice()
  const playingId = usePlayingOperatorVoice()
  const [draft, setDraft] = useState('')
  /** 语速（画布音频节点同三档 `TTS_SPEED_STEPS`）。 */
  const [speed, setSpeed] = useState<number>(TTS_SPEED_RANGE.default)
  /** 就地挑嗓子 / 配 key；`retryKey` = 弄好之后接着念的那一句。 */
  const [dialog, setDialog] = useState<{
    kind: 'voice' | 'key'
    retryKey?: string
  } | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [rewriting, setRewriting] = useState(false)
  const reduceMotion = useReducedMotion()

  const lines = bench.data?.lines ?? []
  const count = lines.length + bench.pending.length
  // 助手看得见配音台（11-17）：台词框 / 嗓子 / 档 / 语速 / 最近几句，发请求时现读。
  const benchView = useMemo(
    () =>
      toVoiceBenchView({
        voice: voice.voiceName,
        model: modelId,
        speed,
        draft,
        recent: [
          ...(bench.data?.lines ?? []).map((line) => line.text),
          ...bench.pending.map((item) => item.text),
        ],
      }),
    [voice.voiceName, modelId, speed, draft, bench.data, bench.pending],
  )
  useReportVoiceBench(benchView)
  // 新的一句挨着输入框：多了一句就滚到底。
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [count])

  const submit = () => {
    if (!draft.trim()) return
    // 1.0 = 默认念法：不带语速（和没有这颗药丸时一样）。
    void bench.speak(
      draft,
      speed === TTS_SPEED_RANGE.default ? undefined : speed,
    )
    setDraft('')
  }

  /** 改好放回输入框、光标落到最后，看一眼再念；字淡入（⛔ 直接换字，用户 10-27）。 */
  const fillDraft = (text: string) => {
    setDraft(text)
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(text.length, text.length)
      if (reduceMotion) return
      void animate(
        input,
        {
          opacity: [0, 1],
          filter: [`blur(${SHELL_MOTION.draftFillBlurPx}px)`, 'blur(0px)'],
        },
        { duration: SHELL_MOTION.draftFillS, ease: EASE_STANDARD },
      )
    })
  }

  /** 「语气」菜单挑了一个：`[标记]` 插到光标处（没点过输入框 = 插在最前面），光标落到它后面。 */
  const insertCue = (tag: string) => {
    const input = inputRef.current
    const cue = `[${tag}]`
    const start = input?.selectionStart ?? 0
    const end = input?.selectionEnd ?? start
    const next = draft.slice(0, start) + cue + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      if (!input) return
      input.focus()
      input.setSelectionRange(start + cue.length, start + cue.length)
    })
  }

  const rewrite = async () => {
    const text = draft.trim()
    if (!text || rewriting) return
    setRewriting(true)
    const result = await rewriteVoiceBenchTextAPI({ text })
    setRewriting(false)
    if (result.success) fillDraft(result.data.text)
    else toast.error(errText.api(result, t('rewriteFailed')))
  }

  const noPersona = bench.data !== null && bench.data.characterCardId === null

  return (
    <div
      data-testid="voice-bench"
      className="flex h-page min-h-0 w-full flex-col gap-3 p-3 lg:p-8"
    >
      <div data-bench-header className="flex h-9 shrink-0 items-center">
        {voice.characterCardId ? (
          <button
            type="button"
            data-testid="voice-bench-voice"
            onClick={() => setDialog({ kind: 'voice' })}
            className={cn(studioOutlineChipClass, 'max-w-80 pl-1')}
          >
            <span className="size-6 shrink-0">
              <AvatarDisc url={persona.avatarUrl} name={voice.personaName} />
            </span>
            <span className="truncate text-foreground">
              {voice.personaName}
            </span>
            <span className="truncate">
              {voice.voiceName ?? tv('pickVoice')}
            </span>
            <ChevronDown className="size-3 shrink-0" aria-hidden />
          </button>
        ) : null}
      </div>

      {noPersona ? (
        <div className="grid flex-1 place-items-center">
          <EmptyState
            title={t('noPersonaTitle')}
            description={t('noPersonaBody')}
            action={
              <StudioOperatorAvatarSwitcher>
                <Button>{t('switchPersona')}</Button>
              </StudioOperatorAvatarSwitcher>
            }
          />
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            data-testid="voice-bench-lines"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto lg:mb-4"
          >
            {bench.loading ? (
              <div className="grid flex-1 place-items-center">
                <Spinner size="md" />
              </div>
            ) : bench.error && !bench.data ? (
              <div className="grid flex-1 place-items-center">
                <EmptyState
                  tone="error"
                  title={t('loadFailed')}
                  action={
                    <Button onClick={() => void bench.refresh()}>
                      {t('retry')}
                    </Button>
                  }
                />
              </div>
            ) : null}
            {lines.map((line) => (
              <BenchLineRow
                key={line.id}
                line={line}
                avatarUrl={persona.avatarUrl}
                name={voice.personaName}
                playing={playingId === line.id}
                onEdit={() => fillDraft(line.text)}
              />
            ))}
            {bench.pending.map((item) => (
              <PendingRow
                key={item.key}
                item={item}
                avatarUrl={persona.avatarUrl}
                name={voice.personaName}
                playing={playingId === item.key}
                onRetry={() => bench.retry(item.key)}
                onPickVoice={() =>
                  setDialog({ kind: 'voice', retryKey: item.key })
                }
                onSetupKey={() =>
                  setDialog({ kind: 'key', retryKey: item.key })
                }
              />
            ))}
          </div>

          <form
            data-testid="voice-bench-composer"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
            className="flex shrink-0 flex-col gap-2.5 rounded-16 py-2.5 pr-3 pl-4 shadow-card"
          >
            <textarea
              ref={inputRef}
              value={draft}
              readOnly={rewriting}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  submit()
                }
              }}
              rows={2}
              aria-label={t('placeholder')}
              placeholder={t('placeholder')}
              className="max-h-40 w-full resize-none bg-transparent text-md leading-reading text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-1.5">
              <CueMenu picked={voiceCueIdsIn(draft)} onPick={insertCue} />
              <ChipMenu
                label={tv(
                  `models.${MODEL_LABEL_KEYS[STUDIO_OPERATOR_VOICE.modelIds.indexOf(modelId)] ?? 'free'}`,
                )}
                value={modelId}
                onChange={(next) =>
                  setModel(next as StudioOperatorVoiceModelId)
                }
                options={STUDIO_OPERATOR_VOICE.modelIds.map((id, index) => ({
                  id,
                  label: tv(`models.${MODEL_LABEL_KEYS[index]}`),
                }))}
              />
              <ChipMenu
                testId="voice-bench-speed"
                label={
                  speed === TTS_SPEED_RANGE.default
                    ? t('speed')
                    : `${t('speed')} ${speedLabel(speed)}`
                }
                value={String(speed)}
                onChange={(next) => setSpeed(Number(next))}
                options={TTS_SPEED_STEPS.map((step) => ({
                  id: String(step),
                  label: speedLabel(step),
                }))}
              />
              <span className="flex-1" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!draft.trim() || rewriting}
                onClick={() => void rewrite()}
                data-testid="voice-bench-rewrite"
              >
                {rewriting ? <Spinner size="sm" /> : <Sparkles aria-hidden />}
                {t('rewrite')}
              </Button>
              {/* 和对话输入框同一颗发送键（用户 10-27「换成通用的」）。 */}
              <button
                type="submit"
                disabled={!draft.trim() || rewriting}
                aria-label={t('speak')}
                title={t('speak')}
                data-testid="voice-bench-speak"
                className="touch-target grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-[background-color,color,transform] duration-fast ease-standard hover:tint-hover active:scale-95 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none disabled:cursor-not-allowed disabled:bg-surface-fill-track disabled:text-muted-foreground"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          </form>
        </>
      )}

      <VoicePickerDialog
        open={dialog?.kind === 'voice'}
        onOpenChange={(next) => {
          if (!next) setDialog(null)
        }}
        onPick={(card) => {
          const retryKey = dialog?.retryKey
          void voice.bind(card).then((bound) => {
            if (bound && retryKey) bench.retry(retryKey)
          })
        }}
      />
      {dialog?.kind === 'key' ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          modelId={modelId}
          modelLabel={tv('provider')}
          adapterType={AI_ADAPTER_TYPES.FISH_AUDIO}
          optionId={`workspace:${modelId}`}
          selectStudioModel={false}
          onVerified={() => {
            const retryKey = dialog.retryKey
            setDialog(null)
            if (retryKey) bench.retry(retryKey)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * 「语气」药丸（用户 10-27：情绪要齐）：点开按 情绪 · 更多情绪 · 语气 · 音效 · 停顿 分组，一组一排小药丸；
 * 点一个就插进台词、菜单收起。词表照 Fish 官方（`VOICE_CUE_GROUPS`）。
 * 药丸上显示台词里已经写了的语气（`picked`，从字里读出来的，11-17 真机「选了开心按钮还写着语气」）。
 */
function CueMenu({
  picked,
  onPick,
}: {
  picked: readonly string[]
  onPick(tag: string): void
}) {
  const t = useTranslations('VoiceBench')
  const [open, setOpen] = useState(false)
  const label = picked.length
    ? picked.map((id) => t(`cues.${id}`)).join(' · ')
    : t('cue')
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="voice-bench-cues"
          data-picked={picked.length ? picked.join(' ') : undefined}
          title={picked.length ? `${t('cue')}: ${label}` : undefined}
          className={cn(
            studioOutlineChipClass,
            'max-w-48 data-[state=open]:bg-fill-strong data-[state=open]:text-foreground',
            picked.length ? 'text-foreground' : null,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        // 点完药丸焦点回到输入框，⛔ 被浮层抢走。
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-(--radix-popover-content-available-height) w-96 max-w-(--radix-popover-content-available-width) flex-col gap-3 overflow-y-auto p-3"
      >
        {VOICE_CUE_GROUPS.map((group) => (
          <section key={group.id} className="flex flex-col gap-1.5">
            <h3 className="text-2xs text-muted-foreground">
              {t(`cueGroups.${group.id}`)}
            </h3>
            <div className="flex flex-wrap gap-1">
              {group.cues.map((cue) => (
                <button
                  key={cue.id}
                  type="button"
                  title={`[${cue.tag}]`}
                  onClick={() => {
                    onPick(cue.tag)
                    setOpen(false)
                  }}
                  className="h-7 rounded-full bg-muted px-2.5 text-2sm text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
                >
                  {t(`cues.${cue.id}`)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** `1.2` → `1.2×`（和画布音频节点的语速分段条同一种写法）。 */
const speedLabel = (step: number) => `${step.toFixed(1)}×`

/** 输入框底下的参数药丸（ui-spec ㉕）：点开一个单选菜单。 */
function ChipMenu({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string
  value: string
  onChange(next: string): void
  options: readonly { id: string; label: string }[]
  testId?: string
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          // 开着深一档（`studioOutlineChipOpenClass` 那一档）。
          className={cn(
            studioOutlineChipClass,
            'data-[state=open]:bg-fill-strong data-[state=open]:text-foreground',
          )}
        >
          {label}
          <ChevronDown className="size-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              indicator="check-end"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowAvatar({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="size-7 shrink-0">
      <AvatarDisc url={url} name={name} />
    </span>
  )
}

function BenchLineRow({
  line,
  avatarUrl,
  name,
  playing,
  onEdit,
}: {
  line: VoiceBenchLine
  avatarUrl: string | null
  name: string
  playing: boolean
  onEdit(): void
}) {
  const t = useTranslations('VoiceBench')
  return (
    <div data-testid="voice-bench-line" className={ROW_CLASS}>
      <RowAvatar url={avatarUrl} name={name} />
      <LineText text={line.text} />
      <button
        type="button"
        aria-label={playing ? t('stop') : t('play')}
        aria-pressed={playing}
        onClick={() =>
          playing ? stopOperatorVoice() : playOperatorVoice(line.id, line.url)
        }
        className={cn(
          ROUND_KEY_CLASS,
          'bg-primary text-primary-foreground hover:tint-hover',
        )}
      >
        {playing ? <Square weight="fill" /> : <Play weight="fill" />}
      </button>
      <button
        type="button"
        aria-label={t('editLine')}
        title={t('editLine')}
        onClick={onEdit}
        className={cn(
          ROUND_KEY_CLASS,
          'text-ink-2 hover:tint-hover hover:text-foreground',
        )}
      >
        <PencilLine />
      </button>
    </div>
  )
}

function PendingRow({
  item,
  avatarUrl,
  name,
  playing,
  onRetry,
  onPickVoice,
  onSetupKey,
}: {
  item: VoiceBenchPending
  avatarUrl: string | null
  name: string
  playing: boolean
  onRetry(): void
  onPickVoice(): void
  onSetupKey(): void
}) {
  const t = useTranslations('VoiceBench')
  const action = (label: string, onClick: () => void): ReactNode => (
    <Button size="xs" variant="secondary" onClick={onClick}>
      {label}
    </Button>
  )
  return (
    <div
      data-testid="voice-bench-pending"
      data-status={item.status}
      className={ROW_CLASS}
    >
      <RowAvatar url={avatarUrl} name={name} />
      <LineText text={item.text} muted />
      {item.status === 'pending' ? (
        <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Spinner size="sm" />
          {t('pending')}
        </span>
      ) : item.status === 'unbound' ? (
        action(t('pickVoice'), onPickVoice)
      ) : item.status === 'needsKey' ? (
        action(t('setupKey'), onSetupKey)
      ) : item.status === 'unlisted' && item.url ? (
        // 念好了、已计费，只是素材库这回没读到它：能放，⛔ 无声消失（11-17）。
        <>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {t('unlisted')}
          </span>
          {action(playing ? t('stop') : t('play'), () =>
            playing
              ? stopOperatorVoice()
              : playOperatorVoice(item.key, item.url!),
          )}
        </>
      ) : (
        action(t('failed'), onRetry)
      )}
    </div>
  )
}
