import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterGrowth } from '@/types/character-growth'
import type { CharacterStickerRecord } from '@/types/character-sticker'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => false
  return {
    useTranslations: () => t,
    useFormatter: () => ({ dateTime: () => '09:10' }),
  }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorModelChip',
  () => ({
    StudioOperatorModelChip: ({ value }: { value: string }) => (
      <span data-testid="model-chip">{value}</span>
    ),
  }),
)
vi.mock('@/hooks/cards', () => ({
  useCharacterGrowth: vi.fn(),
  useCharacterStickers: vi.fn(),
}))
vi.mock('@/hooks/use-chat-persona', () => ({ usePersonaSwitch: vi.fn() }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { CharacterRecent } from './CharacterRecent'

const now = new Date()
const today = (hour: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).toISOString()
const daysBack = (days: number) =>
  new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - days,
    9,
  ).toISOString()

const grok = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.XAI,
)!
const claude = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.ANTHROPIC,
)!

function growthOf(patch: Partial<CharacterGrowth> = {}): CharacterGrowth {
  return {
    journals: [{ id: 'j1', text: '数他叹了七口气。', createdAt: daysBack(1) }],
    revisions: [],
    findings: [
      {
        id: 'f1',
        source: 'bilibili',
        url: 'https://www.bilibili.com/video/BV1',
        title: '水彩叠色',
        note: '先铺冷色再压暖色。',
        seenAt: today(9),
      },
      {
        id: 'f2',
        source: 'danbooru',
        url: 'https://danbooru.donmai.us/posts/1',
        title: '透明伞',
        note: '透明的伞我想要。',
        seenAt: today(9),
      },
      {
        id: 'f3',
        source: 'civitai',
        url: 'https://civitai.com/models/1',
        title: '水彩 LoRA',
        note: '人脸有点糊。',
        seenAt: daysBack(2),
      },
    ],
    opinions: [{ id: 'o1', text: '厚涂更适合画雨天。', createdAt: today(10) }],
    browse: {
      enabled: true,
      model: claude.modelId,
      pausedReason: null,
      browsedAt: today(9),
    },
    ...patch,
  }
}

function hookOf(growth: CharacterGrowth) {
  return {
    growth,
    isLoading: false,
    error: null,
    revertingId: null,
    revert: vi.fn(),
    reload: vi.fn(),
    setBrowse: vi.fn(async () => ({ ok: true as const })),
    goingOut: false,
    goOutNow: vi.fn(async () => {}),
    removeFinding: vi.fn(async () => ({ ok: true as const })),
    editOpinion: vi.fn(async () => ({ ok: true as const })),
    removeOpinion: vi.fn(async () => ({ ok: true as const })),
  }
}

function stickersOf(rows: CharacterStickerRecord[] = []) {
  return {
    stickers: rows,
    setBlocked: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    upload: vi.fn(async () => ({ ok: true as const })),
  }
}

const sticker = (
  id: string,
  patch: Partial<CharacterStickerRecord> = {},
): CharacterStickerRecord => ({
  id,
  url: `https://cdn.example/${id}.png`,
  sourceUrl: null,
  whenToUse: '开心的时候',
  isBlocked: false,
  fromCreator: false,
  createdAt: today(9),
  sentAt: null,
  ...patch,
})

