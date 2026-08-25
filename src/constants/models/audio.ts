import {
  AUDIO_KIND,
  AUDIO_PROMPT_PAYLOAD_MAX_CHARS,
  DEFAULT_AUDIO_KIND,
  type AudioKind,
} from '@/constants/audio-options'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/**
 * TTS / audio synthesis models.
 *
 * ⚠ `maxPromptChars` here is a **vendor-documented** per-request text ceiling.
 * Omit it when the vendor documents none — an omitted field means "they publish
 * no limit", and only `AUDIO_PROMPT_PAYLOAD_MAX_CHARS` applies. Do not fill it
 * with a guess: until 2026-08-07 every audio model was held to ElevenLabs v3's
 * 5000, which is how three models that never had that limit ended up capped by
 * a retired fourth one.
 */
export const AUDIO_MODEL_OPTIONS: ModelOption[] = [
  {
    id: AI_MODELS.FISH_AUDIO_S2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FISH_AUDIO),
    // 走免费档 `s2.1-pro-free`：与收费档 `s2.1-pro` 是同一个模型、同样的语言覆盖；
    // `reference_id`（音色卡）与多说话人 `reference_id` 数组同样支持——2026-08-25
    // 查官方 API reference 确认，整个 S2 家族都支持多说话人，唯一不支持的是 `s1`。
    // model 走 HTTP header，合法值 s1 / s2-pro / s2.1-pro / s2.1-pro-free。
    //
    // Catalog enum 保持 `fish-audio-s2-pro` 不动（生成历史 / VoiceCard 稳定性）。
    //
    // ⚠ 免费期到 2026-08-31，且已经延期两次（07-24 → 整个 7 月 → 08-31）。到期若不
    // 再延，这个 model string 会失效——而它是目前**唯一 `available: true` 的语音
    // 模型**（`ELEVENLABS_V3` 已 `available: false`），失效即语音生成整条断掉。届时
    // 改回 `'s2.1-pro'`（$15 / 百万 UTF-8 字节，BYOK 由用户自付）。复核提醒钉在
    // `audio.test.ts` 的 execution id 用例上。
    //
    // ⚠ 免费档无 SLA、无 TTFA / DPA 保证，Fair Use 可限流，且官方声明请求**可能被
    // 用于改进模型**。
    // https://fish.audio/blog/s2-1-pro-free-api/
    // https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
    externalModelId: 's2.1-pro-free',
    outputType: 'AUDIO',
    audioKind: AUDIO_KIND.SPEECH,
    available: true,
    officialUrl:
      'https://docs.fish.audio/developer-guide/models-pricing/models-overview',
    timeoutMs: 60_000,
    qualityTier: 'premium',
    // No maxPromptChars on purpose. Fish publishes no per-request character
    // ceiling: the API reference states no maximum on `text` and the S2.1 Pro
    // API line is advertised as "no hard character cap (subject to Fair Use
    // Policy)" — the API even segments internally via `chunk_length` (100–300).
    // https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
    // https://fish.audio/blog/s2-1-pro-free-api/
    // Verified 2026-08-07. To falsify: submit >40k chars against s2.1-pro and
    // see whether Fish 400s on length (rather than timing out).
  },
  {
    id: AI_MODELS.ELEVENLABS_V3,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.ELEVENLABS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.ELEVENLABS),
    externalModelId: 'eleven_v3',
    outputType: 'AUDIO',
    audioKind: AUDIO_KIND.SPEECH,
    // Retired 2026-07-26 — ~6.7x the price of Fish Audio S2 Pro ($100 vs $15
    // per 1M chars) at comparable arena standing. The SFX variant below stays:
    // it is the only sound-effect model in the catalog.
    available: false,
    officialUrl:
      'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',
    timeoutMs: 60_000,
    qualityTier: 'premium',
    // ElevenLabs publishes a per-request character limit **per model**: v3 =
    // 5000, Multilingual v2 = 10_000, Flash v2.5 = 40_000
    // (https://elevenlabs.io/docs/overview/models). 5000 is v3's own number and
    // travels with this entry — it is the one model the old global cap belonged
    // to, and it stays correct if this entry is ever re-enabled.
    maxPromptChars: 5000,
  },
  {
    id: AI_MODELS.ELEVENLABS_SFX_V2,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.ELEVENLABS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.ELEVENLABS),
    // Upstream's documented model for POST /v1/sound-generation. The previous
    // value `eleven_sfx_v2` does not exist at ElevenLabs; it never surfaced
    // because generateSoundEffect() omits model_id and rides the server
    // default. Naming it correctly keeps that from becoming a 422 the day
    // someone wires model_id into the SFX body.
    externalModelId: 'eleven_text_to_sound_v2',
    outputType: 'AUDIO',
    audioKind: AUDIO_KIND.SFX,
    available: true,
    officialUrl:
      'https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert',
    timeoutMs: 60_000,
    qualityTier: 'premium',
    // ⚠ UNVERIFIED, so deliberately undeclared. The 2026-08-07 sweep could not
    // find a documented prompt-length limit for POST /v1/sound-generation (the
    // API reference and the published OpenAPI both state constraints only for
    // duration_seconds 0.5–30 and prompt_influence 0–1). It was held to the
    // shared TTS 5000 until then, which was ElevenLabs v3's number, not this
    // endpoint's. Declaring a guessed cap would repeat that mistake; the
    // payload guard applies instead. To settle it, read the sound-generation
    // schema in a browser with JS on, or send a very long prompt and see
    // whether ElevenLabs 422s on length.
  },
  {
    id: AI_MODELS.ELEVENLABS_MUSIC_V2,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.ELEVENLABS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.ELEVENLABS),
    // Body model_id for POST /v1/music (Compose). Default API still may be
    // music_v1 during transition; we pin v2 explicitly.
    externalModelId: 'music_v2',
    outputType: 'AUDIO',
    audioKind: AUDIO_KIND.MUSIC,
    available: true,
    officialUrl: 'https://elevenlabs.io/docs/api-reference/music/compose',
    timeoutMs: 180_000,
    qualityTier: 'premium',
    // ⚠ UNVERIFIED, same as the SFX entry above: POST /v1/music documents
    // music_length_ms (3000–600000) but no prompt-length constraint that the
    // 2026-08-07 sweep could reach. Left undeclared rather than guessed.
  },
]

