import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  characterCardFixture,
  fakeStudioServer,
  renderWithStudio,
  resetCharacterCardsCache,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioCardPicker } from './StudioCardPicker'
import { StudioCharacterReferenceStrip } from './StudioCharacterReferenceStrip'

/**
 * 输入框里「角色带进来的图」：全程真工作台（真 `useStudioRunModels`、真编译器预演）。
 * 用 NovelAI V4.5：默认只带文字；开了精确参考 = 带她造型的主图一张。
 */

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn() }),
}))

const ok = (data: unknown) => Response.json({ success: true, data })

const DENIA = characterCardFixture({
  id: 'denia',
  name: 'Denia',
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
      ],
    },
  ],
})

beforeEach(() => {
  resetCharacterCardsCache()
  fakeStudioServer()
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => ok([DENIA]))
    .on('GET', `${API_ENDPOINTS.CHARACTER_CARDS}/:id/generations`, () =>
      ok({ generations: [], total: 0, hasMore: false }),
    )
})
afterEach(() => vi.unstubAllGlobals())

async function setup(modelId: string = AI_MODELS.NOVELAI_V45_FULL) {
  const view = renderWithStudio(
    <>
      <StudioCharacterReferenceStrip />
      <StudioCardPicker />
    </>,
  )
  await screen.findByRole('button', { name: /Denia/ })
  act(() => {
    const { dispatch, characters } = view.studio.current
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
    characters.setActiveCardIds(['denia'])
  })
  return view.studio as { current: StudioHandle }
}

describe('StudioCharacterReferenceStrip（输入框里角色带进来的图）', () => {
  it('NovelAI 默认只带文字：出一颗「只带文字」名字胶囊，× = 这次不带她', async () => {
    const studio = await setup()
    const strip = await screen.findByTestId('studio-character-strip')
    expect(within(strip).getByText('只带文字')).toBeTruthy()
    expect(
      within(strip).queryByTestId('studio-character-strip-image'),
    ).toBeNull()
    fireEvent.click(
      within(strip).getByRole('button', { name: '这次不带 Denia' }),
    )
    expect(studio.current.characters.activeCardIds).toEqual([])
    await waitFor(() =>
      expect(screen.queryByTestId('studio-character-strip')).toBeNull(),
    )
  })

  it('V4.5 才出精确参考开关；开了 = 带她主图一张（标着她的名字），× 拿掉 = 她不在场', async () => {
    const studio = await setup()
    fireEvent.click(screen.getByRole('switch'))
    expect(studio.current.characters.novelAiPreciseReference).toBe(true)
    const image = await screen.findByTestId('studio-character-strip-image')
    expect(within(image).getByRole('img').getAttribute('src')).toBe(
      'https://cdn.test/1.png',
    )
    expect(within(image).getByText('Denia')).toBeTruthy()
    fireEvent.click(
      within(image).getByRole('button', { name: '这次不带 Denia 的这张图' }),
    )
    expect(studio.current.characters.activeCardIds).toEqual([])
  })

  it('V5 没有精确参考：不出开关', async () => {
    await setup(AI_MODELS.NOVELAI_V5_FULL)
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
