import type {
  AssistantModelMessage,
  ImagePart,
  ModelMessage,
  TextPart,
  UserContent,
} from 'ai'

import { ASSISTANT_NEXT_LIMITS } from '@/features/assistant/constants'
import type { AssistantV3PictureRef } from '@/types/assistant-v3'

/**
 * 发给模型的那一串消息怎么拼、怎么存（纯函数，循环与测试共用）。
 *
 * ⭐ 图：存的时候只存地址（`image` 是网址字符串），发之前现下字节换进去；一轮里留在眼前的图
 *   超过 `maxPicturesInContext` 时，最早的那几张换成一行字（「看过的图 X，要再看就 look」）。
 *   ⛔ 不再像 v3 那样「看完一步就撤」—— 模型后面还要拿它比对。
 */

export interface PictureBytes {
  readonly data: Uint8Array
  readonly mediaType: string
}

export type PictureLoader = (url: string) => Promise<PictureBytes | null>

/** 一张图在消息里的样子：先一行称呼，再图本身（存的时候 `image` 是地址）。 */
export function pictureParts(
  pictures: readonly AssistantV3PictureRef[],
): (TextPart | ImagePart)[] {
  return pictures.flatMap((picture) => [
    { type: 'text' as const, text: `[picture: ${picture.label}]` },
    { type: 'image' as const, image: picture.url },
  ])
}

export function openingUserMessage(
  bench: string,
  pictures: readonly AssistantV3PictureRef[],
): ModelMessage {
  if (pictures.length === 0) return { role: 'user', content: bench }
  return {
    role: 'user',
    content: [
      { type: 'text', text: bench },
      {
        type: 'text',
        text: 'PICTURES ATTACHED TO THIS MESSAGE (they stay in front of you all turn):',
      },
      ...pictureParts(pictures),
    ],
  }
}

export function lookedPicturesMessage(
  pictures: readonly AssistantV3PictureRef[],
): ModelMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: 'PICTURES FROM YOUR look:' },
      ...pictureParts(pictures),
    ],
  }
}

function isStoredPicture(part: unknown): part is ImagePart & { image: string } {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'image' &&
    typeof (part as { image?: unknown }).image === 'string'
  )
}

/** 留在眼前的图：从最后往前数 `max` 张；更早的换成一行字。 */
export async function hydratePictures(
  messages: readonly ModelMessage[],
  load: PictureLoader,
  max: number = ASSISTANT_NEXT_LIMITS.maxPicturesInContext,
): Promise<ModelMessage[]> {
  let remaining = messages.reduce(
    (count, message) =>
      count +
      (message.role === 'user' && Array.isArray(message.content)
        ? message.content.filter(isStoredPicture).length
        : 0),
    0,
  )
  const out: ModelMessage[] = []
  for (const message of messages) {
    if (message.role !== 'user' || !Array.isArray(message.content)) {
      out.push(message)
      continue
    }
    const content: Exclude<UserContent, string> = []
    for (const part of message.content) {
      if (!isStoredPicture(part)) {
        content.push(part)
        continue
      }
      const kept = remaining <= max
      remaining -= 1
      if (!kept) {
        content.push({
          type: 'text',
          text: '(an earlier picture — no longer in front of you; look again if you need it)',
        })
        continue
      }
      const bytes = await load(part.image)
      content.push(
        bytes
          ? { type: 'image', image: bytes.data, mediaType: bytes.mediaType }
          : { type: 'text', text: '(this picture could not be loaded)' },
      )
    }
    out.push({ ...message, content })
  }
  return out
}

function isProviderExecuted(part: unknown): boolean {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { providerExecuted?: unknown }).providerExecuted === true
  )
}

/**
 * 换成保守接法（`NextModel.fallback`）时：前面几步里只有原接法才认得的东西（思考块与签名、
 * 厂商自己跑的联网调用与结果）拿掉，只留说的话与我们的工具调用 / 结果。
 */
export function stripForFallback(
  messages: readonly ModelMessage[],
): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role !== 'assistant' || typeof message.content === 'string')
      return [message]
    const content = message.content.filter(
      (part) => part.type !== 'reasoning' && !isProviderExecuted(part),
    )
    if (content.length === 0) return []
    const stripped: AssistantModelMessage = {
      role: 'assistant',
      content: content.map((part) =>
        'providerOptions' in part
          ? { ...part, providerOptions: undefined }
          : part,
      ),
    }
    return [stripped]
  })
}

export interface HistoryLine {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/**
 * 之前几轮的对白（只有说的话）：从最近往前，条数与字数都放得下为止。⚠ 上下文压缩是第 6 步。
 * ⚠ 开头那条必须是创作者说的（几家都要求先 user 后 assistant）。
 */
export function historyMessages(
  lines: readonly HistoryLine[],
  maxMessages: number = ASSISTANT_NEXT_LIMITS.maxHistoryMessages,
  maxChars: number = ASSISTANT_NEXT_LIMITS.maxHistoryChars,
): ModelMessage[] {
  const kept: HistoryLine[] = []
  let chars = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    if (!line.content.trim()) continue
    if (kept.length >= maxMessages || chars + line.content.length > maxChars)
      break
    kept.unshift(line)
    chars += line.content.length
  }
  while (kept[0] && kept[0].role !== 'user') kept.shift()
  return kept.map((line) => ({ role: line.role, content: line.content }))
}