/**
 * The text limit in force for one audio request against `model`.
 *
 * Two layers, kept apart on purpose:
 * - `declared` — the vendor's own documented per-request ceiling, or undefined
 *   when the vendor publishes none. This is the capability.
 * - `enforced` — what actually rejects a request: the declared ceiling, else
 *   the payload guard. Never treat `enforced` as a vendor capability.
 *
 * Both the Studio gate and the server check go through here so a model can
 * never be measured against another vendor's number again (the L split,
 * 2026-08-07). An unknown model resolves to guard-only rather than to some
 * conservative default — refusing to invent a ceiling is the point.
 */
export function resolveAudioTextLimit(
  model?: Pick<ModelOption, 'maxPromptChars'> | null,
): { declared?: number; enforced: number } {
  const declared = model?.maxPromptChars
  return {
    declared,
    enforced: declared ?? AUDIO_PROMPT_PAYLOAD_MAX_CHARS,
  }
}

/** The audio kind a model produces — defaults to speech when unset. */
export function resolveAudioKind(model: ModelOption): AudioKind {
  return model.audioKind ?? DEFAULT_AUDIO_KIND
}

/** Audio models producing the given kind (speech / sfx / music). */
export function getAudioModelsByKind(kind: AudioKind): ModelOption[] {
  return AUDIO_MODEL_OPTIONS.filter((model) => resolveAudioKind(model) === kind)
}
