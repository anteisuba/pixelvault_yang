import 'server-only'

// 值导入而不是 `import type`：`Prisma.DbNull` 是运行时值（把可空 Json 列写回
// NULL 的唯一写法），类型导入会让它在编译期被抹掉。
import { Prisma } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { AUDIO_KIND, type AudioKind } from '@/constants/audio-options'
import { getAvailableAudioModels } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import {
  VOICE_ROOM_LINES_MAX,
  VOICE_ROOM_LIST_LIMIT,
  VOICE_ROOM_SPEAKER_KIND,
  VOICE_ROOM_VOICE_CAST_MAX,
} from '@/constants/voiceroom'
import { parseVoiceLineEmotion } from '@/lib/voice-line-emotion'
import { submitAudioGeneration } from '@/services/generate-audio.service'
import { ensureUser } from '@/services/user.service'
import {
  VoiceRoomBedSchema,
  VoiceRoomCastMemberSchema,
  type CreateVoiceLineRequest,
  type CreateVoiceRoomRequest,
  type RetakeVoiceLineRequest,
  type UpdateVoiceRoomRequest,
  type VoiceLineRecord,
  type VoiceLineDelivery,
  type VoiceRoomCastMember,
  type VoiceRoomDetail,
  type VoiceRoomRecord,
} from '@/types/voiceroom'
import { z } from 'zod'

/**
 * 配音间 —— 房间与台词。
 *
 * 生成本身**不在这里实现**：一条台词落到 `submitAudioGeneration` 上，和音频
 * 工作台走的是同一条链路。这一层只负责「谁说、说什么、怎么念」，以及把派出去
 * 的那个 job 记在台词上。
 */

/* ── 读取时的 include 形状 ──────────────────────────────────────── */

/**
 * 台词的声音要跨两跳才拿得到：line → job → generation。
 * 一次 include 取回，不是 N+1。
 */
const LINE_INCLUDE = {
  job: {
    include: { generation: { select: { url: true, duration: true } } },
  },
} satisfies Prisma.VoiceLineInclude

type VoiceLineRow = Prisma.VoiceLineGetPayload<{ include: typeof LINE_INCLUDE }>

/* ── 错误 ───────────────────────────────────────────────────────── */

function throwRoomNotFound(): never {
  throw new ApiRequestError(
    'VOICE_ROOM_NOT_FOUND',
    404,
    'errors.voiceRoom.notFound',
    'Voice room not found',
  )
}

function throwLineNotFound(): never {
  throw new ApiRequestError(
    'VOICE_LINE_NOT_FOUND',
    404,
    'errors.voiceRoom.lineNotFound',
    'Voice line not found',
  )
}

/* ── Json ↔ 域类型 ──────────────────────────────────────────────── */

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * 班底是 Json 列，读出来先过一遍 Zod。
 *
 * ⚠ 坏数据**降级成空班底**而不是抛错：一条读不懂的 cast 不该让整个房间列表打不开。
 * 空班底在 UI 上就是「先请一位进来」的空态，用户能自己救回来。
 */
