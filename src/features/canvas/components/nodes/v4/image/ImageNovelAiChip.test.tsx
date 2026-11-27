import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { CanvasNovelAiRefEntry } from '@/lib/canvas-novelai'
import type { NodeV4GenerationParams } from '@/types/node-workflow'

import { ImageNovelAiChip } from './ImageNovelAiChip'

const v5Full = {
  adapterType: AI_ADAPTER_TYPES.NOVELAI,
  modelId: AI_MODELS.NOVELAI_V5_FULL,
}
const v45Full = {
  adapterType: AI_ADAPTER_TYPES.NOVELAI,
  modelId: AI_MODELS.NOVELAI_V45_FULL,
}
const v5Medium = {
  adapterType: AI_ADAPTER_TYPES.NOVELAI,
  modelId: AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
}

const sampleEntries: readonly CanvasNovelAiRefEntry[] = [
  {
    source: {
      nodeId: 'char-node',
      edgeId: 'e1',
      name: '角色立绘',
      url: 'https://cdn/char.png',
      subtype: 'character',
    },
    mode: 'precise',
    configuredMode: 'precise',
    kind: 'character&style',
    kindSupported: true,
    strength: 1,
    preferSameOutfit: true,
    activeInRequest: true,
  },
]

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

describe('ImageNovelAiChip（Slice 3）', () => {
  it('非 NovelAI 模型完全不渲染', () => {
    const { container } = render(
      <ImageNovelAiChip
        model={{ adapterType: AI_ADAPTER_TYPES.OPENAI, modelId: 'gpt-image-2' }}
        params={undefined}
        refEntries={[]}
        cardMentionCount={0}
        cardPreciseCount={0}
        onParamsChange={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-image-novelai-chip]')).toBeNull()
  })

  it('V5 Full：切换底图/精确参考、展示 outfit 种类与 @角色卡显式开关', () => {
    const onParamsChange = vi.fn()
    const { container } = render(
      <ImageNovelAiChip
        model={v5Full}
        params={{
          novelAiRefConfig: {
            'char-node': {
              mode: 'precise',
              kind: 'character&style',
              strength: 1,
              preferSameOutfit: true,
            },
          },
        }}
        refEntries={sampleEntries}
        cardMentionCount={1}
        cardPreciseCount={0}
        onParamsChange={onParamsChange}
      />,
    )

    const trigger = container.querySelector('[data-image-novelai-chip]')!
    expect(trigger).not.toBeNull()
    expect(container.querySelector('[data-image-novelai-dot]')).not.toBeNull()

    fireEvent.click(trigger)

    expect(
      document.querySelector('[data-novelai-anlas-badge]')?.textContent,
    ).toContain('5')
    expect(
      document.querySelector('[data-novelai-ref-kind="outfit"]'),
    ).not.toBeNull()

    // 切到 outfit 种类
    fireEvent.click(document.querySelector('[data-novelai-ref-kind="outfit"]')!)
    const afterKind = onParamsChange.mock.calls[0]![0] as NodeV4GenerationParams
    expect(afterKind.novelAiRefConfig?.['char-node']?.kind).toBe('outfit')

    // 打开 @角色卡 精确参考开关
    fireEvent.click(
      document.querySelector('[data-novelai-card-precise-switch]')!,
    )
    const afterCardToggle = onParamsChange.mock
      .calls[1]![0] as NodeV4GenerationParams
    expect(afterCardToggle.novelAiCardPreciseRef).toBe(true)
  })

  it('V4.5 Full：隐藏 V5 专属 outfit，允许添加角色并写入 novelAiLayout', () => {
    const onParamsChange = vi.fn()
    const { container } = render(
      <ImageNovelAiChip
        model={v45Full}
        params={undefined}
        refEntries={[
          {
            ...sampleEntries[0]!,
            fidelity: 1,
            preferSameOutfit: undefined,
          },
        ]}
        cardMentionCount={0}
        cardPreciseCount={0}
        onParamsChange={onParamsChange}
      />,
    )

    fireEvent.click(container.querySelector('[data-image-novelai-chip]')!)
    expect(
      document.querySelector('[data-novelai-ref-kind="outfit"]'),
    ).toBeNull()

    fireEvent.click(document.querySelector('[data-novelai-add-character]')!)
    const next = onParamsChange.mock.calls[0]![0] as NodeV4GenerationParams
    expect(next.novelAiLayout?.characters).toHaveLength(1)
    expect(next.novelAiLayout?.positioning).toBe('auto')
  })

  it('V5 Full Medium：展示不支持精确参考提示，并禁用精确参考切换按钮', () => {
    const { container } = render(
      <ImageNovelAiChip
        model={v5Medium}
        params={undefined}
        refEntries={[
          {
            ...sampleEntries[0]!,
            mode: 'base',
            kindSupported: false,
            activeInRequest: true,
          },
        ]}
        cardMentionCount={0}
        cardPreciseCount={0}
        onParamsChange={vi.fn()}
      />,
    )

    fireEvent.click(container.querySelector('[data-image-novelai-chip]')!)
    expect(
      document.querySelector('[data-novelai-precise-unsupported]'),
    ).not.toBeNull()
    const preciseBtn = document.querySelector(
      '[data-novelai-ref-set-mode="precise"]',
    ) as HTMLButtonElement
    expect(preciseBtn.disabled).toBe(true)
  })
})
