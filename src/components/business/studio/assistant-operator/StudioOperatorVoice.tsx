'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STUDIO_OPERATOR_VOICE,
  type StudioOperatorVoiceModelId,
} from '@/constants/studio-operator-voice'
import { ChevronDown, Play, Square, Volume2 } from '@/components/icons'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { VoicePickerDialog } from '@/components/business/voices/VoicePickerDialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useChatPersona } from '@/hooks/use-chat-persona'
import {
  playOperatorVoice,
  speakOperatorReply,
  stopOperatorVoice,
  useOperatorVoice,
  usePlayingOperatorVoice,
} from '@/hooks/use-operator-voice'
import { getVoiceCardAPI, updateCharacterCardAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { StudioOperatorMessageVoice } from '@/types/studio-assistant-operator'

/** 三档型号的文案键（和 `STUDIO_OPERATOR_VOICE.modelIds` 同序）。 */
const MODEL_LABEL_KEYS = ['free', 'pro', 'drama'] as const

/**
 * 她现在用哪副嗓子（设置里那位角色绑的那张音色卡）、换一副。
 * 换完就写回角色卡：配音台、素材库认的也是这一副。
 */
function usePersonaVoice() {
  const { ref, name } = useChatPersona()
  const [picked, setPicked] = useState<{
    characterCardId: string
    voiceCardId: string
    name: string
  } | null>(null)
  const current =
    picked && picked.characterCardId === ref.characterCardId ? picked : null
  const voiceCardId = current?.voiceCardId ?? ref.voiceCardId
  const [loaded, setLoaded] = useState<{ id: string; name: string } | null>(
    null,
  )
  useEffect(() => {
    if (!voiceCardId || current) return
    let active = true
    void getVoiceCardAPI(voiceCardId).then((result) => {
      if (active && result.success && result.data)
        setLoaded({ id: voiceCardId, name: result.data.name })
    })
    return () => {
      active = false
    }
  }, [voiceCardId, current])

  const voiceName =
    current?.name ?? (loaded?.id === voiceCardId ? loaded.name : null)
  const bind = async (card: { id: string; name: string }) => {
    if (!ref.characterCardId) return false
    const result = await updateCharacterCardAPI(ref.characterCardId, {
      voiceCardId: card.id,
    })
    if (!result.success) return false
    setPicked({
      characterCardId: ref.characterCardId,
      voiceCardId: card.id,
      name: card.name,
    })
    return true
  }
  return {
    characterCardId: ref.characterCardId,
    personaName: name,
    voiceCardId,
    voiceName,
    bind,
  }
}

/**
 * 对话头那颗 🔊（样件 v5）：关着是一颗圆键，开着拉长成墨蓝的「语音」胶囊。
 * 只有换成了某个角色才有（默认助手没有嗓子）。
 */
export function StudioOperatorVoiceKey() {
  const t = useTranslations('StudioOperator.voice')
  const { characterCardId } = usePersonaVoice()
  const { on, setOn } = useOperatorVoice()
  if (!characterCardId) return null
  return (
    <button
      type="button"
      data-testid="operator-voice-key"
      aria-pressed={on}
      aria-label={on ? t('turnOff') : t('turnOn')}
      onClick={() => setOn(!on)}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-2 text-2sm font-medium transition-[width,background-color,color] duration-spring-expand ease-spring-expand focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
        on
          ? 'w-18 bg-primary text-primary-foreground'
          : 'w-8 text-muted-foreground hover:bg-surface-fill hover:text-foreground',
      )}
    >
      <Volume2 className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          'whitespace-nowrap transition-[opacity,transform] delay-75 duration-base ease-standard motion-reduce:transition-none',
          on ? 'opacity-100' : '-translate-x-1 opacity-0',
        )}
      >
        {t('label')}
      </span>
    </button>
  )
}

/**
 * 对话头下面那一条（开着语音才展开）：她在用声音说话 · 嗓子▾ · 免费 / Pro / Drama 3。
 */
