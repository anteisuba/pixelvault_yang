import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getLlmImages, prepareInlineImages } from '@/services/llm/llm-core'
import type { LlmTextInput } from '@/services/llm-text.service'

afterEach(() => {
  vi.unstubAllGlobals()
})

// GPT Image 的 SVG 输出不能当看图输入：每一家都先过 getLlmImages，按地址拦；
// 地址看不出来的，prepareInlineImages 按下载到的 MIME 再拦。都是 400，⛔ 转给模型。
const svgRejection = {
  errorCode: GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
  httpStatus: 400,
  message: "SVG images can't be used as input. Convert it to PNG first.",
}

describe('SVG image inputs', () => {
  it.each([
    AI_ADAPTER_TYPES.ANTHROPIC,
    AI_ADAPTER_TYPES.OPENAI,
    AI_ADAPTER_TYPES.GEMINI,
  ])('getLlmImages rejects .svg URLs and SVG data URLs (%s)', (adapterType) => {
    const input = (imageData: string[]) =>
      ({ adapterType, imageData }) as unknown as LlmTextInput
    expect(() =>
      getLlmImages(input(['https://cdn.example.com/u/1/gen.svg'])),
    ).toThrow(expect.objectContaining(svgRejection))
    expect(() =>
      getLlmImages(input(['data:image/svg+xml;base64,PHN2Zy8+'])),
    ).toThrow(expect.objectContaining(svgRejection))
  })

  it('prepareInlineImages rejects a download served as image/svg+xml', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
        headers: { 'content-type': 'image/svg+xml' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      prepareInlineImages(
        ['https://cdn.example.com/u/1/image'],
        AI_ADAPTER_TYPES.OPENAI,
      ),
    ).rejects.toMatchObject(svgRejection)
    // 只有取图那一下，没有发给模型的请求。
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// GIF 动图看图模型只看一帧：同一个码、另一句文案（先取首帧，不是先转 PNG）。
const gifRejection = {
  errorCode: GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
  httpStatus: 400,
  message:
    "GIF images can't be used as input. Extract its first frame as a PNG to continue.",
}

describe('GIF image inputs', () => {
  it.each([
    AI_ADAPTER_TYPES.ANTHROPIC,
    AI_ADAPTER_TYPES.OPENAI,
    AI_ADAPTER_TYPES.GEMINI,
  ])('getLlmImages rejects .gif URLs and GIF data URLs (%s)', (adapterType) => {
    const input = (imageData: string[]) =>
      ({ adapterType, imageData }) as unknown as LlmTextInput
    expect(() =>
      getLlmImages(input(['https://cdn.example.com/u/1/gen.gif'])),
    ).toThrow(expect.objectContaining(gifRejection))
    expect(() =>
      getLlmImages(input(['data:image/gif;base64,R0lGODlhAQABAAAAACw='])),
    ).toThrow(expect.objectContaining(gifRejection))
  })

  it('prepareInlineImages rejects a download served as image/gif', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), {
        headers: { 'content-type': 'image/gif' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      prepareInlineImages(
        ['https://cdn.example.com/u/1/image'],
        AI_ADAPTER_TYPES.OPENAI,
      ),
    ).rejects.toMatchObject(gifRejection)
    // 只有取图那一下，没有发给模型的请求。
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
