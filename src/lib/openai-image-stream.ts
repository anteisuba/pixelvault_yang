import { z } from 'zod'

import { parseSseStream } from './sse'

const ImageEventSchema = z.object({
  type: z.enum([
    'image_generation.partial_image',
    'image_generation.completed',
    'image_edit.partial_image',
    'image_edit.completed',
  ]),
  b64_json: z.string().min(1),
  partial_image_index: z.number().int().min(0).max(2).optional(),
  size: z.string().optional(),
})

export async function readOpenAIImageStream(
  body: ReadableStream<Uint8Array>,
  onPartial: (base64: string, index: number) => void | Promise<void>,
): Promise<{ base64: string; size?: string }> {
  for await (const frame of parseSseStream(body)) {
    if (frame.data === '[DONE]') continue
    const value: unknown = JSON.parse(frame.data)
    const parsed = ImageEventSchema.safeParse(value)
    if (!parsed.success) {
      if (
        frame.event === 'error' ||
        (typeof value === 'object' && value !== null && 'error' in value)
      ) {
        throw new Error('OpenAI image stream reported an error.')
      }
      continue
    }
    const event = parsed.data
    if (event.type.endsWith('.completed')) {
      return { base64: event.b64_json, size: event.size }
    }
    if (event.partial_image_index !== undefined) {
      await onPartial(event.b64_json, event.partial_image_index)
    }
  }
  throw new Error('OpenAI image stream ended before the final image.')
}
