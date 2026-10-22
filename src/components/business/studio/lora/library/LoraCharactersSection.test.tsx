import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { UseCharacterLorasReturn } from '@/hooks/cards/use-character-loras'
import type { CharacterLoraGroup, FavoriteLoraRequest } from '@/types'
import { CharacterLorasProvider } from '@/components/business/studio/lora/character-loras-context'

import { LoraCharactersSection } from './LoraCharactersSection'

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}:${key}`,
}))

const NS = 'LoraWorkbench.characterLoras'

const LORA: FavoriteLoraRequest = {
  name: 'Denia',
  triggerWord: 'denia',
  loraUrl: 'https://civitai.com/api/download/models/1',
  type: 'subject',
  baseModelFamily: 'sdxl',
  provider: 'civitai',
}

const group = (id: string, name: string): CharacterLoraGroup => ({
  characterCardId: id,
  name,
  coverUrl: null,
  appearanceTags: [],
  loras: [],
})

function renderSection(overrides: Partial<UseCharacterLorasReturn> = {}) {
  const value: UseCharacterLorasReturn = {
    groups: [group('denia', 'Denia'), group('ron', 'Ron')],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    charactersOf: () => [],
    setLoraCharacters: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  render(
    <CharacterLorasProvider value={value}>
      <LoraCharactersSection lora={LORA} titleClassName="" />
    </CharacterLorasProvider>,
  )
  return value
}

describe('LoraCharactersSection', () => {
  it('没收藏的 LoRA 也能加到角色：带上整份描述交给服务端', async () => {
    const value = renderSection()

    fireEvent.click(screen.getByText(`${NS}:addToCharacter`))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Denia' }))
    fireEvent.click(screen.getByText(`${NS}:save`))

    await waitFor(() =>
      expect(value.setLoraCharacters).toHaveBeenCalledWith(LORA, ['denia']),
    )
  })

  it('按下载链接认它属于哪些角色', () => {
    const charactersOf = vi.fn(() => [group('ron', 'Ron')])
    renderSection({ charactersOf })

    expect(charactersOf).toHaveBeenCalledWith(LORA.loraUrl)
    expect(screen.getByText('Ron')).toBeTruthy()
  })
})
