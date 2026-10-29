import type {
  AssistantModelMessage,
  ImagePart,
  ModelMessage,
  TextPart,
  ToolContent,
  UserContent,
} from 'ai'

import { ASSISTANT_NEXT_LIMITS } from '@/features/assistant/constants'
import { skillBlocksIn } from '@/features/assistant/skills'
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

type AssistantPart = Exclude<AssistantModelMessage['content'], string>[number]

/** Claude 联网时自己跑的整理代码可能「由某个调用发起」（`caller.toolId`），那一条没了它也得走。 */
function callerIdOf(part: AssistantPart): string | undefined {
  if (!('providerOptions' in part)) return undefined
  const caller = (
    part.providerOptions?.anthropic as
      | { caller?: { toolId?: unknown } }
      | undefined
  )?.caller
  return typeof caller?.toolId === 'string' ? caller.toolId : undefined
}

/**
 * 厂商自己跑的调用（联网、读网页、Claude 联网时的整理代码）和它的结果必须在同一条回复里成对出现，
 * 否则 Claude 整轮 400（`code_execution` tool use … without a corresponding result，10-27 线上 2 次）。
 * SDK 认不出的结果形状会被它丢掉、只留下调用，所以发之前把落单的那一半拿掉；`drop` 给了就连成对的
 * 一起拿掉（被拒后的兜底）。被拿掉的调用发起的东西一并拿掉。没变就原样返回同一个数组。
 */
export function pairProviderToolParts(
  messages: readonly ModelMessage[],
  { drop = false }: { drop?: boolean } = {},
): ModelMessage[] {
  let changed = false
  const out = messages.flatMap((message): ModelMessage[] => {
    if (message.role !== 'assistant' || typeof message.content === 'string')
      return [message]
    const calls = new Set<string>()
    const results = new Set<string>()
    for (const part of message.content) {
      if (part.type === 'tool-call' && isProviderExecuted(part))
        calls.add(part.toolCallId)
      if (part.type === 'tool-result') results.add(part.toolCallId)
    }
    if (calls.size === 0 && results.size === 0) return [message]
    const gone = new Set<string>()
    for (const id of calls) if (drop || !results.has(id)) gone.add(id)
    for (const id of results) if (drop || !calls.has(id)) gone.add(id)
    if (gone.size === 0) return [message]
    // 被拿掉的调用发起的调用也要拿掉；一层层传下去。
    let grew = true
    while (grew) {
      grew = false
      for (const part of message.content) {
        const caller = callerIdOf(part)
        if (
          (part.type === 'tool-call' || part.type === 'tool-result') &&
          caller &&
          gone.has(caller) &&
          !gone.has(part.toolCallId)
        ) {
          gone.add(part.toolCallId)
          grew = true
        }
      }
    }
    const content = message.content.filter(
      (part) =>
        !(
          (part.type === 'tool-call' || part.type === 'tool-result') &&
          gone.has(part.toolCallId)
        ),
    )
    changed = true
    return content.length > 0 ? [{ ...message, content }] : []
  })
  return changed ? out : (messages as ModelMessage[])
}

/** 厂商说某个调用没有对应结果（或反过来）：只认这一类 400，别的照旧。 */
export function isUnpairedToolError(message: string): boolean {
  return /tool[ _]use.*without a corresponding|tool_result.*without a corresponding|unexpected .*tool_use_id/i.test(
    message,
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
 * 之前几轮的对白（只有说的话）。取哪几轮由 `planAssistantV3History` 开窗（第 6 步：按块滑、滑出去的写成
 * 摘要），这里只把那一段排成消息。⚠ 开头那条必须是创作者说的（几家都要求先 user 后 assistant）。
 */
export function historyMessages(lines: readonly HistoryLine[]): ModelMessage[] {
  const kept = lines.filter((line) => line.content.trim())
  const first = kept.findIndex((line) => line.role === 'user')
  if (first < 0) return []
  return kept
    .slice(first)
    .map((line) => ({ role: line.role, content: line.content }))
}

/** 读过的技能全文原样留下（第 7a 步「读过的这一轮一直在」），其余换成一行。 */
const CLEARED = '(cleared to save room;'

function clearedNote(value: string): string {
  if (value.startsWith(CLEARED)) return value
  const head = value.replace(/\s+/g, ' ').trim().slice(0, 120)
  const note = `${CLEARED} it began: "${head}…". Call the same tool again if you need it.)`
  const skills = skillBlocksIn(value)
  return skills.length ? `${note}\n\n${skills.join('\n\n')}` : note
}

/**
 * 清旧工具结果（第 6 步「先清、不花钱」）：一轮里还在原样的工具结果加起来超过 `clearToolResultsChars`
 * 字时，最近 `keepToolSteps` 步之前、长于 `clearableResultChars` 的那些换成一行。能重新查到的才清
 * （查、看、改的回话），模型自己的话、思考、联网结果原样不动；看过的旧图由 `hydratePictures` 管。
 * 没超就原样返回同一个数组。
 */
export function clearOldToolResults(
  messages: ModelMessage[],
  limits: {
    readonly clearToolResultsChars: number
    readonly keepToolSteps: number
    readonly clearableResultChars: number
  } = ASSISTANT_NEXT_LIMITS,
): ModelMessage[] {
  let chars = 0
  const toolSteps: number[] = []
  messages.forEach((message, index) => {
    if (message.role !== 'tool') return
    toolSteps.push(index)
    for (const part of message.content)
      if (part.type === 'tool-result' && part.output.type === 'text')
        chars += part.output.value.length
  })
  if (
    chars <= limits.clearToolResultsChars ||
    toolSteps.length <= limits.keepToolSteps
  )
    return messages
  const keepFrom = toolSteps[toolSteps.length - limits.keepToolSteps]!
  return messages.map((message, index): ModelMessage => {
    if (message.role !== 'tool' || index >= keepFrom) return message
    const content: ToolContent = message.content.map((part) =>
      part.type === 'tool-result' &&
      part.output.type === 'text' &&
      part.output.value.length > limits.clearableResultChars
        ? {
            ...part,
            output: {
              type: 'text' as const,
              value: clearedNote(part.output.value),
            },
          }
        : part,
    )
    return { ...message, content }
  })
}
