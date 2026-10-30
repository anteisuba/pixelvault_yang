import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CharacterCardRecord,
  CharacterLoraGroup,
  LoraAssetRecord,
} from '@/types'
import type { LoraPickCollect } from '@/components/business/studio/lora/library/LoraPickerDialog'

vi.mock('next-intl', () => {
  const t = (key: string) => key
  return { useTranslations: () => t }
})

const setLoraCharacters = vi.fn(async () => true)
let groups: CharacterLoraGroup[] = []
vi.mock('@/hooks/cards/use-character-loras', () => ({
  useCharacterLoras: () => ({ groups, isLoading: false, setLoraCharacters }),
}))

let collect: LoraPickCollect | undefined
vi.mock('@/components/business/studio/lora/library/LoraPickerDialog', () => ({
  LoraPickerDialog: (props: { collect?: LoraPickCollect }) => {
    collect = props.collect
    return null
  },
}))

import { CharacterLoraGrid } from './CharacterLoraGrid'

const lora = (patch: Partial<LoraAssetRecord>) =>
  ({
    id: 'l1',
    name: 'Denia',
    loraUrl: 'https://civitai.com/api/download/models/1',
    baseModelFamily: 'Illustrious',
    coverImageUrl: null,
    triggerWord: '',
    type: 'style',
    provider: 'civitai',
    ...patch,
  }) as LoraAssetRecord

const group = (
  id: string,
  loras: (LoraAssetRecord & { lookId: string | null })[],
): CharacterLoraGroup => ({
  characterCardId: id,
  name: id,
  coverUrl: null,
  looks: [],
  loras,
})

const card = { id: 'her', looks: [] } as unknown as CharacterCardRecord

describe('CharacterLoraGrid（她页 LoRA 页签，第 ⑧ 步）', () => {
  beforeEach(() => {
    setLoraCharacters.mockClear()
    groups = [
      group('her', [{ ...lora({}), lookId: null }]),
      group('other', [{ ...lora({}), lookId: 'look-x' }]),
    ]
  })

  it('卸下只拿掉她那一条，别的角色原样带回', async () => {
    render(<CharacterLoraGrid card={card} />)
    expect(screen.getByText('Denia')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'unloadLoraLabel' }))
    await waitFor(() => expect(setLoraCharacters).toHaveBeenCalledTimes(1))
    expect(setLoraCharacters.mock.calls[0]).toEqual([
      expect.objectContaining({ loraUrl: lora({}).loraUrl }),
      [{ characterCardId: 'other', lookId: 'look-x' }],
    ])
  })

  it('挑选框圈的加给她（通用），已有的主人留着', async () => {
    render(<CharacterLoraGrid card={card} />)
    expect(collect?.mounted).toHaveLength(1)
    const fresh = lora({ id: 'l2', loraUrl: 'https://x.test/2.safetensors' })
    await collect!.onConfirm([fresh])
    expect(setLoraCharacters).toHaveBeenCalledWith(
      expect.objectContaining({ loraUrl: fresh.loraUrl }),
      [{ characterCardId: 'her', lookId: null }],
    )
  })
})