export function StudioOperatorVoiceStrip() {
  const t = useTranslations('StudioOperator.voice')
  const voice = usePersonaVoice()
  const { on, modelId, setModel } = useOperatorVoice()
  const [picking, setPicking] = useState(false)
  const open = on && voice.characterCardId !== null

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      data-testid="operator-voice-strip"
      data-open={open}
      className="operator-voice-strip shrink-0"
    >
      <div>
        <div className="mx-4 mb-2 flex h-11 items-center gap-2 rounded-full bg-primary/10 pr-1.5 pl-3 text-2sm">
          <span
            aria-hidden
            className="flex h-3.5 shrink-0 items-center gap-0.5 text-primary"
          >
            {['h-1.5', 'h-3', 'h-2', 'h-3.5', 'h-1.75'].map((height, index) => (
              <i
                key={height}
                className={cn(
                  'w-0.5 rounded-full bg-current',
                  height,
                  index % 2 === 0
                    ? 'animate-spinner-dot-1'
                    : 'animate-spinner-dot-2',
                  'motion-reduce:animate-none',
                )}
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {t('speaking', { name: voice.personaName })}
          </span>
          <button
            type="button"
            data-testid="operator-voice-pick"
            onClick={() => setPicking(true)}
            className="flex h-8 max-w-40 shrink-0 items-center gap-1 rounded-full bg-card px-3 text-2sm text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
          >
            <span className="truncate">
              {voice.voiceName ?? t('pickVoice')}
            </span>
            <ChevronDown className="size-3 shrink-0" aria-hidden />
          </button>
          <ToggleGroup
            type="single"
            variant="segmented"
            value={modelId}
            onValueChange={(next) => {
              if (next) setModel(next as StudioOperatorVoiceModelId)
            }}
            aria-label={t('model')}
            className="w-52 shrink-0 bg-card"
          >
            {STUDIO_OPERATOR_VOICE.modelIds.map((id, index) => (
              <ToggleGroupItem key={id} value={id}>
                {t(`models.${MODEL_LABEL_KEYS[index]}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      <VoicePickerDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(card) => void voice.bind(card)}
      />
    </div>
  )
}

/**
 * 她那段话底下的一行（开着语音才有）：正在念 · ▶ 重听 / ■ 停 · 没念出来再念一次 ·
 * 缺嗓子就地挑 · 缺 key 就地配（Hard Rule 8）。
 */
export function StudioOperatorChatVoice({
  entryId,
  text,
  voice,
}: {
  entryId: string
  text: string
  voice: StudioOperatorMessageVoice
}) {
  const t = useTranslations('StudioOperator.voice')
  const playing = usePlayingOperatorVoice() === entryId
  const persona = usePersonaVoice()
  const { modelId } = useOperatorVoice()
  const [dialog, setDialog] = useState<'voice' | 'key' | null>(null)
  const retry = () => void speakOperatorReply(entryId, text)

  const action =
    'flex h-7 w-fit items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none'

  return (
    <div data-testid="operator-chat-voice" data-status={voice.status}>
      {voice.status === 'pending' ? (
        <span className="flex h-7 items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Volume2 className="size-3.5" aria-hidden />
          {t('pending')}
        </span>
      ) : voice.status === 'ready' ? (
        <button
          type="button"
          className={action}
          aria-pressed={playing}
          onClick={() =>
            playing
              ? stopOperatorVoice()
              : playOperatorVoice(entryId, voice.url)
          }
        >
          {playing ? (
            <Square className="size-3" aria-hidden />
          ) : (
            <Play className="size-3" aria-hidden />
          )}
          {playing ? t('stop') : t('replay')}
        </button>
      ) : voice.status === 'unbound' ? (
        <button
          type="button"
          className={action}
          onClick={() => setDialog('voice')}
        >
          {t('pickVoice')}
        </button>
      ) : voice.status === 'needsKey' ? (
        <button
          type="button"
          className={action}
          onClick={() => setDialog('key')}
        >
          {t('setupKey')}
        </button>
      ) : (
        <button type="button" className={action} onClick={retry}>
          {t('failed')}
        </button>
      )}

      <VoicePickerDialog
        open={dialog === 'voice'}
        onOpenChange={(next) => setDialog(next ? 'voice' : null)}
        onPick={(card) =>
          void persona.bind(card).then((bound) => {
            if (bound) retry()
          })
        }
      />
      {dialog === 'key' ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          modelId={modelId}
          modelLabel={t('provider')}
          adapterType={AI_ADAPTER_TYPES.FISH_AUDIO}
          optionId={`workspace:${modelId}`}
          selectStudioModel={false}
          onVerified={() => {
            setDialog(null)
            retry()
          }}
        />
      ) : null}
    </div>
  )
}
