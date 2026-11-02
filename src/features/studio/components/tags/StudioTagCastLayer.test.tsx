import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { NovelAiCharacterLayout } from '@/types/novelai'

import { StudioTagCastStage } from './StudioTagCastLayer'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}(${Object.values(values).join(',')})` : key,
}))

const form = vi.hoisted(() => ({
  state: {
    aspectRatio: '1:1',
    advancedParams: {} as {
      novelAiSceneTexts?: { kind: string; text: string }[]
    },
  },
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => form,
  useStudioGen: () => ({ isGenerating: false }),
}))

const cast = vi.hoisted(() => ({
  mode: 'free' as 'free' | 'grid',
  layout: undefined as NovelAiCharacterLayout | undefined,
  activeIndex: 0 as number | null,
  select: vi.fn(),
  setLayout: vi.fn(),
}))
vi.mock('@/hooks/use-novelai-characters', () => ({
  useNovelAiCharacters: () => ({
    ...cast,
    characters: cast.layout?.characters ?? [],
  }),
}))

const person = (
  prompt: string,
  extra: Partial<NovelAiCharacterLayout['characters'][number]> = {},
) => ({
  prompt,
  negativePrompt: '',
  position: { x: 0.5, y: 0.5 },
  ...extra,
})

const originalRect = HTMLElement.prototype.getBoundingClientRect
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  HTMLElement.prototype.setPointerCapture = vi.fn()
  // 舞台 400 × 400：空画框 = 左右各留 16、顶上 48、底下 16 → 336 见方，左上角 (32, 48)。
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
})
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

beforeEach(() => {
  cast.mode = 'free'
  cast.activeIndex = 0
  cast.select.mockReset()
  cast.setLayout.mockReset()
  form.state.advancedParams = {}
  cast.layout = {
    positioning: 'auto',
    characters: [person('1girl'), person('1boy')],
  }
})

/** 量尺寸走 rAF —— 等它跑完一帧。 */
async function renderStage() {
  render(
    <StudioTagCastStage active>
      <div data-testid="results" />
    </StudioTagCastStage>,
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('舞台人物层', () => {
  it('没有角色时只有结果区', async () => {
    cast.layout = undefined
    await renderStage()
    expect(screen.getByTestId('results')).toBeInTheDocument()
    expect(screen.queryByText('layer(0)')).not.toBeInTheDocument()
  })

  it('左上胶囊报人数与站位；每人一颗点，点一下切到他', async () => {
    await renderStage()
    expect(screen.getByText('layer(2)')).toBeInTheDocument()
    expect(screen.getByText('autoStatus')).toBeInTheDocument()
    const dot = screen.getByRole('button', { name: 'who(2)' })
    fireEvent.pointerDown(dot, { button: 0, clientX: 300, clientY: 200 })
    fireEvent.pointerUp(dot, { button: 0, clientX: 300, clientY: 200 })
    expect(cast.select).toHaveBeenCalledWith(1)
    expect(cast.setLayout).not.toHaveBeenCalled()
  })

  it('拖一下：全员变手动，其余人钉在等距位置，松手只写回一次', async () => {
    await renderStage()
    const dot = screen.getByRole('button', { name: 'who(1)' })
    fireEvent.pointerDown(dot, { button: 0, clientX: 144, clientY: 216 })
    fireEvent.pointerMove(dot, { clientX: 300, clientY: 100 })
    fireEvent.pointerUp(dot, { clientX: 300, clientY: 100 })
    expect(cast.setLayout).toHaveBeenCalledTimes(1)
    const next = cast.setLayout.mock.calls[0][0] as NovelAiCharacterLayout
    expect(next.positioning).toBe('manual')
    expect(next.characters[0].position.x).toBeCloseTo((300 - 32) / 336)
    expect(next.characters[0].position.y).toBeCloseTo((100 - 48) / 336)
    expect(next.characters[1].position).toEqual({ x: 2 / 3, y: 0.5 })
    expect(cast.select).toHaveBeenCalledWith(0)
  })

  it('V4.5 网格档：松手吸到格心', async () => {
    cast.mode = 'grid'
    await renderStage()
    const dot = screen.getByRole('button', { name: 'who(1)' })
    fireEvent.pointerDown(dot, { button: 0, clientX: 144, clientY: 216 })
    fireEvent.pointerMove(dot, { clientX: 300, clientY: 100 })
    fireEvent.pointerUp(dot, { clientX: 300, clientY: 100 })
    const next = cast.setLayout.mock.calls[0][0] as NovelAiCharacterLayout
    expect(next.characters[0].position).toEqual({ x: 0.7, y: 0.1 })
    expect(next.characters[1].position).toEqual({ x: 0.7, y: 0.5 })
  })

  it('手动摆位时点状态胶囊回到交给模型', async () => {
    cast.layout = { ...cast.layout!, positioning: 'manual' }
    await renderStage()
    fireEvent.click(screen.getByRole('button', { name: /manualStatus/ }))
    expect(cast.setLayout).toHaveBeenCalledWith(
      expect.objectContaining({ positioning: 'auto' }),
    )
  })

  it('互动画成动作名，台词画成气泡，画面文字挂在画框左上角', async () => {
    cast.layout = {
      positioning: 'auto',
      characters: [
        person('1girl', { interactions: [{ tag: 'headpat', target: 1 }] }),
        person('1boy', { dialogue: 'Good morning!' }),
      ],
    }
    form.state.advancedParams = {
      novelAiSceneTexts: [{ kind: 'sign', text: 'CAFE' }],
    }
    await renderStage()
    expect(screen.getByText('actions.headpat')).toBeInTheDocument()
    expect(screen.getByText('Good morning!')).toBeInTheDocument()
    expect(screen.getByText('sceneKinds.sign')).toBeInTheDocument()
    expect(screen.getByText('CAFE')).toBeInTheDocument()
  })

  it('点「人物层」= 关；关了点不到人', async () => {
    await renderStage()
    const pill = screen.getByRole('button', { name: /layer\(2\)/ })
    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', { name: 'who(1)' }).closest('[inert]'),
    ).not.toBeNull()
  })
})
