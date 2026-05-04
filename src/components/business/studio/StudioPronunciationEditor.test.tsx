import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioPronunciationEditor } from './StudioPronunciationEditor'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StudioPronunciationEditor', () => {
  it('adds a pronunciation entry and emits dictionary changes', () => {
    const onChange = vi.fn()
    render(<StudioPronunciationEditor dictionary={{}} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'addWord' }))
    fireEvent.change(screen.getByLabelText('word'), {
      target: { value: 'Codex' },
    })
    fireEvent.change(screen.getByLabelText('pronounceAs'), {
      target: { value: 'koh-decks' },
    })

    expect(onChange).toHaveBeenLastCalledWith({ Codex: 'koh-decks' })
  })

  it('deletes an existing pronunciation entry', () => {
    const onChange = vi.fn()
    render(
      <StudioPronunciationEditor
        dictionary={{ Codex: 'koh-decks' }}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'deleteWord' }))

    expect(onChange).toHaveBeenCalledWith({})
  })
})
