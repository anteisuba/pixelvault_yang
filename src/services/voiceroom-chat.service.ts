import 'server-only'

import {
  VOICE_LINE_TEXT_MAX_LENGTH,
  VOICE_LINE_USER_KIND,
  VOICE_ROOM_BUILTIN_SPEAKER,
  VOICE_ROOM_CHAT_EVENT,
  VOICE_ROOM_CHAT_HISTORY_LINES,
  VOICE_ROOM_SPEAKER_KIND,
} from '@/constants/voiceroom'
import { db } from '@/lib/db'
import { ApiRequestError, isGenerationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { encodeSseEvent } from '@/lib/sse'
import {
  buildVoiceChatPrompt,
  cleanVoiceChatReply,
  type VoiceChatHistoryLine,
} from '@/lib/voiceroom-chat-prompt'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextStream } from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import {
  appendVoiceLine,
  assertRoomHasSpace,
  dispatchLine,
  findCastMember,
  parseCast,
} from '@/services/voiceroom.service'
import { CharacterPersonaSchema } from '@/types'
import type { VoiceRoomChatRequest } from '@/types/voiceroom'

/**
 * 配音间**聊天**（「声音」模块第 2 步，owner 10-23）：你说一句，选中的那位用自己的口吻回一句、
 * 用自己的嗓子念出来。
 *
 * 一轮 = 一条流（SSE）：
 * 1. 先把你那句存成一条 `user` 台词（只有文字）→ `user`；
 * 2. 助手那一家（`resolveAssistantRoute`，owner 10-15「全跟助手」，key 用户自己的）边写边发 → `delta`；
 * 3. 写完存成她的一条台词、按念法与选的模型派出声音 → `reply`。声音之后跟念台词一样靠轮询落地，
 *    气泡点了才放（owner 10-23「像聊天软件」）。
 *
 * ⚠ 开流**之前**把能失败的都查掉（房间、说话人、key）：那时还能回一个普通的 JSON 错误，
 *   缺 key 的话客户端就地开 `QuickSetupDialog`（Hard Rule 8）。开流之后的错走 `error` 事件。
 * ⚠ 出声失败不吞掉她写的话：台词照存（没有声音），气泡上给「重试」。
 */

/** 回复里的方括号提示和标点都会被念，字数上限跟一条台词走。 */
function clampReply(text: string): string {
  return text.length > VOICE_LINE_TEXT_MAX_LENGTH
    ? text.slice(0, VOICE_LINE_TEXT_MAX_LENGTH)
    : text
}

/** 用户 prompt 里塞了整段对话，长度上限按历史条数放宽（注入检查照跑）。 */
const PROMPT_GUARD_MAX_LENGTH =
  VOICE_LINE_TEXT_MAX_LENGTH * (VOICE_ROOM_CHAT_HISTORY_LINES + 2)

function toErrorPayload(error: unknown) {
  if (isGenerationError(error)) return error.toJSON()
  return { success: false, error: 'The reply could not be finished.' }
}

