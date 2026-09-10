import { describe, expect, it, vi } from 'vitest'

import { readOpenAIImageStream } from './openai-image-stream'

function stream(text: string) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7)
        controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    },
  })
}

describe('OpenAI image streams', () => {
  it.each(['image_generation', 'image_edit'])(
    'reads chunked %s previews and final output',
    async (prefix) => {
      const preview = vi.fn()
      const result = await readOpenAIImageStream(
        stream(
          `event: ${prefix}.partial_image\r\ndata: ${JSON.stringify({ type: `${prefix}.partial_image`, b64_json: 'partial', partial_image_index: 0 })}\r\n\r\n` +
            `event: ${prefix}.completed\ndata: ${JSON.stringify({ type: `${prefix}.completed`, b64_json: 'final', size: '1024x1024' })}\n\n`,
        ),
        preview,
      )
      expect(preview).toHaveBeenCalledWith('partial', 0)
      expect(result).toEqual({ base64: 'final', size: '1024x1024' })
    },
  )

  it('does not treat a partial image as a completed generation', async () => {
    await expect(
      readOpenAIImageStream(
        stream(
          `data: ${JSON.stringify({ type: 'image_edit.partial_image', b64_json: 'partial', partial_image_index: 0 })}\n\n`,
        ),
        vi.fn(),
      ),
    ).rejects.toThrow('before the final image')
  })

  it('accepts a final image without waiting for the requested previews', async () => {
    const preview = vi.fn()
    await expect(
      readOpenAIImageStream(
        stream(
          'data: {"type":"image_generation.completed","b64_json":"final"}\n\n',
        ),
        preview,
      ),
    ).resolves.toMatchObject({ base64: 'final' })
    expect(preview).not.toHaveBeenCalled()
  })
})
