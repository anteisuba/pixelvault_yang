import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  getStudioVideoCapacity,
  getStudioVideoTokenFormat,
  listStudioVideoImages,
  resolveStudioVideoSend,
} from './video-workbench-slots'

/**
 * 素材轨（owner 2026-09-24 视频画板：去掉三个模式，按挂了什么判断）。
 *
 * 钉四件事：
 *  ① 容量来自契约：参考那几格按型号的**参考端点**算，没有参考档的型号不收参考图；
 *  ② 编号 = 显示顺序 = 参考档下的发送顺序：首帧、尾帧、再是参考图；
 *  ③ 有参考项 → 参考端点，首尾帧作为参考图随行；否则走关键帧端点；
 *  ④ 只有尾帧、没有首帧时两张都不发（⛔ 不把尾帧顶成首帧）。
 */
const EMPTY = { first: null, last: null, references: [], videos: [], audios: 0 }

describe('getStudioVideoCapacity', () => {
  it('Seedance 2.5（火山）：首 + 尾帧，且参考图 / 视频 / 音频都收', () => {
    const capacity = getStudioVideoCapacity(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(capacity.frames).toBe(2)
    expect(capacity.references).toBeGreaterThan(0)
    expect(capacity.videos).toBeGreaterThan(0)
    expect(capacity.audios).toBeGreaterThan(0)
  })

  it('没有参考档的型号（HappyHorse）只收首帧，⛔ 不收参考图', () => {
    const capacity = getStudioVideoCapacity(
      AI_MODELS.HAPPYHORSE_10,
      AI_ADAPTER_TYPES.FAL,
    )
    expect(capacity.frames).toBe(1)
    expect(capacity.references).toBe(0)
    expect(capacity.videos).toBe(0)
    expect(capacity.audios).toBe(0)
  })

  it('只吃图片内容参考的型号（Gemini Omni Flash）：没有帧，图就是参考', () => {
    const capacity = getStudioVideoCapacity(
      AI_MODELS.GEMINI_OMNI_FLASH,
      AI_ADAPTER_TYPES.GEMINI,
    )
    expect(capacity.frames).toBe(0)
    expect(capacity.references).not.toBe(0)
  })

  it('还没选模型时什么都不收', () => {
    expect(getStudioVideoCapacity(undefined)).toEqual({
      frames: 0,
      references: 0,
      videos: 0,
      audios: 0,
    })
  })
})

describe('listStudioVideoImages', () => {
  it('首帧、尾帧在前，参考图随后，编号从 1 起连续', () => {
    expect(
      listStudioVideoImages({
        first: 'https://cdn.example.com/f.png',
        last: null,
        references: [
          'https://cdn.example.com/r1.png',
          'https://cdn.example.com/r2.png',
        ],
      }),
    ).toEqual([
      { url: 'https://cdn.example.com/f.png', role: 'first', n: 1 },
      { url: 'https://cdn.example.com/r1.png', role: 'reference', n: 2 },
      { url: 'https://cdn.example.com/r2.png', role: 'reference', n: 3 },
    ])
  })
})

describe('resolveStudioVideoSend', () => {
  const model = AI_MODELS.SEEDANCE_25_VOLCENGINE
  const adapter = AI_ADAPTER_TYPES.VOLCENGINE

  it('只挂首尾帧 → 关键帧端点，只发首帧 + 尾帧', () => {
    const send = resolveStudioVideoSend(model, adapter, {
      ...EMPTY,
      first: 'https://cdn.example.com/f.png',
      last: 'https://cdn.example.com/l.png',
    })
    expect(send.modelId).toBe(AI_MODELS.SEEDANCE_25_VOLCENGINE)
    expect(send.hasReference).toBe(false)
    expect(send.mode).toBe('firstLastFrame')
    expect(send.images).toEqual([
      'https://cdn.example.com/f.png',
      'https://cdn.example.com/l.png',
    ])
  })

  it('挂了音频 → 参考端点，首帧作为参考图随行（编号与轨上一致）', () => {
    const send = resolveStudioVideoSend(model, adapter, {
      ...EMPTY,
      first: 'https://cdn.example.com/f.png',
      references: ['https://cdn.example.com/r.png'],
      audios: 1,
    })
    expect(send.modelId).toBe(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE)
    expect(send.hasReference).toBe(true)
    expect(send.mode).toBe('omniReference')
    expect(send.images).toEqual([
      'https://cdn.example.com/f.png',
      'https://cdn.example.com/r.png',
    ])
  })

  it('⛔ 只有尾帧时两张都不发 —— 不把尾帧顶成首帧', () => {
    const send = resolveStudioVideoSend(model, adapter, {
      ...EMPTY,
      last: 'https://cdn.example.com/l.png',
    })
    expect(send.images).toEqual([])
  })

  it('没有参考档的型号挂了参考项也保留原端点（⛔ 不回退到别的端点）', () => {
    const send = resolveStudioVideoSend(
      AI_MODELS.HAPPYHORSE_10,
      AI_ADAPTER_TYPES.FAL,
      { ...EMPTY, audios: 1 },
    )
    expect(send.modelId).toBe(AI_MODELS.HAPPYHORSE_10)
  })
})

describe('getStudioVideoTokenFormat（按模型写它自己的格式）', () => {
  it('Seedance：fal 写 @Image1，火山 / BytePlus 写 图片1', () => {
    const fal = getStudioVideoTokenFormat(
      AI_MODELS.SEEDANCE_20,
      AI_ADAPTER_TYPES.FAL,
    )
    expect(fal.prefixed).toBe(true)
    expect(fal.image(1)).toBe('Image1')
    const ark = getStudioVideoTokenFormat(
      AI_MODELS.SEEDANCE_20_BYTEPLUS,
      AI_ADAPTER_TYPES.BYTEPLUS,
    )
    expect(ark.prefixed).toBe(false)
    expect(ark.image(1)).toBe('图片1')
    expect(ark.audio(1)).toBe('音频1')
  })

  it('Wan 写 图1，MiniMax 写 Image 1，Gemini 从 0 起编 <IMAGE_REF_0>', () => {
    expect(
      getStudioVideoTokenFormat(AI_MODELS.WAN_30, AI_ADAPTER_TYPES.FAL).image(
        1,
      ),
    ).toBe('图1')
    expect(
      getStudioVideoTokenFormat(
        AI_MODELS.MINIMAX_H3,
        AI_ADAPTER_TYPES.MINIMAX,
      ).image(1),
    ).toBe('Image 1')
    expect(
      getStudioVideoTokenFormat(
        AI_MODELS.GEMINI_OMNI_FLASH,
        AI_ADAPTER_TYPES.GEMINI,
      ).image(1),
    ).toBe('<IMAGE_REF_0>')
  })
})
