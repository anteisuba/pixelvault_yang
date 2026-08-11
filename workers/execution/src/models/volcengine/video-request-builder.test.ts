import { describe, expect, it } from 'vitest'

import {
  buildVolcEngineVideoRequest,
  isVolcEngineProviderId,
} from './video-request-builder'

/**
 * 首尾帧的最后一层（cleanup §1 第 ⑤ 层）。
 *
 * 这一层坏了很久：判据是「图 >1 张 或 有视频/音频 → 多模态参考」，于是两张关键帧
 * （首帧 + 尾帧）被判成一组无序的参考图，视频不会以第二张结尾。改成**按端点判** ——
 * 端点由节点上的模式选定，场景本来就已经定了。
 */
type Content = { type: string; role?: string; image_url?: { url: string } }

function contentOf(body: Record<string, unknown>): Content[] {
  return (body.content ?? []) as Content[]
}

function build(over: {
  modelId: string
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
}) {
  return buildVolcEngineVideoRequest({
    prompt: '一个镜头',
    externalModelId: 'doubao-seedance-2-0-260128',
    ...over,
  })
}

const A = 'https://cdn.test/a.png'
const B = 'https://cdn.test/b.png'

describe('volcengine 视频请求 · 首尾帧', () => {
  it('同时接受火山国内站和 BytePlus 国际站的 provider id', () => {
    expect(isVolcEngineProviderId('volcengine')).toBe(true)
    expect(isVolcEngineProviderId('byteplus')).toBe(true)
    expect(isVolcEngineProviderId('fal')).toBe(false)
  })

  it('普通端点 + 两张图 → first_frame + last_frame（并列两条 image_url）', () => {
    const content = contentOf(
      build({
        modelId: 'seedance-2.0-volcengine',
        referenceImages: [A, B],
      }),
    )
    const images = content.filter((item) => item.type === 'image_url')
    expect(images.map((item) => item.role)).toEqual([
      'first_frame',
      'last_frame',
    ])
    // 顺序由采集端的 `orderKeyframes` 保证（首帧在前），这里只按位置取。
    expect(images[0].image_url?.url).toBe(A)
    expect(images[1].image_url?.url).toBe(B)
  })

  it('普通端点 + 一张图 → 仍是经典的 first_frame i2v', () => {
    const content = contentOf(
      build({ modelId: 'seedance-2.0-volcengine', referenceImages: [A] }),
    )
    expect(
      content.filter((item) => item.type === 'image_url').map((i) => i.role),
    ).toEqual(['first_frame'])
  })

  it('参考端点 → 全部按 reference_image 发，哪怕只有两张', () => {
    // 三场景互斥：参考端点走多模态，不谈首尾。
    const content = contentOf(
      build({
        modelId: 'seedance-2.0-reference-volcengine',
        referenceImages: [A, B],
      }),
    )
    expect(
      content.filter((item) => item.type === 'image_url').map((i) => i.role),
    ).toEqual(['reference_image', 'reference_image'])
  })

  it('普通端点收到视频 → 仍升级成参考模式，不静默丢掉素材', () => {
    // ⚠ 发送链路按模式过滤还没做，关键帧档的节点仍可能采集到视频。砍掉这一路兜底
    // 会让那段视频被悄悄丢掉 —— 正是这一轮一直在治的那类缺陷。
    const content = contentOf(
      build({
        modelId: 'seedance-2.0-volcengine',
        referenceImages: [A],
        videoUrls: ['https://cdn.test/v.mp4'],
      }),
    )
    expect(content.some((item) => item.role === 'reference_video')).toBe(true)
    expect(content.some((item) => item.role === 'first_frame')).toBe(false)
  })

  it('2.5 关键帧档 + 有图 → ratio 强制 adaptive（传具体宽高比会 400）', () => {
    const body = buildVolcEngineVideoRequest({
      prompt: '一个镜头',
      externalModelId: 'doubao-seedance-2-5-260628',
      modelId: 'seedance-2.5-volcengine',
      referenceImages: [A, B],
      aspectRatio: '16:9',
    })
    expect(body.ratio).toBe('adaptive')
  })

  it('BytePlus 2.5 关键帧档使用相同的 adaptive 约束', () => {
    const body = buildVolcEngineVideoRequest({
      prompt: '一个镜头',
      externalModelId: 'dreamina-seedance-2-5-260628',
      modelId: 'seedance-2.5-byteplus',
      referenceImages: [A],
      aspectRatio: '16:9',
    })
    expect(body.ratio).toBe('adaptive')
  })

  it('2.5 原生双站都保留 30 秒与 30/10/10 参考上限', () => {
    for (const modelId of [
      'seedance-2.5-reference-volcengine',
      'seedance-2.5-reference-byteplus',
    ]) {
      const body = buildVolcEngineVideoRequest({
        prompt: '一个镜头',
        externalModelId:
          modelId === 'seedance-2.5-reference-byteplus'
            ? 'dreamina-seedance-2-5-260628'
            : 'doubao-seedance-2-5-260628',
        modelId,
        duration: 30,
        referenceImages: Array.from({ length: 35 }, (_, i) => `${A}?i=${i}`),
        videoUrls: Array.from(
          { length: 12 },
          (_, i) => `https://cdn.test/video-${i}.mp4`,
        ),
        audioUrls: Array.from(
          { length: 12 },
          (_, i) => `https://cdn.test/audio-${i}.mp3`,
        ),
      })
      const content = contentOf(body)
      expect(body.duration).toBe(30)
      expect(
        content.filter((item) => item.role === 'reference_image'),
      ).toHaveLength(30)
      expect(
        content.filter((item) => item.role === 'reference_video'),
      ).toHaveLength(10)
      expect(
        content.filter((item) => item.role === 'reference_audio'),
      ).toHaveLength(10)
    }
  })

  it('2.5 Ark 参考端点允许纯音频输入', () => {
    const body = buildVolcEngineVideoRequest({
      prompt: '跟随音频节奏',
      externalModelId: 'dreamina-seedance-2-5-260628',
      modelId: 'seedance-2.5-reference-byteplus',
      audioUrls: ['https://cdn.test/audio.mp3'],
    })
    expect(
      contentOf(body).filter((item) => item.role === 'reference_audio'),
    ).toHaveLength(1)
  })

  it('⚠ 2.5 纯文生视频 → 比例照发，不受首帧那条约束', () => {
    // 判据是「这次有没有图」，不是模型 id。只看 id 会把文生的比例也改掉。
    const body = buildVolcEngineVideoRequest({
      prompt: '一个镜头',
      externalModelId: 'doubao-seedance-2-5-260628',
      modelId: 'seedance-2.5-volcengine',
      aspectRatio: '16:9',
    })
    expect(body.ratio).toBe('16:9')
  })

  it('2.0 + 有图 → 比例照发，这条约束只属于 2.5', () => {
    const body = buildVolcEngineVideoRequest({
      prompt: '一个镜头',
      externalModelId: 'doubao-seedance-2-0-260128',
      modelId: 'seedance-2.0-volcengine',
      referenceImages: [A, B],
      aspectRatio: '16:9',
    })
    expect(body.ratio).toBe('16:9')
  })

  it('没有图 → 纯文生视频，不产生任何 image_url', () => {
    const content = contentOf(build({ modelId: 'seedance-2.0-volcengine' }))
    expect(content.filter((item) => item.type === 'image_url')).toHaveLength(0)
  })
})
