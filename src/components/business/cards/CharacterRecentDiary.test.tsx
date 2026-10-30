import { fireEvent, render, screen } from '@testing-library/react'
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
import { CharacterRecentDiary, buildDiary } from './CharacterRecentDiary'

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
    editJournal: vi.fn(async () => ({ ok: true as const })),
    removeJournal: vi.fn(async () => ({ ok: true as const })),
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

describe('CharacterRecentDiary（第 ③ 步）', () => {
  it('一天一块：日记在上，当天的小条挂在下面；只出门没写日记的那天只放小条；没有筛选条', () => {
    const days = buildDiary(growthOf(), [sticker('s1')])
    expect(days.map((day) => day.journals.length)).toEqual([0, 1, 0])
    expect(days[0]!.events.map((event) => event.kind)).toEqual([
      'opinion',
      'outing',
      'stickers',
    ])
    render(
      <CharacterRecentDiary
        stickers={stickersOf([sticker('s1')])}
        growth={hookOf(growthOf())}
      />,
    )
    expect(screen.getAllByTestId('character-diary-journal')).toHaveLength(1)
    expect(screen.getByText('数他叹了七口气。')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByText('filterAll')).toBeNull()
    // 调查折着，点开才看她记下的话
    expect(screen.queryByText('先铺冷色再压暖色。')).toBeNull()
    fireEvent.click(screen.getByText('wentOut|sourceBilibili · sourceDanbooru'))
    expect(screen.getByText('先铺冷色再压暖色。')).toBeTruthy()
  })

  it('日记能改：编辑框保存走 editJournal；删前先确认', async () => {
    const hook = hookOf(growthOf({ findings: [], opinions: [] }))
    render(<CharacterRecentDiary stickers={stickersOf()} growth={hook} />)
    fireEvent.click(screen.getByText('editJournal'))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '数他叹了八口气。' },
    })
    fireEvent.click(screen.getByText('editorSave'))
    await vi.waitFor(() =>
      expect(hook.editJournal).toHaveBeenCalledWith('j1', '数他叹了八口气。'),
    )
    fireEvent.click(screen.getByText('delete'))
    expect(hook.removeJournal).not.toHaveBeenCalled()
    expect(screen.getByText('deleteJournalTitle')).toBeTruthy()
  })

  it('改了自己：一行带撤回，点开看改前改后', () => {
    const hook = hookOf(
      growthOf({
        findings: [],
        opinions: [],
        revisions: [
          {
            id: 'r1',
            source: 'REFLECTION',
            fields: ['speech'],
            before: { speech: '慢吞吞' },
            after: { speech: '熟了会拖长音' },
            reason: null,
            revertedAt: null,
            createdAt: daysBack(1),
          },
        ],
      }),
    )
    render(<CharacterRecentDiary stickers={stickersOf()} growth={hook} />)
    expect(screen.queryByText('熟了会拖长音')).toBeNull()
    fireEvent.click(screen.getByText('changedField|speech'))
    expect(screen.getByText('熟了会拖长音')).toBeTruthy()
    fireEvent.click(screen.getByText('revert'))
    expect(hook.revert).toHaveBeenCalledWith('r1')
  })
})
