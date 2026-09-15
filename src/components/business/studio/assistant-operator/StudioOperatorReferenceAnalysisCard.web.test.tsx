import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'

import zh from '@/messages/zh.json'
import en from '@/messages/en.json'
import ja from '@/messages/ja.json'
import type { ReferenceAnalysis } from '@/types/assistant-reference-analysis'

import { StudioOperatorReferenceAnalysisCard } from './StudioOperatorReferenceAnalysisCard'

const analysis: ReferenceAnalysis = {
  brief: null,
  profiles: [
    {
      url: 'https://cdn.test/reference.png',
      identity: '角色脸部细节',
      pose: '站立',
      style: {
        renderingMedium: '3d_stylized',
        rendering: '连续体积明暗',
        proportions: '',
        contours: '',
        shading: '',
        materials: '',
        palette: '',
        lighting: '',
      },
      scene: '白色背景',
      uncertainties: [],
    },
  ],
}

describe('reference evidence disclosure', () => {
  it.each([
    { locale: 'zh' as const, messages: zh },
    { locale: 'en' as const, messages: en },
    { locale: 'ja' as const, messages: ja },
  ])(
    'keeps pure analysis folded and translates rendering medium in $locale',
    ({ locale, messages }) => {
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="Asia/Tokyo"
        >
          <StudioOperatorReferenceAnalysisCard analysis={analysis} />
        </NextIntlClientProvider>,
      )
      const card = screen.getByTestId('operator-reference-analysis')
      const details = card.querySelector('details')!
      expect(details.open).toBe(false)
      expect(screen.getByText('角色脸部细节')).not.toBeVisible()
      fireEvent.click(details.querySelector('summary')!)
      expect(details.open).toBe(true)
      expect(screen.getByText('角色脸部细节')).toBeVisible()
      expect(card).toHaveTextContent(
        messages.StudioOperator.referenceAnalysis.medium['3d_stylized'],
      )
      expect(card).not.toHaveTextContent(
        'StudioOperator.referenceAnalysis.renderingMedium',
      )
      expect(card).not.toHaveTextContent('3d_stylized')
    },
  )
})
