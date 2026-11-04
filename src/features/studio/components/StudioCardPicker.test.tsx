import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'

import { API_ENDPOINTS } from '@/constants/config'
import type { CharacterImagePick } from '@/types'
import {
  characterCardFixture,
  fakeStudioServer,
  renderWithStudio,
  resetCharacterCardsCache,
} from '@/test/studio-harness'

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
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))

const ok = (data: unknown) => Response.json({ success: true, data })

const DENIA = characterCardFixture({
  id: 'denia',
  name: 'Denia',
  createdAt: new Date(0),
  workOverride: '鸣潮',
  summary: null,
  tavern: null,
  looks: [
    {
      id: 'denia-main',
      label: null,
      isDefault: true,
      description: null,
      tags: [],
      referenceSlots: [
        {
          id: 'slot-1',
          role: 'identity' as const,
          url: 'https://cdn.test/1.png',
          isPrimary: true,
        },
        {
          id: 'slot-2',
          role: 'identity' as const,
          url: 'https://cdn.test/2.png',
          isPrimary: false,
        },
      ],
    },
    {
      id: 'denia-q',
      label: 'Q版',
      isDefault: false,
      description: null,
      tags: [],
      referenceSlots: [
        {
          id: 'slot-q',
          role: 'identity' as const,
          url: 'https://cdn.test/q.png',
          isPrimary: true,
        },
      ],
    },
  ],
})

beforeEach(() => {
  resetCharacterCardsCache()
  // 只假网络：角色列表只有 Denia；「用她出的」有一张。
  fakeStudioServer()
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => ok([DENIA]))
    .on('GET', `${API_ENDPOINTS.CHARACTER_CARDS}/:id/generations`, () =>
      ok({
        generations: [
          { id: 'gen-9', url: 'https://cdn.test/made.png', thumbnailUrl: null },
        ],
        total: 1,
        hasMore: false,
      }),
    )
})
afterEach(() => vi.unstubAllGlobals())

/** 真工作台里挂选择器，等角色列表回来，再用真 hook 摆好在场 / 造型 / 挑图 / 上限。 */
async function setup(overrides: {
  maxImages?: number
  references?: string[]
  activeCardIds?: string[]
  imagePicks?: Record<string, CharacterImagePick[]>
  lookIds?: Record<string, string>
}) {
  const view = renderWithStudio(<StudioCardPicker />)
  await screen.findByRole('button', { name: /Denia/ })
  act(() => {
    const { characters, imageUpload } = view.studio.current
    imageUpload.setMaxImages(overrides.maxImages ?? 4)
    for (const url of overrides.references ?? [])
      imageUpload.addReferenceImage(url)
    characters.setActiveCardIds(overrides.activeCardIds ?? [])
    for (const [id, lookId] of Object.entries(overrides.lookIds ?? {}))
      characters.setLookId(id, lookId)
    for (const [id, picks] of Object.entries(overrides.imagePicks ?? {}))
      characters.setImagePicks(id, picks)
  })
  return view.studio
}

function waitForTiles(count: number) {
  return waitFor(() =>
    expect(screen.getAllByTestId('card-picker-image')).toHaveLength(count),
  )
}

describe('StudioCardPicker（工作台「角色」弹层，owner 09-27）', () => {
  it('只剩角色：没有画风卡 / 背景卡页签', async () => {
    await setup({})
    expect(screen.getByText('角色')).toBeTruthy()
    expect(screen.queryByText('画风卡')).toBeNull()
    expect(screen.queryByText('背景卡')).toBeNull()
  })

  it('点开一个角色：展开她的图（卡上 + 用她出的），第一次默认勾主图', async () => {
    const studio = await setup({})
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    // 卡上 2 张 + 用她出的 1 张（真用量 hook 拉回来的）。
    await waitForTiles(3)
    expect(studio.current.characters.imagePicks.denia).toEqual([
      { slotId: 'slot-1' },
    ])
  })

  it('勾一张「用她出的」就加进她挑的图里', async () => {
    const studio = await setup({
      activeCardIds: ['denia'],
      imagePicks: { denia: [{ slotId: 'slot-1' }] },
    })
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    // 等「用她出的」那张也回来（第 3 格）再勾。
    await waitForTiles(3)
    fireEvent.click(screen.getAllByTestId('card-picker-image')[2]!)
    expect(studio.current.characters.imagePicks.denia).toEqual([
      { slotId: 'slot-1' },
      { generationId: 'gen-9' },
    ])
  })

  it('到了模型上限（含自己挂的参考图），没勾的格子勾不上并写明原因', async () => {
    await setup({
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

  it('模型不收参考图：不展开，点一下只让她在场', async () => {
    const studio = await setup({ maxImages: 0 })
    expect(screen.getByTestId('card-picker-limit').textContent).toContain(
      '不收参考图',
    )
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    expect(studio.current.characters.activeCardIds).toEqual(['denia'])
    expect(screen.queryByTestId('card-picker-image')).toBeNull()
  })

  it('切造型（角色④）：记下她用哪套，挑的图换成那套的主图', async () => {
    const studio = await setup({
      activeCardIds: ['denia'],
      imagePicks: { denia: [{ slotId: 'slot-1' }, { slotId: 'slot-2' }] },
    })
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Q版' }))
    expect(studio.current.characters.lookIds.denia).toBe('denia-q')
    expect(studio.current.characters.imagePicks.denia).toEqual([
      { slotId: 'slot-q' },
    ])
  })

  it('选着别的造型：图格只列那套的图，名字下面写出造型名', async () => {
    await setup({ activeCardIds: ['denia'], lookIds: { denia: 'denia-q' } })
    expect(screen.getByRole('button', { name: /Q版/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Denia/ }))
    // 这套 1 张 + 用她出的 1 张。
    await waitForTiles(2)
  })
})
