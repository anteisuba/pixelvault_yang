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

const look = (id: string, label: string | null, isDefault: boolean) => ({
  id,
  label,
  isDefault,
  tags: [],
})

const group = (
  id: string,
  name: string,
  looks = [look(`${id}-look`, null, true)],
): CharacterLoraGroup => ({
  characterCardId: id,
  name,
  coverUrl: null,
  looks,
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
      expect(value.setLoraCharacters).toHaveBeenCalledWith(LORA, [
        { characterCardId: 'denia', lookId: null },
      ]),
    )
  })

  it('她有几套造型：勾上后可挂到某一套（默认全部造型通用）', async () => {
    const denia = group('denia', 'Denia', [
      look('denia-main', null, true),
      look('denia-q', 'Q版', false),
    ])
    const value = renderSection({ groups: [denia] })

    fireEvent.click(screen.getByText(`${NS}:addToCharacter`))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Denia' }))
    expect(
      screen.getByRole('button', { name: 'CharacterLooks:allLooks' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Q版' }))
    fireEvent.click(screen.getByText(`${NS}:save`))

    await waitFor(() =>
      expect(value.setLoraCharacters).toHaveBeenCalledWith(LORA, [
        { characterCardId: 'denia', lookId: 'denia-q' },
      ]),
    )
  })

  it('按下载链接认它属于哪些角色', () => {
    const charactersOf = vi.fn(() => [group('ron', 'Ron')])
    renderSection({ charactersOf })

    expect(charactersOf).toHaveBeenCalledWith(LORA.loraUrl)
    expect(screen.getByText('Ron')).toBeTruthy()
  })
})
