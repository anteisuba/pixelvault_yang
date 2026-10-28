import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterGrowth } from '@/types/character-growth'

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
vi.mock('@/hooks/cards', () => ({ useCharacterGrowth: vi.fn() }))
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
    removeFinding: vi.fn(async () => ({ ok: true as const })),
    editOpinion: vi.fn(async () => ({ ok: true as const })),
    removeOpinion: vi.fn(async () => ({ ok: true as const })),
  }
}

describe('CharacterRecent', () => {
  it('同一天的见闻折成一趟出门：最新一趟展开，更早的折着、点开才看', () => {
    render(<CharacterRecent growth={hookOf(growthOf())} reducedMotion />)
    expect(screen.getByText('先铺冷色再压暖色。')).toBeTruthy()
    expect(screen.getByText('透明的伞我想要。')).toBeTruthy()
    expect(screen.queryByText('人脸有点糊。')).toBeNull()
    fireEvent.click(screen.getByText('wentOut|sourceCivitai'))
    expect(screen.getByText('人脸有点糊。')).toBeTruthy()
    expect(screen.getByText('opinionText|厚涂更适合画雨天。')).toBeTruthy()
    expect(screen.getByText('数他叹了七口气。')).toBeTruthy()
  })

  it('删见闻先弹确认，确认了才删', () => {
    const hook = hookOf(growthOf({ opinions: [] }))
    render(<CharacterRecent growth={hook} reducedMotion />)
    fireEvent.click(screen.getAllByText('delete')[0])
    expect(hook.removeFinding).not.toHaveBeenCalled()
    expect(screen.getByText('deleteFindingTitle')).toBeTruthy()
  })

  it('X 只在出门用 Grok 时出现；出不了门写原因 + 换一个型号', () => {
    const { unmount } = render(
      <CharacterRecent growth={hookOf(growthOf())} reducedMotion />,
    )
    expect(screen.queryByText('sourceX')).toBeNull()
    unmount()
    render(
      <CharacterRecent
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

  it('出门关着又没见闻：空态卡；型号行不出', () => {
    render(
      <CharacterRecent
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
})
