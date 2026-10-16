// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_FIND_REF } from '@/constants/studio-assistant-operator'
import {
  operatorFindDomId,
  operatorFindKey,
  type OperatorFindRef,
} from '@/lib/studio-operator-timeline'
import type {
  AssistantOperatorWebImage,
  AssistantOperatorWebVideo,
} from '@/types/assistant-operator'

import { StudioOperatorMessageBody } from './StudioOperatorMessageBody'
import { StudioOperatorWebCandidateGrid } from './StudioOperatorWebCandidateGrid'
import { StudioOperatorWebVideoRow } from './StudioOperatorWebVideoRow'

/**
 * 回复里的 `#3` → 那张卡（搜索期第三片，附录 I §3.3「面板把第 3 张高亮」· §四「模型点名」）。
 *
 * 钉这几件事：
 *  ① 认得出的号画成一颗按钮（有读屏名、能拿焦点），认不出的号原样留字；
 *  ② 悬停 / 焦点在胶囊上 = 那张卡被圈出来，离开就退；
 *  ③ 点一下 = 滚到那张卡（最近的那一边）并圈 `flashMs`，到点自己退；手机上没有悬停，点就是全部；
 *  ④ 回复点名的那张常驻细黑框，读屏念得出来；卡上写着自己的号。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorLightbox',
  () => ({ openOperatorLightbox: vi.fn() }),
)

const STEP = 'run-1:step-3'

const IMAGES: AssistantOperatorWebImage[] = [1, 2].map((n) => ({
  n,
  imageUrl: `https://cdn.example.com/${n}.jpg`,
  thumbnailUrl: `https://tbn.example.com/${n}.jpg`,
  pageUrl: `https://example.com/post/${n}`,
  domain: 'example.com',
  title: `candidate ${n}`,
  usableAsInput: true,
  sourceVerdict: 'unknownLicense',
}))

const VIDEO: AssistantOperatorWebVideo = {
  n: 3,
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Changli PV',
  platform: 'youtube',
  durationSeconds: 209,
}

function refOf(n: number, kind: OperatorFindRef['kind']): OperatorFindRef {
  return {
    key: operatorFindKey(STEP, n),
    n,
    kind,
    label: kind === 'image' ? `candidate ${n}` : 'Changli PV',
  }
}

const REFS = new Map<number, OperatorFindRef>([
  [1, refOf(1, 'image')],
  [2, refOf(2, 'image')],
  [3, refOf(3, 'video')],
])

function renderAnswer(text: string, named: ReadonlySet<string> = new Set()) {
  render(
    <StudioOperatorMessageBody
      entry={{ kind: 'message', id: 'm1', text }}
      findRefs={REFS}
      webFinds={
        <>
          <StudioOperatorWebCandidateGrid
            entryId={STEP}
            query="changli"
            images={IMAGES}
            webImport={undefined}
            onSave={vi.fn()}
            namedFinds={named}
          />
          <StudioOperatorWebVideoRow
            entryId={STEP}
            query="changli pv"
            videos={[VIDEO]}
            namedFinds={named}
          />
        </>
      }
    />,
  )
}

function tile(n: number): HTMLElement {
  const element = document.getElementById(
    operatorFindDomId(operatorFindKey(STEP, n)),
  )
  if (!element) throw new Error(`no card #${n}`)
  return element
}

describe('回复里的 #n → 那张卡', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    scrollIntoView.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('⭐ 认得出的号是一颗按钮；⛔ 认不出的号原样留字', () => {
    renderAnswer('我觉得#2最像，#9 没找到，C#4 不是号。')
    const chips = screen.getAllByTestId('operator-find-ref')
    expect(chips.map((chip) => chip.textContent)).toEqual(['#2'])
    expect(chips[0]!.tagName).toBe('BUTTON')
    expect(chips[0]!.getAttribute('aria-label')).toBe(
      'findRef {"n":2,"label":"candidate 2"}',
    )
    const text = screen.getByTestId('operator-message-text').textContent
    expect(text).toContain('#9 没找到')
    expect(text).toContain('C#4')
  })

  it('⭐ 悬停 / 焦点在胶囊上那张卡被圈出来，离开就退', () => {
    renderAnswer('#2 最接近你要的')
    const chip = screen.getByTestId('operator-find-ref')
    expect(tile(2).dataset.findHighlighted).toBe('false')

    fireEvent.mouseEnter(chip)
    expect(tile(2).dataset.findHighlighted).toBe('true')
    expect(tile(1).dataset.findHighlighted).toBe('false')
    expect(chip.dataset.active).toBe('true')
    fireEvent.mouseLeave(chip)
    expect(tile(2).dataset.findHighlighted).toBe('false')

    fireEvent.focus(chip)
    expect(tile(2).dataset.findHighlighted).toBe('true')
    fireEvent.blur(chip)
    expect(tile(2).dataset.findHighlighted).toBe('false')
  })

  it('⭐ 点一下滚到那张卡（最近的那一边）并圈一会儿，到点自己退', () => {
    renderAnswer('#3 是官方 PV')
    fireEvent.click(screen.getByTestId('operator-find-ref'))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(tile(3))
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'nearest', inline: 'nearest' }),
    )
    expect(tile(3).dataset.findHighlighted).toBe('true')

    act(() => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_FIND_REF.flashMs)
    })
    expect(tile(3).dataset.findHighlighted).toBe('false')
  })

  it('⭐ 回复点名的那张常驻黑框，读屏念得出来；卡上写着自己的号', () => {
    renderAnswer(
      '#1 和 #3',
      new Set([operatorFindKey(STEP, 1), operatorFindKey(STEP, 3)]),
    )
    expect(tile(1).dataset.findNamed).toBe('true')
    expect(tile(2).dataset.findNamed).toBe('false')
    expect(tile(1).textContent).toContain('web.findNamed')
    // 视频卡自带 aria-label（盖掉里面的字）：点名那一句挂在 aria-describedby 上。
    const described = tile(3).getAttribute('aria-describedby')
    expect(described).toBeTruthy()
    expect(document.getElementById(described!)?.textContent).toBe(
      'web.findNamed',
    )
    expect(
      screen
        .getAllByTestId('operator-web-candidate-number')
        .map((badge) => badge.textContent),
    ).toEqual(['#1', '#2'])
    expect(screen.getByTestId('operator-web-video-number').textContent).toBe(
      '#3',
    )
  })
})
