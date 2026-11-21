'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { TTS_SPEED_STEPS } from '@/constants/audio-options'
import { STUDIO_REMIX_QUERY, STUDIO_TEMPLATE_QUERY } from '@/constants/routes'
import {
  STUDIO_OPERATOR_VOICE,
  type StudioOperatorVoiceModelId,
} from '@/constants/studio-operator-voice'
import { ensureVoiceCards } from '@/features/cards/hooks'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  fetchGenerationByIdAPI,
  fetchGenerationReplayAPI,
} from '@/lib/api-client'
import { getRecipeAPI } from '@/lib/api-client/recipes'
import { getGenerationUserPrompt } from '@/lib/studio-remix'

/** 到达配音间要带的那几格（`null` = 来源没记，保持当前）。 */
export interface VoiceBenchArrival {
  /** 什么来的：做同款说「已套用这件作品的设置」，模板说「已套用「名字」」。 */
  label: { name: string; message?: string }
  /** 台词（语气 `[标记]` 就写在字里，跟着一起带回来）。 */
  text: string
  modelId: StudioOperatorVoiceModelId | null
  speed: number | null
  /** 原来那段是谁念的（作品上记的名字）；`originalVoice` 为 null 时只用来提示。 */
  originalVoiceName: string | null
  /**
   * 原来那副嗓子在我的音色卡里还在 = 那张卡：配音台把它当本次的临时音色（⛔ 改角色卡上的绑定）。
   * null = 来源没记 / 那副已经不在了。
   */
  originalVoice: { id: string; name: string } | null
}

function asTier(modelId: string | null | undefined) {
  return STUDIO_OPERATOR_VOICE.modelIds.find((tier) => tier === modelId) ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asSpeed(value: unknown): number | null {
  return TTS_SPEED_STEPS.find((step) => step === value) ?? null
}

/**
 * 配音间的「做同款 / 使用模板」到达（工作台那份 `use-studio-arrival.ts` 的同一套参数，
 * 配音间不在工作台的 Provider 里，自己接）：
 * - `?remix=<id>` —— 本人的整行（台词 · 档位 · 当时的嗓子名）；不是你的退到公开配方
 *   （只有台词与档位，按 `isPromptPublic` 抹）。⚠ 语速没记在作品上，带不回来。
 * - `?template=<id>` —— 模板正文 · 档位 · 存了的语速。
 * 嗓子：本人的作品按 `snapshot.voiceId` 找回我还留着的那张音色卡，交给配音台当**本次的临时音色**；
 * ⛔ 改角色卡上的绑定（`usePersonaVoice().bind` 会改写卡）。那副已经不在了只提示一句。装一次就把参数拿掉。
 */
export function useVoiceBenchArrival(
  apply: (arrival: VoiceBenchArrival) => void,
): void {
  const t = useTranslations('VoiceBench')
  const tTemplates = useTranslations('StudioTemplates')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const remixId = searchParams.get(STUDIO_REMIX_QUERY)
  const templateId = searchParams.get(STUDIO_TEMPLATE_QUERY)

  const latest = useRef({ apply, t, tTemplates })
  useEffect(() => {
    latest.current = { apply, t, tTemplates }
  })
  const handled = useRef<string | null>(null)

  useEffect(() => {
    const target = remixId
      ? { kind: 'remix' as const, id: remixId }
      : templateId
        ? { kind: 'template' as const, id: templateId }
        : null
    if (!target) return
    const key = `${target.kind}:${target.id}`
    if (handled.current === key) return
    handled.current = key

    const query = new URLSearchParams(searchParams.toString())
    query.delete(STUDIO_REMIX_QUERY)
    query.delete(STUDIO_TEMPLATE_QUERY)
    const rest = query.toString()
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })

    void (async (): Promise<VoiceBenchArrival | null> => {
      const remixLabel = {
        name: '',
        message: latest.current.tTemplates('appliedRemix'),
      }
      if (target.kind === 'template') {
        const response = await getRecipeAPI(target.id)
        if (!response.success || !response.data) return null
        const recipe = response.data
        return {
          label: { name: recipe.name || recipe.modelId },
          text: recipe.compiledPrompt.trim(),
          modelId: asTier(recipe.modelId),
          speed: asSpeed(asRecord(recipe.params)?.speed),
          originalVoiceName: null,
          originalVoice: null,
        }
      }
      const own = await fetchGenerationByIdAPI(target.id)
      if (own.success) {
        const snapshot = asRecord(own.data.snapshot)
        const voiceName = snapshot?.voiceName
        const voiceId = snapshot?.voiceId
        const card =
          typeof voiceId === 'string' && voiceId
            ? ((await ensureVoiceCards()).find(
                (entry) => entry.voiceId === voiceId,
              ) ?? null)
            : null
        return {
          label: remixLabel,
          text: getGenerationUserPrompt(own.data),
          modelId: asTier(own.data.model),
          speed: null,
          originalVoiceName:
            typeof voiceName === 'string' && voiceName.trim()
              ? voiceName.trim()
              : null,
          originalVoice: card ? { id: card.id, name: card.name } : null,
        }
      }
      const shared = await fetchGenerationReplayAPI(target.id)
      if (!shared.success || !shared.data.prompt) return null
      return {
        label: remixLabel,
        text: shared.data.prompt.trim(),
        modelId: asTier(shared.data.modelId),
        speed: null,
        originalVoiceName: null,
        originalVoice: null,
      }
    })().then((arrival) => {
      if (arrival?.text) latest.current.apply(arrival)
      else toast.error(latest.current.t('arrivalLoadFailed'))
    })
  }, [pathname, remixId, router, searchParams, templateId])
}
