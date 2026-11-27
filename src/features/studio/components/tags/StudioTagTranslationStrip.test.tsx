import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { message as M, renderWithApp } from '@/test/app-harness'
import { text } from '@/test/i18n-text'
import { StudioTagTranslationStrip } from './StudioTagTranslationStrip'

describe('StudioTagTranslationStrip', () => {
  it('renders bilingual chips with weights, recognition indicators, unknown warning, and actions', () => {
    const onSelectIndex = vi.fn()
    const onLookup = vi.fn()
    const onRemove = vi.fn()

    renderWithApp(
      <StudioTagTranslationStrip
        chips={[
          { text: 'serafuku', weight: 1.2 },
          { text: 'blurry', weight: -2 },
          { text: 'custom unknown tag', weight: 1 },
        ]}
        tagMeta={{
          serafuku: {
            tag: 'serafuku',
            zh: '水手服',
            zhNote: '日式水手领学生制服',
            ja: 'セーラー服',
            count: 184000,
            category: 0,
            known: true,
          },
          blurry: {
            tag: 'blurry',
            zh: '模糊',
            zhNote: null,
            ja: null,
            count: 298000,
            category: 0,
            known: true,
          },
          custom_unknown_tag: {
            tag: 'custom_unknown_tag',
            zh: null,
            zhNote: null,
            ja: null,
            count: 0,
            category: null,
            known: false,
          },
        }}
        onSelectIndex={onSelectIndex}
        onLookup={onLookup}
        onRemove={onRemove}
      />,
    )

    expect(screen.getByText('serafuku')).toBeInTheDocument()
    expect(screen.getByText('水手服')).toBeInTheDocument()
    expect(screen.getByText('×1.2')).toBeInTheDocument()
    expect(screen.getByText('×-2')).toBeInTheDocument()
    expect(
      screen.getByText(M('StudioTags.recognition.unknownShort')),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('serafuku'))
    expect(onSelectIndex).toHaveBeenCalledWith(0)

    fireEvent.click(screen.getByText('blurry'), { ctrlKey: true })
    expect(onLookup).toHaveBeenCalledWith({ text: 'blurry', weight: -2 })

    fireEvent.click(
      screen.getByRole('button', {
        name: text('StudioTags.translationStrip.removeTag', {
          tag: 'serafuku',
        }),
      }),
    )
    expect(onRemove).toHaveBeenCalledWith(0)
  })
})
