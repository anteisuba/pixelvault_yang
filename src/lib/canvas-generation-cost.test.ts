import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'
import { videoCostEstimate } from '@/features/canvas/components/nodes/v4/video/video-node-model'
import { estimateCanvasNodeCost } from '@/lib/canvas-generation-cost'
import { estimateGenerationCost } from '@/lib/generation-cost'

/**
 * 画布三处估价（助手面板的卡价、卡面画面弹层、视频读数）都只是把卡翻译成计价口径，
 * 算式只有 `estimateGenerationCost` 一份 —— 锁住「同一张卡在哪儿看都是同一个数」。
 */
const pinned = (estimate: ReturnType<typeof estimateGenerationCost>) =>
  estimate.pricedCount === 1 ? estimate.total : null

describe('画布估价只有一个来源', () => {
  it('图片卡：与工作台同一口径（比例 / 画质 / 张数）', () => {
    const values = { aspectRatio: '16:9', quality: 'high', count: 2 }
    const card = estimateCanvasNodeCost({
      id: 'n',
      name: 'n',
      kind: 'image',
      model: AI_MODELS.OPENAI_GPT_IMAGE_2,
      parameters: { values, options: {} },
    } as never)
    expect(card).toBe(
      pinned(
        estimateGenerationCost([{ modelId: AI_MODELS.OPENAI_GPT_IMAGE_2 }], {
          kind: 'image',
          perModelCount: 2,
          aspectRatio: '16:9',
          quality: 'high',
        }),
      ),
    )
  })

  it('视频卡：助手面板与卡面读数是同一个数', () => {
    const modelId = AI_MODELS.SEEDANCE_20
    const workbench = pinned(
      estimateGenerationCost([{ modelId }], {
        kind: 'video',
        durationSeconds: 5,
        resolution: '720p',
      }),
    )
    expect(
      estimateCanvasNodeCost({
        id: 'v',
        name: 'v',
        kind: 'video',
        model: modelId,
        parameters: {
          values: { duration: '5', resolution: '720p' },
          options: {},
        },
      } as never),
    ).toBe(workbench)
    expect(
      videoCostEstimate(modelId, { duration: '5', resolution: '720p' }),
    ).toBe(workbench)
  })

  it('缺模型 / 缺时长：给不出数就是 null，⛔ 不写 0', () => {
    expect(
      estimateCanvasNodeCost({ id: 'x', name: 'x', kind: 'image' } as never),
    ).toBeNull()
    expect(
      videoCostEstimate(AI_MODELS.SEEDANCE_20, { resolution: '720p' }),
    ).toBeNull()
  })
})
