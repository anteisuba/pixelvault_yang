import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { CameraGrammarButton } from './CameraGrammarButton'

describe('CameraGrammarButton (§5 L1 运镜语法)', () => {
  // The mocked useTranslations returns the key verbatim, ignoring the
  // namespace — so tc('label') → 'label', tc('groups.size') → 'groups.size'.
  it('opens the chip groups and inserts a film term on click', () => {
    const onInsert = vi.fn()
    render(<CameraGrammarButton onInsert={onInsert} />)
    fireEvent.click(screen.getByRole('button', { name: 'label' }))
    expect(screen.getByText('groups.size')).toBeInTheDocument()
    expect(screen.getByText('groups.move')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '推镜头' }))
    expect(onInsert).toHaveBeenCalledWith('推镜头')
  })

  it('does not fire before a chip is chosen', () => {
    const onInsert = vi.fn()
    render(<CameraGrammarButton onInsert={onInsert} />)
    fireEvent.click(screen.getByRole('button', { name: 'label' }))
    expect(onInsert).not.toHaveBeenCalled()
  })
})
