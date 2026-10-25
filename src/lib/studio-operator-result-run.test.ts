import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { toOperatorSnapshotResults } from '@/lib/studio-operator-result-run'

describe('toOperatorSnapshotResults', () => {
  it('⭐ 记录里的大写 IMAGE 照收；视频与没存好的地址不收', () => {
    expect(
      toOperatorSnapshotResults(
        [
          { id: 'a', url: 'https://cdn.test/a.png', outputType: 'IMAGE' },
          { id: 'v', url: 'https://cdn.test/v.mp4', outputType: 'VIDEO' },
          { id: 'd', url: 'data:image/png;base64,xx', outputType: 'IMAGE' },
          { id: 'b', url: 'https://cdn.test/b.png', label: '图_2' },
        ],
        'b',
      ),
    ).toEqual([
      { assetId: 'a', url: 'https://cdn.test/a.png' },
      {
        assetId: 'b',
        url: 'https://cdn.test/b.png',
        label: '图_2',
        selected: true,
      },
    ])
  })

  it('只有一张时它就是选中的；多张没选中就都不标', () => {
    expect(
      toOperatorSnapshotResults(
        [{ id: 'a', url: 'https://cdn.test/a.png' }],
        null,
      ),
    ).toEqual([{ assetId: 'a', url: 'https://cdn.test/a.png', selected: true }])
    expect(
      toOperatorSnapshotResults(
        [
          { id: 'a', url: 'https://cdn.test/a.png' },
          { id: 'b', url: 'https://cdn.test/b.png' },
        ],
        null,
      ).some((item) => item.selected),
    ).toBe(false)
  })

  it('最多交快照上限那几张（新的在前）', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `g${index}`,
      url: `https://cdn.test/${index}.png`,
    }))
    expect(toOperatorSnapshotResults(items, null)).toHaveLength(
      ASSISTANT_OPERATOR_LIMITS.maxSnapshotResults,
    )
  })
})
