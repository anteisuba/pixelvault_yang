import { describe, expect, it } from 'vitest'

import {
  WORKER_IMAGE_PROVIDER_IDS,
  WORKER_IMAGE_PROVIDER_MODES,
} from '../../../../src/constants/worker-image-providers'
import { getSingleStepImageDriver } from '../index'

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
