/**
 * Ideogram 契约测试（o-worker 第 7 步）：官方 v2「Poll a generation」的示例返回喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { describe, expect, it } from 'vitest'

import fixtures from './contract-fixtures.json'
import { parseIdeogramGeneration } from './image-request-builder'

const id = fixtures.completed.generation_id

describe('Ideogram 契约', () => {
  it('完成：读出地址、尺寸和种子', () => {
    expect(parseIdeogramGeneration(fixtures.completed, id)).toMatchObject({
      status: 'completed',
      imageUrl: fixtures.completed.data[0].url,
      width: 2048,
      height: 2048,
      providerMetadata: { seed: 12345 },
    })
  })

  it('文档类型表里的 image.generation 也认作图片', () => {
    const typed = {
      ...fixtures.completed,
      data: [
        { ...fixtures.completed.data[0], object_type: 'image.generation' },
      ],
    }
    expect(parseIdeogramGeneration(typed, id)).toMatchObject({
      status: 'completed',
    })
  })

  it('还在跑', () => {
    expect(parseIdeogramGeneration(fixtures.pending, id)).toEqual({
      status: 'pending',
    })
  })

  it('内容违规判成 content_filtered', () => {
    expect(() => parseIdeogramGeneration(fixtures.failed, id)).toThrow(
      expect.objectContaining({ errorCode: 'content_filtered' }),
    )
  })
})
