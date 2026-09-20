import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

import { NovelAiCharacterComposer } from './NovelAiCharacterComposer'
import type { NovelAiCharacterLayout } from '@/types/novelai'

function layoutOf(
  ...positions: { x: number; y: number }[]
): NovelAiCharacterLayout {
  return {
    positioning: 'auto',
    characters: positions.map((position, index) => ({
      prompt: `char ${index + 1}`,
      negativePrompt: '',
      position,
    })),
  }
}

function setup(
  mode: 'free' | 'grid',
  value: NovelAiCharacterLayout | undefined,
  maxCharacters = mode === 'free' ? 22 : 6,
) {
  const onChange = vi.fn()
  const onSelect = vi.fn()
  render(
    <NovelAiCharacterComposer
      mode={mode}
      maxCharacters={maxCharacters}
      value={value}
      activeIndex={0}
      onChange={onChange}
      onSelect={onSelect}
    />,
  )
  return { onChange, onSelect }
}

describe('角色构图两形态', () => {
  // ⛔ 不给用户选形态 —— 组件不渲染任何「自由 / 网格」的开关。
  it('网格档画出 5×5 个可点的格子，自由档一个都没有', () => {
    setup('grid', layoutOf({ x: 0.1, y: 0.1 }))
    expect(screen.getAllByRole('button', { name: /^gridCell:/ })).toHaveLength(
      25,
    )
  })

  it('自由档没有格子', () => {
    setup('free', layoutOf({ x: 0.2, y: 0.5 }))
    expect(
      screen.queryAllByRole('button', { name: /^gridCell:/ }),
    ).toHaveLength(0)
  })

  // 网格档点格子 = 把选中的角色放到格心（0.1 / 0.3 / 0.5 / 0.7 / 0.9）。
  it('点格子把选中的角色吸到格心，并落成手动定位', () => {
    const { onChange } = setup('grid', layoutOf({ x: 0.1, y: 0.1 }))
    fireEvent.click(screen.getByRole('button', { name: 'gridCell:4,2' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as NovelAiCharacterLayout
    expect(next.positioning).toBe('manual')
    expect(next.characters[0].position.x).toBeCloseTo(0.7)
    expect(next.characters[0].position.y).toBeCloseTo(0.3)
  })

  it('两档的说明行各报各的上限', () => {
    const { unmount } = render(
      <NovelAiCharacterComposer
        mode="free"
        maxCharacters={22}
        value={undefined}
        activeIndex={null}
        onChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('characterModeFree:22')).toBeInTheDocument()
    unmount()

    setup('grid', undefined)
    expect(screen.getByText('characterModeGrid:6')).toBeInTheDocument()
  })

  it('到上限就加不动人了', () => {
    setup(
      'grid',
      layoutOf(...Array.from({ length: 6 }, () => ({ x: 0.5, y: 0.5 }))),
    )
    expect(screen.getByRole('button', { name: /addCharacter/ })).toBeDisabled()
  })

  // 删掉最后一个人 = 整个 layout 消失（⛔ 不留一个空数组，schema 要求 ≥1）。
  it('删光角色时把 layout 整个清掉', () => {
    const { onChange, onSelect } = setup('free', layoutOf({ x: 0.5, y: 0.5 }))
    fireEvent.click(screen.getByRole('button', { name: 'removeCharacter:1' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('点角色药丸把编辑器切到那个人', () => {
    const { onSelect } = setup(
      'free',
      layoutOf({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'characterChip:2,char 2' }),
    )
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
