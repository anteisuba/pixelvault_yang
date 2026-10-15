import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import type { NodeV4GenerationParams } from '@/types/node-workflow'

import { ImageAdvancedChip } from './ImageAdvancedChip'

const novelai = { adapterType: 'novelai', modelId: 'nai-diffusion-4-5-full' }

beforeAll(() => {
  // Radix 弹层里的滑条用它量尺寸。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

function setup(
  params: NodeV4GenerationParams | undefined,
  model: { adapterType: string; modelId: string } | null = novelai,
) {
  const onParamsChange = vi.fn()
  const view = render(
    <ImageAdvancedChip
      model={model ?? undefined}
      params={params}
      onParamsChange={onParamsChange}
      hasReferenceImage={false}
    />,
  )
  return { ...view, onParamsChange }
}

function open(container: HTMLElement) {
  fireEvent.click(container.querySelector('[data-image-advanced]')!)
}

describe('ImageAdvancedChip（spec §3 ⚙ 高级）', () => {
  it('没选模型：整颗不画', () => {
    const { container } = setup(undefined, null)
    expect(container.querySelector('[data-image-advanced]')).toBeNull()
  })

  it('全是默认值：没有小点；锁了种子：右上一颗小点', () => {
    const { container, rerender } = setup({})
    expect(container.querySelector('[data-image-advanced-dot]')).toBeNull()
    rerender(
      <ImageAdvancedChip
        model={novelai}
        params={{ advanced: { seed: 42 } }}
        onParamsChange={vi.fn()}
        hasReferenceImage={false}
      />,
    )
    expect(container.querySelector('[data-image-advanced-dot]')).not.toBeNull()
  })

  it('点 🔒：存一颗种子；再点：删掉回随机，其余高级项不动', () => {
    const { container, onParamsChange, rerender } = setup({
      count: 2,
      advanced: { steps: 28 },
    })
    open(container)
    fireEvent.click(document.querySelector('[data-image-advanced-seed-lock]')!)
    const locked = onParamsChange.mock.calls[0]![0] as NodeV4GenerationParams
    expect(typeof locked.advanced?.seed).toBe('number')
    expect(locked.advanced?.steps).toBe(28)
    expect(locked.count).toBe(2)

    rerender(
      <ImageAdvancedChip
        model={novelai}
        params={locked}
        onParamsChange={onParamsChange}
        hasReferenceImage={false}
      />,
    )
    fireEvent.click(document.querySelector('[data-image-advanced-seed-lock]')!)
    const unlocked = onParamsChange.mock.calls[1]![0] as NodeV4GenerationParams
    expect(unlocked.advanced).toEqual({ steps: 28 })
  })

  it('反向提示词写进 advanced.negativePrompt；清空就删掉这一项', () => {
    const { container, onParamsChange } = setup({})
    open(container)
    const field = screen.getByPlaceholderText('negativePlaceholder')
    fireEvent.change(field, { target: { value: 'text, watermark' } })
    expect(onParamsChange).toHaveBeenLastCalledWith({
      advanced: { negativePrompt: 'text, watermark' },
    })
  })

  it('模型不认种子与反向词：那两行不出', () => {
    const { container } = setup(
      {},
      { adapterType: 'ideogram', modelId: 'ideogram-v3' },
    )
    open(container)
    // Ideogram 认种子、不认反向词。
    expect(document.querySelector('[data-image-advanced-seed]')).not.toBeNull()
    expect(document.querySelector('[data-image-advanced-negative]')).toBeNull()
  })
})