export async function streamVoiceRoomChat(
  clerkId: string,
  request: VoiceRoomChatRequest,
  signal: AbortSignal,
): Promise<Response> {
  const user = await ensureUser(clerkId)
  const room = await db.voiceRoom.findFirst({
    where: { id: request.roomId, userId: user.id },
    select: { id: true, cast: true, _count: { select: { lines: true } } },
  })
  if (!room) {
    throw new ApiRequestError(
      'VOICE_ROOM_NOT_FOUND',
      404,
      'errors.voiceRoom.notFound',
      'Voice room not found',
    )
  }

  const member = findCastMember(parseCast(room.cast), request.speakerId)
  if (member.kind !== VOICE_ROOM_SPEAKER_KIND.VOICE) {
    // 音效师没有嘴：聊天只跟人声聊。
    throw new ApiRequestError(
      'VOICE_ROOM_CHAT_VOICE_ONLY',
      400,
      'errors.voiceRoom.chatVoiceOnly',
      'You can only chat with a voice.',
    )
  }
  // 你一句 + 她一句。
  assertRoomHasSpace(room._count.lines, 2)

  const [character, history, assistant] = await Promise.all([
    // 头像规则同一条：一副嗓子被几个角色绑着时取角色列表的第一个（最近改过的在前）。
    db.characterCard.findFirst({
      where: { userId: user.id, voiceCardId: member.id, isDeleted: false },
      orderBy: { updatedAt: 'desc' },
      select: { name: true, persona: true },
    }),
    db.voiceLine.findMany({
      where: { roomId: room.id },
      orderBy: { order: 'desc' },
      take: VOICE_ROOM_CHAT_HISTORY_LINES,
      select: {
        speakerId: true,
        speakerKind: true,
        speakerName: true,
        text: true,
      },
    }),
    resolveAssistantRoute(user.id),
  ])

  const persona = character
    ? CharacterPersonaSchema.safeParse(character.persona ?? {})
    : null
  const name = character?.name ?? member.name
  const prompt = buildVoiceChatPrompt({
    name,
    persona: persona?.success ? persona.data : null,
    history: history
      .reverse()
      .filter((line) => line.speakerKind !== VOICE_ROOM_SPEAKER_KIND.SFX)
      .map(
        (line): VoiceChatHistoryLine => ({
          who:
            line.speakerKind === VOICE_LINE_USER_KIND
              ? 'user'
              : line.speakerId === member.id
                ? 'self'
                : 'other',
          name: line.speakerName,
          text: line.text,
        }),
      ),
    message: request.text,
  })

  const encoder = new TextEncoder()
  const abort = new AbortController()
  const linkedSignal = AbortSignal.any([signal, abort.signal])
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, value: unknown) => {
        if (!cancelled && !linkedSignal.aborted)
          controller.enqueue(encoder.encode(encodeSseEvent(event, value)))
      }
      try {
        const userLine = await appendVoiceLine(room.id, {
          speakerId: VOICE_ROOM_BUILTIN_SPEAKER.USER,
          speakerKind: VOICE_LINE_USER_KIND,
          speakerName: '',
          speakerCover: null,
          text: request.text,
          emotion: null,
          jobId: null,
        })
        emit(VOICE_ROOM_CHAT_EVENT.USER, { line: userLine })

        let written = ''
        for await (const delta of llmTextStream({
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          signal: linkedSignal,
          promptGuardMaxLength: PROMPT_GUARD_MAX_LENGTH,
          providerManagedOutput: true,
          adapterType: assistant.route.adapterType,
          apiKey: assistant.route.apiKey,
          providerConfig: assistant.route.providerConfig,
          modelId: assistant.modelId,
        })) {
          written += delta
          emit(VOICE_ROOM_CHAT_EVENT.DELTA, { text: delta })
        }

        const reply = clampReply(cleanVoiceChatReply(written, name))
        if (!reply) {
          throw new ApiRequestError(
            'VOICE_CHAT_EMPTY_REPLY',
            502,
            'errors.voiceRoom.chatEmptyReply',
            'The character did not reply. Try again.',
          )
        }

        let jobId: string | null = null
        let voiceError: unknown = null
        try {
          jobId = await dispatchLine({
            clerkId,
            userId: user.id,
            member,
            text: reply,
            emotion: null,
            delivery: {
              pace: request.pace,
              expressiveness: request.expressiveness,
              modelId: request.modelId,
            },
          })
        } catch (error) {
          voiceError = error
        }

        const replyLine = await appendVoiceLine(room.id, {
          speakerId: member.id,
          speakerKind: VOICE_ROOM_SPEAKER_KIND.VOICE,
          speakerName: member.name,
          speakerCover: member.coverImage ?? null,
          text: reply,
          emotion: null,
          jobId,
        })
        emit(VOICE_ROOM_CHAT_EVENT.REPLY, { line: replyLine })
        if (voiceError) {
          logger.warn('Voice room chat reply could not be voiced', {
            error:
              voiceError instanceof Error ? voiceError.message : voiceError,
          })
          emit(VOICE_ROOM_CHAT_EVENT.ERROR, toErrorPayload(voiceError))
        }
      } catch (error) {
        if (!linkedSignal.aborted) {
          logger.error('Voice room chat failed', { error })
          emit(VOICE_ROOM_CHAT_EVENT.ERROR, toErrorPayload(error))
        }
      } finally {
        if (!cancelled) controller.close()
      }
    },
    cancel() {
      cancelled = true
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
