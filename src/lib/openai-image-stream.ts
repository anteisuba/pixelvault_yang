// Referenced by the execution worker — keep zero third-party dependencies.

import { parseSseStream } from './sse'

const IMAGE_EVENT_TYPES = [
  'image_generation.partial_image',
  'image_generation.completed',
  'image_edit.partial_image',
  'image_edit.completed',
] as const

type ImageEventType = (typeof IMAGE_EVENT_TYPES)[number]

interface ImageEvent {
  type: ImageEventType
  b64_json: string
  partial_image_index?: number
  size?: string
}

function isImageEventType(value: unknown): value is ImageEventType {
  return (
    typeof value === 'string' &&
    (IMAGE_EVENT_TYPES as readonly string[]).includes(value)
  )
}

function parseImageEvent(value: unknown): ImageEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  if (!isImageEventType(record.type)) return null

  if (typeof record.b64_json !== 'string' || record.b64_json.length === 0) {
    return null
  }

  let partialImageIndex: number | undefined
  if (record.partial_image_index !== undefined) {
    const index = record.partial_image_index
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 2
    ) {
      return null
    }
    partialImageIndex = index
  }

  if (record.size !== undefined && typeof record.size !== 'string') {
    return null
  }

  return {
    type: record.type,
    b64_json: record.b64_json,
    partial_image_index: partialImageIndex,
    size: record.size,
  }
}

export async function readOpenAIImageStream(
  body: ReadableStream<Uint8Array>,
  onPartial: (base64: string, index: number) => void | Promise<void>,
): Promise<{ base64: string; size?: string }> {
  for await (const frame of parseSseStream(body)) {
    if (frame.data === '[DONE]') continue
    const value: unknown = JSON.parse(frame.data)
    const event = parseImageEvent(value)
    if (!event) {
      if (
        frame.event === 'error' ||
        (typeof value === 'object' && value !== null && 'error' in value)
      ) {
        throw new Error('OpenAI image stream reported an error.')
      }
      continue
    }
    if (event.type.endsWith('.completed')) {
      return { base64: event.b64_json, size: event.size }
    }
    if (event.partial_image_index !== undefined) {
      await onPartial(event.b64_json, event.partial_image_index)
    }
  }
  throw new Error('OpenAI image stream ended before the final image.')
}
