import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ASSISTANT_AVATAR_CHOICE_IDS } from '@/constants/assistant-persona'
import {
  AssistantAvatarGlyph,
  assistantGlyphLetterName,
} from '@/features/assistant/components/operator/AssistantAvatarGlyph'

const character = {
  id: 'card-1',
  name: 'Denia',
  faceUrl: null,
  hasSpeech: true,
  hasProfile: true,
}

describe('没图的角色画首字母，⛔ 退成品牌图标', () => {
  it('头像选「角色」且她没有图：给她的名字', () => {
    expect(
      assistantGlyphLetterName({
        avatarChoice: ASSISTANT_AVATAR_CHOICE_IDS.character,
        avatarUrl: null,
        character,
      }),
    ).toBe('Denia')
  })

  it('有图 / 选的是预设 / 还没拉到：不给（照旧图标或图）', () => {
    expect(
      assistantGlyphLetterName({
        avatarChoice: ASSISTANT_AVATAR_CHOICE_IDS.character,
        avatarUrl: 'https://cdn/face.png',
        character,
      }),
    ).toBeNull()
    expect(
      assistantGlyphLetterName({
        avatarChoice: ASSISTANT_AVATAR_CHOICE_IDS.mark,
        avatarUrl: null,
        character,
      }),
    ).toBeNull()
    expect(assistantGlyphLetterName(undefined)).toBeNull()
  })

  it('给了名字画字母、不画图标；没给照旧图标', () => {
    const { rerender } = render(
      <AssistantAvatarGlyph presetId={null} letterName="Denia" />,
    )
    expect(screen.getByTestId('assistant-avatar-glyph')).toHaveTextContent('DE')
    expect(document.querySelector('img')).toBeNull()
    rerender(<AssistantAvatarGlyph presetId={null} />)
    expect(document.querySelector('img')).not.toBeNull()
  })
})
