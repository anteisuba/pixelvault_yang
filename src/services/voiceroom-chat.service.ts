import 'server-only'

import { after } from 'next/server'

import type { AssistantRouteModel } from '@/constants/assistant-persona'
import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { AI_MODELS } from '@/constants/models'
import {
  VOICE_LINE_SOURCES_MAX,
  VOICE_LINE_WEB_IMAGE_SEARCHES_MAX,
  VOICE_LINE_TEXT_MAX_LENGTH,
  VOICE_LINE_USER_KIND,
  VOICE_ROOM_BUILTIN_SPEAKER,
  VOICE_ROOM_CHAT_EVENT,
  VOICE_ROOM_CHAT_HISTORY_LINES,
  VOICE_ROOM_CHAT_KERNEL_TIME_BUDGET,
  VOICE_ROOM_LEARN_PHRASES,
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
import { castMemberForSpeaker, isVoicelessMember } from '@/lib/voiceroom-cast'
import {
  learnCreatorPhrases,
  shouldLearnPhrases,
} from '@/services/cards/character-learned-phrases.service'
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
import { runAssistantNext } from '@/features/assistant/kernel'
import {
  AssistantOperatorRequestSchema,
  type AssistantOperatorMessage,
  type AssistantOperatorStep,
} from '@/types/assistant-operator'
import {
  VoiceLineSourceSchema,
  VoiceLineWebImagesSchema,
  type VoiceLineFile,
  type VoiceLineImage,
  type VoiceLineSource,
  type VoiceLineWebImages,
  type VoiceRoomCastMember,
  type VoiceRoomChatRequest,
} from '@/types/voiceroom'

/**
 * 配音间**聊天**（「声音」模块第 2 步，owner 10-23；10-25 换助手新内核）：你说一句，选中的那位用自己的
 * 口吻回一句、用自己的嗓子念出来。
 *
 * 一轮 = 一条流（SSE）：
 * 1. 先把你那句存成一条 `user` 台词（文字 + 你发的图 / 文件）→ `user`；
 * 2. 她边写边发 → `delta`（`restart` = 换掉还在写的那段，新内核查完资料会重起一段）；
 * 3. 写完存成她的一条台词（联网查到的来源挂在上面）、按念法与选的模型派出声音 → `reply`。声音之后跟念台词
 *    一样靠轮询落地，气泡点了才放（owner 10-23「像聊天软件」）。
 *
 * ⭐ 写回复的是谁（用户 10-25 选「换成新内核」）：
 *  · 有人设卡（顶栏「人设 ▾」挑的那张，或绑着这副嗓子的角色）→ **助手新内核的聊天模式**
 *    （`runAssistantNext` + `chatCharacterId`）：自带联网、找 / 看她的图和库、记得的事按这个角色记；
 *    写词模型照用配音间底部那颗（`routeModel`，⛔ 不改助手设置）；
 *  · 没有角色卡（只是一副嗓子）→ 原来那条薄管子（`buildVoiceChatPrompt`），她就是音色名本人。
 *
 * ⚠ 开流**之前**把能失败的都查掉（房间、说话人、key）：那时还能回一个普通的 JSON 错误，
 *   缺 key 的话客户端就地开 `QuickSetupDialog`（Hard Rule 8）。开流之后的错走 `error` 事件。
 * ⚠ 出声失败不吞掉她写的话：台词照存（没有声音），气泡上给「念出来」。
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

/**
 * 她这一间用的人设：顶栏「人设 ▾」挑过哪张就用哪张（被删了就退回去）；没挑过 → 头像规则同一条：
 * 一副嗓子被几个角色绑着时取角色列表的第一个（最近改过的在前）。
 */
async function findPersonaCard(userId: string, member: VoiceRoomCastMember) {
  const select = { id: true, name: true, persona: true } as const
  if (member.characterCardId) {
    const picked = await db.characterCard.findFirst({
      where: { id: member.characterCardId, userId, isDeleted: false },
      select,
    })
    if (picked) return picked
  }
  return db.characterCard.findFirst({
    where: { userId, voiceCardId: member.id, isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    select,
  })
}

/** 她写回复的一种方式：一段一段吐增量，写完交回全文、查到的来源和上网找的图。 */
type ReplyWriter = AsyncGenerator<
  { text: string; restart?: true },
  { text: string; sources: VoiceLineSource[]; webImages: VoiceLineWebImages[] }
>

/** 没有角色卡：原来那条薄管子，⛔ 没有工具。 */
async function* thinWriter(input: {
  prompt: { systemPrompt: string; userPrompt: string }
  assistant: Awaited<ReturnType<typeof resolveAssistantRoute>>
  signal: AbortSignal
}): ReplyWriter {
  let written = ''
  for await (const delta of llmTextStream({
    systemPrompt: input.prompt.systemPrompt,
    userPrompt: input.prompt.userPrompt,
    signal: input.signal,
    promptGuardMaxLength: PROMPT_GUARD_MAX_LENGTH,
    providerManagedOutput: true,
    adapterType: input.assistant.route.adapterType,
    apiKey: input.assistant.route.apiKey,
    providerConfig: input.assistant.route.providerConfig,
    modelId: input.assistant.modelId,
  })) {
    written += delta
    yield { text: delta }
  }
  return { text: written, sources: [], webImages: [] }
}

/**
 * 配音间的对话 → 内核的消息：你说的 = user，她说的 = assistant，房间里别的嗓子写成「名字: 话」放进
 * user 那一侧（内核只认两方）。相邻同一方的并成一条。
 */
export function voiceChatKernelMessages(
  history: readonly VoiceChatHistoryLine[],
  message: string,
): AssistantOperatorMessage[] {
  const messages: AssistantOperatorMessage[] = []
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = messages.at(-1)
    if (last?.role === role) last.content = `${last.content}\n${content}`
    else messages.push({ role, content })
  }
  for (const line of history) {
    if (line.who === 'self') push('assistant', line.text)
    else if (line.who === 'user') push('user', line.text)
    else push('user', `${line.name}: ${line.text}`)
  }
  push('user', message)
  return messages
}

/** 有角色卡：助手新内核的聊天模式（自带联网、找图、看你发的图）。 */
async function* kernelWriter(input: {
  clerkId: string
  /** 和哪个角色聊；`null` = 默认助手（人设读助手设置，用户 10-25 聊天跟着全局助手）。 */
  characterCardId: string | null
  history: readonly VoiceChatHistoryLine[]
  message: string
  images: readonly VoiceLineImage[]
  files: readonly VoiceLineFile[]
  videoClips: VoiceRoomChatRequest['videoClips']
  routeModel: AssistantRouteModel | undefined
  /** 会被念出来：带上念法提示（方括号语气）；`null` = 只打字。 */
  voice: { expressive: boolean } | null
  signal: AbortSignal
}): ReplyWriter {
  const request = AssistantOperatorRequestSchema.parse({
    workspaceKey: ASSISTANT_PROTOCOL_DOMAIN_IDS.home,
    domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.home,
    messages: voiceChatKernelMessages(input.history, input.message),
    snapshot: { prompt: '', availableModels: [] },
    ...(input.characterCardId
      ? { chatCharacterId: input.characterCardId }
      : {}),
    ...(input.voice ? { chatVoice: input.voice } : {}),
    ...(input.images.length
      ? {
          mentionedAssets: input.images.map((image) => ({
            id: image.id,
            url: image.url,
            ...(image.label ? { label: image.label } : {}),
            ...(image.seq !== undefined ? { seq: image.seq } : {}),
          })),
        }
      : {}),
    ...(input.files.length
      ? {
          mediaAttachments: input.files.map((file) => ({
            kind: file.kind,
            url: file.url,
            label: file.label,
          })),
        }
      : {}),
    ...(input.videoClips?.length ? { videoClips: input.videoClips } : {}),
  })
  let written = ''
  let final: string | null = null
  const sources = new Map<string, VoiceLineSource>()
  const webImages: VoiceLineWebImages[] = []
  for await (const event of runAssistantNext(input.clerkId, request, {
    signal: input.signal,
    timeBudget: VOICE_ROOM_CHAT_KERNEL_TIME_BUDGET,
    ...(input.routeModel ? { routeModel: input.routeModel } : {}),
  })) {
    switch (event.type) {
      case ASSISTANT_OPERATOR_EVENTS.messageDelta:
        written = event.restart ? event.delta : written + event.delta
        yield event.restart
          ? { text: event.delta, restart: true }
          : { text: event.delta }
        break
      case ASSISTANT_OPERATOR_EVENTS.message:
        final = event.text
        break
      case ASSISTANT_OPERATOR_EVENTS.step:
        for (const source of webSourcesOf(event.step))
          if (sources.size < VOICE_LINE_SOURCES_MAX && !sources.has(source.url))
            sources.set(source.url, source)
        const found = webImagesOf(event.step)
        if (found && webImages.length < VOICE_LINE_WEB_IMAGE_SEARCHES_MAX)
          webImages.push(found)
        break
      case ASSISTANT_OPERATOR_EVENTS.error:
        throw new ApiRequestError(
          event.errorCode ?? 'VOICE_CHAT_KERNEL_ERROR',
          502,
          'errors.voiceRoom.chatEmptyReply',
          event.error,
        )
      default:
        break
    }
  }
  return {
    text: final ?? written,
    sources: [...sources.values()],
    webImages,
  }
}

/** 上网找图那一步找回来的一组（她找的图，点了才存进素材库，⛔ 这里一张都不存）。 */
function webImagesOf(step: AssistantOperatorStep): VoiceLineWebImages | null {
  if (
    step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages ||
    step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done ||
    !('result' in step) ||
    !step.result ||
    step.result.images.length === 0
  )
    return null
  const parsed = VoiceLineWebImagesSchema.safeParse({
    query: step.payload.query.slice(0, 300),
    images: step.result.images,
  })
  return parsed.success ? parsed.data : null
}

/** 联网那一步查回来的几条（内核自带的联网也落成 `search_web` 这一步）。 */
function webSourcesOf(step: AssistantOperatorStep): VoiceLineSource[] {
  if (
    step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.searchWeb ||
    step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done ||
    !('result' in step) ||
    !step.result
  )
    return []
  return step.result.results.flatMap((result) => {
    const parsed = VoiceLineSourceSchema.safeParse({
      title: result.title.slice(0, 300) || result.url,
      url: result.url,
      ...(result.publisher
        ? { publisher: result.publisher.slice(0, 120) }
        : {}),
    })
    return parsed.success ? [parsed.data] : []
  })
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

  const cast = parseCast(room.cast)
  const member = findCastMember(cast, request.speakerId)
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
    // 默认助手：人设读助手设置，⛔ 按嗓子去找角色卡（她挑的嗓子可能也绑着别的角色）。
    member.assistant ? null : findPersonaCard(user.id, member),
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
    // 配音间自己选的那个（底部选择器）；没传才跟助手的设置走。
    resolveAssistantRoute(
      user.id,
      request.llmModel ? { routeModel: request.llmModel } : {},
    ),
  ])

  const name = character?.name ?? member.name
  const historyLines = history
    .reverse()
    .filter((line) => line.speakerKind !== VOICE_ROOM_SPEAKER_KIND.SFX)
    .map(
      (line): VoiceChatHistoryLine => ({
        who:
          line.speakerKind === VOICE_LINE_USER_KIND
            ? 'user'
            : castMemberForSpeaker(cast, line.speakerId) === member
              ? 'self'
              : 'other',
        name: line.speakerName,
        text: line.text,
      }),
    )
  const images = request.images ?? []
  const files = request.files ?? []

  // 学说法（10-26「更像真人」F）：她那句存好之后才知道这一轮该不该学；响应发完再跑（⛔ 拖慢聊天）。
  let learnAfterReply: (() => Promise<unknown>) | null = null
  if (character) after(async () => learnAfterReply?.())

  const encoder = new TextEncoder()
  const abort = new AbortController()
  const linkedSignal = AbortSignal.any([signal, abort.signal])
  let cancelled = false

  const writer: ReplyWriter =
    character || member.assistant
      ? kernelWriter({
          clerkId,
          characterCardId: character?.id ?? null,
          history: historyLines,
          message: request.text,
          images,
          files,
          videoClips: request.videoClips,
          routeModel: request.llmModel,
          voice:
            request.voice !== false && !isVoicelessMember(member)
              ? {
                  expressive: request.modelId === AI_MODELS.FISH_AUDIO_DRAMA_3,
                }
              : null,
          signal: linkedSignal,
        })
      : thinWriter({
          prompt: buildVoiceChatPrompt({
            name,
            persona: null,
            history: historyLines,
            message: request.text,
            expressiveVoice: request.modelId === AI_MODELS.FISH_AUDIO_DRAMA_3,
          }),
          assistant,
          signal: linkedSignal,
        })

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
          attachments:
            images.length || files.length
              ? {
                  ...(images.length ? { images } : {}),
                  ...(files.length ? { files } : {}),
                }
              : null,
        })
        emit(VOICE_ROOM_CHAT_EVENT.USER, { line: userLine })

        let step = await writer.next()
        while (!step.done) {
          emit(VOICE_ROOM_CHAT_EVENT.DELTA, step.value)
          step = await writer.next()
        }
        const written = step.value

        const reply = clampReply(cleanVoiceChatReply(written.text, name))
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
        // 顶栏 🔇：她只打字，气泡上给「念出来」（点了走重录那条路出声）。还没嗓子的那一位同样只打字。
        if (request.voice !== false && !isVoicelessMember(member)) {
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
        }

        const replyLine = await appendVoiceLine(room.id, {
          speakerId: member.id,
          speakerKind: VOICE_ROOM_SPEAKER_KIND.VOICE,
          speakerName: member.name,
          speakerCover: member.coverImage ?? null,
          text: reply,
          emotion: null,
          jobId,
          attachments:
            written.sources.length || written.webImages.length
              ? {
                  ...(written.sources.length
                    ? { sources: written.sources }
                    : {}),
                  ...(written.webImages.length
                    ? { webImages: written.webImages }
                    : {}),
                }
              : null,
        })
        emit(VOICE_ROOM_CHAT_EVENT.REPLY, { line: replyLine })
        if (character)
          learnAfterReply = async () => {
            const said = await db.voiceLine.count({
              where: { roomId: room.id, speakerKind: VOICE_LINE_USER_KIND },
            })
            if (!shouldLearnPhrases(said)) return
            const lines = await db.voiceLine.findMany({
              where: { roomId: room.id, speakerKind: VOICE_LINE_USER_KIND },
              orderBy: { order: 'desc' },
              take: VOICE_ROOM_LEARN_PHRASES.readUserLines,
              select: { text: true },
            })
            await learnCreatorPhrases({
              userId: user.id,
              cardId: character.id,
              said: lines.reverse().map((line) => line.text),
              assistant,
            })
          }
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
