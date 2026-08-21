import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import {
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_STATUSES,
} from '@/constants/research'
import type {
  ResearchReceipt,
  ResearchRunDetail,
  ResearchSourceReceipt,
} from '@/types/research'

/**
 * 检索回执卡（AI 导演内核 · 切片 1 · UI 批）。
 *
 * 这一套断言守的是三条**语义**，不是像素：
 *  1. 「没检索」与「检索了没拿到证据」是两件事 —— 前者不画卡，后者要明示。
 *  2. `no_evidence` 与 `failed` 各带各的下一步话术，合并等于让用户瞎换关键词。
 *  3. 源级 chip 常驻（部分成功是常态），单源失败不许被整体状态吞掉。
 */

// ⚠ 翻译 mock 把插值一并吐出来 —— 否则「条数传错了」这类 bug 在测试里看不见
// （`t(key)` 与 `t(key,{count:99})` 会渲染成同一个字符串）。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
  useLocale: () => 'en',
}))

const { getResearchRunAPIMock } = vi.hoisted(() => ({
  getResearchRunAPIMock: vi.fn(),
}))

vi.mock('@/lib/api-client/research', () => ({
  getResearchRunAPI: getResearchRunAPIMock,
}))

import { ResearchReceiptCard } from './ResearchReceiptCard'

function source(
  over: Partial<ResearchSourceReceipt> = {},
): ResearchSourceReceipt {
  return {
    sourceId: RESEARCH_SOURCE_IDS.moegirl,
    status: RESEARCH_SOURCE_STATUSES.ok,
    count: 3,
    tookMs: 420,
    ...over,
  }
}

function receipt(over: Partial<ResearchReceipt> = {}): ResearchReceipt {
  return {
    runId: 'run-live',
    grounded: true,
    status: RESEARCH_RUN_STATUSES.succeeded,
    perSource: [source()],
    queries: ['长离 发色'],
    evidenceCount: 3,
    ...over,
  }
}

function detail(over: Partial<ResearchRunDetail> = {}): ResearchRunDetail {
  return {
    id: 'run-history',
    status: RESEARCH_RUN_STATUSES.succeeded,
    grounded: true,
    goal: 'analyze_character',
    query: '长离是什么发色',
    perSource: [source()],
    evidence: [],
    model: 'gpt-5.6-sol',
    error: null,
    createdAt: '2026-08-20T02:00:00.000Z',
    completedAt: '2026-08-20T02:00:12.000Z',
    ...over,
  }
}

beforeEach(() => {
  getResearchRunAPIMock.mockReset()
})

