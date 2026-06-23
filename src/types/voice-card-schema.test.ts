import { describe, it, expect } from 'vitest'

import {
  CreateVoiceCardRequestSchema,
  ListVoiceCardsQuerySchema,
  UpdateVoiceCardRequestSchema,
} from '@/types'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_DEFAULT_PROVIDER,
  VOICE_CARD_PROVIDER,
} from '@/constants/voice-cards'

describe('CreateVoiceCardRequestSchema', () => {
  it('accepts minimal valid input and applies defaults', () => {
    const result = CreateVoiceCardRequestSchema.safeParse({
      name: 'Narrator',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.provider).toBe(
      VOICE_CARD_DEFAULT_PROVIDER,
    )
    expect(result.success && result.data.pace).toBe(VOICE_CARD_DEFAULT_PACE)
    expect(result.success && result.data.tone).toEqual([])
    expect(result.success && result.data.pronunciationDictionary).toEqual({})
  })

  it('accepts all supported metadata fields', () => {
    const result = CreateVoiceCardRequestSchema.safeParse({
      name: 'Warm narrator',
      provider: VOICE_CARD_PROVIDER.FAL_F5TTS,
      modelId: 'legacy-audio-queue',
      voiceId: 'voice_123',
      coverImage: 'https://cdn.example.com/cover.png',
      referenceAudioUrl: 'https://cdn.example.com/voice.mp3',
      gender: 'female',
      age: 'adult',
      tone: ['warm', 'calm'],
      pace: 'slow',
      pitch: 'medium',
      pronunciationDictionary: {
        PixelVault: 'pixel vault',
      },
      sampleText: 'Welcome to PixelVault.',
    })

    expect(result.success).toBe(true)
  })

  it('trims the voice card name', () => {
    const result = CreateVoiceCardRequestSchema.safeParse({
      name: '  Narrator  ',
    })

    expect(result.success && result.data.name).toBe('Narrator')
  })

  it('rejects an empty name', () => {
    expect(CreateVoiceCardRequestSchema.safeParse({ name: '' }).success).toBe(
      false,
    )
  })

  it('rejects unsupported provider values', () => {
    expect(
      CreateVoiceCardRequestSchema.safeParse({
        name: 'Narrator',
        provider: 'unknown',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid cover image URLs', () => {
    expect(
      CreateVoiceCardRequestSchema.safeParse({
        name: 'Narrator',
        coverImage: 'not-a-url',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid reference audio URLs', () => {
    expect(
      CreateVoiceCardRequestSchema.safeParse({
        name: 'Narrator',
        referenceAudioUrl: 'not-a-url',
      }).success,
    ).toBe(false)
  })

  it('rejects sample text above 500 characters', () => {
    expect(
      CreateVoiceCardRequestSchema.safeParse({
        name: 'Narrator',
        sampleText: 'x'.repeat(501),
      }).success,
    ).toBe(false)
  })
})

describe('UpdateVoiceCardRequestSchema', () => {
  it('accepts a partial update', () => {
    const result = UpdateVoiceCardRequestSchema.safeParse({
      pace: 'fast',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.pace).toBe('fast')
  })

  it('rejects invalid partial values', () => {
    expect(
      UpdateVoiceCardRequestSchema.safeParse({
        pitch: 'very-high',
      }).success,
    ).toBe(false)
  })
})

describe('ListVoiceCardsQuerySchema', () => {
  it('defaults page and pageSize', () => {
    const result = ListVoiceCardsQuerySchema.safeParse({})

    expect(result.success && result.data.page).toBe(1)
    expect(result.success && result.data.pageSize).toBe(20)
  })

  it('coerces query string numbers', () => {
    const result = ListVoiceCardsQuerySchema.safeParse({
      page: '2',
      pageSize: '10',
    })

    expect(result.success && result.data.page).toBe(2)
    expect(result.success && result.data.pageSize).toBe(10)
  })

  it('rejects pageSize above 50', () => {
    expect(
      ListVoiceCardsQuerySchema.safeParse({ pageSize: '51' }).success,
    ).toBe(false)
  })
})
