// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorQueueCard } from './StudioOperatorQueueCard'
import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { NodeWorkflowStatus } from '@/constants/node-types'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

/**
 * **队列条**（多张生成的确认卡，方向 C）的回归闸：
 *  ① 点一格 = 去掉它，「生成 N 张」与总价跟着变，确认只交出留下的那几张；
 *  ② 确认后同一排变进度：在跑的格子画「边即进度」，跑完的格子出图；
 *  ③ 已取消收成一行 +「再来一次」。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    t.rich = (
      key: string,
      values: Record<string, unknown> & {
        n?: () => unknown
        a?: (chunks: unknown) => unknown
      },
    ) => `${key}:${values.amount ?? values.count}`
    return t
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const NODES = [
  { id: 'image-ron', name: '罗恩 · 黑袍' },
  { id: 'image-goyle', name: '高尔 · 黑袍' },
]

function confirm(
  status: StudioOperatorConfirmPrompt['status'],
): Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate }
> {
  return {
    id: 'confirm-1',
    kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
    status,
    ...(status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      ? {}
      : { decidedAt: new Date().toISOString() }),
    request: {
      model: { id: 'gpt-image-2.5-flare', label: 'Flare' },
      count: 1,
      specs: { aspectRatio: '3:4', resolution: '1K', durationSeconds: null },
      canvasNode: NODES[0],
      canvasNodes: NODES,
    },
  }
}

function renderCard(
  status: StudioOperatorConfirmPrompt['status'],
  runs: Record<
    string,
    { status: NodeWorkflowStatus; previewUrl?: string }
  > = {},
) {
  const onConfirm = vi.fn()
  const onRetry = vi.fn()
  render(
    <StudioOperatorQueueCard
      confirm={confirm(status)}
      nodes={NODES}
      runOf={(id) => runs[id]}
      costOf={() => 0.1}
      canGenerate
      onConfirm={onConfirm}
      onCancel={vi.fn()}
      onRetry={onRetry}
      formatTime={() => '11:24'}
    />,
  )
  return { onConfirm, onRetry }
}

describe('StudioOperatorQueueCard', () => {
  it('点一格去掉它，确认只交出留下的那几张', () => {
    const { onConfirm } = renderCard(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle)
    expect(screen.getByTestId('operator-confirm-primary').textContent).toBe(
      'confirm.batch.confirm:2',
    )
    expect(screen.getByTestId('operator-queue-cost').textContent).toBe(
      'confirm.batch.cost:$0.20',
    )
    const [, goyle] = screen.getAllByTestId('operator-queue-tile')
    fireEvent.click(goyle)
    expect(goyle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('operator-confirm-primary').textContent).toBe(
      'confirm.batch.confirm:1',
    )
    expect(screen.getByTestId('operator-queue-cost').textContent).toBe(
      'confirm.batch.cost:$0.10',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(onConfirm).toHaveBeenCalledWith(['image-ron'])
  })

  it('确认后：在跑的画边即进度，跑完的出图，按钮不再画', () => {
    renderCard(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed, {
      'image-ron': { status: 'running' },
      'image-goyle': { status: 'done', previewUrl: 'https://cdn.test/g.png' },
    })
    const [ron, goyle] = screen.getAllByTestId('operator-queue-tile')
    expect(ron.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(goyle.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/g.png',
    )
    expect(screen.queryByTestId('operator-confirm-primary')).toBeNull()
    expect(screen.getByTestId('operator-confirm-state').textContent).toContain(
      'confirm.state.confirmed:11:24',
    )
  })

  it('已取消收成一行，带「再来一次」', () => {
    const { onRetry } = renderCard(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    expect(screen.queryAllByTestId('operator-queue-tile')).toHaveLength(0)
    fireEvent.click(screen.getByTestId('operator-confirm-retry'))
    expect(onRetry).toHaveBeenCalled()
  })
})
