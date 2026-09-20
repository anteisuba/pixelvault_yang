import { describe, expect, it } from 'vitest'

import {
  ACTIVE_API_KEY_ADAPTER_OPTIONS,
  API_KEY_ADAPTER_OPTIONS,
} from '@/constants/api-keys'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

describe('api key adapter options', () => {
  it('keeps schema compatibility while exposing only active product adapters', () => {
    expect(API_KEY_ADAPTER_OPTIONS).toContain(AI_ADAPTER_TYPES.RUNWAY)
    expect(API_KEY_ADAPTER_OPTIONS).toContain(AI_ADAPTER_TYPES.HUGGINGFACE)

    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).toEqual([
      AI_ADAPTER_TYPES.GEMINI,
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.FAL,
      AI_ADAPTER_TYPES.NOVELAI,
      AI_ADAPTER_TYPES.VOLCENGINE,
      AI_ADAPTER_TYPES.BYTEPLUS,
      AI_ADAPTER_TYPES.FISH_AUDIO,
      AI_ADAPTER_TYPES.HYPER3D_RODIN,
      // ElevenLabs stays active through its SFX model (the v3 TTS model was
      // retired). The DashScope (Qwen) text route was retired 2026-09-17.
      AI_ADAPTER_TYPES.ELEVENLABS,
      // MiniMax joined 2026-08-01 with H3 video. Two entries, not one: the
      // global (api.minimax.io) and CN (api.minimaxi.com) stations have
      // separately-registered accounts and non-interchangeable keys, so each
      // needs its own slot in the key picker.
      AI_ADAPTER_TYPES.MINIMAX,
      AI_ADAPTER_TYPES.MINIMAX_CN,
      // Claude (Anthropic) joined 2026-07-26 as the canvas assistant's
      // structural-reasoning route (assistant capability) — see
      // docs/references/pages/assistant-shell.md.
      AI_ADAPTER_TYPES.ANTHROPIC,
      // xAI (Grok) joined 2026-08-23 with grok-4.6 on the enhance + assistant
      // capabilities. Active here purely through those LLM capabilities — it
      // has no AI_MODELS entry (text/vision only, generates no media).
      AI_ADAPTER_TYPES.XAI,
    ])

    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).not.toContain(
      AI_ADAPTER_TYPES.HUGGINGFACE,
    )
    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).not.toContain(
      AI_ADAPTER_TYPES.RUNWAY,
    )
    // Replicate went inactive 2026-09-17 with ILLUSTRIOUS_XL: both of its
    // catalog entries are now retired, so the key picker drops it the same way
    // it drops HuggingFace and Runway. The adapter and the enum stay so
    // existing Replicate keys keep validating.
    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).not.toContain(
      AI_ADAPTER_TYPES.REPLICATE,
    )
    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).not.toContain(AI_ADAPTER_TYPES.PIXAI)
    expect(API_KEY_ADAPTER_OPTIONS).toContain(AI_ADAPTER_TYPES.PIXAI)
  })
})
