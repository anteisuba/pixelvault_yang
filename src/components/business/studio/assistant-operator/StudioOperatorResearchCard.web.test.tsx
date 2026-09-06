// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorResearchCard } from './StudioOperatorResearchCard'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

/**
 * 调查卡的回归闸（2026-09-06 面板轮，第 6 件）。
 *
 * 钉四件事：
 *  ① 结论行写「查了什么」+ 拿回来几条；
 *  ② 证据带出处与可信度 chip，⚠ 没有 `url` 的那条⛔ 不画成链接；
 *  ③ 候选图走**复用**的 `StudioOperatorWebCandidateGrid`（含「挂上 N 张」）；
 *  ④ 过程默认折起来。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const RESEARCH: StudioOperatorStepEntry = {
  kind: 'step',
  id: 'run-1:step-1',
  runKey: 'run-1',
  undone: false,
  step: {
    id: 'step-1',
    tool: 'research',
    title: '查设定',
    status: 'done',
    payload: {
      goal: '这个角色长什么样',
      entities: ['角色 A'],
      sources: ['wiki'],
      round: 1,
    },
    result: {
      totalFound: 2,
      evidence: [
        {
          title: '官方设定集',
          url: 'https://example.com/a',
          publisher: 'example.com',
          snippet: '粉发、金瞳、下双马尾。',
          kind: 'text',
          confidence: 'high',
        },
        {
          title: '共现标签',
          publisher: 'danbooru',
          snippet: 'pink_hair · yellow_eyes',
          kind: 'tags',
          confidence: 'medium',
        },
      ],
    },
  },
} as unknown as StudioOperatorStepEntry

const IMAGES: StudioOperatorStepEntry = {
  kind: 'step',
  id: 'run-1:step-2',
  runKey: 'run-1',
  undone: false,
  step: {
    id: 'step-2',
    tool: 'search_web_images',
    title: '搜图',
    status: 'done',
    payload: { query: '角色 A', limit: 4 },
    result: {
      images: [
        {
          url: 'https://cdn.test/a.png',
          thumbnailUrl: 'https://cdn.test/a-s.png',
          title: '立绘',
          pageUrl: 'https://example.com/p',
          publisher: 'example.com',
          width: 800,
          height: 1200,
          verdict: 'allowed',
        },
      ],
    },
  },
} as unknown as StudioOperatorStepEntry

function renderCard(steps: StudioOperatorStepEntry[], children?: string) {
  const onToggleWebImage = vi.fn()
  render(
    <StudioOperatorResearchCard
      steps={steps}
      webImportStates={{}}
      webImportLimit={4}
      onToggleWebImage={onToggleWebImage}
    >
      {children ? <span data-testid="process-row">{children}</span> : null}
    </StudioOperatorResearchCard>,
  )
  return { onToggleWebImage }
}

describe('StudioOperatorResearchCard', () => {
  it('⭐ 结论行写「查了什么」+ 几条证据', () => {
    renderCard([RESEARCH])
    expect(screen.getByTestId('operator-research-goal').textContent).toContain(
      '这个角色长什么样',
    )
    expect(
      screen.getAllByTestId('operator-research-evidence-item'),
    ).toHaveLength(2)
  })

  it('⭐ 证据带出处与可信度；没有 url 的那条⛔ 不是链接', () => {
    renderCard([RESEARCH])
    const items = screen.getAllByTestId('operator-research-evidence-item')
    expect(items[0]?.dataset.confidence).toBe('high')
    expect(
      items[0]?.querySelector(
        '[data-testid="operator-research-evidence-link"]',
      ),
    ).not.toBeNull()
    // danbooru 的共现标签没有单一页面可点。
    expect(
      items[1]?.querySelector(
        '[data-testid="operator-research-evidence-link"]',
      ),
    ).toBeNull()
    expect(
      screen.getAllByTestId('operator-research-evidence-publisher')[1]
        ?.textContent,
    ).toBe('danbooru')
  })

  it('⭐ 候选图走复用的候选网格 —— ⛔ 没有另画一份', () => {
    renderCard([RESEARCH, IMAGES])
    expect(screen.getByTestId('operator-web-candidates')).toBeTruthy()
  })

  it('⭐ 过程默认折起来；没有过程时⛔ 一颗空折叠都不画', () => {
    renderCard([RESEARCH], '读了一页')
    const process = screen.getByTestId('operator-research-process')
    expect(process).not.toHaveAttribute('open')
    expect(process).toContainElement(screen.getByTestId('process-row'))

    process.remove()
    renderCard([RESEARCH])
    expect(screen.queryByTestId('operator-research-process')).toBeNull()
  })
})
