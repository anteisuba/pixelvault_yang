import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { PromptAssistantLoraTag } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      if (values?.tag) return `${namespace}.${key}:${values.tag}`
      return `${namespace}.${key}`
    }
    return translate
  },
}))

import { PromptAssistantLoraResultCard } from './PromptAssistantLoraResultCard'

const POSITIVE: PromptAssistantLoraTag[] = [
  { text: '1girl', canonical: '1girl', category: 'scene', popularity: 50 },
  {
    text: 'silver hair color',
    canonical: 'silver_hair',
    category: 'character',
    popularity: 30,
    normalized: true,
  },
  { text: 'ghibli atmosphere', free: true },
]

const NEGATIVE: PromptAssistantLoraTag[] = [
  { text: 'lowres', canonical: 'lowres', category: 'quality', popularity: 50 },
]

function renderCard(
  overrides: Partial<
    React.ComponentProps<typeof PromptAssistantLoraResultCard>
  > = {},
) {
  const onFillPrompt = vi.fn()
  const onAppendPrompt = vi.fn()
  const onFillNegativePrompt = vi.fn()
  const onAppendNegativePrompt = vi.fn()

  render(
    <PromptAssistantLoraResultCard
      positive={POSITIVE}
      negative={NEGATIVE}
      hasMounts={false}
      onFillPrompt={onFillPrompt}
      onAppendPrompt={onAppendPrompt}
      onFillNegativePrompt={onFillNegativePrompt}
      onAppendNegativePrompt={onAppendNegativePrompt}
      {...overrides}
    />,
  )

  return {
    onFillPrompt,
    onAppendPrompt,
    onFillNegativePrompt,
    onAppendNegativePrompt,
  }
}

describe('PromptAssistantLoraResultCard', () => {
  it('renders vocabulary-hit chips with canonical text and a free-word chip', () => {
    renderCard()

    expect(screen.getByText('1girl')).toBeInTheDocument()
    expect(screen.getByText('silver_hair')).toBeInTheDocument()
    expect(screen.getByText('ghibli atmosphere')).toBeInTheDocument()
    expect(screen.getByText('lowres')).toBeInTheDocument()
  })

  it('marks the fuzzy-matched chip as normalized', () => {
    renderCard()
    expect(
      screen.getByTitle('PromptAssistant.assistantNormalized'),
    ).toBeInTheDocument()
  })

  it('tags the unmatched chip as a free word via title', () => {
    renderCard()
    const freeChip = screen
      .getByText('ghibli atmosphere')
      .closest('span[title]')
    expect(freeChip).toHaveAttribute(
      'title',
      'PromptAssistant.assistantFreeWord',
    )
  })

  it('fills both positive and negative fields, joining canonical forms', () => {
    const { onFillPrompt, onFillNegativePrompt } = renderCard()

    fireEvent.click(screen.getByText('PromptAssistant.usePrompt'))

    expect(onFillPrompt).toHaveBeenCalledWith(
      '1girl, silver_hair, ghibli atmosphere',
    )
    expect(onFillNegativePrompt).toHaveBeenCalledWith('lowres')
  })

  it('dedupes chips that resolve to the same display text when filling', () => {
    // 真机实测踩坑：两个不同原文（如 masterpiece / best quality）模糊命中
    // 同一词库条目时，F1 各自保留成一条 tag——填入正文时不该出现肉眼重复。
    const { onFillPrompt } = renderCard({
      positive: [
        ...POSITIVE,
        { text: 'best quality', canonical: 'masterpiece', category: 'quality' },
        { text: '1girl', canonical: '1girl', category: 'scene' },
      ],
    })

    fireEvent.click(screen.getByText('PromptAssistant.usePrompt'))

    expect(onFillPrompt).toHaveBeenCalledWith(
      '1girl, silver_hair, ghibli atmosphere, masterpiece',
    )
  })

  it('does not call the negative fill handler when there are no negative tags', () => {
    const { onFillNegativePrompt } = renderCard({ negative: [] })

    fireEvent.click(screen.getByText('PromptAssistant.usePrompt'))

    expect(onFillNegativePrompt).not.toHaveBeenCalled()
  })

  it('appends both fields on the append action', () => {
    const { onAppendPrompt, onAppendNegativePrompt } = renderCard()

    fireEvent.click(screen.getByText('PromptAssistant.appendPrompt'))

    expect(onAppendPrompt).toHaveBeenCalledWith(
      '1girl, silver_hair, ghibli atmosphere',
    )
    expect(onAppendNegativePrompt).toHaveBeenCalledWith('lowres')
  })

  it('excludes a removed chip from the fill text after clicking its ×', () => {
    const { onFillPrompt } = renderCard()

    fireEvent.click(
      screen.getByLabelText('PromptAssistant.assistantRemoveChip:1girl'),
    )
    expect(screen.queryByText('1girl')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('PromptAssistant.usePrompt'))
    expect(onFillPrompt).toHaveBeenCalledWith('silver_hair, ghibli atmosphere')
  })

  it('renders the note and the static trigger-word disclaimer when mounts are active', () => {
    renderCard({ note: 'Left identity to the LoRA.', hasMounts: true })

    expect(screen.getByText('Left identity to the LoRA.')).toBeInTheDocument()
    expect(
      screen.getByText('PromptAssistant.assistantTriggerNote'),
    ).toBeInTheDocument()
  })

  it('omits the muted note block entirely when there is no note and no mounts', () => {
    renderCard({ note: undefined, hasMounts: false })

    expect(
      screen.queryByText('PromptAssistant.assistantTriggerNote'),
    ).not.toBeInTheDocument()
  })
})
