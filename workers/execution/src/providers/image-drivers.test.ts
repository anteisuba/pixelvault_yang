import { describe, expect, it } from 'vitest'

import {
  WORKER_IMAGE_PROVIDER_IDS,
  WORKER_IMAGE_PROVIDER_MODES,
} from '../../../../src/constants/worker-image-providers'
import { getSingleStepImageDriver } from './image-drivers'

describe('出图驱动表（共享契约）', () => {
  it('契约里每家 single-step 服务商都有驱动，multi-step 的不走通用分支', () => {
    for (const id of WORKER_IMAGE_PROVIDER_IDS) {
      const driver = getSingleStepImageDriver(id)
      if (WORKER_IMAGE_PROVIDER_MODES[id] === 'single-step') {
        expect(driver, id).not.toBeNull()
      } else {
        expect(driver, id).toBeNull()
      }
    }
  })

  it('步骤名沿用上线时的名字（在飞实例按名字 replay）', () => {
    expect(getSingleStepImageDriver('novelai')?.stepName).toBe(
      'generate-novelai-image',
    )
    expect(getSingleStepImageDriver('byteplus')?.stepName).toBe(
      'generate-volcengine-image',
    )
    expect(getSingleStepImageDriver('openai')?.stepName).toBe(
      'generate-openai-image',
    )
  })

  it('名单外的服务商拿不到驱动', () => {
    expect(getSingleStepImageDriver('kling')).toBeNull()
    expect(getSingleStepImageDriver('toString')).toBeNull()
  })
})

describe('视频提交 / 轮询驱动表（共享契约）', () => {
  it('契约里每家视频服务商都有自己的驱动，名单外的走 fal', async () => {
    const { WORKER_VIDEO_PROVIDER_IDS } =
      await import('../../../../src/constants/worker-video-providers')
    const { getQueueDriver } = await import('./queue-drivers')
    const fal = getQueueDriver('fal')
    for (const id of WORKER_VIDEO_PROVIDER_IDS) {
      expect(getQueueDriver(id), id).toBeTruthy()
    }
    expect(getQueueDriver('minimax')).not.toBe(fal)
    expect(getQueueDriver('byteplus')).toBe(getQueueDriver('volcengine'))
    // 音频的 fal 队列走兜底。
    expect(getQueueDriver('fish_audio')).toBe(fal)
  })
})
