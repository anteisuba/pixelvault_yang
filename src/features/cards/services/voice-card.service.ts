import 'server-only'

import { randomBytes } from 'node:crypto'

import type { Prisma, VoiceCard } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { PROFILE } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VOICE_CARD_COVER_STORAGE_TYPE,
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
} from '@/constants/voice-cards'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getVoice } from '@/services/fish-audio-voice.service'
import {
  deleteFromR2,
  fetchAsBuffer,
  parseOwnedStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { getFishAudioVoiceLibraryApiKey } from '@/lib/platform-keys'
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
  const userApiKey = await findActiveKeyForAdapter(
    dbUserId,
    AI_ADAPTER_TYPES.FISH_AUDIO,
  )
  const apiKeyValue = userApiKey?.keyValue ?? getFishAudioVoiceLibraryApiKey()

  if (!apiKeyValue) {
    throw new ApiRequestError(
      'FISH_AUDIO_API_KEY_REQUIRED',
      400,
      'errors.apiKey.missing',
      'A Fish Audio API key is required to validate this voice.',
    )
  }

  try {
    await getVoice(apiKeyValue, voiceId)
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

  if (data.provider === VOICE_CARD_PROVIDER.FISH_AUDIO) {
    await validateFishAudioVoice(dbUserId, data.voiceId)
    return
  }

  throw new ApiRequestError(
    'VOICE_ID_PROVIDER_MISMATCH',
    400,
    'errors.voiceCard.voiceIdProviderMismatch',
    'voiceId is only valid for supported voice providers.',
  )
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
      coverImage: data.coverImage ?? null,
      referenceAudioUrl: data.referenceAudioUrl ?? null,
      gender: data.gender ?? null,
      age: data.age ?? null,
      tone: toPrismaJson(data.tone),
      pace: data.pace,
      pitch: data.pitch ?? null,
      pronunciationDictionary: toPrismaJson(data.pronunciationDictionary),
      sampleAudioUrl: data.sampleAudioUrl ?? null,
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
  if (data.coverImage !== undefined) updateData.coverImage = data.coverImage
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
  if (data.sampleAudioUrl !== undefined)
    updateData.sampleAudioUrl = data.sampleAudioUrl
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

  // 绑着这副嗓子的角色一起松开：卡是软删，不松开的话角色还指着一张看不见的卡。
  await db.characterCard.updateMany({
    where: { userId: user.id, voiceCardId: id },
    data: { voiceCardId: null },
  })
}

/**
 * 给音色卡换一张自己上传的头像（音色库页 `/voices`）。
 *
 * 形状照抄助手头像那条（`assistant-persona-avatar.service.ts`）：同 5 MB 上限、
 * 同 JPEG/PNG/WebP 白名单、先删旧的再传。不同的只有 key 前缀与写回的列；从画廊挑的
 * 图不走这里，直接 PATCH `coverImage`（那本来就是自己存储里的地址）。
 *
 * ⚠ 旧图只在**它是这条路传上来的**时候才删（key 带本前缀）：收藏来的 Fish 封面、
 * 画廊里挑的图都不是这张卡独有的，删了会伤到别处。
 */
export async function uploadVoiceCardCover(
  userId: string,
  id: string,
  imageData: string,
): Promise<VoiceCard> {
  const user = await ensureUser(userId)
  const existing = await db.voiceCard.findFirst({
    where: { id, userId: user.id, isDeleted: false },
    select: { coverImage: true },
  })
  if (!existing) throwVoiceCardNotFound()

  const { buffer, mimeType } = await fetchAsBuffer(imageData)
  if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new ApiRequestError(
      'UNSUPPORTED_IMAGE_TYPE',
      400,
      'errors.profile.unsupportedImageType',
      'Unsupported image type. Use JPEG, PNG, or WebP.',
    )
  }
  if (buffer.length > PROFILE.AVATAR_MAX_SIZE_BYTES) {
    throw new ApiRequestError(
      'AVATAR_TOO_LARGE',
      400,
      'errors.profile.avatarTooLarge',
      'Avatar image must be under 5 MB',
    )
  }

  const prefix = `profiles/${user.id}/${VOICE_CARD_COVER_STORAGE_TYPE}/`
  const previousKey = existing.coverImage
    ? parseOwnedStorageKey(existing.coverImage)
    : null
  if (previousKey?.startsWith(prefix)) {
    await deleteFromR2(previousKey).catch(() => {})
  }

  const ext = mimeType.includes('webp')
    ? 'webp'
    : mimeType.includes('png')
      ? 'png'
      : 'jpg'
  const key = `${prefix}${id}_${randomBytes(8).toString('hex')}.${ext}`
  const url = await uploadToR2({ data: buffer, key, mimeType })

  return db.voiceCard.update({ where: { id }, data: { coverImage: url } })
}
