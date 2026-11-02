import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { VersionStrip } from './VersionStrip'

const URLS = [
  'https://cdn.test/a.png',
  'https://cdn.test/b.png',
  'https://cdn.test/c.png',
]

function setup(current = 1, onSelect = vi.fn(), pendingCount = 0) {
  render(
    <VersionStrip
      urls={URLS}
      current={current}
      onSelect={onSelect}
      ariaLabel="版本"
      labelOf={(index) => `第 ${index + 1} 版`}
      pendingCount={pendingCount}
    />,
  )
  return onSelect
}

describe('VersionStrip', () => {
  it('只有一版、也没有在出的：整条不渲染', () => {
    const { container } = render(
      <VersionStrip
        urls={['https://cdn.test/a.png']}
        current={0}
        onSelect={vi.fn()}
        ariaLabel="版本"
        labelOf={() => 'v1'}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('一版 + 一张在出：出现，末尾是占位', () => {
    render(
      <VersionStrip
        urls={['https://cdn.test/a.png']}
        current={0}
        onSelect={vi.fn()}
        ariaLabel="版本"
        labelOf={() => 'v1'}
        pendingCount={1}
      />,
    )
    expect(
      document.querySelectorAll('[data-version-thumb-pending]'),
    ).toHaveLength(1)
  })

  it('每版一颗缩略，当前版是 checked 的 radio，点别的会回调', () => {
    const onSelect = setup()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios[1]?.querySelector('img')).toHaveAttribute('src', URLS[1])
    expect(screen.getByRole('radio', { name: '第 2 版' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '第 3 版' }))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('←→ 切换并在两端停住；占位不算一版', () => {
    const onSelect = setup(2, vi.fn(), 2)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
