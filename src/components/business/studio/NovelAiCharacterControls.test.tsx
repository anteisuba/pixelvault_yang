import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AI_MODELS } from '@/constants/models/enum'
import type { NovelAiCharacterLayout } from '@/types/novelai'
import { NovelAiCharacterControls } from './NovelAiCharacterControls'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
function Harness() {
  const [value, setValue] = useState<NovelAiCharacterLayout>()
  return (
    <>
      <NovelAiCharacterControls
        modelId={AI_MODELS.NOVELAI_V5_FULL}
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}
describe('NovelAI character controls', () => {
  it('keeps unsupported models free of character controls', () => {
    render(<NovelAiCharacterControls onChange={vi.fn()} />)
    expect(screen.queryByText('title')).toBeNull()
  })
  it('preserves separate descriptions when moving characters and clears the last removed character', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.click(screen.getByText('add'))
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'girl' },
    })
    fireEvent.change(screen.getByLabelText('negative'), {
      target: { value: 'hat' },
    })
    fireEvent.click(screen.getByText('add'))
    fireEvent.change(screen.getAllByLabelText('prompt')[1], {
      target: { value: 'boy' },
    })
    fireEvent.click(screen.getAllByText('up')[1])
    expect(
      JSON.parse(screen.getByTestId('value').textContent!).characters.map(
        (c: { prompt: string }) => c.prompt,
      ),
    ).toEqual(['boy', 'girl'])
    fireEvent.click(screen.getByLabelText('manual'))
    fireEvent.change(screen.getAllByRole('slider')[0], {
      target: { value: '0.2' },
    })
    const value = JSON.parse(screen.getByTestId('value').textContent!)
    expect(value.positioning).toBe('manual')
    expect(value.characters[0].position.x).toBe(0.2)
    expect(value.characters[1].negativePrompt).toBe('hat')
    fireEvent.click(screen.getAllByText('remove')[0])
    fireEvent.click(screen.getByText('remove'))
    expect(screen.getByTestId('value').textContent).toBe('')
  })
})
