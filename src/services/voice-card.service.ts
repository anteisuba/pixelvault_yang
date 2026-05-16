import 'server-only'

import type { Prisma, VoiceCard } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
} from '@/constants/voice-cards'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getVoice } from '@/services/fish-audio-voice.service'
import { ensureUser } from '@/services/user.service'
import type { CreateVoiceCardRequest, UpdateVoiceCardRequest } from '@/types'

export interface ListVoiceCardsResult {
  items: VoiceCard[]
  total: number
}

export interface CreateClonedVoiceCardInput {
  name: string
  voiceId: string
  referenceAudioUrl?: string | null
  sampleText?: string | null
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value)
  return JSON.parse(serialized) as Prisma.InputJsonValue
}

function throwVoiceCardNotFound(): never {
  throw new ApiRequestError(
    'VOICE_CARD_NOT_FOUND',
    404,
    'errors.voiceCard.notFound',
    'Voice card not found',
  )
}

async function validateFishAudioVoice(
  dbUserId: string,
  voiceId: string,
): Promise<void> {
  const apiKey = await findActiveKeyForAdapter(
    dbUserId,
    AI_ADAPTER_TYPES.FISH_AUDIO,
  )

  if (!apiKey) {
    throw new ApiRequestError(
      'FISH_AUDIO_API_KEY_REQUIRED',
      400,
      'errors.apiKey.missing',
      'A Fish Audio API key is required to validate this voice.',
    )
  }

  try {
    await getVoice(apiKey.keyValue, voiceId)
  } catch {
    throw new ApiRequestError(
      'VOICE_NOT_FOUND',
      400,
      'errors.voiceCard.voiceNotFound',
      'Voice was not found in Fish Audio.',
    )
  }
}

async function validateVoiceReference(
  dbUserId: string,
  data: { provider?: string; voiceId?: string | null },
): Promise<void> {
  if (!data.voiceId) {
    return
  }

  if (data.provider !== VOICE_CARD_PROVIDER.FISH_AUDIO) {
    throw new ApiRequestError(
      'VOICE_ID_PROVIDER_MISMATCH',
      400,
      'errors.voiceCard.voiceIdProviderMismatch',
      'voiceId is only valid for fish_audio provider.',
    )
  }

  await validateFishAudioVoice(dbUserId, data.voiceId)
}

export async function createVoiceCard(
  userId: string,
  data: CreateVoiceCardRequest,
): Promise<VoiceCard> {
  const user = await ensureUser(userId)
  await validateVoiceReference(user.id, data)

  return db.voiceCard.create({
    data: {
      userId: user.id,
      name: data.name,
      provider: data.provider,
      modelId: data.modelId ?? null,
      voiceId: data.voiceId ?? null,
      referenceAudioUrl: data.referenceAudioUrl ?? null,
      gender: data.gender ?? null,
      age: data.age ?? null,
      tone: toPrismaJson(data.tone),
      pace: data.pace,
      pitch: data.pitch ?? null,
      pronunciationDictionary: toPrismaJson(data.pronunciationDictionary),
      sampleText: data.sampleText ?? null,
    },
  })
}

export async function createClonedVoiceCard(
  userId: string,
  data: CreateClonedVoiceCardInput,
): Promise<VoiceCard> {
  const user = await ensureUser(userId)

  return db.voiceCard.create({
    data: {
      userId: user.id,
      name: data.name,
      provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
      modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId: data.voiceId,
      referenceAudioUrl: data.referenceAudioUrl ?? null,
      gender: null,
      age: null,
      tone: toPrismaJson([]),
      pace: VOICE_CARD_DEFAULT_PACE,
      pitch: null,
      pronunciationDictionary: toPrismaJson({}),
      sampleText: data.sampleText ?? null,
    },
  })
}

export async function listVoiceCards(
  userId: string,
  page: number,
  pageSize: number,
): Promise<ListVoiceCardsResult> {
  const user = await ensureUser(userId)
  const skip = (page - 1) * pageSize
  const where = {
    userId: user.id,
    isDeleted: false,
  }

  const [items, total] = await Promise.all([
    db.voiceCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.voiceCard.count({ where }),
  ])

  return { items, total }
}

export async function getVoiceCard(
  userId: string,
  id: string,
): Promise<VoiceCard | null> {
  const user = await ensureUser(userId)

  return db.voiceCard.findFirst({
    where: {
      id,
      userId: user.id,
      isDeleted: false,
    },
  })
}

export async function updateVoiceCard(
  userId: string,
  id: string,
  data: UpdateVoiceCardRequest,
): Promise<VoiceCard> {
  const user = await ensureUser(userId)
  const existing = await db.voiceCard.findFirst({
    where: {
      id,
      userId: user.id,
      isDeleted: false,
    },
  })

  if (!existing) {
    throwVoiceCardNotFound()
  }

  if (data.provider !== undefined || data.voiceId !== undefined) {
    await validateVoiceReference(user.id, {
      provider: data.provider ?? existing.provider,
      voiceId: data.voiceId ?? existing.voiceId,
    })
  }

  const updateData: Prisma.VoiceCardUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.provider !== undefined) updateData.provider = data.provider
  if (data.modelId !== undefined) updateData.modelId = data.modelId
  if (data.voiceId !== undefined) updateData.voiceId = data.voiceId
  if (data.referenceAudioUrl !== undefined) {
    updateData.referenceAudioUrl = data.referenceAudioUrl
  }
  if (data.gender !== undefined) updateData.gender = data.gender
  if (data.age !== undefined) updateData.age = data.age
  if (data.tone !== undefined) updateData.tone = toPrismaJson(data.tone)
  if (data.pace !== undefined) updateData.pace = data.pace
  if (data.pitch !== undefined) updateData.pitch = data.pitch
  if (data.pronunciationDictionary !== undefined) {
    updateData.pronunciationDictionary = toPrismaJson(
      data.pronunciationDictionary,
    )
  }
  if (data.sampleText !== undefined) updateData.sampleText = data.sampleText

  return db.voiceCard.update({
    where: { id },
    data: updateData,
  })
}

export async function deleteVoiceCard(
  userId: string,
  id: string,
): Promise<void> {
  const user = await ensureUser(userId)
  const result = await db.voiceCard.updateMany({
    where: {
      id,
      userId: user.id,
      isDeleted: false,
    },
    data: { isDeleted: true },
  })

  if (result.count === 0) {
    throwVoiceCardNotFound()
  }
}
