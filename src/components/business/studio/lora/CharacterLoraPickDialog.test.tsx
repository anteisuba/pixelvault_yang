import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterLoraGroup, LoraAssetRecord } from '@/types'

import { CharacterLoraPickDialog } from './CharacterLoraPickDialog'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
}))

const lora = (id: string, name: string): LoraAssetRecord => ({
  id,
  styleCode: `pv-${id}`,
  name,
  source: 'imported',
  type: 'subject',
  baseModelFamily: 'illustrious',
  provider: 'runner',
  triggerWord: 'trig',
  loraUrl: `https://cdn.test/${id}.safetensors`,
  coverImageUrl: null,
  previewImageUrls: [],
  defaultScale: 0.8,
  isPublic: false,
  isOwn: true,
  createdAt: '2026-10-22T00:00:00.000Z',
})

const group = (
  id: string,
  name: string,
  loras: LoraAssetRecord[],
): CharacterLoraGroup => ({
  characterCardId: id,
  name,
  coverUrl: null,
  appearanceTags: [],
  loras,
})

const NS = 'LoraWorkbench.characterLoras'

describe('CharacterLoraPickDialog', () => {
  it('只列收了 LoRA 的角色；点她 → 列出她的 LoRA → 点一个就挂', () => {
    const onPick = vi.fn()
    const denia = group('denia', 'Denia', [
      lora('a', 'Denia v1'),
      lora('b', 'Denia winter'),
    ])
    render(
      <CharacterLoraPickDialog
        open
        onOpenChange={vi.fn()}
        groups={[denia, group('ron', 'Ron', [])]}
        isLoading={false}
        isMounted={(id) => id === 'a'}
        onPick={onPick}
      />,
    )

    expect(screen.queryByText('Ron')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))

    const mounted = screen.getByRole('button', { name: /Denia v1/ })
    expect(mounted).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Denia winter/ }))
    expect(onPick).toHaveBeenCalledWith(denia, denia.loras[1])
  })

  it('没有角色收了 LoRA 时直说', () => {
    render(
      <CharacterLoraPickDialog
        open
        onOpenChange={vi.fn()}
        groups={[group('ron', 'Ron', [])]}
        isLoading={false}
        isMounted={() => false}
        onPick={vi.fn()}
      />,
    )
    expect(screen.getByText(`${NS}:emptyCharacters`)).toBeInTheDocument()
  })
})
