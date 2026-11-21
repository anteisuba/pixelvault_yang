import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterLoraGroup } from '@/types'

import { CharacterLoraPickDialog } from './CharacterLoraPickDialog'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
}))

const lora = (
  id: string,
  name: string,
): CharacterLoraGroup['loras'][number] => ({
  lookId: null,
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
  loras: CharacterLoraGroup['loras'],
): CharacterLoraGroup => ({
  characterCardId: id,
  name,
  coverUrl: null,
  looks: [{ id: `${id}-look`, label: null, isDefault: true, tags: [] }],
  loras,
})

const NS = 'LoraWorkbench.characterLoras'

const base = {
  open: true,
  onOpenChange: vi.fn(),
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
  isMounted: () => false,
  onPick: vi.fn(),
}

describe('CharacterLoraPickDialog', () => {
  it('只列收了 LoRA 的角色；点她 → 列出她的 LoRA → 点一个就挂', () => {
    const onPick = vi.fn()
    const denia = group('denia', 'Denia', [
      lora('a', 'Denia v1'),
      lora('b', 'Denia winter'),
    ])
    render(
      <CharacterLoraPickDialog
        {...base}
        groups={[denia, group('ron', 'Ron', [])]}
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

  it('没有角色收了 LoRA 时直说，并说去哪加', () => {
    render(
      <CharacterLoraPickDialog {...base} groups={[group('ron', 'Ron', [])]} />,
    )
    expect(screen.getByText(`${NS}:emptyCharacters`)).toBeInTheDocument()
    expect(screen.getByText(`${NS}:emptyCharactersHint`)).toBeInTheDocument()
  })

  it('首屏在拿：同形灰块（⛔ 转圈）；没读出来：一句话 + 重试', () => {
    const { rerender } = render(
      <CharacterLoraPickDialog {...base} groups={[]} isLoading />,
    )
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    const onRetry = vi.fn()
    rerender(
      <CharacterLoraPickDialog
        {...base}
        groups={[]}
        error="没读出来"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('没读出来')
    fireEvent.click(screen.getByRole('button', { name: 'Feedback:retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('条目多（≥8 位）才摆搜索：前端筛名字 / 她收的 LoRA 名；搜不到回显 + 清除', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      group(`c${index}`, `Char${index}`, [lora(`l${index}`, `Lora${index}`)]),
    )
    render(<CharacterLoraPickDialog {...base} groups={many} />)
    const box = screen.getByRole('searchbox', {
      name: `${NS}:searchPlaceholder`,
    })
    fireEvent.change(box, { target: { value: 'lora3' } })
    expect(screen.getByRole('button', { name: /Char3/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Char4/ })).toBeNull()

    fireEvent.change(box, { target: { value: 'zzz' } })
    expect(
      screen.getByText(`${NS}:searchEmpty:${JSON.stringify({ query: 'zzz' })}`),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `${NS}:clearSearch` }))
    expect(screen.getByRole('button', { name: /Char4/ })).toBeInTheDocument()
  })

  it('人少时不摆搜索', () => {
    render(
      <CharacterLoraPickDialog
        {...base}
        groups={[group('denia', 'Denia', [lora('a', 'Denia v1')])]}
      />,
    )
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})
