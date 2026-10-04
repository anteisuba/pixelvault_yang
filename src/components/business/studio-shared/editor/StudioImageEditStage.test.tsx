import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  StudioImageEditStage,
  type StudioImageEditTarget,
} from './StudioImageEditStage'

const mocks = vi.hoisted(() => ({
  replaceReferenceImage: vi.fn(),
  referenceEntries: [] as { url: string }[],
  /** 躯干的 onApplied —— 测试里由假的 Surface 直接调它。 */
  applied: null as
    | ((outputs: { imageUrl: string }[], summary: string) => boolean)
    | null,
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioData: () => ({
    imageUpload: {
      replaceReferenceImage: mocks.replaceReferenceImage,
      referenceEntries: mocks.referenceEntries,
    },
  }),
}))

// 假躯干：只把 onApplied 递出来，让测试自己决定「跑完一步」的时机。
vi.mock('@/components/business/studio-shared/editor/ImageEditSurface', () => ({
  ImageEditSurface: ({
    sourceUrl,
    onApplied,
  }: {
    sourceUrl: string
    onApplied: (outputs: { imageUrl: string }[], summary: string) => boolean
  }) => {
    mocks.applied = onApplied
    return <div data-testid="surface-source">{sourceUrl}</div>
  },
}))

/** 宿主在真实用法里会把新 target 回灌进来，这里用受控包装模拟那条回路。 */
function renderStage(initial: StudioImageEditTarget) {
  function Harness() {
    const [target, setTarget] = useState(initial)
    return (
      <StudioImageEditStage
        target={target}
        onBack={() => undefined}
        onTargetChange={setTarget}
      />
    )
  }
  const result = render(<Harness />)
  return { ...result, rerender: () => result.rerender(<Harness />) }
}

/** ⚠ 必须包 act：`onApplied` 是躯干在 React 之外调的，不包就不 flush 重渲染。 */
function apply(url: string, summary: string) {
  act(() => {
    mocks.applied?.([{ imageUrl: url }], summary)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.applied = null
  mocks.referenceEntries = [{ url: 'https://cdn.example.com/original.png' }]
  mocks.replaceReferenceImage.mockImplementation(
    (index: number, url: string) => {
      mocks.referenceEntries[index] = { url }
    },
  )
})

describe('StudioImageEditStage · 编辑历史', () => {
  const BASE: StudioImageEditTarget = {
    url: 'https://cdn.example.com/original.png',
    referenceIndex: 0,
    referenceTotal: 1,
  }

  it('参考槽在退出编辑后已换图时，不把旧编辑结果写进新参考图槽位', () => {
    renderStage(BASE)
    mocks.referenceEntries[0] = {
      url: 'https://cdn.example.com/another-reference.png',
    }
    apply('https://cdn.example.com/edited-old-source.png', 'edit old source')
    expect(mocks.replaceReferenceImage).not.toHaveBeenCalled()
    expect(mocks.referenceEntries[0].url).toBe(
      'https://cdn.example.com/another-reference.png',
    )
    expect(screen.getByTestId('surface-source')).toHaveTextContent(
      'edited-old-source.png',
    )
    apply('https://cdn.example.com/edited-again.png', 'continue editing')
    expect(mocks.replaceReferenceImage).not.toHaveBeenCalled()
  })

  it('异步编辑中删除源参考图后，提交时的旧回调不能覆盖前移的另一张参考图', () => {
    const otherReference = {
      url: 'https://cdn.example.com/another-reference.png',
    }
    mocks.referenceEntries = [...mocks.referenceEntries, otherReference]
    const { rerender } = renderStage({ ...BASE, referenceTotal: 2 })
    const pendingApplied = mocks.applied

    mocks.referenceEntries = [otherReference]
    rerender()
    act(() => {
      pendingApplied?.(
        [{ imageUrl: 'https://cdn.example.com/edited-old-source.png' }],
        'edit old source',
      )
    })

    expect(mocks.replaceReferenceImage).not.toHaveBeenCalled()
    expect(mocks.referenceEntries).toEqual([otherReference])
    expect(screen.getByTestId('surface-source')).toHaveTextContent(
      'edited-old-source.png',
    )
    apply('https://cdn.example.com/edited-again.png', 'continue editing')
    expect(mocks.replaceReferenceImage).not.toHaveBeenCalled()
  })

  it('每成功一步就在历史里多一格，并就地替换参考图槽位', () => {
    renderStage(BASE)

    // 只有原图时不渲染历史条 —— 一格的历史是噪音。
    expect(screen.queryByRole('navigation')).toBeNull()

    apply('https://cdn.example.com/a.png', 'red jacket')
    apply('https://cdn.example.com/b.png', 'bare feet')

    const steps = screen.getAllByRole('button')
    // 舞台顶上只剩历史 + 右端「换一张」（owner 2026-10-03 撤掉「← 回到工作台」那一行）。
    expect(steps.map((b) => b.textContent)).toEqual([
      'stageHistoryOriginal',
      'stageHistoryStep:{"index":1} · red jacket',
      'stageHistoryStep:{"index":2} · bare feet',
    ])
    expect(mocks.replaceReferenceImage).toHaveBeenLastCalledWith(
      0,
      'https://cdn.example.com/b.png',
    )
    expect(screen.getByTestId('surface-source')).toHaveTextContent('b.png')
  })

  // E4 的验收原话：「改五次能回到第三次」。
  it('改五次能回到第三次', () => {
    renderStage(BASE)
    for (const n of [1, 2, 3, 4, 5]) {
      apply(`https://cdn.example.com/step${n}.png`, `edit ${n}`)
    }

    fireEvent.click(
      screen.getByRole('button', {
        name: 'stageHistoryStep:{"index":3} · edit 3',
      }),
    )

    expect(mocks.replaceReferenceImage).toHaveBeenLastCalledWith(
      0,
      'https://cdn.example.com/step3.png',
    )
    expect(screen.getByTestId('surface-source')).toHaveTextContent('step3.png')
  })

  it('从中间回退后再编辑，砍掉后面的分支而不是并排堆着', () => {
    renderStage(BASE)
    apply('https://cdn.example.com/a.png', 'edit a')
    apply('https://cdn.example.com/b.png', 'edit b')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'stageHistoryStep:{"index":1} · edit a',
      }),
    )
    apply('https://cdn.example.com/c.png', 'edit c')

    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual([
      'stageHistoryOriginal',
      'stageHistoryStep:{"index":1} · edit a',
      'stageHistoryStep:{"index":2} · edit c',
    ])
    // 被砍掉的那一步不该还留在条上
    expect(labels.some((label) => label?.includes('edit b'))).toBe(false)
  })
})
