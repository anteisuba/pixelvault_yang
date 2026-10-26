'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STUDIO_OPERATOR_VOICE,
  type StudioOperatorVoiceModelId,
} from '@/constants/studio-operator-voice'
import {
  AUDIO_EMOTIONS,
  AUDIO_STYLE,
  type AudioEmotion,
} from '@/constants/voice-cards'
import { ChevronDown, Play, RotateCcw, Square } from '@/components/icons'
import {
  AvatarDisc,
  StudioOperatorAvatarSwitcher,
} from '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher'
import { studioOutlineChipClass } from '@/components/business/studio-shared/primitives/tool-surface'
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
import { Spinner } from '@/components/ui/spinner'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import {
  playOperatorVoice,
  stopOperatorVoice,
  useOperatorVoice,
  usePlayingOperatorVoice,
} from '@/hooks/use-operator-voice'
import { usePersonaVoice } from '@/hooks/use-persona-voice'
import { useVoiceBench, type VoiceBenchPending } from '@/hooks/use-voice-bench'
import { leadingVoiceCues } from '@/lib/chat-voice'
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
        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
          {cues.join(' ')}
        </span>
      ) : null}
      {rest}
    </span>
  )
}

/**
 * 配音台（③，样件 v5）：只配现在这一位（全局人设那个角色，用户 10-26）。
 * 顶上她 + 嗓子▾；中间一行一句（▶ 放 · ↻ 重录）；底下写一句 · 情绪 · 型号 · 念。
 * 念好的音频照常进素材库；台上列的就是素材库里她这副嗓子念过的那些（⛔ 另存台词表）。
 */
export function VoiceBench() {
  const t = useTranslations('VoiceBench')
  const tv = useTranslations('StudioOperator.voice')
  const voice = usePersonaVoice()
  const { persona } = useAssistantPersona()
  const bench = useVoiceBench(
    `${voice.characterCardId ?? ''}|${voice.voiceCardId ?? ''}`,
  )
  const { modelId, setModel } = useOperatorVoice()
  const playingId = usePlayingOperatorVoice()
  const [draft, setDraft] = useState('')
  const [emotion, setEmotion] = useState<AudioEmotion>(AUDIO_STYLE.NONE)
  /** 就地挑嗓子 / 配 key；`retryKey` = 弄好之后接着念的那一句。 */
  const [dialog, setDialog] = useState<{
    kind: 'voice' | 'key'
    retryKey?: string
  } | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const lines = bench.data?.lines ?? []
  const count = lines.length + bench.pending.length
  // 新的一句挨着输入框：多了一句就滚到底。
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [count])

  const submit = () => {
    if (!draft.trim()) return
    void bench.speak(draft, emotion === AUDIO_STYLE.NONE ? undefined : emotion)
    setDraft('')
  }

  const noPersona = bench.data !== null && bench.data.characterCardId === null

  return (
    <div
      data-testid="voice-bench"
      className="flex h-page min-h-0 w-full flex-col gap-3 p-3"
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
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
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
                onRetake={() => void bench.retake(line.text)}
              />
            ))}
            {bench.pending.map((item) => (
              <PendingRow
                key={item.key}
                item={item}
                avatarUrl={persona.avatarUrl}
                name={voice.personaName}
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
            className="flex shrink-0 flex-col gap-2.5 rounded-16 py-2.5 pr-3 pl-4 shadow-ring"
          >
            <textarea
              value={draft}
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
              <ChipMenu
                label={`${t('emotion')} · ${t(`emotions.${emotion}`)}`}
                value={emotion}
                onChange={(next) => setEmotion(next as AudioEmotion)}
                options={AUDIO_EMOTIONS.map((id) => ({
                  id,
                  label: t(`emotions.${id}`),
                }))}
              />
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
              <span className="flex-1" />
              <Button
                type="submit"
                size="sm"
                disabled={!draft.trim()}
                data-testid="voice-bench-speak"
              >
                {t('speak')}
              </Button>
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

/** 输入框底下的参数药丸（ui-spec ㉕）：点开一个单选菜单。 */
function ChipMenu({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange(next: string): void
  options: readonly { id: string; label: string }[]
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
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
    <span className="size-6.5 shrink-0">
      <AvatarDisc url={url} name={name} />
    </span>
  )
}

function BenchLineRow({
  line,
  avatarUrl,
  name,
  playing,
  onRetake,
}: {
  line: VoiceBenchLine
  avatarUrl: string | null
  name: string
  playing: boolean
  onRetake(): void
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
        aria-label={t('retake')}
        title={t('retake')}
        onClick={onRetake}
        className={cn(
          ROUND_KEY_CLASS,
          'text-ink-2 hover:tint-hover hover:text-foreground',
        )}
      >
        <RotateCcw />
      </button>
    </div>
  )
}

function PendingRow({
  item,
  avatarUrl,
  name,
  onRetry,
  onPickVoice,
  onSetupKey,
}: {
  item: VoiceBenchPending
  avatarUrl: string | null
  name: string
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
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner size="sm" />
          {t('pending')}
        </span>
      ) : item.status === 'unbound' ? (
        action(t('pickVoice'), onPickVoice)
      ) : item.status === 'needsKey' ? (
        action(t('setupKey'), onSetupKey)
      ) : (
        action(t('failed'), onRetry)
      )}
    </div>
  )
}
