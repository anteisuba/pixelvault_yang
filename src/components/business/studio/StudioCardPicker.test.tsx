import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'

import { StudioCardPicker } from './StudioCardPicker'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/hooks/cards/use-character-card-usage', () => ({
  useCharacterCardUsage: () => ({
    generations: [
      { id: 'gen-9', url: 'https://cdn.test/made.png', thumbnailUrl: null },
    ],
    total: 1,
    isLoading: false,
  }),
}))

const setImagePicks = vi.fn()
const toggleCardSelection = vi.fn()
let data: Record<string, unknown>
vi.mock('@/contexts/studio-context', () => ({
  useStudioData: () => data,
}))

const DENIA = {
  id: 'denia',
  name: 'Denia',
  sourceImageUrl: 'https://cdn.test/1.png',
  createdAt: new Date(0),
  cardTags: { character: [], appearance: [], loraTrigger: '' },
  workOverride: '鸣潮',
  referenceSlots: [
    {
      id: 'slot-1',
      role: 'identity',
      url: 'https://cdn.test/1.png',
      isPrimary: true,
    },
    {
      id: 'slot-2',
      role: 'identity',
      url: 'https://cdn.test/2.png',
      isPrimary: false,
    },
  ],
}

function setup(overrides: {
  maxImages?: number
  references?: string[]
  activeCardIds?: string[]
  imagePicks?: Record<string, unknown[]>
}) {
  data = {
    characters: {
      cards: [DENIA],
      isLoading: false,
      activeCardIds: overrides.activeCardIds ?? [],
      imagePicks: overrides.imagePicks ?? {},
      setImagePicks,
      toggleCardSelection,
      setActiveCardIds: vi.fn(),
    },
    projects: { history: [] },
    imageUpload: {
      maxImages: overrides.maxImages ?? 4,
      referenceImages: overrides.references ?? [],
    },
  }
  render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <StudioCardPicker />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('StudioCardPicker（工作台「角色」弹层，owner 09-27）', () => {
  it('只剩角色：没有画风卡 / 背景卡页签', () => {
    setup({})
    expect(screen.getByText('角色')).toBeTruthy()
    expect(screen.queryByText('画风卡')).toBeNull()
    expect(screen.queryByText('背景卡')).toBeNull()
  })

  it('点开一个角色：展开她的图（卡上 + 用她出的），第一次默认勾主图', () => {
    setup({})
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    expect(screen.getAllByTestId('card-picker-image')).toHaveLength(3)
    expect(setImagePicks).toHaveBeenCalledWith('denia', [{ slotId: 'slot-1' }])
  })

  it('勾一张「用她出的」就加进她挑的图里', () => {
    setup({
      activeCardIds: ['denia'],
      imagePicks: { denia: [{ slotId: 'slot-1' }] },
    })
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    fireEvent.click(screen.getAllByTestId('card-picker-image')[2]!)
    expect(setImagePicks).toHaveBeenLastCalledWith('denia', [
      { slotId: 'slot-1' },
      { generationId: 'gen-9' },
    ])
  })

  it('到了模型上限（含自己挂的参考图），没勾的格子勾不上并写明原因', () => {
    setup({
      maxImages: 2,
      references: ['https://x.test/own.png'],
      activeCardIds: ['denia'],
      imagePicks: { denia: [{ slotId: 'slot-1' }] },
    })
    expect(screen.getByTestId('card-picker-limit').textContent).toContain(
      '最多收 2 张',
    )
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    const tiles = screen.getAllByTestId('card-picker-image')
    expect(tiles[1]).toBeDisabled()
    expect(screen.getByText('已到这个模型的上限，先取消一张再勾')).toBeTruthy()
  })

  it('模型不收参考图：不展开，点一下只让她在场', () => {
    setup({ maxImages: 0 })
    expect(screen.getByTestId('card-picker-limit').textContent).toContain(
      '不收参考图',
    )
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    expect(toggleCardSelection).toHaveBeenCalledWith('denia')
    expect(screen.queryByTestId('card-picker-image')).toBeNull()
  })
})