function parseCast(value: Prisma.JsonValue): VoiceRoomCastMember[] {
  const parsed = z.array(VoiceRoomCastMemberSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

function parseBed(value: Prisma.JsonValue | null) {
  if (value === null) return null
  const parsed = VoiceRoomBedSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function toVoiceRoomRecord(row: {
  id: string
  name: string | null
  cast: Prisma.JsonValue
  bed: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}): VoiceRoomRecord {
  return {
    id: row.id,
    name: row.name,
    cast: parseCast(row.cast),
    bed: parseBed(row.bed),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toVoiceLineRecord(row: VoiceLineRow): VoiceLineRecord {
  return {
    id: row.id,
    order: row.order,
    speakerId: row.speakerId,
    speakerKind:
      row.speakerKind === VOICE_ROOM_SPEAKER_KIND.SFX
        ? VOICE_ROOM_SPEAKER_KIND.SFX
        : VOICE_ROOM_SPEAKER_KIND.VOICE,
    speakerName: row.speakerName,
    speakerCover: row.speakerCover,
    text: row.text,
    emotion: (row.emotion as VoiceLineRecord['emotion']) ?? null,
    audio: row.job
      ? {
          jobId: row.job.id,
          status: row.job.status,
          url: row.job.generation?.url ?? null,
          duration: row.job.generation?.duration ?? null,
          errorMessage: row.job.errorMessage,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
  }
}

/* ── 房间 ───────────────────────────────────────────────────────── */

export async function listVoiceRooms(
  clerkId: string,
): Promise<VoiceRoomRecord[]> {
  const user = await ensureUser(clerkId)
  const rows = await db.voiceRoom.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: VOICE_ROOM_LIST_LIMIT,
  })
  return rows.map(toVoiceRoomRecord)
}

export async function createVoiceRoom(
  clerkId: string,
  request: CreateVoiceRoomRequest,
): Promise<VoiceRoomRecord> {
  const user = await ensureUser(clerkId)
  const row = await db.voiceRoom.create({
    data: { userId: user.id, name: request.name ?? null, cast: [] },
  })
  return toVoiceRoomRecord(row)
}

export async function getVoiceRoomDetail(
  clerkId: string,
  roomId: string,
): Promise<VoiceRoomDetail> {
  const user = await ensureUser(clerkId)
  const row = await db.voiceRoom.findFirst({
    where: { id: roomId, userId: user.id },
    include: { lines: { orderBy: { order: 'asc' }, include: LINE_INCLUDE } },
  })
  if (!row) throwRoomNotFound()

  return { ...toVoiceRoomRecord(row), lines: row.lines.map(toVoiceLineRecord) }
}

/**
 * 改房间：名字 / 班底 / 底垫，三件各自可选。
 *
 * 班底的人声上限在这里把关——`VOICE_ROOM_VOICE_CAST_MAX` 与 Fish 多说话人的
 * 上限同源，两边对不齐就会出现「加得进班底、生成时被静默丢掉」。
 */
export async function updateVoiceRoom(
  clerkId: string,
  request: UpdateVoiceRoomRequest,
): Promise<VoiceRoomRecord> {
  const user = await ensureUser(clerkId)
  const existing = await db.voiceRoom.findFirst({
    where: { id: request.roomId, userId: user.id },
    select: { id: true },
  })
  if (!existing) throwRoomNotFound()

  if (request.cast) {
    const voiceCount = request.cast.filter(
      (member) => member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE,
    ).length
    if (voiceCount > VOICE_ROOM_VOICE_CAST_MAX) {
      throw new ApiRequestError(
        'VOICE_ROOM_CAST_FULL',
        400,
        'errors.voiceRoom.castFull',
        `A room can hold at most ${VOICE_ROOM_VOICE_CAST_MAX} voices`,
      )
    }

    const ids = new Set(request.cast.map((member) => member.id))
    if (ids.size !== request.cast.length) {
      throw new ApiRequestError(
        'VOICE_ROOM_CAST_DUPLICATE',
        400,
        'errors.voiceRoom.castDuplicate',
        'A voice can only join the room once',
      )
    }
  }

  const data: Prisma.VoiceRoomUpdateInput = {}
  // `name` 显式传 null = 清掉名字变回未命名；不传 = 这次不改名字。两回事。
  if (request.name !== undefined) data.name = request.name || null
  if (request.cast !== undefined) data.cast = toPrismaJson(request.cast)
  if (request.bed !== undefined) {
    data.bed = request.bed === null ? Prisma.DbNull : toPrismaJson(request.bed)
  }

  const row = await db.voiceRoom.update({ where: { id: request.roomId }, data })
  return toVoiceRoomRecord(row)
}

/**
 * 删房间。台词跟着走（schema 上的 Cascade），**生成物一条不动**——
 * 那是用户资产，躺在素材库里，不该因为收拾一场戏就消失。
 */
export async function deleteVoiceRoom(
  clerkId: string,
  roomId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  const result = await db.voiceRoom.deleteMany({
    where: { id: roomId, userId: user.id },
  })
  if (result.count === 0) throwRoomNotFound()
}

/* ── 台词 ───────────────────────────────────────────────────────── */

/**
 * 选模型：语音档挑第一个可用的 speech 模型，音效档挑第一个可用的 sfx 模型。
 *
 * 不让用户选模型是刻意的——配音间的主张是「选个音色，打字就开口」，模型下拉
 * 属于工作台的词汇表。目录里当前每档也只有一个可用模型。
 */
function resolveAudioModelId(kind: AudioKind): string {
  const model = getAvailableAudioModels().find(
    (candidate) => resolveAudioKind(candidate) === kind,
  )
  if (!model) {
    throw new ApiRequestError(
      'AUDIO_MODEL_UNAVAILABLE',
      503,
      'errors.voiceRoom.modelUnavailable',
      `No available audio model for ${kind}`,
    )
  }
  return model.id
}

/** 只有 http(s) 的封面能进 `coverImageUrl`——那个字段是 `.url()` 校验的。 */
function toCoverUrl(cover: string | null | undefined): string | undefined {
  if (!cover) return undefined
  return /^https?:\/\//i.test(cover) ? cover : undefined
}

function findCastMember(
  cast: VoiceRoomCastMember[],
  speakerId: string,
): VoiceRoomCastMember {
  const member = cast.find((candidate) => candidate.id === speakerId)
  if (!member) {
    throw new ApiRequestError(
      'VOICE_ROOM_SPEAKER_NOT_IN_CAST',
      400,
      'errors.voiceRoom.speakerNotInCast',
      'That speaker is not in this room',
    )
  }
  if (member.kind === VOICE_ROOM_SPEAKER_KIND.BGM) {
    // 配乐是房间级底垫，不进聊天流——它没有台词可说。
    throw new ApiRequestError(
      'VOICE_ROOM_SPEAKER_CANNOT_SPEAK',
      400,
      'errors.voiceRoom.speakerCannotSpeak',
      'The score is a room-level bed, not a speaker',
    )
  }
  return member
}

/**
 * 把一条台词派给生成链路，返回 jobId。
 *
 * ⚠ `voiceId` 是**实时**从 VoiceCard 查的，不是从班底快照里取：班底存的
 * name / coverImage 漂了无所谓（那是显示用的），voiceId 漂了会发错声音。
 */
async function dispatchLine(params: {
  clerkId: string
  userId: string
  member: VoiceRoomCastMember
  text: string
  emotion: string | null
  delivery: VoiceLineDelivery
}): Promise<string> {
  const { clerkId, userId, member, text, emotion, delivery } = params

  if (member.kind === VOICE_ROOM_SPEAKER_KIND.SFX) {
    // ⚠ 音效没有「念法」：语速与表现力是给嗓子的，音效模型不认这两个参数。
    const { jobId } = await submitAudioGeneration(clerkId, {
      prompt: text,
      modelId: resolveAudioModelId(AUDIO_KIND.SFX),
    })
    return jobId
  }

  const card = await db.voiceCard.findFirst({
    where: { id: member.id, userId, isDeleted: false },
    select: { voiceId: true, name: true, coverImage: true },
  })
  if (!card?.voiceId) {
    throw new ApiRequestError(
      'VOICE_CARD_UNAVAILABLE',
      400,
      'errors.voiceRoom.voiceCardUnavailable',
      'That voice is no longer available',
    )
  }

  const { jobId } = await submitAudioGeneration(clerkId, {
    prompt: text,
    // 顶栏选过就用它，没选过退回目录里第一个可用的。
    modelId: delivery.modelId ?? resolveAudioModelId(AUDIO_KIND.SPEECH),
    voiceId: card.voiceId,
    // 素材库靠这两个把音频卡画成「头像 + 名字」。
    voiceName: card.name,
    coverImageUrl: toCoverUrl(card.coverImage),
    ...(emotion ? { emotion: emotion as never } : {}),
    ...(delivery.pace ? { pace: delivery.pace } : {}),
    ...(delivery.expressiveness
      ? { expressiveness: delivery.expressiveness }
      : {}),
  })
  return jobId
}

/**
 * 说一句话。
 *
 * 情感的两条来路在这里汇合：显式传的 `emotion`（气泡角标点出来的）**压过**
 * 句子里的括号。用户刚点完档位，不该再被句子里的旧括号覆盖。
 */
export async function createVoiceLine(
  clerkId: string,
  request: CreateVoiceLineRequest,
): Promise<VoiceLineRecord> {
  const user = await ensureUser(clerkId)
  const room = await db.voiceRoom.findFirst({
    where: { id: request.roomId, userId: user.id },
    select: { id: true, cast: true, _count: { select: { lines: true } } },
  })
  if (!room) throwRoomNotFound()

  if (room._count.lines >= VOICE_ROOM_LINES_MAX) {
    throw new ApiRequestError(
      'VOICE_ROOM_FULL',
      400,
      'errors.voiceRoom.roomFull',
      `A room holds at most ${VOICE_ROOM_LINES_MAX} lines`,
    )
  }

  const member = findCastMember(parseCast(room.cast), request.speakerId)
  const parsed = parseVoiceLineEmotion(request.text)
  const text = parsed.text
  const emotion =
    request.emotion !== undefined ? request.emotion : parsed.emotion

  if (!text) {
    throw new ApiRequestError(
      'VOICE_LINE_EMPTY',
      400,
      'errors.voiceRoom.lineEmpty',
      'A line needs something to say',
    )
  }

  const jobId = await dispatchLine({
    clerkId,
    userId: user.id,
    member,
    text,
    emotion,
    delivery: {
      pace: request.pace,
      expressiveness: request.expressiveness,
      modelId: request.modelId,
    },
  })

  // order 在事务里取，两条同时提交才不会撞同一个号。
  const created = await db.$transaction(async (tx) => {
    const last = await tx.voiceLine.findFirst({
      where: { roomId: room.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const line = await tx.voiceLine.create({
      data: {
        roomId: room.id,
        order: (last?.order ?? -1) + 1,
        speakerId: member.id,
        speakerKind: member.kind,
        speakerName: member.name,
        speakerCover: member.coverImage ?? null,
        text,
        emotion,
        jobId,
      },
      include: LINE_INCLUDE,
    })
    // 说了话就是动过这个房间——左列按 updatedAt 排序，靠这一下浮上来。
    await tx.voiceRoom.update({
      where: { id: room.id },
      data: { updatedAt: new Date() },
    })
    return line
  })

  return toVoiceLineRecord(created)
}

/**
 * 重录一条台词——换情感，或改词。
 *
 * 覆盖 `jobId`。被换下来的那次生成不删：它已经在素材库里了，是用户资产。
 */
export async function retakeVoiceLine(
  clerkId: string,
  request: RetakeVoiceLineRequest,
): Promise<VoiceLineRecord> {
  const user = await ensureUser(clerkId)
  const line = await db.voiceLine.findFirst({
    where: { id: request.lineId, room: { userId: user.id } },
    include: { room: { select: { id: true, cast: true } } },
  })
  if (!line) throwLineNotFound()

  const member = findCastMember(parseCast(line.room.cast), line.speakerId)

  // 改词要重新剥一次括号；不改词就沿用已经剥干净的旧文本。
  const parsed =
    request.text !== undefined ? parseVoiceLineEmotion(request.text) : null
  const text = parsed ? parsed.text : line.text
  const emotion =
    request.emotion !== undefined
      ? request.emotion
      : (parsed?.emotion ?? (line.emotion as VoiceLineRecord['emotion']))

  if (!text) {
    throw new ApiRequestError(
      'VOICE_LINE_EMPTY',
      400,
      'errors.voiceRoom.lineEmpty',
      'A line needs something to say',
    )
  }

  const jobId = await dispatchLine({
    clerkId,
    userId: user.id,
    member,
    text,
    emotion: emotion ?? null,
    delivery: {
      pace: request.pace,
      expressiveness: request.expressiveness,
      modelId: request.modelId,
    },
  })

  const updated = await db.voiceLine.update({
    where: { id: line.id },
    data: { text, emotion, jobId },
    include: LINE_INCLUDE,
  })

  return toVoiceLineRecord(updated)
}