describe('CharacterRecent', () => {
  it('同一天的见闻折成一趟出门：最新一趟展开，更早的折着、点开才看', () => {
    render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={hookOf(growthOf())}
        reducedMotion
      />,
    )
    expect(screen.getByText('先铺冷色再压暖色。')).toBeTruthy()
    expect(screen.getByText('透明的伞我想要。')).toBeTruthy()
    expect(screen.queryByText('人脸有点糊。')).toBeNull()
    fireEvent.click(screen.getByText('wentOut|sourceCivitai'))
    expect(screen.getByText('人脸有点糊。')).toBeTruthy()
    expect(screen.getByText('opinionText|厚涂更适合画雨天。')).toBeTruthy()
    expect(screen.getByText('数他叹了七口气。')).toBeTruthy()
  })

  it('状态行写「今天几点出门 · 带回几条」，一条没带回就直说', () => {
    const { unmount } = render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={hookOf(growthOf())}
        reducedMotion
      />,
    )
    expect(
      screen.getByText('daily · outToday|09:10 · broughtBack|2'),
    ).toBeTruthy()
    unmount()
    render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={hookOf(
          growthOf({
            browse: { ...growthOf().browse, browsedAt: today(11) },
          }),
        )}
        reducedMotion
      />,
    )
    expect(
      screen.getByText('daily · outToday|09:10 · broughtNothing'),
    ).toBeTruthy()
  })

  it('删见闻先弹确认，确认了才删', () => {
    const hook = hookOf(growthOf({ opinions: [] }))
    render(
      <CharacterRecent stickers={stickersOf()} growth={hook} reducedMotion />,
    )
    fireEvent.click(screen.getAllByText('delete')[0])
    expect(hook.removeFinding).not.toHaveBeenCalled()
    expect(screen.getByText('deleteFindingTitle')).toBeTruthy()
  })

  it('X 只在出门用 Grok 时出现；出不了门写原因 + 换一个型号', () => {
    const { unmount } = render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={hookOf(growthOf())}
        reducedMotion
      />,
    )
    expect(screen.queryByText('sourceX')).toBeNull()
    unmount()
    render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={hookOf(
          growthOf({
            browse: {
              enabled: true,
              model: grok.modelId,
              pausedReason: 'missing_key',
              browsedAt: today(9),
            },
          }),
        )}
        reducedMotion
      />,
    )
    expect(screen.getByText('sourceX')).toBeTruthy()
    expect(screen.getByText(`paused.missing_key|${grok.label}`)).toBeTruthy()
    expect(screen.getByText('changeModel')).toBeTruthy()
  })

  it('打开出门开关就马上出门一趟；出门中状态行写「正在出门」', async () => {
    const hook = hookOf(
      growthOf({
        browse: {
          enabled: false,
          model: null,
          pausedReason: null,
          browsedAt: null,
        },
      }),
    )
    const { unmount } = render(
      <CharacterRecent stickers={stickersOf()} growth={hook} reducedMotion />,
    )
    fireEvent.click(screen.getByRole('switch', { name: 'goOut' }))
    await waitFor(() => expect(hook.goOutNow).toHaveBeenCalledTimes(1))
    expect(hook.setBrowse).toHaveBeenCalledWith({ enabled: true })
    unmount()
    render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={{
          ...hookOf(
            growthOf({
              browse: {
                enabled: true,
                model: claude.modelId,
                pausedReason: null,
                browsedAt: null,
              },
            }),
          ),
          goingOut: true,
        }}
        reducedMotion
      />,
    )
    expect(screen.getByText('daily · goingOut')).toBeTruthy()
  })

  it('出门关着又没见闻：空态卡；型号行不出', () => {
    render(
      <CharacterRecent
        stickers={stickersOf()}
        growth={hookOf(
          growthOf({
            findings: [],
            browse: {
              enabled: false,
              model: null,
              pausedReason: null,
              browsedAt: null,
            },
          }),
        )}
        reducedMotion
      />,
    )
    expect(screen.getByText('neverOutTitle')).toBeTruthy()
    expect(screen.queryByTestId('model-chip')).toBeNull()
  })

  it('她逛来的表情在「全部」里按天一条，点一张拉黑；你上传的不进河', () => {
    const rows = stickersOf([
      sticker('s1'),
      sticker('s2', { fromCreator: true }),
    ])
    render(
      <CharacterRecent
        growth={hookOf(growthOf())}
        stickers={rows}
        reducedMotion
      />,
    )
    expect(screen.getByText('gotStickers|1')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('blockSticker'))
    expect(rows.setBlocked).toHaveBeenCalledWith('s1', true)
  })

  it('筛到「表情」：整格表情（含你上传的）+ 上传那一格 + 张数', () => {
    render(
      <CharacterRecent
        growth={hookOf(growthOf())}
        stickers={stickersOf([
          sticker('s1', { isBlocked: true }),
          sticker('s2', { fromCreator: true }),
        ])}
        reducedMotion
      />,
    )
    fireEvent.click(screen.getByText('filterStickers'))
    expect(screen.getByText('stickersTitle')).toBeTruthy()
    expect(screen.getByText('uploadSticker')).toBeTruthy()
    expect(screen.getByText('2 / 30')).toBeTruthy()
    expect(screen.getByLabelText('unblockSticker')).toBeTruthy()
    expect(screen.getByLabelText('blockSticker')).toBeTruthy()
  })
})
