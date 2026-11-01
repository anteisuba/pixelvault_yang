import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  CharacterGrowth,
  CharacterOutingRun,
} from '@/types/character-growth'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => false
  return {
    useTranslations: () => t,
    useFormatter: () => ({ dateTime: () => '10月28日' }),
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
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { OutingCard } from './CharacterOutingCard'

const grok = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.XAI,
)!
const gemini = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.GEMINI,
)!

const now = new Date()
const yesterday = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - 1,
  9,
).toISOString()

const run = (patch: Partial<CharacterOutingRun> = {}): CharacterOutingRun => ({
  id: 'r1',
  status: 'DONE',
  model: grok.modelId,
  sources: ['bilibili'],
  sites: ['pixiv.net'],
  videos: [],
  pinnedVideos: [],
  budgetPoints: 60,
  usedTokens: 300_000,
  kept: 3,
  nowLabel: null,
  endReason: 'budget',
  startedAt: yesterday,
  endedAt: yesterday,
  ...patch,
})

function hookOf(outing: CharacterGrowth['outing']) {
  return {
    growth: {
      journals: [],
      revisions: [],
      findings: [],
      opinions: [],
      outing,
    },
    isLoading: false,
    error: null,
    revertingId: null,
    revert: vi.fn(),
    reload: vi.fn(),
    startOuting: vi.fn(async () => ({ ok: true as const })),
    stopOuting: vi.fn(async () => ({ ok: true as const })),
    removeFinding: vi.fn(),
    editOpinion: vi.fn(),
    removeOpinion: vi.fn(),
    editJournal: vi.fn(),
    removeJournal: vi.fn(),
  }
}

describe('OutingCard', () => {
  it('没出门：「上次调查：昨天」+「出门调查」；弹框记住上次的模型、来源、网址和额度', async () => {
    const hook = hookOf({
      running: null,
      recent: [run()],
      frequentSites: ['pixiv.net', 'zhihu.com'],
    })
    render(<OutingCard growth={hook} />)
    expect(screen.getByText('lastOut|yesterday')).toBeTruthy()
    fireEvent.click(screen.getByText('title'))
    expect(screen.getByTestId('model-chip').textContent).toBe(grok.modelId)
    // Grok 才有 X；她常去的网址也列出来。
    expect(screen.getByText('sourceX')).toBeTruthy()
    expect(screen.getByText('zhihu.com')).toBeTruthy()
    expect(
      screen
        .getByText('pixiv.net')
        .closest('button')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText('articles|40')).toBeTruthy()
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith({
        model: grok.modelId,
        sources: ['bilibili'],
        sites: ['pixiv.net'],
        videos: [],
        pinnedVideos: [],
        budgetPoints: 10,
      }),
    )
  })

  it('点「自动」清掉来源和网址；自定点数夹在上下限之间', async () => {
    const hook = hookOf({ running: null, recent: [run()], frequentSites: [] })
    render(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.click(screen.getByText('auto'))
    fireEvent.click(screen.getByText('custom'))
    fireEvent.change(screen.getByLabelText('customLabel'), {
      target: { value: '999' },
    })
    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.objectContaining({ sources: [], sites: [], budgetPoints: 200 }),
      ),
    )
  })

  it('看视频（第 ⑥ 步）：只列选中且能看视频的来源，开关旁常驻提示；贴视频链接 = 指定视频', async () => {
    const hook = hookOf({
      running: null,
      recent: [run({ model: gemini.modelId, sources: [], sites: [] })],
      frequentSites: [],
    })
    render(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    // 自动 = 全部来源：B 站、YouTube 有开关（Gemini 没有 X）。
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(2)
    expect(screen.getByText('hint.bilibiliOff')).toBeTruthy()
    expect(screen.getByText('hint.youtubeOff')).toBeTruthy()
    fireEvent.click(switches[0]!)
    expect(screen.getByText('hint.bilibiliWatch')).toBeTruthy()

    fireEvent.click(screen.getByText('addSite'))
    const input = screen.getByLabelText('addSite')
    fireEvent.change(input, {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ 3:00-5:00' },
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('character-outing-pinned').textContent).toContain(
      '3:00-5:00',
    )
    expect(screen.getByText('pinnedHint')).toBeTruthy()

    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: [],
          sites: [],
          videos: ['bilibili'],
          pinnedVideos: [
            {
              platform: 'youtube',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              start: 180,
              end: 300,
            },
          ],
        }),
      ),
    )
  })

  it('别家模型：YouTube 开关灰着（换 Gemini 才能看）', () => {
    const hook = hookOf({ running: null, recent: [run()], frequentSites: [] })
    render(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.click(screen.getByText('auto'))
    expect(screen.getByText('hint.youtubeNeedsGemini')).toBeTruthy()
    expect(screen.getByText('hint.xOff')).toBeTruthy()
  })

  it('调查中：在看什么 · 用了几点 / 共几点 ·「结束」', () => {
    const hook = hookOf({
      running: run({
        status: 'RUNNING',
        endedAt: null,
        endReason: null,
        budgetPoints: 30,
        usedTokens: 120_000,
        nowLabel: 'bilibili\n古籍修复',
      }),
      recent: [],
      frequentSites: [],
    })
    render(<OutingCard growth={hook} />)
    expect(screen.getByText('looking|sourceBilibili,古籍修复')).toBeTruthy()
    expect(screen.getByText(/points\|12,30/)).toBeTruthy()
    fireEvent.click(screen.getByText('stop'))
    expect(hook.stopOuting).toHaveBeenCalledTimes(1)
  })

  it('从没出过门：写「还没出过门」', () => {
    render(
      <OutingCard
        growth={hookOf({ running: null, recent: [], frequentSites: [] })}
      />,
    )
    expect(screen.getByText('never')).toBeTruthy()
  })
})
