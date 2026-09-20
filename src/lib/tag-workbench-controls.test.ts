import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getTagWorkbenchControls } from '@/lib/tag-workbench-controls'

const NAI_V5 = {
  modelId: AI_MODELS.NOVELAI_V5_FULL as string,
  adapterType: AI_ADAPTER_TYPES.NOVELAI,
}
const PIXAI_TSUBAKI = {
  modelId: AI_MODELS.PIXAI_TSUBAKI_2 as string,
  adapterType: AI_ADAPTER_TYPES.PIXAI,
}
const PIXAI_HARUKA = {
  modelId: AI_MODELS.PIXAI_HARUKA_V2 as string,
  adapterType: AI_ADAPTER_TYPES.PIXAI,
}

function byCapability(models: Parameters<typeof getTagWorkbenchControls>[0]) {
  return Object.fromEntries(
    getTagWorkbenchControls(models).map((control) => [
      control.chip.capability,
      control,
    ]),
  )
}

describe('标签台右列控件', () => {
  it('没选模型就没有控件', () => {
    expect(getTagWorkbenchControls([])).toEqual([])
  })

  // 单模型：全部都是共享档（只有它一家，交集就是它自己）。
  it('单模型时每一项都是共享档', () => {
    const controls = getTagWorkbenchControls([NAI_V5])
    expect(controls.length).toBeGreaterThan(0)
    expect(controls.every((control) => control.shared)).toBe(true)
    expect(controls.map((control) => control.chip.capability)).toContain(
      'sampler',
    )
  })

  // D10 ② Q3：两家都支持的留着可改；只有一家支持的灰掉并标「只对 X 生效」。
  it('多选时把只有一家支持的项标出来', () => {
    const controls = byCapability([NAI_V5, PIXAI_HARUKA])

    // 两家都收的扩散旋钮 —— 共享档。
    expect(controls.guidanceScale.shared).toBe(true)
    expect(controls.steps.shared).toBe(true)

    // NAI 专属的几项 —— 灰着但仍在名单里，`supportedBy` 说清是谁。
    for (const capability of ['ucPreset', 'qualityToggle', 'sampler']) {
      expect(controls[capability].shared).toBe(false)
      expect(controls[capability].supportedBy).toEqual([NAI_V5.modelId])
    }
  })

  // Tsubaki 是 DiT，连 steps / cfg 都不收 —— 与 NAI 同选时只剩「都没有」的空交集。
  it('DiT 档与 NAI 同选时没有任何共享的扩散旋钮', () => {
    const controls = getTagWorkbenchControls([NAI_V5, PIXAI_TSUBAKI])
    expect(controls.some((control) => control.shared)).toBe(false)
    expect(
      controls.find((control) => control.chip.capability === 'steps')
        ?.supportedBy,
    ).toEqual([NAI_V5.modelId])
  })

  // 值域按名单第一位（= 主模型）取，出图时各自再裁剪一次。
  it('同名能力取名单第一位的值域', () => {
    const curated = {
      modelId: AI_MODELS.NOVELAI_V5_CURATED as string,
      adapterType: AI_ADAPTER_TYPES.NOVELAI,
    }
    const fromFull = byCapability([NAI_V5, curated])
    const fromCurated = byCapability([curated, NAI_V5])
    expect(fromFull.textRendering.chip.maxLength).toBe(750)
    expect(fromCurated.textRendering.chip.maxLength).toBe(374)
  })
})