describe('ResearchReceiptCard', () => {
  // ── 四态 ─────────────────────────────────────────────────────────

  it('shows the searching state while a forced turn is still in flight', () => {
    render(<ResearchReceiptCard pending />)

    expect(screen.getByText('research.searching')).toBeInTheDocument()
  })

  it('renders nothing when the turn never searched', () => {
    // ⚠ 这条与 `grounded:false` **不是同一件事**：整体缺席 = 压根没打源
    // （用户关了 / 规划器判定不需要），此时画一张「未取得联网证据」是撒谎。
    const { container } = render(<ResearchReceiptCard />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the succeeded state with the evidence count and no grounded warning', () => {
    render(<ResearchReceiptCard receipt={receipt()} runId="run-live" />)

    expect(screen.getByText('research.statusSucceeded')).toBeInTheDocument()
    expect(screen.getByText('research.evidenceCount:3')).toBeInTheDocument()
    expect(screen.queryByText('research.notGrounded')).not.toBeInTheDocument()
    // 成功不需要一句话解释自己 —— 三条下一步话术都不该出现。
    expect(
      screen.queryByText('research.noEvidenceNextSteps'),
    ).not.toBeInTheDocument()
  })

  it('separates no_evidence from failed — each carries its own next step', () => {
    const { unmount } = render(
      <ResearchReceiptCard
        receipt={receipt({
          status: RESEARCH_RUN_STATUSES.noEvidence,
          grounded: false,
          evidenceCount: 0,
          perSource: [
            source({ status: RESEARCH_SOURCE_STATUSES.empty, count: 0 }),
          ],
        })}
      />,
    )

    expect(screen.getByText('research.statusNoEvidence')).toBeInTheDocument()
    expect(screen.getByText('research.noEvidenceNextSteps')).toBeInTheDocument()
    expect(screen.getByText('research.notGrounded')).toBeInTheDocument()
    expect(screen.queryByText('research.failedHint')).not.toBeInTheDocument()
    unmount()

    render(
      <ResearchReceiptCard
        receipt={receipt({
          status: RESEARCH_RUN_STATUSES.failed,
          grounded: false,
          evidenceCount: 0,
          perSource: [
            source({
              status: RESEARCH_SOURCE_STATUSES.failed,
              count: 0,
              error: 'ETIMEDOUT',
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText('research.statusFailed')).toBeInTheDocument()
    expect(screen.getByText('research.failedHint')).toBeInTheDocument()
    expect(
      screen.queryByText('research.noEvidenceNextSteps'),
    ).not.toBeInTheDocument()
  })

  it('renders the quota state even though its run id is null', () => {
    // ⚠ `quota_exceeded` 没有 run 行 —— 判「有没有回执」只能看 receipt 本身，
    // 看 runId 会把这一态整个吞掉。
    render(
      <ResearchReceiptCard
        receipt={receipt({
          runId: null,
          status: RESEARCH_RUN_STATUSES.quotaExceeded,
          grounded: false,
          evidenceCount: 0,
          perSource: [],
        })}
      />,
    )

    expect(screen.getByText('research.statusQuotaExceeded')).toBeInTheDocument()
    expect(screen.getByText('research.quotaHint')).toBeInTheDocument()
  })

  // ── 源级 chip ────────────────────────────────────────────────────

  it('keeps every source chip visible, including the failed ones', () => {
    render(
      <ResearchReceiptCard
        receipt={receipt({
          perSource: [
            source(),
            source({
              sourceId: RESEARCH_SOURCE_IDS.danbooru,
              status: RESEARCH_SOURCE_STATUSES.failed,
              count: 0,
              error: 'HTTP 503',
            }),
            source({
              sourceId: RESEARCH_SOURCE_IDS.webSearch,
              status: RESEARCH_SOURCE_STATUSES.circuitOpen,
              count: 0,
            }),
            source({
              sourceId: RESEARCH_SOURCE_IDS.fandom,
              status: RESEARCH_SOURCE_STATUSES.skipped,
              count: 0,
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText('research.sourceMoegirl')).toBeInTheDocument()
    expect(screen.getByText('research.sourceDanbooru')).toBeInTheDocument()
    expect(screen.getByText('research.sourceWebSearch')).toBeInTheDocument()
    expect(screen.getByText('research.sourceFandom')).toBeInTheDocument()
    // 状态词给读屏（视觉上由图标承担），所以四个状态都必须在 DOM 里。
    expect(screen.getByText('research.sourceOk')).toBeInTheDocument()
    expect(screen.getByText('research.sourceFailed')).toBeInTheDocument()
    expect(screen.getByText('research.sourceCircuitOpen')).toBeInTheDocument()
    expect(screen.getByText('research.sourceSkipped')).toBeInTheDocument()
  })

  it('marks a source that only answered through its fallback path', () => {
    render(
      <ResearchReceiptCard
        receipt={receipt({
          perSource: [
            source({
              sourceId: RESEARCH_SOURCE_IDS.bilibili,
              via: 'serper-fallback',
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText('research.viaFallback')).toBeInTheDocument()
  })

  // ── 展开态 ───────────────────────────────────────────────────────

  it('reveals the queries and the per-source errors on expand', () => {
    render(
      <ResearchReceiptCard
        receipt={receipt({
          queries: ['长离 发色', 'changli wuthering waves hair'],
          perSource: [
            source({
              sourceId: RESEARCH_SOURCE_IDS.danbooru,
              status: RESEARCH_SOURCE_STATUSES.failed,
              count: 0,
              error: 'HTTP 503',
            }),
          ],
        })}
      />,
    )

    expect(screen.queryByText('research.queriesLabel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'research.expand' }))

    expect(screen.getByText('research.queriesLabel')).toBeInTheDocument()
    expect(screen.getByText('长离 发色')).toBeInTheDocument()
    expect(screen.getByText('changli wuthering waves hair')).toBeInTheDocument()
    expect(screen.getByText(/HTTP 503/)).toBeInTheDocument()
  })

  // ── 历史消息（懒加载水合）────────────────────────────────────────

  it('stays quiet until a history card is opened, then hydrates exactly once', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: true,
      data: detail({ id: 'run-hydrate-a' }),
    })

    render(<ResearchReceiptCard runId="run-hydrate-a" />)

    // 一屏历史可能挂着十几个 runId —— 挂载即拉会把首屏变成十几个并发请求。
    expect(getResearchRunAPIMock).not.toHaveBeenCalled()
    expect(screen.getByText('research.historyLabel')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /research.historyLabel/ }),
    )

    expect(
      await screen.findByText('research.statusSucceeded'),
    ).toBeInTheDocument()
    expect(getResearchRunAPIMock).toHaveBeenCalledTimes(1)
    expect(getResearchRunAPIMock).toHaveBeenCalledWith('run-hydrate-a')
    // ⚠ 规划器那 2–3 条查询没落库，历史只有用户原问题 —— 显示原问题标签，
    // 绝不造一个假的查询清单。
    expect(screen.getByText('research.runQueryLabel')).toBeInTheDocument()
    expect(screen.getByText('长离是什么发色')).toBeInTheDocument()
    expect(screen.queryByText('research.queriesLabel')).not.toBeInTheDocument()
  })

  it('surfaces a hydration failure instead of pretending the run is empty', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: false,
      error: 'Research run not found or access denied',
    })

    render(<ResearchReceiptCard runId="run-hydrate-b" />)
    fireEvent.click(
      screen.getByRole('button', { name: /research.historyLabel/ }),
    )

    expect(await screen.findByText('research.loadFailed')).toBeInTheDocument()
  })

  it('never fetches when the live receipt is already in hand', () => {
    render(<ResearchReceiptCard receipt={receipt()} runId="run-live-fetch" />)
    fireEvent.click(screen.getByRole('button', { name: 'research.expand' }))

    expect(getResearchRunAPIMock).not.toHaveBeenCalled()
  })
})
